// @title 商家中心 - 店铺设置
import { useState } from 'react'

const MOCK_STORE = {
  name: '桂花糕老铺',
  description: '传承百年手工技艺，每一口都是儿时的味道',
  category: '餐饮',
  phone: '13800138000',
  contact: '张老板',
  address: '浙江省杭州市西湖区河坊街123号',
  is_open: true,
  open_time: '08:00',
  close_time: '20:00',
  delivery_enabled: true,
  pickup_enabled: true,
  delivery_radius: 3,
  delivery_fee: 2,
  free_delivery_threshold: 30,
  min_order_amount: 20,
  announcement: '欢迎光临桂花糕老铺！每日新鲜手工制作，欢迎到店品尝～',
  cover_url: '',
  logo_url: '',
}

export default function MerchantSettings() {
  const [form, setForm] = useState(MOCK_STORE)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }, 1000)
  }

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div>
      <h2 style={{ color: '#E5E7EB', fontSize: 24, fontWeight: 700, marginBottom: 24 }}>🏯 店铺设置</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* 左侧：基本信息 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 店铺形象 */}
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>店铺形象</h3>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>封面图</p>
                <div style={{ width: 160, height: 100, background: '#1F2937', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed #374151' }}>
                  <span style={{ color: '#6B7280', fontSize: 13 }}>点击上传</span>
                </div>
              </div>
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>店铺Logo</p>
                <div style={{ width: 100, height: 100, background: '#1F2937', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed #374151' }}>
                  <span style={{ color: '#6B7280', fontSize: 13 }}>上传</span>
                </div>
              </div>
            </div>
          </div>

          {/* 基本信息 */}
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>基本信息</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>店铺名称 *</label>
                <input
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>店铺简介</label>
                <textarea
                  value={form.description}
                  onChange={e => updateField('description', e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none', resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>主营类目 *</label>
                <select
                  value={form.category}
                  onChange={e => updateField('category', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                >
                  <option value="餐饮">餐饮</option>
                  <option value="零售">零售</option>
                  <option value="服务">服务</option>
                  <option value="娱乐">娱乐</option>
                  <option value="其他">其他</option>
                </select>
              </div>
            </div>
          </div>

          {/* 联系信息 */}
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>联系信息</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>联系电话 *</label>
                <input
                  value={form.phone}
                  onChange={e => updateField('phone', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>联系人</label>
                <input
                  value={form.contact}
                  onChange={e => updateField('contact', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>店铺地址</label>
                <input
                  value={form.address}
                  onChange={e => updateField('address', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：营业设置 + 双通道配置 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 营业设置 */}
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>营业设置</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#E5E7EB', fontSize: 14 }}>营业状态</span>
                <div
                  onClick={() => updateField('is_open', !form.is_open)}
                  style={{ width: 48, height: 28, background: form.is_open ? '#059669' : '#374151', borderRadius: 14, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  <div style={{ width: 22, height: 22, background: 'white', borderRadius: 11, position: 'absolute', top: 3, transition: 'left 0.2s', left: form.is_open ? 23 : 3 }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>开始时间</label>
                  <input
                    type="time"
                    value={form.open_time}
                    onChange={e => updateField('open_time', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#9CA3AF', fontSize: 13, display: 'block', marginBottom: 6 }}>结束时间</label>
                  <input
                    type="time"
                    value={form.close_time}
                    onChange={e => updateField('close_time', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 双通道配置 */}
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🚚 双通道配置</h3>

            {/* 外卖配送 */}
            <div style={{ marginBottom: 20, padding: '16px', background: '#0B0F19', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>外卖配送</p>
                  <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>支持送到客户地址</p>
                </div>
                <div
                  onClick={() => updateField('delivery_enabled', !form.delivery_enabled)}
                  style={{ width: 48, height: 28, background: form.delivery_enabled ? '#059669' : '#374151', borderRadius: 14, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  <div style={{ width: 22, height: 22, background: 'white', borderRadius: 11, position: 'absolute', top: 3, transition: 'left 0.2s', left: form.delivery_enabled ? 23 : 3 }} />
                </div>
              </div>
              {form.delivery_enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, display: 'block', marginBottom: 4 }}>配送范围（km）</label>
                    <input
                      type="number"
                      value={form.delivery_radius}
                      onChange={e => updateField('delivery_radius', parseInt(e.target.value) || 3)}
                      style={{ width: '100%', padding: '8px 10px', background: '#111827', border: '1px solid #374151', borderRadius: 6, color: '#E5E7EB', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, display: 'block', marginBottom: 4 }}>配送费（元）</label>
                    <input
                      type="number"
                      value={form.delivery_fee}
                      onChange={e => updateField('delivery_fee', parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '8px 10px', background: '#111827', border: '1px solid #374151', borderRadius: 6, color: '#E5E7EB', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, display: 'block', marginBottom: 4 }}>满额免配送费</label>
                    <input
                      type="number"
                      value={form.free_delivery_threshold}
                      onChange={e => updateField('free_delivery_threshold', parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '8px 10px', background: '#111827', border: '1px solid #374151', borderRadius: 6, color: '#E5E7EB', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, display: 'block', marginBottom: 4 }}>起送价（元）</label>
                    <input
                      type="number"
                      value={form.min_order_amount}
                      onChange={e => updateField('min_order_amount', parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '8px 10px', background: '#111827', border: '1px solid #374151', borderRadius: 6, color: '#E5E7EB', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 到店自取 */}
            <div style={{ padding: '16px', background: '#0B0F19', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>到店自取</p>
                  <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>客户到店取货</p>
                </div>
                <div
                  onClick={() => updateField('pickup_enabled', !form.pickup_enabled)}
                  style={{ width: 48, height: 28, background: form.pickup_enabled ? '#059669' : '#374151', borderRadius: 14, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  <div style={{ width: 22, height: 22, background: 'white', borderRadius: 11, position: 'absolute', top: 3, transition: 'left 0.2s', left: form.pickup_enabled ? 23 : 3 }} />
                </div>
              </div>
            </div>
          </div>

          {/* 店铺公告 */}
          <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: 20 }}>
            <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>店铺公告</h3>
            <textarea
              value={form.announcement}
              onChange={e => updateField('announcement', e.target.value)}
              rows={4}
              placeholder="请输入店铺公告..."
              style={{ width: '100%', padding: '10px 12px', background: '#0B0F19', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB', fontSize: 14, outline: 'none', resize: 'vertical' }}
            />
          </div>
        </div>
      </div>

      {/* 保存按钮 */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        {saved && <span style={{ color: '#059669', fontSize: 14, display: 'flex', alignItems: 'center' }}>✅ 保存成功</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '12px 32px', background: saving ? '#374151' : '#059669', border: 'none', borderRadius: 8, color: 'white', fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
