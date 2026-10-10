-- ============================================
-- 00071 同步「类目情绪编译策略表」至扩展后版本
-- 目标：让云端 category_emotion_profiles 与前端内置
--       src/utils/category-emotion.ts 的 CATEGORY_EMOTION_MAP
--       完全一致，运营可在 Supabase Dashboard / 后台直接改词、免发版生效。
--
-- 背景：
--   - 00040 已建表并写入「扩展前」的旧词库（metaphors/aliases 较小）。
--   - 本轮在前端把 11 业态的 metaphors / aliases 做了扩充，
--     本迁移把云端词库同步成扩展版；同时与 00070 ingredients 对齐 RLS 策略。
--
-- 幂等说明：
--   - CREATE TABLE IF NOT EXISTS：云端缺表则建（结构对齐 00040，metaphors 为 JSONB），已存在则跳过。
--   - INSERT ... ON CONFLICT(category_key) DO UPDATE：已存在则刷新为扩展版。
--   - ⚠️ 若运营已在云端手动改过词库，重跑本文件种子段会用内置扩展版覆盖其修改；
--     生产环境请勿重复执行种子段，日常改词请在 Dashboard / 运营后台进行。
-- ============================================

-- ========== 1. 确保表存在（结构对齐 00040） ==========
CREATE TABLE IF NOT EXISTS public.category_emotion_profiles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key       TEXT NOT NULL UNIQUE,
  label              TEXT NOT NULL,
  tone               TEXT,
  allowed_mood_tags  TEXT[] DEFAULT '{}',
  metaphors          JSONB DEFAULT '[]'::jsonb,   -- 与 00040 一致：JSONB 数组，前端 rowToProfile 兼容
  angles             TEXT[] DEFAULT '{}',
  openers            TEXT[] DEFAULT '{}',          -- 代码 select 但 rowToProfile 不映射（引擎用通用起笔），此处留空
  closers            TEXT[] DEFAULT '{}',
  aliases            TEXT[] DEFAULT '{}',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cep_key ON public.category_emotion_profiles(category_key);

-- ========== 2. 同步 11 业态策略（扩展版） ==========
-- metaphors 为 JSONB 数组字面量；openers 留空数组。
INSERT INTO public.category_emotion_profiles
  (category_key, label, tone, allowed_mood_tags, metaphors, angles, openers, closers, aliases)
VALUES
  ('餐饮', '餐饮美食', '烟火人间，与人共食的妥帖',
   ARRAY['治愈','满足','幸福','温馨','甜蜜','愉悦','分享','用餐时光','放松','仪式感','怀旧','温暖'],
   '["灶上咕嘟的汤","一桌人对坐的灯","街角老馆子的香","碗中升腾的热气","筷子夹起的暖","碗底沉着的光"]'::jsonb,
   ARRAY['与人共食，滋味更浓。','一蔬一饭，最抚凡人心。','围坐的此刻，便是归处。'],
   ARRAY[]::text[],
   ARRAY['趁热，慢慢吃。','这一餐，值得好好坐下来。'],
   ARRAY['正餐','小吃','快餐','火锅','烧烤','夜宵','外卖','饭','餐','美食','餐厅','家常菜','食堂','便当']),

  ('饮品', '饮品', '微醺与小憩，唇齿间的喘息',
   ARRAY['甜蜜','治愈','放松','愉悦','清新','清爽','浪漫','慢生活'],
   '["杯壁凝着的水珠","午后的一口清凉","巷口捧着的那杯暖","吸管搅动的甜","杯沿漾开的笑","冰块轻撞的响"]'::jsonb,
   ARRAY['小口啜饮，日子慢下来。','给自己一段喘息。'],
   ARRAY[]::text[],
   ARRAY['慢慢喝，不着急。'],
   ARRAY['奶茶','咖啡','果茶','酒水','茶','饮料','汽水','果汁','柠檬茶','拿铁','奶茶店','饮品店']),

  ('烘焙', '烘焙甜点', '晨间手作的温度',
   ARRAY['甜蜜','治愈','温馨','幸福','满足','浪漫'],
   '["刚出炉的暖香","窗台边那块松软","晨光里的酥皮","指尖沾着的糖粉","出炉时的暖光","糖霜落下的细"]'::jsonb,
   ARRAY['一口下去，整个人都松了。','甜的东西，最懂安慰。'],
   ARRAY[]::text[],
   ARRAY['趁新鲜，尝一口。'],
   ARRAY['面包','甜点','蛋糕','西点','糕点','甜品','面包店','甜品店','烘焙坊']),

  ('水果生鲜', '水果生鲜', '土地与时令的鲜活',
   ARRAY['清爽','清新','自然','纯净','解暑','治愈','活力','满足'],
   '["枝头带露的鲜","山野吹来的风","刚从土里醒来的清气","井水镇过的脆","枝头带露的艳","咬开溅起的甜"]'::jsonb,
   ARRAY['从田间到舌尖，不过片刻。','应季的鲜，最懂身体。'],
   ARRAY[]::text[],
   ARRAY['鲜的，不必多说。'],
   ARRAY['果蔬','水果','生鲜','蔬菜','肉禽','海鲜','农产','食材','农场','水果店','菜场','果业','果园','果蔬店']),

  ('零售', '零售百货', '悦己的小确幸与陪伴',
   ARRAY['快乐','满足','惊喜','治愈','温馨','可爱','有趣','浪漫','甜蜜','怀旧'],
   '["抽屉里的小欢喜","案头的一件趣物","旧书页的香","随手摆着的可爱","抽屉里的小确幸","随手摆着的光"]'::jsonb,
   ARRAY['给自己一点甜。','寻常日子里的小光。'],
   ARRAY[]::text[],
   ARRAY['喜欢，就带它回家。'],
   ARRAY['零食','百货','图书','日用','杂货','文创','超市','便利店','杂货铺','小超市','文具']),

  ('美业', '丽人美业', '悦己与焕新的精致',
   ARRAY['精致','治愈','放松','浪漫','甜蜜','仪式感','高端','典雅'],
   '["镜中焕然的自己","指尖温柔的时光","被妥帖照料的容颜","发梢掠过的轻","镜中舒展的眉","指尖流过的柔"]'::jsonb,
   ARRAY['为自己停下来的那一刻。','好好爱自己，不亏。'],
   ARRAY[]::text[],
   ARRAY['你值得被温柔对待。'],
   ARRAY['美甲','美容','美发','护肤','SPA','丽人','造型','美睫','纹绣','美妆','养肤','美颜']),

  ('娱乐', '休闲娱乐', '释放与社交的沉浸',
   ARRAY['快乐','兴奋','刺激','活力','愉悦','分享','有趣'],
   '["灯影里炸开的笑","一群人的喧闹","卸下伪装的夜","屏幕亮起的雀跃","屏幕亮起的喧","夜场炸开的笑"]'::jsonb,
   ARRAY['痛快闹一场。','和朋友，才够味。'],
   ARRAY[]::text[],
   ARRAY['今晚，尽兴就好。'],
   ARRAY['KTV','剧本杀','影院','密室','电玩','桌游','酒吧','夜店','游乐','演出','电竞','Livehouse','轰趴','游乐园']),

  ('运动健身', '运动健身', '活力与自律的突破',
   ARRAY['活力','满足','专注','兴奋','放松','自然'],
   '["汗水落地的脆","突破极限的喘息","身体苏醒的晨","肌肉舒展的暖","心率跳动的鼓","肌肉记忆的暖"]'::jsonb,
   ARRAY['动起来，通体舒畅。','坚持，身体会记得。'],
   ARRAY[]::text[],
   ARRAY['练完这一组，整个人都轻了。'],
   ARRAY['瑜伽','游泳','私教','健身','拳击','骑行','跑步','舞蹈','健身房','工作室','普拉提']),

  ('亲子', '亲子', '陪伴与成长的童真',
   ARRAY['温馨','幸福','甜蜜','治愈','快乐','可爱'],
   '["孩子扬起的笑","牵着的小手","时光里的童真","蹦跳着的身影","小手攥着的暖","笑涡漾开的甜"]'::jsonb,
   ARRAY['陪他长大，也是陪自己重温童年。','孩子的笑，最能化开疲惫。'],
   ARRAY[]::text[],
   ARRAY['这样的时光，最珍贵。'],
   ARRAY['乐园','早教','摄影','婴童','儿童','母婴','托管','亲子乐园','绘本馆','游乐场']),

  ('生活服务', '生活服务', '省心与托付的安心',
   ARRAY['放松','治愈','实用','温馨','安心'],
   '["交出去的轻松","被妥帖打理的琐碎","归家时的整洁","不必自己动手的闲","被妥帖安顿的闲","交出去的轻"]'::jsonb,
   ARRAY['麻烦的事，交给专业的人。','把时间留给自己。'],
   ARRAY[]::text[],
   ARRAY['剩下的，安心就好。'],
   ARRAY['家政','维修','洗衣','洗车','保洁','托管','养护','上门','收纳','月嫂','管家']),

  ('酒店民宿', '酒店民宿', '栖居与远方的慢生活',
   ARRAY['放松','治愈','慢生活','浪漫','平静','安逸','温馨'],
   '["推窗见远的辽阔","一夜安眠的软","异乡的灯","院里那棵老树","山雾散去的晨","被窝里的暖"]'::jsonb,
   ARRAY['在路上，也是在家。','换一处地方，换一种心绪。'],
   ARRAY[]::text[],
   ARRAY['好好歇一晚。'],
   ARRAY['酒店','民宿','客栈','住宿','青旅','度假','度假村'])

ON CONFLICT (category_key) DO UPDATE SET
  label             = EXCLUDED.label,
  tone              = EXCLUDED.tone,
  allowed_mood_tags = EXCLUDED.allowed_mood_tags,
  metaphors         = EXCLUDED.metaphors,
  angles            = EXCLUDED.angles,
  openers           = EXCLUDED.openers,
  closers           = EXCLUDED.closers,
  aliases           = EXCLUDED.aliases,
  updated_at        = NOW();

-- ========== 3. RLS：启用 + 匿名只读（与 00070 ingredients 策略一致） ==========
-- 小程序前端用 anon key 读取本表；写入由 service_role / 运营后台处理。
-- 00040 曾 DISABLE RLS，此处统一启用并加只读策略，保证匿名读取稳定且不暴露写权限。
ALTER TABLE public.category_emotion_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_emotion_profiles_read_all ON public.category_emotion_profiles;
CREATE POLICY category_emotion_profiles_read_all
  ON public.category_emotion_profiles FOR SELECT USING (true);

-- ========== 4. updated_at 触发器（依赖 00070 的 set_updated_at()，此处兜底定义以保证自包含） ==========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_category_emotion_profiles_updated_at ON public.category_emotion_profiles;
CREATE TRIGGER trg_category_emotion_profiles_updated_at
  BEFORE UPDATE ON public.category_emotion_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== 5. 自校验（执行后应返回真值） ==========
-- SELECT count(*) AS cat_seed_count FROM public.category_emotion_profiles;               -- 期望 11
-- SELECT category_key, jsonb_array_length(metaphors) AS metaphor_cnt
--   FROM public.category_emotion_profiles ORDER BY category_key;                          -- 各业态 metaphors 应为 6
COMMENT ON TABLE public.category_emotion_profiles IS
  '类目情绪编译策略表：11 业态策略，运营可在 Dashboard / 后台直接编辑 metaphors/aliases/angles 等，免发版生效（前端 loadCategoryEmotionProfilesFromDb 热加载覆盖内置策略）';
