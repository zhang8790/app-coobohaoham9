// 店铺形象（顶部图片）—— 纯展示外壳：选图 / 移除 / 加载失败由父页注入回调
import Taro from '@tarojs/taro'
import { View, Text, Image, Button } from '@tarojs/components'
import Icon from '@/components/Icon'

export default function StoreBanner({
  previewPath,
  onChoose,
  onRemove,
  onError,
}: {
  previewPath: string
  onChoose: () => void
  onRemove: () => void
  onError?: () => void
}) {
  return (
    <View className="px-4 mt-3">
      <Text className="text-base font-bold text-foreground mb-2 block">店铺形象</Text>
      <View
        className="w-full rounded-2xl overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: '#F5F5F5', height: '176px' }}
        onClick={onChoose}
      >
        {previewPath ? (
          <Image
            src={previewPath}
            mode="aspectFill"
            style={{ width: '100%', height: '176px', display: 'block' }}
            onLoad={() => {}}
            onError={(e: any) => {
              console.error('[banner] 预览图加载失败:', previewPath.slice(0, 80), e)
              // 加载失败时清除预览，显示占位符（避免空白区域）
              onError?.()
              Taro.showToast({ title: '图片加载失败', icon: 'none' })
            }} />
        ) : (
          <View className="flex flex-col items-center gap-2">
            <Icon name="image-plus" size={48} className="text-muted-foreground/40" />
            <Text className="text-sm text-muted-foreground">点击上传店铺顶部图片</Text>
          </View>
        )}
      </View>
      {previewPath && (
        <Button size="mini" className="!mt-2 !bg-transparent !text-red-500 !border-none !p-0" onClick={onRemove}>
          移除图片
        </Button>
      )}
    </View>
  )
}
