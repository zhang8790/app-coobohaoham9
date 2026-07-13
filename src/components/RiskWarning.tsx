/**
 * 强制风险警示横幅（框架第六步（二）3：页面顶部显著展示）
 * 用于推广 / 佣金 / 提现相关页面，提示平台无投资理财功能、警示违法传销话术。
 */
import { View, Text } from '@tarojs/components'

export default function RiskWarning() {
  return (
    <View className="mx-4 mt-4 rounded-2xl border border-amber-500/40 p-4" style={{ background: 'rgba(245,158,11,0.08)' }}>
      <Text style={{ color: '#FBBF24', fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
        风险提示
      </Text>
      <Text style={{ color: '#E5E7EB', fontSize: 12, lineHeight: 1.8, marginTop: 4 }}>
        本平台仅从事实物商品零售经营，所有推广佣金、积分权益均依托真实商品交易产生；不存在投资、理财、资产增值功能。请勿轻信「保本高收益、积分变现、多层级躺赚」等不实宣传；任何以拉人头、多层分红、现金返利为核心的模式均属于违法传销、资金盘，请勿参与。
      </Text>
    </View>
  )
}
