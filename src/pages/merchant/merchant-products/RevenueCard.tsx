// 商品收益卡片（纯展示，对齐网页版商家后台）
import { View, Text } from '@tarojs/components'
import type { Revenue } from './types'

const S = {
  flex_1_alignitems_center: { flex: 1, alignItems: 'center' },
  fontsize_24rpx_color_hsl_var_primary_margintop_2px: { fontSize: '24rpx', color: 'hsl(var(--primary))', marginTop: '2px' },
} as const

export default function RevenueCard({ revenue }: { revenue: Revenue }) {
  return (
    <View style={{ margin: '10px 14px 0', padding: '14px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFF3EC, #FFE7D6)', border: '1px solid #F8D9C0' }}>
      <Text style={{ fontSize: '28rpx', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>商品收益</Text>
      <View style={{ display: 'flex', marginTop: '10px' }}>
        <View style={S.flex_1_alignitems_center}>
          <Text style={{ fontSize: '40rpx', fontWeight: 'bold', color: 'hsl(var(--primary))' }}>¥{revenue.totalRevenue.toFixed(2)}</Text>
          <Text style={S.fontsize_24rpx_color_hsl_var_primary_margintop_2px}>总营收</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', borderLeftWidth: '1px', borderLeftColor: '#F0D3BC', borderLeftStyle: 'solid', borderRightWidth: '1px', borderRightColor: '#F0D3BC', borderRightStyle: 'solid' }}>
          <Text style={{ fontSize: '40rpx', fontWeight: 'bold', color: '#15803D' }}>¥{revenue.totalProfit.toFixed(2)}</Text>
          <Text style={S.fontsize_24rpx_color_hsl_var_primary_margintop_2px}>总利润</Text>
        </View>
        <View style={S.flex_1_alignitems_center}>
          <Text style={{ fontSize: '40rpx', fontWeight: 'bold', color: '#333' }}>{revenue.totalSales}</Text>
          <Text style={S.fontsize_24rpx_color_hsl_var_primary_margintop_2px}>总销量</Text>
        </View>
      </View>
    </View>
  )
}
