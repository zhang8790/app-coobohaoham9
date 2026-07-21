// @title 商家中心 - 营销活动管理（真实数据）
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getMyMerchantStore, getMerchantCampaigns, createCampaign, updateCampaignStatus } from '@/api/merchant'
import type { MarketingCampaign } from '@/types'

const STATUS_LABEL: Record<string, string> = { active: '进行中', paused: '已暂停', ended: '已结束' }
const STATUS_COLOR: Record<string, string> = { active: 'var(--success-strong)', paused: 'var(--warning)', ended: 'var(--text-dim)' }
const TYPE_LABEL: Record<string, string> = { redpacket: '现金红包', physical: '实物礼品' }

export default function MerchantAds() {
  const { profile } = useAuth()
  const [ads, setAds] = useState<MarketingCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'ended'>('all')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    campaign_name: '', campaign_type: 'redpacket', gift_name: '现金红包',
    gift_value: 5, total_limit: 100, daily_limit: 10, start_date: '', end_date: '', commission_rate: 10,
  })

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const store = await getMyMerchantStore(profile.id)
      if (cancelled) return
      if (!store) { setLoading(false); return }
      setStoreId(store.id)
      const list = await getMerchantCampaigns(store.id).catch(() => [])
      if (!cancelled) { setAds(list); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [profile])

  const filtered = filter === 'all' ? ads : ads.filter(a => a.status === filter)
  const runningCount = ads.filter(a => a.status === 'active').length
  const totalClaimed = ads.reduce((s, a) => s + a.claimed_count, 0)

  const reload = async () => { if (storeId) setAds(await getMerchantCampaigns(storeId).catch(() => [])) }

  const handleCreate = async () => {
    if (!storeId) return
    if (!form.campaign_name.trim()) { alert('请输入活动名称'); return }
    if (!form.start_date || !form.end_date) { alert('请选择活动日期'); return }
    setSubmitting(true)
    try {
      await createCampaign(storeId, {
        campaign_name: form.campaign_name,
        campaign_type: form.campaign_type as 'redpacket' | 'physical',
        gift_name: form.gift_name,
        gift_value: Number(form.gift_value),
        total_limit: Number(form.total_limit),
        daily_limit: Number(form.daily_limit),
        start_date: form.start_date,
        end_date: form.end_date,
        commission_rate: Number(form.commission_rate) / 100,
      })
      await reload()
      setShowCreate(false)
      setForm({ campaign_name: '', campaign_type: 'redpacket', gift_name: '现金红包', gift_value: 5, total_limit: 100, daily_limit: 10, start_date: '', end_date: '', commission_rate: 10 })
      alert('创建成功！')
    } catch (e: any) { alert('创建失败：' + (e?.message || e)) }
    finally { setSubmitting(false) }
  }

  const setStatus = async (a: MarketingCampaign, status: string) => {
    try {
      await updateCampaignStatus(a.id, status)
      setAds(prev => prev.map(x => x.id === a.id ? { ...x, status: status as MarketingCampaign['status'] } : x))
    } catch (e: any) { alert('操作失败：' + (e?.message || e)) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700 }}>营销活动</h2>
        <button onClick={() => setShowCreate(true)} disabled={!storeId} style={{ padding: '10px 20px', background: storeId ? 'var(--primary)' : 'var(--border-soft)', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: storeId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}><span>+</span> 新建活动</button>
      </div>

      {!storeId && !loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>未找到关联门店</div>}
      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>加载中…</div>}

      {!loading && storeId && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>进行中活动</p>
              <p style={{ color: 'var(--success-strong)', fontSize: 28, fontWeight: 800 }}>{runningCount}</p>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>累计已领取</p>
              <p style={{ color: 'var(--primary)', fontSize: 28, fontWeight: 800 }}>{totalClaimed}</p>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>活动总数</p>
              <p style={{ color: 'var(--info)', fontSize: 28, fontWeight: 800 }}>{ads.length}</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[{ key: 'all', label: '全部' }, { key: 'active', label: '进行中' }, { key: 'paused', label: '已暂停' }, { key: 'ended', label: '已结束' }].map(tab => (
              <button key={tab.key} onClick={() => setFilter(tab.key as any)} style={{
                padding: '6px 14px',
                background: filter === tab.key ? 'var(--primary)' : 'var(--surface-2)',
                border: `1px solid ${filter === tab.key ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 6,
                color: filter === tab.key ? 'white' : 'var(--text-muted)',
                fontSize: 13,
                cursor: 'pointer',
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 14 }}>暂无营销活动，点击右上角新建</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(ad => (
                <div key={ad.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ color: STATUS_COLOR[ad.status] || 'var(--text-dim)', fontSize: 12, fontWeight: 600, padding: '2px 8px', background: `${STATUS_COLOR[ad.status] || 'var(--text-dim)'}20`, borderRadius: 4 }}>{STATUS_LABEL[ad.status] || ad.status}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{TYPE_LABEL[ad.campaign_type] || ad.campaign_type}</span>
                      </div>
                      <p style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>{ad.campaign_name}</p>
                      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>{ad.start_date} ~ {ad.end_date}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {ad.status === 'active' && <button onClick={() => setStatus(ad, 'paused')} style={{ padding: '6px 12px', background: 'var(--warning)20', border: '1px solid var(--warning)', borderRadius: 6, color: 'var(--warning)', fontSize: 12, cursor: 'pointer' }}>暂停</button>}
                      {ad.status === 'paused' && <button onClick={() => setStatus(ad, 'active')} style={{ padding: '6px 12px', background: 'var(--success-strong)20', border: '1px solid var(--success-strong)', borderRadius: 6, color: 'var(--success-strong)', fontSize: 12, cursor: 'pointer' }}>重启</button>}
                      {ad.status !== 'ended' && <button onClick={() => setStatus(ad, 'ended')} style={{ padding: '6px 12px', background: 'var(--danger)20', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', fontSize: 12, cursor: 'pointer' }}>结束</button>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {[
                      { label: '礼品价值', value: `¥${ad.gift_value}` },
                      { label: '发放总量', value: String(ad.total_limit) },
                      { label: '已领取', value: String(ad.claimed_count) },
                      { label: '佣金比例', value: `${ad.commission_rate * 100}%` },
                    ].map((d, i) => (
                      <div key={i} style={{ textAlign: 'center', padding: '8px', background: 'var(--bg)', borderRadius: 8 }}>
                        <p style={{ color: 'var(--text-dim)', fontSize: 11 }}>{d.label}</p>
                        <p style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>{d.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 创建活动弹窗 */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreate(false)}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>新建营销活动</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>活动名称 *</label>
                <input value={form.campaign_name} onChange={e => setForm({ ...form, campaign_name: e.target.value })} placeholder="如：进店有喜红包" style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>活动类型</label>
                  <select value={form.campaign_type} onChange={e => { const t = e.target.value; setForm({ ...form, campaign_type: t, gift_name: t === 'redpacket' ? '现金红包' : '' }) }} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}>
                    <option value="redpacket">现金红包</option>
                    <option value="physical">实物礼品</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>礼品名称</label>
                  <input value={form.gift_name} onChange={e => setForm({ ...form, gift_name: e.target.value })} placeholder="如：现金红包 / 定制帆布袋" style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>礼品价值（元）</label>
                  <input type="number" value={form.gift_value} onChange={e => setForm({ ...form, gift_value: Number(e.target.value) })} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>佣金比例（%）</label>
                  <input type="number" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: Number(e.target.value) })} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>发放总数</label>
                  <input type="number" value={form.total_limit} onChange={e => setForm({ ...form, total_limit: Number(e.target.value) })} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>每日限领</label>
                  <input type="number" value={form.daily_limit} onChange={e => setForm({ ...form, daily_limit: Number(e.target.value) })} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>开始日期</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 6 }}>结束日期</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={handleCreate} disabled={submitting} style={{ flex: 1, padding: '10px', background: submitting ? 'var(--border-soft)' : 'var(--primary)', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? '提交中…' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
