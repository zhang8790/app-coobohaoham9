import { View, Text } from '@tarojs/components'
// @title 交易规则
import Taro from '@tarojs/taro'

function TradeRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <Text style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来电有喜交易规则</Text>
        <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</Text>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、适用范围</Text>
          <Text>本规则适用于来电有喜平台内的一切商品/服务交易行为，包括用户下单、支付、核销、退款、评价等环节。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>二、价格与让利</Text>
          <Text>1. 平台商品标注「原价」与「到手价」，到手价已包含商家让利及平台补贴。</Text>
          <Text>2. 每笔订单平台将提取不超过 9% 的让利池，用于分佣、积分返还及平台运营。</Text>
          <Text>3. 商品实际价格以订单提交时页面显示为准，商家有权根据库存与活动调整。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、下单与支付</Text>
          <Text>1. 提交订单即视为购买意向确认，订单在支付完成前可取消。</Text>
          <Text>2. 支付方式支持微信支付、金豆支付及混合支付，具体以订单页展示为准。</Text>
          <Text>3. 订单生成后请在有效支付时间内完成付款，超时订单将自动取消。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、核销与交付</Text>
          <Text>1. 到店消费类订单：凭核销码到店核销，核销后订单视为完成。</Text>
          <Text>2. 物流配送类订单：商家发货后物流信息可在订单中心查看。</Text>
          <Text>3. 核销或确认收货后，订单进入「待评价」状态，可进行评价。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>五、退款规则</Text>
          <Text>1. 未核销/未发货订单可申请全额退款，原路退回。</Text>
          <Text>2. 已核销订单如需退款，由商家核实后处理，平台不强制担保。</Text>
          <Text>3. 退款时，该订单产生的推广佣金将同步回扣，已发放积分将相应扣减。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>六、异常与争议</Text>
          <Text>1. 如遇商家服务问题，可在订单内发起售后申请或联系平台客服。</Text>
          <Text>2. 平台依据订单记录、聊天记录等证据协调处理，必要时可介入裁决。</Text>
        </View>

        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          本规则为《用户服务协议》的补充，如有冲突以本协议及平台最新公示为准。
        </Text>
      </View>
    </View>
  )
}

export default TradeRules
