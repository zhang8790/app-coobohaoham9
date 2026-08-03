import { View, Text } from '@tarojs/components'
// @title 推荐激励说明


function DistributionAgreement() {
  return (
    <View className="min-h-screen bg-background pb-10">

      {/* 风险警示强制公示 */}
      <View className="mx-4 mt-4 rounded-2xl border border-amber-500/40 p-4" style={{ background: 'rgba(245,158,11,0.08)' }}>
        <Text className="block text-amber-600 text-sm font-bold leading-relaxed">
          风险提示
        </Text>
        <Text className="block text-foreground text-xs mt-1 leading-relaxed">
          本品牌仅从事实物商品零售经营，推荐奖励依托真实商品交易产生，以健康豆形式发放、可在小程序内消费。
        </Text>
      </View>

      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜推荐激励说明</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月10日\n生效日期：2026年7月10日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、主体界定</Text>
          <Text className="block">1. 推荐人（以下简称「您」）为普通消费者，基于真实消费体验自愿分享商品，并非本品牌的代理商、加盟商或员工。</Text>
          <Text className="block">2. 您与本品牌之间不构成任何劳动、合伙、特许经营或代理关系。</Text>
          <Text className="block">3. 本品牌不收取任何加盟费、保证金、升级费；参与推荐零门槛，无需付费、囤货或认购商品即可获得推荐权限。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、奖励规则</Text>
          <Text className="block">1. 推荐奖励仅来源于商品正常销售利润，由真实交易流水驱动，以健康豆形式发放至健康豆余额，可在小程序内消费支付，不可提现。</Text>
          <Text className="block">2. 奖励仅针对您直接分享带来的有效消费订单结算，依据用户真实支付、完成履约的有效订单。</Text>
          <Text className="block">3. 奖励结算唯一依据为有效订单；单纯注册、未付款订单不计入奖励基数，无零订单返利。</Text>
          <Text className="block">4. 段位比例由个人累计消费决定，不设置任何入门费或付费门槛。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、禁止行为条款</Text>
          <Text className="block">1. 您不得对外宣传虚构收益或误导性表述。</Text>
          <Text className="block">2. 您不得发展多级返利关系，不得收取他人任何入门费或代理费。</Text>
          <Text className="block">3. 本品牌有权对违规推荐账号取消奖励资格、冻结或清零相关收益。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、其他说明</Text>
          <Text className="block">1. 本品牌推荐奖励基于真实消费，不存在多级分润机制。</Text>
          <Text className="block">2. 推荐收益根据订单销量浮动，无固定收益保障，个体收益存在差异。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          本协议与《用户服务协议》《推荐奖励规则》《段位规则》配套使用，解释与适用遵循法律法规，如有疑问请联系客服咨询。
        </Text>
      </View>
    </View>
  )
}

export default DistributionAgreement
