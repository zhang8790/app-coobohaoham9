// 商品级情绪词库（Product-level Emotion Lexicon）
// ------------------------------------------------------------
// 这是「情绪编译」系统的缺失一层：在「品类级模板(category-emotion.ts)」之下、
// 补一层「具体商品/细分品类」的情绪表达。
//
// 为什么需要它：
//   之前 红茶 / 水 / 咖啡 全走「饮品」一套（allowedMoodTags 仅 8 词），
//   烧烤 / 火锅 全走「餐饮」一套 —— 导致「很多商品描述都一样、情绪词也少」。
//   本文件让每个具体品类拥有专属情绪词 + 贴合本味的场景化文案，
//   例如 红茶=温润/回甘/围炉，水=清润/本真/通透，烧烤=烟火/酣畅/热络。
//
// 设计：
//   - 每个词条 = 关键词数组 + ProductEmotionProfile（情绪词/场景/感官/比喻/角度/主体模板/收束）
//   - resolveProductEmotionLexicon(name, description) 做「最长关键词匹配优先」，
//     命中具体品类（如「正山小种红茶」→ 红茶）而非品类泛化。
//   - 编译引擎(emotion-description.ts) 在品类模板之前优先采用本词库；
//     recommendDimensions(emotion-dimensions.ts) 用本词库补全更贴合的标签推荐。
//
// 禁用医疗宣称与绝对化用语；食养功效措辞=传统食养参考，不替代医嘱。

export interface ProductEmotionProfile {
  /** 商品专属情绪词（用于生成文案，可超出品类 allowedMoodTags 的白名单） */
  moodTags: string[]
  /** 推荐场景标签（对齐 EMOTION_DIMENSION_TAGS.scene 已有项） */
  sceneTags: string[]
  /** 感官词（对齐 EMOTION_DIMENSION_TAGS.sensory 已有项） */
  sensory: string[]
  /** 功能属性维度标签（对齐 EMOTION_DIMENSION_TAGS.function） */
  functionTags?: string[]
  /** 身份认同维度标签（对齐 EMOTION_DIMENSION_TAGS.identity） */
  identityTags?: string[]
  /** 商品专属比喻/意象库（轮换取，覆盖品类比喻） */
  metaphors: string[]
  /** 叙事角度（轮换取） */
  angles: string[]
  /** 主体模板（占位符 {name}/{metaphor}/{realm}/{angle}/{attr}，要求场景化、贴合本味） */
  bodyTemplates: string[]
  /** 收束语 */
  closers: string[]
}

interface LexiconEntry {
  keywords: string[]
  profile: ProductEmotionProfile
}

// =====================
// 商品级情绪词条
// =====================

const 红茶: LexiconEntry = {
  keywords: ['红茶', '正山小种', '祁门', '滇红', '金骏眉', '英德红茶', '荔枝红茶', '阿萨姆'],
  profile: {
    moodTags: ['温润', '回甘', '安神', '围炉', '慢生活', '治愈', '松弛'],
    sceneTags: ['独处时光', '深夜加班', '周末一人食', '朋友小聚'],
    sensory: ['温热', '醇厚', '馥郁'],
    identityTags: ['慢生活', '懂生活', '温柔'],
    metaphors: ['杯沿氤氲的那缕热气', '炉上慢煮的一壶暖', '窗边独坐时伴着的光', '夜读摊开书页旁的红'],
    angles: ['一盏茶的时间，刚好把心事放一放。', '温吞的暖，是给自己的不慌不忙。'],
    bodyTemplates: [
      `{name}注进杯里，汤色红亮得像落日。{attr}第一口温润下肚，{metaphor}般的{realm}从喉头漫到心底——{angle}`,
      `入夜了，给自己煮一壶{name}。{attr}红汤在杯里打着转，{metaphor}似的{realm}，适合什么都不想的时刻。`,
      `{name}的好在于回甘——{attr}咽下之后那点甜才慢慢浮上来，像{metaphor}，{realm}得耐品。`,
      `雨天窝在窗边喝{name}，{attr}热气糊了半扇玻璃，{metaphor}般的{realm}，{angle}连雨声都好听了。`,
      `和三两好友围炉煮{name}，{attr}一片一片往壶里续，{metaphor}似的{realm}，{angle}话也多了起来。`,
      `加班到很晚，{name}是此刻心心念念的那份暖。{attr}{metaphor}，{realm}把一天的紧绷慢慢化开。`,
    ],
    closers: ['趁温，小口喝。', '这一盏，慢慢饮。'],
  },
}

const 绿茶: LexiconEntry = {
  keywords: ['绿茶', '龙井', '碧螺春', '毛峰', '毛尖', '太平猴魁', '抹茶', '云雾'],
  profile: {
    moodTags: ['清冽', '鲜爽', '醒神', '自然', '清新', '松弛'],
    sceneTags: ['午后摸鱼', '独处时光', '出差途中', '周末一人食'],
    sensory: ['清爽', '清新', '清甜'],
    identityTags: ['懂生活', '会留白', '自然'],
    metaphors: ['晨雾里的一抹青', '山泉过喉的透', '杯中舒展的嫩芽', '初春第一口氧'],
    angles: ['一口鲜爽，把困意先冲开。', '不炒不揉的本真，很见功夫。'],
    bodyTemplates: [
      `{name}在杯里舒展开，像把整座茶山搬到了桌上。{attr}第一口清冽，{metaphor}般的{realm}直抵眉心——{angle}`,
      `午后困了来一杯{name}，{attr}那点鲜爽把混沌都洗掉了，{metaphor}似的{realm}，思路也清了。`,
      `{name}的妙处在"鲜"——{attr}不发酵的本色，像{metaphor}，{realm}得毫无负担。`,
      `一个人对着电脑的下午，{name}是很妥帖的陪伴。{attr}{metaphor}，{realm}不吵不闹，刚刚好。`,
      `懂茶的人喝{name}从不加糖，{attr}就为那口原味的清，像{metaphor}，{realm}得坦荡。`,
      `出差路上带一罐{name}，{attr}到了酒店自己冲一杯，{metaphor}般的{realm}，异乡的夜也安稳了。`,
    ],
    closers: ['趁鲜，趁香。', '这一杯，醒神。'],
  },
}

const 普洱: LexiconEntry = {
  keywords: ['普洱', '熟普', '生普', '老茶头', '柑普', '小青柑'],
  profile: {
    moodTags: ['陈香', '温养', '醇厚', '慢生活', '松弛', '回甘'],
    sceneTags: ['独处时光', '朋友小聚', '饭后'],
    sensory: ['醇厚', '温热'],
    identityTags: ['懂生活', '慢生活', '有品味'],
    metaphors: ['岁月压出的那层光', '老柜里藏着的暖', '越陈越稳的一壶', '饭后慢慢化开的稠'],
    angles: ['时间给的厚味，急不得。', '饭后一壶，肠胃都舒坦。'],
    bodyTemplates: [
      `{name}汤色深红，捧在手里像握着一段旧时光。{attr}入口陈香沉稳，{metaphor}般的{realm}从胃里暖上来——{angle}`,
      `饭后一壶{name}，{attr}油腻被悄悄化开，{metaphor}似的{realm}，身子轻了半分。`,
      `{name}是喝得越久越懂的——{attr}头几泡平平，后面才见真章，像{metaphor}，{realm}得耐品。`,
      `老茶友独爱{name}的温养，{attr}不寒不燥，像{metaphor}，{realm}得熨帖。`,
      `冬天围炉煮{name}，{attr}一屋子都是陈香，{metaphor}般的{realm}，{angle}话不必多，茶懂就行。`,
    ],
    closers: ['趁热，慢饮。', '这一壶，养人。'],
  },
}

const 乌龙茶: LexiconEntry = {
  keywords: ['乌龙', '铁观音', '大红袍', '单丛', '岩茶', '凤凰'],
  profile: {
    moodTags: ['兰香', '回韵', '清冽', '高雅', '松弛', '清新'],
    sceneTags: ['朋友小聚', '独处时光', '午后摸鱼'],
    sensory: ['馥郁', '清爽'],
    identityTags: ['有品味', '懂生活', '精致'],
    metaphors: ['杯底浮起的兰花影', '岩骨花香里的一缕傲', '七泡有余香的执拗', '山场里带出的韵'],
    angles: ['香气是它不说话的名片。', '一口回韵，才知山场深浅。'],
    bodyTemplates: [
      `{name}闻香先醉三分，{attr}兰花底韵在杯口绕，{metaphor}般的{realm}让人舍不得咽——{angle}`,
      `懂行的人喝{name}要"啜"，{attr}让茶汤在舌尖打转，{metaphor}似的{realm}才全数醒来。`,
      `{name}的妙在回韵——{attr}咽下许久喉头还甜，像{metaphor}，{realm}得悠长。`,
      `午后约人来喝{name}，{attr}一冲一泡都是仪式，{metaphor}般的{realm}，{angle}聊什么都慢了。`,
      `岩茶喝的是"骨"，{name}这股劲，{attr}像{metaphor}，{realm}得有棱有角却不难亲近。`,
    ],
    closers: ['趁香，细品。', '这一道，回韵长。'],
  },
}

const 咖啡: LexiconEntry = {
  keywords: ['咖啡', '拿铁', '美式', '浓缩', 'dirty', '摩卡', '卡布奇诺', '澳白', '冷萃', '手冲'],
  profile: {
    moodTags: ['醒神', '回血', '醇苦', '独处', '松弛', '仪式感'],
    sceneTags: ['午后摸鱼', '下班路上', '深夜加班', '独处时光'],
    sensory: ['醇厚', '微苦', '丝滑'],
    functionTags: ['咖啡馆', '热饮'],
    identityTags: ['有品味', '懂生活', '独立'],
    metaphors: ['清晨第一口清醒', '杯壁挂着的 crema', '蒸汽杆吐出的白', '深棕里沉着的一缕香'],
    angles: ['一口下去，人就在线了。', '独处的仪式，从一杯开始。'],
    bodyTemplates: [
      `{name}端上来，香气先替你把瞌睡赶跑。{attr}第一口醇苦回甘，{metaphor}般的{realm}直冲天灵盖——{angle}`,
      `午后三点靠{name}续命，{attr}那点苦之后浮起的甜，像{metaphor}，{realm}得刚刚好撑到下班。`,
      `手冲{name}的过程本身就是冥想，{attr}水流画圈、粉层起伏，{metaphor}似的{realm}，{angle}心也静了。`,
      `一个人坐在咖啡馆角落喝{name}，{attr}谁也不打扰谁，{metaphor}般的{realm}，是难得的留白。`,
      `赶稿赶方案的深夜，{name}是桌上的第二盏灯。{attr}{metaphor}，{realm}让脑子重新转起来。`,
      `加奶的{name}温柔，不加的锋利，{attr}都好喝——像{metaphor}，{realm}看今天想要哪种自己。`,
    ],
    closers: ['趁热，慢慢喝。', '这一杯，回血。'],
  },
}

const 奶茶: LexiconEntry = {
  keywords: ['奶茶', '珍奶', '波波', '芋泥', '烧仙草', '芝士奶盖', '脏脏茶'],
  profile: {
    moodTags: ['甜润', '小确幸', '欢聚', '治愈', '松弛'],
    sceneTags: ['朋友小聚', '午后摸鱼', '周末一人食', '下班路上'],
    sensory: ['清甜', '绵密', '丝滑'],
    functionTags: ['茶饮', '热饮'],
    identityTags: ['自我取悦', '可爱', '温柔'],
    metaphors: ['吸管搅起的甜', '杯沿挂着的奶盖', '咬到珍珠时的雀跃', '放学路口的那杯暖'],
    angles: ['甜一口，今天就没白过。', '和朋友，一人一杯才对味。'],
    bodyTemplates: [
      `{name}第一口就尝到珍珠的Q，{attr}奶香裹着茶底，{metaphor}般的{realm}从舌尖漫开——{angle}`,
      `逛街走累了，{name}是很提神的加油站。{attr}甜润顺喉，像{metaphor}，{realm}得人又活过来了。`,
      `和朋友各点一杯{name}，{attr}碰杯的动作比喝还开心，{metaphor}似的{realm}，{angle}快乐就这么简单。`,
      `奶盖{name}要先喝一口咸甜交错的顶，{attr}再搅匀了喝，{metaphor}般的{realm}，层次比想象中多。`,
      `一个人也想喝{name}的时候，{attr}不是馋，是想要那份被甜到的妥帖，像{metaphor}，{realm}。`,
    ],
    closers: ['趁冰，小口嘬。', '这一杯，甜到心里。'],
  },
}

const 果茶: LexiconEntry = {
  keywords: ['果茶', '水果茶', '柠檬茶', '百香果', '葡萄柚茶', '莓果茶'],
  profile: {
    moodTags: ['鲜活', '清爽', '小确幸', '清新', '治愈'],
    sceneTags: ['朋友小聚', '午后摸鱼', '夏日', '周末一人食'],
    sensory: ['清爽', '清甜', '清新'],
    functionTags: ['茶饮'],
    identityTags: ['自我取悦', '自然', '可爱'],
    metaphors: ['杯里浮着的果粒', '夏日第一口透', '酸甜打转的小漩涡', '切开水果时溅起的亮'],
    angles: ['酸酸甜甜，是很没有负担的开心。', '一杯下去，暑气先退了。'],
    bodyTemplates: [
      `{name}里看得见真果粒，{attr}一口咬到果肉的鲜，{metaphor}般的{realm}把燥热都压下去——{angle}`,
      `夏天离不开{name}，{attr}冰凉酸甜从喉头漫开，像{metaphor}，{realm}得人清清爽爽。`,
      `下午茶点{name}配本书，{attr}酸甜交替像翻页的节奏，{metaphor}似的{realm}，{angle}时光慢下来。`,
      `和朋友share一杯{name}，{attr}吸管轮流换边，{metaphor}般的{realm}，{angle}聊到店打烊。`,
      `不爱太甜的人选{name}很稳妥，{attr}果酸提着味不腻人，像{metaphor}，{realm}得刚好。`,
    ],
    closers: ['趁冰，畅快喝。', '这一杯，鲜活。'],
  },
}

const 水: LexiconEntry = {
  keywords: ['矿泉水', '纯净水', '苏打水', '气泡水', '饮用水', '天然水', '山泉水', '白开水', '天然矿泉水'],
  profile: {
    moodTags: ['清润', '本真', '通透', '纯净', '松弛', '零负担'],
    sceneTags: ['运动后', '出差途中', '独处时光', '清晨'],
    sensory: ['清爽', '冰凉', '清润'],
    identityTags: ['自然', '会留白', '独立'],
    metaphors: ['晨起第一口的清醒', '山泉过喉的透', '没有任何修饰的本色', '身体里静静淌的一程清流'],
    angles: ['很简单的水，往往很懂身体。', '不添一丝多余，是给自己的留白。'],
    bodyTemplates: [
      `{name}喝下去，身体像被轻轻洗过一遍。{attr}没有任何味道，却刚好是{metaphor}般的{realm}——{angle}`,
      `运动后灌一口{name}，{attr}凉意直抵肺腑，{metaphor}似的{realm}，疲惫一下子退了潮。`,
      `{name}的好在于不抢戏，{attr}它只是安静地把渴意抚平，像{metaphor}，{realm}得恰到好处。`,
      `开会开到口干，{name}是很实在的救场。{attr}{metaphor}般的{realm}，比什么饮料都清醒。`,
      `懂的人知道，{name}的清润是别的替代不了的——{attr}像{metaphor}，{realm}写完一整天也不腻。`,
      `清晨起床先喝一杯{name}，{attr}一夜的浊气被冲开，{metaphor}似的{realm}，{angle}`,
    ],
    closers: ['渴了，就喝。', '本真的好，不必多说。'],
  },
}

const 果汁: LexiconEntry = {
  keywords: ['果汁', '鲜榨', '橙汁', '西瓜汁', '猕猴桃汁', '果蔬汁', '苹果汁', '葡萄汁'],
  profile: {
    moodTags: ['鲜活', '清爽', '小确幸', '自然', '治愈'],
    sceneTags: ['独处时光', '午后摸鱼', '周末一人食', '夏日'],
    sensory: ['清爽', '清甜', '多汁'],
    identityTags: ['自然', '自我取悦', '可爱'],
    metaphors: ['刚压榨出的那捧艳', '杯壁挂着的果纤', '一刀切开时的溅', '清晨果园的第一缕甜'],
    angles: ['一杯下去，像把果园喝进了肚子。', '不加水的鲜，才敢叫果汁。'],
    bodyTemplates: [
      `{name}是现榨的，{attr}杯底还沉着没滤净的果纤，{metaphor}般的{realm}一口就尝出新鲜——{angle}`,
      `不想喝甜的下午，{name}是清爽的选择。{attr}果酸醒神不腻人，像{metaphor}，{realm}得轻盈。`,
      `孩子和大人都爱{name}，{attr}没有香精的假甜，{metaphor}似的{realm}，{angle}放心给家人。`,
      `运动后一杯{name}，{attr}维生素跟着水分一起补，{metaphor}般的{realm}，恢复得快些。`,
      `夏天冰箱常备{name}，{attr}倒出来那抹颜色就让人有胃口，像{metaphor}，{realm}。`,
    ],
    closers: ['趁鲜，喝。', '这一杯，鲜活。'],
  },
}

const 烧烤: LexiconEntry = {
  keywords: ['烧烤', '烤肉', '烤串', '撸串', '炭烤', '烤生蚝', '烤鱼', '烤茄子'],
  profile: {
    moodTags: ['烟火', '酣畅', '热络', '释放', '快乐', '松弛'],
    sceneTags: ['朋友小聚', '节日庆祝', '深夜加班', '下班路上'],
    sensory: ['酥脆', '温热', '馥郁'],
    functionTags: ['正餐'],
    identityTags: ['不将就', '自由', '独立'],
    metaphors: ['夏夜大排档的灯', '炭火噼啪的响', '撸串时碰杯的脆', '油烟里升起的热闹'],
    angles: ['没有什么是一顿烧烤解决不了的。', '炭火一升，白天的正经就卸下了。'],
    bodyTemplates: [
      `{name}端上桌还冒着焦香，{attr}咬下第一口，{metaphor}般的{realm}就把拘谨全烤化了——{angle}`,
      `夏夜几串{name}配冰啤，{attr}炭火噼啪作响，{metaphor}似的{realm}，{angle}话匣子一开就收不住。`,
      `{name}的妙处在那层焦脆，{attr}油脂在火上滋滋叫，像{metaphor}，{realm}得人停不下手。`,
      `加班到深夜，一盒{name}是给自己的犒赏。{attr}{metaphor}，{realm}——明天的事明天再说。`,
      `和朋友撸{name}，{attr}谁抢到最后一串是今晚的悬念，{metaphor}般的{realm}，{angle}`,
      `周末约一场{name}，{attr}油烟袅袅里全是生活气，像{metaphor}，{realm}得踏实。`,
    ],
    closers: ['趁热，痛快吃。', '这一顿，管够。'],
  },
}

const 火锅: LexiconEntry = {
  keywords: ['火锅', '麻辣火锅', '番茄锅', '牛油锅', '串串香', '冒菜锅'],
  profile: {
    moodTags: ['沸腾', '热闹', '酣畅', '围聚', '释放', '快乐'],
    sceneTags: ['朋友小聚', '节日庆祝', '聚会', '冬日'],
    sensory: ['温热', '馥郁', '酥脆'],
    functionTags: ['正餐'],
    identityTags: ['不将就', '自由', '分享'],
    metaphors: ['咕嘟冒泡的红汤', '一桌人伸筷的暖', '蒸汽糊住眼镜的笑', '蘸料碗里调出的江湖'],
    angles: ['一群人围着一口锅，什么隔阂都化了。', '汤一沸，话就多。'],
    bodyTemplates: [
      `{name}的汤一沸，{attr}香味先攻陷整张桌子，{metaphor}般的{realm}把寒气和生分一起煮化——{angle}`,
      `朋友聚会选{name}永远没错，{attr}涮什么都热闹，{metaphor}似的{realm}，{angle}筷子碰筷子就熟了。`,
      `牛油{name}的辣是带劲的那种，{attr}额头冒汗才过瘾，像{metaphor}，{realm}得酣畅。`,
      `一个人也想吃{name}？点个番茄锅，{attr}慢慢涮给自己，{metaphor}般的{realm}，独处也温热。`,
      `冬天总想念{name}的暖，{attr}从胃里烧到指尖，像{metaphor}，{realm}得人不想走。`,
    ],
    closers: ['趁沸，热闹吃。', '这一锅，暖到心里。'],
  },
}

const 麻辣烫: LexiconEntry = {
  keywords: ['麻辣烫', '冒菜', '麻辣拌'],
  profile: {
    moodTags: ['酣畅', '热络', '松弛', '小确幸', '释放'],
    sceneTags: ['下班路上', '深夜加班', '独处时光', '午后摸鱼'],
    sensory: ['温热', '馥郁', '清爽'],
    functionTags: ['正餐', '单人餐'],
    identityTags: ['不将就', '独立', '自由'],
    metaphors: ['自选台前挑花的眼', '红汤里浮起的百样', '一碗端平的自在', '辣得鼻尖冒汗的爽'],
    angles: ['想吃什么自己拿，很民主的一餐。', '一人食也能热气腾腾。'],
    bodyTemplates: [
      `{name}是自己挑出来的专属味道，{attr}荤素一锅煮，{metaphor}般的{realm}连挑食的人都能满足——{angle}`,
      `加班晚了来碗{name}，{attr}热汤一喝浑身舒坦，{metaphor}似的{realm}，{angle}今晚的累被烫平了。`,
      `{name}的辣是上瘾的，{attr}越吃越想加麻加辣，像{metaphor}，{realm}得人停不下筷。`,
      `一个人不想做饭就点{name}，{attr}一碗顶一顿，{metaphor}般的{realm}，省事又不凑合。`,
    ],
    closers: ['趁热，暖暖吃。', '这一碗，刚好。'],
  },
}

const 蛋糕: LexiconEntry = {
  keywords: ['蛋糕', '芝士蛋糕', '慕斯', '千层', '提拉米苏', '芝士'],
  profile: {
    moodTags: ['绵软', '甜慰', '仪式', '甜宠', '小确幸', '治愈'],
    sceneTags: ['朋友小聚', '节日庆祝', '下午茶', '生日'],
    sensory: ['绵密', '丝滑', '清甜'],
    functionTags: ['甜品', '烘焙甜品'],
    identityTags: ['自我取悦', '精致', '温柔'],
    metaphors: ['叉子陷进去的软', '夹层里藏的甜', '烛光前那块圆', '奶油化开的云'],
    angles: ['甜的东西，很懂怎么安慰人。', '庆祝，总得有块蛋糕。'],
    bodyTemplates: [
      `{name}一刀切下去，{attr}夹层里的奶油缓缓溢出来，{metaphor}般的{realm}先把眼睛喂饱——{angle}`,
      `下午茶来块{name}，{attr}绵密在舌尖化开，像{metaphor}，{realm}得人瞬间松了弦。`,
      `生日桌上{name}是主角，{attr}蜡烛一吹愿望就轻了，{metaphor}似的{realm}，{angle}甜得理直气壮。`,
      `难过的时候买块{name}给自己，{attr}糖分到位心情也回血，{metaphor}般的{realm}，{angle}没什么过不去。`,
      `芝士{name}的厚重很让人满足，{attr}一口下去扎实的香，像{metaphor}，{realm}得踏实。`,
    ],
    closers: ['趁鲜，尝一口。', '这一块，甜到心里。'],
  },
}

const 面包: LexiconEntry = {
  keywords: ['面包', '可颂', '吐司', '欧包', '贝果', '法棍', '餐包'],
  profile: {
    moodTags: ['麦香', '酥软', '晨光', '小确幸', '治愈', '松弛'],
    sceneTags: ['周末一人食', '独处时光', '午后摸鱼', '清晨'],
    sensory: ['松软', '酥脆', '绵软'],
    functionTags: ['烘焙甜品'],
    identityTags: ['慢生活', '懂生活', '温柔'],
    metaphors: ['刚出炉的暖香', '脆壳裂开的响', '晨光里那片金', '黄油化开的缝'],
    angles: ['早餐有它，一天就有了开头。', '手作的温度，机器学不来。'],
    bodyTemplates: [
      `{name}刚出炉，{attr}外皮脆得掉渣、内里软得像云，{metaphor}般的{realm}隔着袋子都能闻见——{angle}`,
      `早上掰一块{name}配豆浆，{attr}麦香在嘴里散开，像{metaphor}，{realm}得一天都踏实。`,
      `{name}的好在朴实，{attr}不靠花哨配料，{metaphor}似的{realm}，越嚼越见粮食的本味。`,
      `下午茶撕一片{name}，{attr}黄油香慢慢洇出来，像{metaphor}，{realm}得人放松下来。`,
      `周末睡到自然醒，{name}还在桌上温着，{attr}这一刻的慢，像{metaphor}，{realm}。`,
    ],
    closers: ['趁热，慢慢撕。', '这一口，麦香。'],
  },
}

const 甜品: LexiconEntry = {
  keywords: ['甜品', '甜点', '布丁', '双皮奶', '糖水', '杨枝甘露', '龟苓膏'],
  profile: {
    moodTags: ['甜慰', '小确幸', '治愈', '松弛', '甜宠'],
    sceneTags: ['午后摸鱼', '朋友小聚', '独处时光', '夏日'],
    sensory: ['绵密', '清甜', '丝滑'],
    functionTags: ['甜品', '烘焙甜品'],
    identityTags: ['自我取悦', '温柔', '可爱'],
    metaphors: ['勺底颤巍巍的滑', '糖水下沉着的光', '一口就化的软', '岭南午后那碗凉'],
    angles: ['一碗甜的，抵得过半日烦。', '甜得有分寸，才耐吃。'],
    bodyTemplates: [
      `{name}端上来颤巍巍的，{attr}勺尖一碰就化，{metaphor}般的{realm}先哄好了舌头——{angle}`,
      `午后困乏来碗{name}，{attr}清甜不腻，像{metaphor}，{realm}得人松了半口气。`,
      `粤式{name}很讲火候，{attr}嫩滑是功夫给的，像{metaphor}，{realm}得恰到好处。`,
      `和朋友share一碗{name}，{attr}你一勺我一勺，{metaphor}般的{realm}，{angle}甜也分着更甜。`,
    ],
    closers: ['趁凉，小口尝。', '这一碗，甜慰。'],
  },
}

const 啤酒: LexiconEntry = {
  keywords: ['啤酒', '精酿', '扎啤', '黑啤', '白啤', '鲜啤'],
  profile: {
    moodTags: ['微醺', '畅快', '释放', '热络', '快乐', '松弛'],
    sceneTags: ['朋友小聚', '节日庆祝', '夏日', '下班路上'],
    sensory: ['清爽', '冰凉', '馥郁'],
    functionTags: ['酒水'],
    identityTags: ['自由', '不将就', '独立'],
    metaphors: ['杯壁挂着的密沫', '开瓶那声脆响', '泡沫漫过杯沿的白', '夏夜碰杯的亮'],
    angles: ['一口下去，白天的正经先放下。', '碰杯，是成年人很简单的仪式。'],
    bodyTemplates: [
      `{name}倒满，{attr}绵密的沫顶着杯沿，{metaphor}般的{realm}先把气氛点着——{angle}`,
      `夏夜几瓶{name}配烧烤，{attr}冰得透心凉，像{metaphor}，{realm}得人畅快。`,
      `精酿{name}的风味很野，{attr}果香花香麦芽香层层叠，像{metaphor}，{realm}得值得细品。`,
      `下班约哥们喝{name}，{attr}吐槽全跟着气泡冒了出去，{metaphor}似的{realm}，{angle}`,
      `看球赛离不开{name}，{attr}进球那刻举杯很带劲，像{metaphor}，{realm}得酣畅。`,
    ],
    closers: ['趁冰，畅饮。', '这一杯，敬自在。'],
  },
}

const 红酒: LexiconEntry = {
  keywords: ['红酒', '葡萄酒', '干红', '起泡酒', '香槟', '气泡酒'],
  profile: {
    moodTags: ['微醺', '浪漫', '优雅', '慢生活', '仪式感', '松弛'],
    sceneTags: ['约会', '节日庆祝', '朋友小聚', '独处时光'],
    sensory: ['醇厚', '馥郁', '丝滑'],
    functionTags: ['酒水'],
    identityTags: ['有品味', '精致', '浪漫'],
    metaphors: ['杯中晃动的宝石红', '醒酒器里舒开的香', '单宁收住的尾', '烛光里那一圈光晕'],
    angles: ['慢一点，酒才肯说话。', '重要的时刻，该有杯酒。'],
    bodyTemplates: [
      `{name}在杯里转着圈，{attr}单宁收住的余味很长，{metaphor}般的{realm}把节奏拉慢——{angle}`,
      `约会点一瓶{name}，{attr}两个人的话在酒里泡软了，像{metaphor}，{realm}得浪漫。`,
      `独自小酌{name}，{attr}不赶时间，{metaphor}似的{realm}，{angle}和自己待一会儿也很好。`,
      `节日开瓶{name}庆祝，{attr}气泡或酒香先替喜悦发声，像{metaphor}，{realm}得尽兴。`,
      `好{name}要醒，{attr}急不得——像有些事，等一等才见真味，{metaphor}，{realm}。`,
    ],
    closers: ['小口，慢饮。', '这一杯，敬此刻。'],
  },
}

const 水果: LexiconEntry = {
  keywords: ['苹果', '香蕉', '橙子', '西瓜', '草莓', '葡萄', '樱桃', '芒果', '猕猴桃', '火龙果', '梨', '柚子', '橘子', '水果', '鲜果', '果盘', '提子'],
  profile: {
    moodTags: ['鲜活', '清爽', '自然', '小确幸', '治愈', '纯净'],
    sceneTags: ['独处时光', '午后摸鱼', '夏日', '周末一人食'],
    sensory: ['清爽', '清甜', '多汁'],
    functionTags: ['水果'],
    identityTags: ['自然', '会留白', '温柔'],
    metaphors: ['枝头带露的鲜', '咬开溅起的甜', '刚离枝的清气', '盛夏第一口脆'],
    angles: ['从田间到舌尖，不过片刻。', '应季的鲜，很懂身体。'],
    bodyTemplates: [
      `{name}拿到手还带着露水般的鲜气，{attr}咬开的瞬间，{metaphor}般的{realm}从舌尖漫遍全身。`,
      `当季吃{name}很对，{attr}阳光和雨水都在这口里了，像{metaphor}，{realm}得刚刚好。`,
      `不用料理，{name}洗洗直接吃就是很讨喜的吃法。{attr}{metaphor}般的纯粹，{realm}。`,
      `给孩子带份{name}回家，{attr}比零食健康——新鲜天然，像{metaphor}一样让人放心。`,
      `夏天冰箱常备{name}，{attr}拿出来连呼吸都清爽了，{metaphor}般的凉意，{realm}。`,
      `榨汁拌沙拉直接啃，{name}怎么吃都行。{attr}{metaphor}般的百搭，{realm}不挑人。`,
    ],
    closers: ['鲜的，不必多说。', '这一口，鲜活。'],
  },
}

const 坚果: LexiconEntry = {
  keywords: ['坚果', '核桃', '杏仁', '腰果', '花生', '夏威夷果', '碧根果', '瓜子'],
  profile: {
    moodTags: ['酥香', '小确幸', '松弛', '治愈', '满足'],
    sceneTags: ['独处时光', '午后摸鱼', '朋友小聚', '追剧'],
    sensory: ['酥脆', '馥郁', '绵软'],
    functionTags: ['甜品'],
    identityTags: ['自然', '懂生活', '慢生活'],
    metaphors: ['齿间炸开的香', '剥开才见的仁', '茶几上那碟闲', '追剧时手边的脆'],
    angles: ['一颗一颗，是廉价的小奢侈。', '嚼着嚼着，时间就慢了。'],
    bodyTemplates: [
      `{name}咬开的瞬间，{attr}油香在齿间炸开，{metaphor}般的{realm}让人停不下手——{angle}`,
      `追剧时抓一把{name}，{attr}咔嚓咔嚓的脆，像{metaphor}，{realm}得整个人都松了。`,
      `{name}的香是烤出来的，{attr}越嚼越回甘，像{metaphor}，{realm}得耐品。`,
      `下午饿了垫几颗{name}，{attr}顶饱又不腻，{metaphor}般的{realm}，比饼干踏实。`,
      `朋友来家抓一把{name}边聊边剥，{attr}气氛就这么松弛下来，像{metaphor}，{realm}。`,
    ],
    closers: ['趁香，慢慢嚼。', '这一碟，酥香。'],
  },
}

const 轻食沙拉: LexiconEntry = {
  keywords: ['沙拉', '轻食', '藜麦', '鸡胸', '低卡餐', '减脂餐', '蔬果碗', '能量碗'],
  profile: {
    moodTags: ['轻盈', '自律', '清爽', '活力', '自然', '不将就'],
    sceneTags: ['午后摸鱼', '独处时光', '运动前后', '工作日'],
    sensory: ['清爽', '清新', '绵软'],
    functionTags: ['轻食', '单人餐'],
    identityTags: ['不将就', '独立', '会留白'],
    metaphors: ['碗里码齐的绿', '酱汁淋下的亮', '练后那口干净的充', '身体变轻的预感'],
    angles: ['吃进去的，身体都记着。', '轻一点，也是对自己好。'],
    bodyTemplates: [
      `{name}端上来颜色就让人安心，{attr}蔬菜脆、蛋白嫩，{metaphor}般的{realm}吃完一身轻——{angle}`,
      `健身后来份{name}，{attr}干净的热量补进去，像{metaphor}，{realm}得恢复得快。`,
      `{name}的妙在"不负担"，{attr}吃饱也不 guilty，像{metaphor}，{realm}得坦然。`,
      `工作日午餐选{name}，{attr}下午不犯困，{metaphor}似的{realm}，{angle}效率都高了。`,
      `想好好吃饭又不想将就，{name}刚好——{attr}像{metaphor}，{realm}得有分寸。`,
    ],
    closers: ['趁鲜，清爽吃。', '这一碗，轻盈。'],
  },
}

const 粥汤: LexiconEntry = {
  keywords: ['粥', '小米粥', '皮蛋瘦肉粥', '汤', '煲汤', '炖汤', '鸡汤', '排骨汤', '羹'],
  profile: {
    moodTags: ['温养', '熨帖', '治愈', '慢生活', '松弛', '本真'],
    sceneTags: ['独处时光', '冬日', '病后', '深夜加班'],
    sensory: ['温热', '绵软', '醇厚'],
    functionTags: ['正餐', '单人餐'],
    identityTags: ['温柔', '懂生活', '会留白'],
    metaphors: ['砂锅里咕嘟的暖', '粥面浮起的油星', '病中那碗熨帖', '慢火熬出的稠'],
    angles: ['一碗热汤下肚，什么都好说。', '慢熬的，才养人。'],
    bodyTemplates: [
      `{name}盛上来还冒着热气，{attr}一口下去从喉咙暖到胃，{metaphor}般的{realm}把寒意轻轻挡下——{angle}`,
      `不舒服的时候很想{name}，{attr}温润不刺激，像{metaphor}，{realm}得人被妥帖照料。`,
      `{name}是时间熬出来的，{attr}火候到了味才厚，像{metaphor}，{realm}得耐得住等。`,
      `深夜回家一碗{name}，{attr}白天的累被热气熏软了，{metaphor}似的{realm}，{angle}睡得着了。`,
      `奶奶辈的{name}很讲究，{attr}料足火慢，像{metaphor}，{realm}得是记忆里的味道。`,
    ],
    closers: ['趁热，慢慢喝。', '这一碗，养人。'],
  },
}

const 小龙虾: LexiconEntry = {
  keywords: ['小龙虾', '麻辣虾', '油焖虾', '蒜蓉虾', '虾球'],
  profile: {
    moodTags: ['酣畅', '热络', '释放', '快乐', '烟火', '松弛'],
    sceneTags: ['朋友小聚', '夏日', '节日庆祝', '深夜加班'],
    sensory: ['馥郁', '温热', '酥脆'],
    functionTags: ['正餐'],
    identityTags: ['不将就', '自由', '分享'],
    metaphors: ['红亮一盆的喧', '剥壳时溅出的油', '夏夜撸虾的爽', '啤酒碰盆的响'],
    angles: ['双手油腻，才叫夏天。', '一盆虾，几句掏心话。'],
    bodyTemplates: [
      `{name}端上来红亮亮一盆，{attr}蒜香或麻辣先勾人，{metaphor}般的{realm}让人顾不上说话——{angle}`,
      `夏夜和朋友剥{name}，{attr}手指忙着、嘴也没闲，像{metaphor}，{realm}得畅快。`,
      `{name}的爽在"动手"，{attr}剥壳嗦指才够味，像{metaphor}，{realm}得人放松。`,
      `看球配{name}很带劲，{attr}进球举杯、剥虾碰杯，{metaphor}似的{realm}，{angle}深夜也热闹。`,
      `加班后犒赏自己一盆{name}，{attr}辣得鼻尖冒汗，像{metaphor}，{realm}把累都冲掉了。`,
    ],
    closers: ['趁热，痛快剥。', '这一盆，够味。'],
  },
}

const 鲜花: LexiconEntry = {
  keywords: ['鲜花', '花束', '玫瑰', '百合', '向日葵', '康乃馨', '花盒', '鲜切花'],
  profile: {
    moodTags: ['温柔', '浪漫', '治愈', '小确幸', '鲜活', '仪式感'],
    sceneTags: ['约会', '节日庆祝', '独处时光', '探病', '表白'],
    sensory: ['清新', '鲜活'],
    identityTags: ['浪漫', '温柔', '懂生活'],
    metaphors: ['拆开包装那刻的亮', '花瓣上未干的露', '替你开口的色', '桌角那抹不说话的暖'],
    angles: ['有些话，花替你说。', '一束鲜的，把日子也点亮了。'],
    bodyTemplates: [
      `{name}抱回来还带着凉凉的鲜气，{attr}花瓣一层层舒，{metaphor}般的{realm}先把屋子暖了——{angle}`,
      `探病带束{name}，{attr}不重却很见心意，像{metaphor}，{realm}得人心里一软。`,
      `纪念日少不了{name}，{attr}拆包装的瞬间比礼物还甜，像{metaphor}，{realm}得浪漫。`,
      `一个人也值得买束{name}放桌上，{attr}每天回家看见那抹色，{metaphor}般的{realm}，{angle}`,
      `挑{name}像挑心情，{attr}红的热烈白的素净，像{metaphor}，{realm}各有各的好。`,
    ],
    closers: ['趁鲜，养着看。', '这一束，温柔。'],
  },
}

const 茶叶礼盒: LexiconEntry = {
  keywords: ['茶礼盒', '茶叶礼盒', '茶叶', '茶礼', '送礼茶'],
  profile: {
    moodTags: ['雅致', '体面', '温养', '慢生活', '陈香', '回甘'],
    sceneTags: ['节日庆祝', '送礼', '朋友小聚', '独处时光'],
    sensory: ['馥郁', '醇厚', '清新'],
    identityTags: ['有品味', '懂生活', '体面'],
    metaphors: ['盒里收着的山场', '拆封时浮起的香', '送出去的那份敬', '慢泡才见的底韵'],
    angles: ['送茶，送的是体面与心意。', '好茶自己会说话。'],
    bodyTemplates: [
      `{name}拆开就闻见陈香，{attr}一饼一罐都讲究，{metaphor}般的{realm}先赢了面子——{angle}`,
      `过节送{name}很稳妥，{attr}不张扬却见品味，像{metaphor}，{realm}得妥帖。`,
      `自己藏一盒{name}，{attr}慢泡慢喝，{metaphor}似的{realm}，{angle}时间是它的盟友。`,
      `懂茶的人收{name}很懂珍惜，{attr}每一泡都舍不得浪费，像{metaphor}，{realm}得耐品。`,
      `办公室摆盒{name}，{attr}待客自饮都体面，{metaphor}般的{realm}，{angle}`,
    ],
    closers: ['趁香，慢泡。', '这一盒，体面。'],
  },
}

const 咖啡豆: LexiconEntry = {
  keywords: ['咖啡豆', '咖啡粉', '单品豆', '拼配豆', '精品豆', '手冲豆'],
  profile: {
    moodTags: ['醇香', '醒神', '匠心', '独处', '仪式感', '回血'],
    sceneTags: ['清晨', '独处时光', '午后摸鱼', '居家'],
    sensory: ['馥郁', '醇厚', '微苦'],
    functionTags: ['咖啡馆', '热饮'],
    identityTags: ['有品味', '独立', '懂生活'],
    metaphors: ['封口撕开那股冲', '豆子裂开的香', '现磨才醒的魂', '晨里第一阵醒'],
    angles: ['自己磨的，才叫咖啡。', '豆子的脾气，只有手懂。'],
    bodyTemplates: [
      `{name}封口一撕，{attr}烘香先窜出来，{metaphor}般的{realm}把瞌睡赶跑——{angle}`,
      `手冲前现磨{name}，{attr}粉层在滤杯里慢慢胀，像{metaphor}，{realm}得人静下来。`,
      `囤几袋{name}在家，{attr}想喝就磨，{metaphor}似的{realm}，{angle}自由得刚刚好。`,
      `懂豆的人挑{name}看产地烘焙度，{attr}风味全写在标签上，像{metaphor}，{realm}得专业。`,
      `清晨第一杯用{name}，{attr}醇苦回甘把人唤醒，{metaphor}般的{realm}，一天有了开头。`,
    ],
    closers: ['趁鲜，现磨喝。', '这一袋，回血。'],
  },
}

const 寿司: LexiconEntry = {
  keywords: ['寿司', '刺身', '日料', '寿司卷', '手卷', '生鱼'],
  profile: {
    moodTags: ['鲜净', '雅致', '克制', '仪式感', '鲜活', '清爽'],
    sceneTags: ['约会', '朋友小聚', '独处时光', '精致一人食'],
    sensory: ['清爽', '鲜甜', '绵软'],
    functionTags: ['正餐'],
    identityTags: ['有品味', '精致', '懂生活'],
    metaphors: ['醋饭上卧着的鲜', '一筷提起的净', '吧台前那道默契', '海气里收回的甜'],
    angles: ['鲜，是不必多说的奢侈。', '一口，刚好见功夫。'],
    bodyTemplates: [
      `{name}端上来食材还透着海气，{attr}醋饭的微酸托住鲜，{metaphor}般的{realm}先稳了胃口——{angle}`,
      `约人来吃{name}，{attr}一碟一筷都讲究，像{metaphor}，{realm}得精致。`,
      `{name}的妙在"鲜净"，{attr}不靠重味掩盖，{metaphor}似的{realm}，{angle}克制才见真章。`,
      `一个人也想吃顿好的，{name}很合适，{attr}份量刚好不浪费，{metaphor}般的{realm}，{angle}`,
      `懂行的吃{name}先品原味，{attr}蘸料只点一点，像{metaphor}，{realm}得尊重食材。`,
    ],
    closers: ['趁鲜，浅蘸吃。', '这一碟，鲜净。'],
  },
}

const 麻辣香锅: LexiconEntry = {
  keywords: ['麻辣香锅', '香锅', '干锅', '麻辣干锅'],
  profile: {
    moodTags: ['酣畅', '热络', '释放', '烟火', '快乐', '松弛'],
    sceneTags: ['朋友小聚', '下班路上', '深夜加班', '冬日'],
    sensory: ['馥郁', '温热', '酥脆'],
    functionTags: ['正餐'],
    identityTags: ['不将就', '自由', '独立'],
    metaphors: ['自选台前挑花的眼', '红油里捞起的百样', '一锅端平的爽', '辣得鼻尖冒汗的畅'],
    angles: ['想吃什么自己选，很自由的一锅。', '辣过才知放松。'],
    bodyTemplates: [
      `{name}是自己挑出来的专属味道，{attr}荤素一锅炒，{metaphor}般的{realm}连挑食的人都能满足——{angle}`,
      `加班晚了来份{name}，{attr}热辣一吃浑身舒坦，{metaphor}似的{realm}，{angle}今晚的累被烫平了。`,
      `{name}的辣是上瘾的，{attr}越吃越想加麻加辣，像{metaphor}，{realm}得人停不下筷。`,
      `和朋友点{name}，{attr}你一筷我一筷，{metaphor}般的{realm}，{angle}热闹得刚好。`,
      `一个人不想做饭就点{name}，{attr}一锅顶一顿，{metaphor}似的{realm}，省事又不凑合。`,
    ],
    closers: ['趁热，痛快吃。', '这一锅，管够。'],
  },
}

const 中式早餐: LexiconEntry = {
  keywords: ['豆浆', '油条', '包子', '煎饼', '早饭', '早餐', '肠粉', '烧麦', '小笼'],
  profile: {
    moodTags: ['熨帖', '晨光', '小确幸', '治愈', '本真', '松弛'],
    sceneTags: ['清晨', '周末一人食', '独处时光', '工作日'],
    sensory: ['温热', '绵软', '酥脆'],
    functionTags: ['正餐', '单人餐'],
    identityTags: ['慢生活', '会留白', '温柔'],
    metaphors: ['晨里第一口热', '油锅边升起的香', '老街拐角的暖', '烫嘴也舍不得放的那口'],
    angles: ['一天的踏实，从早餐开始。', '很朴素的热，很养人。'],
    bodyTemplates: [
      `{name}还烫手就捧到了，{attr}热气糊了半边眼镜，{metaphor}般的{realm}先把晨里的凉赶跑——{angle}`,
      `赶上班顺路买份{name}，{attr}一口下肚浑身醒透，像{metaphor}，{realm}得人有了开头。`,
      `{name}的好在朴实，{attr}不靠花哨，{metaphor}似的{realm}，越嚼越见粮食本味。`,
      `周末睡到自然醒，{name}还温在桌上，{attr}这一刻的慢，像{metaphor}，{realm}。`,
      `老城的{name}很讲火候，{attr}现炸现蒸，{metaphor}般的{realm}，{angle}是记忆里的味道。`,
    ],
    closers: ['趁热，慢慢吃。', '这一口，熨帖。'],
  },
}

const 月饼糕点: LexiconEntry = {
  keywords: ['月饼', '糕点', '中式点心', '桃酥', '绿豆糕', '蛋黄酥', '麻薯', '桂花糕'],
  profile: {
    moodTags: ['酥香', '怀旧', '小确幸', '体面', '甜慰', '治愈'],
    sceneTags: ['节日庆祝', '送礼', '朋友小聚', '下午茶'],
    sensory: ['酥脆', '绵软', '清甜'],
    functionTags: ['甜品', '烘焙甜品'],
    identityTags: ['温柔', '懂生活', '体面'],
    metaphors: ['酥皮裂开的响', '馅里藏着的甜', '礼盒里收着的念', '茶边那块圆的暖'],
    angles: ['一口酥，想起旧时光。', '送礼体面，自吃熨帖。'],
    bodyTemplates: [
      `{name}一刀切下去酥皮簌簌掉，{attr}馅料的香缓缓溢出来，{metaphor}般的{realm}先把眼睛喂饱——{angle}`,
      `中秋少不了{name}，{attr}分着吃才叫团圆，像{metaphor}，{realm}得人心里软。`,
      `{name}的妙在"酥"，{attr}一层层咬开的香，像{metaphor}，{realm}得耐品。`,
      `配壶茶吃{name}，{attr}甜咸刚好解腻，{metaphor}似的{realm}，{angle}下午茶有了魂。`,
      `送礼提盒{name}，{attr}不张扬却见心思，像{metaphor}，{realm}得体面。`,
    ],
    closers: ['趁酥，配茶尝。', '这一块，怀旧。'],
  },
}

const 巧克力: LexiconEntry = {
  keywords: ['巧克力', '黑巧', '生巧', '可可', '榛果巧'],
  profile: {
    moodTags: ['甜宠', '微苦', '治愈', '小确幸', '浪漫', '仪式感'],
    sceneTags: ['约会', '节日庆祝', '独处时光', '下午茶'],
    sensory: ['丝滑', '醇厚', '微苦'],
    functionTags: ['甜品'],
    identityTags: ['自我取悦', '精致', '温柔'],
    metaphors: ['舌尖化开的丝', '掰开露出的芯', '苦后浮起的甜', '包装里藏的小奢侈'],
    angles: ['苦一点，甜才更懂。', '自己值得一块好的。'],
    bodyTemplates: [
      `{name}在舌尖慢慢化开，{attr}先苦后甜的那层转，{metaphor}般的{realm}先把心哄好——{angle}`,
      `难过时掰一块{name}给自己，{attr}可可的醇把情绪裹软，像{metaphor}，{realm}得人松了弦。`,
      `黑{name}的妙在回甘，{attr}不齁的甜才高级，像{metaphor}，{realm}得耐品。`,
      `约会分食{name}，{attr}你一口我一勺，{metaphor}似的{realm}，{angle}甜也分着更甜。`,
      `下午茶配{name}，{attr}丝滑顺喉，{metaphor}般的{realm}，{angle}疲惫被化开了。`,
    ],
    closers: ['趁醇，小口尝。', '这一块，甜宠。'],
  },
}

const 饼干零食: LexiconEntry = {
  keywords: ['饼干', '薯片', '零食', '曲奇', '膨化', '海苔', '干脆面'],
  profile: {
    moodTags: ['酥脆', '小确幸', '松弛', '治愈', '满足'],
    sceneTags: ['追剧', '独处时光', '午后摸鱼', '朋友小聚'],
    sensory: ['酥脆', '馥郁', '清爽'],
    functionTags: ['甜品'],
    identityTags: ['自我取悦', '可爱', '自由'],
    metaphors: ['齿间炸开的脆', '撕开包装的响', '追剧时手边的闲', '一口就停不下的轻'],
    angles: ['一口脆，今天就没白过。', '零嘴的快乐，很简单。'],
    bodyTemplates: [
      `{name}撕开就闻到焙香，{attr}第一口咔嚓脆，{metaphor}般的{realm}让人停不下手——{angle}`,
      `追剧抓一袋{name}，{attr}咔嚓咔嚓的节奏，像{metaphor}，{realm}得整个人都松了。`,
      `{name}的妙在"随手"，{attr}不必正襟危坐，{metaphor}似的{realm}，{angle}惬意得刚好。`,
      `下午饿了垫几片{name}，{attr}顶饱又不腻，{metaphor}般的{realm}，比正餐轻松。`,
      `和朋友share{name}，{attr}你一片我一袋，{metaphor}般的{realm}，{angle}快乐就这么简单。`,
    ],
    closers: ['趁脆，慢慢嚼。', '这一袋，酥香。'],
  },
}

const 冰淇淋: LexiconEntry = {
  keywords: ['冰淇淋', '雪糕', '冰棒', '甜筒', '冰品'],
  profile: {
    moodTags: ['冰凉', '小确幸', '鲜活', '快乐', '治愈', '松弛'],
    sceneTags: ['夏日', '朋友小聚', '独处时光', '下班路上'],
    sensory: ['冰凉', '清甜', '丝滑'],
    functionTags: ['甜品'],
    identityTags: ['自我取悦', '可爱', '自由'],
    metaphors: ['舌尖化开的凉', '甜筒上化开的边', '夏午第一口透', '咬下溅起的甜'],
    angles: ['一口凉，暑气先退。', '甜的东西，很懂安慰人。'],
    bodyTemplates: [
      `{name}刚拿就化出一圈水痕，{attr}第一口凉意直抵天灵盖，{metaphor}般的{realm}把燥热都压下去——{angle}`,
      `夏天离不开{name}，{attr}冰凉从喉头漫开，像{metaphor}，{realm}得人清清爽爽。`,
      `{name}要快吃，{attr}慢一拍就化在手心，{metaphor}似的{realm}，{angle}急也急得可爱。`,
      `和朋友各拿一支{name}，{attr}你一口我一口，{metaphor}般的{realm}，{angle}快乐就这么简单。`,
      `一个人也想宠自己，买支{name}，{attr}甜凉在嘴里化开，像{metaphor}，{realm}。`,
    ],
    closers: ['趁凉，快快吃。', '这一支，鲜活。'],
  },
}

// =====================
// 补充词条（高频未覆盖品类，扩大专属命中、降低类目兜底雷同）
// =====================

const 牛奶酸奶: LexiconEntry = {
  keywords: ['牛奶', '酸奶', '鲜奶', '纯牛奶', '酸牛奶', '发酵乳', '乳酸菌', '优酸乳', '养乐多', '鲜酪'],
  profile: {
    moodTags: ['温润', '本真', '纯净', '治愈', '小确幸', '松弛'],
    sceneTags: ['清晨', '独处时光', '周末一人食', '运动后'],
    sensory: ['醇厚', '丝滑', '清甜'],
    functionTags: ['乳制品'],
    identityTags: ['自然', '温柔', '会留白'],
    metaphors: ['晨里第一口白', '杯壁挂着的浓', '冰箱里那瓶安心', '麦片沉浮的暖'],
    angles: ['简单一杯，把一天轻轻开头。', '温润的，很养人。'],
    bodyTemplates: [
      `{name}倒进杯里，{attr}纯白的稠润先稳了胃口，{metaphor}般的{realm}从喉头暖到心底——{angle}`,
      `清晨一杯{name}，{attr}配面包或空口都好，像{metaphor}，{realm}得一天有了开头。`,
      `运动后喝{name}补一补，{attr}蛋白和钙跟着温润下去，{metaphor}般的{realm}，恢复得快些。`,
      `孩子长身体离不开{name}，{attr}天然营养不花哨，像{metaphor}，{realm}得放心。`,
      `睡前一杯温{name}，{attr}胃里先暖起来，{metaphor}似的{realm}，{angle}夜也稳了。`,
    ],
    closers: ['趁鲜，温温喝。', '这一杯，本真。'],
  },
}

const 速食粉面: LexiconEntry = {
  keywords: ['螺蛳粉', '米线', '酸辣粉', '泡面', '方便面', '拉面', '米粉', '河粉', '土豆粉', '粉丝', '凉皮', '拌粉'],
  profile: {
    moodTags: ['酣畅', '热络', '小确幸', '松弛', '释放', '满足'],
    sceneTags: ['深夜加班', '独处时光', '周末一人食', '下班路上'],
    sensory: ['温热', '馥郁', '清爽'],
    functionTags: ['正餐', '单人餐'],
    identityTags: ['自由', '独立', '不将就'],
    metaphors: ['深夜食堂的那碗暖', '红油里捞起的劲', '一口就醒的味', '一个人也热气腾腾'],
    angles: ['想吃什么自己煮，很自由的一餐。', '一碗热汤面，什么都好说。'],
    bodyTemplates: [
      `{name}端上来还冒着热气，{attr}嗦一口汤底，{metaphor}般的{realm}把疲惫先冲开——{angle}`,
      `深夜饿了煮碗{name}，{attr}热辣滚烫下肚，像{metaphor}，{realm}得人活过来了。`,
      `一个人不想做饭就点{name}，{attr}一碗顶一顿，{metaphor}般的{realm}，省事又不凑合。`,
      `{name}的妙在够味，{attr}酸辣咸香全齐，像{metaphor}，{realm}得人停不下筷。`,
      `加班到很晚，一盒{name}是给自己的犒赏。{attr}{metaphor}，{realm}——明天的事明天再说。`,
    ],
    closers: ['趁热，痛快吃。', '这一碗，管够。'],
  },
}

const 西式快餐: LexiconEntry = {
  keywords: ['汉堡', '炸鸡', '披萨', '薯条', '热狗', '三明治', '汉堡包', '炸鸡桶', '芝士条'],
  profile: {
    moodTags: ['畅快', '小确幸', '释放', '快乐', '松弛', '满足'],
    sceneTags: ['朋友小聚', '午后摸鱼', '周末一人食', '下班路上'],
    sensory: ['酥脆', '馥郁', '温热'],
    functionTags: ['正餐'],
    identityTags: ['自由', '可爱', '不将就'],
    metaphors: ['咬下那声脆', '芝士拉起的丝', '薯条蘸酱的欢', '一人食也热闹'],
    angles: ['偶尔放肆，是对自己的奖励。', '快乐有时候很简单。'],
    bodyTemplates: [
      `{name}端上来还烫手，{attr}第一口酥脆爆汁，{metaphor}般的{realm}先把拘谨烤化了——{angle}`,
      `周末懒得做饭点份{name}，{attr}边看剧边啃，像{metaphor}，{realm}得人放松下来。`,
      `和朋友share一盒{name}，{attr}你一块我一根，{metaphor}般的{realm}，{angle}快乐就这么简单。`,
      `{name}的治愈在于"管饱又管爽"，{attr}碳水带来的快乐很直接，像{metaphor}，{realm}。`,
      `一个人也想宠自己，买份{name}，{attr}香脆在嘴里炸开，像{metaphor}，{realm}。`,
    ],
    closers: ['趁热，痛快吃。', '这一份，畅快。'],
  },
}

const 海鲜水产: LexiconEntry = {
  keywords: ['海鲜', '生蚝', '扇贝', '鲍鱼', '花蛤', '蛤蜊', '大虾', '鲜虾', '螃蟹', '鱼丸', '鱼片', '鱿鱼', '虾仁'],
  profile: {
    moodTags: ['鲜净', '鲜活', '雅致', '小确幸', '治愈', '满足'],
    sceneTags: ['朋友小聚', '节日庆祝', '独处时光', '精致一人食'],
    sensory: ['鲜甜', '清爽', '绵软'],
    functionTags: ['正餐'],
    identityTags: ['有品味', '懂生活', '精致'],
    metaphors: ['刚离水的鲜', '壳里藏着的甜', '蒸汽里浮起的润', '海气里收回的净'],
    angles: ['鲜，是不必多说的奢侈。', '一口，刚好见功夫。'],
    bodyTemplates: [
      `{name}还透着海气，{attr}原味的鲜先稳了胃口，{metaphor}般的{realm}从舌尖漫开——{angle}`,
      `活鲜现做的{name}，{attr}肉质弹嫩不腥，像{metaphor}，{realm}得人吃得仔细。`,
      `朋友聚会点{name}很体面，{attr}摆盘一上桌就有宴席感，{metaphor}似的{realm}，{angle}。`,
      `{name}的鲜在于"本味"，{attr}不靠重料掩盖，像{metaphor}，{realm}得尊重食材。`,
      `一个人想吃得讲究点，{name}很合适，{attr}份量刚好不浪费，{metaphor}般的{realm}，{angle}`,
    ],
    closers: ['趁鲜，浅蘸吃。', '这一盘，鲜净。'],
  },
}

const 豆制品: LexiconEntry = {
  keywords: ['豆腐', '豆干', '腐竹', '千张', '素鸡', '豆皮', '内酯豆腐', '豆笋', '香干'],
  profile: {
    moodTags: ['温润', '本真', '清爽', '小确幸', '治愈', '纯净'],
    sceneTags: ['独处时光', '午后摸鱼', '周末一人食', '冬日'],
    sensory: ['绵软', '清爽', '温热'],
    functionTags: ['正餐', '素食'],
    identityTags: ['自然', '会留白', '温柔'],
    metaphors: ['白嫩的一方软', '卤汁里吸饱的味', '一口化开的净', '素净碗里的暖'],
    angles: ['素一点，也是好好吃饭。', '本味的，很养人。'],
    bodyTemplates: [
      `{name}还冒着灶上的热，{attr}一口嫩滑下肚，{metaphor}般的{realm}先从胃里暖开——{angle}`,
      `家常一锅{name}，{attr}吸饱了汤汁最入味，像{metaphor}，{realm}得人踏实。`,
      `素食日来份{name}，{attr}清爽不腻负担小，像{metaphor}，{realm}得刚刚好。`,
      `{name}的妙在"百搭"，{attr}凉拌热炒都行，{metaphor}似的{realm}，{angle}怎么烧都好吃。`,
      `夜宵不想太重，{name}配碗白粥，{attr}温润落胃，像{metaphor}，{realm}。`,
    ],
    closers: ['趁热，慢慢吃。', '这一味，温润。'],
  },
}

const 养生冲调: LexiconEntry = {
  keywords: ['蜂蜜', '燕麦', '黑芝麻', '红枣', '枸杞', '桂圆', '藕粉', '芝麻糊', '代餐粉', '麦片', '核桃粉', '奇亚籽'],
  profile: {
    moodTags: ['温养', '自然', '本真', '小确幸', '治愈', '松弛'],
    sceneTags: ['清晨', '独处时光', '冬日', '运动后'],
    sensory: ['醇厚', '清甜', '绵软'],
    functionTags: ['冲调', '养生'],
    identityTags: ['会留白', '自然', '懂生活'],
    metaphors: ['晨起第一勺暖', '杯里化开的稠', '慢养出来的润', '给自己的一段留白'],
    angles: ['温润一点，也是对自己好。', '慢慢养，身体记着。'],
    bodyTemplates: [
      `{name}冲开还冒着热气，{attr}一口温润下肚，{metaphor}般的{realm}从喉头暖到胃——{angle}`,
      `清晨一杯{name}，{attr}比咖啡温和，像{metaphor}，{realm}得一天有了安稳的开头。`,
      `午后饿了来杯{name}垫一垫，{attr}顶饱又不腻，{metaphor}般的{realm}，比零食踏实。`,
      `{name}的妙在"养"，{attr}不急不躁慢慢来，像{metaphor}，{realm}得耐品。`,
      `换季时煮一壶{name}，{attr}温温地喝下去，{metaphor}似的{realm}，{angle}`,
    ],
    closers: ['趁温，慢慢饮。', '这一杯，温养。'],
  },
}

const 白酒洋酒: LexiconEntry = {
  keywords: ['白酒', '威士忌', '洋酒', '伏特加', '白兰地', '清酒', '烧酒', '龙舌兰', '朗姆'],
  profile: {
    moodTags: ['微醺', '优雅', '慢生活', '仪式感', '松弛', '浪漫'],
    sceneTags: ['朋友小聚', '节日庆祝', '独处时光', '商务'],
    sensory: ['醇厚', '馥郁', '丝滑'],
    functionTags: ['酒水'],
    identityTags: ['有品味', '精致', '体面'],
    metaphors: ['杯中晃着的琥珀', '醒酒器里舒开的香', '单宁收住的尾', '独处时那圈光晕'],
    angles: ['慢一点，酒才肯说话。', '重要的时刻，该有杯酒。'],
    bodyTemplates: [
      `{name}在杯里转着圈，{attr}醇香先替气氛开口，{metaphor}般的{realm}把节奏拉慢——{angle}`,
      `老友重逢开瓶{name}，{attr}杯子一碰往事就回来了，像{metaphor}，{realm}得尽兴。`,
      `独自小酌{name}，{attr}不赶时间，{metaphor}似的{realm}，{angle}和自己待一会儿也很好。`,
      `节日宴客上{name}，{attr}体面又见品味，像{metaphor}，{realm}得妥帖。`,
      `好{name}要慢品，{attr}急不得——像有些事，等一等才见真味，{metaphor}，{realm}。`,
    ],
    closers: ['小口，慢饮。', '这一杯，敬此刻。'],
  },
}

const 功能饮料: LexiconEntry = {
  keywords: ['红牛', '能量饮料', '运动饮料', '功能饮料', '电解质水', '维生素饮料', '脉动', '东鹏', '魔爪'],
  profile: {
    moodTags: ['醒神', '活力', '回血', '释放', '畅快', '满足'],
    sceneTags: ['运动后', '深夜加班', '出差途中', '工作日'],
    sensory: ['清爽', '冰凉', '馥郁'],
    functionTags: ['饮料'],
    identityTags: ['独立', '不将就', '自由'],
    metaphors: ['一口下去的清醒', '瓶身凝着的水珠', '运动后那阵回血', '赶路时提神的亮'],
    angles: ['一口下去，人就在线了。', '续航，也是一种照顾自己。'],
    bodyTemplates: [
      `{name}拧开就灌一口，{attr}冰凉的气泡先替你把困意赶跑，{metaphor}般的{realm}直冲天灵盖——{angle}`,
      `运动后补一瓶{name}，{attr}电解质跟着水分一起回，像{metaphor}，{realm}得恢复得快。`,
      `熬夜赶工靠{name}续命，{attr}那点甜之后人又清醒了，{metaphor}似的{realm}，撑到收工。`,
      `长途开车备一瓶{name}，{attr}困意上来抿一口，像{metaphor}，{realm}得人稳了。`,
      `午后三点靠{name}提神，{attr}不靠咖啡也行，{metaphor}般的{realm}，{angle}`,
    ],
    closers: ['趁冰，快快喝。', '这一瓶，回血。'],
  },
}

const 便当简餐: LexiconEntry = {
  keywords: ['便当', '饭团', '盒饭', '工作餐', '简餐', '快餐'],
  profile: {
    moodTags: ['熨帖', '小确幸', '本真', '治愈', '松弛', '满足'],
    sceneTags: ['工作日', '独处时光', '午后摸鱼', '周末一人食'],
    sensory: ['温热', '绵软', '酥脆'],
    functionTags: ['正餐', '单人餐'],
    identityTags: ['会留白', '温柔', '独立'],
    metaphors: ['午间那盒踏实', '打开盖子的暖', '一人食的妥帖', '米饭上码的整齐'],
    angles: ['好好吃饭，是基本的照顾自己。', '一份热乎的，抵过将就。'],
    bodyTemplates: [
      `{name}一打开还冒着饭香，{attr}热乎一口下肚，{metaphor}般的{realm}先把午后的累抚平——{angle}`,
      `工作日带份{name}，{attr}比外卖准时又干净，像{metaphor}，{realm}得人安心。`,
      `一个人吃{name}也很完整，{attr}荤素都齐不凑合，{metaphor}似的{realm}，{angle}`,
      `{name}的妙在"刚好"，{attr}量不多不少管饱，像{metaphor}，{realm}得踏实。`,
      `加完班热一份{name}，{attr}坐下来慢慢吃，{metaphor}般的{realm}，{angle}今晚的疲惫被烫平了。`,
    ],
    closers: ['趁热，好好吃。', '这一盒，熨帖。'],
  },
}

const 辣味零食: LexiconEntry = {
  keywords: ['辣条', '魔芋爽', '鸭脖', '卤味零食', '麻辣零食', '泡椒', '素毛肚', '辣片'],
  profile: {
    moodTags: ['酣畅', '小确幸', '释放', '松弛', '满足', '快乐'],
    sceneTags: ['追剧', '独处时光', '朋友小聚', '午后摸鱼'],
    sensory: ['酥脆', '馥郁', '清爽'],
    functionTags: ['零食'],
    identityTags: ['自由', '可爱', '不将就'],
    metaphors: ['齿间炸开的辣', '撕开包装的响', '追剧时手边的闲', '一口就停不下的劲'],
    angles: ['一口辣，今天就没白过。', '零嘴的快乐，很简单。'],
    bodyTemplates: [
      `{name}撕开就闻到那股辛香，{attr}第一口辣得人一激灵，{metaphor}般的{realm}让人停不下手——{angle}`,
      `追剧抓一袋{name}，{attr}辣得吸溜吸溜，像{metaphor}，{realm}得整个人都松了。`,
      `{name}的爽在"上头"，{attr}越吃越想再来一口，像{metaphor}，{realm}得人停不下。`,
      `下午馋了垫几根{name}，{attr}辣意一冲困意没了，{metaphor}般的{realm}，比饼干带劲。`,
      `和朋友share{name}，{attr}你一根我一根，{metaphor}般的{realm}，{angle}快乐就这么简单。`,
    ],
    closers: ['趁辣，慢慢嚼。', '这一袋，够味。'],
  },
}

// =====================
// 词库主表（具体品类在前，通用/长关键词优先）
// =====================
export const PRODUCT_EMOTION_LEXICON: LexiconEntry[] = [
  红茶, 绿茶, 普洱, 乌龙茶, 咖啡, 奶茶, 果茶, 水, 果汁,
  烧烤, 火锅, 麻辣烫, 小龙虾, 蛋糕, 面包, 甜品, 啤酒, 红酒,
  水果, 坚果, 轻食沙拉, 粥汤,
  鲜花, 茶叶礼盒, 咖啡豆, 寿司, 麻辣香锅, 中式早餐,
  月饼糕点, 巧克力, 饼干零食, 冰淇淋,
  牛奶酸奶, 速食粉面, 西式快餐, 海鲜水产, 豆制品,
  养生冲调, 白酒洋酒, 功能饮料, 便当简餐, 辣味零食,
]

/**
 * 根据商品名/描述解析出「商品级情绪词库」条目。
 * 匹配策略：扫描每条目的关键词，取「命中最长关键词」的条目（具体品类优先于泛化）。
 * 例：「正山小种红茶」→ 命中 红茶（"红茶"），而非「饮品」泛化。
 * 未命中返回 null，由调用方回退品类级策略。
 */
export function resolveProductEmotionLexicon(
  name?: string | null,
  description?: string | null,
): ProductEmotionProfile | null {
  const text = `${name || ''} ${description || ''}`
  if (!text.trim()) return null
  let best: { entry: LexiconEntry; kwLen: number } | null = null
  for (const entry of PRODUCT_EMOTION_LEXICON) {
    for (const kw of entry.keywords) {
      if (kw && text.includes(kw)) {
        if (!best || kw.length > best.kwLen) {
          best = { entry, kwLen: kw.length }
        }
        break // 该条目已命中，跳到下一个条目
      }
    }
  }
  return best ? best.entry.profile : null
}
