// @title 门店二维码弹窗（纯展示，写库逻辑在页面）
import { View, Text, Button, Image } from '@tarojs/components'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  storeName: string
  storeQrUrl: string
  qrLoading: boolean
  onClose: () => void
  onSave: () => void
}

export default function StoreQrModal({ visible, storeName, storeQrUrl, qrLoading, onClose, onSave }: Props) {
  return (
    visible && (
      <View
        className="fixed inset-0 z-[1001] flex items-end justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={onClose} catchMove>
        <View
          className="w-full rounded-t-3xl bg-card px-6 pt-6 pb-10"
          style={{ maxHeight: '80vh' }}
          onClick={(e) => e.stopPropagation()}>

          {/* 标题栏 */}
          <View className="flex items-center justify-between mb-5">
            <Text className="text-xl font-bold text-foreground">门店二维码</Text>
            <View
              onClick={onClose}
              style={{
                width: '32px', height: '32px', borderRadius: '16px',
                backgroundColor: '#F5F5F5', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
              <Text style={{ fontSize: '36rpx', color: 'var(--muted-foreground)' }}>✕</Text>
            </View>
          </View>

          {/* 二维码主体 */}
          <View className="flex flex-col items-center py-3">
            {/* 门店名称 */}
            <Text className="text-lg font-bold text-foreground">{storeName}</Text>
            <Text className="text-sm text-muted-foreground mt-1">用户扫码即可进店购物</Text>

            {/* 二维码图片 */}
            <View
              style={{
                width: '240px', height: '240px', borderRadius: '16px',
                border: '2px solid rgba(232,121,100,0.15)',
                backgroundColor: '#FFF', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                marginTop: '20px', overflow: 'hidden',
              }}>
              {qrLoading ? (
                <View className="flex flex-col items-center gap-3">
                  <Icon name="loading" size={48} className="text-primary animate-spin" />
                  <Text className="text-base text-muted-foreground">生成中...</Text>
                </View>
              ) : storeQrUrl ? (
                <Image src={storeQrUrl} mode="aspectFit" style={{ width: '224px', height: '224px' }} />
              ) : (
                <View className="flex flex-col items-center gap-2">
                  <Icon name="qrcode-scan" size={48} className="text-muted-foreground/30" />
                  <Text className="text-base text-muted-foreground/50">加载失败</Text>
                </View>
              )}
            </View>

            {/* 提示文字 */}
            <Text className="text-sm text-muted-foreground text-center mt-5 leading-relaxed"
              style={{ maxWidth: '280px' }}>
              扫码自动进入「{storeName}」，新用户注册即建立本店推荐关系
            </Text>
          </View>

          {/* 操作按钮 */}
          <View className="flex gap-3 mt-4">
            {storeQrUrl && (
              <Button
                className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-border !rounded-2xl"
                onClick={onSave}>
                <View className="py-3 flex items-center justify-center gap-2">
                  <Icon name="download" size={20} className="text-muted-foreground" />
                  <Text className="text-lg font-bold text-muted-foreground">保存图片</Text>
                </View>
              </Button>
            )}
            <Button
              openType="share"
              className="!flex-1 !m-0 !p-0 !rounded-2xl"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)))', border: 'none' }}>
              <View className="py-3 flex items-center justify-center gap-2">
                <Icon name="share-variant" size={20} className="text-white" />
                <Text className="text-lg font-bold text-white">分享二维码</Text>
              </View>
            </Button>
          </View>
        </View>
      </View>
    )
  )
}
