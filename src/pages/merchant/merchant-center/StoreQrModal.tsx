// @title 门店二维码弹窗（双码展示）
// - 太阳码（storeQrUrl）：微信扫一扫 / 长按识别进店（已修复的本小程序码）
// - 普通二维码（scanContent）：小程序内「扫码购物」按钮扫描进店
//   原因：小程序内部 wx.scanCode API 无法识别太阳码（微信平台限制），
//   故额外提供一张普通二维码，内容为 `s=短码&r=推广码`，应用内扫码命中 s= 即进店。
import { View, Text, Button, Image, ScrollView } from '@tarojs/components'
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
            <Text className="text-xl font-bold text-foreground">门店二维码</Text>
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

          <ScrollView scrollY style={{ maxHeight: '62vh' }}>
            {/* 区块1：太阳码（微信扫） */}
            <View className="flex flex-col items-center py-2">
              <Text className="text-lg font-bold text-foreground">{storeName}</Text>
              <Text className="text-sm text-muted-foreground mt-1">微信扫一扫 / 长按识别 进入门店</Text>

              <View
                style={{
                  width: '220px', height: '220px', borderRadius: '16px',
                  border: '2px solid rgba(94,122,79,0.15)',
                  backgroundColor: '#FFF', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: '16px', overflow: 'hidden',
                }}>
                {qrLoading ? (
                  <View className="flex flex-col items-center gap-3">
                    <Icon name="loading" size={48} className="text-primary animate-spin" />
                    <Text className="text-base text-muted-foreground">生成中...</Text>
                  </View>
                ) : storeQrUrl ? (
                  <Image src={storeQrUrl} mode="aspectFit" style={{ width: '208px', height: '208px' }} />
                ) : (
                  <View className="flex flex-col items-center gap-2">
                    <Icon name="qrcode-scan" size={48} className="text-muted-foreground/30" />
                    <Text className="text-base text-muted-foreground/50">加载失败</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: '18px' }} />

            {/* 区块2：普通二维码（应用内扫码购物扫） */}
            <View className="flex flex-col items-center py-2">
              <View
                style={{
                  alignSelf: 'flex-start', backgroundColor: 'rgba(94,122,79,0.12)',
                  borderRadius: '8px', paddingVertical: '4px', paddingHorizontal: '10px',
                }}>
                <Text className="text-sm font-bold" style={{ color: 'hsl(var(--primary))' }}>
                  小程序内「扫码购物」请扫此码
                </Text>
              </View>
              <Text className="text-sm text-muted-foreground mt-2 text-center" style={{ maxWidth: '280px' }}>
                点底部「扫码购物」按钮，扫描下方二维码即可进店
              </Text>

              <View
                style={{
                  width: '224px', height: '224px', borderRadius: '12px',
                  border: '2px solid rgba(94,122,79,0.15)',
                  backgroundColor: '#FFF', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: '14px', overflow: 'hidden',
                }}>
                {scanContent ? (
                  <StoreScanQr content={scanContent} size={216} />
                ) : (
                  <View className="flex flex-col items-center gap-2">
                    <Icon name="qrcode-scan" size={48} className="text-muted-foreground/30" />
                    <Text className="text-base text-muted-foreground/50">准备中</Text>
                  </View>
                )}
              </View>

              <Text className="text-xs text-muted-foreground text-center mt-3 leading-relaxed" style={{ maxWidth: '280px' }}>
                应用内扫码自动进入「{storeName}」，新用户注册即建立本店推荐关系
              </Text>
            </View>
          </ScrollView>

          {/* 操作按钮 */}
          <View className="flex gap-3 mt-4">
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
