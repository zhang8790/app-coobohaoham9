// @title 门店品牌头（渐变，专业仪表盘头部）
import { View, Text, Button } from '@tarojs/components'
import Icon from '@/components/Icon'
import type { Store } from '@/db/types'

const S = {
  flexdirection_row_alignitems_center_gap_8px: { flexDirection: 'row', alignItems: 'center', gap: '8px' },
  width_40px_height_40px_borderradius_20px_background_rgba_255_255_255_0_22_alignitems_center_justifycontent_center: { width: '40px', height: '40px', borderRadius: '20px', background: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
} as const

interface Props {
  store: Store
  storeCount: number
  onViewStore: () => void
  onShowQr: () => void
  onSwitch: () => void
}

export default function StoreInfoCard({ store, storeCount, onViewStore, onShowQr, onSwitch }: Props) {
  return (
    <View
      style={{
        background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-strong)))',
        paddingTop: 'calc(env(safe-area-inset-top) + 20px)',
        paddingBottom: '28px',
        paddingLeft: '16px',
        paddingRight: '16px',
        borderBottomLeftRadius: '24px',
        borderBottomRightRadius: '24px',
      }}>
      {/* 顶部：门店名 + 状态 + 操作图标 */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: '12px' }}>
          <View style={S.flexdirection_row_alignitems_center_gap_8px}>
            <Text style={{ fontSize: '40rpx', fontWeight: 'bold', color: '#FFFFFF' }}>{store.name}</Text>
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: '4px',
                paddingHorizontal: '10px', paddingVertical: '3px',
                borderRadius: '9999px',
                background: 'rgba(255,255,255,0.22)',
              }}>
              <View style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#B9F6CA' }} />
              <Text style={{ fontSize: '22rpx', color: '#FFFFFF' }}>营业中</Text>
            </View>
          </View>
          <Text style={{ fontSize: '24rpx', color: 'rgba(255,255,255,0.85)', marginTop: '6px' }}>
            {store.address || '暂未填写门店地址'}
          </Text>
        </View>

        <View style={S.flexdirection_row_alignitems_center_gap_8px}>
          {storeCount > 1 && (
            <View
              onClick={onSwitch}
              style={S.width_40px_height_40px_borderradius_20px_background_rgba_255_255_255_0_22_alignitems_center_justifycontent_center}>
              <Icon name="shuffle" size={20} className="text-white" />
            </View>
          )}
          <View
            onClick={onShowQr}
            style={S.width_40px_height_40px_borderradius_20px_background_rgba_255_255_255_0_22_alignitems_center_justifycontent_center}>
            <Icon name="qrcode" size={20} className="text-white" />
          </View>
        </View>
      </View>

      {/* 底部：查看门店（幽灵按钮） */}
      <Button
        className="!m-0 !p-0 !bg-transparent !border !border-white/40 !rounded-2xl !leading-none"
        style={{ marginTop: '16px' }}
        onClick={onViewStore}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '6px', paddingVertical: '10px' }}>
          <Icon name="store" size={18} className="text-white" />
          <Text style={{ fontSize: '26rpx', color: '#FFFFFF', fontWeight: '600' }}>查看门店主页</Text>
        </View>
      </Button>
    </View>
  )
}
