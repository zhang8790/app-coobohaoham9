// @title 隐私政策
import Taro from '@tarojs/taro'
import { Text } from '@tarojs/components'

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background pb-10">
      {/* 导航 */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">隐私政策</span>
      </div>

      <div className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <p style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来店有喜隐私政策</p>
        <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</p>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、我们收集的信息</p>
          <p>为使您更好地享受我们的服务，我们可能收集您的以下信息：</p>
          <p>1. 账号信息：手机号、昵称、头像。</p>
          <p>2. 交易信息：订单记录、收货地址、支付信息。</p>
          <p>3. 设备信息：设备型号、操作系统、唯一设备标识。</p>
          <p>4. 位置信息：为向您推荐附近商家，经您授权后获取位置信息。</p>
          <p>5. 浏览信息：浏览记录、搜索记录、收藏记录。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>二、我们如何使用您的信息</p>
          <p>1. 提供、维护并改进我们的服务。</p>
          <p>2. 处理您的交易订单及售后服务。</p>
          <p>3. 向您推荐您可能感兴趣的商品或服务。</p>
          <p>4. 发送服务通知、活动信息（经您同意）。</p>
          <p>5. 防止欺诈、保障账号安全。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、信息的存储与安全</p>
          <p>1. 您的个人信息存储于中国境内的服务器。</p>
          <p>2. 我们采用加密、去标识化等技术措施保护您的个人信息。</p>
          <p>3. 我们将按照法律规定的最短期限存储您的个人信息。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、我们如何共享您的信息</p>
          <p>1. 商家：为完成交易，您的收货信息将提供给对应商家。</p>
          <p>2. 支付机构：为完成支付，必要信息将提供给微信支付等支付机构。</p>
          <p>3. 第三方服务：我们使用 Supabase 提供后端服务，相关信息将按其与隐私政策处理。</p>
          <p>4. 除法律要求外，我们不会将您的个人信息出售给第三方。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>五、您的权利</p>
          <p>根据《个人信息保护法》，您享有以下权利：</p>
          <p>1. 查阅、复制您的个人信息。</p>
          <p>2. 更正不准确的个人信息。</p>
          <p>3. 删除您的个人信息（符合法定情形时）。</p>
          <p>4. 注销账号，我们将删除或匿名化处理您的个人信息。</p>
          <p>如需行使上述权利，请在设置页提交申请或联系客服。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>六、联系我们</p>
          <p>如对本隐私政策有任何疑问，请联系我们：</p>
          <p>客服电话：请在「我的」-「联系客服」中查看</p>
          <p>我们将在15个工作日内回复您的请求。</p>
        </div>

        <p style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          来店有喜保留随时修改本政策的权利，修改后的政策将在小程序内公布并生效。
        </p>
      </div>
    </div>
  )
}

export default PrivacyPolicy
