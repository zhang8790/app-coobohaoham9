import { View, Text } from '@tarojs/components'
// @title 积分规则
import Taro from '@tarojs/taro'

function PointsRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <Text style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来电有喜积分规则</Text>
        <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</Text>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、积分获取</Text>
          <Text>1. 消费获取：完成订单后按段位比例获得积分（消费越高、段位越高，积分越多）。</Text>
          <Text>2. 邀请获取：成功邀请好友注册并完成首单，可获得邀请积分奖励。</Text>
          <Text>3. 签到获取：每日签到可获得少量积分（具体以活动页面为准）。</Text>
          <Text>4. 内容获取：发布优质 UGC 内容经审核通过可获得内容积分。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>二、积分用途</Text>
          <Text>1. 支付抵扣：部分订单支持使用积分抵扣现金（按页面提示比例折算）。</Text>
          <Text>2. 犒赏铺兑换：可在积分商城兑换优惠券、实物礼品等权益。</Text>
          <Text>3. 活动参与：部分限定活动需消耗积分参与。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、积分扣减</Text>
          <Text>1. 发生退款时，该订单产生的积分将相应扣回。</Text>
          <Text>2. 使用积分支付的订单退款，积分按原路径退回。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、有效期与清理</Text>
          <Text>1. 积分有效期以账户展示为准，到期未使用的积分将被清零并提前公示。</Text>
          <Text>2. 注销账号后，账户内积分将一并清空且不可恢复。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>五、特别说明</Text>
          <Text>1. 积分仅限本人使用，不得交易、转让或提现。</Text>
          <Text>2. 通过作弊手段获取的积分，平台有权收回并追究责任。</Text>
        </View>

        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          积分明细可在「我的」-「积分余额」中查看。
        </Text>
      </View>
    </View>
  )
}

export default PointsRules
