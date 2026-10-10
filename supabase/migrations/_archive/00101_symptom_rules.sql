-- 00101 症状/人群规则库（可运营配置）
-- 原硬编码于 src/utils/food-therapy/symptom-rules.ts，现平移为 DB 表 + 缓存，
-- 运营可在 admin-web 免发版增删改规则；小程序端加载失败自动回退硬编码兜底。
-- 须用户本机执行（沙箱无 supabase CLI/Token）。

CREATE TABLE IF NOT EXISTS public.symptom_rules (
  id                   text PRIMARY KEY,
  category             text NOT NULL CHECK (category IN ('throat', 'menstruation', 'constitution', 'scene')),
  label                text NOT NULL,
  keywords             text[] NOT NULL DEFAULT '{}',
  priority_health_tags text[] NOT NULL DEFAULT '{}',
  ban_natures          text[] NOT NULL DEFAULT '{}',
  ban_health_tags      text[] NOT NULL DEFAULT '{}',
  remind_text          text  NOT NULL DEFAULT '',
  is_active            boolean NOT NULL DEFAULT true,
  sort_order           int  NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 运营配置表，测试期 DISABLE RLS（admin-web 用 anon key 直连读写；非敏感用户数据）
ALTER TABLE public.symptom_rules DISABLE ROW LEVEL SECURITY;

-- 种子：与 symptom-rules.ts 现有 12 条保持一致（幂等 upsert）
INSERT INTO public.symptom_rules
  (id, category, label, keywords, priority_health_tags, ban_natures, ban_health_tags, remind_text, sort_order)
VALUES
  ('throat-sore','throat','咽喉干痒/不适',
    ARRAY['咽喉','嗓子','喉咙','干痒','咽痛','用嗓','K歌','唱歌','讲课','主播'],
    ARRAY['润肺止咳','清热降火'], ARRAY['温热','大热'], ARRAY['温中散寒'],
    '少辛辣过烫，忌烟酒刺激，温饮润喉', 10),

  ('throat-voice','throat','用嗓过度',
    ARRAY['用嗓','嗓子哑','讲课','主播','嘶哑','说话多','喊麦'],
    ARRAY['润肺止咳','滋阴润燥'], ARRAY['大热'], ARRAY[]::text[],
    '温饮润喉，避免冰饮与辛辣', 11),

  ('menstruation','menstruation','经期/生理期',
    ARRAY['经期','大姨妈','生理期','例假','月经','痛经','宫寒'],
    ARRAY['补气养血','温中散寒'], ARRAY['寒凉','大寒'], ARRAY['清热降火','利水消肿'],
    '忌生冷寒凉，宜温饮温食，注意保暖', 20),

  ('constitution-fire','constitution','易上火体质',
    ARRAY['易上火','上火','长痘','口腔溃疡','怕热','湿热'],
    ARRAY['清热降火','滋阴润燥'], ARRAY['温热','大热'], ARRAY[]::text[],
    '少辛辣温补，多清润滋阴', 30),

  ('constitution-cold','constitution','畏寒怕冷',
    ARRAY['畏寒','怕冷','手脚凉','体寒','宫寒','阳虚'],
    ARRAY['温中散寒','补气养血'], ARRAY['寒凉','大寒'], ARRAY['清热降火'],
    '宜温补，忌生冷寒凉', 31),

  ('constitution-spleen','constitution','脾胃偏弱',
    ARRAY['脾胃','消化弱','胃弱','容易胀','脾虚','积食','没胃口'],
    ARRAY['健脾养胃','消食化积'], ARRAY[]::text[], ARRAY[]::text[],
    '七分饱，细嚼慢咽，忌暴饮暴食', 32),

  ('constitution-sleep','constitution','睡眠浅/失眠',
    ARRAY['睡眠浅','失眠','睡不好','多梦','入睡难','焦虑睡'],
    ARRAY['安神助眠','补气养血'], ARRAY['大热'], ARRAY[]::text[],
    '晚间宜清淡温润，忌兴奋刺激', 33),

  ('scene-stayup','scene','熬夜后',
    ARRAY['熬夜','加班','通宵','晚睡','夜班'],
    ARRAY['补气养血','安神助眠'], ARRAY['大热'], ARRAY[]::text[],
    '补气血的同时早点休息', 40),

  ('scene-greasy','scene','油腻饮食后',
    ARRAY['油腻','吃多','撑','积食','火锅','烧烤','大餐','解腻'],
    ARRAY['消食化积','清热降火'], ARRAY['温热'], ARRAY[]::text[],
    '解腻消食，适量为宜', 41),

  ('scene-season','scene','换季温差',
    ARRAY['换季','降温','温差','着凉','感冒前期','冷'],
    ARRAY['温中散寒','补气养血'], ARRAY['寒凉','大寒'], ARRAY['清热降火'],
    '注意保暖，温食护体', 42),

  ('scene-autumn','scene','秋燥',
    ARRAY['秋燥','干燥','皮肤干','口干','鼻干','燥'],
    ARRAY['滋阴润燥','润肺止咳'], ARRAY['大热'], ARRAY[]::text[],
    '多润少燥，忌辛辣助火', 43),

  ('scene-exercise','scene','运动后',
    ARRAY['运动','健身','出汗','锻炼','跑步','撸铁'],
    ARRAY['补气养血'], ARRAY['大寒'], ARRAY[]::text[],
    '运动后可温补，忌立刻冰饮', 44)

ON CONFLICT (id) DO UPDATE SET
  category             = EXCLUDED.category,
  label                = EXCLUDED.label,
  keywords             = EXCLUDED.keywords,
  priority_health_tags = EXCLUDED.priority_health_tags,
  ban_natures          = EXCLUDED.ban_natures,
  ban_health_tags      = EXCLUDED.ban_health_tags,
  remind_text          = EXCLUDED.remind_text,
  sort_order           = EXCLUDED.sort_order,
  updated_at           = now();
