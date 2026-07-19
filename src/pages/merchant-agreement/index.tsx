import { View, Text } from '@tarojs/components'
// @title 商家入驻协议


function MerchantAgreement() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜商家入驻协议</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月1日\n生效日期：2026年7月1日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、入驻资格</Text>
          <Text className="block">1. 申请商家须为依法设立并有效存续的经营主体，具备相应经营资质。</Text>
          <Text className="block">2. 提交信息须真实、准确、完整，平台有权进行资质审核与实地核验。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、平台服务与抽成</Text>
          <Text className="block">1. 平台为商家提供门店展示、订单管理、营销工具、分账结算等服务。</Text>
          <Text className="block">2. 平台按订单实付金额收取技术服务费，具体抽成比例以双方约定及后台配置为准。</Text>
          <Text className="block">3. 推广佣金（我的好友+我的粉丝）从订单平台让利中支出，不额外向商家收取。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、商家权利与义务</Text>
          <Text className="block">1. 商家须保证所售商品/服务合法合规、质量合格、描述真实。</Text>
          <Text className="block">2. 商家须及时接单、发货/核销，并按约定处理售后与退款。</Text>
          <Text className="block">3. 商家可自行配置优惠券、营销活动及门店信息，须遵守平台规则。</Text>
          <Text className="block">4. 商家应对消费者信息保密，不得滥用或泄露。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、结算与提现</Text>
          <Text className="block">1. 商家佣金按订单完成状态结算，可在商家后台发起提现。</Text>
          <Text className="block">2. 提现将扣除 10% 平台服务费，审核通过后打款至绑定账户。</Text>
          <Text className="block">3. 因违规、投诉或风控拦截产生的冻结/扣款，平台将另行通知。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">五、违规处理</Text>
          <Text className="block">1. 商家出现售假、虚假宣传、刷单、服务严重不达标等情形，平台有权下架商品、暂停店铺乃至终止合作。</Text>
          <Text className="block">2. 造成消费者或平台损失的，商家须承担相应赔偿责任。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">六、协议变更</Text>
          <Text className="block">平台可根据运营需要调整本协议，调整后将提前公示。商家继续使用服务即视为接受变更。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          本协议为《用户服务协议》在商家场景下的补充，如有冲突以本协议为准。
        </Text>
      </View>
    </View>
  )
}

export default MerchantAgreement
