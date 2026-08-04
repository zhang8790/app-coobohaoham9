-- 站点级配置表：支撑首页品牌底图、运营位素材等无需发版即可热更新的配置
-- key: 配置键（全局唯一）
-- value: JSONB 任意结构化值，保留扩展性
-- updated_at: 最后更新时间
CREATE TABLE IF NOT EXISTS site_configs (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 默认配置：首页 L1 品牌主张区底图，初始为空（保持原有渐变）
INSERT INTO site_configs (key, value)
VALUES (
  'home_brand_hero_bg',
  jsonb_build_object('image_url', null, 'alt', '来电有喜品牌主张背景', 'updated_by', null)
)
ON CONFLICT (key) DO NOTHING;

-- 项目 RLS 已在历史迁移 00028_disable_all_rls 中全局关闭，
-- 后台以真实 admin 用户登录即可读写；如需重新启用 RLS，请另行为 site_configs 建 is_admin() 策略。
