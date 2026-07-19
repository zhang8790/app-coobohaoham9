-- 00105 用户体质/健康状况档案（食疗个性化匹配用）
-- 用户在小程序「我的体质档案」页自填体质/健康状况标签，持久化到 profiles.constitution_tags，
-- 登录后由 FoodTherapyContext 自动注入当前匹配人群，实现"用户输入体质→自动配对商品"。
-- 该列仅作食养参考匹配维度，不替代医嘱；严禁在商品文案中出现"治疗/降血压"等医疗宣称。

alter table profiles
  add column if not exists constitution_tags text[] null default null;

-- GIN 索引：便于按标签快速检索（如运营侧聚合某体质人群）
create index if not exists idx_profiles_constitution_tags
  on profiles using gin (constitution_tags);

comment on column profiles.constitution_tags is
  '用户自填的体质/健康状况标签（如 宫寒量少 / 高血压），用于食疗商品匹配；仅作食养参考，不替代医嘱';
