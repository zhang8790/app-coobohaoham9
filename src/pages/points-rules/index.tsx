import { View, Text } from '@tarojs/components'
// @title 资产规则


function AssetRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜 · 资产规则</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月13日\n生效日期：2026年7月13日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、平台资产（合理分配）</Text>
          <Text className="block">1. 金豆：通用抵扣币，1 金豆 = 1 元，充值获得、下单 1:1 抵扣。</Text>
          <Text className="block">2. 贡献值：消费即「情绪确权」发放，用于情绪喂养、兑换专属食养·情绪体验。</Text>
          <Text className="block">3. 贡献值：确权与消费累计的成长值，决定「年度成长回馈」份额（金豆），不进入段位门槛。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、获取与用途</Text>
          <Text className="block">1. 金豆：完成订单按段位比例获赠，部分订单支付时 1:1 抵扣现金。</Text>
          <Text className="block">2. 金豆：每笔订单支付成功后自动确权发放，在情绪资产内喂养 / 兑换专属体验。</Text>
          <Text className="block">3. 贡献值：随确权与消费累积，用于「年度成长回馈」份额计算，不直接决定段位。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、段位与徽章</Text>
          <Text className="block">1. 段位由个人累计消费决定基础门槛，高段位叠加徽章收集度软门槛；团队 / 邀请新用户仅作推广佣金系数，不进入段位。</Text>
          <Text className="block">2. 每次确权按情绪维度发放一枚徽章（普通→稀有→史诗→传说），可在「徽章图鉴」收藏。</Text>
          <Text className="block">3. 高段位（静心及以上）晋升参考徽章收集度，作为软门槛而非硬性卡点。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、合规说明</Text>
          <Text className="block">1. 金豆与贡献值均为平台内资产，不可提现、不可兑现金、不可二级转让。</Text>
          <Text className="block">2. 推广佣金已以金豆形式发放至金豆余额，可在平台内消费支付抵扣，不可提现或兑现金，与上述资产同源。</Text>
          <Text className="block">3. 段位权益为专属服务 / 优先体验 / 共创权等，不承诺现金回报或保本，不含分红 / 股权表述。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">五、退款与清理</Text>
          <Text className="block">1. 订单退款时，获赠金豆与已确权发放将按规则相应扣回。</Text>
          <Text className="block">2. 通过作弊手段获取的资产，平台有权收回并追究责任。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          资产明细可在「我的」-「金豆 / 贡献值」中查看。
        </Text>
      </View>
    </View>
  )
}

export default AssetRules
