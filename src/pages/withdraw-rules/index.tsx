import { View, Text } from '@tarojs/components'
// @title 提现规则
import Taro from '@tarojs/taro'

function WithdrawRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <Text style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来店有喜提现规则</Text>
        <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</Text>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、可提现范围</Text>
          <Text>1. 可提现余额为已结算的佣金及金豆收益，待结算金额需结算后方可提现。</Text>
          <Text>2. 单笔提现最低金额为 ¥1.00，最高不超过账户可用余额。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>二、提现方式</Text>
          <Text>1. 银行卡：需填写开户行、卡号及持卡人真实姓名，姓名须与实名信息一致。</Text>
          <Text>2. 支付宝：填写支付宝账号（手机号或邮箱）。</Text>
          <Text>3. 微信：提现至微信零钱，无需填写账号，须完成微信实名认证。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、服务费说明</Text>
          <Text>1. 提现时将扣除 10% 平台服务费，实际到账金额为申请金额的 90%。</Text>
          <Text>2. 平台服务费用于支付通道成本、风控审核及运营维护，费率调整将提前公示。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、到账周期</Text>
          <Text>1. 提现申请提交后进入审核，审核通常需要 1-3 个工作日。</Text>
          <Text>2. 审核通过后打款，到账时间以各支付渠道为准（一般 1-2 个工作日）。</Text>
          <Text>3. 审核未通过将退回申请金额至账户余额，可在提现记录查看拒绝原因。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>五、风险提示</Text>
          <Text>1. 请务必核对收款账户信息，因填写错误导致的资金损失由申请人承担。</Text>
          <Text>2. 账户须为本人实名账户，不得借用、冒用他人账户进行提现。</Text>
          <Text>3. 平台有权对异常提现（如刷单、套现）进行拦截并冻结相关收益。</Text>
        </View>

        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          如有疑问，请在「我的」-「联系客服」中咨询。
        </Text>
      </View>
    </View>
  )
}

export default WithdrawRules
