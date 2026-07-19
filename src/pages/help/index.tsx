import { View, Button, Text } from '@tarojs/components'
// @title 帮助中心
import { useState } from 'react'
import Taro, {} from '@tarojs/taro'

const FAQ_GROUPS = [
  {
    title: '购物相关',
    icon: 'i-mdi-shopping-outline',
    items: [
      { q: '如何下单购买商品？', a: '在首页或商品详情页点击"立即购买"或"加入购物车"，选择数量后前往支付页面完成支付即可。' },
      { q: '支持哪些支付方式？', a: '目前支持微信支付。后续将陆续接入更多支付方式。' },
      { q: '下单后多久发货？', a: '商家一般在付款后24小时内发货，节假日可能有所延迟，请耐心等待或联系商家。' },
      { q: '如何取消订单？', a: '待付款状态的订单可直接取消。已付款订单如需取消请在订单页申请退款，等待商家处理。' },
    ]},
  {
    title: '退款售后',
    icon: 'i-mdi-refresh',
    items: [
      { q: '如何申请退款？', a: '在"我的订单"中找到对应订单，点击"申请退款"按钮，填写退款原因并提交，等待商家审核处理。' },
      { q: '退款多久到账？', a: '退款审批通过后，一般1-3个工作日内退回至您的微信支付账户。' },
      { q: '商品有质量问题怎么办？', a: '请在收货后7天内申请退款并上传问题图片，我们将积极协助您解决。' },
    ]},
  {
    title: '推广奖励',
    icon: 'i-mdi-share-variant-outline',
    items: [
      { q: '如何获得推广佣金？', a: '在"侠客推广中心"获取您的专属推广码，将商品或门店码分享给好友，好友通过您的链接购买后即可获得佣金。' },
      { q: '佣金什么时候结算？', a: '订单完成后7天，佣金状态从"待结算"变为"已结算"，可在提现管理页申请提现。' },
      { q: '推广佣金提现最低金额是多少？', a: '推广佣金（推广服务费）最低提现金额为 1 元，支持银行卡、支付宝、微信三种方式；提现将依法代扣个人所得税。情绪豆等平台积分仅用于订单抵扣，不可提现。' },
    ]},
  {
    title: '账号相关',
    icon: 'i-mdi-account-circle-outline',
    items: [
      { q: '如何修改个人信息？', a: '进入"我的" → "设置"页面，即可修改昵称和头像。' },
      { q: '忘记密码怎么办？', a: '本小程序支持手机验证码登录，无需密码，直接输入手机号获取验证码即可登录。' },
      { q: '如何成为商家？', a: '在"我的"页面点击"申请成为商家"，填写店铺信息后提交申请，审核通过后即可开店。' },
    ]},
]

function HelpPage() {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const toggle = (key: string) => setOpenKey(prev => prev === key ? null : key)

  return (
    <View className="min-h-screen bg-background pb-8">

      {/* 搜索提示 */}
      <View className="mx-4 mt-4 p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-center gap-3">
        <View className="i-mdi-headset text-3xl text-primary flex-shrink-0" />
        <View className="flex-1">
          <Text className="text-xl font-bold text-foreground">遇到问题？</Text>
          <Text className="text-base text-muted-foreground">查看常见问题或联系客服</Text>
        </View>
        <Button type="button"
          className="flex items-center justify-center leading-none rounded-xl bg-primary"
          onClick={() => Taro.makePhoneCall({ phoneNumber: '400-000-0000' }).catch(() => {})}>
          <View className="px-3 py-2 text-xl font-bold text-white">联系客服</View>
        </Button>
      </View>

      {/* 常见问题 */}
      {FAQ_GROUPS.map(group => (
        <View key={group.title} className="mx-4 mt-4 bg-card rounded-2xl border border-border overflow-hidden">
          <View className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <View className={`${group.icon} text-2xl text-primary`} />
            <Text className="text-xl font-bold text-foreground">{group.title}</Text>
          </View>
          {group.items.map((item, idx) => {
            const key = `${group.title}-${idx}`
            const isOpen = openKey === key
            return (
              <View key={key} className="border-b border-border last:border-0">
                <View className="flex items-center justify-between px-4 py-4"
                  onClick={() => toggle(key)}>
                  <Text className="text-xl text-foreground flex-1 pr-2">{item.q}</Text>
                  <View className={`i-mdi-chevron-down text-2xl text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </View>
                {isOpen && (
                  <View className="px-4 pb-4">
                    <View className="p-3 bg-muted rounded-xl">
                      <Text className="text-xl text-foreground leading-relaxed">{item.a}</Text>
                    </View>
                  </View>
                )}
              </View>
            )
          })}
        </View>
      ))}

      {/* 底部联系方式 */}
      <View className="mx-4 mt-4 p-4 rounded-2xl bg-card border border-border">
        <Text className="text-xl font-bold text-foreground mb-3">联系我们</Text>
        <View className="flex flex-col gap-3">
          <View className="flex items-center gap-3">
            <View className="i-mdi-phone text-2xl text-primary" />
            <Text className="text-xl text-foreground">客服电话：400-000-0000</Text>
          </View>
          <View className="flex items-center gap-3">
            <View className="i-mdi-clock-outline text-2xl text-primary" />
            <Text className="text-xl text-foreground">服务时间：周一至周日 9:00-21:00</Text>
          </View>
          <View className="flex items-center gap-3">
            <View className="i-mdi-email-outline text-2xl text-primary" />
            <Text className="text-xl text-foreground">邮箱：support@laidian.com</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

export default HelpPage
