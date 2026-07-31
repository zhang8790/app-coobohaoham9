// 块编辑器数据模型
// 小程序无 contenteditable，真富文本不可行 → 用「块」表达排版，
// 序列化成 token 存 articles.content，与 article-detail 的 parseContent 完全兼容，不改表。
import { PRODUCT_DISCLAIMER } from './compliance/shield'

export type BlockType = 'text' | 'h1' | 'h2' | 'quote' | 'tip' | 'hr' | 'img' | 'product'

export interface Block {
  id: string
  type: BlockType
  /** text/h1/h2/quote/tip 存文字；img 存图片 URL；product 存商品 ID */
  value: string
}

let seq = 0
export function newBlock(type: BlockType, value = ''): Block {
  seq += 1
  return { id: `b${Date.now().toString(36)}_${seq}`, type, value }
}

/** 块 → token 文本（存库） */
export function serializeBlocks(blocks: Block[]): string {
  return blocks
    .map(b => {
      const v = (b.value || '').trim()
      switch (b.type) {
        case 'h1':      return v ? `[[h1:${v}]]` : ''
        case 'h2':      return v ? `[[h2:${v}]]` : ''
        case 'quote':   return v ? `[[quote:${v}]]` : ''
        case 'tip':     return v ? `[[tip:${v}]]` : ''
        case 'hr':      return '[[hr]]'
        case 'img':     return v ? `[[img:${v}]]` : ''
        case 'product': return v ? `[[product:${v}]]` : ''
        default:        return v
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

const TOKEN_RE =
  /\[\[(h1|h2|quote|tip|img|product):([^\]]+)\]\]|\[\[hr\]\]/g

/** token 文本 → 块（编辑已有文章 / 素材草稿时反解析） */
export function deserializeBlocks(content: string): Block[] {
  if (!content || !content.trim()) return [newBlock('text')]
  const blocks: Block[] = []
  let last = 0
  let m: RegExpExecArray | null

  const pushText = (raw: string) => {
    raw.split(/\n{2,}/).forEach(seg => {
      const t = seg.trim()
      if (t) blocks.push(newBlock('text', t))
    })
  }

  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(content)) !== null) {
    if (m.index > last) pushText(content.slice(last, m.index))
    if (m[0] === '[[hr]]') blocks.push(newBlock('hr'))
    else blocks.push(newBlock(m[1] as BlockType, m[2]))
    last = m.index + m[0].length
  }
  if (last < content.length) pushText(content.slice(last))

  return blocks.length ? blocks : [newBlock('text')]
}

/** 提取正文纯文字（用于敏感词检测、改写率比对） */
export function plainText(blocks: Block[]): string {
  return blocks
    .filter(b => ['text', 'h1', 'h2', 'quote'].includes(b.type))
    .map(b => b.value)
    .join('\n')
}

/** 已插入的好物 ID */
export function insertedProductIds(blocks: Block[]): string[] {
  return Array.from(new Set(blocks.filter(b => b.type === 'product' && b.value).map(b => b.value)))
}

// ─────────────────────────────────────────────
// 改写率闸门：防止素材原样搬运
// 用二字词（bigram）Jaccard 相似度，中文无需分词即可用
// ─────────────────────────────────────────────
function bigrams(s: string): Set<string> {
  const clean = (s || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  const out = new Set<string>()
  for (let i = 0; i < clean.length - 1; i++) out.add(clean.slice(i, i + 2))
  return out
}

/** 返回 0~1 的相似度；>0.6 视为搬运 */
export function similarity(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  A.forEach(g => { if (B.has(g)) inter++ })
  return inter / (A.size + B.size - inter)
}

export const REWRITE_THRESHOLD = 0.6

// ─────────────────────────────────────────────
// 图文模板库（一键套框架，降低创作门槛）
// 所有模板均不含功效词，统一「日常膳食搭配参考」话术
// ─────────────────────────────────────────────
export interface ArticleTemplate {
  key: string
  name: string
  emoji: string
  desc: string
  title: string
  build: () => Block[]
}

const disclaimerBlock = () => newBlock('tip', PRODUCT_DISCLAIMER)

export const ARTICLE_TEMPLATES: ArticleTemplate[] = [
  {
    key: 'food-guide',
    name: '美食攻略',
    emoji: '🍲',
    desc: '食谱、汤方、食材搭配（主推）',
    title: '这道家常汤，我家一周煮两回',
    build: () => [
      newBlock('text', '换季这段时间，家里餐桌上的搭配我做了点调整，简单记录一下。'),
      newBlock('h2', '为什么想做这道'),
      newBlock('text', '（写写你的日常感受，比如天气、家人口味、最近想吃得清淡些）'),
      newBlock('h2', '用到的食材'),
      newBlock('text', '· 主料：\n· 配料：\n· 分量：几人份'),
      newBlock('h2', '做法步骤'),
      newBlock('text', '1. \n2. \n3. '),
      newBlock('quote', '小提示：食材按自家口味增减就好，不用完全照搬。'),
      disclaimerBlock(),
      newBlock('h2', '用到的食材，我是在这买的'),
      newBlock('text', '（下面插入好物卡）'),
      newBlock('hr'),
      newBlock('text', '如果你也在琢磨家里的日常搭配，欢迎分享给需要的朋友。'),
    ],
  },
  {
    key: 'pick-guide',
    name: '食材选购',
    emoji: '🛒',
    desc: '健康零食、生鲜挑选与测评',
    title: '挑了十几种，这几样配料表最干净',
    build: () => [
      newBlock('text', '最近帮家里囤货，顺手把配料表都翻了一遍，整理成清单给大家参考。'),
      newBlock('h2', '我看配料表的三个习惯'),
      newBlock('text', '1. 配料越短越好，前三位是什么很关键\n2. 添加剂看得懂再买\n3. 同类产品横向比一比'),
      newBlock('h2', '这次挑出来的几样'),
      newBlock('text', '（逐个写：名字、配料表亮点、口感、适合谁吃）'),
      newBlock('quote', '挑选只代表个人偏好，每家口味不一样，按需选择。'),
      disclaimerBlock(),
      newBlock('text', '（这里插入好物卡）'),
      newBlock('hr'),
      newBlock('text', '有想让我帮忙看配料表的，评论区告诉我。'),
    ],
  },
  {
    key: 'crowd-guide',
    name: '人群膳食参考',
    emoji: '👨‍👩‍👧',
    desc: '控钠饮食、儿童零食挑选',
    title: '给家里老人和孩子备零食，我的几点考虑',
    build: () => [
      newBlock('text', '家里有老人和小孩，买东西时会多留意一些，说说我的想法。'),
      newBlock('h2', '给孩子挑的时候'),
      newBlock('text', '（写：口味清淡些、分量小一点、配料简单）'),
      newBlock('h2', '给长辈挑的时候'),
      newBlock('text', '（写：软一点好嚼、口味别太重、少量多样）'),
      newBlock('quote', '以上都是日常膳食搭配的个人参考，不同人情况不同，按自家实际来。'),
      disclaimerBlock(),
      newBlock('text', '（这里插入好物卡）'),
      newBlock('hr'),
      newBlock('text', '你家是怎么给老人孩子备的？欢迎聊聊。'),
    ],
  },
  {
    key: 'life-note',
    name: '生活见闻',
    emoji: '🌿',
    desc: '时令饮食科普与日常记录',
    title: '入秋后，我家餐桌悄悄换了几样',
    build: () => [
      newBlock('text', '节气一变，买菜的习惯也跟着变了，随手记一记。'),
      newBlock('h2', '这个时节我常买的'),
      newBlock('text', '（写你最近常买的几样，以及为什么）'),
      newBlock('h2', '一点小心得'),
      newBlock('text', '（写做法上的小改变，或者家人的反馈）'),
      newBlock('quote', '都是日常吃饭的琐事，图个记录。'),
      disclaimerBlock(),
      newBlock('text', '（这里插入好物卡）'),
      newBlock('hr'),
      newBlock('text', '你那边这个季节都吃什么？'),
    ],
  },
]

export const BLOCK_META: Record<BlockType, { label: string; icon: string }> = {
  text:    { label: '正文', icon: '¶' },
  h1:      { label: '大标题', icon: 'H1' },
  h2:      { label: '小标题', icon: 'H2' },
  quote:   { label: '引用', icon: '❝' },
  tip:     { label: '提示', icon: '⚠️' },
  hr:      { label: '分割线', icon: '—' },
  img:     { label: '图片', icon: '🖼' },
  product: { label: '好物卡', icon: '🛒' },
}
