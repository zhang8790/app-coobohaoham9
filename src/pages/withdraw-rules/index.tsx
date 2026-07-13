import { View, Text } from '@tarojs/components'
// @title 提现规则
import Taro from '@tarojs/taro'

function WithdrawRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜提现规则</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月1日\n生效日期：2026年7月1日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、可提现范围</Text>
          <Text className="block">1. 可提现金额为已结算的推广佣金（推广服务费），待结算金额需结算后方可提现。</Text>
          <Text className="block">2. 单笔提现最低金额为 ¥1.00，最高不超过账户可用佣金。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、提现方式</Text>
          <Text className="block">1. 银行卡：需填写开户行、卡号及持卡人真实姓名，姓名须与实名信息一致。</Text>
          <Text className="block">2. 支付宝：填写支付宝账号（手机号或邮箱）。</Text>
          <Text className="block">3. 微信：提现至微信零钱，无需填写账号，须完成微信实名认证。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、佣金与税费说明</Text>
          <Text className="block">1. 推广佣金来源于真实商品交易的让利池，平台基础服务费已在让利阶段计提，不额外从您的佣金中扣除。</Text>
          <Text className="block">2. 提现按您申请的金额发放，不额外扣除平台服务费。</Text>
          <Text className="block">3. 推广佣金属于依法应申报的劳务报酬所得，请推广员依法履行个人所得税纳税申报义务。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、到账周期</Text>
          <Text className="block">1. 提现申请提交后进入审核，审核通常需要 1-3 个工作日。</Text>
          <Text className="block">2. 审核通过后打款，到账时间以各支付渠道为准（一般 1-2 个工作日）。</Text>
          <Text className="block">3. 审核未通过将退回申请金额至账户佣金余额，可在提现记录查看拒绝原因。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">五、风险提示</Text>
          <Text className="block">1. 请务必核对收款账户信息，因填写错误导致的资金损失由申请人承担。</Text>
          <Text className="block">2. 账户须为本人实名账户，不得借用、冒用他人账户进行提现。</Text>
          <Text className="block">3. 平台有权对异常提现（如刷单、套现）进行拦截并冻结相关收益。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          如有疑问，请在「我的」-「联系客服」中咨询。
        </Text>
      </View>
    </View>
  )
}

export default WithdrawRules
