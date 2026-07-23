// 食品添加剂关键词字典（GB 2760 常见物质）
// ------------------------------------------------------------
// 用途：食品配料安全页「文本解析」时，直接对用户输入的配料文本做包含匹配，
//       命中后拿命中的添加剂名去 food_additives 安全库查完整评级记录。
// 与 shiyang-dictionary（食材食养字典）分开：本字典只收「食品添加剂」，
//       不含普通食材（小麦粉/椰子油等），避免把食材误判为添加剂。
//
// risk_level 取值严格对应 food_additives.risk_level：
//   white  = 公认安全（按量使用）
//   yellow = 限量/部分人群敏感，需关注
//   black  = 应避免（反式脂肪/高风险护色剂等）
// 数据库 food_additives 的对应种子由迁移 00203 补齐，与本字典保持一致。

export type AdditiveRisk = 'white' | 'yellow' | 'black'

export interface AdditiveInfo {
  category: string
  risk_level: AdditiveRisk
  aliases?: string[]
}

export const ADDITIVE_DICT: Record<string, AdditiveInfo> = {
  // ---------- 防腐剂 ----------
  '山梨酸钾': { category: '防腐剂', risk_level: 'white', aliases: ['山梨酸', '2,4-己二烯酸钾'] },
  '苯甲酸钠': { category: '防腐剂', risk_level: 'yellow', aliases: ['安息香酸钠', '苯甲酸'] },
  '脱氢乙酸钠': { category: '防腐剂', risk_level: 'yellow', aliases: ['脱氢醋酸钠'] },
  '丙酸钙': { category: '防腐剂', risk_level: 'white' },
  '丙酸钠': { category: '防腐剂', risk_level: 'white' },
  '对羟基苯甲酸乙酯': { category: '防腐剂', risk_level: 'yellow', aliases: ['尼泊金乙酯'] },
  '对羟基苯甲酸丙酯': { category: '防腐剂', risk_level: 'yellow', aliases: ['尼泊金丙酯'] },
  '乳酸链球菌素': { category: '防腐剂', risk_level: 'white', aliases: ['乳酸链球菌素', 'Nisin'] },
  '纳他霉素': { category: '防腐剂', risk_level: 'white', aliases: ['游霉素'] },

  // ---------- 甜味剂 ----------
  '糖精钠': { category: '甜味剂', risk_level: 'yellow', aliases: ['糖精'] },
  '阿斯巴甜': { category: '甜味剂', risk_level: 'yellow', aliases: ['阿司帕坦', '甜味素'] },
  '安赛蜜': { category: '甜味剂', risk_level: 'yellow', aliases: ['乙酰磺胺酸钾', 'AK糖'] },
  '三氯蔗糖': { category: '甜味剂', risk_level: 'white', aliases: ['蔗糖素'] },
  '甜蜜素': { category: '甜味剂', risk_level: 'yellow', aliases: ['环己基氨基磺酸钠'] },
  '木糖醇': { category: '甜味剂', risk_level: 'white' },
  '麦芽糖醇': { category: '甜味剂', risk_level: 'white', aliases: ['麦芽糖醇液'] },
  '赤藓糖醇': { category: '甜味剂', risk_level: 'white' },
  '山梨糖醇': { category: '甜味剂', risk_level: 'white', aliases: ['山梨醇'] },
  '甘露醇': { category: '甜味剂', risk_level: 'white' },
  '乳糖醇': { category: '甜味剂', risk_level: 'white' },
  '异麦芽酮糖醇': { category: '甜味剂', risk_level: 'white' },
  '罗汉果甜苷': { category: '甜味剂', risk_level: 'white', aliases: ['罗汉果甜', '罗汉果提取物'] },
  '甜菊糖苷': { category: '甜味剂', risk_level: 'white', aliases: ['甜菊糖', '甜叶菊苷'] },
  '纽甜': { category: '甜味剂', risk_level: 'white' },
  '阿力甜': { category: '甜味剂', risk_level: 'white' },

  // ---------- 着色剂（合成色素） ----------
  '胭脂红': { category: '色素', risk_level: 'yellow', aliases: ['丽春红'] },
  '苋菜红': { category: '色素', risk_level: 'yellow' },
  '柠檬黄': { category: '色素', risk_level: 'yellow' },
  '日落黄': { category: '色素', risk_level: 'yellow' },
  '亮蓝': { category: '色素', risk_level: 'yellow' },
  '靛蓝': { category: '色素', risk_level: 'yellow' },
  '诱惑红': { category: '色素', risk_level: 'yellow' },
  '赤藓红': { category: '色素', risk_level: 'yellow' },
  '新红': { category: '色素', risk_level: 'yellow' },
  '二氧化钛': { category: '色素', risk_level: 'yellow', aliases: ['钛白', '白色素'] },

  // ---------- 着色剂（天然色素） ----------
  '焦糖色': { category: '色素', risk_level: 'white', aliases: ['酱色'] },
  '红曲红': { category: '色素', risk_level: 'white', aliases: ['红曲', '红曲米'] },
  '姜黄': { category: '色素', risk_level: 'white', aliases: ['姜黄色素'] },
  '栀子黄': { category: '色素', risk_level: 'white' },
  'β-胡萝卜素': { category: '色素', risk_level: 'white', aliases: ['胡萝卜素'] },
  '叶绿素铜钠盐': { category: '色素', risk_level: 'yellow', aliases: ['叶绿素铜钠'] },
  '高粱红': { category: '色素', risk_level: 'yellow' },
  '天然苋菜红': { category: '色素', risk_level: 'yellow' },

  // ---------- 增稠剂 / 稳定剂 / 胶 ----------
  '卡拉胶': { category: '增稠剂', risk_level: 'white' },
  '明胶': { category: '增稠剂', risk_level: 'white' },
  '黄原胶': { category: '增稠剂', risk_level: 'white' },
  '瓜尔胶': { category: '增稠剂', risk_level: 'white', aliases: ['瓜尔豆胶'] },
  '阿拉伯胶': { category: '增稠剂', risk_level: 'white' },
  '果胶': { category: '增稠剂', risk_level: 'white' },
  '海藻酸钠': { category: '增稠剂', risk_level: 'white', aliases: ['褐藻酸钠'] },
  '羧甲基纤维素钠': { category: '增稠剂', risk_level: 'white', aliases: ['CMC'] },
  '羟丙基甲基纤维素': { category: '增稠剂', risk_level: 'white', aliases: ['HPMC'] },
  '刺槐豆胶': { category: '增稠剂', risk_level: 'white', aliases: ['槐豆胶'] },
  '结冷胶': { category: '增稠剂', risk_level: 'white' },
  '亚麻籽胶': { category: '增稠剂', risk_level: 'white' },
  '魔芋胶': { category: '增稠剂', risk_level: 'white', aliases: ['魔芋甘露聚糖'] },
  '变性淀粉': { category: '增稠剂', risk_level: 'white', aliases: ['改性淀粉'] },

  // ---------- 乳化剂 ----------
  '单硬脂酸甘油酯': { category: '乳化剂', risk_level: 'white', aliases: ['单甘酯', '单甘油脂肪酸酯'] },
  '蔗糖脂肪酸酯': { category: '乳化剂', risk_level: 'white', aliases: ['蔗糖酯'] },
  '磷脂': { category: '乳化剂', risk_level: 'white', aliases: ['大豆磷脂', '卵磷脂'] },
  '聚甘油脂肪酸酯': { category: '乳化剂', risk_level: 'white', aliases: ['聚甘油酯'] },
  '硬脂酰乳酸钠': { category: '乳化剂', risk_level: 'white', aliases: ['SSL'] },
  '双乙酰酒石酸单双甘油酯': { category: '乳化剂', risk_level: 'white', aliases: ['DATEM'] },
  '司盘60': { category: '乳化剂', risk_level: 'white', aliases: ['Span60'] },
  '吐温80': { category: '乳化剂', risk_level: 'white', aliases: ['Tween80', '聚山梨酯80'] },

  // ---------- 抗氧化剂 ----------
  '丁基羟基茴香醚': { category: '抗氧化剂', risk_level: 'yellow', aliases: ['BHA'] },
  '二丁基羟基甲苯': { category: '抗氧化剂', risk_level: 'yellow', aliases: ['BHT'] },
  '特丁基对苯二酚': { category: '抗氧化剂', risk_level: 'yellow', aliases: ['TBHQ'] },
  '没食子酸丙酯': { category: '抗氧化剂', risk_level: 'yellow', aliases: ['PG'] },
  '抗坏血酸棕榈酸酯': { category: '抗氧化剂', risk_level: 'white' },
  '茶多酚': { category: '抗氧化剂', risk_level: 'white' },
  'D-异抗坏血酸钠': { category: '抗氧化剂', risk_level: 'white', aliases: ['异维C钠'] },
  '维生素E': { category: '抗氧化剂', risk_level: 'white', aliases: ['生育酚'] },

  // ---------- 膨松剂 ----------
  '碳酸氢钠': { category: '膨松剂', risk_level: 'white', aliases: ['小苏打', '焙用碱'] },
  '碳酸氢铵': { category: '膨松剂', risk_level: 'yellow', aliases: ['臭粉', '阿摩尼亚'] },
  '硫酸铝钾': { category: '膨松剂', risk_level: 'black', aliases: ['钾明矾', '明矾'] },
  '硫酸铝铵': { category: '膨松剂', risk_level: 'black', aliases: ['铵明矾'] },
  '葡萄糖酸-δ-内酯': { category: '膨松剂', risk_level: 'white', aliases: ['GDL'] },
  '酒石酸氢钾': { category: '膨松剂', risk_level: 'white', aliases: ['塔塔粉'] },

  // ---------- 酸度调节剂 ----------
  '柠檬酸': { category: '酸度调节剂', risk_level: 'white' },
  '柠檬酸钠': { category: '酸度调节剂', risk_level: 'white' },
  '苹果酸': { category: '酸度调节剂', risk_level: 'white' },
  '酒石酸': { category: '酸度调节剂', risk_level: 'white' },
  '乳酸': { category: '酸度调节剂', risk_level: 'white' },
  '醋酸': { category: '酸度调节剂', risk_level: 'white', aliases: ['乙酸'] },
  '磷酸': { category: '酸度调节剂', risk_level: 'white' },
  '富马酸': { category: '酸度调节剂', risk_level: 'white' },

  // ---------- 水分保持剂 ----------
  '六偏磷酸钠': { category: '水分保持剂', risk_level: 'white' },
  '三聚磷酸钠': { category: '水分保持剂', risk_level: 'white' },
  '焦磷酸钠': { category: '水分保持剂', risk_level: 'white' },
  '磷酸三钠': { category: '水分保持剂', risk_level: 'white' },

  // ---------- 营养强化剂 ----------
  '维生素C': { category: '营养强化剂', risk_level: 'white', aliases: ['抗坏血酸', 'L-抗坏血酸'] },
  '维生素D': { category: '营养强化剂', risk_level: 'white', aliases: ['胆钙化醇'] },
  '维生素A': { category: '营养强化剂', risk_level: 'white', aliases: ['视黄醇'] },
  '维生素B1': { category: '营养强化剂', risk_level: 'white', aliases: ['硫胺素'] },
  '维生素B2': { category: '营养强化剂', risk_level: 'white', aliases: ['核黄素'] },
  '碳酸钙': { category: '营养强化剂', risk_level: 'white' },
  '乳酸钙': { category: '营养强化剂', risk_level: 'white' },
  '硫酸亚铁': { category: '营养强化剂', risk_level: 'white' },
  '葡萄糖酸锌': { category: '营养强化剂', risk_level: 'white' },
  '乳酸锌': { category: '营养强化剂', risk_level: 'white' },
  '氧化锌': { category: '营养强化剂', risk_level: 'white' },
  '亚硒酸钠': { category: '营养强化剂', risk_level: 'yellow', aliases: ['硒'] },
  '牛磺酸': { category: '营养强化剂', risk_level: 'white' },
  'DHA': { category: '营养强化剂', risk_level: 'white', aliases: ['二十二碳六烯酸', '藻油DHA'] },
  'ARA': { category: '营养强化剂', risk_level: 'white', aliases: ['花生四烯酸'] },

  // ---------- 护色剂 / 漂白剂 ----------
  '亚硝酸盐': { category: '护色剂', risk_level: 'black', aliases: ['亚硝酸钠'] },
  '硝酸钠': { category: '护色剂', risk_level: 'yellow' },
  '二氧化硫': { category: '漂白剂', risk_level: 'yellow', aliases: ['亚硫酸'] },
  '亚硫酸钠': { category: '漂白剂', risk_level: 'yellow' },
  '焦亚硫酸钠': { category: '漂白剂', risk_level: 'yellow', aliases: ['偏重亚硫酸钠'] },
  '低亚硫酸钠': { category: '漂白剂', risk_level: 'yellow', aliases: ['连二亚硫酸钠', '保险粉'] },

  // ---------- 增味剂 / 呈味 ----------
  '谷氨酸钠': { category: '增味剂', risk_level: 'white', aliases: ['味精', '味素'] },
  '5\'-呈味核苷酸二钠': { category: '增味剂', risk_level: 'white', aliases: ['I+G', '核苷酸二钠'] },
  '琥珀酸二钠': { category: '增味剂', risk_level: 'white', aliases: ['干贝素'] },
  '酵母抽提物': { category: '增味剂', risk_level: 'white', aliases: ['酵母提取物'] },
  'L-丙氨酸': { category: '增味剂', risk_level: 'white' },
  '甘氨酸': { category: '增味剂', risk_level: 'white' },

  // ---------- 香精香料 ----------
  '人工香精': { category: '香精', risk_level: 'yellow', aliases: ['合成香精'] },
  '食用香精': { category: '香精', risk_level: 'yellow' },
  '香兰素': { category: '香精', risk_level: 'yellow', aliases: ['香草醛'] },
  '乙基麦芽酚': { category: '香精', risk_level: 'yellow', aliases: ['麦芽酚'] },
  '甲基环戊烯醇酮': { category: '香精', risk_level: 'yellow', aliases: ['MCP'] },

  // ---------- 被膜剂 / 其他加工助剂 ----------
  '巴西棕榈蜡': { category: '被膜剂', risk_level: 'white' },
  '聚二甲基硅氧烷': { category: '加工助剂', risk_level: 'white', aliases: ['二甲硅油', '消泡剂'] },
  '硬脂酸镁': { category: '加工助剂', risk_level: 'white' },
  '丙二醇': { category: '加工助剂', risk_level: 'yellow' },

  // ---------- 反式脂肪 ----------
  '部分氢化植物油': { category: '反式脂肪', risk_level: 'black', aliases: ['氢化植物油', '植脂末', '奶精'] },
}

// 文本 → 命中的添加剂标准名列表（直接包含匹配，支持别名）
export function matchAdditiveKeys(text: string): string[] {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return []
  const hits: string[] = []
  for (const [name, info] of Object.entries(ADDITIVE_DICT)) {
    const cands = [name, ...(info.aliases || [])].map((s) => s.toLowerCase()).filter(Boolean)
    if (cands.some((c) => t.includes(c))) hits.push(name)
  }
  return hits
}
