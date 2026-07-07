// @title 隐私政策
import Taro from '@tarojs/taro'
import { Text, View, Button } from '@tarojs/components'

function PrivacyPolicy() {
  return (
    <View className="min-h-screen bg-background pb-10">

      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <Text style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来电有喜隐私政策</Text>
        <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</Text>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、我们收集的信息</Text>
          <Text>为使您更好地享受我们的服务，我们可能收集您的以下信息：</Text>
          <Text>1. 账号信息：手机号、昵称、头像。</Text>
          <Text>2. 交易信息：订单记录、收货地址、支付信息。</Text>
          <Text>3. 设备信息：设备型号、操作系统、唯一设备标识。</Text>
          <Text>4. 位置信息：为向您推荐附近商家，经您授权后获取位置信息。</Text>
          <Text>5. 浏览信息：浏览记录、搜索记录、收藏记录。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>二、我们如何使用您的信息</Text>
          <Text>1. 提供、维护并改进我们的服务。</Text>
          <Text>2. 处理您的交易订单及售后服务。</Text>
          <Text>3. 向您推荐您可能感兴趣的商品或服务。</Text>
          <Text>4. 发送服务通知、活动信息（经您同意）。</Text>
          <Text>5. 防止欺诈、保障账号安全。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、信息的存储与安全</Text>
          <Text>1. 您的个人信息存储于中国境内的服务器。</Text>
          <Text>2. 我们采用加密、去标识化等技术措施保护您的个人信息。</Text>
          <Text>3. 我们将按照法律规定的最短期限存储您的个人信息。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、我们如何共享您的信息</Text>
          <Text>1. 商家：为完成交易，您的收货信息将提供给对应商家。</Text>
          <Text>2. 支付机构：为完成支付，必要信息将提供给微信支付等支付机构。</Text>
          <Text>3. 第三方服务：我们使用 Supabase 提供后端服务，相关信息将按其与隐私政策处理。</Text>
          <Text>4. 除法律要求外，我们不会将您的个人信息出售给第三方。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>五、您的权利</Text>
          <Text>根据《个人信息保护法》，您享有以下权利：</Text>
          <Text>1. 查阅、复制您的个人信息。</Text>
          <Text>2. 更正不准确的个人信息。</Text>
          <Text>3. 删除您的个人信息（符合法定情形时）。</Text>
          <Text>4. 注销账号，我们将删除或匿名化处理您的个人信息。</Text>
          <Text>如需行使上述权利，请在设置页提交申请或联系客服。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>六、联系我们</Text>
          <Text>如对本隐私政策有任何疑问，请联系我们：</Text>
          <Text>客服电话：请在「我的」-「联系客服」中查看</Text>
          <Text>我们将在15个工作日内回复您的请求。</Text>
        </View>

        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          来电有喜保留随时修改本政策的权利，修改后的政策将在小程序内公布并生效。
        </Text>
      </View>
    </View>
  )
}

export default PrivacyPolicy
