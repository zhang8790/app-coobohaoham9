-- 修复「创作不能发布」：articles 表此前只有 read(公开) + admin(ALL) 两条 RLS 策略，
-- 普通登录用户没有 INSERT/UPDATE/DELETE 权限，导致发布文章被 RLS 拦截。
-- 补充「作者只能操作自己的文章」策略，与既有 admin 策略并存。

-- 插入：登录用户只能插入 user_id = 自己 的行
drop policy if exists rls_articles_insert_self on public.articles;
create policy rls_articles_insert_self on public.articles
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 更新：作者只能改自己的文章
drop policy if exists rls_articles_update_self on public.articles;
create policy rls_articles_update_self on public.articles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 删除：作者只能删自己的文章
drop policy if exists rls_articles_delete_self on public.articles;
create policy rls_articles_delete_self on public.articles
  for delete to authenticated
  using (auth.uid() = user_id);
