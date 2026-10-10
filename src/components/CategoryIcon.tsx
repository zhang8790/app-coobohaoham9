import { View, Text, Image } from '@tarojs/components'
import type { StoreCategory } from '@/db/types'
import { SCENE_ICON, BRAND_LINE_ICONS } from '@/components/brandIcons'
import { sceneLabel } from '@/utils/scene-alias'

/**
 * 分类图标统一渲染组件（C 端 / 商家端共用）。
 *
 * 展示优先级：
 *   1. icon_url（用户上传的网络图片）—— 最优先，让运营/商家自定义图标真正生效
 *   2. icon（emoji 文本）—— 后台未传图片时的轻量回退
 *   3. 品牌线性 SVG —— SCENE_ICON 命中场景展示名，否则回退通用 leaf 图标
 *
 * ⚠️ 微信小程序 <Image> 不支持 data: URI（upload.ts 已注明），故 icon_url 仅当
 *    以 http(s) 开头时才走图片渲染，否则跳过本层回退到 emoji / 品牌图。
 */
export default function CategoryIcon({ cat, size = 56 }: { cat: StoreCategory; size?: number }) {
  const img = cat.icon_url
  if (img && /^https?:\/\//.test(img)) {
    return <Image src={img} style={{ width: size, height: size }} />
  }
  if (cat.icon) {
    return (
      <View style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: Math.round(size * 0.56), lineHeight: Math.round(size * 0.56) }}>{cat.icon}</Text>
      </View>
    )
  }
  const label = sceneLabel(cat.name)
  const svg = SCENE_ICON[label] || BRAND_LINE_ICONS['leaf']
  return <Image src={svg} style={{ width: size, height: size }} />
}
