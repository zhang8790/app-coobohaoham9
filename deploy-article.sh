#!/usr/bin/env bash
# 文章体系部署脚本
# 作用：把「导入文章提取 + 图片落库」相关改动部署到 Supabase
#   - 00211 迁移：articles 补 images 列
#   - article-fetch Edge Function：提取正文 + 图片 + 视频（修复截断）
#
# 前置：已登录 supabase CLI（supabase login）且 link 了本项目。
# 用法：bash deploy-article.sh
set -e

echo "==> [1/2] 推送数据库迁移（articles.images 列）"
supabase db push

echo "==> [2/2] 部署 article-fetch Edge Function"
supabase functions deploy article-fetch

echo ""
echo "✅ 文章体系部署完成。"
echo "   - 创作页导入文章链接：将提取 标题 / 正文 / 图片 / 视频"
echo "   - 导入图片会写入 articles.images 并在详情页/预览内联展示"
echo "   - 创作页新增「预览」按钮（公众号式，未保存即可看排版）"
echo "   - 「我的文章」入口：创作页顶栏 + 我的页「个人中心」"
echo ""
echo "前端改动需另行执行 bash build-weapp.sh 并上传代码包。"
