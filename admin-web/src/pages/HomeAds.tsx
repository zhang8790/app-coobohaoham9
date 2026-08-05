import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const card = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const primaryBtn = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
  padding: '9px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
}
const ghostBtn = {
  background: 'transparent', border: '1px solid var(--border-soft)', color: 'var(--text-muted)',
  borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 14,
}

const FOLDER = 'home-ads'
const IMG_BUCKET = 'images'   // 图片素材 + 视频封面
const VID_BUCKET = 'videos'   // 视频素材
const VIDEO_MAX = 200 * 1024 * 1024 // 与 videos 桶上限一致（200MB）

interface HomeAdRow {
  id: string
  media_type: 'image' | 'video'
  media_url: string
  poster_url: string | null
  link_url: string | null
  title: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// 通用上传：返回公开 URL
async function uploadToBucket(file: File, bucket: string, folder: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData?.publicUrl || ''
}

export default function HomeAds() {
  const [ads, setAds] = useState<HomeAdRow[]>([])
  const [loading, setLoading] = useState(true)

  // 新增表单
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<'image' | 'video'>('image')
  const [formFile, setFormFile] = useState<File | null>(null)
  const [formPoster, setFormPoster] = useState<File | null>(null)
  const [formLink, setFormLink] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const posterRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('home_ads')
      .select('*')
      .order('sort_order', { ascending: true })
    setLoading(false)
    if (error) {
      alert('读取广告列表失败：' + error.message)
      return
    }
    setAds((data as HomeAdRow[]) ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  // 启停切换
  const toggleActive = async (row: HomeAdRow) => {
    const { data, error } = await supabase.functions.invoke('admin-home-ads', {
      body: { action: 'update', id: row.id, patch: { is_active: !row.is_active } },
    })
    if (error) { alert('更新失败：' + error.message); return }
    if (data && (data as any).error) { alert('更新失败：' + (data as any).error); return }
    setAds(prev => prev.map(a => a.id === row.id ? { ...a, is_active: !a.is_active } : a))
  }

  // 删除
  const remove = async (row: HomeAdRow) => {
    if (!confirm(`确认删除该广告素材？此操作不可恢复。`)) return
    const { data, error } = await supabase.functions.invoke('admin-home-ads', {
      body: { action: 'delete', id: row.id },
    })
    if (error) { alert('删除失败：' + error.message); return }
    if (data && (data as any).error) { alert('删除失败：' + (data as any).error); return }
    setAds(prev => prev.filter(a => a.id !== row.id))
  }

  // 上移 / 下移（交换 sort_order）
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= ads.length) return
    const a = ads[index]
    const b = ads[target]
    const sa = a.sort_order
    const sb = b.sort_order
    // 先改 a，再改 b（串行，避免唯一约束冲突）
    const u1 = await supabase.functions.invoke('admin-home-ads', { body: { action: 'update', id: a.id, patch: { sort_order: sb } } })
    const u2 = await supabase.functions.invoke('admin-home-ads', { body: { action: 'update', id: b.id, patch: { sort_order: sa } } })
    if (u1.error || u2.error || (u1.data as any)?.error || (u2.data as any)?.error) { alert('排序调整失败'); return }
    const next = [...ads]
    next[index] = { ...a, sort_order: sb }
    next[target] = { ...b, sort_order: sa }
    next.sort((x, y) => x.sort_order - y.sort_order)
    setAds(next)
  }

  // 提交新增
  const submit = async () => {
    if (!formFile) { alert('请先选择素材文件'); return }
    setSaving(true)
    try {
      const bucket = formType === 'image' ? IMG_BUCKET : VID_BUCKET
      const mediaUrl = await uploadToBucket(formFile, bucket, FOLDER)

      let posterUrl: string | null = null
      if (formType === 'video' && formPoster) {
        posterUrl = await uploadToBucket(formPoster, IMG_BUCKET, FOLDER)
      }

      const maxSort = ads.reduce((m, a) => Math.max(m, a.sort_order), 0)
      // 写库走 admin-home-ads Edge Function（service_role 绕过 RLS，避免前端 anon 直插被拦）
      const { data, error } = await supabase.functions.invoke('admin-home-ads', {
        body: {
          action: 'create',
          media_type: formType,
          media_url: mediaUrl,
          poster_url: posterUrl,
          link_url: formLink.trim() || null,
          title: formTitle.trim() || null,
          sort_order: maxSort + 1,
          is_active: true,
        },
      })
      if (error) throw new Error(error.message)
      if (data && (data as any).error) throw new Error((data as any).error)

      alert('添加成功，小程序首页将按顺序排列展示')
      // 重置表单
      setShowForm(false)
      setFormType('image')
      setFormFile(null)
      setFormPoster(null)
      setFormLink('')
      setFormTitle('')
      if (fileRef.current) fileRef.current.value = ''
      if (posterRef.current) posterRef.current.value = ''
      load()
    } catch (err: any) {
      alert('添加失败：' + (err.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (formType === 'image' && !f.type.startsWith('image/')) { alert('请选择图片文件'); return }
    if (formType === 'video') {
      if (!f.type.startsWith('video/')) { alert('请选择视频文件'); return }
      if (f.size > VIDEO_MAX) { alert('视频大小不能超过 200MB'); return }
    }
    setFormFile(f)
  }

  const onPickPoster = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { alert('封面请选择图片'); return }
    setFormPoster(f)
  }

  const thumbStyle: React.CSSProperties = {
    width: 96, height: 64, borderRadius: 8, flexShrink: 0,
    objectFit: 'cover', background: 'var(--border)',
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>首页广告</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '6px 0 0' }}>
            配置小程序首页宣传轮播（图片 / 视频）。启用后按顺序排列，停用则不在首页展示。
          </p>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={primaryBtn}>
          {showForm ? '收起' : '+ 新增广告'}
        </button>
      </div>

      {/* 新增表单 */}
      {showForm && (
        <div style={{ ...card, marginBottom: 20, maxWidth: 640 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <label style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>素材类型</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['image', 'video'] as const).map(t => (
                  <button key={t} onClick={() => { setFormType(t); setFormFile(null) }}
                    style={{
                      ...ghostBtn,
                      background: formType === t ? 'var(--primary-soft)' : 'transparent',
                      color: formType === t ? 'var(--primary)' : 'var(--text-muted)',
                      borderColor: formType === t ? 'var(--primary)' : 'var(--border-soft)',
                    }}>
                    {t === 'image' ? '图片' : '视频'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {formType === 'image' ? '宣传图片' : '宣传视频'}（{formType === 'image' ? 'JPG / PNG / WebP' : 'MP4 等，≤200MB'}）
            </label>
            <input ref={fileRef} type="file" accept={formType === 'image' ? 'image/*' : 'video/*'} style={{ display: 'none' }} onChange={onPickFile} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => fileRef.current?.click()} style={ghostBtn}>选择文件</button>
              {formFile && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{formFile.name}（{(formFile.size / 1024 / 1024).toFixed(1)}MB）</span>}
            </div>
          </div>

          {formType === 'video' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>视频封面（可选，图片）</label>
              <input ref={posterRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickPoster} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => posterRef.current?.click()} style={ghostBtn}>选择封面</button>
                {formPoster && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{formPoster.name}</span>}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>跳转链接（可选）</label>
              <input value={formLink} onChange={e => setFormLink(e.target.value)}
                placeholder="小程序内部路由，如 /pages/xxx/index"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>备注标题（仅后台，不展示）</label>
              <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
                placeholder="便于管理识别"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>取消</button>
            <button onClick={submit} disabled={saving || !formFile} style={{ ...primaryBtn, opacity: (saving || !formFile) ? 0.7 : 1 }}>
              {saving ? '上传中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 列表 */}
      <div style={{ ...card, maxWidth: 860 }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: 20 }}>加载中...</div>
        ) : ads.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
            暂无广告素材，点击右上角「新增广告」上传图片或视频。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ads.map((a, i) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: 12, borderRadius: 10,
                background: a.is_active ? 'var(--surface)' : 'var(--surface-2)',
                border: '1px solid var(--border)',
                opacity: a.is_active ? 1 : 0.6,
              }}>
                {/* 缩略图 */}
                {a.media_type === 'image' ? (
                  <img src={a.media_url} style={thumbStyle} alt="" />
                ) : (
                  <div style={{ ...thumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                    {a.poster_url
                      ? <img src={a.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : <span style={{ color: 'var(--text-muted)', fontSize: 20 }}>▶</span>}
                  </div>
                )}

                {/* 信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: a.media_type === 'image' ? 'var(--primary-soft)' : 'rgba(127,166,151,0.18)',
                      color: a.media_type === 'image' ? 'var(--primary)' : '#5F8A7C',
                    }}>{a.media_type === 'image' ? '图片' : '视频'}</span>
                    {!a.is_active && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>已停用</span>}
                  </div>
                  <p style={{ color: 'var(--text)', fontSize: 13, margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title || '(无备注)'}
                  </p>
                  {a.link_url && <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>跳转：{a.link_url}</p>}
                </div>

                {/* 操作 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...ghostBtn, padding: '4px 8px', opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === ads.length - 1} style={{ ...ghostBtn, padding: '4px 8px', opacity: i === ads.length - 1 ? 0.4 : 1 }}>↓</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => toggleActive(a)} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 12 }}>
                      {a.is_active ? '停用' : '启用'}
                    </button>
                    <button onClick={() => remove(a)} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 12, color: 'var(--danger, #E5484D)', borderColor: 'var(--danger, #E5484D)' }}>删除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
