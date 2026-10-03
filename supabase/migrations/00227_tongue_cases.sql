-- ============================================================================
-- 00227_tongue_cases.sql
-- 目的：建立「舌象案例库」（平台自建、去标识聚合数据，仅作望舌辨证引擎参考语料，
--       不存任何个人可识别健康信息）。配套 20 条种子（由真实引擎派生，见
--       src/scripts/gen_tongue_cases_seed.ts，库内指标与 App 展示同源，避免漂移）。
--
-- 合规：案例库只收去标识聚合数据（见 utils/food-therapy/tongue-compliance.ts）。
--       RLS：公开只读（select using(true)）；写操作仅限 is_admin()（后台维护）。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 建表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tongue_cases (
  case_no                text PRIMARY KEY,
  source                 text NOT NULL DEFAULT 'engine',
  features               jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers                integer[] NOT NULL DEFAULT '{}',
  constitution_primary   text NOT NULL,
  constitution_secondary text,
  health_index           numeric(5,1) NOT NULL,
  band                   text NOT NULL,
  confidence             numeric(3,2) NOT NULL,
  tags                   text[] NOT NULL DEFAULT '{}',
  expert_note            text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tongue_cases IS '舌象案例库：平台自建去标识参考语料，供望舌辨证引擎与运营检索，不存个人可识别信息';
COMMENT ON COLUMN public.tongue_cases.case_no IS '案例编号 TC-xxxx（幂等种子键）';
COMMENT ON COLUMN public.tongue_cases.source IS '来源：engine=引擎识别 / expert=专家订正';
COMMENT ON COLUMN public.tongue_cases.features IS '8 维望舌特征（维度id->选项文案），对应 TONGUE_QUESTIONS';
COMMENT ON COLUMN public.tongue_cases.answers IS '8 维选项下标，顺序同 TONGUE_QUESTIONS';
COMMENT ON COLUMN public.tongue_cases.constitution_primary IS '主倾向（9 体质 key）';
COMMENT ON COLUMN public.tongue_cases.constitution_secondary IS '兼夹倾向（可能为 null）';
COMMENT ON COLUMN public.tongue_cases.health_index IS '食养健康指数 0~100（computeHealthIndex 派生）';
COMMENT ON COLUMN public.tongue_cases.band IS '风险分级 low/mid/high';
COMMENT ON COLUMN public.tongue_cases.confidence IS '置信度 0~1';
COMMENT ON COLUMN public.tongue_cases.tags IS '标签（体质名/舌象特征词），供检索';
COMMENT ON COLUMN public.tongue_cases.expert_note IS '专家订正说明（去标识、仅生活化归因，不涉诊断）';

-- ---------------------------------------------------------------------------
-- 2. 索引
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_tongue_cases_primary   ON public.tongue_cases (constitution_primary);
CREATE INDEX IF NOT EXISTS ix_tongue_cases_secondary ON public.tongue_cases (constitution_secondary);
CREATE INDEX IF NOT EXISTS ix_tongue_cases_band      ON public.tongue_cases (band);
CREATE INDEX IF NOT EXISTS ix_tongue_cases_tags      ON public.tongue_cases USING gin (tags);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tongue_cases ENABLE ROW LEVEL SECURITY;

-- 公开只读（去标识聚合数据，不涉个人信息）
DROP POLICY IF EXISTS tongue_cases_select_public ON public.tongue_cases;
CREATE POLICY tongue_cases_select_public ON public.tongue_cases
  FOR SELECT USING (true);

-- 写操作仅限管理员（与后台其他表一致，依赖迁移 00081/00092/00095 的 is_admin()）
DROP POLICY IF EXISTS tongue_cases_write_admin ON public.tongue_cases;
CREATE POLICY tongue_cases_write_admin ON public.tongue_cases
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- 4. 种子（20 条，由真实引擎派生，幂等）
-- ---------------------------------------------------------------------------
-- === 以下由 src/scripts/gen_tongue_cases_seed.ts 生成，请勿手改 ===
insert into public.tongue_cases
  (case_no, source, features, answers, constitution_primary, constitution_secondary,
   health_index, band, confidence, tags, expert_note)
values
  ('TC-0001', 'engine', '{"area":"正常大小（常见）","color":"淡红 / 粉红（常见）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,0,0,0,0,0,0,0], 'pinghe', null, 96.0, 'low', 0.95, ARRAY['平和','舌淡红','苔薄白'], null),
  ('TC-0002', 'expert', '{"area":"胖大（伸舌抵齿）","color":"偏淡白（颜色发浅）","coat_color":"薄白苔（常见）","coat_texture":"水滑多津","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,1,0,4,2,0,2,0], 'yangxu', 'tanshi', 47.8, 'high', 0.74, ARRAY['阳虚','舌淡白','胖大舌','苔水滑'], '典型阳虚舌：淡白胖大、苔水滑'),
  ('TC-0003', 'engine', '{"area":"正常大小（常见）","color":"偏淡白（颜色发浅）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,1,0,0,1,0,0,0], 'yangxu', null, 86.4, 'low', 0.61, ARRAY['阳虚','舌淡白'], null),
  ('TC-0004', 'expert', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"少苔 / 无苔（舌面光红）","coat_texture":"少而干","teeth":"没有明显齿痕（常见）","crack":"有裂纹 / 裂沟","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,2,4,3,0,1,1,0], 'yinxu', null, 48.0, 'high', 0.85, ARRAY['阴虚','舌红','少苔','裂纹'], '典型阴虚舌：舌红少苔、有裂纹'),
  ('TC-0005', 'engine', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"淡黄苔","coat_texture":"厚而干","teeth":"没有明显齿痕（常见）","crack":"有裂纹 / 裂沟","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,2,2,2,0,1,1,0], 'yinxu', 'shire', 51.0, 'high', 0.78, ARRAY['阴虚','舌红','苔干'], null),
  ('TC-0006', 'engine', '{"area":"胖大（伸舌抵齿）","color":"淡红 / 粉红（常见）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,0,0,0,1,0,0,0], 'qixu', null, 76.8, 'mid', 0.69, ARRAY['气虚','胖大舌','齿痕'], null),
  ('TC-0007', 'engine', '{"area":"胖大（伸舌抵齿）","color":"偏淡白（颜色发浅）","coat_color":"白而厚","coat_texture":"厚腻","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,1,1,1,2,0,2,0], 'tanshi', 'qixu', 35.0, 'high', 0.95, ARRAY['气虚','痰湿','胖大舌','苔厚腻'], null),
  ('TC-0008', 'expert', '{"area":"正常大小（常见）","color":"淡红 / 粉红（常见）","coat_color":"白而厚","coat_texture":"厚腻","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,0,1,1,2,0,2,0], 'tanshi', null, 64.0, 'high', 0.80, ARRAY['痰湿','苔白厚腻','齿痕','苔滑'], '典型痰湿舌：苔白厚腻、边有齿痕'),
  ('TC-0009', 'engine', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"黄厚腻苔","coat_texture":"厚腻","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,2,3,1,1,0,1,0], 'shire', 'tanshi', 57.8, 'high', 0.80, ARRAY['湿热','舌红','苔黄厚腻'], null),
  ('TC-0010', 'expert', '{"area":"正常大小（常见）","color":"暗红 / 绛红","coat_color":"黄厚腻苔","coat_texture":"厚腻","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"青紫明显 / 曲张如小鱼"}'::jsonb, ARRAY[0,3,3,1,1,0,1,2], 'shire', 'tanshi', 57.8, 'high', 0.79, ARRAY['湿热','血瘀','舌暗红','苔黄厚腻','舌下络脉曲张'], '湿热挟瘀：舌暗红、苔黄厚腻、舌下络脉曲张'),
  ('TC-0011', 'expert', '{"area":"正常大小（常见）","color":"青紫 / 暗紫","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"青紫明显 / 曲张如小鱼"}'::jsonb, ARRAY[0,4,0,0,0,0,0,2], 'xueyu', null, 70.4, 'mid', 0.70, ARRAY['血瘀','舌青紫','舌下络脉曲张'], '典型血瘀舌：舌青紫、舌下络脉青紫曲张'),
  ('TC-0012', 'engine', '{"area":"正常大小（常见）","color":"暗红 / 绛红","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"偏青紫、略粗"}'::jsonb, ARRAY[0,3,0,0,0,0,0,1], 'xueyu', null, 83.2, 'mid', 0.66, ARRAY['血瘀','舌暗红','舌下络脉偏粗'], null),
  ('TC-0013', 'engine', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"黄厚腻苔","coat_texture":"厚腻","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"偏青紫、略粗"}'::jsonb, ARRAY[0,2,3,1,1,0,1,1], 'shire', 'tanshi', 57.8, 'high', 0.86, ARRAY['湿热','苔黄厚腻'], null),
  ('TC-0014', 'engine', '{"area":"正常大小（常见）","color":"暗红 / 绛红","coat_color":"少苔 / 无苔（舌面光红）","coat_texture":"少而干","teeth":"没有明显齿痕（常见）","crack":"有裂纹 / 裂沟","moist":"偏干 / 少津","sublingual":"偏青紫、略粗"}'::jsonb, ARRAY[0,3,4,3,0,1,1,1], 'yinxu', null, 54.4, 'high', 0.95, ARRAY['阴虚','血瘀','舌暗红','少苔','裂纹'], null),
  ('TC-0015', 'engine', '{"area":"正常大小（常见）","color":"偏淡白（颜色发浅）","coat_color":"薄白苔（常见）","coat_texture":"水滑多津","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,1,0,4,0,0,2,0], 'yangxu', null, 70.4, 'mid', 0.79, ARRAY['阳虚','舌淡白','苔水滑'], null),
  ('TC-0016', 'engine', '{"area":"胖大（伸舌抵齿）","color":"淡红 / 粉红（常见）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,0,0,0,1,0,1,0], 'qixu', null, 76.8, 'mid', 0.74, ARRAY['气虚','胖大舌','齿痕'], null),
  ('TC-0017', 'engine', '{"area":"胖大（伸舌抵齿）","color":"淡红 / 粉红（常见）","coat_color":"白而厚","coat_texture":"厚腻","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,0,1,1,2,0,2,0], 'tanshi', null, 51.2, 'high', 0.93, ARRAY['痰湿','胖大舌','苔厚腻','齿痕'], null),
  ('TC-0018', 'engine', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"淡黄苔","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,2,2,0,0,0,0,0], 'shire', null, 80.0, 'mid', 0.66, ARRAY['湿热','舌红','苔淡黄'], null),
  ('TC-0019', 'engine', '{"area":"胖大（伸舌抵齿）","color":"暗红 / 绛红","coat_color":"白而厚","coat_texture":"厚腻","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"青紫明显 / 曲张如小鱼"}'::jsonb, ARRAY[1,3,1,1,2,0,2,2], 'tanshi', null, 51.2, 'high', 0.95, ARRAY['血瘀','痰湿','舌暗红','苔厚腻','舌下络脉曲张'], null),
  ('TC-0020', 'engine', '{"area":"正常大小（常见）","color":"偏淡白（颜色发浅）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,1,0,0,0,0,1,0], 'yangxu', null, 86.4, 'low', 0.61, ARRAY['阳虚','舌淡白'], null)
on conflict (case_no) do nothing;

COMMIT;

-- ---------------------------------------------------------------------------
-- 验收：应返回 20 行；按 band 分布 low/mid/high；主倾向覆盖 7 种可收录体质
-- （气郁 qiyu 在 8 维望舌特征中无加分项，引擎不输出，案例库不收录，见合规文档）。
-- ---------------------------------------------------------------------------
-- SELECT band, count(*) FROM public.tongue_cases GROUP BY band ORDER BY band;
-- SELECT constitution_primary, count(*) FROM public.tongue_cases
--   GROUP BY constitution_primary ORDER BY 2 DESC;
