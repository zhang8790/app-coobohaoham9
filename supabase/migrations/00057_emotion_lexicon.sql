-- 00057 情绪词库表（运营可维护的用户表达词 → 标准情绪标签）
-- 这是前端 EMOTION_KEYWORD_MAP 的 DB 化基础：运营/非技术也能加同义词，
-- 未来 analyzeEmotion 可优先读此表（未命中再走 LLM 兜底）。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴执行（纯 SQL，非 Edge Function）。

CREATE TABLE IF NOT EXISTS public.emotion_lexicon (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_expr text NOT NULL,                 -- 用户原始表达，如 "失恋"、"被甩"
  canonical_tag text NOT NULL,            -- 标准情绪标签，如 "治愈"（须属于 ALL_MOOD_TAGS）
  weight int NOT NULL DEFAULT 3,          -- 命中权重（主标签最高，后续递减）
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raw_expr, canonical_tag)
);

COMMENT ON TABLE public.emotion_lexicon IS '情绪用户表达词库：raw_expr(用户怎么说) → canonical_tag(标准情绪标签)。前端 EMOTION_KEYWORD_MAP 的 DB 化来源。';
COMMENT ON COLUMN public.emotion_lexicon.weight IS '命中权重：主情绪给 3，第二给 2，第三给 1；其余同义给 3。';

-- 种子：把当前前端 EMOTION_KEYWORD_MAP 高频条目搬入（节选，后续运营可补）
INSERT INTO public.emotion_lexicon (raw_expr, canonical_tag, weight) VALUES
  ('失恋','治愈',3),('失恋','孤独',2),('失恋','安静',1),
  ('分手','治愈',3),('分手','孤独',2),('分手','安静',1),
  ('被甩','治愈',3),('被甩','孤独',2),('被甩','安静',1),
  ('被绿','治愈',3),('被绿','孤独',2),('被绿','安静',1),
  ('心碎','治愈',3),('心碎','孤独',2),('心碎','安静',1),
  ('累','治愈',3),('累','放松',3),('累','安静',1),
  ('好累','治愈',3),('好累','放松',3),('好累','安静',1),
  ('心累','治愈',3),('心累','孤独',2),('心累','安静',1),
  ('emo','治愈',3),('emo','放松',2),('emo','孤独',1),
  ('孤独','孤独',3),('孤独','治愈',2),('孤独','安静',1),
  ('寂寞','孤独',3),('寂寞','治愈',2),
  ('想念','想念',3),('思念','想念',3),('想你','想念',3),
  ('开心','愉悦',3),('开心','快乐',2),('开心','甜蜜',1),
  ('高兴','愉悦',3),('高兴','快乐',2),
  ('犒赏','满足',3),('犒赏','幸福',2),('犒赏','品质',1),
  ('犒劳','满足',3),('犒劳','幸福',2),('犒劳','品质',1),
  ('治愈','治愈',3),
  ('焦虑','治愈',3),('焦虑','放松',2),('焦虑','安静',1),
  ('压力大','治愈',3),('压力大','放松',2),
  ('失眠','安静',3),('失眠','治愈',2),('失眠','放松',1),
  ('加班','治愈',3),('加班','放松',2),('加班','安静',1),
  ('约会','甜蜜',3),('约会','幸福',2),('约会','仪式感',1),
  ('生日','甜蜜',3),('生日','幸福',2),('生日','分享',1)
ON CONFLICT (raw_expr, canonical_tag) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_emotion_lexicon_raw ON public.emotion_lexicon (raw_expr);
