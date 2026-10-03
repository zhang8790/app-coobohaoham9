// tongue-reader Edge Function
// ------------------------------------------------------------
// 望舌识别引擎（视觉模型）
// 输入：舌部照片 —— 单张（舌面）或两张（图1=舌面/正面，图2=舌下/反面）
// 输出：8 维望舌结构化特征标签（与小程序端 TONGUE_QUESTIONS 选项完全一致），
//       供端上规则引擎映射出体质倾向。
//
// 合规铁律：全程「食养参考」，绝不输出诊断 / 治疗 / 疗效承诺；不出现「AI」字样。
// 容错：模型返回的标签允许「少写括注 / 多写空格 / 斜杠写法不同」，
//      经 normLabel 归一化后模糊匹配，命中即回写为端上标准 label。
// 降级：未配置模型 → source:'none'；调用失败 / 结果不完整 → source:'vision_error' + reason，
//      端上据此提示「重试 / 重拍」（不自动跳手动选题）。

import { getLlmConfig, type LlmConfig } from '../_shared/llmConfig.ts'
import { guardedChat } from '../_shared/llmGuard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// 与 src/utils/food-therapy/tongue-rules.ts 的 TONGUE_QUESTIONS 选项标签严格一致
// （顺序即端上 answers 下标顺序）
const ALLOWED: Record<string, string[]> = {
  area: ['正常大小（常见）', '胖大（伸舌抵齿）', '瘦薄娇小'],
  color: ['淡红 / 粉红（常见）', '偏淡白（颜色发浅）', '偏红（比常人红）', '暗红 / 绛红', '青紫 / 暗紫'],
  coat_color: ['薄白苔（常见）', '白而厚', '淡黄苔', '黄厚腻苔', '少苔 / 无苔（舌面光红）'],
  coat_texture: ['薄而均匀（常见）', '厚腻', '厚而干', '少而干', '水滑多津'],
  teeth: ['没有明显齿痕（常见）', '轻度齿痕', '明显齿痕（胖大舌）'],
  crack: ['没有明显裂纹（常见）', '有裂纹 / 裂沟'],
  moist: ['润泽（常见）', '偏干 / 少津', '滑腻多津'],
  // 第 8 维：舌下络脉（舌底/反面），用于血瘀倾向参考
  sublingual: ['淡红、细而短（常见）', '偏青紫、略粗', '青紫明显 / 曲张如小鱼'],
}

// 用户强调的 6 个主维必须命中；coat_color / sublingual 缺失时回退中性（与端上 mapLabelsToAnswers 一致）
const REQUIRED = ['area', 'color', 'coat_texture', 'teeth', 'crack', 'moist']
const ORDER = [...REQUIRED, 'coat_color', 'sublingual']

const SYSTEM = `你是「来店有喜」食养体系的望舌识别引擎。你会收到 1~2 张舌部照片：第一张是舌面（正面），第二张（若有）是舌下（反面 / 舌底）。
请按传统饮食文化常识观察舌象，输出 8 个维度的结构化特征，每个维度只能从给定选项中选一个、原样返回（不要改写、不要增删字）。

维度与候选（务必原样返回其中一项）：
- area（舌体形态 / 区域：胖瘦大小，看舌面）：${ALLOWED.area.join(' / ')}
- color（舌质颜色，看舌面）：${ALLOWED.color.join(' / ')}
- coat_color（舌苔颜色，看舌面）：${ALLOWED.coat_color.join(' / ')}
- coat_texture（舌苔厚薄润泽，看舌面）：${ALLOWED.coat_texture.join(' / ')}
- teeth（齿痕，看舌面边缘）：${ALLOWED.teeth.join(' / ')}
- crack（裂纹，看舌面）：${ALLOWED.crack.join(' / ')}
- moist（润燥，看舌面）：${ALLOWED.moist.join(' / ')}
- sublingual（舌下络脉 / 舌底青筋，看第二张反面；若未提供第二张则按「淡红、细而短（常见）」返回）：${ALLOWED.sublingual.join(' / ')}

严格要求：
- 仅作食养参考，不输出任何医疗诊断、治疗、疗效承诺。
- 只输出 JSON，不要解释。字段为 area / color / coat_color / coat_texture / teeth / crack / moist / sublingual，每个值为上述对应候选之一。`

/** 标签归一化：忽略空格 / 全角空格 / 括号补充说明 / 常见标点 */
function normLabel(s: string): string {
  return s
    .replace(/[\s\u3000]/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[，,。.、；;：:]/g, '')
    .toLowerCase()
}

/** 在候选里为模型返回的原始文本找最相近的一项；找不到返回 null */
function matchLabel(allowed: string[], raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const r = normLabel(raw)
  if (r.length < 2) return null
  for (const a of allowed) if (normLabel(a) === r) return a
  for (const a of allowed) {
    const n = normLabel(a)
    if (n.includes(r) || r.includes(n)) return a
  }
  const head = r.split('/')[0]
  if (head.length >= 2) {
    for (const a of allowed) if (normLabel(a).split('/')[0] === head) return a
  }
  return null
}

/** 面向用户的降级文案（不含任何「AI」/医疗词，也不诱导手动勾选） */
const FAIL_MESSAGES: Record<string, string> = {
  balance: '识别服务暂不可用，请稍后重试',
  timeout: '网络超时，请重试',
  network: '网络异常，请重试',
  parse: '照片不够清晰，请重拍舌面与舌下',
  incomplete: '照片不够清晰，请重拍舌面与舌下',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    // 兼容单图(imageUrl) 与 多图(images: string[])
    const images: string[] = Array.isArray(body.images)
      ? body.images.filter((x: any) => typeof x === 'string' && x.length > 0)
      : (body.imageUrl ? [body.imageUrl as string] : [])
    if (images.length === 0) {
      return json({ success: false, error: 'need image' }, 400)
    }

    // 统一读 LLM 配置（system_config 表 → 回退 env）
    const cfg = await getLlmConfig()
    if (!cfg.key) {
      return json({ success: false, source: 'none', reason: 'no_config', message: '识别服务未配置' }, 200)
    }

    const userText =
      images.length >= 2
        ? '请识别这两张舌部照片的舌象特征：图1为舌面（正面），图2为舌下（反面 / 舌底）。'
        : '请识别这张舌部照片（舌面 / 正面）的舌象特征。'

    const r = await guardedChat({
      base: cfg.base,
      key: cfg.key,
      model: cfg.model,
      functionName: 'tongue-reader',
      module: '望舌识别',
      system: SYSTEM,
      user: userText,
      imageUrls: images,
      temperature: 0.2,
      responseFormat: { type: 'json_object' },
    })

    // —— 调用失败：给出原因码，端上提示重试 ——
    if (!r.ok || !r.data) {
      const errText = r.error || ''
      let reason = 'network'
      if (r.httpStatus === 400 && /arrearage|overdue-payment|access denied/i.test(errText)) reason = 'balance'
      else if (r.httpStatus) reason = `http_${r.httpStatus}`
      else if (/timeout/i.test(errText)) reason = 'timeout'
      // 仅日志侧可见真实原因（llm_call_logs 已记录 http 400 原始响应体）
      console.error(`[tongue-reader] vision failed reason=${reason} status=${r.httpStatus} err=${errText.slice(0, 300)}`)
      return json(
        { success: false, source: 'vision_error', reason, message: FAIL_MESSAGES[reason] || '识别未完成，请重试' },
        200,
      )
    }

    const content = r.data?.choices?.[0]?.message?.content || ''
    let raw: Record<string, unknown> = {}
    try {
      raw = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content))
    } catch {
      // 模型偶发在 JSON 外包了说明文字 → 尝试抠出第一个 JSON 对象
      const m = typeof content === 'string' ? content.match(/\{[\s\S]*\}/) : null
      if (m) {
        try {
          raw = JSON.parse(m[0])
        } catch {
          raw = {}
        }
      }
    }

    // 归一化：模糊匹配回写为端上标准 label；5 个主维必须命中，sublingual 缺失回退中性
    const features: Record<string, string> = {}
    for (const k of REQUIRED) {
      const hit = matchLabel(ALLOWED[k], raw[k])
      if (hit) features[k] = hit
    }
    if (Object.keys(features).length < REQUIRED.length) {
      return json(
        { success: false, source: 'vision_error', reason: 'incomplete', message: FAIL_MESSAGES.incomplete },
        200,
      )
    }
    features['coat_color'] = matchLabel(ALLOWED['coat_color'], raw['coat_color']) || ALLOWED['coat_color'][0]
    features['sublingual'] = matchLabel(ALLOWED['sublingual'], raw['sublingual']) || ALLOWED['sublingual'][0]

    // 按端上维度顺序返回，便于端上直接按下标映射
    const ordered: Record<string, string> = {}
    for (const k of ORDER) ordered[k] = features[k]

    return json(
      { success: true, source: 'vision', features: ordered, note: '仅供食养参考，不替代专业意见' },
      200,
    )
  } catch (e) {
    return json({ success: false, error: String(e) }, 500)
  }
})
