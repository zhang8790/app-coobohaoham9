-- ============================================================
-- 00124_add_self_operated_store.sql
-- 新增【自营门店（探索页）】模板
--
-- 用途：平台自有旗舰渠道（探索页）靠 is_platform=true 识别，
--       不走商家申请流，直接用本脚本建店 + 可选塞默认商品。
--
-- 使用方式：
--   方式 A（推荐，本机 Dashboard）：打开 SQL Editor 整段粘贴 → Run。
--   方式 B（CLI）：supabase db push（按编号自动执行）。
--
-- ⚠️ 重要：stores.id 是 uuid 类型，不能用 "store-platform-002" 这种助记字符串
--          （会报 22P02）。这里用【固定合法 UUID】做幂等主键。
-- ⭐ 关键：is_platform 已锁死为 true。忘了它店会错落到「犒赏铺」商家区。
-- 🔁 幂等：重复执行不会重复建店（靠 ON CONFLICT(id) 兜底）。
-- 📌 想再加第 3 家自营店，复制本文件并把下面 v_store_id 换成新的固定 UUID 即可。
-- ============================================================

DO $$
DECLARE
  -- 固定合法 UUID（stores.id 为 uuid 类型，不可用语记字符串）。改店时换一个新 UUID。
  v_store_id uuid := '9f2c4b6e-7d3a-4c5b-8e1f-0a2b3c4d5e6f';
  v_owner    uuid := 'd6b38349-dded-4879-9eac-3165a646436a'; -- 平台主账号(1870)，勿改
BEGIN
  INSERT INTO stores (
    id, owner_id, name, description, address, phone, category,
    image_url, banner_url, rating, is_active, is_platform,
    is_open, open_time, close_time, referral_rate, short_code
  ) VALUES (
    v_store_id, v_owner,
    '来电有喜·生鲜自营馆',                       -- 【改】店名
    '平台自营生鲜好货，产地直供，品质保障',         -- 【改】简介
    '侠客总部 1 号',
    '400-888-8888',
    '生鲜',                                       -- 【改】类目（图书/美食/饮品/零食/日用/礼品/生鲜）
    'https://picsum.photos/seed/plat-store2/400/400',
    'https://picsum.photos/seed/plat-banner2/800/400',
    5.0, true,
    true,                                          -- ⭐ 锁死：自营门店（探索页识别依据）
    true, '08:00', '22:00',
    0.20,                                          -- 【改】让利率（小数口径，0.20 = 20%）
    'LDYX02'
  )
  ON CONFLICT (id) DO UPDATE SET
    name         = EXCLUDED.name,
    description  = EXCLUDED.description,
    category     = EXCLUDED.category,
    referral_rate = EXCLUDED.referral_rate,
    is_platform  = true;   -- 双保险：无论如何都保持自营属性

  -- 可选：给新自营店塞 2 个默认商品，探索页立刻有内容（重复执行不重复插入）
  INSERT INTO products (
    store_id, name, description, price, original_price,
    image_url, category, is_active, mood_tags, scene_tags
  ) VALUES
    (v_store_id, '自营·当季鲜橙', '产地直供，皮薄多汁', 19.90, 39.90,
     'https://picsum.photos/seed/plat-orange/400/400', '生鲜', true,
     ARRAY['活力','满足'], ARRAY['自取','外卖']),
    (v_store_id, '自营·每日坚果', '7 日独立装，营养便携', 49.90, 89.90,
     'https://picsum.photos/seed/plat-nut/400/400', '零食', true,
     ARRAY['专注','健康'], ARRAY['自取','外卖'])
  ON CONFLICT DO NOTHING;
END $$;

-- 校验：应能看到新店 is_platform = true（探索页识别依据）
SELECT id, name, category, referral_rate, is_platform
FROM stores
WHERE is_platform = true
ORDER BY id;
