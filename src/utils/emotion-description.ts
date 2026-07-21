// 情绪编译引擎 v3（商品身份前置 · 类目感知 · 可采纳文案）
// ------------------------------------------------------------
// 设计原则：
//   1. 【商品身份前置】每条文案必须先让读者知道这是什么——产品名称/品类特征/
//      感官细节优先于纯意境比喻。之前的版本产出的是「心情日记」（通用文艺腔），
//      商家无法采纳；本版保证每条候选都是「可用的商品文案」。
//   2. 【类目专属主体模板】每个本地生活业态有 10-15 条 bodyTemplates（接地气的
//      产品描述模板），覆盖该业态产品的真实使用场景与感官体验。
//   3. 【属性词条增强】ATTRIBUTE_PHRASES 扩充到 50+ 条目，覆盖食材/做法/口感/功效/
//      适用人群/时令等维度，自动扫描商品名/描述/商家关键词。
//   4. 【场景降权】场景词不再主导句子前半段（不再出现三条都以"每逢与心上人相对而坐"
//      开头的雷同问题），改为从句或后置点缀。
//   5. 【确定性生成】同一组输入永远产出相同结果（variant 参数控制变体）。
//
// 禁用医疗宣称与绝对化用语（治疗/治愈/降血压/最/第一/根治/100%/保证 等）；
// 食养类功效措辞=传统食养参考，必附"不替代医嘱"。
//
// 复用项目已有的 v1 情绪标签 API：Product.mood_tags / Product.scene_tags / Store.category。

import type { Product } from '@/db/types'
import { resolveCategoryProfile } from './category-emotion'
import { resolveProductEmotionLexicon } from './product-emotion-lexicon'

// =====================
// 1. 情绪标签 → 意境（保留作为氛围调味，不再是主体）
// =====================
const MOOD_REALM: Record<string, { realm: string; metaphor: string }> = {
  快乐: { realm: '畅快欢喜', metaphor: '一阵穿林的风' },
  兴奋: { realm: '雀跃悸动', metaphor: '檐角惊起的雀' },
  满足: { realm: '妥帖安然', metaphor: '灯下温着的一盏茶' },
  惊喜: { realm: '不期而遇的欢喜', metaphor: '雪后忽见的红梅' },
  幸福: { realm: '圆满', metaphor: '月圆之夜' },
  温馨: { realm: '家的暖意', metaphor: '灶上咕嘟的汤' },
  浪漫: { realm: '柔情缱绻', metaphor: '帘外一钩月' },
  甜蜜: { realm: '缱绻甜意', metaphor: '唇边化开的蜜' },
  感动: { realm: '心头一热', metaphor: '故人寄来的一封信' },
  治愈: { realm: '被轻轻抚平', metaphor: '雨后晒暖的棉被' },
  清爽: { realm: '清欢', metaphor: '山涧凉风' },
  清新: { realm: '如沐春风', metaphor: '晨雾里的青草' },
  自然: { realm: '本真', metaphor: '未施粉黛的容颜' },
  纯净: { realm: '无尘', metaphor: '初雪' },
  解暑: { realm: '清凉境', metaphor: '井水镇过的瓜' },
  奢华: { realm: '风华', metaphor: '锦缎上的金线' },
  高端: { realm: '端方雅正', metaphor: '案头一方端砚' },
  精致: { realm: '匠心', metaphor: '榫卯相扣的木作' },
  典雅: { realm: '古意', metaphor: '旧瓷上的一缕青花' },
  尊贵: { realm: '贵重', metaphor: '匣中珍藏的玉' },
  有趣: { realm: '逸趣', metaphor: '案头把玩的核桃' },
  可爱: { realm: '娇憨', metaphor: '檐下打盹的猫' },
  活力: { realm: '生气', metaphor: '破土的新笋' },
  潮流: { realm: '时韵', metaphor: '檐下新挂的灯笼' },
  个性: { realm: '独异', metaphor: '不与众同的一枝' },
  平静: { realm: '澄明', metaphor: '止水' },
  放松: { realm: '松弛', metaphor: '解开束发的带' },
  舒适: { realm: '熨帖', metaphor: '旧棉布衫' },
  安逸: { realm: '闲适', metaphor: '藤椅上半盏闲茶' },
  慢生活: { realm: '慢时光', metaphor: '日影西斜的午后' },
  孤独: { realm: '清寂', metaphor: '一盏孤灯' },
  怀旧: { realm: '旧时光', metaphor: '抽屉里的老照片' },
  温暖: { realm: '熨帖', metaphor: '炉边烘着的旧袄' },
  专注: { realm: '凝神', metaphor: '案头不灭的灯' },
  分享: { realm: '热闹', metaphor: '几人围坐的暖' },
  送礼: { realm: '心意', metaphor: '千里寄来的鹅毛' },
  实用: { realm: '妥帖', metaphor: '称手的旧物' },
  仪式感: { realm: '郑重', metaphor: '净手焚香的一刻' },
  用餐时光: { realm: '烟火', metaphor: '灶上咕嘟的汤' },
  // —— 商品级情绪词（来自 product-emotion-lexicon，使 {realm}/{metaphor} 产品化）——
  温润: { realm: '温润妥帖', metaphor: '炉上慢煮的一壶暖' },
  回甘: { realm: '悠长回韵', metaphor: '咽下后浮起的甜' },
  安神: { realm: '安宁沉静', metaphor: '夜读旁的那盏灯' },
  围炉: { realm: '围坐的暖', metaphor: '炉边聚着的人' },
  清冽: { realm: '清冽醒神', metaphor: '山泉过喉的透' },
  鲜爽: { realm: '鲜爽透亮', metaphor: '晨雾里的一抹青' },
  醒神: { realm: '清醒活络', metaphor: '清晨第一口光' },
  陈香: { realm: '沉稳厚味', metaphor: '老柜里藏着的暖' },
  温养: { realm: '温养熨帖', metaphor: '饭后慢慢化开的稠' },
  兰香: { realm: '清雅回韵', metaphor: '杯底浮起的兰影' },
  回韵: { realm: '悠长余味', metaphor: '喉头迟迟的甜' },
  醇苦: { realm: '醇苦回甘', metaphor: '深棕里沉着的香' },
  甜润: { realm: '甜润妥帖', metaphor: '吸管搅起的甜' },
  欢聚: { realm: '热闹欢喜', metaphor: '几人围坐的暖' },
  鲜活: { realm: '鲜活透亮', metaphor: '枝头带露的艳' },
  清润: { realm: '清润通透', metaphor: '山泉过喉的透' },
  本真: { realm: '本真无饰', metaphor: '未施粉黛的容颜' },
  通透: { realm: '澄明通透', metaphor: '初雪化开的清' },
  零负担: { realm: '轻松无负', metaphor: '卸下肩头的力' },
  烟火: { realm: '烟火人间', metaphor: '夏夜大排档的灯' },
  酣畅: { realm: '酣畅淋漓', metaphor: '炭火噼啪的响' },
  热络: { realm: '热络亲厚', metaphor: '油烟里升起的热闹' },
  释放: { realm: '松绑释放', metaphor: '解开束发的带' },
  沸腾: { realm: '沸腾热闹', metaphor: '咕嘟冒泡的红汤' },
  热闹: { realm: '热闹欢喜', metaphor: '一桌人伸筷的暖' },
  围聚: { realm: '围聚的暖', metaphor: '蒸汽糊住眼镜的笑' },
  微醺: { realm: '微醺松弛', metaphor: '杯壁挂着的沫' },
  畅快: { realm: '畅快欢喜', metaphor: '碰杯时溅起的亮' },
  优雅: { realm: '优雅从容', metaphor: '杯中晃动的宝石红' },
  酥香: { realm: '酥香耐嚼', metaphor: '齿间炸开的香' },
  轻盈: { realm: '轻盈无负', metaphor: '身体变轻的预感' },
  自律: { realm: '清醒自律', metaphor: '练后那口干净的充' },
  熨帖: { realm: '熨帖安然', metaphor: '砂锅里咕嘟的暖' },
  甜慰: { realm: '甜慰妥帖', metaphor: '勺底颤巍巍的软' },
  甜宠: { realm: '甜宠欢喜', metaphor: '奶油化开的云' },
  麦香: { realm: '麦香朴实', metaphor: '刚出炉的暖香' },
  酥软: { realm: '酥软温柔', metaphor: '脆壳裂开的响' },
  晨光: { realm: '晨光熹微', metaphor: '晨光里那片金' },
  小确幸: { realm: '不期的小欢喜', metaphor: '转角撞见的花' },
}

// 意境变体池（轮换用，增加候选间差异）
const REALM_METAPHOR_EXTRA: Record<string, string[]> = {
  快乐: ['檐角雀跃的铃', '纵马过山的快意'],
  兴奋: ['灯下一跃的雀', '心口擂动的鼓'],
  满足: ['枕边半卷的书', '饭后一盏的闲'],
  惊喜: ['转角撞见的花', '帘外忽落的雪'],
  幸福: ['檐下团坐的暖', '灯前相对的人'],
  温馨: ['灶边温着的汤', '窗内透出的光'],
  浪漫: ['灯下并坐的影', '风中交叠的袖'],
  甜蜜: ['唇边化开的糖', '眉眼弯起的弧'],
  感动: ['旧友捎来的信', '久别重逢的眼'],
  治愈: ['雨后晒暖的被', '夜里有灯的路'],
  清爽: ['山涧漱过的风', '晨露醒着的草'],
  清新: ['破晓的第一口氧', '林梢漫下的光'],
  自然: ['未施粉黛的颜', '本来的样子'],
  纯净: ['初落的那场雪', '未被惊扰的湖'],
  解暑: ['井底镇着的瓜', '风穿过堂的凉'],
  奢华: ['锦上绣的金线', '匣中藏的暖光'],
  高端: ['案头镇纸的沉', '门第之间的礼'],
  精致: ['榫卯咬合的木', '针脚藏起的细'],
  典雅: ['旧瓷上的青花', '宣纸晕开的墨'],
  尊贵: ['匣中养着的玉', '阶前让出的座'],
  有趣: ['案头转着的核桃', '屉里藏着的趣'],
  可爱: ['檐下打盹的猫', '掌心团着的暖'],
  活力: ['破土的新笋', '晨跑溅起的光'],
  潮流: ['檐下新挂的灯', '街角起的风'],
  个性: ['不与众同的一枝', '自成一派的山'],
  平静: ['止水无波的潭', '风过不惊的林'],
  放松: ['解开束发的带', '卸下肩头的力'],
  舒适: ['旧棉布衫的软', '靠椅承托的妥'],
  安逸: ['藤椅上半盏茶', '日影里的盹'],
  慢生活: ['日影西斜的午', '煮水听沸的闲'],
  孤独: ['一盏孤灯的影', '空山新雨的寂'],
  怀旧: ['抽屉里的相片', '旧磁带里的歌'],
  温暖: ['炉边烘着的袄', '手心里捂着的暖'],
  专注: ['案头不灭的灯', '屏息凝神的刻'],
  分享: ['几人围坐的暖', '分食一盏的乐'],
  送礼: ['千里寄来的羽', '裹了心意的小'],
  实用: ['称手的旧物', '随身的妥帖'],
  仪式感: ['净手焚香的刻', '启封那一刻的敬'],
  用餐时光: ['灶上咕嘟的汤', '筷落碗边的香'],
  // —— 商品级情绪词变体池 ——
  温润: ['炭火边煨着的暖', '壶里慢慢漾开的柔'],
  回甘: ['尾韵里浮起的甜', '咽下后迟迟的暖'],
  烟火: ['街角升起的喧', '油星里炸开的闹'],
  酣畅: ['敞开了喝的快', '撸袖子时的爽'],
  清润: ['晨起那口透', '毫无修饰的清'],
  鲜活: ['刚离枝的艳', '咬开溅起的亮'],
  微醺: ['泡沫漫过杯沿的白', '灯光里晃着的光'],
  轻盈: ['身体变轻的预感', '吃完一身松'],
  熨帖: ['慢火熬出的稠', '病中那碗暖'],
}

// =====================
// 2. 场景标签 → 点缀语（降权：不再主导起笔）
// =====================
const SCENE_TOUCH: Record<string, string[]> = {
  夏日: ['暑气正盛时，它是一阵穿堂的风。', '这样的天气里，遇到它像遇到了树荫。'],
  冬日: ['寒夜里捧着它，手心先暖了。', '天冷的时候，它比平时更让人想靠近。'],
  春秋: ['这个季节吃它，正当好时候。', '不冷不热的天，配它刚刚好。'],
  应季: ['当季的东西，鲜气是藏不住的。', '应时而食，身体很知道。'],
  节日: ['过节嘛，总想给自己一点好的。', '这样的日子，值得用心对待每一口。'],
  生日: ['生日这天，对自己好一点没毛病。', '属于自己的日子，挑自己喜欢的。'],
  约会: ['两个人坐着慢慢吃，比什么都强。', '对面坐着喜欢的人，手里的东西也更好吃了。'],
  聚会: ['几个人凑一起，它就是那个抢不到的那道。', '人多的时候，它总是先被注意到的。'],
  送礼: ['送人或者留着自己用，都说得过去。', '收到的人大概会多看两眼。'],
  自用: ['不用管别人怎么想，自己开心很重要。', '一个人安安静静地用它，也是一种享受。'],
}

// =====================
// 3. 商品属性词条库（大幅扩容 · 从 20→50+ 条）
// =====================
// 命中后融入文案，使描述从"通用意境"落到"该商品真实可感细节"。
// 格式：key = 可在商品名/描述/商家关键词中出现的属性词（|分隔同义词）
//       value = 可融入叙事的感官/体验短语池
const ATTRIBUTE_PHRASES: Record<string, string[]> = {
  // --- 口味酸甜 ---
  '酸甜': ['那一点恰到好处的酸甜，在舌尖先一步化开', '酸甜交叠，像日子给的小小回旋'],
  '甜': ['清甜的尾韵，迟迟不肯散去', '一口下去，甜味是克制的、不腻人的'],
  '酸': ['微酸的劲头，把困倦都激醒了', '酸得清爽，像咬了一口刚摘的果子'],
  '辣|香辣|麻辣|微辣': ['辣意从喉头漫开，整个人都通透了', '微辣提神，越吃越停不下'],
  '咸鲜|鲜美|鲜': ['鲜味是它很不需要强调的事', '一口下去，鲜味直冲天灵盖'],
  '苦|微苦|回甘|苦尽甘来': ['微微一点苦，后面全是回甘', '先抑后扬的味道，像一段有故事的经历'],

  // --- 口感质地 ---
  '多汁|汁水|爆汁': ['咬开的瞬间，汁水替你把渴意抚平', '丰盈的汁水，是它很诚实的邀约'],
  '酥脆|脆|香脆': ['齿间那一声脆，脆得人也轻了', '酥脆的响，是午后很熨帖的注脚'],
  '丝滑|绵密|柔滑|入口即化': ['滑过舌尖的温柔，几乎不必咀嚼', '绵密得像一段被放慢的时光'],
  '醇厚|浓郁|醇香|醇': ['醇厚的底味，越品越见心思', '浓郁里藏着耐品的余韵'],
  '冰凉|冰镇|清凉|冰': ['一口冰凉，把暑气按了下去', '凉意从喉头漫开，暑气也随之退场'],
  '绵软|软糯|松软|软': ['软糯的口感，像被云朵托住', '松软得，仿佛能接住所有疲惫'],
  'Q弹|弹牙|筋道': ['咬下去的弹，是它藏不住的诚意', '筋道的口感，越嚼越见真味'],
  '嫩|鲜嫩|细嫩|嫩滑': ['嫩得几乎化在嘴里，不用费劲嚼', '一口下去的嫩，是火候给的面子'],
  '爽口|爽脆|清爽不腻': ['爽口的质感，吃完不带一点负担', '清清爽爽，刚好解了嘴里的腻'],
  '绵柔|柔润|润': ['绵柔的触感，像被轻轻托住', '润得恰到好处，不给身体添负担'],
  '黏|糯叽叽|拉丝': ['黏糯的劲儿，是粮食本来的诚意', '拉丝的那一刻，周围人都看了过来'],
  '蓬松|松软|轻盈': ['蓬松得像云，一口下去就化了', '轻飘飘的口感，连心情也跟着轻了'],
  '浓郁|厚重|扎实': ['扎实的分量，一口下去很满足', '厚重的滋味，适合慢慢品'],

  // --- 食材关键词 ---
  '牛肉|牛腩|牛排|肥牛': ['牛肉的香是藏不住的，炖久了自己会跑出来', '肉纹里锁着的鲜，一口便知功夫深浅'],
  '猪肉|五花肉|排骨|瘦肉': ['猪肉炖透了，那层油香很勾人', '排骨上的肉，是很舍不得吐骨头的那种'],
  '鸡肉|鸡腿|鸡翅|鸡胸': ['鸡肉的嫩是火候给的，多一分老少一分生', '鸡皮微微焦黄的时候吃正合适'],
  '鱼|海鲜|虾|蟹|贝': ['海味自带一股子鲜，不用多余的佐料', '鱼肉的细腻，吃过的人都知道'],
  '鸡蛋|蛋|煎蛋|炒蛋': ['鸡蛋是这道菜的灵魂，嫩滑得恰到好处', '蛋香味混着其他食材，一口下去很满足'],
  '豆腐|豆制品|豆浆': ['豆腐吸满了汤汁，咬开全是味道', '豆香淡淡的，不抢戏但少不了'],
  '番茄|西红柿': ['番茄的酸甜融进每一口，开胃又解腻', '红红的番茄酱色，看着就有食欲'],
  '土豆|马铃薯|洋芋': ['土豆炖到绵软，入口即化的那种', '土豆是这道菜很踏实的底色'],
  '青菜|蔬菜|绿叶菜|时蔬': ['青菜的鲜甜是最后才尝到的惊喜', '绿油油的时蔬，整道菜的亮色'],
  '蘑菇|菌菇|香菇|金针菇': ['菌菇的鲜味是天然的味精', '菌子吸饱了汤汁，一口一个爆浆'],
  '面条|米粉|河粉|乌冬': ['面条的劲道要从汤里捞起来才对', '吸溜一口面，连带着汤一起暖进胃里'],
  '米饭|粥|稀饭': ['米香是很原始的安慰', '一碗白粥的妥帖，胜过许多花哨'],
  '面粉|面团|面皮': ['面皮的韧劲是手工擀出来的', '面粉的香气从蒸笼里飘出来时很诱人'],
  '水果|果肉|果粒': ['水果的甜是阳光给的，谁也仿不来', '大颗果粒咬开，汁水四溢'],
  '奶茶|咖啡|茶|拿铁': ['奶和茶的配比刚好，不甜不淡', '咖啡的苦之后那一抹回甘，很耐品'],
  '面包|蛋糕|甜点|甜品': ['刚出炉的香气，隔着包装都能闻到', '甜度的把控刚刚好，吃完一块还想第二块'],
  '芝士|奶酪|奶油': ['芝士的力量在于拉丝的那一刻', '奶香浓郁但不腻，是点睛之笔'],
  '巧克力|可可': ['巧克力的苦甜很抓人', '可可的香气悠长，回味无穷'],
  '坚果|杏仁|核桃|腰果': ['坚果的香是烤出来的，越嚼越香', '脆脆的坚果碎，丰富了整个口感层次'],
  '蜂蜜|糖|冰糖|白糖': ['蜂蜜的甜是温和的，不刺激', '一点点甜度提鲜，点到为止'],

  // --- 做法/工艺 ---
  '手工|手作|现做|现烤|现包': ['手作的温度，机器学不来', '每一道纹路里，都坐着做它的人'],
  '慢炖|炖|熬|煲汤|文火': ['慢炖出来的东西，时间就是很妙的调料', '文火慢煨，急不得——好味道都不急'],
  '煎|烙|铁板|烧烤|炭烤': ['煎出的那一层焦香，是整道菜的高光时刻', '炭火的香气渗进每一丝纹理里'],
  '凉拌|沙拉|冷盘|清爽': ['凉拌的妙处在于不抢食材的本味', '清清爽爽一盘，吃完身上不留烟火气'],
  '蒸|清蒸|粉蒸': ['蒸出来的原汁原味，是对食材很用心的尊重', '蒸汽锁住了所有鲜味，一滴没漏'],
  '炸|酥炸|油炸|干炸': ['外酥里嫩的火候，全在油温那几秒', '刚出锅的酥脆，放一分钟都可惜'],
  '腌制|腌|泡|卤|卤味': ['腌制入味的功夫，急不来', '卤香是时间的沉淀，越久越醇'],
  '发酵|酿|酵素|酸奶': ['发酵的风味是微生物写的诗', '时间的魔法藏在每一口里'],
  '烟熏|熏制|腊|腊味': ['烟熏的气息自带一种怀旧滤镜', '腊味的香，是冬天特有的记忆'],

  // --- 功效/适用（传统食养参考） ---
  '滋补|养生|营养|健康': ['一口一口，是把身子悄悄养好', '养分藏在滋味里，不声不响'],
  '补气血|补血|补气|元气': ['传统食养讲顺应时节，这一口正是时候', '暖身又暖心，是食物给的温柔'],
  '暖胃|养胃|护胃|调理': ['胃舒服了，人也就舒坦了', '温和的滋养，不给肠胃添负担'],
  '清热|去火|降火|解暑': ['暑热退去的那一刻，整个人都清爽了', '清清凉凉，是夏天很奢侈的感受'],
  '润燥|滋润|补水|保湿': ['润物细无声，皮肤都跟着亮堂些', '从内而外的润泽，比什么护肤品都实在'],
  '低糖|少糖|轻卡|轻食|低卡': ['轻盈的负担，给身体留白', '少一分甜腻，多一分轻松'],
  '高蛋白|蛋白质|增肌': ['满满的蛋白质，是身体很诚实的燃料', '吃得明白，身体才会给你反馈'],
  '有机|原生态|无添加|零添加|少添加': ['干净的配料表，吃着才安心', '少一点添加，多一分本真'],
  '产地|直采|源头|果园|农场|农场直供': ['从产地到你手里，路途都被诚意填满', '源头直采的鲜，绕过了许多弯路'],
  '新鲜|鲜|当日|现采': ['新鲜是它不说话的底气', '带着刚离枝的鲜气，扑面而来'],
  '大|饱满|扎实|个头': ['满满当当的分量，诚意肉眼可见', '扎实的个头，能抚凡人心'],

  // --- 香气/温度 ---
  '香|芬芳|清香|香气|浓香': ['一缕香气先到，勾着人走近', '香气是不请自来的温柔'],
  '暖|温热|热|温': ['温热的触感，从手心暖到心底', '一口温热，把寒凉轻轻挡在门外'],
  '冰|冰凉|冷|冻': ['冰凉的触感，像夏天短暂的一封情书', '凉意沁人，暑气全消'],

  // --- 其他 ---
  '辣|麻|花椒|藤椒': ['麻辣的刺激从舌尖传遍全身', '麻酥酥的感觉，越吃越过瘾'],
  '咖喱|咖喱粉|泰式': ['咖喱的香浓是层层递进的', '香料在嘴里跳了一场舞'],
  '蒜香|葱香|姜|葱姜蒜': ['葱姜蒜爆香的那一刻，整道菜就有了灵魂', '蒜香是不张扬但绝不能少的配角'],
  '五香|八角|桂皮|香料': ['香料慢炖渗入每一丝肌理', '五香味是时间的味道'],
}

function detectAttributes(product: Partial<Product>, explicit?: string[]): string[] {
  const keys = Object.keys(ATTRIBUTE_PHRASES).sort((a, b) => b.length - a.length)
  const matchText = (t: string): string[] => {
    const found: string[] = []
    for (const key of keys) {
      const alts = key.split('|')
      if (alts.some(a => a && t.includes(a))) found.push(key)
    }
    return found
  }
  const text = `${product.name || ''} ${product.description || ''}`
  if (explicit && explicit.length) {
    // 显式关键词也走 alt 匹配：把"酸辣"映射到"辣|香辣|麻辣|微辣"这类 key，
    // 避免直接返回非 key 字符串导致 ATTRIBUTE_PHRASES[key] 为 undefined 而崩溃。
    const fromExplicit = Array.from(new Set(explicit.flatMap(k => matchText(k))))
    if (fromExplicit.length) return fromExplicit
    // 显式词一个都没匹配上时，退回用商品名/描述扫描，保证不空属性
    if (text.trim()) return matchText(text)
    return []
  }
  if (!text.trim()) return []
  return matchText(text)
}

// =====================
// 4. 通用收束语（克制、无 CTA、无促销）
// =====================
const CLOSERS = [
  '趁热，趁鲜，好好享用。',
  '这一份，值得你慢下来细细品味。',
  '愿它在寻常日子里，给你一点超出预期的欢喜。',
  '不多说，吃过的人自然懂。',
  '如此，便已足够好了。',
  '只管收下这份妥帖。',
  '愿你一晌清欢，无事绊心。',
  '好的东西，不需要太多话。',
  '把日子过得有滋有味，从这一口开始。',
  '愿这片刻，能替你拂去一身的倦。',
  '慢一点品尝，也是一种福气。',
  '这便够你回味一阵子的了。',
  '愿你每次遇见它，都有初见时的欣喜。',
  '把寻常光景，过得温柔些。',
  '愿它陪你把一日的烦，散去大半。',
  '仅此一份，便已是赠予自己的好礼物。',
  '此心可寄，便不算虚度。',
  '你尽管慢一点，时光也会陪你慢下来。',
  '这样的好物，值得被认真对待。',
  '愿它不让你的期待落空。',
]

function pick<T>(arr: T[] | null | undefined, seed: number): T | undefined {
  if (!arr || arr.length === 0) return undefined
  return arr[((seed % arr.length) + arr.length) % arr.length]
}

function realmFor(moodTags: string[] | undefined, variant: number) {
  if (!moodTags || moodTags.length === 0) return undefined
  const tag = moodTags[variant % moodTags.length]
  return MOOD_REALM[tag] || MOOD_REALM[moodTags[0]]
}

function sceneTouch(sceneTags: string[] | undefined, variant: number): string | undefined {
  if (!sceneTags || sceneTags.length === 0) return undefined
  const tag = sceneTags[variant % sceneTags.length]
  const touches = SCENE_TOUCH[tag]
  return touches ? pick(touches, variant) : undefined
}

// =====================
// 5. 核心编译函数（v3 重构）
// =====================
function buildOne(
  product: Partial<Product>,
  moodTags: string[] | undefined,
  sceneTags: string[] | undefined,
  category: string | undefined,
  variant: number,
  attributes?: string[] | undefined,
): string {
  const name = product.name?.trim()
  // 商品名为空时给出明确提示而非生成"这件物事"废话
  if (!name) {
    return '请先填写商品名称，再生成情绪化描述——有了名字，文案才能写出它的模样。'
  }

  // 1) 解析类目策略
  const profile = resolveCategoryProfile(category)

  // 1.5) 解析商品级情绪词库（具体品类优先于品类泛化）
  //      命中时：情绪词并入有效集（且不被品类白名单裁剪，商品词已校验贴合），
  //      比喻/角度/主体模板/收束优先采用商品级条目。
  const px = resolveProductEmotionLexicon(name, product.description || '')

  // 2) 有效情绪标签
  let eff = moodTags || []
  if (px && px.moodTags && px.moodTags.length) {
    // 商品级情绪词优先，且不被品类 allowedMoodTags 白名单裁剪
    const set = new Set<string>([...(moodTags || []), ...px.moodTags])
    eff = Array.from(set)
  } else if (profile.allowedMoodTags && profile.allowedMoodTags.length) {
    const filtered = eff.filter(t => profile.allowedMoodTags.includes(t))
    if (filtered.length) eff = filtered
  }

  const realmInfo = realmFor(eff, variant)
  const realm = realmInfo?.realm || '妥帖'
  const realmTag = eff.length ? eff[variant % eff.length] : undefined
  const realmExtra = realmTag ? (REALM_METAPHOR_EXTRA[realmTag] || []) : []

  // 3) 比喻 / 叙事角度（商品级优先，品类级兜底）
  //    为弱化"模板感"，比喻/角度采用与主体模板错位的独立种子，
  //    使 body×metaphor×angle 组合随 variant 展开（确定性不变，同商品同 variant 输出稳定）。
  const catMetaphors = (px?.metaphors && px.metaphors.length ? px.metaphors
    : (profile.metaphors && profile.metaphors.length ? profile.metaphors : null))
  const fallbackMetaphor = pick([realmInfo?.metaphor || '一味好食', ...realmExtra], variant)
  const metaphor = catMetaphors
    ? catMetaphors[(((variant * 3 + 1) % catMetaphors.length) + catMetaphors.length) % catMetaphors.length]
    : fallbackMetaphor
  const catAngles = (px?.angles && px.angles.length ? px.angles
    : (profile.angles && profile.angles.length ? profile.angles : null))
  const angle = catAngles
    ? catAngles[(((variant * 5 + 2) % catAngles.length) + catAngles.length) % catAngles.length]
    : ''

  // 4) 主体模板（bodyTemplates）—— 商品级优先，品类级兜底，最后通用兜底
  const catBodies = (px?.bodyTemplates && px.bodyTemplates.length ? px.bodyTemplates
    : (profile as any).bodyTemplates as string[] | undefined)
  const genericBodies = buildGenericBodies(name, metaphor, realm, angle)

  // 5) 商品属性感知
  const detected = detectAttributes(product, attributes)
  const attrKey = detected.length ? detected[variant % detected.length] : undefined
  const attrPhrase = attrKey ? pick(ATTRIBUTE_PHRASES[attrKey], variant) : undefined
  // 属性短语是完整句子，统一以"句号"注入，避免与模板后续文本粘连成病句
  const attrText = attrPhrase ? attrPhrase + '。' : ''

  // 6) 场景点缀语（降权：不再是主导起笔）
  const touch = sceneTouch(sceneTags, variant)

  // ===== 组装逻辑 =====
  let bodies = catBodies && catBodies.length > 0 ? catBodies : genericBodies

  // 替换所有占位符（{attr} 始终以完整句子 + 句号注入，避免与后续文本粘连成病句）
  bodies = bodies.map(b =>
    b
      .replace(/\{name\}/g, name)
      .replace(/\{metaphor\}/g, metaphor)
      .replace(/\{realm\}/g, realm)
      .replace(/\{angle\}/g, angle)
      .replace(/\{attr\}/g, attrText)
      .replace(/\。\s*\。/g, '。') // 清理属性句末句号与模板句号叠加
      .replace(/\s*[，,]\s*[。]/g, '。') // 清理残留标点
  )

  const body = pick(bodies.filter(b => b.trim()), variant)
  const closers = (px?.closers && px.closers.length ? px.closers
    : (profile.closers && profile.closers.length ? profile.closers : CLOSERS))
  const closer = pick(closers, variant)

  // 最终拼接：[主体描述] + [可选场景点缀] + [收束]
  const parts = [body]
  if (touch && !body.includes(touch)) parts.push(touch)
  parts.push(closer)

  return parts.join(' ')
}

// =====================
// 6. 通用主体模板（无类目匹配时的兜底 · v3 大幅增强）
// =====================
// 这些模板强制包含商品名(name)+感官/功能描述，不再是纯意境诗。
// 占位符: {name}=商品名 {metaphor}=比喻 {realm}=意境词 {angle}=类目角度 {attr}=属性短语
function buildGenericBodies(name: string, metaphor: string, realm: string, angle: string): string[] {
  return [
    `{name}端上来的时候，{metaphor}似的妥帖——{attr}热气还没散，{realm}已经先到了。`,
    `第一口{name}下去，{attr}{metaphor}般的{realm}漫上来，{angle}停不下筷子。`,
    `说不出哪里好，就是想吃{name}——{metaphor}，{realm}得刚刚好。{attr}`,
    `忙了一整天，总想念的还是这口{name}。{attr}{metaphor}，{realm}。`,
    `{name}的妙处不在花哨，而在{attr}每一口都实实在在——像{metaphor}，不骗人。`,
    `有人专程为这碗{name}而来，{attr}吃过便懂了——{metaphor}般的{realm}，{angle}值得。`,
    `食材老实，火候到位，{name}就是这样让人放心。{attr}{metaphor}，{realm}。`,
    `不用多说，{name}自己会说话——{attr}{metaphor}似的，{realm}写在脸上。`,
    `冷了也好吃，热了更对味，{name}就是这么随和。{attr}{realm}，像{metaphor}。`,
    `一家人围着{name}坐，话多了，笑也多了——{metaphor}，{realm}。{attr}`,
    `{name}不是那种惊艳型的好吃，而是{attr}越吃越对味的{realm}——像{metaphor}，经得住日子。`,
    `朋友问今天吃什么，脑子里第一个蹦出来的是{name}——{attr}它就是这么有存在感。`,
    `打包一份{name}带走吧，{attr}回家路上想着都开心——{metaphor}，{realm}。`,
    `别看外表普通，{name}的内里藏着大讲究。{attr}{metaphor}，{realm}。`,
    `吃到最后一口还在回味，{name}就是有这种本事。{attr}{realm}，恰如{metaphor}。`,
  ]
}

// =====================
// 7. 无标签时的增强兜底（v3：仍产出商品特征文案）
// =====================
function fallbackLine(product: Partial<Product>): string {
  const name = product.name?.trim()
  if (!name) {
    return '请先填写商品名称，再生成情绪化描述——有了名字，文案才能写出它的样子。'
  }
  const detected = detectAttributes(product)
  if (detected.length) {
    const phrase = pick(ATTRIBUTE_PHRASES[detected[0]], 0)
    if (phrase) return `${name}，${phrase}。值得一试的好东西，慢慢品味便知。`
  }
  // 即使没有任何属性命中，也要围绕商品名写出可读文案
  const genericLines = [
    `${name}，实实在在的好东西——不用多说，吃过的人自然懂。`,
    `${name}，食材老实、火候到位，每一口都对得起等待。`,
    `${name}，不是那种花哨的，但就是让人惦记。`,
    `${name}，冷了好吃热了对味，就是这么随和。`,
    `${name}，专治各种"不知道吃什么"——选它不会错。`,
  ]
  return pick(genericLines, Math.abs(product.name?.charCodeAt(0) ?? 0))
}

// =====================
// 8. 公开 API（接口不变，内部重构）
// =====================

/**
 * 生成单条「情绪编译」商品文案（确定性，商品详情页主叙事用）。
 * @param category 门店类目（Store.category），用于驱动品类感知编译；不传则走通用策略。
 * @param attributes 商品属性关键词（可选，显式指定以更贴合商品，优先级高于自动扫描）。
 * @param variant 候选变体序号（确定性，不同序号产出不同文案）。
 */
export function generateEmotionDescription(
  product: Partial<Product>,
  moodTags: string[] = [],
  sceneTags: string[] = [],
  category?: string | null,
  attributes?: string[] | null,
  variant: number = 0,
): string {
  if (moodTags.length === 0 && sceneTags.length === 0) {
    return fallbackLine(product)
  }
  return buildOne(product, moodTags, sceneTags, category ?? undefined, variant, attributes ?? undefined)
}

/**
 * 为五屏情绪详情页生成商品专属三阶段文案（降级路径用）。
 *
 * 设计目标：
 *   - 每个商品进入五屏时看到不同的情绪内容（不再全走硬编码默认值）
 *   - 屏1 场景共鸣 → 带商品名的场景化问句
 *   - 屏2 状态确认 → 商品锚定的情绪潜台词
 *   - 屏3 已有商品名展示（本函数不覆盖）
 *   - 屏4 身份确认 → 与该商品品类关联的身份标签
 *   - 屏5 已是商品事实卡（本函数不覆盖）
 *
 * 实现方式：用 buildOne 引擎按 3 个 variant 各生成一条文案，
 * 再按各屏语用裁剪为 stage1/stage2/stage3。
 */
export function generateEmotionStages(
  product: Partial<Product>,
  moodTags: string[] = [],
  sceneTags: string[] = [],
  category?: string | null,
): { stage1: string; stage2: string; stage3: string; title: string } {
  const name = product.name?.trim()
  if (!name) {
    return {
      stage1: '想给自己一点温柔？',
      stage2: '明明很累了，又不想随便对付自己？',
      stage3: '懂得好好照顾自己的人',
      title: '情绪之旅',
    }
  }

  const cat = category ?? undefined

  // 用 3 个 variant 生成三条不同角度的商品文案
  const line0 = generateEmotionDescription(product, moodTags, sceneTags, cat, undefined, 0)
  const line1 = generateEmotionDescription(product, moodTags, sceneTags, cat, undefined, 1)
  const line2 = generateEmotionDescription(product, moodTags, sceneTags, cat, undefined, 2)

  // 裁剪策略：
  //   stage1 取 line0 的前半句（场景问句感），确保包含商品名
  //   stage2 取 line1 的核心情绪句（状态确认感）
  //   stage3 从 line2 提取或生成身份认同句
  const stage1 = truncateToQuestion(line0, name)
  const stage2 = truncateToConfirmation(line1, name)
  const stage3 = extractIdentity(line2, name)

  // title 从类目或首条情绪标签衍生
  const profile = resolveCategoryProfile(cat)
  const title = deriveTitle(profile, moodTags, name)

  return { stage1, stage2, stage3, title }
}

/** 将文案裁剪为「场景共鸣问句」（~20字以内，带商品名，问号收尾） */
function truncateToQuestion(text: string, name: string): string {
  // 尝试找第一个问号/句号/感叹号，取之前的内容
  const sentences = text.split(/[。！？]/).filter(s => s.trim())
  if (sentences.length >= 1) {
    const first = sentences[0].trim()
    // 如果第一句已经包含商品名且长度合适，直接加问号使用
    if (first.includes(name) && first.length <= 30 && !first.endsWith('。')) {
      return first.includes('？') ? first : first + '？'
    }
    // 否则用第一句 + 商品名重组成问句
    return `${name}，${first.length > 15 ? first.slice(0, 15) + '…' : first}，对吗？`
  }
  return `${name}，此刻正合你意？`
}

/** 将文案裁剪为「情绪状态确认句」（第二人称，描述当下感受） */
function truncateToConfirmation(text: string, name: string): string {
  const sentences = text.split(/[。！？]/).filter(s => s.trim())
  if (sentences.length >= 2) {
    const second = sentences[1].trim()
    if (second.length <= 28 && !second.includes(name)) {
      return second
    }
  }
  // 用第二句或重组
  const candidate = sentences.length >= 2 ? sentences[1].trim() : sentences[0]?.replace(name, '').trim() || ''
  if (candidate.length >= 4) {
    return candidate.length > 26 ? candidate.slice(0, 26) + '…' : candidate
  }
  // 终极兜底：基于商品名生成差异化的状态确认
  const seeds = [
    `其实你想要的，就是一份像${name}这样踏实的妥帖。`,
    `这个时候想起${name}，说明你对自己挺好的。`,
    `不是随便什么都行——你心里想要的是${name}这样的。`,
    `选${name}的人，都知道自己在选什么。`,
  ]
  return seeds[Math.abs(name.charCodeAt(0)) % seeds.length]
}

/** 从文案中提取或派生「身份认同句」 */
function extractIdentity(text: string, name: string): string {
  // 尝试提取含"懂/会/愿意/是…的人"的句子
  const identityMatch = text.match(/[^。]*?(懂|会|愿意|知道|值得|配)[^。]{0,10}人[^。]*/);
  if (identityMatch) {
    const id = identityMatch[0].trim();
    if (id.length <= 24) return id;
  }
  // 派生：基于商品名哈希选择身份句
  const identities = [
    `你是懂得好好照顾自己的人`,
    `你是再忙也会给自己留点空间的人`,
    `你是愿意为这份踏实买单的人`,
    `你是知道自己要什么的人`,
    `你是会把日子过得有滋味的人`,
    `你是不会随便将就的人`,
  ]
  return identities[Math.abs(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % identities.length]
}

/** 衍生五屏标题 */
function deriveTitle(
  profile: any,
  moodTags: string[],
  name: string,
): string {
  if (moodTags.length) return `${moodTags[0]}之旅`
  // 按类目给不同标题
  const catTitles: Record<string, string> = {
    餐饮: '味觉之旅', 饮品: '一杯子的治愈', 烘焙: '甜暖时光',
    '水果生鲜': '自然的馈赠', 零售: '生活小确幸', 美业: '宠爱自己',
    娱乐: '放空时刻', 运动健身: '活力重启', 亲子: '童真时光',
    生活服务: '舒适圈', 酒店民宿: '栖息之地',
  }
  if (profile?.key && catTitles[profile.key]) return catTitles[profile.key]
  return '情绪之旅'
}

/**
 * 生成多条候选「情绪编译」商品文案（供商家后台挑选，确定性）。
 * @param category 门店类目，用于驱动品类感知编译。
 * @param attributes 商品属性关键词（可选，显式指定以更贴合商品）。
 */
export function generateEmotionDescriptions(
  product: Partial<Product>,
  moodTags: string[] = [],
  sceneTags: string[] = [],
  count: number = 3,
  category?: string | null,
  attributes?: string[] | null,
): string[] {
  // 名称空时直接返回提示（不要产出一堆"请先填写名称"的重复项）
  if (!product.name?.trim()) {
    return ['请先填写商品名称，再生成情绪化描述——有了名字，文案才能写出它的模样。']
  }
  if (moodTags.length === 0 && sceneTags.length === 0) {
    return [fallbackLine(product)]
  }
  const cat = category ?? undefined
  const attrs = attributes ?? undefined
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const line = buildOne(product, moodTags, sceneTags, cat, i, attrs)
    if (!out.includes(line)) out.push(line)
  }
  // 候选不足时补足（换不同 variant 继续生成）
  let k = count
  while (out.length < count) {
    const line = buildOne(product, moodTags, sceneTags, cat, k, attrs)
    if (!out.includes(line)) out.push(line)
    k++
  }
  return out
}

// =====================
// 9. 情绪卖点标题引擎（v3.1 新增 · 给每条正文配"货架感"小标题）
// =====================
// 设计目标：
//   - 商家工作台「换一版」时，每条候选除了正文，还能看到一句「卖点短标题」
//     （emoji + 情绪修饰短句），让文案在货架/详情页更有导购感、更易一眼分辨角度。
//   - 高频情绪用语义定制的短标题池（最自然），其余情绪走「emoji + realm 通用模板」兜底。
//   - 确定性：相同输入 + variant → 同一标题。

const MOOD_HEADLINE_EMOJI: Record<string, string> = {
  快乐: '😊', 兴奋: '🎉', 满足: '🍽️', 惊喜: '✨', 幸福: '💛', 温馨: '🏠',
  浪漫: '🌹', 甜蜜: '🍯', 感动: '🥹', 治愈: '🩹', 清爽: '🍃', 清新: '🌿',
  自然: '🌾', 纯净: '❄️', 解暑: '🧊', 奢华: '👑', 高端: '🏛️', 精致: '💎',
  典雅: '🏺', 尊贵: '💠', 有趣: '🎈', 可爱: '🐾', 活力: '⚡', 潮流: '🔥',
  个性: '🎯', 平静: '🧘', 放松: '🛁', 舒适: '☁️', 安逸: '🍵', 慢生活: '📖',
  孤独: '🌙', 怀旧: '📻', 温暖: '🔥', 专注: '🎧', 分享: '👥', 送礼: '🎁',
  实用: '🧰', 仪式感: '🕯️', 用餐时光: '🍲',
  // 商品级情绪词
  温润: '🍵', 回甘: '🌿', 安神: '🌙', 围炉: '🔥', 清冽: '💧', 鲜爽: '🌱',
  醒神: '☕', 陈香: '🫖', 温养: '🍲', 兰香: '🌸', 回韵: '🍃', 醇苦: '☕',
  甜润: '🥤', 欢聚: '👯', 鲜活: '🍓', 清润: '💧', 本真: '⚪', 通透: '🔆',
  零负担: '🍃', 烟火: '🔥', 酣畅: '🍻', 热络: '🤝', 释放: '🎈', 沸腾: '♨️',
  热闹: '🎉', 围聚: '🍲', 微醺: '🍷', 畅快: '🥂', 优雅: '🍷', 酥香: '🥜',
  轻盈: '🥗', 自律: '💪', 熨帖: '🍜', 甜慰: '🍮', 甜宠: '🧁', 麦香: '🥐',
  酥软: '🥐', 晨光: '🌅', 小确幸: '✨',
}

// 高频情绪：语义定制短标题池（2-3 条，确定性轮换）
const HEADLINE_CUSTOM: Record<string, string[]> = {
  治愈: ['被温柔接住的时刻', '一身倦意，慢慢化开', '给疲惫一个软着陆'],
  满足: ['一口就松下来的满足', '踏实，是它给的', '刚刚好，不多不少'],
  温馨: ['像家一样的妥帖', '灶上的暖，心里的安', '有人等你回家的感觉'],
  甜蜜: ['甜得很有分寸', '心尖上化开的一点甜', '甜而不腻的欢喜'],
  浪漫: ['柔情都藏在细节里', '恰似帘外那一钩月', '温柔得刚刚好'],
  幸福: ['圆满，不过如此', '这一刻，刚刚好', '恰到好处的圆满'],
  惊喜: ['不期而遇的小欢喜', '转角撞见的意外之喜', '意料之外的心动'],
  清爽: ['一口就把暑气压下去', '清清爽爽，不带负担', '像山涧吹来的凉风'],
  温暖: ['从手心暖到心底', '一点暖意，足以御寒', '被妥帖照料的暖'],
  放松: ['紧绷的那根弦，松了', '卸下肩头的一身力', '松弛下来的自在'],
  活力: ['整个人都轻快起来', '像破土的新笋，充满劲', '元气满满的开始'],
  精致: ['匠心都藏在细节里', '处处讲究，不将就', '一眼就懂的质感'],
  怀旧: ['旧时光的味道回来了', '像翻到抽屉里的老照片', '记忆里的那一口'],
  分享: ['几人围坐，暖意更浓', '好东西，要有人一起尝', '分食一盏的乐'],
  送礼: ['千里寄来的一分心意', '体面又走心的好礼', '收到的人会懂'],
  舒适: ['像被旧棉布衫裹住', '熨帖，不用费力', '妥帖得刚刚好'],
}

// 通用兜底模板（含占位符，运行时替换 emoji/realm）
const HEADLINE_FALLBACK_PATTERNS = [
  '一味{realm}的妥帖',
  '恰是你要的{realm}',
  '{realm}得刚刚好',
  '专属于你的{realm}',
]

/**
 * 为某条情绪文案生成「卖点短标题」（emoji + 情绪修饰短句）。
 * 确定性：相同 product/mood/scene/category + variant → 同一标题。
 */
export function generateEmotionHeadline(
  product: Partial<Product>,
  moodTags: string[] = [],
  sceneTags: string[] = [],
  category?: string | null,
  variant: number = 0,
): string {
  const profile = resolveCategoryProfile(category ?? undefined)
  const px = resolveProductEmotionLexicon(product.name || '', product.description || '')
  let eff = moodTags || []
  if (px && px.moodTags && px.moodTags.length) {
    // 商品级情绪词优先，不被品类白名单裁剪
    const set = new Set<string>([...(moodTags || []), ...px.moodTags])
    eff = Array.from(set)
  } else if (profile.allowedMoodTags && profile.allowedMoodTags.length) {
    const filtered = eff.filter(t => profile.allowedMoodTags.includes(t))
    if (filtered.length) eff = filtered
  }
  const tag = eff.length ? eff[variant % eff.length] : undefined
  const emoji = (tag && MOOD_HEADLINE_EMOJI[tag]) || '✨'

  // 高频情绪走定制池（最自然、最贴合语境）
  if (tag && HEADLINE_CUSTOM[tag]) {
    const custom = pick(HEADLINE_CUSTOM[tag], variant) || ''
    return `${emoji} ${custom}`
  }
  // 其余情绪：emoji + realm 通用模板兜底
  const realm = (tag && MOOD_REALM[tag]?.realm) || '妥帖'
  const tpl = pick(HEADLINE_FALLBACK_PATTERNS, variant) || HEADLINE_FALLBACK_PATTERNS[0]
  return `${emoji} ${tpl.replace('{realm}', realm)}`
}

/**
 * 生成带卖点标题的候选列表（标题 + 正文），供工作台「换一版」展示。
 * 与 generateEmotionDescriptions 同序（同 variant 对应同一条正文）。
 */
export function generateEmotionCopyList(
  product: Partial<Product>,
  moodTags: string[] = [],
  sceneTags: string[] = [],
  count: number = 3,
  category?: string | null,
  attributes?: string[] | null,
): Array<{ headline: string; body: string }> {
  const bodies = generateEmotionDescriptions(product, moodTags, sceneTags, count, category, attributes)
  return bodies.map((body, i) => ({
    headline: generateEmotionHeadline(product, moodTags, sceneTags, category, i),
    body,
  }))
}
