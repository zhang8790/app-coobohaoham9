// @title 商家货款结算卡（迁移 00120，纯展示）
import { View, Text, Button } from '@tarojs/components'
import Icon from '@/components/Icon'

interface Settlement {
  merchant_balance: number
  settlement_frozen: number
  total_settled: number
  settlement_count: number
  wx_sub_mch_id: string | null
}

interface Props {
  settlement: Settlement | null
  onWithdraw: () => void
}

export default function SettlementCard({ settlement, onWithdraw }: Props) {
  return (
    <View className="mx-4 mt-3 p-4 rounded-2xl border border-success/30"
      style={{ background: 'linear-gradient(135deg, rgba(46,125,91,0.10), rgba(46,125,91,0.04))' }}>
      <View className="flex items-center justify-between">
        <View className="flex items-center gap-2">
          <View className="w-9 h-9 rounded-xl bg-success/15 flex items-center justify-center">
            <View className="text-success text-xl"><Icon name="coin" size={20} /></View>
          </View>
          <Text className="text-lg font-bold text-foreground">可结算货款</Text>
        </View>
        <Text className="text-base text-muted-foreground">已结算 {settlement?.settlement_count ?? 0} 笔</Text>
      </View>
      <View className="flex items-end justify-between mt-3">
        <View>
          <Text className="text-base text-muted-foreground">当前可提现</Text>
          <Text className="text-4xl font-bold text-success">¥{((settlement?.merchant_balance ?? 0)).toFixed(2)}</Text>
        </View>
        <Button
          className="!m-0 !p-0 !bg-success !border-none !rounded-2xl !leading-none"
          onClick={onWithdraw}>
          <View className="px-5 py-2.5 flex items-center gap-1">
            <Text className="text-base font-bold text-white">货款提现</Text>
          </View>
        </Button>
      </View>
      <Text className="text-sm text-muted-foreground mt-2">
        货款以人民币结算（含健康豆支付等值部分，由总部统一结算），由微信直接打款到您的账户，可提现。
      </Text>
    </View>
  )
}
