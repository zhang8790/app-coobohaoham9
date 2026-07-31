// 食疗商品 · 视频文案 + AI 提示词生成器（纯模板，零外部依赖）
// 复用统一食疗引擎 ProductTherapyReport 的输出，生成：
//   ① 短视频口播脚本（商家可直接照读）
//   ② 可复制的 AI 视频提示词（文生视频 / 图生视频通用，中文描述 + 英文关键词）
//   ③ 分镜建议
// 全部经 sanitizeTherapyCopy 合规硬替换 + THERAPY_DISCLAIMER 兜底。

import {
  type ProductTherapyReport,
  sanitizeTherapyCopy,
  THERAPY_DISCLAIMER,
} from './product-therapy'

export interface VideoCopyResult {
  /** 短视频口播脚本（分段，每段一行） */
  script: string
  /** 可一键复制的 AI 视频生成提示词 */
  prompt: string
  /** 分镜建议（3-5 个） */
  shots: string[]
  /** 文案海报金句（可复用于封面/朋友圈） */
  poster: string
}

// 整体性味 → 画面冷暖基调（让食疗属性一眼可读、更科学）
const NATURE_TONE: Record<string, { cn: string; en: string }> = {
  '大寒': { cn: '清冷冰蓝调，画面带薄霜与雾气', en: 'icy cyan, frost, mist' },
  '寒凉': { cn: '清冷蓝绿调，干净通透', en: 'cool teal, clean, fresh' },
  '凉': { cn: '清爽浅青调，水润感', en: 'soft aqua, dewy' },
  '微凉': { cn: '温和青绿调，清爽不冰', en: 'mild green, airy' },
  '平性': { cn: '自然中性米色调，温润平和', en: 'neutral beige, warm calm' },
  '平': { cn: '自然中性米色调，温润平和', en: 'neutral beige, warm calm' },
  '微温': { cn: '暖橙米调，微微温热', en: 'warm peach, cozy' },
  '温': { cn: '暖橙调，温润治愈', en: 'warm orange, healing' },
  '温热': { cn: '深暖橙调，浓郁温热', en: 'amber, rich warmth' },
  '大热': { cn: '炽热红调，强烈暖意', en: 'fiery red, intense' },
  '热': { cn: '炽热红调，强烈暖意', en: 'fiery red, intense' },
}

function toneOf(natureCode: string) {
  return NATURE_TONE[natureCode] ?? NATURE_TONE['平性']
}

/**
 * 生成食疗商品的视频文案 + AI 提示词。
 * @param name 商品名
 * @param report 统一引擎报告；为 null 时返回占位提示
 * @param ingredientNames 食材名列表（用于画面元素描述）
 */
export function buildVideoCopy(
  name: string,
  report: ProductTherapyReport | null,
  ingredientNames: string[] = [],
): VideoCopyResult {
  if (!report) {
    const placeholder = sanitizeTherapyCopy(
      `「${name}」暂未配置食材，无法生成食疗脚本。请先在商品编辑页选好食材与占比。`,
    )
    return { script: placeholder, prompt: '', shots: [], poster: '' }
  }

  const tone = toneOf(report.overall_nature_code)
  const redW = report.warnings.filter((w) => w.level === 'red')
  const orangeW = report.warnings.filter((w) => w.level === 'orange')
  const blueW = report.warnings.filter((w) => w.level === 'blue')
  const careW = [...redW, ...orangeW]

  // ---------- ① 口播脚本 ----------
  const scriptLines: string[] = [
    `今天给大家带来一道「${name}」。`,
  ]
  scriptLines.push(
    report.overall_nature
      ? `它整体食性偏${report.overall_nature}，日常吃着舒服、适合慢慢养。`
      : `它食性平和，日常吃着舒服。`,
  )
  if (report.combined_effect) {
    scriptLines.push(`这道组合最打动人的是：${report.combined_effect}。`)
  }
  if (report.merchant_note) {
    scriptLines.push(report.merchant_note)
  }
  if (careW.length > 0) {
    scriptLines.push(`不过要提醒一句：${careW.map((w) => w.text).join('；')}。`)
  }
  if (report.fit_people) {
    scriptLines.push(`更适合：${report.fit_people}。`)
  }
  scriptLines.push(THERAPY_DISCLAIMER)

  // ---------- ② AI 视频提示词 ----------
  const elements = ingredientNames.length
    ? ingredientNames.join('、')
    : name
  const promptLines: string[] = [
    `美食短视频，主角是「${name}」，画面元素包含：${elements}。`,
    `视觉基调：${tone.cn}；柔光、浅景深、微距特写食材纹理，体现新鲜与手作温度。`,
    `镜头节奏舒缓，3-5 秒一个分镜，配轻快原声吉他或治愈系 BGM。`,
    `整体风格：小红书 / 抖音美食博主风，干净留白、食欲感强、无文字水印。`,
    `Negative: 文字叠加、低画质、过度滤镜、黑暗阴沉、医疗场景。`,
    `Keywords: food ASMR, ${tone.en}, close-up, soft light, appetizing, minimal, 4k.`,
  ]

  // ---------- ③ 分镜 ----------
  const shots: string[] = [
    `特写：热腾腾的「${name}」出锅瞬间，蒸汽缓缓升腾（1.5s）`,
    `中景：食材原材摆盘，${ingredientNames.length ? ingredientNames.join('、') : '新鲜食材'}逐一入镜（2s）`,
    `近景：夹起一口，展示${report.overall_nature_code ? `「${report.overall_nature_code}」食性` : '温润质地'}的质感（1.5s）`,
  ]
  if (careW.length > 0) {
    shots.push(`字幕卡：温馨提醒「${careW[0].text}」（1.5s）`)
  }
  if (blueW.length > 0) {
    shots.push(`字幕卡：慢病友好标注「${blueW[0].text}」（1.5s）`)
  }
  shots.push(`结尾：品牌角标 + 引导「下单尝鲜」（1s）`)

  // ---------- 海报金句 ----------
  const posterParts = [`「${name}」`, report.overall_nature_code ? `${report.overall_nature_code}食性` : '温润食性']
  if (report.combined_effect) posterParts.push(report.combined_effect)
  posterParts.push('日常食养，慢慢变好')
  const poster = sanitizeTherapyCopy(posterParts.join('·'))

  return {
    script: sanitizeTherapyCopy(scriptLines.join('\n')),
    prompt: sanitizeTherapyCopy(promptLines.join('\n')),
    shots: shots.map((s) => sanitizeTherapyCopy(s)),
    poster,
  }
}
