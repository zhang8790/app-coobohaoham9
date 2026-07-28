-- 00216 文章社交：文章收藏 + 关注作者
-- 补齐 UGC 内容闭环（报告 P3）：让文章从单向发布变为可收藏、可关注作者。

-- 1. 文章收藏（与商品收藏 favorites 同构，独立表避免污染商品收藏语义）
CREATE TABLE IF NOT EXISTS article_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);
ALTER TABLE article_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户管理自己的文章收藏" ON article_favorites
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. 关注作者（user_id 关注 author_id，author_id 复用 articles.user_id 的 profiles(id) 体系）
CREATE TABLE IF NOT EXISTS article_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, author_id)
);
ALTER TABLE article_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户管理自己关注的作者" ON article_follows
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- 关注关系可公开读（用于展示作者粉丝数、是否已关注等）
CREATE POLICY "关注关系可公开读" ON article_follows FOR SELECT USING (true);

-- 3. 索引（按用户维度倒序拉取 + 作者粉丝统计）
CREATE INDEX IF NOT EXISTS idx_article_favorites_user ON article_favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_follows_user ON article_follows(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_follows_author ON article_follows(author_id);
