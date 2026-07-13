import { View, Text } from '@tarojs/components'
// @title 推广服务协议
import Taro from '@tarojs/taro'

function DistributionAgreement() {
  return (
    <View className="min-h-screen bg-background pb-10">

      {/* 风险警示强制公示 */}
      <View className="mx-4 mt-4 rounded-2xl border border-amber-500/40 p-4" style={{ background: 'rgba(245,158,11,0.08)' }}>
        <Text className="block text-amber-600 text-sm font-bold leading-relaxed">
          风险提示
        </Text>
        <Text className="block text-foreground text-xs mt-1 leading-relaxed">
          本平台仅从事实物商品零售经营，所有推广奖励、积分权益均依托真实商品交易产生；不存在投资、理财、资产增值功能。请勿轻信「保本高收益、积分变现、躺赚」等不实宣传；任何以拉人头、多层分红、现金返利为核心的模式均属于违法传销、资金盘，请勿参与。
        </Text>
      </View>

      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜推广服务协议</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月10日\n生效日期：2026年7月10日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、主体界定</Text>
          <Text className="block">1. 推广者（以下简称「您」）为普通消费者，基于真实消费体验自愿分享商品，并非本平台的代理商、加盟商或员工。</Text>
          <Text className="block">2. 您与平台之间不构成任何劳动、合伙、特许经营或代理关系。</Text>
          <Text className="block">3. 平台不收取任何加盟费、保证金、升级费；参与推广零门槛，无需付费、囤货或认购商品即可获得推广权限。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、奖励规则</Text>
          <Text className="block">1. 推广奖励（推广服务费）仅来源于商品正常销售利润，由真实交易流水驱动，可提现并代扣个人所得税。</Text>
          <Text className="block">2. 奖励仅针对您直接推荐的我的好友、以及您推荐的我的好友再邀请的我的粉丝在平台产生的有效消费订单结算，仅限两级。</Text>
          <Text className="block">3. 奖励结算唯一依据为用户真实支付、完成履约的有效订单；单纯注册、未付款订单不计入奖励基数，无零订单返利。</Text>
          <Text className="block">4. 本平台仅设二级推广（我的好友+我的粉丝），只有二级、不发展第三级及多级分润，不设置团队业绩奖、层级管理奖；段位比例由个人累计消费决定，不含团队计酬维度。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、禁止行为条款</Text>
          <Text className="block">1. 您不得以「投资、保本、稳赚、升值、躺赚」等表述对外宣传推广收益，不得虚构收益案例误导他人。</Text>
          <Text className="block">2. 您不得发展三级及以上多层级返利团队，不得收取他人任何入门费或代理费。</Text>
          <Text className="block">3. 平台有权对违规推广账号取消奖励资格、冻结或清零相关收益，并保留追究法律责任的权利。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、法律风险告知条款</Text>
          <Text className="block">1. 您知悉：任何以发展下线人数计酬、收取入门费、多层级团队分红的模式均属于传销违法行为。</Text>
          <Text className="block">2. 本平台推广为二级结构（我的好友+我的粉丝），仅限二级，不存在第三级及多级分润机制。</Text>
          <Text className="block">3. 推广收益根据订单销量浮动，无固定收益保障，个体收益存在差异。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          本协议与《用户服务协议》《推广规则》《段位规则》配套使用，解释与适用遵循法律法规，如有疑问请联系客服咨询。
        </Text>
      </View>
    </View>
  )
}

export default DistributionAgreement
