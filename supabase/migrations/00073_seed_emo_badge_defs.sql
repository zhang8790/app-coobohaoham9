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
