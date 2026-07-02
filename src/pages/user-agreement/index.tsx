// @title 用户服务协议
import Taro from '@tarojs/taro'

function UserAgreement() {
  return (
    <div className="min-h-screen bg-background pb-10">
      {/* 导航 */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">用户服务协议</span>
      </div>

      <div className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <p style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来店有喜用户服务协议</p>
        <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</p>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、协议范围</p>
          <p>本协议是您与来店有喜（以下简称「我们」）之间关于使用来店有喜小程序服务所订立的协议。</p>
          <p>使用本小程序前，请您仔细阅读本协议。一旦您完成登录，即视为您已阅读并同意本协议的全部内容。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>二、账号注册与管理</p>
          <p>1. 您需使用手机号注册账号，应确保所提供信息真实、准确、完整。</p>
          <p>2. 您的账号仅限于本人使用，不得将账号转让、出借或允许他人使用。</p>
          <p>3. 如发现有损账号安全的行为，我们有权暂停或终止向您提供服务。</p>
          <p>4. 您有权注销账号，注销后我们将删除或匿名化处理您的个人信息。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、服务内容</p>
          <p>1. 来店有喜是一个本地生活服务平台，为用户提供周边商家优惠信息及消费服务。</p>
          <p>2. 我们尽力确保平台信息的真实性，但不对商家提供的商品或服务的质量承担保证责任。</p>
          <p>3. 您通过本平台购买的商品或服务，由对应商家直接提供，相关售后由商家负责。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、订单与支付</p>
          <p>1. 您提交订单即视为购买意向的确认，订单生效后请按时完成支付。</p>
          <p>2. 支付完成后，请凭核销码到店消费，核销后订单即视为完成。</p>
          <p>3. 如需退款，请在订单有效期内申请，我们将按平台规则处理。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>五、用户行为规范</p>
          <p>您承诺不得从事以下行为：</p>
          <p>1. 使用本平台从事任何违法、违规活动。</p>
          <p>2. 发布虚假信息、恶意评价或干扰平台正常秩序。</p>
          <p>3. 尝试未经授权访问本平台服务器或网络系统。</p>
          <p>4. 将本平台用于任何商业性用途而未获得我们事先书面同意。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>六、知识产权</p>
          <p>本平台所有内容（包括但不限于文字、图片、视频、标识等）的知识产权归我们或相关内容提供方所有。未经许可，任何人不得擅自使用。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>七、免责声明</p>
          <p>1. 因不可抗力（如自然灾害、政府行为、网络故障等）导致服务中断或数据丢失，我们不承担责任。</p>
          <p>2. 因第三方（如商家、支付机构）原因导致的损失，我们可协助处理，但不承担直接赔偿责任。</p>
          <p>3. 我们尽最大努力保障平台安全，但不保证平台不会存在漏洞或错误。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>八、协议修改</p>
          <p>我们有权根据需要修改本协议，修改后的协议将在小程序内公布。如您继续使用本平台，即视为您接受修改后的协议。</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>九、法律适用与争议解决</p>
          <p>本协议的订立、执行和解释及争议的解决均适用中华人民共和国法律。如双方就本协议内容或其执行发生任何争议，应尽量友好协商解决；协商不成时，任何一方均可向被告住所地有管辖权的人民法院提起诉讼。</p>
        </div>

        <p style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          如有任何疑问，请在「我的」-「联系客服」中咨询。
        </p>
      </div>
    </div>
  )
}

export default UserAgreement
