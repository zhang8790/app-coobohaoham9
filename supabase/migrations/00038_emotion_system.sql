-- ============================================
-- 情绪系统数据库迁移
-- 创建时间: 2026-07-06
-- 说明: 情绪关键词表 + 情绪文案内容表
-- ============================================

-- 1. 情绪关键词表 (用于情绪匹配)
CREATE TABLE IF NOT EXISTS public.emotion_keywords (
  id SERIAL PRIMARY KEY,
  inner_label VARCHAR(32) NOT NULL,
  keyword VARCHAR(50) NOT NULL,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT emotion_keywords_label_check CHECK (inner_label IN ('drained_low', 'lonely_still', 'expressive_high', 'peaceful_zen', 'nostalgic_soft', 'eager_forward'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_emotion_keywords_label ON public.emotion_keywords(inner_label);
CREATE INDEX IF NOT EXISTS idx_emotion_keywords_keyword ON public.emotion_keywords(keyword);

-- 2. 情绪文案内容表
CREATE TABLE IF NOT EXISTS public.emotion_content (
  id SERIAL PRIMARY KEY,
  inner_label VARCHAR(32) NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  scene_card_id VARCHAR(20),
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(200),
  extra_meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT emotion_content_label_check CHECK (inner_label IN ('drained_low', 'lonely_still', 'expressive_high', 'peaceful_zen', 'nostalgic_soft', 'eager_forward'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_emotion_content_label_type ON public.emotion_content(inner_label, content_type);

-- 3. 插入情绪关键词数据
INSERT INTO public.emotion_keywords (inner_label, keyword, priority) VALUES
-- 耗竭态
('drained_low', '累', 1),
('drained_low', '好累', 1),
('drained_low', '加班', 1),
('drained_low', '困', 1),
('drained_low', '不想动', 2),
('drained_low', '耗尽', 1),
('drained_low', '虚脱', 1),
('drained_low', '撑不住', 1),
('drained_low', '刚下班', 1),
('drained_low', '周一', 2),
-- 孤独态
('lonely_still', '一个人', 1),
('lonely_still', '想家', 1),
('lonely_still', '无聊', 2),
('lonely_still', '冷清', 1),
('lonely_still', '失落', 1),
('lonely_still', '空荡荡', 1),
('lonely_still', '没劲', 2),
('lonely_still', '发呆', 2),
('lonely_still', '异乡', 1),
-- 表达驱动态
('expressive_high', '开心', 1),
('expressive_high', '好棒', 1),
('expressive_high', '快乐', 1),
('expressive_high', '兴奋', 1),
('expressive_high', '嗨', 2),
('expressive_high', '完美', 1),
('expressive_high', '太爽了', 1),
('expressive_high', '今天真好', 1),
('expressive_high', '好天气', 2),
-- 平稳态
('peaceful_zen', '放松', 1),
('peaceful_zen', '随意', 2),
('peaceful_zen', '悠闲', 1),
('peaceful_zen', '不想吵', 1),
('peaceful_zen', '平平淡淡', 2),
('peaceful_zen', '走走', 2),
('peaceful_zen', '没事', 2),
('peaceful_zen', '休息日', 1),
-- 怀念态
('nostalgic_soft', '怀念', 1),
('nostalgic_soft', '想当年', 1),
('nostalgic_soft', '旧时光', 1),
('nostalgic_soft', '回忆', 1),
('nostalgic_soft', '老友', 1),
('nostalgic_soft', '以前', 2),
('nostalgic_soft', '小时候', 2),
('nostalgic_soft', '故地', 1),
-- 渴望态
('eager_forward', '想要', 2),
('eager_forward', '想去', 1),
('eager_forward', '向往', 1),
('eager_forward', '计划', 2),
('eager_forward', '改变', 1),
('eager_forward', '新开始', 1),
('eager_forward', '剪头发', 1),
('eager_forward', '换心情', 1)
ON CONFLICT DO NOTHING;

-- 4. 插入情绪翻译文案
INSERT INTO public.emotion_content (inner_label, content_type, title) VALUES
-- 耗竭态
('drained_low', 'translation', '感觉到了你的疲惫，今天已经用掉太多力气了。'),
('drained_low', 'translation', '累到不想说话的时候，不说话也没关系。'),
('drained_low', 'translation', '加班到现在，辛苦了。此刻，允许自己当一棵放空的植物。'),
-- 孤独态
('lonely_still', 'translation', '一个人的时候，安静也是一种陪伴。'),
('lonely_still', 'translation', '感觉到了你的孤独。茫茫人海，总有一个角落是留给你的。'),
('lonely_still', 'translation', '异乡的夜晚，胃暖了，心就不空了。'),
-- 表达驱动
('expressive_high', 'translation', '今天的心情像阳光一样明亮，值得认真庆祝。'),
('expressive_high', 'translation', '感觉到了你的快乐，这份能量不分享就浪费了。'),
('expressive_high', 'translation', '好状态，当然要去配得上它的好地方。'),
-- 平稳态
('peaceful_zen', 'translation', '心若浮萍，当觅一处安静之地，让灵魂得以安放。'),
('peaceful_zen', 'translation', '不赶时间，不设目的，今天归自己所有。'),
('peaceful_zen', 'translation', '平静的日子，最值得被温柔对待。'),
-- 怀念态
('nostalgic_soft', 'translation', '念旧的人，心里都住着一个温暖的老地方。'),
('nostalgic_soft', 'translation', '时光带走的，味觉都帮你记着呢。'),
('nostalgic_soft', 'translation', '偶尔回头看看，才发现自己走了好远的路。'),
-- 渴望态
('eager_forward', 'translation', '心里有期待，日子就发光。'),
('eager_forward', 'translation', '感觉到了你眼里的光，去吧，新体验在等你。'),
('eager_forward', 'translation', '与其向往，不如出发。今天就是一个好日子。')
ON CONFLICT DO NOTHING;

-- 5. 插入场景卡片
INSERT INTO public.emotion_content (inner_label, content_type, scene_card_id, title, subtitle, extra_meta) VALUES
-- 耗竭态
('drained_low', 'scene_card', 'SC_001', '午休15分钟·快速回血', '趴在桌上听场雨，比睡着管用。', '{"anim":"rain_ripple"}'),
('drained_low', 'scene_card', 'SC_002', '深夜一碗粥·暖身不撑', '不用说话，喝完了就走。', '{"anim":"steam_rise"}'),
('drained_low', 'scene_card', 'SC_003', '电量1%·立刻充电', '就现在，找个小角落瘫一会儿。', '{"anim":"battery_pulse"}'),
-- 孤独态
('lonely_still', 'scene_card', 'SC_004', '独自放空·城市避风港', '不需要社交，只需要一扇安静的窗。', '{"anim":"window_gaze"}'),
('lonely_still', 'scene_card', 'SC_005', '旧时光·翻翻老味道', '想念的旧时光，都藏在这一口里。', '{"anim":"photo_flip"}'),
('lonely_still', 'scene_card', 'SC_006', '深夜食堂·一人食', '长夜漫漫，有碗热汤陪着你。', '{"anim":"bowl_steam"}'),
-- 表达驱动
('expressive_high', 'scene_card', 'SC_007', '周末出片·光影漫游', '今天的阳光，值得你认真打扮。', '{"anim":"light_spot"}'),
('expressive_high', 'scene_card', 'SC_008', '组局搭子·快乐翻倍', '缺个会拍照的，你带故事，我带酒。', '{"anim":"bubble_up"}'),
('expressive_high', 'scene_card', 'SC_009', '微醺时刻·庆祝日常', '普通的日子，也要有仪式感地碰杯。', '{"anim":"clink_glass"}'),
-- 平稳态
('peaceful_zen', 'scene_card', 'SC_010', '随机漫游·遇见惊喜', '不设目的地，推开一扇门看看。', '{"anim":"compass_swing"}'),
('peaceful_zen', 'scene_card', 'SC_011', '公园20分钟·抱大树', '什么都不做，就在长椅上发会儿呆。', '{"anim":"leaf_drift"}'),
('peaceful_zen', 'scene_card', 'SC_012', '不急·喝杯茶再说', '看茶叶在杯子里慢慢沉下去。', '{"anim":"tea_settle"}'),
-- 怀念态
('nostalgic_soft', 'scene_card', 'SC_013', '复古旧物·寻宝记', '总有一件旧物，替你记得来时的路。', '{"anim":"dust_float"}'),
('nostalgic_soft', 'scene_card', 'SC_014', '老友记·叙旧饭局', '叫上老友，把当年的笑话再讲一遍。', '{"anim":"laugh_vibration"}'),
('nostalgic_soft', 'scene_card', 'SC_015', '黑胶时光·听首老歌', '唱针落下，回到90年代的某个下午。', '{"anim":"vinyl_spin"}'),
-- 渴望态
('eager_forward', 'scene_card', 'SC_016', '换个发型·换种心情', '剪掉烦恼，从头开始。', '{"anim":"scissors_snip"}'),
('eager_forward', 'scene_card', 'SC_017', '户外徒步·去野去风里', '山不来见我，我自去见山。', '{"anim":"wind_sweep"}'),
('eager_forward', 'scene_card', 'SC_018', '技能解锁·体验课', '1小时，学会一件让朋友惊叹的小事。', '{"anim":"spark_burst"}')
ON CONFLICT DO NOTHING;

-- 6. 插入Feed流标题
INSERT INTO public.emotion_content (inner_label, content_type, title, subtitle) VALUES
-- 耗竭态
('drained_low', 'feed_title', '加班到十点，想喝点暖的？这里有碗关东煮。', '93%疲惫的人觉得值'),
('drained_low', 'feed_title', '累到不想选？那这家只卖一种面的店，刚好。', '无需预约·到店即享'),
('drained_low', 'feed_title', '原地歇脚，这家按摩椅不用预约。', '距离你200米，打烊凌晨2点'),
-- 孤独态
('lonely_still', 'feed_title', '一个人吃饭，也想吃得舒服一点？这家有吧台座。', '90%独处的人推荐'),
('lonely_still', 'feed_title', '觉得冷清的时候，去花市买一束不用说话的花。', '适合单人·不尴尬'),
('lonely_still', 'feed_title', '孤独等级四级？来这家书店，书和猫都陪你。', '此刻人少，正好安静'),
-- 表达驱动
('expressive_high', 'feed_title', '今天心情好？这家Brunch的颜色跟你好配。', '96%快乐的人想二刷'),
('expressive_high', 'feed_title', '快乐需要见证，这家露台酒吧能看见全城日落。', '热门打卡·出片率100%'),
('expressive_high', 'feed_title', '想找人分享喜悦？这场脱口秀全场都在笑。', '今天还有空位，手慢无'),
-- 平稳态
('peaceful_zen', 'feed_title', '今天没什么安排？这家茶馆的窗景刚好够你看一下午。', '静谧时光，正好有空'),
('peaceful_zen', 'feed_title', '闲逛累了？巷子里的老书店有风扇和凉席。', '非网红店·不用排队'),
('peaceful_zen', 'feed_title', '不用动脑子，这家只卖白粥和小菜。', '适合发呆·不限时'),
-- 怀念态
('nostalgic_soft', 'feed_title', '想起小时候的味道了？这家糖水铺还在用老式碗。', '20年老味道·不踩雷'),
('nostalgic_soft', 'feed_title', '想见老友却不知去哪？这家大排档够吵，不会尴尬。', '老友聚会·放肆大笑'),
('nostalgic_soft', 'feed_title', '怀念不是变老，是心里有宝藏。这家旧书店有你的童年漫画。', '情怀老店·时光慢递'),
-- 渴望态
('eager_forward', 'feed_title', '想换个心情？这家理发店的Tony只听你说话，不推销。', '今日预约有位置'),
('eager_forward', 'feed_title', '想出去走走？这条徒步路线新手友好，风景却老手都说绝。', '新手友好·无需装备'),
('eager_forward', 'feed_title', '想试试新东西？这家陶艺体验课，捏坏了也能烧出来。', '90%的体验者打开了新大门')
ON CONFLICT DO NOTHING;

-- 7. 禁用RLS（测试阶段）
ALTER TABLE public.emotion_keywords DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_content DISABLE ROW LEVEL SECURITY;

-- ✅ 完成！
COMMENT ON TABLE public.emotion_keywords IS '情绪关键词映射表 - 用于存储触发关键词和对应的情绪分类';
COMMENT ON TABLE public.emotion_content IS '情绪文案内容表 - 存储情绪翻译文案、场景卡片、Feed流标题等';
