/**
 * 徽章定义（前端静态补充层）
 * 数据库 emotion_badg_defs 存放 icon/rarity/name，
 * 这里补全 unlock_hint / 解锁条件描述 / 解锁进度文案，
 * 用于前端徽章墙展示。
 */

export interface BadgeDisplay {
  code: string
  /** 中文名称 */
  name: string
  /** 表情符号 */
  icon: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  rarityLabel: string
  rarityColor: string
  /** 解锁条件（进度条用） */
  condition: string
  /** 完整解锁提示 */
  hint: string
  /** 稀有度边框色 */
  borderColor: string
  /** 稀有度背景渐变 */
  bgGradient: string
}

/** 前端徽章完整字典（与 emotion_badge_defs 匹配，可由数据库驱动扩展） */
export const BADGE_DEFINITIONS: Record<string, BadgeDisplay> = {
  // ── 行为徽章 ───────────────────────────────────────────────
  first_claim: {
    code: 'first_claim',
    name: '初识情绪',
    icon: '🌱',
    rarity: 'common',
    rarityLabel: '普通',
    rarityColor: '#9CA3AF',
    condition: '完成第1次情绪确权',
    hint: '在订单中标记你的情绪，完成第一次食养共鸣确认',
    borderColor: '#D1D5DB',
    bgGradient: 'linear-gradient(135deg, #F9FAFB 0%, #E5E7EB 100%)',
  },
  empath: {
    code: 'empath',
    name: '共情者',
    icon: '💚',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#3B82F6',
    condition: '确权10种不同商品',
    hint: '你愿意为每一样食物停下来感受它的情绪，这份细腻很珍贵',
    borderColor: '#93C5FD',
    bgGradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
  },
  five_flavor: {
    code: 'five_flavor',
    name: '五味杂陈',
    icon: '🍜',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#3B82F6',
    condition: '体验5种不同情绪',
    hint: '酸甜苦辣咸，你都尝过了——生活的滋味也因此完整',
    borderColor: '#93C5FD',
    bgGradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
  },

  // ── 食养徽章 ───────────────────────────────────────────────
  constitution_test: {
    code: 'constitution_test',
    name: '自知之明',
    icon: '🪞',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#8B5CF6',
    condition: '完成体质测试',
    hint: '你愿意花3分钟了解自己的身体，这本身就是一种觉醒',
    borderColor: '#C4B5FD',
    bgGradient: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
  },
  safe_eater: {
    code: 'safe_eater',
    name: '食安小侦探',
    icon: '🔍',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#10B981',
    condition: '扫描10种不同食品',
    hint: '配料表上的每一个名字你都认识，吃得明白才是真正的自律',
    borderColor: '#6EE7B7',
    bgGradient: 'linear-gradient(135deg, #F0FDF4 0%, #D1FAE5 100%)',
  },
  knowledge_expert: {
    code: 'knowledge_expert',
    name: '食安博士',
    icon: '🎓',
    rarity: 'epic',
    rarityLabel: '史诗',
    rarityColor: '#F59E0B',
    condition: '解锁全部知识碎片',
    hint: '你是食安知识最渊博的人之一，这份专业值得被更多人看见',
    borderColor: '#FCD34D',
    bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  },

  // ── 分享徽章 ───────────────────────────────────────────────
  first_share: {
    code: 'first_share',
    name: '分享者',
    icon: '🤝',
    rarity: 'common',
    rarityLabel: '普通',
    rarityColor: '#9CA3AF',
    condition: '分享商品/文章1次',
    hint: '好东西值得被分享，你迈出了互惠的第一步',
    borderColor: '#D1D5DB',
    bgGradient: 'linear-gradient(135deg, #F9FAFB 0%, #E5E7EB 100%)',
  },
  community_builder: {
    code: 'community_builder',
    name: '社区共建者',
    icon: '🏘',
    rarity: 'epic',
    rarityLabel: '史诗',
    rarityColor: '#F59E0B',
    condition: '成功邀请10位用户',
    hint: '你不仅自己来，还带来了一个社区——这是最有价值的贡献',
    borderColor: '#FCD34D',
    bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  },

  // ── 情绪徽章（从 EMOTION_BADGE_MAP） ───────────────────────
  emo_relax: {
    code: 'emo_relax',
    name: '松弛时刻',
    icon: '🌿',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#3B82F6',
    condition: '在订单中标记"松弛"情绪',
    hint: '那一刻你感受到的松弛，是食物最好的奖赏',
    borderColor: '#93C5FD',
    bgGradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
  },
  emo_heal: {
    code: 'emo_heal',
    name: '暖心微光',
    icon: '✨',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#EC4899',
    condition: '在订单中标记"治愈"情绪',
    hint: '食物不只是填饱肚子，它也能治愈你',
    borderColor: '#F9A8D4',
    bgGradient: 'linear-gradient(135deg, #FDF2F8 0%, #FBCFE8 100%)',
  },
  emo_calm: {
    code: 'emo_calm',
    name: '安宁片刻',
    icon: '🍃',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#3B82F6',
    condition: '在订单中标记"平静"情绪',
    hint: '一碗热汤换来的安宁，值得被记住',
    borderColor: '#93C5FD',
    bgGradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
  },
  emo_brave: {
    code: 'emo_brave',
    name: '勇敢一刻',
    icon: '🔥',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#EF4444',
    condition: '在订单中标记"勇敢"情绪',
    hint: '选择了健康的食物，也是一种勇敢',
    borderColor: '#FCA5A5',
    bgGradient: 'linear-gradient(135deg, #FFF1F2 0%, #FEE2E2 100%)',
  },
  emo_warm: {
    code: 'emo_warm',
    name: '温暖相伴',
    icon: '☀️',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#F59E0B',
    condition: '在订单中标记"温暖"情绪',
    hint: '有些食物让你想起家的味道——这就是温暖',
    borderColor: '#FCD34D',
    bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  },
  emo_miss: {
    code: 'emo_miss',
    name: '思念悠悠',
    icon: '🌙',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#8B5CF6',
    condition: '在订单中标记"思念"情绪',
    hint: '食物有时是最好的载体，承载着对某人的想念',
    borderColor: '#C4B5FD',
    bgGradient: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
  },
  emo_joy: {
    code: 'emo_joy',
    name: '喜悦绽放',
    icon: '🌸',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#EC4899',
    condition: '在订单中标记"喜悦"情绪',
    hint: '那一刻的喜悦是真实的，让它绽放吧',
    borderColor: '#F9A8D4',
    bgGradient: 'linear-gradient(135deg, #FDF2F8 0%, #FBCFE8 100%)',
  },
  emo_free: {
    code: 'emo_free',
    name: '自由之心',
    icon: '🕊️',
    rarity: 'epic',
    rarityLabel: '史诗',
    rarityColor: '#F59E0B',
    condition: '在订单中标记"自由"情绪',
    hint: '不受拘束的选择，是最难得的食养自由',
    borderColor: '#FCD34D',
    bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  },

  // ── 食安侦探徽章（食安侦探局玩法） ──────────────────────
  detective_1: {
    code: 'detective_1',
    name: '初出茅庐',
    icon: '🕵️',
    rarity: 'rare',
    rarityLabel: '稀有',
    rarityColor: '#EC4899',
    condition: '破获第1个食安案件',
    hint: '你拿起放大镜的那一刻，就是 protecting 家人健康的第一步',
    borderColor: '#F9A8D4',
    bgGradient: 'linear-gradient(135deg, #FDF2F8 0%, #FBCFE8 100%)',
  },
  detective_5: {
    code: 'detective_5',
    name: '火眼金睛',
    icon: '🔎',
    rarity: 'epic',
    rarityLabel: '史诗',
    rarityColor: '#F59E0B',
    condition: '破获5个食安案件',
    hint: '配料表上的伪装再也骗不过你，这是实打实的硬功夫',
    borderColor: '#FCD34D',
    bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  },
  detective_all: {
    code: 'detective_all',
    name: '食安神探',
    icon: '🏅',
    rarity: 'legendary',
    rarityLabel: '传说',
    rarityColor: '#DC2626',
    condition: '破获全部食安案件',
    hint: '你把食安知识变成了一种本能——这份专业值得所有人信赖',
    borderColor: '#FCA5A5',
    bgGradient: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
  },

  // ── 积分兑换徽章 ───────────────────────────────────────────
  first_redeem: {
    code: 'first_redeem',
    name: '初次兑换',
    icon: '🎁',
    rarity: 'common',
    rarityLabel: '普通',
    rarityColor: '#9CA3AF',
    condition: '用金豆兑换过1次',
    hint: '你用行动证明，金豆不只是数字',
    borderColor: '#D1D5DB',
    bgGradient: 'linear-gradient(135deg, #F9FAFB 0%, #E5E7EB 100%)',
  },
  loyalty_30: {
    code: 'loyalty_30',
    name: '30日食伴',
    icon: '📅',
    rarity: 'epic',
    rarityLabel: '史诗',
    rarityColor: '#F59E0B',
    condition: '连续30天有食养行为',
    hint: '30天的陪伴，你已经和这个平台有了真实的连接',
    borderColor: '#FCD34D',
    bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
  },
}

/** 所有徽章代码列表（按稀有度分组） */
export const BADGE_CODES_BY_RARITY: Record<string, string[]> = {
  legendary: ['detective_all'],
  epic: ['knowledge_expert', 'community_builder', 'emo_free', 'loyalty_30', 'detective_5'],
  rare: ['empath', 'five_flavor', 'constitution_test', 'safe_eater', 'emo_relax', 'emo_heal', 'emo_calm', 'emo_brave', 'emo_warm', 'emo_miss', 'emo_joy', 'detective_1'],
  common: ['first_claim', 'first_share', 'first_redeem'],
}

/** 根据徽章稀有度获取展示顺序 */
export function getBadgeSortOrder(code: string): number {
  const order = ['legendary', 'epic', 'rare', 'common']
  const def = BADGE_DEFINITIONS[code]
  if (!def) return 99
  return order.indexOf(def.rarity)
}
