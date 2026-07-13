-- ============================================================
-- 一键执行版：00073 + 00074 合并
-- 作用：
--   1) 补种 9 个 emo_* 情绪态徽章定义（修 409 / 23503 外键，徽章可发放）
--   2) 给 category_emotion_profiles 加 body_templates 列并种入 11 业态模板（修 400，云端改词生效）
-- 执行方式（二选一）：
--   A. Supabase Dashboard → SQL Editor 粘贴本文件全文 → Run
--   B. 本机终端：supabase db push   （会自动按编号顺序执行 00073 / 00074）
-- 幂等：可重复执行，无副作用。
-- ============================================================

-- ============================================
-- 00073 补种情绪态徽章定义（修复 409 / 23503 外键硬故障）
-- ============================================
-- 背景：
--   前端 src/db/api.ts 的 EMOTION_BADGE_MAP + resolveBadge() 在每次「情绪确权」时，
--   按用户所选情绪态（或兜底）发放一枚「情绪态徽章」，badge_code 形如：
--     emo_relax / emo_heal / emo_calm / emo_brave / emo_warm /
--     emo_miss / emo_joy / emo_free / emo_first
--   但 00053_create_emotion_assets_and_badges.sql 的种子只写了「里程碑徽章」
--   （first_claim / five_emotions / empath / tongbao_100 / share_claim），
--   缺全部 9 个 emo_* 情绪态徽章定义。
--
--   后果：emotion_badge_grants 表对 badge_code 有
--     REFERENCES emotion_badge_defs(code)
--   外键约束，前端 INSERT emo_first 等时触发 23503「Key (badge_code)=(emo_first)
--   is not present in table "emotion_badge_defs"」→ POST 返回 409，徽章永远发不出去。
--
-- 修复：把缺失的 9 个 emo_* 徽章定义补种进 emotion_badge_defs（与 00053 同结构）。
-- 已有的 first_claim 等里程碑徽章不受影响（ON CONFLICT DO NOTHING）。
-- 幂等：可重复执行；supabase db push / Dashboard SQL Editor 均可。
-- ============================================

INSERT INTO public.emotion_badge_defs
  (code, name, description, icon, rarity, unlock_hint, sort_order)
VALUES
  ('emo_first', '初识情绪', '完成首次情绪确权',               '🎭', 'common', '在情绪确权页确认 1 次商品情绪',        11),
  ('emo_relax', '松弛时刻', '确权商品带来松弛感',             '🌿', 'common', '选择「松弛」情绪并完成确权',          12),
  ('emo_heal',  '治愈微光', '确权商品带来治愈感',             '✨', 'common', '选择「治愈」情绪并完成确权',          13),
  ('emo_calm',  '安宁片刻', '确权商品带来平静感',             '🍃', 'common', '选择「平静」情绪并完成确权',          14),
  ('emo_brave', '勇敢一刻', '确权商品带来勇气感',             '🔥', 'rare',   '选择「勇敢」情绪并完成确权',          15),
  ('emo_warm',  '温暖相伴', '确权商品带来温暖感',             '☀️', 'common', '选择「温暖」情绪并完成确权',          16),
  ('emo_miss',  '思念悠悠', '确权商品唤起思念',               '🌙', 'rare',   '选择「思念」情绪并完成确权',          17),
  ('emo_joy',   '喜悦绽放', '确权商品带来喜悦',               '🌸', 'common', '选择「喜悦」情绪并完成确权',          18),
  ('emo_free',  '自由之心', '确权商品带来自由感',             '🕊️', 'rare',   '选择「自由」情绪并完成确权',          19)
ON CONFLICT (code) DO NOTHING;

-- ========== 自校验（执行后应返回 9） ==========
-- SELECT count(*) AS emo_seed_count
--   FROM public.emotion_badge_defs
--   WHERE code LIKE 'emo_%';          -- 期望 9

COMMENT ON TABLE public.emotion_badge_defs IS
  '情绪徽章定义字典：含 5 枚里程碑徽章(first_claim/five_emotions/empath/tongbao_100/share_claim) + 9 枚情绪态徽章(emo_*)，前端按确权情绪态发放 emo_*、按累计行为发放里程碑徽章';

-- ============================================
-- 00074 给 category_emotion_profiles 增加 body_templates 列并种入真实模板
-- ============================================
-- 背景：
--   前端 src/utils/category-emotion.ts 的 11 业态策略各含 bodyTemplates（类目专属产品描述模板，
--   含 {name}/{metaphor}/{realm}/{attr}/{angle} 占位符），编译引擎 emotion-description.ts 优先消费它。
--   但 00040 / 00071 建表与种子都漏建 body_templates 列，前端 SELECT 它时返回 400
--   （code 42703 "column body_templates does not exist"），随后降级为内置策略（功能不崩，但云端改词失效）。
--   本迁移补列 + 种入与前端内置完全一致的模板，使云端策略与内置策略对齐，400 消除。
-- 幂等：ADD COLUMN IF NOT EXISTS + UPDATE（无冲突风险）。
-- ============================================

-- 1) 补列（已存在则跳过）
ALTER TABLE public.category_emotion_profiles
  ADD COLUMN IF NOT EXISTS body_templates JSONB DEFAULT '[]'::jsonb;

-- 2) 种入 11 业态 bodyTemplates（与前端 CATEGORY_EMOTION_MAP 完全一致）
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}端上桌时热气还冒着，{attr}第一口下去整个人就松了——像{metaphor}，{realm}得刚刚好。","忙了一整天，最惦记的还是这口{name}。{attr}{metaphor}似的{realm}，{angle}","{name}不是那种花哨的好吃，而是{attr}每一口都实实在在——{metaphor}，不骗人。","食材老实、火候到位，{name}就是这样让人放心。{attr}吃进嘴里，{realm}从胃里漫上来。","有人专程为这碗{name}而来，吃过便懂了——{attr}{metaphor}般的{realm}，{angle}值得专门跑一趟。","冷了也好吃热了更对味，{name}就是这么随和的一道菜。{attr}{realm}，像{metaphor}。","一家人围着{name}坐下，话多了笑也多了。{attr}{metaphor}，{angle}这就是日子该有的样子。","别看外表普通，{name}的内里藏着大讲究——{attr}{metaphor}般的{realm}，越品越有味道。","打包一份{name}带回去吧，{attr}到家路上想着都开心——{metaphor}，{realm}。","吃到最后一口还在回味，{name}就是有这种本事。{attr}{realm}恰如{metaphor}，{angle}","{name}的妙处不在摆盘，而在{attr}入口那一刻的踏实感——像{metaphor}，{realm}写在脸上。","朋友问今天吃什么，脑子里第一个蹦出来的就是{name}——{attr}它就是这么有存在感。"]'::jsonb
  WHERE category_key = '餐饮';
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}端上来的时候，杯壁还挂着水珠——{attr}第一口下去，{metaphor}般的{realm}从喉头漫开，{angle}","下午三点的那一杯{name}，比什么提神饮料都管用。{attr}{metaphor}，{realm}得刚刚好。","吸管搅动{name}的那一刻，{attr}冰块轻轻碰响——像{metaphor}，{realm}。","不是那种甜到发腻的饮品，{name}的甜是克制的、有层次的。{attr}{metaphor}，{angle}慢慢喝才有味道。","捧着{name}走在街上，手心先暖了——{attr}{metaphor}似的温度，{realm}从指尖传遍全身。","夏天没有{name}是不完整的。{attr}一口冰凉下去，暑气退了一半——像{metaphor}，{realm}。","冬天的一杯热{name}，{attr}握在手里就不想放下。{metaphor}般的暖意，{realm}得恰到好处，{angle}","{name}的秘密在于配比——不多不少，每一口都是刚刚好的{realm}。{attr}{metaphor}，{angle}","朋友聚会点了{name}上桌，{attr}大家都不约而同地先拍了照——好看又好喝，像{metaphor}。","加班到深夜，最想念的还是这杯{name}。{attr}{metaphor}，{realm}——明天的事明天再说吧。","冷泡和热饮都好喝，{name}就是这么不挑场景。{attr}{realm}，像{metaphor}一样随和。"]'::jsonb
  WHERE category_key = '饮品';
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}刚出炉的时候，整个屋子都是香气。{attr}外皮酥得掉渣、内里软得像云——{metaphor}，{realm}。","早餐能吃到{name}，这一天就有了好的开始。{attr}{metaphor}般的甜度，{angle}{realm}得刚刚好。","下午茶来一块{name}，配一杯热饮，{attr}比什么治愈系电影都管用——像{metaphor}，{realm}。","{name}的甜不是那种齁甜，而是{attr}恰到好处地停在舌尖上——{metaphor}般的分寸感，{angle}","隔着包装袋都能闻到{name}的香气。{attr}拆开的那一刻，{metaphor}般的{realm}扑面而来。","手工揉面的温度是机器模仿不来的，{name}每一层都有故事。{attr}{metaphor}，{realm}。","带一盒{name}去见朋友吧，{attr}它就是那种\"打开后所有人都哇一声\"的好东西——{metaphor}。","{name}放凉了也好吃，但刚出炉的那几分钟是黄金时间。{attr}{metaphor}，{angle}趁热尝一口就知道了。","孩子看到{name}走不动路是有原因的——{attr}酥皮/糖霜/奶油的搭配太犯规了，像{metaphor}。","加班饿了来一块{name}，{attr}血糖回升的同时心情也跟着好了——{metaphor}般的{realm}，{angle}","做{name}的人一定很用心，因为每一口都吃得出诚意。{attr}{metaphor}，{realm}。"]'::jsonb
  WHERE category_key = '烘焙';
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}拿到手的时候还带着露水般的鲜气，{attr}咬开的瞬间——{metaphor}，{realm}从舌尖漫遍全身。","当季吃{name}是最对的选择，{attr}阳光和雨水都在这口里了——像{metaphor}，{angle}{realm}得刚刚好。","不需要复杂料理，{name}洗干净直接吃就是最好的吃法。{attr}{metaphor}般的纯粹，{realm}。","给孩子带一份{name}回家吧，{attr}比什么零食都健康——新鲜、天然、像{metaphor}一样让人放心。","水果摊上挑来挑去，最后还是{name}最对味。{attr}一口下去就知道为什么了——{metaphor}，{realm}。","{name}的颜色就够诱人了，{attr}切开来更是晶莹剔透——摆盘都舍不得动，像{metaphor}。","夏天冰箱里常备{name}，拿出来的时候连呼吸都清爽了。{attr}{metaphor}般的凉意，{angle}{realm}。","送礼送{name}很体面——{attr}包装精美不说，东西本身也拿得出手，像{metaphor}。","榨汁/拌沙拉/直接啃，{name}怎么吃都行。{attr}{metaphor}般的百搭，{realm}不挑剔。","产地直采的{name}确实不一样，{attr}那种\"刚离枝\"的劲儿是超市货比不了的——{metaphor}，{angle}"]'::jsonb
  WHERE category_key = '水果生鲜';
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}拿到手的那一刻就让人嘴角上扬——{attr}质感比图片还好，{metaphor}般的{realm}，{angle}","逛着逛着就被{name}吸引过去了，{attr}实物比想象中更有分量——像{metaphor}，{realm}。","送给自己的小礼物不需要理由，{name}就是那种{attr}看到就想带回家的好东西。{metaphor}，{angle}","桌案上摆一件{name}，{attr}整个空间的气质都不一样了——{metaphor}般的点睛之笔，{realm}。","{name}的设计感藏在小细节里，{attr}越用越觉得用心——像{metaphor}，日子也被温柔对待了。","朋友来家里做客总会问起这件{name}，{attr}它就是有这种\"不张扬但抢眼\"的魔力——{metaphor}。","拆{name}包装的过程本身就是一种享受，{attr}每一层都是仪式感——{metaphor}般的期待，{angle}{realm}。","日常用得到的东西才最值得买好的，{name}就是这样的存在。{attr}{metaphor}，{realm}陪你度过每一天。","没想到这么实用的东西也可以这么好看——{name}，{attr}{metaphor}，{angle}实用和颜值都有了。","给朋友挑礼物的时候看到{name}就走不动了，{attr}\"Ta一定会喜欢\"的直觉很少出错——像{metaphor}。"]'::jsonb
  WHERE category_key = '零售';
UPDATE public.category_emotion_profiles
  SET body_templates = '["做完{name}走出店门的那一刻，整个人都轻盈了——{attr}{metaphor}般的{realm}，{angle}连走路都带风。","{name}的过程本身就是一种享受，{attr}每一寸都被温柔对待——像{metaphor}，{realm}从皮肤漫到心里。","好久没有这样认真地对待自己了，一次{name}刚好找回那种被珍视的感觉——{metaphor}，{angle}","{name}的效果不是立竿见影的那种夸张，而是{attr}几天后发现\"咦好像真的不一样了\"——{metaphor}般的惊喜。","朋友问最近气色怎么这么好，答案就是{name}。{attr}{metaphor}，{angle}它就是有这种润物细无声的本事。","忙碌的日子里抽一小时做{name}，{attr}不是奢侈是刚需——{metaphor}般的充电，{realm}回来又是满血状态。","选{name}就是选一份安心，{attr}手法/产品/环境每一样都经得起细看——像{metaphor}，值得托付。","第一次尝试{name}有点紧张，但体验完就明白了为什么那么多人推荐——{attr}{metaphor}，{angle}真香。","重要场合前做一次{name}，{attr}整个人都亮了一度——自信是最好的化妆品，而{name}帮你打底。","把{name}当作定期给自己的礼物吧，{attr}坚持下来你会发现变化——由内而外的{realm}，像{metaphor}。"]'::jsonb
  WHERE category_key = '美业';
UPDATE public.category_emotion_profiles
  SET body_templates = '["约上朋友来一场{name}吧，{attr}比刷手机有意义多了——{metaphor}般的{realm}，{angle}笑到脸酸才过瘾。","{name}的现场感是任何屏幕都替代不了的，{attr}身临其境的那一刻——像{metaphor}，所有烦恼都被抛在脑后。","工作了一周最期待的就是{name}，{attr}{metaphor}般的释放，{angle}出来之后整个人都轻了。","第一次玩{name}有点放不开，但五分钟后就嗨了——{attr}{metaphor}，{realm}它就是有这种感染力。","带家人来体验{name}吧，{attr}老少皆宜、全员参与——{metaphor}般的欢乐，比什么都珍贵。","{name}的氛围感太好了，{attr}灯光/音乐/互动每一环都在状态——像{metaphor}，沉浸进去就不想出来。","朋友聚会选{name}绝对不会冷场，{attr}全程高能——{metaphor}，{realm}得让人不想回家。","一个人也可以玩得很开心，{name}就是这种{attr}\"加入就能融入\"的好地方——{metaphor}，{angle}","每次来{name}都有新体验，{attr}主题/关卡/剧情经常更新——像{metaphor}，百玩不腻。","约会选{name}比吃饭有意思多了，{attr}互动中更能看出两个人合不合拍——{metaphor}，{realm}。"]'::jsonb
  WHERE category_key = '娱乐';
UPDATE public.category_emotion_profiles
  SET body_templates = '["练完一组{name}，汗水顺着脸颊落下的那一刻——{attr}{metaphor}般的{realm}，{angle}所有的压力都跟着排走了。","{name}不需要你一开始就很强，{attr}只需要你出现在这里——{metaphor}，身体会回报你的每一分坚持。","坚持{name}一个月后回头看，{attr}体能/体型/精神状态的变化自己都惊讶——像{metaphor}，时间不骗人。","{name}的过程很累但结束很爽，{attr}那种\"我做到了\"的成就感是任何东西替代不了的——{metaphor}。","一个人练{name}也可以很有仪式感，{attr}戴上耳机、调好节奏——{metaphor}般的专注，{realm}只属于你自己。","带朋友一起来体验{name}吧，{attr}互相监督比独自坚持容易多了——{metaphor}，两个人一起流汗更有动力。","每次想放弃的时候就再坚持五分钟，{name}教会你的不只是动作，还有{attr}{metaphor}般的意志力。","早晨的{name}和晚上的体验完全不同，{attr}晨练唤醒身体、夜练释放压力——各有各的好，像{metaphor}。","{name}的教练很专业但不凶，{attr}每个动作都会纠正到标准——{metaphor}般的教学，让你安全又有效。","不要等到身体报警了才开始运动，{name}就是那种{attr}预防大于治疗的生活方式——{metaphor}，{angle}"]'::jsonb
  WHERE category_key = '运动健身';
UPDATE public.category_emotion_profiles
  SET body_templates = '["带小朋友来{name}吧，{attr}看到他眼睛发亮的那一刻——{metaphor}，比什么都值，{angle}","{name}是那种\"玩了一整天还不肯走\"的地方，{attr}每个角落都有新发现——像{metaphor}，孩子的快乐就是这么简单。","周末不知道去哪就来{name}，{attr}既能放电又能学东西——{metaphor}般的寓教于乐，{realm}家长也放心。","孩子在{name}里交到了新朋友，{attr}社交能力在玩耍中自然生长——像{metaphor}，成长不需要刻意安排。","拍下孩子在{name}里奔跑的样子吧，{attr}那种毫无保留的快乐——{metaphor}般的画面，{angle}多年后看还是会笑。","{name}的安全措施做得很到位，{attr}家长可以放心地在一旁休息——孩子们自己探索，像{metaphor}。","生日派对选{name}太合适了，{attr}场地/布置/活动一站式解决——{metaphor}，小寿星和朋友们都玩疯了。","每次来{name}都有新主题，{attr}孩子不会腻——{metaphor}般的新鲜感，让每一次出行都值得期待。","陪孩子玩{name}的过程中发现自己也变回了小孩，{attr}{metaphor}——原来快乐一直都很简单，{realm}","{name}的性价比很高，一张票能玩一整天。{attr}{metaphor}，{angle}比去游乐场划算多了。"]'::jsonb
  WHERE category_key = '亲子';
UPDATE public.category_emotion_profiles
  SET body_templates = '["把{name}交给专业人士吧，{attr}省下的时间精力陪家人不香吗——{metaphor}般的轻松，{angle}","预约一次{name}，{attr}回到家时一切都整整齐齐——那种\"有人替你操心\"的感觉太治愈了，像{metaphor}。","{name}的服务细节做得很好，{attr}不是敷衍了事而是真的用心——{metaphor}般的靠谱，值得长期信任。","忙碌的时候最需要{name}这样的帮手，{attr}{metaphor}——把琐事交出去，把时间留给自己和重要的人。","第一次用{name}还有点不好意思，但体验完就后悔没有早点预约。{attr}{metaphor}，{realm}生活品质立竿见影。","{name}的价格透明、服务标准清晰，{attr}不会出现\"来了才加价\"的情况——{metaphor}般的诚信让人安心。","给父母也预约一次{name}吧，{attr}他们嘴上说\"不用不用\"心里其实很高兴——像{metaphor}，孝心要落实到行动上。","定期做{name}是一种生活方式的选择，{attr}花小钱省大心——{metaphor}，{realm}把时间投资在更重要的事情上。","{name}的工作人员很守时也很专业，{attr}进门穿鞋套、完工后清理现场——{metaphor}般的素养，{angle}","搬家/大扫除/维修这些事交给{name}，{attr}自己只管验收就好——像{metaphor}，花钱买的是安心和时间。"]'::jsonb
  WHERE category_key = '生活服务';
UPDATE public.category_emotion_profiles
  SET body_templates = '["推开{name}房门的那一刻，旅途的疲惫就消了一半——{attr}{metaphor}般的{realm}，{angle}终于可以好好歇一歇了。","{name}的床品太舒服了，{attr}一躺下去就不想动——{metaphor}，一夜安眠是对旅行者最好的款待。","在{name}醒来是被阳光叫醒的，{attr}拉开窗帘就是好风景——{metaphor}般的早晨，{realm}从眼到心都亮了。","{name}不只是睡觉的地方，更是一种生活方式的体验。{attr}{metaphor}，在这里时间好像变慢了，{angle}","选{name}就是因为它的位置和氛围，{attr}出门方便、回来安静——像{metaphor}，旅行住宿该有的样子。","{name}的细节做得很好，{attr}洗护用品/床垫硬度/枕头高度都经过考量——{metaphor}般的用心看得见摸得着。","带家人来住{name}吧，{attr}空间够大、设施齐全——老人孩子都满意，像{metaphor}般的一站式妥帖。","在{name}的阳台上发呆也是一种享受，{attr}泡一杯茶看着远处的风景——{metaphor}，{realm}这才是度假该有的节奏。","{name}的服务恰到好处，{attr}有求必应但不打扰——{metaphor}般的分寸感，比过度热情更让人舒服。","每次来这座城市都选这家{name}，{attr}熟悉又安心——像回了一个远方的家，{metaphor}，{angle}"]'::jsonb
  WHERE category_key = '酒店民宿';

-- ========== 自校验（执行后各业态 body_templates 应为非空 JSON 数组） ==========
-- SELECT category_key, jsonb_array_length(body_templates) AS tpl_cnt
--   FROM public.category_emotion_profiles ORDER BY category_key;   -- 各业态应为 10~12

COMMENT ON COLUMN public.category_emotion_profiles.body_templates IS
  '类目专属产品描述模板（含占位符 {name}/{metaphor}/{realm}/{attr}/{angle}），编译引擎优先消费；运营可在 Dashboard 直接改，免发版生效';

-- ========== 自校验（执行后粘贴运行，确认修复生效） ==========
-- ① 情绪态徽章应为 9
SELECT count(*) AS emo_badge_count FROM public.emotion_badge_defs WHERE code LIKE 'emo_%';
-- ② 各业态 body_templates 应为非空数组（餐饮/饮品/.../酒店民宿 共 11 行，tpl_cnt 多为 10~12）
SELECT category_key, jsonb_array_length(body_templates) AS tpl_cnt
  FROM public.category_emotion_profiles
  WHERE category_key <> '通用' ORDER BY category_key;
-- ③ 确认列已存在
SELECT column_name FROM information_schema.columns
  WHERE table_name='category_emotion_profiles' AND column_name='body_templates';
