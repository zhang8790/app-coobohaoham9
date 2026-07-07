// @title 商家中心 - 优惠券管理（真实数据）
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMyMerchantStore, getMerchantCoupons, createMerchantCoupon, updateCouponStatus, deleteCoupon,
} from '@/api/merchant'
import type { MerchantCoupon } from '@/types'

const STATUS_LABEL: Record<string, string> = { active: '生效中', draft: '草稿', paused: '已暂停', expired: '已过期' }
const STATUS_COLOR: Record<string, string> = { active: '#059669', draft: '#6B7280', paused: '#F59E0B', expired: '#9CA3AF' }

export default function MerchantCoupons() {
  const { profile } = useAuth()
  const [coupons, setCoupons] = useState<MerchantCoupon[]>([])
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'paused' | 'expired'>('all')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: '', discount_type: 'amount', discount_value: 5, min_amount: 0, total: 100, start_date: '', end_date: '',
  })

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      const store = await getMyMerchantStore(profile.id)
      if (cancelled) return
      if (!store) { setLoading(false); return }
      setStoreId(store.id)
      const list = await getMerchantCoupons(store.id).catch(() => [])
      if (!cancelled) { setCoupons(list); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [profile])

  const filtered = filter === 'all' ? coupons : coupons.filter(c => c.status === filter)

  const reload = async () => {
    if (!storeId) return
    const list = await getMerchantCoupons(storeId).catch(() => [])
    setCoupons(list)
  }

  const handleCreate = async () => {
    if (!storeId || !profile) return
    if (!form.title.trim()) { alert('请输入优惠券名称'); return }
    if (!form.start_date || !form.end_date) { alert('请选择生效日期'); return }
    setSubmitting(true)
    try {
      await createMerchantCoupon(storeId, profile.id, {
        title: form.title,
        discount_type: form.discount_type as 'amount' | 'percent',
        discount_value: Number(form.discount_value),
        min_amount: Number(form.min_amount),
        total: Number(form.total),
        start_date: form.start_date,
        end_date: form.end_date,
      })
      await reload()
      setShowCreate(false)
      setForm({ title: '', discount_type: 'amount', discount_value: 5, min_amount: 0, total: 100, start_date: '', end_date: '' })
      alert('创建成功！')
    } catch (e: any) {
      alert('创建失败：' + (e?.message || e))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStatus = async (c: MerchantCoupon) => {
    const next = c.status === 'active' ? 'paused' : 'active'
    try {
      await updateCouponStatus(c.id, next)
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, status: next as MerchantCoupon['status'] } : x))
    } catch (e: any) { alert('操作失败：' + (e?.message || e)) }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除该优惠券？')) return
    try {
      await deleteCoupon(id)
      setCoupons(prev => prev.filter(x => x.id !== id))
    } catch (e: any) { alert('删除失败：' + (e?.message || e)) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700 }}>🎟️ 优惠券管理</h2>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!storeId}
          style={{ padding: '10px 20px', background: storeId ? '#059669' : '#374151', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: storeId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span>+</span> 新建优惠券
        </button>
      </div>

      {!storeId && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#6B7280', fontSize: 14 }}>未找到关联门店，请先在「店铺设置」完善门店信息</div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>加载中…</div>}

      {!loading && storeId && (
        <>
          {/* 筛选 Tab */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: '全部' },
              { key: 'active', label: '生效中' },
              { key: 'draft', label: '草稿' },
              { key: 'paused', label: '已暂停' },
              { key: 'expired', label: '已过期' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                style={{
                  padding: '6px 14px',
                  background: filter === tab.key ? '#059669' : '#111827',
                  border: `1px solid ${filter === tab.key ? '#059669' : '#1F2937'}`,
                  borderRadius: 6,
                  color: filter === tab.key ? 'white' : '#9CA3AF',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6B7280', fontSize: 14 }}>暂无优惠券，点击右上角新建</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filtered.map(coupon => (
                <div key={coupon.id} style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    padding: '4px 12px',
                    background: STATUS_COLOR[coupon.status] || '#374151',
                    borderBottomLeftRadius: 8,
                    color: 'white', fontSize: 12, fontWeight: 600,
                  }}>
                    {STATUS_LABEL[coupon.status] || coupon.status}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                    <div style={{
                      width: 80, height: 80,
                      background: coupon.status === 'active' ? 'linear-gradient(135deg, #C2410C, #EA580C)' : '#1F2937',
                      borderRadius: 12,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ color: 'white', fontSize: 10, fontWeight: 600 }}>¥</span>
                      <span style={{ color: 'white', fontSize: 28, fontWeight: 800 }}>{coupon.discount_value}</span>
                    </div>
                    <div>
                      <p style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700 }}>{coupon.title}</p>
                      <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
                        {coupon.discount_type === 'amount' ? '满减券' : '折扣券'}
                        {coupon.min_amount > 0 && ` · 满${coupon.min_amount}元可用`}
                      </p>
                      <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                        {coupon.start_date || '—'} ~ {coupon.end_date || '—'}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid #1F2937', borderBottom: '1px solid #1F2937', marginBottom: 12 }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <p style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700 }}>{coupon.total}</p>
                      <p style={{ color: '#6B7280', fontSize: 12 }}>发放总量</p>
                    </div>
                    <div style={{ width: 1, background: '#1F2937' }} />
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <p style={{ color: '#059669', fontSize: 18, fontWeight: 700 }}>{coupon.claimed_count}</p>
                      <p style={{ color: '#6B7280', fontSize: 12 }}>已领取</p>
                    </div>
                    <div style={{ width: 1, background: '#1F2937' }} />
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <p style={{ color: '#C2410C', fontSize: 18, fontWeight: 700 }}>{coupon.total - coupon.claimed_count}</p>
                      <p style={{ color: '#6B7280', fontSize: 12 }}>剩余</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => toggleStatus(coupon)}
                      style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9CA3AF', fontSize: 13, cursor: 'pointer' }}
                    >
                      {coupon.status === 'active' ? '下架' : '上架'}
                    </button>
                    <button
                      onClick={() => handleDelete(coupon.id)}
                      style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid #EF4444', borderRadius: 6, color: '#EF4444', fontSize: 13, cursor: 'pointer' }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 创建优惠券弹窗 */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreate(false)}>
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 16, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#E5E7EB', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>🎟️ 创建优惠券</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>优惠券名称 *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="如：新客立减5元" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>优惠类型</label>
                  <select value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })} style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}>
                    <option value="amount">满减券</option>
                    <option value="percent">折扣券</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>优惠金额/折扣 *</label>
                  <input type="number" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: Number(e.target.value) })} placeholder="如：5（元）或 10（9折）" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>最低消费（元，0=无门槛）</label>
                <input type="number" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: Number(e.target.value) })} placeholder="0" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>发放数量 *</label>
                <input type="number" value={form.total} onChange={e => setForm({ ...form, total: Number(e.target.value) })} placeholder="如：100" style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>开始日期</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>结束日期</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #374151', borderRadius: 8, color: '#9CA3AF', fontSize: 14, cursor: 'pointer' }}>取消</button>
              <button onClick={handleCreate} disabled={submitting} style={{ flex: 1, padding: '10px', background: submitting ? '#374151' : '#059669', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? '提交中…' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
