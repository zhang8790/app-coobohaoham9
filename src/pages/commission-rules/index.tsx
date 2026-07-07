import { View, Text } from '@tarojs/components'
// @title 佣金规则
import Taro from '@tarojs/taro'

function CommissionRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <Text style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来电有喜佣金规则</Text>
        <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</Text>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、佣金来源</Text>
          <Text>1. 您通过专属推广码邀请的好友（一级下线）消费，您可获得 L1 佣金。</Text>
          <Text>2. 一级下线再邀请的好友（二级下线）消费，您可获得 L2 佣金。</Text>
          <Text>3. 分享平台文章/门店也可锁定下线，订单同样计入您的推广链条。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>二、佣金比例</Text>
          <Text>佣金比例由您的「段位」决定，段位越高比例越大：</Text>
          <Text>L1 佣金比例区间：15% ~ 28%（随段位提升）</Text>
          <Text>L2 佣金比例区间：6% ~ 16%（随段位提升）</Text>
          <Text>具体比例以推广中心当前段位展示为准。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、结算规则</Text>
          <Text>1. 订单完成后佣金进入「待结算」状态。</Text>
          <Text>2. 订单无退款纠纷且超过售后周期后，佣金转为「已结算」。</Text>
          <Text>3. 已结算佣金可发起提现，提现将扣除 10% 平台服务费。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、活跃门槛</Text>
          <Text>1. 推广人须保持活跃：当月自消费满 ¥39 方可获得全额 L1 佣金。</Text>
          <Text>2. 当月零消费（首次）：L1 佣金减半（宽限期）。</Text>
          <Text>3. 连续 2 个月零消费：取消分佣资格，恢复消费后重新激活。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>五、回扣与风控</Text>
          <Text>1. 若下线订单发生退款，对应佣金将同步回扣。</Text>
          <Text>2. 连续 3 个月未拓新，L1 佣金逐级衰减（最低不低于 40%）。</Text>
          <Text>3. 平台严禁刷单、套现等作弊行为，违规佣金将被冻结或清零。</Text>
        </View>

        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          完整段位与比例详见《段位规则》。本规则最终解释权归来电有喜平台所有。
        </Text>
      </View>
    </View>
  )
}

export default CommissionRules
