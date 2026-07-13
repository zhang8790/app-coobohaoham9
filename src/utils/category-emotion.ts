// 品类情绪编译框架（Category-aware Emotion Compile）
// ------------------------------------------------------------
// 这是「情绪编译」系统的真实骨架：把"情绪翻译"从单一通用函数，
// 升级为"按本地生活类目区分气质"的编译策略。
//
// 为什么需要它：
//   生鲜、餐饮、美业、娱乐……每个业态的情绪基调、比喻意象、叙事角度都不同。
//   之前 emotion-description.ts 不分品类，所有商品都套同一套意境，
//   导致"餐饮"和"美业"的情绪文案气质趋同，失去代入感。
//
// 设计：
//   - 每个类目一份 CategoryEmotionProfile（基调 / 可用情绪标签 / 专属比喻 / 叙事角度 / 起笔收束）
//   - resolveCategoryProfile(category) 做模糊匹配（支持主类目名 + 别名）
//   - 编译引擎（emotion-description.ts）消费本文件，按类目产出差异化叙事
//
// 类目来源：项目实际 Store.category 取值（餐饮/零售/水果/服务/娱乐/其他）
//          + 本地生活常见细分（饮品/烘焙/美业/亲子/健身/酒店等），以别名挂载到基类目策略。

import type { CategoryEmotionProfileRow } from '@/db/types'
import { supabase } from '@/client/supabase'

export interface CategoryEmotionProfile {
  /** 主类目 key */
  key: string
  /** 展示名 */
  label: string
  /** 类目整体情绪基调（一句话，用于运营理解） */
  tone: string
  /** 该类目认可的 mood 标签（约束编译时优先采用的意境；不在其中的标签降级为通用） */
  allowedMoodTags: string[]
  /** 类目专属比喻/意象库（轮流取，覆盖通用意境比喻） */
  metaphors: string[]
  /** 叙事角度提示（轮流取，空串表示无额外角度） */
  angles: string[]
  /** 类目专属主体模板（v3 核心：接地气的产品描述文案模板，占位符 {name}/{metaphor}/{realm}/{attr}/{angle}） */
  bodyTemplates?: string[]
  /** 可选：类目专属起笔模板（接收 scene moment 字符串） */
  openers?: ((m: string) => string)[]
  /** 可选：类目专属收束语 */
  closers?: string[]
  /** 别名（用于模糊匹配：用户输入的类目名命中其一即采用本策略） */
  aliases?: string[]
}

// =====================
// 各业态情绪编译策略
// =====================

const 餐饮: CategoryEmotionProfile = {
  key: '餐饮',
  label: '餐饮美食',
  tone: '烟火人间，与人共食的妥帖',
  allowedMoodTags: ['治愈', '满足', '幸福', '温馨', '甜蜜', '愉悦', '分享', '用餐时光', '放松', '仪式感', '怀旧', '温暖'],
  metaphors: ['灶上咕嘟的汤', '一桌人对坐的灯', '街角老馆子的香', '碗中升腾的热气', '筷子夹起的暖', '碗底沉着的光', '围炉边升起的喧', '家常菜冒出的安'],
  angles: ['与人共食，滋味更浓。', '一蔬一饭，能抚凡人心。', '围坐的此刻，便是归处。'],
  bodyTemplates: [
    `{name}端上桌时热气还冒着，{attr}第一口下去整个人就松了——像{metaphor}，{realm}得刚刚好。`,
    `忙了一整天，总惦记的还是这口{name}。{attr}{metaphor}似的{realm}，{angle}`,
    `{name}不是那种花哨的好吃，而是{attr}每一口都实实在在——{metaphor}，不骗人。`,
    `食材老实、火候到位，{name}就是这样让人放心。{attr}吃进嘴里，{realm}从胃里漫上来。`,
    `有人专程为这碗{name}而来，吃过便懂了——{attr}{metaphor}般的{realm}，{angle}值得专门跑一趟。`,
    `冷了也好吃热了更对味，{name}就是这么随和的一道菜。{attr}{realm}，像{metaphor}。`,
    `一家人围着{name}坐下，话多了笑也多了。{attr}{metaphor}，{angle}这就是日子该有的样子。`,
    `别看外表普通，{name}的内里藏着大讲究——{attr}{metaphor}般的{realm}，越品越有味道。`,
    `打包一份{name}带回去吧，{attr}到家路上想着都开心——{metaphor}，{realm}。`,
    `吃到最后一口还在回味，{name}就是有这种本事。{attr}{realm}恰如{metaphor}，{angle}`,
    `{name}的妙处不在摆盘，而在{attr}入口那一刻的踏实感——像{metaphor}，{realm}写在脸上。`,
    `朋友问今天吃什么，脑子里第一个蹦出来的就是{name}——{attr}它就是这么有存在感。`,
    `周末一家人围{name}，{attr}碗筷叮当里全是生活气——{metaphor}，{realm}得踏实。`,
    `饿的时候{name}最懂安慰，{attr}一口热乎下肚，像{metaphor}，{realm}什么都先放一放。`,
    `老街拐角那家{name}，{attr}味道十年没变，像{metaphor}，{realm}是记忆里的稳。`,
  ],
  closers: ['趁热，慢慢吃。', '这一餐，值得好好坐下来。'],
  aliases: ['正餐', '小吃', '快餐', '火锅', '烧烤', '夜宵', '外卖', '饭', '餐', '美食', '餐厅', '家常菜', '食堂', '便当'],
}

const 饮品: CategoryEmotionProfile = {
  key: '饮品',
  label: '饮品',
  tone: '微醺与小憩，唇齿间的喘息',
  allowedMoodTags: ['甜蜜', '治愈', '放松', '愉悦', '清新', '清爽', '浪漫', '慢生活'],
  metaphors: ['杯壁凝着的水珠', '午后的一口清凉', '巷口捧着的那杯暖', '吸管搅动的甜', '杯沿漾开的笑', '冰块轻撞的响', '杯口漾开的那圈甜', '午后窗边的闲'],
  angles: ['小口啜饮，日子慢下来。', '给自己一段喘息。'],
  bodyTemplates: [
    `{name}端上来的时候，杯壁还挂着水珠——{attr}第一口下去，{metaphor}般的{realm}从喉头漫开，{angle}`,
    `下午三点的那一杯{name}，比什么提神饮料都管用。{attr}{metaphor}，{realm}得刚刚好。`,
    `吸管搅动{name}的那一刻，{attr}冰块轻轻碰响——像{metaphor}，{realm}。`,
    `不是那种甜到发腻的饮品，{name}的甜是克制的、有层次的。{attr}{metaphor}，{angle}慢慢喝才有味道。`,
    `捧着{name}走在街上，手心先暖了——{attr}{metaphor}似的温度，{realm}从指尖传遍全身。`,
    `夏天没有{name}是不完整的。{attr}一口冰凉下去，暑气退了一半——像{metaphor}，{realm}。`,
    `冬天的一杯热{name}，{attr}握在手里就不想放下。{metaphor}般的暖意，{realm}得恰到好处，{angle}`,
    `{name}的秘密在于配比——不多不少，每一口都是刚刚好的{realm}。{attr}{metaphor}，{angle}`,
    `朋友聚会点了{name}上桌，{attr}大家都不约而同地先拍了照——好看又好喝，像{metaphor}。`,
    `加班到深夜，总想念的还是这杯{name}。{attr}{metaphor}，{realm}——明天的事明天再说吧。`,
    `冷泡和热饮都好喝，{name}就是这么不挑场景。{attr}{realm}，像{metaphor}一样随和。`,
    `一个人对着窗喝{name}，{attr}谁也不打扰谁，像{metaphor}，{realm}是难得的留白。`,
    `旅行途中来杯{name}，{attr}异地街头也有了熟悉的温度——{metaphor}，{realm}。`,
    `新品{name}总想先尝一口，{attr}好奇心比解渴更急，像{metaphor}，{realm}得有趣。`,
  ],
  closers: ['慢慢喝，不着急。'],
  aliases: ['奶茶', '咖啡', '果茶', '酒水', '茶', '饮料', '汽水', '果汁', '柠檬茶', '拿铁', '奶茶店', '饮品店'],
}

const 烘焙: CategoryEmotionProfile = {
  key: '烘焙',
  label: '烘焙甜点',
  tone: '晨间手作的温度',
  allowedMoodTags: ['甜蜜', '治愈', '温馨', '幸福', '满足', '浪漫'],
  metaphors: ['刚出炉的暖香', '窗台边那块松软', '晨光里的酥皮', '指尖沾着的糖粉', '出炉时的暖光', '糖霜落下的细'],
  angles: ['一口下去，整个人都松了。', '甜的东西，很懂安慰。'],
  bodyTemplates: [
    `{name}刚出炉的时候，整个屋子都是香气。{attr}外皮酥得掉渣、内里软得像云——{metaphor}，{realm}。`,
    `早餐能吃到{name}，这一天就有了好的开始。{attr}{metaphor}般的甜度，{angle}{realm}得刚刚好。`,
    `下午茶来一块{name}，配一杯热饮，{attr}比什么治愈系电影都管用——像{metaphor}，{realm}。`,
    `{name}的甜不是那种齁甜，而是{attr}恰到好处地停在舌尖上——{metaphor}般的分寸感，{angle}`,
    `隔着包装袋都能闻到{name}的香气。{attr}拆开的那一刻，{metaphor}般的{realm}扑面而来。`,
    `手工揉面的温度是机器模仿不来的，{name}每一层都有故事。{attr}{metaphor}，{realm}。`,
    `带一盒{name}去见朋友吧，{attr}它就是那种"打开后所有人都哇一声"的好东西——{metaphor}。`,
    `{name}放凉了也好吃，但刚出炉的那几分钟是黄金时间。{attr}{metaphor}，{angle}趁热尝一口就知道了。`,
    `孩子看到{name}走不动路是有原因的——{attr}酥皮/糖霜/奶油的搭配太犯规了，像{metaphor}。`,
    `加班饿了来一块{name}，{attr}血糖回升的同时心情也跟着好了——{metaphor}般的{realm}，{angle}`,
    `做{name}的人一定很用心，因为每一口都吃得出诚意。{attr}{metaphor}，{realm}。`,
  ],
  closers: ['趁新鲜，尝一口。'],
  aliases: ['面包', '甜点', '蛋糕', '西点', '糕点', '甜品', '面包店', '甜品店', '烘焙坊'],
}

const 水果生鲜: CategoryEmotionProfile = {
  key: '水果生鲜',
  label: '水果生鲜',
  tone: '土地与时令的鲜活',
  allowedMoodTags: ['清爽', '清新', '自然', '纯净', '解暑', '治愈', '活力', '满足'],
  metaphors: ['枝头带露的鲜', '山野吹来的风', '刚从土里醒来的清气', '井水镇过的脆', '枝头带露的艳', '咬开溅起的甜'],
  angles: ['从田间到舌尖，不过片刻。', '应季的鲜，很懂身体。'],
  bodyTemplates: [
    `{name}拿到手的时候还带着露水般的鲜气，{attr}咬开的瞬间——{metaphor}，{realm}从舌尖漫遍全身。`,
    `当季吃{name}是很对的选择，{attr}阳光和雨水都在这口里了——像{metaphor}，{angle}{realm}得刚刚好。`,
    `不需要复杂料理，{name}洗干净直接吃就是很讨喜的吃法。{attr}{metaphor}般的纯粹，{realm}。`,
    `给孩子带一份{name}回家吧，{attr}比什么零食都健康——新鲜、天然、像{metaphor}一样让人放心。`,
    `水果摊上挑来挑去，最后还是{name}很对味。{attr}一口下去就知道为什么了——{metaphor}，{realm}。`,
    `{name}的颜色就够诱人了，{attr}切开来更是晶莹剔透——摆盘都舍不得动，像{metaphor}。`,
    `夏天冰箱里常备{name}，拿出来的时候连呼吸都清爽了。{attr}{metaphor}般的凉意，{angle}{realm}。`,
    `送礼送{name}很体面——{attr}包装精美不说，东西本身也拿得出手，像{metaphor}。`,
    `榨汁/拌沙拉/直接啃，{name}怎么吃都行。{attr}{metaphor}般的百搭，{realm}不挑剔。`,
    `产地直采的{name}确实不一样，{attr}那种"刚离枝"的劲儿是超市货比不了的——{metaphor}，{angle}`,
  ],
  closers: ['鲜的，不必多说。'],
  aliases: ['果蔬', '水果', '生鲜', '蔬菜', '肉禽', '海鲜', '农产', '食材', '农场', '水果店', '菜场', '果业', '果园', '果蔬店'],
}

const 零售: CategoryEmotionProfile = {
  key: '零售',
  label: '零售百货',
  tone: '悦己的小确幸与陪伴',
  allowedMoodTags: ['快乐', '满足', '惊喜', '治愈', '温馨', '可爱', '有趣', '浪漫', '甜蜜', '怀旧'],
  metaphors: ['抽屉里的小欢喜', '案头的一件趣物', '旧书页的香', '随手摆着的可爱', '抽屉里的小确幸', '随手摆着的光'],
  angles: ['给自己一点甜。', '寻常日子里的小光。'],
  bodyTemplates: [
    `{name}拿到手的那一刻就让人嘴角上扬——{attr}质感比图片还好，{metaphor}般的{realm}，{angle}`,
    `逛着逛着就被{name}吸引过去了，{attr}实物比想象中更有分量——像{metaphor}，{realm}。`,
    `送给自己的小礼物不需要理由，{name}就是那种{attr}看到就想带回家的好东西。{metaphor}，{angle}`,
    `桌案上摆一件{name}，{attr}整个空间的气质都不一样了——{metaphor}般的点睛之笔，{realm}。`,
    `{name}的设计感藏在小细节里，{attr}越用越觉得用心——像{metaphor}，日子也被温柔对待了。`,
    `朋友来家里做客总会问起这件{name}，{attr}它就是有这种"不张扬但抢眼"的魔力——{metaphor}。`,
    `拆{name}包装的过程本身就是一种享受，{attr}每一层都是仪式感——{metaphor}般的期待，{angle}{realm}。`,
    `日常用得到的东西才很值得买好的，{name}就是这样的存在。{attr}{metaphor}，{realm}陪你度过每一天。`,
    `没想到这么实用的东西也可以这么好看——{name}，{attr}{metaphor}，{angle}实用和颜值都有了。`,
    `给朋友挑礼物的时候看到{name}就走不动了，{attr}"Ta一定会喜欢"的直觉很少出错——像{metaphor}。`,
  ],
  closers: ['喜欢，就带它回家。'],
  aliases: ['零食', '百货', '图书', '日用', '杂货', '文创', '超市', '便利店', '杂货铺', '小超市', '文具'],
}

const 美业: CategoryEmotionProfile = {
  key: '美业',
  label: '丽人美业',
  tone: '悦己与焕新的精致',
  allowedMoodTags: ['精致', '治愈', '放松', '浪漫', '甜蜜', '仪式感', '高端', '典雅'],
  metaphors: ['镜中焕然的自己', '指尖温柔的时光', '被妥帖照料的容颜', '发梢掠过的轻', '镜中舒展的眉', '指尖流过的柔'],
  angles: ['为自己停下来的那一刻。', '好好爱自己，不亏。'],
  bodyTemplates: [
    `做完{name}走出店门的那一刻，整个人都轻盈了——{attr}{metaphor}般的{realm}，{angle}连走路都带风。`,
    `{name}的过程本身就是一种享受，{attr}每一寸都被温柔对待——像{metaphor}，{realm}从皮肤漫到心里。`,
    `好久没有这样认真地对待自己了，一次{name}刚好找回那种被珍视的感觉——{metaphor}，{angle}`,
    `{name}的效果不是立竿见影的那种夸张，而是{attr}几天后发现"咦好像真的不一样了"——{metaphor}般的惊喜。`,
    `朋友问最近气色怎么这么好，答案就是{name}。{attr}{metaphor}，{angle}它就是有这种润物细无声的本事。`,
    `忙碌的日子里抽一小时做{name}，{attr}不是奢侈是刚需——{metaphor}般的充电，{realm}回来又是满血状态。`,
    `选{name}就是选一份安心，{attr}手法/产品/环境每一样都经得起细看——像{metaphor}，值得托付。`,
    `第一次尝试{name}有点紧张，但体验完就明白了为什么那么多人推荐——{attr}{metaphor}，{angle}真香。`,
    `重要场合前做一次{name}，{attr}整个人都亮了一度——自信是很提气色的底色，而{name}帮你打底。`,
    `把{name}当作定期给自己的礼物吧，{attr}坚持下来你会发现变化——由内而外的{realm}，像{metaphor}。`,
  ],
  closers: ['你值得被温柔对待。'],
  aliases: ['美甲', '美容', '美发', '护肤', 'SPA', '丽人', '造型', '美睫', '纹绣', '美妆', '养肤', '美颜'],
}

const 娱乐: CategoryEmotionProfile = {
  key: '娱乐',
  label: '休闲娱乐',
  tone: '释放与社交的沉浸',
  allowedMoodTags: ['快乐', '兴奋', '刺激', '活力', '愉悦', '分享', '有趣'],
  metaphors: ['灯影里炸开的笑', '一群人的喧闹', '卸下伪装的夜', '屏幕亮起的雀跃', '屏幕亮起的喧', '夜场炸开的笑'],
  angles: ['痛快闹一场。', '和朋友，才够味。'],
  bodyTemplates: [
    `约上朋友来一场{name}吧，{attr}比刷手机有意义多了——{metaphor}般的{realm}，{angle}笑到脸酸才过瘾。`,
    `{name}的现场感是任何屏幕都替代不了的，{attr}身临其境的那一刻——像{metaphor}，所有烦恼都被抛在脑后。`,
    `工作了一周很期待的就是{name}，{attr}{metaphor}般的释放，{angle}出来之后整个人都轻了。`,
    `第一次玩{name}有点放不开，但五分钟后就嗨了——{attr}{metaphor}，{realm}它就是有这种感染力。`,
    `带家人来体验{name}吧，{attr}老少皆宜、全员参与——{metaphor}般的欢乐，比什么都珍贵。`,
    `{name}的氛围感太好了，{attr}灯光/音乐/互动每一环都在状态——像{metaphor}，沉浸进去就不想出来。`,
    `朋友聚会选{name}绝对不会冷场，{attr}全程高能——{metaphor}，{realm}得让人不想回家。`,
    `一个人也可以玩得很开心，{name}就是这种{attr}"加入就能融入"的好地方——{metaphor}，{angle}`,
    `每次来{name}都有新体验，{attr}主题/关卡/剧情经常更新——像{metaphor}，百玩不腻。`,
    `约会选{name}比吃饭有意思多了，{attr}互动中更能看出两个人合不合拍——{metaphor}，{realm}。`,
  ],
  closers: ['今晚，尽兴就好。'],
  aliases: ['KTV', '剧本杀', '影院', '密室', '电玩', '桌游', '酒吧', '夜店', '游乐', '演出', '电竞', 'Livehouse', '轰趴', '游乐园'],
}

const 运动健身: CategoryEmotionProfile = {
  key: '运动健身',
  label: '运动健身',
  tone: '活力与自律的突破',
  allowedMoodTags: ['活力', '满足', '专注', '兴奋', '放松', '自然'],
  metaphors: ['汗水落地的脆', '突破极限的喘息', '身体苏醒的晨', '肌肉舒展的暖', '心率跳动的鼓', '肌肉记忆的暖'],
  angles: ['动起来，通体舒畅。', '坚持，身体会记得。'],
  bodyTemplates: [
    `练完一组{name}，汗水顺着脸颊落下的那一刻——{attr}{metaphor}般的{realm}，{angle}所有的压力都跟着排走了。`,
    `{name}不需要你一开始就很强，{attr}只需要你出现在这里——{metaphor}，身体会回报你的每一分坚持。`,
    `坚持{name}一个月后回头看，{attr}体能/体型/精神状态的变化自己都惊讶——像{metaphor}，时间不骗人。`,
    `{name}的过程很累但结束很爽，{attr}那种"我做到了"的成就感是任何东西替代不了的——{metaphor}。`,
    `一个人练{name}也可以很有仪式感，{attr}戴上耳机、调好节奏——{metaphor}般的专注，{realm}只属于你自己。`,
    `带朋友一起来体验{name}吧，{attr}互相监督比独自坚持容易多了——{metaphor}，两个人一起流汗更有动力。`,
    `每次想放弃的时候就再坚持五分钟，{name}教会你的不只是动作，还有{attr}{metaphor}般的意志力。`,
    `早晨的{name}和晚上的体验完全不同，{attr}晨练唤醒身体、夜练释放压力——各有各的好，像{metaphor}。`,
    `{name}的教练很专业但不凶，{attr}每个动作都会纠正到标准——{metaphor}般的教学，让你安全又有效。`,
    `不要等到身体报警了才开始运动，{name}就是那种{attr}日常养护好过事后补救的生活方式——{metaphor}，{angle}`,
  ],
  closers: ['练完这一组，整个人都轻了。'],
  aliases: ['瑜伽', '游泳', '私教', '健身', '拳击', '骑行', '跑步', '舞蹈', '健身房', '工作室', '普拉提'],
}

const 亲子: CategoryEmotionProfile = {
  key: '亲子',
  label: '亲子',
  tone: '陪伴与成长的童真',
  allowedMoodTags: ['温馨', '幸福', '甜蜜', '治愈', '快乐', '可爱'],
  metaphors: ['孩子扬起的笑', '牵着的小手', '时光里的童真', '蹦跳着的身影', '小手攥着的暖', '笑涡漾开的甜'],
  angles: ['陪他长大，也是陪自己重温童年。', '孩子的笑，很能化开疲惫。'],
  bodyTemplates: [
    `带小朋友来{name}吧，{attr}看到他眼睛发亮的那一刻——{metaphor}，比什么都值，{angle}`,
    `{name}是那种"玩了一整天还不肯走"的地方，{attr}每个角落都有新发现——像{metaphor}，孩子的快乐就是这么简单。`,
    `周末不知道去哪就来{name}，{attr}既能放电又能学东西——{metaphor}般的寓教于乐，{realm}家长也放心。`,
    `孩子在{name}里交到了新朋友，{attr}社交能力在玩耍中自然生长——像{metaphor}，成长不需要刻意安排。`,
    `拍下孩子在{name}里奔跑的样子吧，{attr}那种毫无保留的快乐——{metaphor}般的画面，{angle}多年后看还是会笑。`,
    `{name}的安全措施做得很到位，{attr}家长可以放心地在一旁休息——孩子们自己探索，像{metaphor}。`,
    `生日派对选{name}太合适了，{attr}场地/布置/活动一站式解决——{metaphor}，小寿星和朋友们都玩疯了。`,
    `每次来{name}都有新主题，{attr}孩子不会腻——{metaphor}般的新鲜感，让每一次出行都值得期待。`,
    `陪孩子玩{name}的过程中发现自己也变回了小孩，{attr}{metaphor}——原来快乐一直都很简单，{realm}`,
    `{name}的性价比很高，一张票能玩一整天。{attr}{metaphor}，{angle}比去游乐场划算多了。`,
  ],
  closers: ['这样的时光，很珍贵。'],
  aliases: ['乐园', '早教', '摄影', '婴童', '儿童', '母婴', '托管', '亲子乐园', '绘本馆', '游乐场'],
}

const 生活服务: CategoryEmotionProfile = {
  key: '生活服务',
  label: '生活服务',
  tone: '省心与托付的安心',
  allowedMoodTags: ['放松', '治愈', '实用', '温馨', '安心'],
  metaphors: ['交出去的轻松', '被妥帖打理的琐碎', '归家时的整洁', '不必自己动手的闲', '被妥帖安顿的闲', '交出去的轻'],
  angles: ['麻烦的事，交给专业的人。', '把时间留给自己。'],
  bodyTemplates: [
    `把{name}交给专业人士吧，{attr}省下的时间精力陪家人不香吗——{metaphor}般的轻松，{angle}`,
    `预约一次{name}，{attr}回到家时一切都整整齐齐——那种"有人替你操心"的感觉太治愈了，像{metaphor}。`,
    `{name}的服务细节做得很好，{attr}不是敷衍了事而是真的用心——{metaphor}般的靠谱，值得长期信任。`,
    `忙碌的时候很需要{name}这样的帮手，{attr}{metaphor}——把琐事交出去，把时间留给自己和重要的人。`,
    `第一次用{name}还有点不好意思，但体验完就后悔没有早点预约。{attr}{metaphor}，{realm}生活品质立竿见影。`,
    `{name}的价格透明、服务标准清晰，{attr}不会出现"来了才加价"的情况——{metaphor}般的诚信让人安心。`,
    `给父母也预约一次{name}吧，{attr}他们嘴上说"不用不用"心里其实很高兴——像{metaphor}，孝心要落实到行动上。`,
    `定期做{name}是一种生活方式的选择，{attr}花小钱省大心——{metaphor}，{realm}把时间投资在更重要的事情上。`,
    `{name}的工作人员很守时也很专业，{attr}进门穿鞋套、完工后清理现场——{metaphor}般的素养，{angle}`,
    `搬家/大扫除/维修这些事交给{name}，{attr}自己只管验收就好——像{metaphor}，花钱买的是安心和时间。`,
  ],
  closers: ['剩下的，安心就好。'],
  aliases: ['家政', '维修', '洗衣', '洗车', '保洁', '托管', '养护', '上门', '收纳', '月嫂', '管家'],
}

const 酒店民宿: CategoryEmotionProfile = {
  key: '酒店民宿',
  label: '酒店民宿',
  tone: '栖居与远方的慢生活',
  allowedMoodTags: ['放松', '治愈', '慢生活', '浪漫', '平静', '安逸', '温馨'],
  metaphors: ['推窗见远的辽阔', '一夜好眠的软', '异乡的灯', '院里那棵老树', '山雾散去的晨', '被窝里的暖'],
  angles: ['在路上，也是在家。', '换一处地方，换一种心绪。'],
  bodyTemplates: [
    `推开{name}房门的那一刻，旅途的疲惫就消了一半——{attr}{metaphor}般的{realm}，{angle}终于可以好好歇一歇了。`,
    `{name}的床品太舒服了，{attr}一躺下去就不想动——{metaphor}，一夜好眠是对旅行者很用心的款待。`,
    `在{name}醒来是被阳光叫醒的，{attr}拉开窗帘就是好风景——{metaphor}般的早晨，{realm}从眼到心都亮了。`,
    `{name}不只是睡觉的地方，更是一种生活方式的体验。{attr}{metaphor}，在这里时间好像变慢了，{angle}`,
    `选{name}就是因为它的位置和氛围，{attr}出门方便、回来安静——像{metaphor}，旅行住宿该有的样子。`,
    `{name}的细节做得很好，{attr}洗护用品/床垫硬度/枕头高度都经过考量——{metaphor}般的用心看得见摸得着。`,
    `带家人来住{name}吧，{attr}空间够大、设施齐全——老人孩子都满意，像{metaphor}般的一站式妥帖。`,
    `在{name}的阳台上发呆也是一种享受，{attr}泡一杯茶看着远处的风景——{metaphor}，{realm}这才是度假该有的节奏。`,
    `{name}的服务恰到好处，{attr}有求必应但不打扰——{metaphor}般的分寸感，比过度热情更让人舒服。`,
    `每次来这座城市都选这家{name}，{attr}熟悉又安心——像回了一个远方的家，{metaphor}，{angle}`,
  ],
  closers: ['好好歇一晚。'],
  aliases: ['酒店', '民宿', '客栈', '住宿', '青旅', '度假', '度假村'],
}

// 通用兜底（未匹配到任何类目时）
export const GENERIC_PROFILE: CategoryEmotionProfile = {
  key: '通用',
  label: '通用',
  tone: '安宁',
  allowedMoodTags: [],
  metaphors: [],
  angles: [''],
  aliases: [],
}

// =====================
// 类目策略表
// =====================
export const CATEGORY_EMOTION_MAP: Record<string, CategoryEmotionProfile> = {
  餐饮,
  饮品,
  烘焙,
  水果生鲜,
  零售,
  美业,
  娱乐,
  运动健身,
  亲子,
  生活服务,
  酒店民宿,
}

// ---------------------
// 运行时策略源（支持从云端 category_emotion_profiles 热更新）
// ---------------------
// activeMap 默认用内置策略；一旦从云端拉到策略即切换为云端版本，
// 使运营后台改词库/比喻库即时生效、无需发版。内置策略始终作为离线/失败兜底。
let activeMap: Record<string, CategoryEmotionProfile> = CATEGORY_EMOTION_MAP
let dbLoaded = false
let dbLoadingPromise: Promise<void> | null = null

// 云端行 → CategoryEmotionProfile（注意：openers 在库中是 string[]，
// 而编译引擎期望函数数组，故此处不映射 openers，统一回退通用起笔模板）
function rowToProfile(row: CategoryEmotionProfileRow): CategoryEmotionProfile {
  return {
    key: row.category_key,
    label: row.label,
    tone: row.tone || '',
    allowedMoodTags: row.allowed_mood_tags || [],
    metaphors: row.metaphors || [],
    angles: row.angles || [],
    bodyTemplates: (row as any).body_templates || undefined,
    closers: row.closers || undefined,
    aliases: row.aliases || [],
  }
}

/**
 * 从云端 category_emotion_profiles 拉取类目策略，覆盖内置策略。
 * 失败 / 行缺失时静默保留内置策略，不阻塞展示。
 * 带「已加载 / 并发去重」保护，整会话只拉一次。
 */
export async function loadCategoryEmotionProfilesFromDb(): Promise<void> {
  if (dbLoaded) return
  if (dbLoadingPromise) return dbLoadingPromise
  dbLoadingPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('category_emotion_profiles')
        .select('category_key,label,tone,allowed_mood_tags,metaphors,angles,body_templates,openers,closers,aliases')
      if (error) throw error
      const rows = (data || []) as CategoryEmotionProfileRow[]
      if (rows.length) {
        const m: Record<string, CategoryEmotionProfile> = {}
        for (const r of rows) m[r.category_key] = rowToProfile(r)
        if (Object.keys(m).length) {
          activeMap = m
          dbLoaded = true
        }
      }
    } catch (e) {
      // 保留内置策略兜底
      console.warn('[emotion] 类目策略云端加载失败，使用内置策略', e)
    }
  })()
  return dbLoadingPromise
}

/**
 * 根据类目名（可能含别名）解析出对应的情绪编译策略。
 * 模糊匹配：命中主 key 或任意 alias（双向包含）即采用；否则返回通用策略。
 */
export function resolveCategoryProfile(category?: string | null): CategoryEmotionProfile {
  const c = (category || '').trim()
  if (!c) return activeMap['通用'] || GENERIC_PROFILE

  for (const key of Object.keys(activeMap)) {
    const p = activeMap[key]
    const aliases = p.aliases || []
    const hit = c.includes(key) || aliases.some(a => c.includes(a) || a.includes(c))
    if (hit) return p
  }
  return activeMap['通用'] || GENERIC_PROFILE
}

// =====================
// 本地生活类目 · 犒赏铺（合作商家）声明
// =====================
// 平台存在两套门店入口，类目体系不同：
//   1) 探索页（自营门店）—— platformFilter='only'，使用「商品类目」（图书/美食/饮品/零食/日用/礼品）
//   2) 犒赏铺（合作商家）—— platformFilter='exclude'，使用「本地生活类目」
//      —— 即本文件定义的 11 个本地生活业态（餐饮/饮品/烘焙/水果生鲜/零售/美业/娱乐/运动健身/亲子/生活服务/酒店民宿）。
//
// 下列映射把犒赏铺前端展示用的门店类目，对齐到情绪编译系统的本地生活类目 key，
// 使合作商家的商品也能正确命中情绪表达策略（消除此前「门店类目」与「情绪本地生活类目」两套语言不对齐的断层）。
export const REWARD_SHOP_CATEGORY_TO_LOCAL_LIFE: Record<string, string> = {
  '餐饮': '餐饮',     // 直接对应
  '购物': '零售',     // 零售 aliases 含 百货/超市/便利店/文创
  '娱乐': '娱乐',     // 直接对应
  '美容': '美业',     // 美业 aliases 含 美容/美甲/护肤/SPA
  '家政': '生活服务', // 生活服务 aliases 含 家政/保洁/维修
  '教育': '亲子',     // 近似对齐：早教/托管/儿童/母婴
}

/** 明确的语义声明：犒赏铺属于「本地生活类目」体系（合作商家入口）。 */
export const REWARD_SHOP_IS_LOCAL_LIFE = true

/**
 * 将犒赏铺门店类目转换为情绪编译系统使用的本地生活类目 key。
 * 未命中映射时回退 '通用'（由 resolveCategoryProfile 兜底）。
 */
export function toLocalLifeCategory(rewardShopCategory?: string | null): string {
  if (!rewardShopCategory) return '通用'
  return REWARD_SHOP_CATEGORY_TO_LOCAL_LIFE[rewardShopCategory] || '通用'
}

// =====================
// 探索(自营)商品类目 → 本地生活业态 映射
// =====================
// 探索页展示「商品类目」(图书/美食/饮品/零食/日用/礼品)，后端按 products.category exact 匹配；
// 此处把商品类目对齐到「本地生活业态」(category-emotion 11 业态)，点亮三套类目统一到本地生活的概念闭环：
//   ① 探索商品类目  ② 犒赏铺门店类目(REWARD_SHOP_CATEGORY_TO_LOCAL_LIFE)  ③ 情绪本地生活类目
export const EXPLORE_PRODUCT_CATEGORY_TO_LOCAL_LIFE: Record<string, string> = {
  '图书': '零售',
  '美食': '餐饮',
  '饮品': '饮品',
  '零食': '零售',
  '日用': '零售',
  '礼品': '零售',
}

/** 11 个本地生活业态 key（情绪编译策略主 key），供统一类目源引用 */
export const LOCAL_LIFE_CATEGORY_KEYS: string[] = Object.keys(CATEGORY_EMOTION_MAP)

// =====================
// 统一情绪筛选层（探索 / 犒赏铺 共用）
// =====================
// 情绪作为贯穿「探索(自营)」与「犒赏铺(合作)」两类目体系的统一维度。
// 下方 chips 供两页共用：探索端点击走本地 moodTag 过滤；犒赏铺端点击跳搜索页情绪配对。
export const UNIFIED_EMOTION_FILTERS: Array<{ tag: string; icon: string }> = [
  { tag: '快乐', icon: '😊' },
  { tag: '温馨', icon: '🏠' },
  { tag: '清爽', icon: '🍃' },
  { tag: '奢华', icon: '👑' },
  { tag: '有趣', icon: '🎈' },
  { tag: '平静', icon: '🧘' },
  { tag: '治愈', icon: '🩹' },
  { tag: '甜蜜', icon: '🍯' },
  { tag: '浪漫', icon: '🌹' },
  { tag: '活力', icon: '⚡' },
]
