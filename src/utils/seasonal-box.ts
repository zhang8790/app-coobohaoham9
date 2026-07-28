/**
 * 节气食盒数据模块
 * 节气时间表：2026年（农历丙午年）
 * 每个节气含：日期区间、食养原则、推荐性味、禁忌、应季食材、食盒商品推荐逻辑
 */

export interface SeasonalTerm {
  key: string
  name: string          // 节气名
  pinyin: string        // 拼音
  startDate: string     // 开始日期（YYYY-MM-DD）
  endDate: string       // 结束日期（YYYY-MM-DD）
  nature: '温补' | '清热' | '平润' | '滋阴' | '健脾' | '润燥'  // 当前节气食养主方向
  natureDesc: string     // 性味说明（一句话）
  principle: string     // 食养原则（1-2句）
  recommendIngredients: string[]  // 推荐食材 key（对应 shiyang-dictionary）
  avoidIngredients: string[]     // 慎用食材 key
  weatherDesc: string    // 节气气候描述
  folkWisdom: string     // 民间谚语/食俗
  boxTheme: string       // 食盒主题文案
  boxCopy: string        // 食盒副标题
  emoji: string
  color: string          // 主题色（背景渐变起点）
  colorEnd: string       // 渐变终点
}

// 2026年24节气日期表（万年历标准）
export const SEASONAL_TERMS_2026: SeasonalTerm[] = [
  {
    key: 'xiaohan',
    name: '小寒',
    pinyin: 'Xiǎo Hán',
    startDate: '2026-01-05',
    endDate: '2026-01-19',
    nature: '温补',
    natureDesc: '寒气正盛，宜温补驱寒',
    principle: '小寒节气天地阴气极盛，人体阳气封藏，宜食温热以护脾胃，忌生冷寒凉伤阳气。',
    recommendIngredients: ['jiang', 'dasuan', 'yangrou', 'hetao', 'jirou', 'nangua', 'shanzha'],
    avoidIngredients: ['xiangjiao', 'lvdou', 'kugua', 'haidai'],
    weatherDesc: '天寒地冻，冷空气频繁南下，北方进入最冷时段',
    folkWisdom: '「小寒大寒，冷成冰团」——此时节最宜喝姜枣茶暖身',
    boxTheme: '暖冬驱寒食盒',
    boxCopy: '一盒温热，驱散深冬的寒气',
    emoji: '🫚',
    color: '#FFF7ED',
    colorEnd: '#FED7AA',
  },
  {
    key: 'dahan',
    name: '大寒',
    pinyin: 'Dà Hán',
    startDate: '2026-01-20',
    endDate: '2026-02-03',
    nature: '温补',
    natureDesc: '寒气至极，宜大补温阳',
    principle: '大寒是一年中最冷的时节，也是冬令进补的最后时机，宜温肾壮阳、温中健脾。',
    recommendIngredients: ['yangrou', 'jiang', 'guiyuan', 'hongzao', 'hetao', 'paigu', 'jirou'],
    avoidIngredients: ['xiangjiao', 'yinmi', 'lvdou'],
    weatherDesc: '寒潮频繁，部分地区可能出现极端低温',
    folkWisdom: '「大寒到顶点，日后天渐暖」——大寒之后阳气开始萌动',
    boxTheme: '大寒温阳食盒',
    boxCopy: '冬日最后的温补，给身体加满能量',
    emoji: '🔥',
    color: '#FEF2F2',
    colorEnd: '#FECACA',
  },
  {
    key: 'lichun',
    name: '立春',
    pinyin: 'Lì Chūn',
    startDate: '2026-02-04',
    endDate: '2026-02-18',
    nature: '平润',
    natureDesc: '阳气始发，宜清淡升发',
    principle: '立春天地阳气升发，人体肝气当令，宜辛甘发散之品以助阳气，不宜大温大补。',
    recommendIngredients: ['cong', 'dasuan', 'lianou', 'fanqie', 'bailuobo', 'doufu'],
    avoidIngredients: ['yangrou', 'hetao', 'jiang'],
    weatherDesc: '乍暖还寒，冷暖空气交替，气温波动大',
    folkWisdom: '「立春一日，水暖三分」——大地开始解冻，春意萌动',
    boxTheme: '立春升发食盒',
    boxCopy: '顺应春升之气，给身体开个好头',
    emoji: '🌱',
    color: '#F0FDF4',
    colorEnd: '#BBF7D0',
  },
  {
    key: 'yushui',
    name: '雨水',
    pinyin: 'Yǔ Shuǐ',
    startDate: '2026-02-19',
    endDate: '2026-03-05',
    nature: '健脾',
    natureDesc: '春雨绵绵，宜健脾祛湿',
    principle: '雨水时节降水增多，湿气渐重，脾喜燥恶湿，宜健脾祛湿，少食油腻生冷。',
    recommendIngredients: ['yinmi', 'bailuobo', 'lianou', 'doufu', 'nangua', 'chenpi'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang'],
    weatherDesc: '降雨增多，空气湿度大，南方进入"回南天"时段',
    folkWisdom: '「春雨贵如油」——降水对农业至关重要，人体也需适当补充水分',
    boxTheme: '健脾祛湿食盒',
    boxCopy: '排走湿气，让脾胃轻盈入春',
    emoji: '🌧️',
    color: '#F0F9FF',
    colorEnd: '#BAE6FD',
  },
  {
    key: 'jingzhe',
    name: '惊蛰',
    pinyin: 'Jīng Zhé',
    startDate: '2026-03-06',
    endDate: '2026-03-20',
    nature: '清热',
    natureDesc: '春雷惊醒，宜清肝润肺',
    principle: '惊蛰后万物复苏，肝气旺盛，易生内热，宜清肝火、润肺燥，忌辛辣刺激。',
    recommendIngredients: ['jinyinhua', 'lvdou', '梨', 'yinmi', 'fanqie', 'doufu'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'cong'],
    weatherDesc: '春雷始鸣，气温回升快，细菌病毒活跃，流感高发',
    folkWisdom: '「惊蛰过，暖和和，老牛老马卸铁索」——春耕开始',
    boxTheme: '清肝润燥食盒',
    boxCopy: '给身体做一次春日大扫除',
    emoji: '⚡',
    color: '#FDF4FF',
    colorEnd: '#E9D5FF',
  },
  {
    key: 'chunfen',
    name: '春分',
    pinyin: 'Chūn Fēn',
    startDate: '2026-03-21',
    endDate: '2026-04-04',
    nature: '平润',
    natureDesc: '昼夜平分，宜调和阴阳',
    principle: '春分昼夜等长，阴阳平衡，人体肝气旺盛，饮食宜平和，以平为期，忌大寒大热。',
    recommendIngredients: ['lianou', 'fanqie', 'bailuobo', 'baicai', 'doufu', 'bocai'],
    avoidIngredients: ['yangrou', 'jirou'],
    weatherDesc: '阳光明媚，春风和煦，桃花、杏花陆续开放',
    folkWisdom: '「春分到，蛋儿俏」——民间有竖蛋习俗',
    boxTheme: '平衡阴阳食盒',
    boxCopy: '不偏不倚，给身体一个平衡的起点',
    emoji: '🍃',
    color: '#F0FDF4',
    colorEnd: '#86EFAC',
  },
  {
    key: 'qingming',
    name: '清明',
    pinyin: 'Qīng Míng',
    startDate: '2026-04-05',
    endDate: '2026-04-19',
    nature: '平润',
    natureDesc: '天清气明，宜疏肝清心',
    principle: '清明时节春暖花开，肝气最盛，宜疏肝解郁、清心明目，忌动怒伤肝。',
    recommendIngredients: ['jinyinhua', 'lvdou', 'muer', 'guayua', 'qingmingcha'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang'],
    weatherDesc: '气温回升，天气晴朗，是踏青赏春的好时节',
    folkWisdom: '「清明时节雨纷纷」——此时节雨水增多，宜健脾祛湿',
    boxTheme: '明目清心食盒',
    boxCopy: '踏青路上，带上一份清爽',
    emoji: '🌸',
    color: '#FDF2F8',
    colorEnd: '#F9A8D4',
  },
  {
    key: ' guyu',
    name: '谷雨',
    pinyin: 'Gǔ Yǔ',
    startDate: '2026-04-20',
    endDate: '2026-05-05',
    nature: '健脾',
    natureDesc: '雨生百谷，宜健脾祛湿',
    principle: '谷雨是春季最后一个节气，降水充足，湿气最重，宜健脾祛湿、养肝护肝。',
    recommendIngredients: ['yinmi', 'lianou', 'muer', 'bailuobo', 'doufu', 'nangua'],
    avoidIngredients: ['yangrou', 'jirou'],
    weatherDesc: '降雨增多，谷物生长旺盛，南方进入汛期',
    folkWisdom: '「谷雨前后，种瓜点豆」——农忙时节',
    boxTheme: '健脾祛湿食盒',
    boxCopy: '谷雨一过，湿气加重，脾胃需要加护',
    emoji: '🌾',
    color: '#F0FDF4',
    colorEnd: '#D1FAE5',
  },
  {
    key: 'xiaoman',
    name: '小满',
    pinyin: 'Xiǎo Mǎn',
    startDate: '2026-05-21',
    endDate: '2026-06-05',
    nature: '清热',
    natureDesc: '小麦灌浆，宜清热祛湿',
    principle: '小满后天气渐热，湿气加重，人体阳气外散，脾胃偏虚，宜清热利湿、健脾和胃。',
    recommendIngredients: ['lvdou', 'yinmi', 'muer', 'fanqie', 'huanggua', 'donggua'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan'],
    weatherDesc: '气温明显升高，暑湿渐重，长江中下游进入"梅雨"前奏',
    folkWisdom: '「小满动三车」——水车、油车和丝车，三车忙动',
    boxTheme: '清热祛湿食盒',
    boxCopy: '小满不满，湿气趁虚而入',
    emoji: '🌾',
    color: '#F0FFF4',
    colorEnd: '#C6F6D5',
  },
  {
    key: 'mangzhong',
    name: '芒种',
    pinyin: 'Máng Zhòng',
    startDate: '2026-06-06',
    endDate: '2026-06-20',
    nature: '清热',
    natureDesc: '麦类成熟，宜清热解暑',
    principle: '芒种标志着仲夏开始，气温高、湿度大，宜清热解暑、生津止渴，忌大辛大热。',
    recommendIngredients: ['lvdou', 'yinmi', 'jinyinhua', 'muer', 'xiangjiao', 'donggua'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan'],
    weatherDesc: '天气炎热，长江中下游正式进入梅雨季',
    folkWisdom: '「时雨及芒种，四野皆插秧」——农忙双抢时节',
    boxTheme: '消暑生津食盒',
    boxCopy: '芒种忙种，身体也需要消消暑',
    emoji: '☀️',
    color: '#FFFBEB',
    colorEnd: '#FDE68A',
  },
  {
    key: 'xiazhi',
    name: '夏至',
    pinyin: 'Xià Zhì',
    startDate: '2026-06-21',
    endDate: '2026-07-06',
    nature: '清热',
    natureDesc: '阳极阴生，宜清补养心',
    principle: '夏至是一年中阳气最旺的日子，此后阴气始生，宜清补养心、健脾祛湿，不宜大温大补。',
    recommendIngredients: ['lvdou', 'yinmi', 'fanqie', 'huanggua', 'muer', 'doufu'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan', 'hetao'],
    weatherDesc: '白昼最长，太阳直射北回归线，气温持续高位',
    folkWisdom: '「不过夏至不热」——夏至之后真正进入暑热阶段',
    boxTheme: '清心养阴食盒',
    boxCopy: '阳气至极，清补才是正解',
    emoji: '🌻',
    color: '#FEF9C3',
    colorEnd: '#FDE047',
  },
  {
    key: 'xiaoshu',
    name: '小暑',
    pinyin: 'Xiǎo Shǔ',
    startDate: '2026-07-07',
    endDate: '2026-07-22',
    nature: '清热',
    natureDesc: '暑气初起，宜清热解暑',
    principle: '小暑虽未到最热，但暑热已起，宜清热解暑、健脾利湿，饮食以清淡为主。',
    recommendIngredients: ['lvdou', 'yinmi', 'huanggua', 'donggua', 'muer', 'jinyinhua'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang'],
    weatherDesc: '气温持续上升，湿度大，体感闷热',
    folkWisdom: '「小暑一声雷，倒转做黄梅」——小暑雷雨天可能把梅雨带回',
    boxTheme: '消暑利湿食盒',
    boxCopy: '暑气初来，先清后补',
    emoji: '🌤️',
    color: '#FEF3C7',
    colorEnd: '#FDE68A',
  },
  {
    key: 'dashu',
    name: '大暑',
    pinyin: 'Dà Shǔ',
    startDate: '2026-07-23',
    endDate: '2026-08-07',
    nature: '清热',
    natureDesc: '一年最热，宜清热养阴',
    principle: '大暑是一年中最热的时节，人体出汗多、气阴两伤，宜清热养阴、生津止渴、清补为主。',
    recommendIngredients: ['lvdou', 'yinmi', 'muer', 'jinyinhua', 'xiangjiao', 'doufu'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan'],
    weatherDesc: '全年最热时段，多高温橙色/红色预警',
    folkWisdom: '「大暑不热，五谷不结」——暑热是丰收的必要条件',
    boxTheme: '清凉养阴食盒',
    boxCopy: '大暑大热，清凉最解渴',
    emoji: '🌡️',
    color: '#FFF1F2',
    colorEnd: '#FECDD3',
  },
  {
    key: 'liqiu',
    name: '立秋',
    pinyin: 'Lì Qiū',
    startDate: '2026-08-08',
    endDate: '2026-08-22',
    nature: '平润',
    natureDesc: '秋意初起，宜润燥养肺',
    principle: '立秋虽名为秋，但暑热未消，秋燥渐起，宜润燥养肺、清补平补，忌大温大补。',
    recommendIngredients: ['lianou', 'muer', 'yinmi', '梨', 'fanqie', 'doufu', 'nangua'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan'],
    weatherDesc: '暑热渐退，早晚温差开始加大，北方进入秋凉',
    folkWisdom: '「早上立了秋，晚上凉飕飕」——立秋后气温开始下降',
    boxTheme: '初秋润燥食盒',
    boxCopy: '暑去秋来，先润后补',
    emoji: '🍂',
    color: '#FEF9EF',
    colorEnd: '#FDE68A',
  },
  {
    key: 'chushu',
    name: '处暑',
    pinyin: 'Chǔ Shǔ',
    startDate: '2026-08-23',
    endDate: '2026-09-07',
    nature: '润燥',
    natureDesc: '暑气消退，宜养阴润燥',
    principle: '处暑表示暑气到此为止，秋燥当令，宜养阴润燥、清热安神，少辛多酸以收敛肺气。',
    recommendIngredients: ['梨', 'muer', 'yinmi', 'lianou', 'fanqie', 'doufu', 'nangua'],
    avoidIngredients: ['jiang', 'dasuan', 'cong', 'yangrou'],
    weatherDesc: '气温明显下降，昼夜温差加大，降水减少，空气干燥',
    folkWisdom: '「处暑十八盆」——处暑后还要洗十八天澡才能出伏',
    boxTheme: '养阴润燥食盒',
    boxCopy: '暑气尽收，润燥先行',
    emoji: '🍁',
    color: '#FDF2F8',
    colorEnd: '#FBCFE8',
  },
  {
    key: 'bailu',
    name: '白露',
    pinyin: 'Bái Lù',
    startDate: '2026-09-08',
    endDate: '2026-09-22',
    nature: '平润',
    natureDesc: '露凝而白，宜滋阴润肺',
    principle: '白露后天气转凉，露水凝结，早晚温差更大，宜滋阴润肺、健脾益气，忌寒凉伤脾。',
    recommendIngredients: ['lianou', '梨', 'muer', 'yinmi', 'hongzao', 'guiyuan'],
    avoidIngredients: ['lvdou', 'kugua', 'huanggua'],
    weatherDesc: '气温持续下降，早晚凉意明显，露水开始凝结',
    folkWisdom: '「白露秋分夜，一夜凉一夜」——白露后夜间降温加快',
    boxTheme: '金秋润肺食盒',
    boxCopy: '露凝而白，润肺正当时',
    emoji: '💧',
    color: '#F0F9FF',
    colorEnd: '#E0F2FE',
  },
  {
    key: 'qiufen',
    name: '秋分',
    pinyin: 'Qiū Fēn',
    startDate: '2026-09-23',
    endDate: '2026-10-07',
    nature: '平润',
    natureDesc: '昼夜平分，宜阴阳平衡',
    principle: '秋分与春分一样，昼夜等长，阴阳平衡，宜平补养肺、健脾和胃，不宜大寒大热。',
    recommendIngredients: ['lianou', '梨', 'muer', 'yinmi', 'nangua', 'fanqie', 'doufu'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang'],
    weatherDesc: '秋高气爽，云淡风轻，是最舒适的季节',
    folkWisdom: '「秋分到，蛋儿俏」——与春分同理，阴阳平衡之日',
    boxTheme: '金秋平衡食盒',
    boxCopy: '昼夜等长，身心也需要平衡',
    emoji: '🍃',
    color: '#FEF9EF',
    colorEnd: '#FED7AA',
  },
  {
    key: 'hanlu',
    name: '寒露',
    pinyin: 'Hán Lù',
    startDate: '2026-10-08',
    endDate: '2026-10-23',
    nature: '润燥',
    natureDesc: '露气寒冷，宜养阴润燥',
    principle: '寒露比白露更冷，燥邪更盛，宜养阴润燥、健脾益气，少吃辛辣以防助燥伤阴。',
    recommendIngredients: ['lianou', '梨', 'muer', 'yinmi', 'guiyuan', 'hongzao'],
    avoidIngredients: ['jiang', 'dasuan', 'cong', 'lvdou'],
    weatherDesc: '气温进一步下降，露水凝结成霜，早晚寒意明显',
    folkWisdom: '「寒露不算冷，霜降变了天」——寒露之后天气加速转冷',
    boxTheme: '深秋暖润食盒',
    boxCopy: '寒露渐凉，润燥要先',
    emoji: '🍂',
    color: '#FEF2F2',
    colorEnd: '#FECACA',
  },
  {
    key: 'shuangjiang',
    name: '霜降',
    pinyin: 'Shuāng Jiàng',
    startDate: '2026-10-24',
    endDate: '2026-11-07',
    nature: '温补',
    natureDesc: '霜始降，宜补冬先补脾',
    principle: '霜降是秋季最后一个节气，冬天将至，宜补益气血、健脾和胃，为冬令进补打基础。',
    recommendIngredients: ['nangua', 'lianou', 'hongzao', 'hetao', 'guiyuan', 'jirou', 'paigu'],
    avoidIngredients: ['lvdou', 'yinmi', 'huanggua'],
    weatherDesc: '气温骤降，北方部分地区开始霜冻',
    folkWisdom: '「霜降杀百草」——霜降后植物进入休眠',
    boxTheme: '霜降进补食盒',
    boxCopy: '霜降补脾，为冬天打好底子',
    emoji: '🌫️',
    color: '#F5F3FF',
    colorEnd: '#DDD6FE',
  },
  {
    key: 'lidong',
    name: '立冬',
    pinyin: 'Lì Dōng',
    startDate: '2026-11-08',
    endDate: '2026-11-21',
    nature: '温补',
    natureDesc: '冬季开始，宜温补肾阳',
    principle: '立冬后万物收藏，人体阳气内敛，宜温补肾阳、健脾养胃，为寒冬打底，忌大寒大凉。',
    recommendIngredients: ['jiang', 'yangrou', 'jirou', 'paigu', 'hetao', 'guiyuan', 'shanzha'],
    avoidIngredients: ['lvdou', 'kugua', 'huanggua', 'xiangjiao'],
    weatherDesc: '气温显著下降，北方开始供暖，南方进入深秋',
    folkWisdom: '「立冬补冬，补嘴空」——立冬有吃饺子的习俗',
    boxTheme: '初冬温补食盒',
    boxCopy: '立冬进补，给身体加层暖',
    emoji: '❄️',
    color: '#F0F9FF',
    colorEnd: '#BAE6FD',
  },
  {
    key: 'xiaoxue',
    name: '小雪',
    pinyin: 'Xiǎo Xuě',
    startDate: '2026-11-22',
    endDate: '2026-12-06',
    nature: '温补',
    natureDesc: '雪意初显，宜温补益肾',
    principle: '小雪后天气渐冷但雪量不大，宜温补脾肾、驱寒暖身，适当进补但忌燥热伤阴。',
    recommendIngredients: ['yangrou', 'jiang', 'guiyuan', 'hongzao', 'hetao', 'paigu'],
    avoidIngredients: ['lvdou', 'yinmi', 'fanqie'],
    weatherDesc: '气温继续下降，部分北方城市开始降雪',
    folkWisdom: '「小雪雪满天，来岁是丰年」——小雪降雪预兆来年丰收',
    boxTheme: '暖冬养肾食盒',
    boxCopy: '小雪未雪，先把温暖补满',
    emoji: '🌨️',
    color: '#F0FDFA',
    colorEnd: '#99F6E4',
  },
  {
    key: 'daxue',
    name: '大雪',
    pinyin: 'Dà Xuě',
    startDate: '2026-12-07',
    endDate: '2026-12-21',
    nature: '温补',
    natureDesc: '大雪封地，宜大补温阳',
    principle: '大雪时节气温最低、雪量最大，宜大补温阳、驱寒暖肾，是冬令进补的最佳时机。',
    recommendIngredients: ['yangrou', 'jirou', 'jiang', 'guiyuan', 'hetao', 'paigu', 'shanzha'],
    avoidIngredients: ['lvdou', 'yinmi', 'huanggua'],
    weatherDesc: '天寒地冻，是一年中最冷的时段之一',
    folkWisdom: '「大雪半溶加一冰，明年收成一场定」——大雪对农业的重要意义',
    boxTheme: '大雪温阳食盒',
    boxCopy: '大雪封地，温补正当时',
    emoji: '🏔️',
    color: '#F1F5F9',
    colorEnd: '#E2E8F0',
  },
]

/**
 * 获取当前/即将到来的节气
 */
export function getCurrentTerm(now?: Date): SeasonalTerm | null {
  const date = now || new Date()
  const terms = SEASONAL_TERMS_2026
  if (terms.length === 0) return null
  // 命中当前区间
  for (const term of terms) {
    const start = new Date(term.startDate)
    const end = new Date(term.endDate)
    if (date >= start && date <= end) {
      return term
    }
  }
  // 早于首节气（如年初尚未到小寒）→ 返回「即将开始」的首节气，避免回退到上一年尾节气造成「当前=大雪、下个=小寒」矛盾
  if (date < new Date(terms[0].startDate)) return terms[0]
  // 晚于尾节气（如年末大雪过后）→ 返回最近结束的尾节气
  return terms[terms.length - 1]
}

/**
 * 获取下一个即将到来的节气
 */
export function getNextTerm(now?: Date): SeasonalTerm | null {
  const date = now || new Date()
  for (const term of SEASONAL_TERMS_2026) {
    if (new Date(term.startDate) > date) {
      return term
    }
  }
  return SEASONAL_TERMS_2026[0] || null
}

/**
 * 获取节气剩余天数
 */
export function getDaysLeftInTerm(term: SeasonalTerm, now?: Date): number {
  const date = now || new Date()
  const end = new Date(term.endDate)
  const diff = end.getTime() - date.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

/**
 * 节气性味 → 对应的 shiyang nature 匹配规则
 * 用于从商品列表中筛选适合当前节气的商品
 */
export function getTermNatureTags(term: SeasonalTerm): string[] {
  const natureMap: Record<string, string[]> = {
    '温补': ['温', '微温'],
    '清热': ['寒', '凉', '微寒'],
    '平润': ['平', '微温', '微寒'],
    '滋阴': ['寒', '凉'],
    '健脾': ['平', '温', '凉'],
    '润燥': ['寒', '凉', '平'],
  }
  return natureMap[term.nature] || ['平']
}

/**
 * 判断某食材性味是否适合当前节气
 */
export function isIngredientGoodForTerm(
  ingredientNature: string,
  term: SeasonalTerm,
): 'good' | 'neutral' | 'avoid' {
  const goodNatures = getTermNatureTags(term)
  const avoidMap: Record<string, string[]> = {
    '温补': ['寒', '微寒'],
    '清热': ['温', '大热'],
    '平润': [],
    '滋阴': ['温', '大热'],
    '健脾': ['大寒', '大热'],
    '润燥': ['温', '大热'],
  }
  const avoidNatures = avoidMap[term.nature] || []

  if (avoidNatures.includes(ingredientNature)) return 'avoid'
  if (goodNatures.includes(ingredientNature)) return 'good'
  return 'neutral'
}
