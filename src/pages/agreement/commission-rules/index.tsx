import { View, Text } from '@tarojs/components'
// @title 推广规则

import RiskWarning from '@/components/RiskWarning'

function CommissionRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <RiskWarning />

      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜推广规则</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月29日\n生效日期：2026年7月29日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、佣金来源（二级推广）</Text>
          <Text className="block">1. 邀请好友消费，您可获得「我的好友」佣金；好友再邀请其好友消费，您可获得「我的粉丝」佣金。</Text>
          <Text className="block">2. 本平台仅设二级推广（我的好友 + 我的粉丝），仅两级，不发展第三级及多级分润。</Text>
          <Text className="block">3. 佣金依托真实商品交易产生，按「一半可提现佣金 + 一半金豆」发放：50% 发放至可提现佣金余额（属推广服务费，依法代扣个税后可提现）；50% 发放至金豆余额（仅本平台消费抵扣，不可提现或兑现金）。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、佣金比例</Text>
          <Text className="block">1. 佣金比例由您的「段位」决定（段位依近 6 个月消费动态计算，停消费则下调）。</Text>
          <Text className="block">2. 具体比例以「推广中心」当前段位展示为准，无固定的高额收益承诺。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、结算与发放</Text>
          <Text className="block">1. 订单完成且无售后纠纷后，佣金转为已结算，按「50% 可提现佣金余额 + 50% 金豆余额」发放到账。</Text>
          <Text className="block">2. 推广佣金属依法应申报的劳务报酬，请依法履行个人所得税纳税申报义务。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、活跃与风控</Text>
          <Text className="block">1. 需保持推广活跃：近 30 天有推荐成交方可获全额；长期无推荐成交将暂停资格，恢复活跃后自动重新激活。</Text>
          <Text className="block">2. 推荐订单发生退款，对应佣金同步回扣；严禁刷单、套现等作弊，违者冻结或清零。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          完整段位与比例详见《段位规则》。本规则解释与适用遵循法律法规，如有疑问请联系客服咨询。
        </Text>
      </View>
    </View>
  )
}

export default CommissionRules
