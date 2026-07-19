import { useEffect, useState } from 'react'

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid #1F2937',
  borderRadius: 16,
  padding: '20px 22px',
  marginBottom: 20,
}
const h2: React.CSSProperties = { fontSize: 16, color: '#D4AF37', marginBottom: 14, fontWeight: 700 }
const note: React.CSSProperties = {
  borderLeft: '3px solid #D4AF37', padding: '12px 16px', borderRadius: 8,
  background: 'rgba(212,175,55,0.06)', fontSize: 13, color: '#D1D5DB', marginBottom: 12,
}

// 让利池四块流向（SVG）
function FlowSvg() {
  return (
    <svg viewBox="0 0 940 360" style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="poolGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F0C75E" />
          <stop offset="100%" stopColor="#C2410C" />
        </linearGradient>
        <marker id="ah2" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 Z" fill="#D4AF37" />
        </marker>
      </defs>
      <rect x="30" y="150" width="150" height="60" rx="10" fill="#111827" stroke="#D4AF37" strokeWidth={1.5} />
      <text x="105" y="178" textAnchor="middle" fill="#E5E7EB" fontSize={13} fontWeight={600}>订单全额</text>
      <text x="105" y="196" textAnchor="middle" fill="#9CA3AF" fontSize={11}>含情绪豆抵扣</text>
      <text x="215" y="185" textAnchor="middle" fill="#D4AF37" fontSize={22} fontWeight={800}>× 让利率</text>
      <circle cx="330" cy="180" r="56" fill="url(#poolGrad)" stroke="#D4AF37" strokeWidth={2} />
      <text x="330" y="174" textAnchor="middle" fill="#1a1205" fontSize={14} fontWeight={800}>让利池</text>
      <text x="330" y="194" textAnchor="middle" fill="#1a1205" fontSize={11}>¥ 分佣钱袋</text>
      <path d="M180,180 L270,180" fill="none" stroke="#D4AF37" strokeWidth={1.5} markerEnd="url(#ah2)" />
      <path d="M386,150 C460,90 520,90 590,90" fill="none" stroke="#D4AF37" strokeWidth={1.5} markerEnd="url(#ah2)" strokeDasharray="6 5" />
      <rect x="590" y="60" width="150" height="60" rx="10" fill="#0f172a" stroke="#22C55E" strokeWidth={1.5} />
      <text x="665" y="84" textAnchor="middle" fill="#22C55E" fontSize={12} fontWeight={700}>L1 佣金</text>
      <text x="665" y="104" textAnchor="middle" fill="#9CA3AF" fontSize={11}>一级推广员（先绑先得）</text>
      <path d="M386,170 C480,150 540,150 590,170" fill="none" stroke="#D4AF37" strokeWidth={1.5} markerEnd="url(#ah2)" strokeDasharray="6 5" />
      <rect x="590" y="140" width="150" height="60" rx="10" fill="#0f172a" stroke="#38BDF8" strokeWidth={1.5} />
      <text x="665" y="164" textAnchor="middle" fill="#38BDF8" fontSize={12} fontWeight={700}>L2 佣金</text>
      <text x="665" y="184" textAnchor="middle" fill="#9CA3AF" fontSize={11}>二级（L1 的上级）</text>
      <path d="M386,200 C480,220 540,220 590,230" fill="none" stroke="#D4AF37" strokeWidth={1.5} markerEnd="url(#ah2)" strokeDasharray="6 5" />
      <rect x="590" y="200" width="150" height="60" rx="10" fill="#0f172a" stroke="#A78BFA" strokeWidth={1.5} />
      <text x="665" y="224" textAnchor="middle" fill="#A78BFA" fontSize={12} fontWeight={700}>买家积分</text>
      <text x="665" y="244" textAnchor="middle" fill="#9CA3AF" fontSize={11}>返下单人情绪豆</text>
      <path d="M386,215 C460,275 520,275 590,290" fill="none" stroke="#D4AF37" strokeWidth={1.5} markerEnd="url(#ah2)" strokeDasharray="6 5" />
      <rect x="590" y="260" width="150" height="60" rx="10" fill="#0f172a" stroke="#D4AF37" strokeWidth={1.5} />
      <text x="665" y="284" textAnchor="middle" fill="#D4AF37" fontSize={12} fontWeight={700}>平台收入</text>
      <text x="665" y="304" textAnchor="middle" fill="#9CA3AF" fontSize={11}>让利池 − 上面三项</text>
      <text x="770" y="92" fill="#9CA3AF" fontSize={11}>比例由段位/活跃/拓新系数决定</text>
      <text x="770" y="172" fill="#9CA3AF" fontSize={11}>平台先抽最低 10%</text>
      <text x="770" y="232" fill="#9CA3AF" fontSize={11}>按会员段位 points 比例</text>
    </svg>
  )
}

export default function CommissionGuide() {
  const [now, setNow] = useState('')
  useEffect(() => { setNow(new Date().toLocaleString('zh-CN')) }, [])

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E5E7EB', marginBottom: 4 }}>分佣规则说明</h1>
      <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 24 }}>让利池从哪来、分给谁、谁先锁客谁先拿 · 最后更新 {now}</p>

      {/* ① 让利池 */}
      <div style={card}>
        <h2 style={h2}>① 佣金从哪来：让利池</h2>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 14,
          padding: 18, borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(194,65,12,0.12), rgba(212,175,55,0.08))',
          border: '1px dashed rgba(212,175,55,0.4)',
        }}>
          <span style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 13 }}>订单全额（含情绪豆）</span>
          <span>×</span>
          <span style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', fontSize: 13 }}>让利率 <b style={{ color: '#D4AF37' }}>（门店 referral_rate，或商品 discount_rate 金额加权）</b></span>
          <span>=</span>
          <b style={{ color: '#D4AF37' }}>让利池</b>（分佣唯一钱袋）
        </div>
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10 }}>
          例：订单 ¥100，门店让利 10% → 让利池 = ¥10。这 ¥10 就是下面四块瓜分的全部来源。
        </p>
      </div>

      {/* ② 流向图 */}
      <div style={card}>
        <h2 style={h2}>② 让利池怎么分：四块流向</h2>
        <FlowSvg />
      </div>

      {/* ③ 两种锁客 */}
      <div style={card}>
        <h2 style={h2}>③ 谁先锁客谁先拿？——两种锁客，待遇不同</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ borderRadius: 14, padding: 18, border: '1px solid rgba(56,189,248,0.25)', background: 'rgba(56,189,248,0.06)' }}>
            <h3 style={{ fontSize: 15, color: '#38BDF8', marginBottom: 10 }}>🏪 门店锁客</h3>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: '#9CA3AF', display: 'inline-block', minWidth: 76 }}>落表</span> user_store_relation</div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: '#9CA3AF', display: 'inline-block', minWidth: 76 }}>分佣系统</span><span style={{ color: '#F87171', fontWeight: 700 }}>不读取 · 不分佣</span></div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: '#9CA3AF', display: 'inline-block', minWidth: 76 }}>作用</span> 门店业绩归因标记</div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: '#9CA3AF', display: 'inline-block', minWidth: 76 }}>能拿佣金吗</span><span style={{ color: '#F87171', fontWeight: 700 }}>不能</span></div>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>客户被门店锁定后去别处消费，锁定门店只记一笔业绩，一分钱拿不到。</p>
          </div>
          <div style={{ borderRadius: 14, padding: 18, border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,93,0.06)' }}>
            <h3 style={{ fontSize: 15, color: '#22C55E', marginBottom: 10 }}>🔗 推广锁客</h3>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: '#9CA3AF', display: 'inline-block', minWidth: 76 }}>落表</span> profiles.referrer_id</div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: '#9CA3AF', display: 'inline-block', minWidth: 76 }}>分佣系统</span><span style={{ color: '#22C55E', fontWeight: 700 }}>唯一读取来源</span></div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: '#9CA3AF', display: 'inline-block', minWidth: 76 }}>作用</span> L1/L2 佣金归属</div>
            <div style={{ fontSize: 13, margin: '6px 0' }}><span style={{ color: '#9CA3AF', display: 'inline-block', minWidth: 76 }}>能拿佣金吗</span><span style={{ color: '#22C55E', fontWeight: 700 }}>能（先绑先得）</span></div>
            <p style={{ fontSize: 12, color: '#D1D5DB', marginTop: 8 }}>referrer_id 首次绑定后不可改，先绑的推广员 = L1，后面谁都抢不走。</p>
          </div>
        </div>
      </div>

      {/* ④ 提醒 */}
      <div style={card}>
        <h2 style={h2}>④ 运营必知的两个坑</h2>
        <div style={note}>
          <b style={{ color: '#D4AF37' }}>⚠️ 纯情绪豆订单不发佣：</b>distribute-commission 只在「微信支付成功回调」里触发。纯豆支付不经微信回调 → 不分佣。混合支付（豆+微信）正常发。
        </div>
        <div style={note}>
          <b style={{ color: '#D4AF37' }}>💡 门店想从让利里分到钱：</b>让利池虽由门店让利撑大，但门店锁客不拿佣。门店须让客户通过<b>门店自己的推广码（referral_code）</b>下单，才能以「推广员」身份走 referrer_id 拿到佣金。
        </div>
      </div>
    </div>
  )
}
