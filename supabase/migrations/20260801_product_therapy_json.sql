-- 20260801 食养系统化：新增 therapy_json 单一数据源列
-- 目的：把"食疗统一引擎(buildTherapyReport)"的计算结果持久化为单一可信字段，
--       所有页面(首页/门店卡/详情)优先读 therapy_json，避免各端各算、数据不一致；
--       并支撑「上传商品自动用食养」+ 存量商品 backfill（由 product-therapy-sync EF 回写）。
-- 注：迁移按字母序排到 20260731_* 之后（supabase 用文件名排序），确保最后执行。

alter table public.products
  add column if not exists therapy_json jsonb,
  add column if not exists therapy_pending boolean not null default false,
  add column if not exists fit_people text;

comment on column public.products.therapy_json is
  '食疗统一引擎完整报告（单一数据源）。由 product-therapy-sync Edge Function 或商家端保存时回写。'
  '字段含 overall_nature_code / overall_nature / combined_effect / fit_people / caution_people / chronic_tags / warnings / merchant_note / disclaimer。页面优先读此字段。';
comment on column public.products.therapy_pending is
  'true = 尚无食材且名称无法推导食养，待人工补食材后回算；false = 已算或无需算。';
comment on column public.products.fit_people is
  '适宜人群文案（来自 therapy_json.fit_people 的冗余加速列，避免每页解析 jsonb）。';
