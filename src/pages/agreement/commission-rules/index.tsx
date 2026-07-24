import { View, Text } from '@tarojs/components'
// @title 推广规则

import RiskWarning from '@/components/RiskWarning'

function CommissionRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <RiskWarning />

      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜推广规则</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月10日\n生效日期：2026年7月10日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、佣金来源（二级结构）</Text>
          <Text className="block">1. 您通过专属推广码邀请的我的好友在平台消费，您可获得我的好友佣金。</Text>
          <Text className="block">2. 您推荐的我的好友再邀请其好友消费，您可获得我的粉丝佣金。</Text>
          <Text className="block">3. 分享平台文章/门店给好友，好友注册后消费同样计入您的推广业绩。</Text>
          <Text className="block">4. 本平台仅设二级推广（我的好友+我的粉丝），只有二级、不发展第三级及多级分润。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、佣金比例（二级）</Text>
          <Text className="block">1. 我的好友佣金比例由您的「段位」决定，段位越高比例越大：约 40% ~ 50%（基于订单平台让利在扣除平台基础服务费后的剩余部分计算，并非订单全额）。</Text>
          <Text className="block">2. 我的粉丝佣金比例为 15% ~ 18%，随您的段位提升而提高。</Text>
          <Text className="block">3. 仅二级（我的好友+我的粉丝），不设置第三级及多层返利。</Text>
          <Text className="block">说明：段位由您「近 6 个月滚动消费」决定，停止消费则窗口外消费过期、段位自动下调，不会出现长期不消费仍拿高比例的情况。</Text>
          <Text className="block">具体比例以推广中心当前段位展示为准。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、结算与提现</Text>
          <Text className="block">1. 订单完成后佣金进入「待结算」状态。</Text>
          <Text className="block">2. 订单无退款纠纷且超过售后周期后，佣金转为「已结算」。</Text>
          <Text className="block">3. 已结算佣金以金豆形式发放至金豆余额，可在平台内消费支付抵扣，不可提现或兑现金。推广佣金属于依法应申报的劳务报酬所得，请依法履行个人所得税纳税申报义务。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、活跃门槛（已真实落地）</Text>
          <Text className="block">1. 推广人须保持推广活跃：近 30 天您推荐的好友产生有效成交订单，方可获得全额推广佣金。</Text>
          <Text className="block">2. 仅 30~60 天前有推荐成交（首次断档）：推广佣金减半（宽限期）。</Text>
          <Text className="block">3. 连续 60 天无推荐成交：暂停推广佣金资格，恢复推广活跃（产生新的推荐成交）后自动重新激活。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">五、回扣与风控（已真实落地）</Text>
          <Text className="block">1. 若推荐好友订单发生退款，对应佣金将同步回扣。</Text>
          <Text className="block">2. 连续 3 个月（90 天）未邀请新用户（无新下级注册），推广佣金系数衰减至基准的 40%，最低不低于基准比例 40%。</Text>
          <Text className="block">3. 平台严禁刷单、套现等作弊行为，相关佣金将被冻结或清零。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          完整段位与比例详见《段位规则》。本规则的解释与适用遵循法律法规，如有疑问请联系客服咨询。
        </Text>
      </View>
    </View>
  )
}

export default CommissionRules
