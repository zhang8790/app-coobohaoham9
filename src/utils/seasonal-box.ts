/**
 * 节气食盒数据模块
 * 节气时间表：2026年（农历丙午年）
 * 每个节气含：日期区间、食养原则、推荐性味、禁忌、应季食材、食盒商品推荐逻辑
 *
 * 合规说明：所有文案仅描述节气气候与民间传统饮食习惯参考，
 * 不含任何「治疗 / 调理 / 补益 / 清补 / 温阳 / 祛湿」等食疗功效宣称。
 * `nature` 仅作内部食材性味匹配用的方向标识（不展示给用户）；
 * `natureLabel` 为展示用的中性时令/季节描述（日历/物候含义，无功效暗示）。
 */

export interface SeasonalTerm {
  key: string
  name: string          // 节气名
  pinyin: string        // 拼音
  startDate: string     // 开始日期（YYYY-MM-DD）
  endDate: string       // 结束日期（YYYY-MM-DD）
  nature: '温补' | '清热' | '平润' | '滋阴' | '健脾' | '润燥'  // 内部食材匹配方向（不展示）
  natureLabel: string   // 展示用中性时令/季节描述（无功效暗示）
  natureDesc: string     // 时令饮食习惯参考（一句话）
  principle: string     // 节气气候与民间食俗说明（中性，无宜/忌功效指令）
  recommendIngredients: string[]  // 推荐食材 key（对应 shiyang-dictionary）
  avoidIngredients: string[]     // 慎用食材 key
  weatherDesc: string    // 节气气候描述
  folkWisdom: string     // 民间谚语/食俗
  boxTheme: string       // 食盒主题文案（中性时令命名）
  boxCopy: string        // 食盒副标题（中性）
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
    natureLabel: '寒冬',
    natureDesc: '传统饮食偏好温热、根茎类食材',
    principle: '小寒节气北方天寒地冻，民间多有熬煮热汤、姜枣茶等温热饮食的习惯，注重暖食与能量补给。',
    recommendIngredients: ['jiang', 'dasuan', 'yangrou', 'hetao', 'jirou', 'nangua', 'shanzha'],
    avoidIngredients: ['xiangjiao', 'lvdou', 'kugua', 'haidai'],
    weatherDesc: '天寒地冻，冷空气频繁南下，北方进入最冷时段',
    folkWisdom: '「小寒大寒，冷成冰团」——此时节多有喝热汤暖身的食俗',
    boxTheme: '寒冬时令食盒',
    boxCopy: '应季温热食材，陪你安稳过冬',
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
    natureLabel: '严冬',
    natureDesc: '传统饮食偏好温润、能量类食材',
    principle: '大寒是全年气温最低的时段，民间临近春节多有备办年货、炖煮暖食的习惯，注重温热饮食。',
    recommendIngredients: ['yangrou', 'jiang', 'guiyuan', 'hongzao', 'hetao', 'paigu', 'jirou'],
    avoidIngredients: ['xiangjiao', 'yinmi', 'lvdou'],
    weatherDesc: '寒潮频繁，部分地区可能出现极端低温',
    folkWisdom: '「大寒到顶点，日后天渐暖」——大寒之后阳气开始萌动',
    boxTheme: '严冬时令食盒',
    boxCopy: '冬日里的应季搭配，暖意满满',
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
    natureLabel: '初春',
    natureDesc: '传统饮食偏好清爽、芽苗类时鲜',
    principle: '立春后气温回升、冷暖交替，民间多有吃春饼、嚼春芽等迎接新春的饮食习俗，注重新鲜清淡。',
    recommendIngredients: ['cong', 'dasuan', 'lianou', 'fanqie', 'bailuobo', 'doufu'],
    avoidIngredients: ['yangrou', 'hetao', 'jiang'],
    weatherDesc: '乍暖还寒，冷暖空气交替，气温波动大',
    folkWisdom: '「立春一日，水暖三分」——大地开始解冻，春意萌动',
    boxTheme: '初春时令食盒',
    boxCopy: '尝一口春天的鲜嫩',
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
    natureLabel: '春雨',
    natureDesc: '传统饮食偏好温和、利湿类食材',
    principle: '雨水时节空气湿度增大，民间多有喝粥、食山药等温和饮食的习惯，注重顺应时节。',
    recommendIngredients: ['yinmi', 'bailuobo', 'lianou', 'doufu', 'nangua', 'chenpi'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang'],
    weatherDesc: '降雨增多，空气湿度大，南方进入"回南天"时段',
    folkWisdom: '「春雨贵如油」——降水对农业至关重要，人体也需适当补充水分',
    boxTheme: '春雨时令食盒',
    boxCopy: '湿润时节的轻盈搭配',
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
    natureLabel: '仲春',
    natureDesc: '传统饮食偏好清淡、润喉类食材',
    principle: '惊蛰后气温明显回升，民间多有吃梨、饮春茶等润喉饮食的习惯，注重清爽应季。',
    recommendIngredients: ['jinyinhua', 'lvdou', '梨', 'yinmi', 'fanqie', 'doufu'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'cong'],
    weatherDesc: '春雷始鸣，气温回升快，细菌病毒活跃，流感高发',
    folkWisdom: '「惊蛰过，暖和和，老牛老马卸铁索」——春耕开始',
    boxTheme: '仲春时令食盒',
    boxCopy: '春日里的一份清爽',
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
    natureLabel: '春分',
    natureDesc: '传统饮食偏好平和、多样时蔬',
    principle: '春分昼夜等长，气候温和，民间多有竖蛋、食春菜等均衡饮食的习俗，注重不偏不倚。',
    recommendIngredients: ['lianou', 'fanqie', 'bailuobo', 'baicai', 'doufu', 'bocai'],
    avoidIngredients: ['yangrou', 'jirou'],
    weatherDesc: '阳光明媚，春风和煦，桃花、杏花陆续开放',
    folkWisdom: '「春分到，蛋儿俏」——民间有竖蛋习俗',
    boxTheme: '春分时令食盒',
    boxCopy: '平衡膳食，从春分开始',
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
    natureLabel: '清明',
    natureDesc: '传统饮食偏好清雅、时令青绿食材',
    principle: '清明时节多踏青扫墓，民间多有食青团、喝明前茶等清雅饮食的习惯，注重应季新鲜。',
    recommendIngredients: ['jinyinhua', 'lvdou', 'muer', 'guayua', 'qingmingcha'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang'],
    weatherDesc: '气温回升，天气晴朗，是踏青赏春的好时节',
    folkWisdom: '「清明时节雨纷纷」——此时节雨水增多，多有食青团的食俗',
    boxTheme: '清明时令食盒',
    boxCopy: '带着春意的应季小食',
    emoji: '🌸',
    color: '#FDF2F8',
    colorEnd: '#F9A8D4',
  },
  {
    key: 'guyu',
    name: '谷雨',
    pinyin: 'Gǔ Yǔ',
    startDate: '2026-04-20',
    endDate: '2026-05-05',
    nature: '健脾',
    natureLabel: '暮春',
    natureDesc: '传统饮食偏好温润、尝鲜类食材',
    principle: '谷雨是春季最后一个节气，降水充足，民间多有食香椿、喝谷雨茶等尝鲜习惯，注重应季。',
    recommendIngredients: ['yinmi', 'lianou', 'muer', 'bailuobo', 'doufu', 'nangua'],
    avoidIngredients: ['yangrou', 'jirou'],
    weatherDesc: '降雨增多，谷物生长旺盛，南方进入汛期',
    folkWisdom: '「谷雨前后，种瓜点豆」——农忙时节',
    boxTheme: '暮春时令食盒',
    boxCopy: '春末的最后一口鲜',
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
    natureLabel: '初夏',
    natureDesc: '传统饮食偏好清爽、利湿类食材',
    principle: '小满后气温升高、湿度增大，民间多有吃苦菜、食苦瓜等清爽饮食的习俗，注重轻盈。',
    recommendIngredients: ['lvdou', 'yinmi', 'muer', 'fanqie', 'huanggua', 'donggua'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan'],
    weatherDesc: '气温明显升高，暑湿渐重，长江中下游进入"梅雨"前奏',
    folkWisdom: '「小满动三车」——水车、油车和丝车，三车忙动',
    boxTheme: '初夏时令食盒',
    boxCopy: '初夏里的一份轻盈',
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
    natureLabel: '仲夏',
    natureDesc: '传统饮食偏好消暑、补水类食材',
    principle: '芒种正值梅雨与农忙，民间多有煮青梅、饮酸梅汤等消暑饮食的习惯，注重补水。',
    recommendIngredients: ['lvdou', 'yinmi', 'jinyinhua', 'muer', 'xiangjiao', 'donggua'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan'],
    weatherDesc: '天气炎热，长江中下游正式进入梅雨季',
    folkWisdom: '「时雨及芒种，四野皆插秧」——农忙双抢时节',
    boxTheme: '仲夏时令食盒',
    boxCopy: '忙里偷闲的消暑搭配',
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
    natureLabel: '盛夏',
    natureDesc: '传统饮食偏好清凉、补水类食材',
    principle: '夏至后真正进入暑热，民间多有吃面、食凉粥等消暑饮食的习俗，注重补充水分。',
    recommendIngredients: ['lvdou', 'yinmi', 'fanqie', 'huanggua', 'muer', 'doufu'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan', 'hetao'],
    weatherDesc: '白昼最长，太阳直射北回归线，气温持续高位',
    folkWisdom: '「不过夏至不热」——夏至之后真正进入暑热阶段',
    boxTheme: '盛夏时令食盒',
    boxCopy: '最长白昼里的清凉',
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
    natureLabel: '暑季',
    natureDesc: '传统饮食偏好清爽、补水类食材',
    principle: '小暑虽未到最热，但闷热已起，民间多有食藕、喝绿豆汤等清爽饮食的习惯，注重补水。',
    recommendIngredients: ['lvdou', 'yinmi', 'huanggua', 'donggua', 'muer', 'jinyinhua'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang'],
    weatherDesc: '气温持续上升，湿度大，体感闷热',
    folkWisdom: '「小暑一声雷，倒转做黄梅」——小暑雷雨天可能把梅雨带回',
    boxTheme: '暑季时令食盒',
    boxCopy: '暑气里的第一口清爽',
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
    natureLabel: '盛暑',
    natureDesc: '日常饮食偏好清淡、补水类食材',
    principle: '大暑是全年气温最高的时节，民间多有饮用绿豆汤、吃瓜类等清爽饮食的习惯，注重补充水分。',
    recommendIngredients: ['lvdou', 'yinmi', 'muer', 'jinyinhua', 'xiangjiao', 'doufu'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan'],
    weatherDesc: '全年最热时段，多高温橙色/红色预警',
    folkWisdom: '「大暑不热，五谷不结」——暑热是丰收的必要条件',
    boxTheme: '盛暑时令食盒',
    boxCopy: '应季清爽食材，陪你度过最热时段',
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
    natureLabel: '初秋',
    natureDesc: '传统饮食偏好润养、时令果蔬',
    principle: '立秋后暑热渐退、秋燥渐起，民间多有啃秋瓜、食莲藕等润养饮食的习俗，注重应季。',
    recommendIngredients: ['lianou', 'muer', 'yinmi', '梨', 'fanqie', 'doufu', 'nangua'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang', 'dasuan'],
    weatherDesc: '暑热渐退，早晚温差开始加大，北方进入秋凉',
    folkWisdom: '「早上立了秋，晚上凉飕飕」——立秋后气温开始下降',
    boxTheme: '初秋时令食盒',
    boxCopy: '夏秋交替的润养小食',
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
    natureLabel: '秋初',
    natureDesc: '传统饮食偏好温润、时令果蔬',
    principle: '处暑表示炎热结束，秋燥当令，民间多有食鸭、喝百合汤等温润饮食的习惯，注重温和。',
    recommendIngredients: ['梨', 'muer', 'yinmi', 'lianou', 'fanqie', 'doufu', 'nangua'],
    avoidIngredients: ['jiang', 'dasuan', 'cong', 'yangrou'],
    weatherDesc: '气温明显下降，昼夜温差加大，降水减少，空气干燥',
    folkWisdom: '「处暑十八盆」——处暑后还要洗十八天澡才能出伏',
    boxTheme: '秋初时令食盒',
    boxCopy: '暑气收尾，温润刚好',
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
    natureLabel: '仲秋',
    natureDesc: '传统饮食偏好清润、时令果蔬',
    principle: '白露后昼夜温差加大，民间多有食梨、饮白露茶等清润饮食的习俗，注重应季新鲜。',
    recommendIngredients: ['lianou', '梨', 'muer', 'yinmi', 'hongzao', 'guiyuan'],
    avoidIngredients: ['lvdou', 'kugua', 'huanggua'],
    weatherDesc: '气温持续下降，早晚凉意明显，露水开始凝结',
    folkWisdom: '「白露秋分夜，一夜凉一夜」——白露后夜间降温加快',
    boxTheme: '仲秋时令食盒',
    boxCopy: '露白风清的秋日小食',
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
    natureLabel: '秋分',
    natureDesc: '传统饮食偏好平和、多样时蔬',
    principle: '秋分昼夜等长，气候舒爽，民间多有食秋菜、竖蛋等均衡饮食的习俗，注重不偏不倚。',
    recommendIngredients: ['lianou', '梨', 'muer', 'yinmi', 'nangua', 'fanqie', 'doufu'],
    avoidIngredients: ['yangrou', 'jirou', 'jiang'],
    weatherDesc: '秋高气爽，云淡风轻，是最舒适的季节',
    folkWisdom: '「秋分到，蛋儿俏」——与春分同理，阴阳平衡之日',
    boxTheme: '秋分时令食盒',
    boxCopy: '平分秋色的膳食搭配',
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
    natureLabel: '深秋',
    natureDesc: '传统饮食偏好温润、能量类食材',
    principle: '寒露后燥意更浓、气温走低，民间多有食芝麻、喝菊花茶等温润饮食的习惯，注重温和。',
    recommendIngredients: ['lianou', '梨', 'muer', 'yinmi', 'guiyuan', 'hongzao'],
    avoidIngredients: ['jiang', 'dasuan', 'cong', 'lvdou'],
    weatherDesc: '气温进一步下降，露水凝结成霜，早晚寒意明显',
    folkWisdom: '「寒露不算冷，霜降变了天」——寒露之后天气加速转冷',
    boxTheme: '深秋时令食盒',
    boxCopy: '深秋里的一份温润',
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
    natureLabel: '秋末',
    natureDesc: '传统饮食偏好温润、能量类食材',
    principle: '霜降是秋季最后一个节气，天气转冷，民间多有食柿子、炖暖食等温润饮食的习俗，注重能量补给。',
    recommendIngredients: ['nangua', 'lianou', 'hongzao', 'hetao', 'guiyuan', 'jirou', 'paigu'],
    avoidIngredients: ['lvdou', 'yinmi', 'huanggua'],
    weatherDesc: '气温骤降，北方部分地区开始霜冻',
    folkWisdom: '「霜降杀百草」——霜降后植物进入休眠',
    boxTheme: '秋末时令食盒',
    boxCopy: '为冬天打好底子的搭配',
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
    natureLabel: '初冬',
    natureDesc: '传统饮食偏好温润、能量类食材',
    principle: '立冬后气温显著下降，民间多有吃饺子、煲汤等温润饮食的习俗，注重能量补给。',
    recommendIngredients: ['jiang', 'yangrou', 'jirou', 'paigu', 'hetao', 'guiyuan', 'shanzha'],
    avoidIngredients: ['lvdou', 'kugua', 'huanggua', 'xiangjiao'],
    weatherDesc: '气温显著下降，北方开始供暖，南方进入深秋',
    folkWisdom: '「立冬补冬，补嘴空」——立冬有吃饺子的习俗',
    boxTheme: '初冬时令食盒',
    boxCopy: '入冬的第一口暖意',
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
    natureLabel: '冬初',
    natureDesc: '传统饮食偏好温润、蓄能类食材',
    principle: '小雪后天气渐冷，民间多有腌腊、食温润菜肴等蓄能饮食的习俗，注重温热。',
    recommendIngredients: ['yangrou', 'jiang', 'guiyuan', 'hongzao', 'hetao', 'paigu'],
    avoidIngredients: ['lvdou', 'yinmi', 'fanqie'],
    weatherDesc: '气温继续下降，部分北方城市开始降雪',
    folkWisdom: '「小雪雪满天，来岁是丰年」——小雪降雪预兆来年丰收',
    boxTheme: '冬初时令食盒',
    boxCopy: '落雪前的暖心搭配',
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
    natureLabel: '隆冬',
    natureDesc: '传统饮食偏好温润、能量类食材',
    principle: '大雪时节气温最低、雪量最大，民间多有食火锅、炖暖食等温润饮食的习俗，注重温热。',
    recommendIngredients: ['yangrou', 'jirou', 'jiang', 'guiyuan', 'hetao', 'paigu', 'shanzha'],
    avoidIngredients: ['lvdou', 'yinmi', 'huanggua'],
    weatherDesc: '天寒地冻，是一年中最冷的时段之一',
    folkWisdom: '「大雪半溶加一冰，明年收成一场定」——大雪对农业的重要意义',
    boxTheme: '隆冬时令食盒',
    boxCopy: '隆冬里最踏实的暖意',
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
 * 用于从商品列表中筛选适合当前节气的商品（内部匹配用，非功效宣称）
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
