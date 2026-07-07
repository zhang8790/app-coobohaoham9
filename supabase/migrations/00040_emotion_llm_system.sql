-- ============================================
-- 情绪系统 · LLM 接入与策略入库迁移
-- 创建时间: 2026-07-07
-- 说明:
--   1. category_emotion_profiles  —— 类目情绪编译策略（运营后台可改，替代前端硬编码）
--   2. product_emotion           —— 商品情绪编译结果缓存（详情页直读，不每次调 LLM）
--   3. emotion_taxonomy          —— 商品 mood_tags ↔ 用户 6 情绪态(inner_label) 桥接表
--   4. stores.partner_brand/tier —— 犒赏铺等合作商家建模
-- 设计原则: 编译结果必须落库缓存；LLM 仅用于「理解」与「按需编译」，绝不每次渲染调用。
-- ============================================

-- ========== 1. 类目情绪编译策略表 ==========
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

-- ========== 2. 商品情绪编译结果缓存表 ==========
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

-- ========== 3. 情绪词表桥接 ==========
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

-- ========== 4. 合作商家建模（犒赏铺等） ==========
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS partner_brand TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS partner_tier  TEXT;
COMMENT ON COLUMN public.stores.partner_brand IS '合作品牌标识，如"犒赏铺"；非空表示属于某合作品牌体系（区别于平台自营 is_platform）';
COMMENT ON COLUMN public.stores.partner_tier  IS '合作等级/档位，如 gold/silver/normal，用于差异化结算与展示';

-- ============================================
-- 种子数据
-- ============================================

-- 类目情绪编译策略（11 业态 + 通用兜底），数据来自前端 category-emotion.ts
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

-- 情绪词表桥接（商品 mood_tags ↔ 用户 6 情绪态）
-- 说明：mood_tags 描述的是「商品感染力」，inner_label 描述的是「用户当下情绪态」，
--       桥接用于「推荐」——某商品能抚慰哪类情绪态的用户。
INSERT INTO public.emotion_taxonomy (mood_tag, inner_label, description) VALUES
  -- 表达驱动
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
  -- 平稳/治愈
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
  -- 怀念/温暖
  ('温馨','nostalgic_soft','像家的暖意'),
  ('感动','nostalgic_soft','被触到的柔软'),
  ('怀旧','nostalgic_soft','旧时光的回响'),
  ('温暖','nostalgic_soft','被围住的暖'),
  -- 渴望
  ('精致','eager_forward','想对自己更好一点'),
  ('唯美','eager_forward','向往美感生活')
ON CONFLICT (mood_tag) DO NOTHING;

-- ============================================
-- 禁用 RLS（测试阶段，与项目既有表一致）
-- ============================================
ALTER TABLE public.category_emotion_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_emotion           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_taxonomy          DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.category_emotion_profiles IS '类目情绪编译策略表 - 运营后台可改，替代前端硬编码策略';
COMMENT ON TABLE public.product_emotion           IS '商品情绪编译结果缓存 - 详情页直读，避免每次渲染调 LLM';
COMMENT ON TABLE public.emotion_taxonomy          IS '情绪词表桥接 - 商品 mood_tags 与用户 6 情绪态(inner_label) 的映射';

-- ✅ 完成！
