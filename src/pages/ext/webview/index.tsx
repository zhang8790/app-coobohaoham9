// @title 广告外链（内嵌网页）
import { useMemo } from 'react'
import { useRouter } from '@tarojs/taro'
import { View, Text, WebView } from '@tarojs/components'

/**
 * 通用外链承载页：仅用于「首页广告位」后台配置的 http(s) 落地页。
 *
 * ⚠️ 微信小程序限制：外链域名必须在小程序后台「开发设置 → 业务域名」中校验通过，
 * 否则 web-view 会显示空白/校验失败页。站内广告请优先配置 /pages/... 内页路径。
 */
export default function AdWebViewPage() {
  const router = useRouter()
  const url = useMemo(() => {
    const raw = decodeURIComponent(String(router.params.url || ''))
    // 白名单协议：只放行 http/https，杜绝 file:// 等本地协议被前台配置注入
    return /^https?:\/\//i.test(raw) ? raw : ''
  }, [router.params.url])

  if (!url) {
    return (
      <View className="min-h-screen bg-background flex flex-col items-center justify-center px-8">
        <Text className="text-base text-foreground">广告链接无效</Text>
        <Text className="text-sm text-muted-foreground text-center mt-2">
          请检查总后台「首页广告位」里填写的链接，需以 http:// 或 https:// 开头
        </Text>
      </View>
    )
  }

  return <WebView src={url} />
}
