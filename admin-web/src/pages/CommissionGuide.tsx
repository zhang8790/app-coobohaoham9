import { useEffect, useState } from 'react'

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '20px 22px',
  marginBottom: 20,
}
const h2: React.CSSProperties = { fontSize: 16, color: 'var(--warning)', marginBottom: 14, fontWeight: 700 }
const note: React.CSSProperties = {
  borderLeft: '3px solid var(--warning)', padding: '12px 16px', borderRadius: 8,
  background: 'rgba(212,175,55,0.06)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 12,
}

// 平台让利四块流向（SVG）
function FlowSvg() {
  return (
    <svg viewBox="0 0 940 360" style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="poolGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F0C75E" />
          <stop offset="100%" stopColor="var(--primary)" />
        </linearGradient>
        <marker id="ah2" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 Z" fill="var(--warning)" />
        </marker>
      </defs>
      <rect x="30" y="150" width="150" height="60" rx="10" fill="var(--surface-2)" stroke="var(--warning)" strokeWidth={1.5} />
      <text x="105" y="178" textAnchor="middle" fill="var(--text)" fontSize={13} fontWeight={600}>订单全额</text>
      <text x="105" y="196" textAnchor="middle" fill="var(--text-muted)" fontSize={11}>含金豆抵扣</text>
      <text x="215" y="185" textAnchor="middle" fill="var(--warning)" fontSize={22} fontWeight={800}>× 让利率</text>
      <circle cx="330" cy="180" r="56" fill="url(#poolGrad)" stroke="var(--warning)" strokeWidth={2} />
      <text x="330" y="174" textAnchor="middle" fill="#1a1205" fontSize={14} fontWeight={800}>平台让利</text>
      <text x="330" y="194" textAnchor="middle" fill="#1a1205" fontSize={11}>¥ 佣金钱袋</text>
      <path d="M180,180 L270,180" fill="none" stroke="var(--warning)" strokeWidth={1.5} markerEnd="url(#ah2)" />
      <path d="M386,150 C460,90 520,90 590,90" fill="none" stroke="var(--warning)" strokeWidth={1.5} markerEnd="url(#ah2)" strokeDasharray="6 5" />
      <rect x="590" y="60" width="150" height="60" rx="10" fill="var(--card)" stroke="var(--success)" strokeWidth={1.5} />
      <text x="665" y="84" textAnchor="middle" fill="var(--success)" fontSize={12} fontWeight={700}>L1 佣金</text>
      <text x="665" y="104" textAnchor="middle" fill="var(--text-muted)" fontSize={11}>一级推广员（先绑先得）</text>
      <path d="M386,170 C480,150 540,150 590,170" fill="none" stroke="var(--warning)" strokeWidth={1.5} markerEnd="url(#ah2)" strokeDasharray="6 5" />
      <rect x="590" y="140" width="150" height="60" rx="10" fill="var(--card)" stroke="var(--info-text)" strokeWidth={1.5} />
      <text x="665" y="164" textAnchor="middle" fill="var(--info-text)" fontSize={12} fontWeight={700}>L2 佣金</text>
      <text x="665" y="184" textAnchor="middle" fill="var(--text-muted)" fontSize={11}>二级（L1 的上级）</text>
      <path d="M386,200 C480,220 540,220 590,230" fill="none" stroke="var(--warning)" strokeWidth={1.5} markerEnd="url(#ah2)" strokeDasharray="6 5" />
      <rect x="590" y="200" width="150" height="60" rx="10" fill="var(--card)" stroke="var(--accent-text)" strokeWidth={1.5} />
      <text x="665" y="224" textAnchor="middle" fill="var(--accent-text)" fontSize={12} fontWeight={700}>买家金豆</text>
      <text x="665" y="244" textAnchor="middle" fill="var(--text-muted)" fontSize={11}>返下单人金豆</text>
      <path d="M386,215 C460,275 520,275 590,290" fill="none" stroke="var(--warning)" strokeWidth={1.5} markerEnd="url(#ah2)" strokeDasharray="6 5" />
      <rect x="590" y="260" width="150" height="60" rx="10" fill="var(--card)" stroke="var(--warning)" strokeWidth={1.5} />
      <text x="665" y="284" textAnchor="middle" fill="var(--warning)" fontSize={12} fontWeight={700}>平台佣金</text>
      <text x="665" y="304" textAnchor="middle" fill="var(--text-muted)" fontSize={11}>平台让利 − 上面三项</text>
      <text x="770" y="92" fill="var(--text-muted)" fontSize={11}>比例由段位/活跃/邀请新用户系数决定</text>
      <text x="770" y="172" fill="var(--text-muted)" fontSize={11}>平台先抽最低 10%</text>
      <text x="770" y="232" fill="var(--text-muted)" fontSize={11}>按会员段位 points 比例</text>
    </svg>
  )
}

export default function CommissionGuide() {
  const [now, setNow] = useState('')
  useEffect(() => { setNow(new Date().toLocaleString('zh-CN')) }, [])

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>佣金规则说明</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>平台让利从哪来、分给谁、谁先锁客谁先拿 · 最后更新 {now}</p>

      {/* ① 平台让利 */}
      <div style={card}>
        <h2 style={h2}>① 佣金从哪来：平台让利</h2>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 14,
          padding: 18, borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(194,65,12,0.12), rgba(212,175,55,0.08))',
          border: '1px dashed rgba(212,175,55,0.4)',
        }}>
          <span style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 13 }}>订单全额（含金豆）</span>
          <span>×</span>
          <span style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 13 }}>让利率 <b style={{ color: 'var(--warning)' }}>（门店 referral_rate，或商品 discount_rate 金额加权）</b></span>
          <span>=</span>
          <b style={{ color: 'var(--warning)' }}>平台让利</b>（佣金唯一钱袋）
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          例：订单 ¥100，门店让利 10%  平台让利 = ¥10。这 ¥10 就是下面四块瓜分的全部来源。
        </p>
      </div>

      {/* ② 流向图 */}
      <div style={card}>
        <h2 style={h2}>② 平台让利怎么分：四块流向</h2>
        <FlowSvg />
      </div>

      {/* ③ 两种锁客 */}
      <div style={card}>
        <h2 style={h2}>③ 谁先锁客谁先拿？——两种锁客，待遇不同</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ borderRadius: 14, padding: 18, border: '1px solid rgba(56,189,248,0.25)', background: 'rgba(56,189,248,0.06)' }}>
            <h3 style={{ fontSize: 15, color: 'var(--info-text)', marginBottom: 10 }}> 门店锁客</h3>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: 'var(--text-muted)', display: 'inline-block', minWidth: 76 }}>落表</span> user_store_relation</div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: 'var(--text-muted)', display: 'inline-block', minWidth: 76 }}>佣金系统</span><span style={{ color: 'var(--danger-text)', fontWeight: 700 }}>不读取 · 不发佣金</span></div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: 'var(--text-muted)', display: 'inline-block', minWidth: 76 }}>作用</span> 门店业绩归因标记</div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: 'var(--text-muted)', display: 'inline-block', minWidth: 76 }}>能拿佣金吗</span><span style={{ color: 'var(--danger-text)', fontWeight: 700 }}>不能</span></div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>客户被门店锁定后去别处消费，锁定门店只记一笔业绩，一分钱拿不到。</p>
          </div>
          <div style={{ borderRadius: 14, padding: 18, border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,93,0.06)' }}>
            <h3 style={{ fontSize: 15, color: 'var(--success)', marginBottom: 10 }}> 推广锁客</h3>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: 'var(--text-muted)', display: 'inline-block', minWidth: 76 }}>落表</span> profiles.referrer_id</div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: 'var(--text-muted)', display: 'inline-block', minWidth: 76 }}>佣金系统</span><span style={{ color: 'var(--success)', fontWeight: 700 }}>唯一读取来源</span></div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: 'var(--text-muted)', display: 'inline-block', minWidth: 76 }}>作用</span> L1/L2 佣金归属</div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: 'var(--text-muted)', display: 'inline-block', minWidth: 76 }}>能拿佣金吗</span><span style={{ color: 'var(--success)', fontWeight: 700 }}>能（先绑先得）</span></div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>referrer_id 首次绑定后不可改，先绑的推广员 = L1，后面谁都抢不走。</p>
          </div>
        </div>
      </div>

      {/* ④ 提醒 */}
      <div style={card}>
        <h2 style={h2}>④ 运营必知的两个坑</h2>
        <div style={note}>
          <b style={{ color: 'var(--warning)' }}>⚠️ 纯金豆订单不发佣：</b>distribute-commission 只在「微信支付成功回调」里触发。纯豆支付不经微信回调  不发佣金。混合支付（豆+微信）正常发。
        </div>
        <div style={note}>
          <b style={{ color: 'var(--warning)' }}>💡 门店想从让利里分到钱：</b>平台让利虽由门店让利撑大，但门店锁客不拿佣。门店须让客户通过<b>门店自己的推广码（referral_code）</b>下单，才能以「推广员」身份走 referrer_id 拿到佣金。
        </div>
      </div>
    </div>
  )
}
