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
  media_type?: 'image' | 'video'
  media_url?: string | null
  poster_url?: string | null
  updated_by?: string | null
}

export default function HomeBranding() {
  const [cfg, setCfg] = useState<BrandingConfig>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<'image' | 'video'>('image')
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
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
    setPreviewUrl(value.media_url || null)
    setPreviewType(value.media_type || 'image')
    setPosterUrl(value.poster_url || null)
  }, [])

  useEffect(() => { load() }, [load])

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) {
      alert('请选择图片或视频文件')
      return
    }
    if (isImage && file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB')
      return
    }
    if (isVideo && file.size > 200 * 1024 * 1024) {
      alert('视频大小不能超过 200MB')
      return
    }

    // 本地预览
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
    setPreviewType(isVideo ? 'video' : 'image')

    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || (isImage ? 'jpg' : 'mp4')
      const bucket = isVideo ? 'videos' : BUCKET
      const path = `${FOLDER}/${CONFIG_KEY}_${Date.now()}.${ext}`
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: false })

      if (error) throw error

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
      const publicUrl = urlData?.publicUrl || ''
      setPreviewUrl(publicUrl)
      setPreviewType(isVideo ? 'video' : 'image')
      setCfg(prev => ({ ...prev, media_type: isVideo ? 'video' : 'image', media_url: publicUrl }))
    } catch (err: any) {
      alert('上传失败：' + (err.message || '未知错误'))
      setPreviewUrl(cfg.media_url || null)
      setPreviewType(cfg.media_type || 'image')
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
          media_type: previewType,
          media_url: previewUrl || null,
          poster_url: posterUrl || null,
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
    setPreviewType('image')
    setPosterUrl(null)
    setCfg(prev => ({ ...prev, media_url: null, media_type: 'image', poster_url: null }))
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>首页品牌配置</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '6px 0 0' }}>
          上传图片或视频后，小程序首页「品牌主张区」将自动替换；不填则保持默认渐变。
        </p>
      </div>

      <div style={{ ...card, maxWidth: 560 }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: 20 }}>加载中...</div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                L1 品牌主张区（图片 / 视频）
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
                {previewUrl && previewType === 'video' ? (
                  <video
                    src={previewUrl}
                    poster={posterUrl || undefined}
                    controls
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
                  />
                ) : previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="品牌底图"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
                  />
                ) : null}

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
                建议尺寸：750 × 400 px；图片 JPG/PNG/WebP（≤5MB），视频 MP4（≤200MB）。
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={handlePick}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ ...primaryBtn, opacity: uploading ? 0.7 : 1 }}
              >
                {uploading ? '上传中...' : '上传图片/视频'}
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
