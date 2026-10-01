// @title 门店二维码弹窗（双码同卡并排）
// 一张卡片内并排展示两种码，视觉「合在一起」，但各自独立可识别（避免微信扫一扫
// 一图两码时误识别为普通文本而跳不了小程序）：
// - 太阳码（storeQrUrl）：微信扫一扫 / 长按识别进店（已修复的本小程序码）
// - 普通二维码（scanContent）：小程序内「扫码购物」按钮扫描进店
//   原因：小程序内部 wx.scanCode API 无法识别太阳码（微信平台限制），
//   故额外提供一张普通二维码，内容为 `s=短码&r=推广码`，应用内扫码命中 s= 即进店。
import { View, Text, Button, Image } from '@tarojs/components'
import Icon from '@/components/Icon'
import StoreScanQr from '@/components/StoreScanQr'

interface Props {
  visible: boolean
  storeName: string
  storeQrUrl: string
  scanContent: string
  qrLoading: boolean
  onClose: () => void
  onSave: () => void
}

export default function StoreQrModal({ visible, storeName, storeQrUrl, scanContent, qrLoading, onClose, onSave }: Props) {
  return (
    visible && (
      <View
        className="fixed inset-0 z-[1001] flex items-end justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={onClose} catchMove>
        <View
          className="w-full rounded-t-3xl bg-card px-6 pt-6 pb-10"
          style={{ maxHeight: '90vh' }}
          onClick={(e) => e.stopPropagation()}>

          {/* 标题栏 */}
          <View className="flex items-center justify-between mb-3">
            <Text className="text-xl font-bold text-foreground">门店二维码 · 扫码进店</Text>
            <View
              onClick={onClose}
              style={{
                width: '32px', height: '32px', borderRadius: '16px',
                backgroundColor: '#FBF7EF', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
              <Text style={{ fontSize: '36rpx', color: 'var(--muted-foreground)' }}>✕</Text>
            </View>
          </View>

          <Text className="text-sm text-muted-foreground text-center mb-4">
            同一张卡两个码，按下方标注扫对应码即可进入「{storeName}」
          </Text>

          {/* 同卡并排：左太阳码（微信扫）/ 右普通二维码（应用内扫码购物扫） */}
          <View className="flex flex-row items-start justify-center" style={{ gap: '20px' }}>
            {/* 左：太阳码 */}
            <View className="flex flex-col items-center" style={{ width: '150px' }}>
              <View
                style={{
                  width: '150px', height: '150px', borderRadius: '14px',
                  border: '2px solid rgba(94,122,79,0.15)',
                  backgroundColor: '#FFF', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                {qrLoading ? (
                  <View className="flex flex-col items-center gap-2">
                    <Icon name="loading" size={36} className="text-primary animate-spin" />
                    <Text className="text-xs text-muted-foreground">生成中</Text>
                  </View>
                ) : storeQrUrl ? (
                  <Image src={storeQrUrl} mode="aspectFit" style={{ width: '142px', height: '142px' }} />
                ) : (
                  <View className="flex flex-col items-center gap-1">
                    <Icon name="qrcode-scan" size={36} className="text-muted-foreground/30" />
                    <Text className="text-xs text-muted-foreground/50">加载失败</Text>
                  </View>
                )}
              </View>
              <View
                style={{
                  marginTop: '10px', backgroundColor: 'rgba(94,122,79,0.12)',
                  borderRadius: '8px', paddingVertical: '4px', paddingHorizontal: '8px',
                }}>
                <Text className="text-xs font-bold" style={{ color: 'hsl(var(--primary))' }}>微信扫一扫</Text>
              </View>
              <Text className="text-xs text-muted-foreground text-center mt-1 leading-tight">长按/扫一扫 进店</Text>
            </View>

            {/* 右：普通二维码 */}
            <View className="flex flex-col items-center" style={{ width: '150px' }}>
              <View
                style={{
                  width: '150px', height: '150px', borderRadius: '14px',
                  border: '2px solid rgba(94,122,79,0.15)',
                  backgroundColor: '#FFF', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                {scanContent ? (
                  <StoreScanQr content={scanContent} size={142} />
                ) : (
                  <View className="flex flex-col items-center gap-1">
                    <Icon name="qrcode-scan" size={36} className="text-muted-foreground/30" />
                    <Text className="text-xs text-muted-foreground/50">准备中</Text>
                  </View>
                )}
              </View>
              <View
                style={{
                  marginTop: '10px', backgroundColor: 'rgba(94,122,79,0.12)',
                  borderRadius: '8px', paddingVertical: '4px', paddingHorizontal: '8px',
                }}>
                <Text className="text-xs font-bold" style={{ color: 'hsl(var(--primary))' }}>小程序内扫码</Text>
              </View>
              <Text className="text-xs text-muted-foreground text-center mt-1 leading-tight">点「扫码购物」扫</Text>
            </View>
          </View>

          <Text className="text-xs text-muted-foreground text-center mt-4 leading-relaxed" style={{ maxWidth: '300px', marginLeft: 'auto', marginRight: 'auto' }}>
            左边太阳码用微信扫、长按识别进店（张贴用）；右边普通二维码用小程序底部「扫码购物」按钮扫进店（新用户注册即建立本店推荐关系）。
          </Text>

          {/* 操作按钮 */}
          <View className="flex gap-3 mt-5">
            {storeQrUrl && (
              <Button
                className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-border !rounded-2xl"
                onClick={onSave}>
                <View className="py-3 flex items-center justify-center gap-2">
                  <Icon name="download" size={20} className="text-muted-foreground" />
                  <Text className="text-lg font-bold text-muted-foreground">保存太阳码</Text>
                </View>
              </Button>
            )}
            <Button
              openType="share"
              className="!flex-1 !m-0 !p-0 !rounded-2xl"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)))', border: 'none' }}>
              <View className="py-3 flex items-center justify-center gap-2">
                <Icon name="share-variant" size={20} className="text-white" />
                <Text className="text-lg font-bold text-white">分享门店</Text>
              </View>
            </Button>
          </View>
        </View>
      </View>
    )
  )
}
