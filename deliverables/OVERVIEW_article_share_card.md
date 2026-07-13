# 文章分享卡片优化

## 问题
1. 文章详情页底部「分享」按钮点击无反应。
2. 转发文章时分享卡片的标题过长、主题不突出，无法吸引点击。
3. 用户希望做出类似公众号文章分享卡片（标题 + 摘要 + 图片）的精美效果。

## 解决方案

### 1. 修复分享按钮触发
- 将底部「分享」从 `View + Taro.showShareMenu` 改为 `Button openType="share"`。
- `showShareMenu` 只能开启右上角菜单，无法直接触发发送面板；`openType="share"` 才是触发原生分享面板的正确方式。

### 2. 优化分享标题
- 新增 `buildArticleShareTitle(article)`：`src/utils/share.ts`
  - 去掉运营/测试残留后缀（如「预览时标签不可点」）。
  - 截断到 26 字以内，优先在句读处截断，保留悬念。
  - 标题过短时，用情绪标签 + 摘要兜底。

### 3. 生成 Canvas 分享海报
- 新增 `src/utils/share-poster.ts`：`generateArticleSharePoster(article, canvasId)`
  - 画布尺寸 500×400（小程序分享图推荐比例）。
  - 左侧：深色渐变背景 +「好文推荐」标签 + 标题 + 摘要 + 品牌。
  - 右侧：文章封面图（带渐变融入）。
  - 无封面时：左侧文字区全宽展示，仍保持精美。
  - 封面下载失败时：降级为纯文字海报，不影响分享。
- 在 `article-detail/index.tsx` 中渲染一个隐藏 `<Canvas type="2d" id="articleShareCanvas" />`。
- 文章加载成功后 500ms 异步生成海报，存入 `sharePosterUrl`。
- `useShareWithReferral` 优先使用生成的海报图，生成失败则回退到 `article.cover_image`。

## 验证
- `taro build --type weapp` 成功，22.62s。
- `dist/pages/article-detail/index.js` 中确认：
  - `openType:"share"` 存在
  - `articleShareCanvas` 存在
  - `createSelectorQuery` / `createImage` / `canvasToTempFilePath` 存在
  - `buildArticleShareTitle` 已编入 `dist/common.js`

## 测试建议
1. 微信开发者工具热重载后，打开任意文章详情。
2. 点击底部「分享」按钮，应弹出原生分享面板（转发给朋友 / 分享到朋友圈）。
3. 选择「转发给朋友」，分享卡片应显示优化后的标题 + 生成的海报图。
4. 若海报生成失败，应显示文章封面图兜底；无封面则显示小程序默认截图。

## 限制说明
- 小程序原生分享卡片的格式是：标题 + 图片 + 小程序名，不支持像公众号文章那样直接显示副标题/来源描述。本次方案通过「标题精简 + 海报图内嵌标题/摘要/品牌」来接近公众号卡片效果。
- 海报封面图依赖下载域名白名单；若 Supabase 封面域名未配置，将自动降级为纯文字海报。
