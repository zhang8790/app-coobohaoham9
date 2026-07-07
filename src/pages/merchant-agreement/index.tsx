import { View, Text } from '@tarojs/components'
// @title 商家入驻协议
import Taro from '@tarojs/taro'

function MerchantAgreement() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <Text style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来电有喜商家入驻协议</Text>
        <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</Text>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、入驻资格</Text>
          <Text>1. 申请商家须为依法设立并有效存续的经营主体，具备相应经营资质。</Text>
          <Text>2. 提交信息须真实、准确、完整，平台有权进行资质审核与实地核验。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>二、平台服务与抽成</Text>
          <Text>1. 平台为商家提供门店展示、订单管理、营销工具、分账结算等服务。</Text>
          <Text>2. 平台按订单实付金额收取技术服务费，具体抽成比例以双方约定及后台配置为准。</Text>
          <Text>3. 推广分佣（L1/L2）从订单让利池中支出，不额外向商家收取。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、商家权利与义务</Text>
          <Text>1. 商家须保证所售商品/服务合法合规、质量合格、描述真实。</Text>
          <Text>2. 商家须及时接单、发货/核销，并按约定处理售后与退款。</Text>
          <Text>3. 商家可自行配置优惠券、营销活动及门店信息，须遵守平台规则。</Text>
          <Text>4. 商家应对消费者信息保密，不得滥用或泄露。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、结算与提现</Text>
          <Text>1. 商家佣金按订单完成状态结算，可在商家后台发起提现。</Text>
          <Text>2. 提现将扣除 10% 平台服务费，审核通过后打款至绑定账户。</Text>
          <Text>3. 因违规、投诉或风控拦截产生的冻结/扣款，平台将另行通知。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>五、违规处理</Text>
          <Text>1. 商家出现售假、虚假宣传、刷单、服务严重不达标等情形，平台有权下架商品、暂停店铺乃至终止合作。</Text>
          <Text>2. 造成消费者或平台损失的，商家须承担相应赔偿责任。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>六、协议变更</Text>
          <Text>平台可根据运营需要调整本协议，调整后将提前公示。商家继续使用服务即视为接受变更。</Text>
        </View>

        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          本协议为《用户服务协议》在商家场景下的补充，如有冲突以本协议为准。
        </Text>
      </View>
    </View>
  )
}

export default MerchantAgreement
