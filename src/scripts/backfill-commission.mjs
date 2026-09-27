/**
 * 历史纯豆/混合订单分佣补跑脚本（零依赖，Node 18+ 自带 fetch）
 *
 * 用途：修复「旧版 create-order 把订单假标记 commission_distributed=true 却没发佣」+
 *       「部署缺口期间纯豆订单未触发分佣」导致的漏发。
 *
 * 安全策略：
 *  - 只对「commissions 表中无该订单行」的订单补发，绝不会对已发过佣金的订单重复发放。
 *  - 补发前先把 commission_distributed 重置为 false，让已部署的 distribute-commission EF 重新计算。
 *  - 默认 DRY RUN（只列出待补订单），加 --apply 才真正调用云函数。
 *
 * 用法（在本机项目根目录执行）：
 *   set SUPABASE_URL=https://xxxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...（service_role，仅本地使用，勿泄露）
 *   node scripts/backfill-commission.mjs            # 仅列出待补订单
 *   node scripts/backfill-commission.mjs --apply    # 真正补跑
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ 缺少环境变量：请先设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const H = {
  'apikey': SERVICE_ROLE,
  'Authorization': `Bearer ${SERVICE_ROLE}`,
  'Content-Type': 'application/json',
}

const STATUSES = ['completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup']

async function rest(path, opts) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: H })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`REST ${res.status} ${path}: ${txt}`)
  }
  // PATCH/DELETE/INSERT 无 .select() 时返回空 body，res.json() 会抛 "Unexpected end of JSON input"
  const txt = await res.text()
  if (!txt) return null
  try { return JSON.parse(txt) } catch { return null }
}

async function main() {
  // 1) 拉取所有「已成交」订单（不过滤是否分佣，后面按 commissions 行数判定）
  const q = `orders?select=id,order_no,user_id,total_amount,tb_used,referrer_id,store_id,status,commission_distributed` +
    `&status=in.(${STATUSES.join(',')})`
  const orders = await rest(q)

  // 2) 过滤：commissions 无该订单行，且 (假分佣 OR 真未分)
  const targets = []
  for (const o of orders) {
    const c = await rest(`commissions?select=order_id&order_id=eq.${o.id}&limit=1`)
    const hasCommission = Array.isArray(c) && c.length > 0
    const isFake = o.commission_distributed === true && !hasCommission
    const isUndistributed = o.commission_distributed === false
    if (isFake || isUndistributed) {
      targets.push({ ...o, reason: isFake ? '假分佣(标记true但无佣金行)' : '未分佣(false)' })
    }
  }

  console.log(`\n📋 待补跑订单共 ${targets.length} 笔：`)
  for (const t of targets) {
    console.log(`  - ${t.order_no} | ${t.status} | 总额¥${t.total_amount} 豆抵扣¥${t.tb_used} | referrer=${t.referrer_id ?? '无'} | ${t.reason}`)
  }

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN 完成，未做任何修改。确认列表无误后加 --apply 真正补跑。')
    return
  }

  console.log('\n🚀 开始补跑（重置标志位 → 调用 distribute-commission）：')
  let ok = 0, fail = 0
  for (const t of targets) {
    try {
      // 重置幂等标志，让 EF 重新计算
      await rest(`orders?id=eq.${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ commission_distributed: false }),
      })

      // 计算让利率（商品金额加权，与前端一致；无商品则用店铺率，缺省 9%）
      let rate = 0.09
      if (t.store_id) {
        try {
          const s = await rest(`stores?select=referral_rate&id=eq.${t.store_id}`)
          if (s?.[0]?.referral_rate != null) rate = s[0].referral_rate
        } catch {}
      }
      // 商品加权让利率：order_items→products 无外键关系时该查询会失败，降级用店铺率，不阻断补发
      try {
        const items = await rest(`order_items?select=price,quantity,products(discount_rate)&order_id=eq.${t.id}`)
        let totalAmt = 0, weighted = 0
        for (const it of (items || [])) {
          const amt = (Number(it.price) || 0) * (Number(it.quantity) || 0)
          const pct = it?.products?.discount_rate
          const pr = (typeof pct === 'number' && pct > 0) ? pct / 100 : rate
          totalAmt += amt
          weighted += amt * pr
        }
        if (totalAmt > 0) rate = weighted / totalAmt
      } catch (e) {
        console.log(`  ⚠️ ${t.order_no}: 商品加权让利率失败，降级用店铺率 ${rate}`)
      }

      const net = Math.max(0, Number(t.total_amount) - Number(t.tb_used))
      const body = {
        order_id: t.id,
        order_no: t.order_no,
        payer_id: t.user_id,
        total_amount: Number(t.total_amount),
        net_amount: net,
        referrer_id: t.referrer_id ?? null,
        discount_rate: rate,
      }
      const inv = await fetch(`${SUPABASE_URL}/functions/v1/distribute-commission`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify(body),
      })
      const out = await inv.json().catch(() => ({}))
      console.log(`  ✅ ${t.order_no}:`, JSON.stringify(out))
      ok++
    } catch (e) {
      console.log(`  ❌ ${t.order_no}:`, e.message)
      fail++
    }
  }
  console.log(`\n补跑完成：成功 ${ok} 笔，失败 ${fail} 笔。`)
}

main().catch(e => { console.error('脚本异常:', e); process.exit(1) })
