/**
 * expiry-engine · 食品保质期预警 + 智能动态折扣引擎
 * ------------------------------------------------------------
 * 设计原则（数据保持通用）：
 *   - 扫描【全店铺】stock_batches，不写死任何 store_id / 商品 / 类目
 *   - 折扣用【商品自身成本】算出「不亏本上限」，不依赖外部配置
 *   - 阈值 / 折扣基线 / 开关全部从 system_config(key='expiry') 读，改配置即改行为
 *   - 预警推给【店铺 owner_id】（通用，不假设具体店铺）
 *   - 幂等：靠 alerted_stages + discount_stage 去重，可安全每日重复跑
 *
 * 调度：Supabase pg_cron 每日触发，或外部定时器 HTTP 调本函数。
 *       支持 ?storeId=xxx 只跑单店（便于测试）。
 *
 * 合规：绝不修改 expire_at / produced_at；过期自动下架禁售；折扣默认不低于成本。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getLlmConfig } from '../_shared/llmConfig.ts'
import { logLlmCall } from '../_shared/logLlmCall.ts'
import { guardedChat } from '../_shared/llmGuard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ 通用配置（与迁移 00213 system_config('expiry') 对应，缺省兜底）============
interface ExpiryConfig {
  red_days: number
  orange_days: number
  amber_days: number
  red_ratio: number
  orange_ratio: number
  amber_ratio: number
  base_discount: { amber: number; orange: number; red: number }
  boost_per_3_days: number
  max_discount: number
  allow_below_cost: boolean
  llm_enabled: boolean
  alert_to_owner: boolean
  alert_to_nearby: boolean
  nearby_radius_km: number
}

const DEFAULTS: ExpiryConfig = {
  red_days: 3,
  orange_days: 7,
  amber_days: 15,
  red_ratio: 0.1,
  orange_ratio: 0.3,
  amber_ratio: 0.5,
  base_discount: { amber: 10, orange: 25, red: 40 },
  boost_per_3_days: 10,
  max_discount: 90,
  allow_below_cost: false,
  llm_enabled: true,
  alert_to_owner: true,
  alert_to_nearby: false,
  nearby_radius_km: 3,
}

type Stage = 'normal' | 'amber' | 'orange' | 'red' | 'expired'

// ============ 配置读取（带兜底）============
async function loadConfig(supabase: any): Promise<ExpiryConfig> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'expiry')
      .maybeSingle()
    if (data?.value) return { ...DEFAULTS, ...(data.value as Record<string, any>) }
  } catch (e) {
    console.warn('[expiry-engine] 读配置失败，用默认:', e)
  }
  return DEFAULTS
}

// ============ 分级判定 ============
function classifyStage(daysToExpire: number, shelfLifeDays: number | null, cfg: ExpiryConfig): Stage {
  if (daysToExpire <= 0) return 'expired'
  const ratio =
    shelfLifeDays && shelfLifeDays > 0 ? daysToExpire / shelfLifeDays : null
  if (daysToExpire <= cfg.red_days || (ratio !== null && ratio <= cfg.red_ratio)) return 'red'
  if (daysToExpire <= cfg.orange_days || (ratio !== null && ratio <= cfg.orange_ratio)) return 'orange'
  if (daysToExpire <= cfg.amber_days || (ratio !== null && ratio <= cfg.amber_ratio)) return 'amber'
  return 'normal'
}

// ============ 规则折扣（骨）：夹在「不亏本上限」内 ============
function ruleDiscount(
  stage: Stage,
  daysToExpire: number,
  daysToSell: number | null,
  price: number,
  costPrice: number | null,
  cfg: ExpiryConfig,
): { discount: number; reason: string } {
  const cost = costPrice ?? 0
  // 不亏本上限%（默认不低于成本；allow_below_cost 时放开到 max_discount）
  const floorPct = cfg.allow_below_cost ? 0 : Math.max(0, Math.round((1 - cost / (price || 1)) * 100))
  const dMaxPct = Math.min(cfg.max_discount, floorPct)
  const basePct = (cfg.base_discount as any)[stage] ?? 0
  let d = basePct
  let reason = `规则基线(${stage}阶段 ${basePct}%)`
  // 可加深空间=封顶值-基线，加深幅度绝不越界（修复：原先按段数累加会爆到 +330%）
  const headroom = Math.max(0, dMaxPct - basePct)
  if (daysToSell !== null && daysToSell > daysToExpire) {
    // 紧迫度∈(0,1]：剩余时间越不够卖，越把剩余空间用掉
    const urgency = Math.min(1, (daysToSell - daysToExpire) / Math.max(1, daysToExpire))
    const extra = Math.round(headroom * urgency)
    d += extra
    reason += `；预计${daysToSell.toFixed(1)}天售罄>剩余${daysToExpire.toFixed(1)}天，按紧迫度加深+${extra}%`
  }
  d = Math.max(0, Math.min(d, dMaxPct))
  return { discount: Math.round(d), reason }
}

// ============ LLM 增强（脑）：建议夹边界，越界取边界；异常降级规则 ============
async function llmDiscount(
  product: any,
  stage: Stage,
  daysToExpire: number,
  daysToSell: number | null,
  rulePct: number,
  dMaxPct: number,
  cfg: ExpiryConfig,
): Promise<{ discount: number; reason: string; used: boolean }> {
  const llm = await getLlmConfig()
  if (!cfg.llm_enabled || !llm.enabled) {
    return { discount: rulePct, reason: 'LLM未启用，采用规则值', used: false }
  }
  const start = Date.now()
  try {
    const basePct = (cfg.base_discount as any)[stage] ?? 0
    const prompt = [
      `你是零售折扣决策助手。请为一个临期食品给出建议折扣%。`,
      `商品: ${product.name || '未知'}`,
      `原价: ${product.price}，成本: ${product.cost_price ?? '未知'}`,
      `临期阶段: ${stage}（剩余约 ${daysToExpire.toFixed(1)} 天到期）`,
      daysToSell !== null
        ? `按近30天日销速度，约需 ${daysToSell.toFixed(1)} 天售罄。`
        : `近期无销量记录，可能卖不动。`,
      `约束：折扣% 必须在 ${basePct}（阶段基线）到 ${dMaxPct}（不亏本上限）之间。`,
      `只输出 JSON：{"discount": 数字, "reason": "简短中文理由", "bundle": false}`,
    ].join('\n')

    const r = await guardedChat({
      base: llm.base,
      key: llm.key,
      model: llm.model,
      functionName: 'expiry-engine',
      module: '保质期预警',
      user: prompt,
      temperature: 0.3,
      maxTokens: 200,
    })
    if (!r.ok || !r.data) return { discount: rulePct, reason: 'LLM调用失败，降级规则', used: false }
    const json = r.data
    const content: string = json?.choices?.[0]?.message?.content ?? ''
    const m = content.match(/\{[\s\S]*\}/)
    if (!m) return { discount: rulePct, reason: 'LLM返回无法解析，降级规则', used: false }
    const obj = JSON.parse(m[0])
    const d = Number(obj.discount)
    if (!isFinite(d)) return { discount: rulePct, reason: 'LLM折扣非法，降级规则', used: false }
    // 夹边界：不低于阶段基线，不高于不亏本上限
    const clamped = Math.max(basePct, Math.min(d, dMaxPct))
    return {
      discount: Math.round(clamped),
      reason: `AI建议：${String(obj.reason ?? '')}（已夹边界防亏本）`,
      used: true,
    }
  } catch (e) {
    return { discount: rulePct, reason: `LLM调用异常，降级规则：${(e as Error).message}`, used: false }
  }
}

// ============ 给店铺 owner 推预警（通用，不假设具体店铺）============
async function notifyOwner(
  supabase: any,
  storeId: string,
  stage: Stage,
  daysToExpire: number,
  finalPct: number,
  product: any,
  batchId: string,
) {
  const { data: store } = await supabase
    .from('stores')
    .select('owner_id')
    .eq('id', storeId)
    .maybeSingle()
  const ownerId = store?.owner_id
  if (!ownerId) return
  const stageLabel: Record<string, string> = {
    amber: '临期预警',
    orange: '紧迫预警',
    red: '紧急清仓',
  }
  await supabase.from('notifications').insert({
    user_id: ownerId,
    type: 'expiry_alert',
    title: `【${stageLabel[stage] ?? '临期预警'}】${product.name ?? '商品'}`,
    body: `${product.name ?? '商品'} 剩余约 ${Math.max(0, Math.ceil(daysToExpire))} 天到期，已自动建议折扣 ${finalPct}% 尽快处理`,
    payload: {
      batch_id: batchId,
      stage,
      days_to_expire: Math.round(daysToExpire * 100) / 100,
      product_id: product.id,
      product_name: product.name,
    },
  })
}

// ============ 单批次处理 ============
async function processBatch(
  b: any,
  cfg: ExpiryConfig,
  salesMap: Map<string, number>,
  supabase: any,
  stats: any,
) {
  const product = b.product
  if (!product) {
    stats.errored++
    return
  }
  const now = Date.now()
  const expireAt = new Date(b.expire_at).getTime()
  const daysToExpire = (expireAt - now) / 86400000
  const stage = classifyStage(daysToExpire, b.shelf_life_days ?? null, cfg)

  // 过期 → 自动下架禁售
  if (stage === 'expired') {
    await supabase
      .from('stock_batches')
      .update({ status: 'expired', discount_stage: 'expired' })
      .eq('id', b.id)
    stats.expired++
    return
  }

  // 销量预测
  const dailySales = salesMap.get(b.product_id) ?? 0
  const daysToSell = dailySales > 0 ? b.qty / dailySales : null

  // 折扣决策（规则为骨 + LLM为脑）
  const cost = product.cost_price ?? 0
  const floorPct = cfg.allow_below_cost
    ? 0
    : Math.max(0, Math.round((1 - cost / (product.price || 1)) * 100))
  const dMaxPct = Math.min(cfg.max_discount, floorPct)

  const rule = ruleDiscount(stage, daysToExpire, daysToSell, product.price, product.cost_price, cfg)
  const llm = await llmDiscount(product, stage, daysToExpire, daysToSell, rule.discount, dMaxPct, cfg)
  const finalPct = llm.used ? llm.discount : rule.discount
  const decidedBy = llm.used ? 'ai' : 'rule'
  const reason = llm.used ? llm.reason : rule.reason

  // 是否已推送过该阶段（去重）
  const alerted: string[] = b.alerted_stages ?? []
  const isNewStage = !alerted.includes(stage)
  const isAlertStage = stage === 'amber' || stage === 'orange' || stage === 'red'

  const update: any = {
    discount_stage: stage,
    auto_discount_rate: finalPct,
    ai_reason: reason,
    decided_by: decidedBy,
    ai_decided_at: new Date().toISOString(),
  }
  if (isNewStage && isAlertStage) {
    update.alerted_stages = [...alerted, stage]
    update.last_alert_at = new Date().toISOString()
  }
  await supabase.from('stock_batches').update(update).eq('id', b.id)

  // 归因日志（每次决策都写，周级聚合售罄率回灌校准）
  await supabase.from('expiry_alert_log').insert({
    batch_id: b.id,
    product_id: b.product_id,
    store_id: product.store_id,
    stage,
    days_to_expire: Math.round(daysToExpire * 100) / 100,
    days_to_sell: daysToSell,
    daily_sales: dailySales,
    suggested_discount: finalPct,
    applied_discount: finalPct,
    qty: b.qty,
    cost_price: product.cost_price,
    sale_price: product.price,
    decided_by: decidedBy,
  })

  // 预警推送（新阶段才推，防骚扰）
  if (isNewStage && isAlertStage && cfg.alert_to_owner) {
    await notifyOwner(supabase, product.store_id, stage, daysToExpire, finalPct, product, b.id)
    stats.notified++
  }

  stats[stage] = (stats[stage] ?? 0) + 1
}

// ============ 主流程 ============
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(url, service, { auth: { persistSession: false } })

  try {
    const reqUrl = new URL(req.url)
    const storeFilter = reqUrl.searchParams.get('storeId') || null

    const cfg = await loadConfig(supabase)

    // 近30天日销速度（一次聚合，供所有批次复用）
    const { data: sales } = await supabase.rpc('fn_daily_sales')
    const salesMap = new Map<string, number>(
      ((sales as any[]) ?? [])
        .filter((r) => r.product_id)
        .map((r) => [r.product_id as string, Number(r.daily_sales)]),
    )

    // 拉取待处理批次（带商品信息，一次 join）
    let q = supabase
      .from('stock_batches')
      .select('*, product:products(id, name, price, cost_price, store_id)')
      .eq('status', 'normal')
      .not('expire_at', 'is', null)
      .gt('qty', 0)
    if (storeFilter) q = q.eq('store_id', storeFilter)
    const { data: batches, error } = await q
    if (error) throw new Error(`拉取批次失败: ${error.message}`)

    const stats = {
      total: (batches as any[])?.length ?? 0,
      normal: 0,
      amber: 0,
      orange: 0,
      red: 0,
      expired: 0,
      notified: 0,
      errored: 0,
    }

    for (const b of (batches as any[]) ?? []) {
      try {
        await processBatch(b, cfg, salesMap, supabase, stats)
      } catch (e) {
        stats.errored++
        console.error('[expiry-engine] 批次处理失败', b.id, (e as Error).message)
      }
    }

    console.log('[expiry-engine] 完成', JSON.stringify(stats))
    return Response.json({ success: true, config: cfg, stats }, { headers: corsHeaders })
  } catch (err) {
    const msg = (err as Error).message
    console.error('[expiry-engine] error:', msg)
    return Response.json({ success: false, error: msg }, { status: 500, headers: corsHeaders })
  }
})
