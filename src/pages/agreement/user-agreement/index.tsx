import { View, Text } from '@tarojs/components'
// @title 用户服务协议


function UserAgreement() {
  return (
    <View className="min-h-screen bg-background pb-10">

      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4 text-muted-foreground text-sm leading-loose">
        <Text className="block text-foreground text-base font-bold mb-3 leading-snug">来电有喜用户服务协议</Text>
        <Text className="block text-muted-foreground text-xs mb-4">{'最近更新日期：2026年7月1日\n生效日期：2026年7月1日'}</Text>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">一、协议范围</Text>
          <Text className="block">本协议是您与来电有喜（以下简称「我们」）之间关于使用来电有喜小程序服务所订立的协议。</Text>
          <Text className="block">使用本小程序前，请您仔细阅读本协议。一旦您完成登录，即视为您已阅读并同意本协议的全部内容。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">二、账号注册与管理</Text>
          <Text className="block">1. 您需使用手机号注册账号，应确保所提供信息真实、准确、完整。</Text>
          <Text className="block">2. 您的账号仅限于本人使用，不得将账号转让、出借或允许他人使用。</Text>
          <Text className="block">3. 如发现有损账号安全的行为，我们有权暂停或终止向您提供服务。</Text>
          <Text className="block">4. 您有权注销账号，注销后我们将删除或匿名化处理您的个人信息。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">三、服务内容</Text>
          <Text className="block">1. 来电有喜是一个本地生活服务平台，为用户提供周边商家优惠信息及消费服务。</Text>
          <Text className="block">2. 我们尽力确保平台信息的真实性，但不对商家提供的商品或服务的质量承担保证责任。</Text>
          <Text className="block">3. 您通过本平台购买的商品或服务，由对应商家直接提供，相关售后由商家负责。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">四、订单与支付</Text>
          <Text className="block">1. 您提交订单即视为购买意向的确认，订单生效后请按时完成支付。</Text>
          <Text className="block">2. 支付完成后，到店消费即视为已使用，订单完成。</Text>
          <Text className="block">3. 如需退款，请在订单有效期内申请，我们将按平台规则处理。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">五、用户行为规范</Text>
          <Text className="block">您承诺不得从事以下行为：</Text>
          <Text className="block">1. 使用本平台从事任何违法活动。</Text>
          <Text className="block">2. 发布虚假信息、恶意评价或干扰平台正常秩序。</Text>
          <Text className="block">3. 尝试未经授权访问本平台服务器或网络系统。</Text>
          <Text className="block">4. 将本平台用于任何商业性用途而未获得我们事先书面同意。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">六、知识产权</Text>
          <Text className="block">本平台所有内容（包括但不限于文字、图片、视频、标识等）的知识产权归我们或相关内容提供方所有。未经许可，任何人不得擅自使用。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">七、免责声明</Text>
          <Text className="block">1. 因不可抗力（如自然灾害、政府行为、网络故障等）导致服务中断或数据丢失，我们不承担责任。</Text>
          <Text className="block">2. 因第三方（如商家、支付机构）原因导致的损失，我们将依法协助您向责任方主张权利；法律法规规定平台应承担责任的情形，我们不以免责条款规避。</Text>
          <Text className="block">3. 我们尽最大努力保障平台安全，但不保证平台不会存在漏洞或错误。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">八、协议修改</Text>
          <Text className="block">我们可根据法律法规或业务调整修订本协议，修订后的协议将在小程序内公布。涉及您重大权益的变更（如服务费用、责任承担、争议解决等），我们将以显著方式另行通知并重新征得您的同意；一般性修订自公布之日起满30日生效，您若不同意可停止使用并申请注销。</Text>
        </View>

        <View className="mb-4">
          <Text className="block text-foreground font-semibold mb-1 leading-snug">九、法律适用与争议解决</Text>
          <Text className="block">本协议的订立、执行和解释及争议的解决均适用中华人民共和国法律。如双方就本协议内容或其执行发生任何争议，应尽量友好协商解决；协商不成时，任何一方均可向被告住所地有管辖权的人民法院提起诉讼。</Text>
        </View>

        <Text className="block text-muted-foreground text-xs mt-5 pt-3" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          如有任何疑问，请在「我的」-「联系客服」中咨询。
        </Text>
      </View>
    </View>
  )
}

export default UserAgreement
