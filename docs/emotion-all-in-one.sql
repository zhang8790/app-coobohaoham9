-- ============================================================
-- 情绪系统 · 全量建表（一键幂等，可重复执行）
-- 用法：Supabase SQL Editor → 新建查询 → 粘贴本文件全部 → Run
-- 来源：00038 + apply_missing_emotion_tables + 00050 + 00051 + 00052 + 00053
-- 已排除 add_mood_tags_to_campaigns.sql（指向不存在的 marketing_campaigns 表）
-- ============================================================

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

-- ============================================================
-- 一键补齐「情绪系统」缺失表（幂等，可重复执行）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴本文件全部内容 → Run
-- 说明：当前云端缺 product_emotion / category_emotion_profiles /
--       emotion_taxonomy（00040）/ user_emotion_preferences（00041），
--       本脚本一次性建齐，全部 IF NOT EXISTS / ON CONFLICT DO NOTHING。
-- ============================================================

-- 通用 updated_at 触发器函数（幂等覆盖）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========== 1. 类目情绪编译策略表（00040） ==========
CREATE TABLE IF NOT EXISTS public.category_emotion_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key        TEXT NOT NULL UNIQUE,
  label               TEXT NOT NULL,
  tone                TEXT,
  allowed_mood_tags  TEXT[] DEFAULT '{}',
  metaphors           JSONB DEFAULT '[]'::jsonb,
  angles              TEXT[] DEFAULT '{}',
  openers             TEXT[] DEFAULT '{}',
  closers             TEXT[] DEFAULT '{}',
  aliases             TEXT[] DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cep_key ON public.category_emotion_profiles(category_key);

-- ========== 2. 商品情绪编译结果缓存表（00040） ==========
CREATE TABLE IF NOT EXISTS public.product_emotion (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  emotion_title       TEXT,
  emotion_detail      TEXT,
  scene_tags_compiled TEXT[],
  mood_tags_used      TEXT[],
  category_profile_id UUID,
  compiled_by         TEXT NOT NULL DEFAULT 'rule' CHECK (compiled_by IN ('rule','llm')),
  model               TEXT,
  compiled_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id)
);
CREATE INDEX IF NOT EXISTS idx_pe_product ON public.product_emotion(product_id);

-- ========== 3. 情绪词表桥接（00040） ==========
CREATE TABLE IF NOT EXISTS public.emotion_taxonomy (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mood_tag     TEXT NOT NULL UNIQUE,
  inner_label  TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT emotion_taxonomy_label_check CHECK (
    inner_label IN ('drained_low','lonely_still','expressive_high','peaceful_zen','nostalgic_soft','eager_forward')
  )
);
CREATE INDEX IF NOT EXISTS idx_et_tag ON public.emotion_taxonomy(mood_tag);
CREATE INDEX IF NOT EXISTS idx_et_label ON public.emotion_taxonomy(inner_label);

-- ========== 4. 合作商家建模（00040） ==========
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS partner_brand TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS partner_tier  TEXT;
COMMENT ON COLUMN public.stores.partner_brand IS '合作品牌标识，如"犒赏铺"；非空表示属于某合作品牌体系（区别于平台自营 is_platform）';
COMMENT ON COLUMN public.stores.partner_tier  IS '合作等级/档位，如 gold/silver/normal，用于差异化结算与展示';

-- ========== 5. 用户情绪偏好表（00041） ==========
CREATE TABLE IF NOT EXISTS public.user_emotion_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE,
  mood_tags   TEXT[],
  action      TEXT CHECK (action IN ('view', 'click', 'purchase')),
  weight      INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_emotion_preferences_user_id
  ON public.user_emotion_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_preferences_mood_tags
  ON public.user_emotion_preferences USING GIN (mood_tags);
DROP TRIGGER IF EXISTS update_user_emotion_preferences_updated_at
  ON public.user_emotion_preferences;
CREATE TRIGGER update_user_emotion_preferences_updated_at
  BEFORE UPDATE ON public.user_emotion_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========== 种子数据（00040 类目策略 + 词表桥接） ==========
INSERT INTO public.category_emotion_profiles
  (category_key, label, tone, allowed_mood_tags, metaphors, angles, closers, aliases)
VALUES
  ('餐饮', '餐饮美食', '烟火人间，与人共食的妥帖',
   ARRAY['治愈','满足','幸福','温馨','甜蜜','愉悦','分享','用餐时光','放松','仪式感','怀旧','温暖'],
   '["灶上咕嘟的汤","一桌人对坐的灯","街角老馆子的香","碗中升腾的热气"]'::jsonb,
   ARRAY['与人共食，滋味更浓。','一蔬一饭，最抚凡人心。','围坐的此刻，便是归处。'],
   ARRAY['趁热，慢慢吃。','这一餐，值得好好坐下来。'],
   ARRAY['正餐','小吃','快餐','火锅','烧烤','夜宵','外卖','饭','餐','美食','餐厅']),
  ('饮品', '饮品', '微醺与小憩，唇齿间的喘息',
   ARRAY['甜蜜','治愈','放松','愉悦','清新','清爽','浪漫','慢生活'],
   '["杯壁凝着的水珠","午后的一口清凉","巷口捧着的那杯暖","吸管搅动的甜"]'::jsonb,
   ARRAY['小口啜饮，日子慢下来。','给自己一段喘息。'],
   ARRAY['慢慢喝，不着急。'],
   ARRAY['奶茶','咖啡','果茶','酒水','茶','饮料','汽水','果汁']),
  ('烘焙', '烘焙甜点', '晨间手作的温度',
   ARRAY['甜蜜','治愈','温馨','幸福','满足','浪漫'],
   '["刚出炉的暖香","窗台边那块松软","晨光里的酥皮","指尖沾着的糖粉"]'::jsonb,
   ARRAY['一口下去，整个人都松了。','甜的东西，最懂安慰。'],
   ARRAY['趁新鲜，尝一口。'],
   ARRAY['面包','甜点','蛋糕','西点','糕点','甜品']),
  ('水果生鲜', '水果生鲜', '土地与时令的鲜活',
   ARRAY['清爽','清新','自然','纯净','解暑','治愈','活力','满足'],
   '["枝头带露的鲜","山野吹来的风","刚从土里醒来的清气","井水镇过的脆"]'::jsonb,
   ARRAY['从田间到舌尖，不过片刻。','应季的鲜，最懂身体。'],
   ARRAY['鲜的，不必多说。'],
   ARRAY['果蔬','水果','生鲜','蔬菜','肉禽','海鲜','农产','食材','农场']),
  ('零售', '零售百货', '悦己的小确幸与陪伴',
   ARRAY['快乐','满足','惊喜','治愈','温馨','可爱','有趣','浪漫','甜蜜','怀旧'],
   '["抽屉里的小欢喜","案头的一件趣物","旧书页的香","随手摆着的可爱"]'::jsonb,
   ARRAY['给自己一点甜。','寻常日子里的小光。'],
   ARRAY['喜欢，就带它回家。'],
   ARRAY['零食','百货','图书','日用','杂货','文创','超市','便利店']),
  ('美业', '丽人美业', '悦己与焕新的精致',
   ARRAY['精致','治愈','放松','浪漫','甜蜜','仪式感','高端','典雅'],
   '["镜中焕然的自己","指尖温柔的时光","被妥帖照料的容颜","发梢掠过的轻"]'::jsonb,
   ARRAY['为自己停下来的那一刻。','好好爱自己，不亏。'],
   ARRAY['你值得被温柔对待。'],
   ARRAY['美甲','美容','美发','护肤','SPA','丽人','造型','美睫','纹绣']),
  ('娱乐', '休闲娱乐', '释放与社交的沉浸',
   ARRAY['快乐','兴奋','刺激','活力','愉悦','分享','有趣'],
   '["灯影里炸开的笑","一群人的喧闹","卸下伪装的夜","屏幕亮起的雀跃"]'::jsonb,
   ARRAY['痛快闹一场。','和朋友，才够味。'],
   ARRAY['今晚，尽兴就好。'],
   ARRAY['KTV','剧本杀','影院','密室','电玩','桌游','酒吧','夜店','游乐','演出']),
  ('运动健身', '运动健身', '活力与自律的突破',
   ARRAY['活力','满足','专注','兴奋','放松','自然'],
   '["汗水落地的脆","突破极限的喘息","身体苏醒的晨","肌肉舒展的暖"]'::jsonb,
   ARRAY['动起来，通体舒畅。','坚持，身体会记得。'],
   ARRAY['练完这一组，整个人都轻了。'],
   ARRAY['瑜伽','游泳','私教','健身','拳击','骑行','跑步','舞蹈']),
  ('亲子', '亲子', '陪伴与成长的童真',
   ARRAY['温馨','幸福','甜蜜','治愈','快乐','可爱'],
   '["孩子扬起的笑","牵着的小手","时光里的童真","蹦跳着的身影"]'::jsonb,
   ARRAY['陪他长大，也是陪自己重温童年。','孩子的笑，最能化开疲惫。'],
   ARRAY['这样的时光，最珍贵。'],
   ARRAY['乐园','早教','摄影','婴童','儿童','母婴','托管']),
  ('生活服务', '生活服务', '省心与托付的安心',
   ARRAY['放松','治愈','实用','温馨','安心'],
   '["交出去的轻松","被妥帖打理的琐碎","归家时的整洁","不必自己动手的闲"]'::jsonb,
   ARRAY['麻烦的事，交给专业的人。','把时间留给自己。'],
   ARRAY['剩下的，安心就好。'],
   ARRAY['家政','维修','洗衣','洗车','保洁','托管','养护','上门']),
  ('酒店民宿', '酒店民宿', '栖居与远方的慢生活',
   ARRAY['放松','治愈','慢生活','浪漫','平静','安逸','温馨'],
   '["推开窗的山景","一夜好眠的软","异乡的灯","院里那棵老树"]'::jsonb,
   ARRAY['在路上，也是在家。','换一处地方，换一种心绪。'],
   ARRAY['好好歇一晚。'],
   ARRAY['酒店','民宿','客栈','住宿','青旅']),
  ('通用', '通用', '安宁',
   ARRAY[]::TEXT[], '[]'::jsonb, ARRAY[''], ARRAY[]::TEXT[], ARRAY[]::TEXT[])
ON CONFLICT (category_key) DO NOTHING;

INSERT INTO public.emotion_taxonomy (mood_tag, inner_label, description) VALUES
  ('快乐','expressive_high','明亮愉悦，适合分享庆祝'),
  ('兴奋','expressive_high','高能量，值得记录'),
  ('满足','expressive_high','被填满的踏实'),
  ('惊喜','expressive_high','意外的小确幸'),
  ('幸福','expressive_high','圆满感'),
  ('浪漫','expressive_high','心动与仪式'),
  ('甜蜜','expressive_high','温柔的甜'),
  ('有趣','expressive_high','好玩、想分享'),
  ('可爱','expressive_high','被萌到的开心'),
  ('活力','expressive_high','元气满满'),
  ('潮流','eager_forward','想跟上、想尝试'),
  ('个性','eager_forward','想表达自我'),
  ('奢华','expressive_high','犒赏自己的高光'),
  ('高端','expressive_high','值得郑重对待'),
  ('尊贵','expressive_high','被重视的体面'),
  ('典雅','expressive_high','含蓄的高级感'),
  ('平静','peaceful_zen','需要安放的心'),
  ('放松','peaceful_zen','卸下紧绷'),
  ('舒适','peaceful_zen','被托住的安稳'),
  ('安逸','peaceful_zen','不必赶路的闲'),
  ('慢生活','peaceful_zen','把节奏放慢'),
  ('治愈','peaceful_zen','被轻轻抚平'),
  ('自然','peaceful_zen','回到本真的静'),
  ('纯净','peaceful_zen','清空杂念'),
  ('清新','peaceful_zen','透气的清爽'),
  ('清爽','peaceful_zen','褪去燥热'),
  ('解暑','peaceful_zen','一时的清凉慰藉'),
  ('温馨','nostalgic_soft','像家的暖意'),
  ('感动','nostalgic_soft','被触到的柔软'),
  ('怀旧','nostalgic_soft','旧时光的回响'),
  ('温暖','nostalgic_soft','被围住的暖'),
  ('精致','eager_forward','想对自己更好一点'),
  ('唯美','eager_forward','向往美感生活')
ON CONFLICT (mood_tag) DO NOTHING;

-- ========== 禁用 RLS（测试阶段，与项目既有表一致） ==========
ALTER TABLE public.category_emotion_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_emotion           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_taxonomy          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_emotion_preferences  DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.category_emotion_profiles IS '类目情绪编译策略表 - 运营后台可改，替代前端硬编码策略';
COMMENT ON TABLE public.product_emotion           IS '商品情绪编译结果缓存 - 详情页直读，避免每次渲染调 LLM';
COMMENT ON TABLE public.emotion_taxonomy          IS '情绪词表桥接 - 商品 mood_tags 与用户 6 情绪态(inner_label) 的映射';
COMMENT ON TABLE public.user_emotion_preferences  IS '用户情绪偏好（浏览/点击/购买行为汇总），用于情绪推荐引擎加权';

-- ✅ 缺失表已全部补齐

-- 00050  商家情绪编译工作台：product_emotion 补全五维标签 / 质量分 / 审核态
-- ------------------------------------------------------------
-- 工作台（方案 §3）需要把商家「五维打标」结果、编译质量分、审核状态落库，
-- 原 product_emotion 仅有 emotion_title/emotion_detail/scene_tags_compiled/mood_tags_used，
-- 缺以下三列。本迁移补齐，全部幂等可重复执行。
--
-- 列说明：
--   dimension_tags  jsonb  —— 五维标签选择 {function:[],scene:[],emotion:[],identity:[],sensory:[]}
--   quality_score   smallint —— 编译质量评分（0~100，来自 emotion-scoring 引擎）
--   review_status   text   —— draft 草稿 / submitted 待审 / approved 通过 / rejected 驳回

-- 1. dimension_tags（默认空对象）
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS dimension_tags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. quality_score
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS quality_score smallint;

-- 3. review_status（带 CHECK 约束，默认 draft）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_emotion' AND column_name='review_status'
  ) THEN
    ALTER TABLE public.product_emotion
      ADD COLUMN review_status text NOT NULL DEFAULT 'draft';
  END IF;
END $$;

-- 4. CHECK 约束（幂等：先删后建）
ALTER TABLE public.product_emotion
  DROP CONSTRAINT IF EXISTS product_emotion_review_status_check;
ALTER TABLE public.product_emotion
  ADD CONSTRAINT product_emotion_review_status_check
  CHECK (review_status IN ('draft','submitted','approved','rejected'));

-- 5. 评分范围约束（0~100，可选）
ALTER TABLE public.product_emotion
  DROP CONSTRAINT IF EXISTS product_emotion_quality_score_check;
ALTER TABLE public.product_emotion
  ADD CONSTRAINT product_emotion_quality_score_check
  CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));

COMMENT ON COLUMN public.product_emotion.dimension_tags IS '五维情绪标签选择（功能/场景/情绪/身份/感官）';
COMMENT ON COLUMN public.product_emotion.quality_score IS '编译质量评分 0~100（emotion-scoring 引擎）';
COMMENT ON COLUMN public.product_emotion.review_status IS '情绪编译审核态：draft/submitted/approved/rejected';

SELECT '✅ 00050 完成：product_emotion 已补 dimension_tags / quality_score / review_status' AS result;

-- 情绪导购漏斗埋点表（对应方案 §5.5 数据闭环）
-- 记录五屏情绪详情页的用户行为：进入 / 各屏到达 / 点击购买 / 下单
-- 供商家「情绪漏斗」看板聚合分析，衡量情绪导购转化效果。
-- 测试期 RLS 全关（与项目其余表一致）；无 FK 约束，避免外键类型/存在性依赖导致插入失败。

CREATE TABLE IF NOT EXISTS emotion_funnel_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  product_id   uuid        NOT NULL,
  store_id     uuid,
  event_type   text        NOT NULL,   -- enter | screen_view | cta_click | order_created
  screen_index int,                     -- screen_view 时为 0~4
  source       text        DEFAULT 'emotion_detail',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_funnel_events_store
  ON emotion_funnel_events (store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_emotion_funnel_events_product
  ON emotion_funnel_events (product_id, event_type);

ALTER TABLE emotion_funnel_events DISABLE ROW LEVEL SECURITY;

-- 情绪确权记录表（消费即确权路线）
-- 与方案 §5.4 原设计的「独立情绪激活码」不同：本项目采用「消费即确权」，
-- 用户走完 扫码购→加购→结算→支付成功 后，在支付成功页引导进入 emotion-claim 做情绪确权，
-- 不再新增第四套实体二维码。因此本表无需 activation_codes，仅记录确权行为 + 奖励发放。
--
-- 设计要点：
-- 1. 不加任何外键约束 —— 规避项目历史中 store_id UUID/INTEGER 类型漂移导致插入失败的坑。
-- 2. order_no 存订单号文本（非 order.id），与 payment 页既有的 orderNo 变量对齐，避免与外键类型纠缠。
-- 3. selected_emotion 用 text[] 存用户多选的情绪标签（如 ['治愈','温馨']）。
-- 4. RLS 关闭（与项目测试期所有表一致）。

CREATE TABLE IF NOT EXISTS emotion_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  order_no text,
  product_id text,
  store_id text,
  selected_emotion text[],
  badge_text text,
  tongbao_amount smallint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_claims_user ON emotion_claims (user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_product ON emotion_claims (product_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_order ON emotion_claims (order_no);

-- 与项目测试期所有表一致：关闭行级安全（上线前需重新评估）
ALTER TABLE emotion_claims DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- V5 P2-1: 情绪通宝/徽章独立化
-- 之前的情绪通宝复用 profiles.points + points_logs(类型=emotion_claim)，
-- 现在抽出独立表与流水，避免和普通积分混淆。
-- 包含：emotion_assets(通宝余额/冻结) + emotion_tongbao_logs(通宝流水) +
--       emotion_badge_defs(徽章定义，前端只读) + emotion_badge_grants(徽章发放)
-- 全部 DISABLE RLS（测试期）；正式上线需按 user_id 收紧。
-- =====================================================

-- 1) 情绪通宝账户（一行一用户）
CREATE TABLE IF NOT EXISTS public.emotion_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE,
  balance       INTEGER NOT NULL DEFAULT 0,    -- 当前可用通宝
  frozen        INTEGER NOT NULL DEFAULT 0,    -- 冻结中（例如情绪喂养/兑换时扣的）
  total_earned  INTEGER NOT NULL DEFAULT 0,    -- 累计获得
  total_spent   INTEGER NOT NULL DEFAULT 0,    -- 累计消耗
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emotion_assets_user ON public.emotion_assets(user_id);

-- 2) 通宝流水（增/减都记）
CREATE TABLE IF NOT EXISTS public.emotion_tongbao_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  delta       INTEGER NOT NULL,                -- 正=获得，负=消耗
  balance_after INTEGER NOT NULL,             -- 流水后余额（冗余便于展示/对账）
  reason      TEXT NOT NULL,                  -- 'emotion_claim' / 'emotion_feed' / 'emotion_exchange' / 'admin_adjust' 等
  ref_id      TEXT,                           -- 关联订单号/商品ID/激活码
  remark      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emotion_tongbao_logs_user_time
  ON public.emotion_tongbao_logs(user_id, created_at DESC);

-- 3) 徽章定义（运营可改，前端读字典渲染）
-- 预置 5 枚 V5 上线徽章
CREATE TABLE IF NOT EXISTS public.emotion_badge_defs (
  code         TEXT PRIMARY KEY,              -- 'first_claim' / 'five_emotions' / 'empath' / 'tongbao_100' / 'share_claim'
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  icon         TEXT NOT NULL,                 -- emoji 或 icon key
  rarity       TEXT NOT NULL DEFAULT 'common',-- common / rare / epic / legend
  unlock_hint  TEXT NOT NULL,                 -- 解锁条件描述（前端展示）
  sort_order   INTEGER NOT NULL DEFAULT 100,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.emotion_badge_defs (code, name, description, icon, rarity, unlock_hint, sort_order) VALUES
  ('first_claim',   '初识情绪',     '完成首次情绪确权',         '🌱', 'common', '在情绪确权页确认 1 次商品情绪',  10),
  ('five_emotions', '五味杂陈',     '确权商品的情绪标签覆盖 5 个不同维度', '🎨', 'rare',   '在多次确权中累计 5 个不同情绪维度',  20),
  ('empath',        '共情者',       '累计确权商品达到 10 件',   '💝', 'rare',   '确权 10 件不同的商品',            30),
  ('tongbao_100',   '通宝藏家',     '通宝余额达到 100',         '🏆', 'epic',   '攒到 100 枚情绪通宝',            40),
  ('share_claim',   '情绪布道者',   '分享确权卡给好友并完成一次有效锁客', '📣', 'legend', '分享确权卡并成功锁客 1 人',     50)
ON CONFLICT (code) DO NOTHING;

-- 4) 徽章发放（一行一获得）
CREATE TABLE IF NOT EXISTS public.emotion_badge_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  badge_code   TEXT NOT NULL REFERENCES public.emotion_badge_defs(code) ON DELETE CASCADE,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_at    TIMESTAMPTZ,                  -- 可选过期
  source       TEXT,                         -- 'auto' / 'admin'
  UNIQUE (user_id, badge_code)               -- 同一徽章对同一用户只发一次
);
CREATE INDEX IF NOT EXISTS idx_emotion_badge_grants_user
  ON public.emotion_badge_grants(user_id);

-- 5) 维护 emotion_assets.updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_emotion_assets() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emotion_assets_updated_at ON public.emotion_assets;
CREATE TRIGGER trg_emotion_assets_updated_at
  BEFORE UPDATE ON public.emotion_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_emotion_assets();

-- RLS: 测试期关闭
ALTER TABLE public.emotion_assets        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_tongbao_logs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_badge_defs    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_badge_grants  DISABLE ROW LEVEL SECURITY;

-- 给 PostgREST 暴露（虽然 anon key 也能读，但加个备注）
COMMENT ON TABLE public.emotion_assets        IS 'V5 P2: 用户情绪通宝账户（独立于 profiles.points）';
COMMENT ON TABLE public.emotion_tongbao_logs  IS 'V5 P2: 情绪通宝流水（增/减/来源）';
COMMENT ON TABLE public.emotion_badge_defs    IS 'V5 P2: 情绪徽章定义字典（运营可改）';
COMMENT ON TABLE public.emotion_badge_grants  IS 'V5 P2: 情绪徽章发放记录';
