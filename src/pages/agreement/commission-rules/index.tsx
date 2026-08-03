import { View, Text } from '@tarojs/components'
// @title 推荐奖励规则

import RiskWarning from '@/components/RiskWarning'

function CommissionRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <RiskWarning />

      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜推荐奖励规则</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月29日\n生效日期：2026年7月29日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、奖励来源</Text>
          <Text className="block">1. 您分享本品牌商品或门店给好友，好友通过您的分享完成真实消费，您可获得健康豆推荐奖励。</Text>
          <Text className="block">2. 奖励依托真实商品交易产生，无虚假高额收益承诺，不设置任何入门费或付费门槛。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、奖励比例</Text>
          <Text className="block">1. 奖励比例由您的「段位」决定（段位依近 6 个月消费动态计算，停消费则下调）。</Text>
          <Text className="block">2. 具体比例以「推荐中心」当前段位展示为准，不承诺固定或高额收益。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、发放与用途</Text>
          <Text className="block">1. 推荐奖励以健康豆形式发放至健康豆余额，可在小程序内消费支付抵扣。</Text>
          <Text className="block">2. 健康豆为本小程序内部消费资产，不可提现、不可兑现金、不可二级转让。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、活跃与风控</Text>
          <Text className="block">1. 推荐订单发生退款，对应奖励同步回扣；严禁刷单、套现等作弊，违者冻结或清零。</Text>
          <Text className="block">2. 本品牌有权对违规推荐账号取消奖励资格、冻结或清零相关收益。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          完整段位与比例详见《段位规则》。本规则解释与适用遵循法律法规，如有疑问请联系客服咨询。
        </Text>
      </View>
    </View>
  )
}

export default CommissionRules
