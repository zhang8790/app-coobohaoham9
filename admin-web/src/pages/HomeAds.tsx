import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CONFIG_KEY = 'home_ad_slots'
const BUCKET = 'images'
const FOLDER = 'site-configs'

interface AdSlot {
  id: string
  title: string
  image_url: string | null
  link_url: string
  sort_order: number
  enabled: boolean
}

const emptySlot = (): AdSlot => ({
  id: `s_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
  title: '',
  image_url: null,
  link_url: '',
  sort_order: 0,
  enabled: true,
})

const card = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const primaryBtn = {
  background: 'var(--primary-strong)', color: '#fff', border: 'none', borderRadius: 8,
  padding: '9px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
}
const ghostBtn = {
  background: 'transparent', border: '1px solid var(--border-soft)', color: 'var(--text-muted)',
  borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 14,
}

export default function HomeAds() {
  const [slots, setSlots] = useState<AdSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('site_configs')
      .select('value')
      .eq('key', CONFIG_KEY)
      .maybeSingle()
    setLoading(false)
    if (error) { alert('读取配置失败：' + error.message); return }
    const val = (data?.value as { slots?: AdSlot[] }) || {}
    setSlots(Array.isArray(val.slots) ? val.slots : [])
  }, [])

  useEffect(() => { load() }, [load])

  const updateSlot = (id: string, patch: Partial<AdSlot>) =>
    setSlots(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))

  const handleAdd = () => setSlots(prev => [...prev, emptySlot()])

  const handleDelete = (id: string) => setSlots(prev => prev.filter(s => s.id !== id))

  const handlePick = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return }
    if (file.size > 5 * 1024 * 1024) { alert('图片大小不能超过 5MB'); return }
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${FOLDER}/${CONFIG_KEY}_${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
      updateSlot(id, { image_url: urlData?.publicUrl || '' })
    } catch (err: any) {
      alert('上传失败：' + (err.message || '未知错误'))
    } finally {
      const ref = fileRefs.current[id]
      if (ref) ref.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const ordered = [...slots]
      .map((s, i) => ({ ...s, sort_order: i }))
      .sort((a, b) => a.sort_order - b.sort_order)
    const { error } = await supabase
      .from('site_configs')
      .upsert({ key: CONFIG_KEY, value: { slots: ordered }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setSaving(false)
    if (error) { alert('保存失败：' + error.message); return }
    alert('保存成功，小程序端下次进入首页即可看到广告位')
    load()
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>首页广告位（轮播）</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '6px 0 0' }}>
          首页顶部轮播位是首页唯一的广告曝光位。启用中的广告会替换小程序首页的默认轮播图；
          未配置或全部停用时，回退展示品牌内置轮播卡（无促销、无销量类社会证明文案）。
          <br />
          跳转链接：站内填 <code>/pages/...</code> 内页路径；外链填 <code>https://</code>（外链域名需先在小程序后台「业务域名」校验通过，否则会显示空白页）。
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 20 }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {slots.length === 0 && (
            <div style={{ ...card, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
              暂无广告位，点击下方「新增广告位」开始配置。
            </div>
          )}
          {slots.map((s, idx) => (
            <div key={s.id} style={{ ...card }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>广告位 #{idx + 1}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={s.enabled} onChange={e => updateSlot(s.id, { enabled: e.target.checked })} />
                  启用
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16 }}>
                {/* 图片上传 / 预览 */}
                <div>
                  <div
                    style={{
                      width: 160, height: 90, borderRadius: 10, border: '1px dashed var(--border-soft)',
                      background: s.image_url
                        ? `url(${s.image_url}) center/cover`
                        : 'linear-gradient(135deg, #4CC2A0 0%, #1F9D6B 100%)',
                      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 6, overflow: 'hidden',
                    }}
                  >
                    {s.image_url && (
                      <button onClick={() => updateSlot(s.id, { image_url: null })}
                        style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>
                        移除
                      </button>
                    )}
                  </div>
                  <input ref={el => { fileRefs.current[s.id] = el }} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePick(s.id, e)} />
                  <button onClick={() => fileRefs.current[s.id]?.click()} style={{ ...ghostBtn, width: '100%', marginTop: 8 }}>上传图片</button>
                  <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: '6px 0 0' }}>建议 686 × 208 px（约 3.3:1，与首页轮播位比例一致）</p>
                </div>

                {/* 文本字段 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>标题</label>
                    <input value={s.title} onChange={e => updateSlot(s.id, { title: e.target.value })} placeholder="如：当季食养礼盒"
                      style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>跳转链接</label>
                    <input value={s.link_url} onChange={e => updateSlot(s.id, { link_url: e.target.value })} placeholder="站内页面 /pages/xxx 或 外链 https://"
                      style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                  </div>
                  <button onClick={() => handleDelete(s.id)} style={{ ...ghostBtn, alignSelf: 'flex-start', color: 'var(--danger)' }}>删除此广告位</button>
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={handleAdd} style={ghostBtn}>＋ 新增广告位</button>
            <button onClick={load} disabled={loading || saving} style={ghostBtn}>刷新</button>
            <button onClick={handleSave} disabled={saving} style={{ ...primaryBtn, marginLeft: 'auto' }}>
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
