// 商家中心：快捷操作（新增商品为主 CTA + 扫码/批量分析为次级）
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import Icon from '@/components/Icon'

interface Props {
  onAdd: () => void
  onScan: () => void
  onBatchAnalyze: () => void
}

export default function QuickActions({ onAdd, onScan, onBatchAnalyze }: Props) {
  return (
    <View className="px-4 mt-4">
      {/* 主 CTA：新增商品（最优先入口，全宽渐变） */}
      <Button
        className="!m-0 !p-0 !bg-transparent !border-none !rounded-2xl !leading-none"
        onClick={onAdd}>
        <View
          className="flex flex-row items-center justify-center"
          style={{
            paddingVertical: '16px',
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-strong)))',
            boxShadow: '0 6px 16px hsl(var(--primary) / 0.28)',
          }}>
          <View style={{ marginRight: '8px' }}><Icon name="plus" size={22} className="text-white" /></View>
          <Text style={{ fontSize: '32rpx', fontWeight: 'bold', color: '#FFFFFF' }}>新增商品</Text>
        </View>
      </Button>

      {/* 次级操作：扫码上架 / 批量分析配料安全 */}
      <View className="flex flex-row" style={{ marginTop: '10px' }}>
        <View className="flex-1" style={{ marginRight: '5px' }}>
          <Button
            className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-primary !rounded-2xl !leading-none"
            onClick={onScan}>
            <View className="flex flex-row items-center justify-center" style={{ gap: '6px', paddingVertical: '13px' }}>
              <Icon name="barcode-scan" size={20} className="text-primary" />
              <Text style={{ fontSize: '28rpx', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>扫码上架</Text>
            </View>
          </Button>
        </View>
        <View className="flex-1" style={{ marginLeft: '5px' }}>
          <Button
            className="!flex-1 !m-0 !p-0 !bg-card !border-2 !border-dashed !border-primary !rounded-2xl !leading-none"
            onClick={onBatchAnalyze}>
            <View className="flex flex-row items-center justify-center" style={{ gap: '6px', paddingVertical: '13px' }}>
              <Icon name="shield-check" size={20} className="text-primary" />
              <Text style={{ fontSize: '28rpx', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>批量分析</Text>
            </View>
          </Button>
        </View>
      </View>
    </View>
  )
}
