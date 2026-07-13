import { View, Text } from '@tarojs/components'
// @title 资产规则
import Taro from '@tarojs/taro'

function AssetRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜 · 资产规则</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月13日\n生效日期：2026年7月13日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、三件套资产（合理分配）</Text>
          <Text className="block">1. 金豆：通用抵扣币，1 金豆 = 1 元，下单消费获赠、订单 1:1 抵扣。</Text>
          <Text className="block">2. 情绪豆：消费即「情绪确权」发放，用于情绪喂养、兑换专属食养·情绪体验。</Text>
          <Text className="block">3. 贡献值：确权与消费累计的成长值，决定「年度成长回馈」份额（情绪豆），不进入段位门槛。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、获取与用途</Text>
          <Text className="block">1. 金豆：完成订单按段位比例获赠，部分订单支付时 1:1 抵扣现金。</Text>
          <Text className="block">2. 情绪豆：每笔订单支付成功后自动确权发放，在情绪资产内喂养 / 兑换专属体验。</Text>
          <Text className="block">3. 贡献值：随确权与消费累积，用于「年度成长回馈」份额计算，不直接决定段位。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、段位与徽章</Text>
          <Text className="block">1. 段位由个人累计消费决定基础门槛，高段位叠加徽章收集度软门槛；团队 / 拓新仅作推广佣金系数，不进入段位。</Text>
          <Text className="block">2. 每次确权按情绪维度发放一枚徽章（普通→稀有→史诗→传说），可在「徽章图鉴」收藏。</Text>
          <Text className="block">3. 高段位（核心弟子及以上）晋升参考徽章收集度，作为软门槛而非硬性卡点。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、合规说明</Text>
          <Text className="block">1. 金豆、情绪豆均为平台内资产，不可提现、不可兑现金、不可二级转让。</Text>
          <Text className="block">2. 推广佣金（commission_balance）为真实推广服务费，可提现并代扣个税，与上述资产严格隔离。</Text>
          <Text className="block">3. 段位权益为专属服务 / 优先体验 / 共创权等，不承诺现金回报或保本，不含分红 / 股权表述。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">五、退款与清理</Text>
          <Text className="block">1. 订单退款时，获赠金豆与已确权发放将按规则相应扣回。</Text>
          <Text className="block">2. 通过作弊手段获取的资产，平台有权收回并追究责任。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          资产明细可在「我的」-「金豆 / 情绪豆 / 贡献值」中查看。
        </Text>
      </View>
    </View>
  )
}

export default AssetRules
