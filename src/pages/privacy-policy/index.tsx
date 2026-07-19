// @title 隐私政策

import { Text, View } from '@tarojs/components'

function PrivacyPolicy() {
  return (
    <View className="min-h-screen bg-background pb-10">

      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜隐私政策</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月1日\n生效日期：2026年7月1日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、我们收集的信息</Text>
          <Text className="block">为使您更好地享受我们的服务，我们可能收集您的以下信息：</Text>
          <Text className="block">1. 账号信息：手机号、昵称、头像。</Text>
          <Text className="block">2. 交易信息：订单记录、收货地址、支付信息。</Text>
          <Text className="block">3. 设备信息：设备型号、操作系统、唯一设备标识。</Text>
          <Text className="block">4. 位置信息：为向您推荐附近商家，经您授权后获取位置信息。</Text>
          <Text className="block">5. 浏览信息：浏览记录、搜索记录、收藏记录。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、我们如何使用您的信息</Text>
          <Text className="block">1. 提供、维护并改进我们的服务。</Text>
          <Text className="block">2. 处理您的交易订单及售后服务。</Text>
          <Text className="block">3. 向您推荐您可能感兴趣的商品或服务。</Text>
          <Text className="block">4. 发送服务通知、活动信息（经您同意）。</Text>
          <Text className="block">5. 防止欺诈、保障账号安全。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、信息的存储与安全</Text>
          <Text className="block">1. 您的个人信息存储于中国境内的服务器。</Text>
          <Text className="block">2. 我们采用加密、去标识化等技术措施保护您的个人信息。</Text>
          <Text className="block">3. 我们将按照法律规定的最短期限存储您的个人信息。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、我们如何共享您的信息</Text>
          <Text className="block">1. 商家：为完成交易，您的收货信息将提供给对应商家。</Text>
          <Text className="block">2. 支付机构：为完成支付，必要信息将提供给微信支付等支付机构。</Text>
          <Text className="block">3. 第三方服务及 SDK 清单：我们接入以下第三方服务处理必要信息——</Text>
          <Text className="block">  · Supabase（后端数据存储与云函数，提供方：Supabase Inc.，处理账号与业务数据）；</Text>
          <Text className="block">  · 微信开放平台（登录、支付、分享，提供方：腾讯科技，处理微信授权与支付信息）；</Text>
          <Text className="block">  · 微信位置服务（定位，提供方：腾讯科技，仅获取用户授权后的地理位置）。</Text>
          <Text className="block">  各服务方均按其隐私政策与适用法律处理信息，我们已要求其落实个人信息保护义务。</Text>
          <Text className="block">4. 除法律要求外，我们不会将您的个人信息出售给第三方。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">五、您的权利</Text>
          <Text className="block">根据《个人信息保护法》，您享有以下权利：</Text>
          <Text className="block">1. 查阅、复制您的个人信息。</Text>
          <Text className="block">2. 更正不准确的个人信息。</Text>
          <Text className="block">3. 删除您的个人信息（符合法定情形时）。</Text>
          <Text className="block">4. 注销账号，我们将删除或匿名化处理您的个人信息。</Text>
          <Text className="block">如需行使上述权利，请在设置页提交申请或联系客服。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">六、联系我们</Text>
          <Text className="block">如对本隐私政策有任何疑问，请联系我们：</Text>
          <Text className="block">客服电话：请在「我的」-「联系客服」中查看</Text>
          <Text className="block">我们将在15个工作日内回复您的请求。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          来电有喜可能根据法律法规或业务调整修订本隐私政策，修订后的政策将在小程序内公布。涉及个人信息处理目的、方式或共享范围的重大变更，我们将重新征得您的同意；一般性修订自公布之日起满30日生效。
        </Text>
      </View>
    </View>
  )
}

export default PrivacyPolicy
