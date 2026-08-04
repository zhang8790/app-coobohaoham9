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

const CONFIG_KEY = 'home_brand_hero_bg'
const BUCKET = 'images'
const FOLDER = 'site-configs'

interface BrandingConfig {
  image_url?: string | null
  alt?: string
  updated_by?: string | null
}

export default function HomeBranding() {
  const [cfg, setCfg] = useState<BrandingConfig>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('site_configs')
      .select('value')
      .eq('key', CONFIG_KEY)
      .maybeSingle()
    setLoading(false)
    if (error) {
      alert('读取配置失败：' + error.message)
      return
    }
    const value = (data?.value as BrandingConfig) || {}
    setCfg(value)
    setPreviewUrl(value.image_url || null)
  }, [])

  useEffect(() => { load() }, [load])

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 只接受图片
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB')
      return
    }

    // 本地预览
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)

    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${FOLDER}/${CONFIG_KEY}_${Date.now()}.${ext}`
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })

      if (error) throw error

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
      const publicUrl = urlData?.publicUrl || ''
      setPreviewUrl(publicUrl)
      setCfg(prev => ({ ...prev, image_url: publicUrl }))
    } catch (err: any) {
      alert('上传失败：' + (err.message || '未知错误'))
      setPreviewUrl(cfg.image_url || null)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('site_configs')
      .update({
        value: {
          ...cfg,
          image_url: previewUrl || null,
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('key', CONFIG_KEY)
    setSaving(false)
    if (error) {
      alert('保存失败：' + error.message)
      return
    }
    alert('保存成功，小程序端下次进入首页即可看到新底图')
    load()
  }

  const handleRemove = () => {
    setPreviewUrl(null)
    setCfg(prev => ({ ...prev, image_url: null }))
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>首页品牌配置</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '6px 0 0' }}>
          上传底图后，小程序首页「品牌主张区」将自动替换背景；不填则保持默认渐变。
        </p>
      </div>

      <div style={{ ...card, maxWidth: 560 }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: 20 }}>加载中...</div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                L1 品牌主张区底图
              </label>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '343 / 184',
                  borderRadius: 12,
                  border: '1px dashed var(--border-soft)',
                  background: previewUrl
                    ? `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.45)), url(${previewUrl}) center/cover`
                    : 'linear-gradient(135deg, hsl(152 24% 38%) 0%, hsl(19 57% 42%) 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  padding: 20,
                  color: '#fff',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: 12, letterSpacing: 2, opacity: 0.9 }}>顺时而食 · 智慧食养零售</span>
                <span style={{ fontSize: 22, fontWeight: 800, marginTop: 6, lineHeight: 1.25 }}>不只是零食</span>
                <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25 }}>是懂你身体的好物</span>
                <span style={{ fontSize: 12, opacity: 0.9, marginTop: 8, maxWidth: 280, lineHeight: 1.5 }}>
                  用 AI 食养引擎解读每一口成分，把"吃什么对身体好"变成可执行的日常选择。
                </span>

                {previewUrl && (
                  <button
                    onClick={handleRemove}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      background: 'rgba(0,0,0,0.45)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    移除底图
                  </button>
                )}
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '8px 0 0' }}>
                建议尺寸：750 × 400 px；格式 JPG / PNG / WebP；大小 ≤ 5MB。
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePick}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ ...primaryBtn, opacity: uploading ? 0.7 : 1 }}
              >
                {uploading ? '上传中...' : '上传新底图'}
              </button>
              <button onClick={handleRemove} style={ghostBtn}>恢复默认渐变</button>
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <button onClick={load} disabled={loading || saving} style={ghostBtn}>刷新</button>
              <button onClick={handleSave} disabled={saving} style={primaryBtn}>
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
