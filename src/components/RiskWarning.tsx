/**
 * 推广 / 佣金 / 提现相关页面的提示横幅。
 */
import { View, Text } from '@tarojs/components'

export default function RiskWarning() {
  return (
    <View className="mx-4 mt-4 rounded-2xl border border-amber-500/40 p-4" style={{ background: 'rgba(245,158,11,0.08)' }}>
      <Text style={{ color: '#FBBF24', fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
        风险提示
      </Text>
      <Text style={{ color: '#E5E7EB', fontSize: 12, lineHeight: 1.8, marginTop: 4 }}>
        本平台仅从事实物商品零售经营，推广佣金依托真实商品交易产生，以金豆形式发放、可在平台内消费。
      </Text>
    </View>
  )
}
