import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  getEmotionFunnelEvents,
  aggregateEmotionFunnel,
  getStoreProducts,
  type EmotionFunnelSummary,
  type ProductWithEmotion,
} from '@/api/merchant'

const CARD = 'var(--surface-2)'
const BORDER = 'var(--border)'
const muted = 'var(--text-dim)'
const fg = 'var(--text)'

export default function EmotionFunnel() {
  const { profile, useMock } = useAuth()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [days, setDays] = useState<7 | 30>(30)
  const [rows, setRows] = useState<any[]>([])
  const [products, setProducts] = useState<ProductWithEmotion[]>([])
  const [loading, setLoading] = useState(false)

  const isMerchantUser = profile?.merchant_status === 'approved' || profile?.role === 'merchant'

  useEffect(() => {
    if (!profile || !isMerchantUser) return
    if (useMock) { setStoreId(null); return }
    const fetchStore = async () => {
      const { data } = await supabase.from('stores').select('id').eq('owner_id', profile.id).maybeSingle()
      setStoreId(data?.id ?? null)
    }
    fetchStore()
  }, [profile, useMock])

  useEffect(() => {
    if (useMock || !isMerchantUser || !storeId) return
    setLoading(true)
    Promise.all([getEmotionFunnelEvents(storeId, days), getStoreProducts(storeId)])
      .then(([ev, ps]) => { setRows(ev); setProducts(ps) })
      .finally(() => setLoading(false))
  }, [useMock, storeId, days])

  const summary: EmotionFunnelSummary = useMemo(() => aggregateEmotionFunnel(rows), [rows])
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {}
    products.forEach((p) => (m[p.id] = p.name))
    return m
  }, [products])

  if (!isMerchantUser) {
    return <div style={{ color: muted, padding: 40 }}>当前账号无自营门店权限，无法查看情绪漏斗。</div>
  }

  const stages = [
    { key: 'enter', label: '进入情绪之旅', value: summary.enter, color: 'var(--accent)' },
    { key: 'reachedEnd', label: '滑到信任闭环屏', value: summary.reachedEnd, color: 'var(--info)' },
    { key: 'cta', label: '点击「立即拥有」', value: summary.cta, color: 'var(--success-strong)' },
  ]
  const maxVal = Math.max(1, ...stages.map((s) => s.value))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: fg, fontSize: 20, fontWeight: 700, margin: 0 }}>情绪转化漏斗</h2>
          <p style={{ color: muted, fontSize: 13, margin: '4px 0 0' }}>衡量情绪表达有没有真正带动购买（与小程序五屏详情页同源埋点）</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([7, 30] as const).map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: `1px solid ${days === d ? 'var(--accent)' : BORDER}`, background: days === d ? 'var(--border-soft)' : 'transparent', color: days === d ? 'var(--accent-text)' : muted }}>
              近{d}天
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: muted, padding: 40, textAlign: 'center' }}>加载中…</div>
      ) : (
        <>
          {/* 三段漏斗 */}
          <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 20, marginBottom: 16 }}>
            {stages.map((s, i) => (
              <div key={s.key} style={{ marginBottom: i < stages.length - 1 ? 18 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: fg, fontSize: 14 }}>{s.label}</span>
                  <span style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.value} 次</span>
                </div>
                <div style={{ height: 22, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${(s.value / maxVal) * 100}%`, height: '100%', background: s.color, borderRadius: 6, transition: 'width 0.4s' }} />
                </div>
                {i < stages.length - 1 && (
                  <p style={{ color: muted, fontSize: 11, margin: '6px 0 0' }}>
                    转化率 {i === 0 ? summary.enterToEndRate : summary.endToCtaRate}% →
                  </p>
                )}
              </div>
            ))}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: muted, fontSize: 13 }}>整体进入→购买转化率</span>
              <span style={{ color: 'var(--success-strong)', fontSize: 20, fontWeight: 800 }}>{summary.overallRate}%</span>
            </div>
          </div>

          {/* 商品转化榜 */}
          <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 20 }}>
            <p style={{ color: fg, fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>商品情绪转化榜</p>
            {summary.byProduct.length === 0 ? (
              <p style={{ color: muted, fontSize: 13 }}>暂无数据。去小程序商品详情页点「开启情绪之旅」并滑完五屏，即可在此看到真实转化。</p>
            ) : (
              summary.byProduct.map((b) => {
                const m = Math.max(1, b.enter, b.reachedEnd, b.cta)
                return (
                  <div key={b.productId} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: fg, fontSize: 13 }}>{nameMap[b.productId] || '未知商品'}</span>
                      <span style={{ color: 'var(--success-strong)', fontSize: 12 }}>购买 {b.cta}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[
                        { v: b.enter, c: 'var(--accent)' },
                        { v: b.reachedEnd, c: 'var(--info)' },
                        { v: b.cta, c: 'var(--success-strong)' },
                      ].map((seg, si) => (
                        <div key={si} style={{ flex: seg.v / m, minWidth: 4, height: 8, background: seg.c, borderRadius: 2 }} />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
