## Vibe
- Chinese ink-on-rice-paper × wuxia cinnabar: vermilion-orange as signature ink dot; warm off-white rice paper surface; deep ink-black typography; occasional gold accent for treasure/reward motifs

## Color
- Primary: #C2410C
- On Primary: #FFFFFF
- Accent: #92400E
- On Accent: #FFFFFF
- Background: #FFFBF7
- Foreground: #1C1917
- Muted: #F5EDE5
- Border: #E7DDD0
- Secondary: #78350F

## Typography
- Heading: 有爱黑体 CN (family: NowarHansCN, weight: SemiBold, url: https://resource-static.bj.bcebos.com/fonts-skill/NowarHansCN_SemiBold.ttf)
- Body: 有爱黑体 CN (family: NowarHansCN, weight: Light, url: https://resource-static.bj.bcebos.com/fonts-skill/NowarHansCN_Light.ttf)

## Visual Language
- 核心视觉签名：朱砂印章点——在卡片右上角或价格旁以圆形或六边形朱砂色小块（Primary, 8-12px）模拟印章落点，配合 ink-black 文字形成纸墨对比
- 材质与深度：背景用 #FFFBF7 宣纸底色；卡片用 #FFFFFF 略亮层；分割用 #E7DDD0 淡墨线（1px）；悬浮层加 `box-shadow: 0 4px 16px rgba(194,65,12,0.08)` 朱砂晕染阴影
- 容器与按钮：卡片圆角 12px 无描边（靠背景色差区分层次）；主操作按钮填充 Primary 朱砂色；次操作用 Muted 底+Foreground 字；底部操作栏用 Muted 背景与分割线
- 布局节奏：首页宽留白呼吸（px-4）；情绪卡片区轻松开阔；双列瀑布流紧凑对齐；资产行三等分横排

## Animation
- 交互：加购按钮点击微弹跳（scale 1→1.15→1, 200ms ease-out）
- 入场：Feed 卡片列表渐入（opacity 0→1，translateY 12px→0，stagger 60ms，300ms ease-out）
- 滚动/过渡：Tab 切换左右滑动（200ms ease-in-out）

## Forbidden
- 禁大块纯色铺底（Hero/Banner 区不使用 Primary 满铺背景）
- 禁圆角卡片+细描边充当核心签名（须用朱砂印章点作为唯一识别元素）
- 禁通用渐变背景覆盖内容区域

## Additional Notes
- 所有用户可见文案使用中文，武侠风昵称/段位名保留古风风格
- 情绪输入区域背景用淡朱砂色（#FFF0E8），与宣纸底色形成轻微区分
- Feed 卡片标签芯片（情绪词/状态词）用 Secondary（#78350F）细字+Muted 底，保持古朴感
