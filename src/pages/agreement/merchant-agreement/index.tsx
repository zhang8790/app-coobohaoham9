import { View, Text } from '@tarojs/components'
// @title 自营门店协议


function MerchantAgreement() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜自营门店运营规范</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月1日\n生效日期：2026年7月1日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、门店运营资格</Text>
          <Text className="block">1. 门店运营者须为依法设立并有效存续的经营主体，具备相应经营资质。</Text>
          <Text className="block">2. 提交信息须真实、准确、完整，品牌方有权进行资质审核与实地核验。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、品牌服务与费用</Text>
          <Text className="block">1. 本品牌为门店提供统一的展示、订单管理、营销工具与分账结算等运营支持。</Text>
          <Text className="block">2. 品牌方按订单实付金额收取技术服务费，具体费用比例以后台配置为准。</Text>
          <Text className="block">3. 消费者推荐奖励从订单品牌让利中支出，不额外向门店收取。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、门店运营者权利与义务</Text>
          <Text className="block">1. 门店运营者须保证所售商品/服务合法、质量合格、描述真实。</Text>
          <Text className="block">2. 门店运营者须及时接单、发货/核销，并按约定处理售后与退款。</Text>
          <Text className="block">3. 门店运营者可配置本店优惠券、营销活动及门店信息，须遵守品牌运营规范。</Text>
          <Text className="block">4. 门店运营者应对消费者信息保密，不得滥用或泄露。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、结算与提现</Text>
          <Text className="block">1. 门店货款按订单完成状态结算，可在门店管理后台发起提现。</Text>
          <Text className="block">2. 提现将扣除 10% 品牌技术服务费，审核通过后打款至绑定账户。</Text>
          <Text className="block">3. 因投诉或风控拦截产生的冻结/扣款，品牌方将另行通知。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">五、违规处理</Text>
          <Text className="block">1. 门店运营者出现售假、虚假宣传、刷单、服务严重不达标等情形，品牌方有权下架商品、暂停门店乃至终止合作。</Text>
          <Text className="block">2. 造成消费者或品牌方损失的，门店运营者须承担相应赔偿责任。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">六、规范变更</Text>
          <Text className="block">品牌方可根据运营需要调整本规范，调整后将提前公示。门店运营者继续使用服务即视为接受变更。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          本规范为《用户服务协议》在门店运营场景下的补充，如有冲突以本规范为准。
        </Text>
      </View>
    </View>
  )
}

export default MerchantAgreement
