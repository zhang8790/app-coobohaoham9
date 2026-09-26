// 配料识别调试 · 总后台工具页
// 在网页版总后台「填写直接调用」百度 OCR 配料表识别引擎：
//   - 粘贴配料表图片 URL，或上传本地照片 → 调 ocr-ingredient({ image_url })
//   - 直接返回：原始 OCR 文字 / 解析配料 / 命中添加剂 / 4 档安全评级 / 风险点
// 设计：image_url 直传模式不落 ingredient_ocr_tasks 任务表（调试结果即返回），仅作运营/排障验证。

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
}
const hintStyle: React.CSSProperties = { color: 'var(--text-dim)', fontSize: 12, margin: '6px 0 0', lineHeight: 1.6 }

type OcrResult = {
  success: boolean
  code?: string
  error?: string
  mode?: string
  raw_text?: string
  parsed_ingredients?: string[]
  matched_additives?: string[]
  safety_grade?: 'S' | 'A' | 'C'
  risk_flags?: string[]
}

const GRADE_COLOR: Record<string, string> = {
  S: '#16A34A',
  A: '#D97706',
  C: '#DC2626',
}
const GRADE_LABEL: Record<string, string> = {
  S: '配料较安全',
  A: '含限量成分',
  C: '含慎用成分',
}

export default function OcrDebug() {
  const [imgUrl, setImgUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [errMsg, setErrMsg] = useState('')

  const runOcr = async () => {
    const url = imgUrl.trim()
    if (!url) {
      setErrMsg('请先填写图片 URL，或上传一张配料表照片')
      return
    }
    setLoading(true)
    setErrMsg('')
    setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('ocr-ingredient', {
        body: { image_url: url },
      })
      if (error) {
        setErrMsg(error.message || '调用识别服务失败')
        return
      }
      const r = data as OcrResult
      if (!r?.success) {
        // 友好错误码原样展示（ocr_oversize / ocr_friendly）
        if (r?.code === 'ocr_oversize' || r?.code === 'ocr_friendly') {
          setErrMsg(r.error || '识别失败')
        } else {
          setErrMsg('识别失败：' + (r?.error || '未知错误'))
        }
        return
      }
      setResult(r)
    } catch (e: any) {
      setErrMsg('调用异常：' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setErrMsg('')
    try {
      const path = `ocr-debug/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path)
      setImgUrl(pub.publicUrl)
    } catch (err: any) {
      setErrMsg('上传失败：' + (err?.message || String(err)) + '（可改为直接粘贴图片 URL）')
    } finally {
      setUploading(false)
    }
  }

  const chip = (text: string, color: string) => (
    <span key={text} style={{
      display: 'inline-block', padding: '4px 10px', margin: '0 6px 6px 0', borderRadius: 999,
      fontSize: 12, background: color + '14', color, border: `1px solid ${color}33`,
    }}>{text}</span>
  )

  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>配料识别调试</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '0 0 20px' }}>
        填写配料表图片 URL，或上传本地照片，直接调用百度 OCR 识别引擎，返回原始文字 / 解析配料 / 命中添加剂 / 安全评级。用于运营与排障验证，调试结果不写入任务表。
      </p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
        {/* 图片 URL */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>图片 URL</label>
          <input
            style={inputStyle}
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) runOcr() }}
            placeholder="https://... 配料表照片地址（http/https）"
          />
          <p style={hintStyle}>支持任意公网可访问的图片地址；也可下方上传后自动填入。</p>
        </div>

        {/* 上传 */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>或上传本地照片</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{
              display: 'inline-block', padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
            }}>
              {uploading ? '上传中…' : '选择图片'}
              <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading}
                style={{ display: 'none' }} />
            </label>
            {imgUrl && (
              <span style={{ color: 'var(--text-dim)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                {imgUrl}
              </span>
            )}
          </div>
          <p style={hintStyle}>上传到 product-images 存储桶后自动回填上方 URL（需该桶公开可读；私有桶请改用直接粘贴 URL）。</p>
        </div>

        {/* 操作 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={runOcr}
            disabled={loading || !imgUrl.trim()}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--primary-strong)', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: (loading || !imgUrl.trim()) ? 'not-allowed' : 'pointer',
              opacity: (loading || !imgUrl.trim()) ? 0.7 : 1,
            }}
          >{loading ? '识别中…' : '识别'}</button>
          {imgUrl && (
            <a href={imgUrl} target="_blank" rel="noreferrer"
              style={{ alignSelf: 'center', color: 'var(--primary)', fontSize: 13 }}>预览图片</a>
          )}
        </div>

        {errMsg && (
          <div style={{
            marginTop: 18, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)',
          }}>{errMsg}</div>
        )}
      </div>

      {/* 结果 */}
      {result && (
        <div style={{ marginTop: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>识别结果</span>
            {result.safety_grade && (
              <span style={{
                padding: '3px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                background: (GRADE_COLOR[result.safety_grade] || '#666') + '14',
                color: GRADE_COLOR[result.safety_grade] || '#666',
                border: `1px solid ${(GRADE_COLOR[result.safety_grade] || '#666')}33`,
              }}>安全评级 {result.safety_grade} · {GRADE_LABEL[result.safety_grade] || ''}</span>
            )}
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>模式：{result.mode === 'url' ? '直传URL' : '任务'}</span>
          </div>

          {/* 原始 OCR 文字 */}
          <div style={{ marginBottom: 16 }}>
            <p style={labelStyle}>原始 OCR 文字</p>
            <pre style={{
              margin: 0, padding: 12, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflowY: 'auto',
            }}>{result.raw_text || '（空）'}</pre>
          </div>

          {/* 解析配料 */}
          <div style={{ marginBottom: 16 }}>
            <p style={labelStyle}>解析配料（{result.parsed_ingredients?.length || 0}）</p>
            <div>{(result.parsed_ingredients && result.parsed_ingredients.length)
              ? result.parsed_ingredients.map((x) => chip(x, '#0EA5E9'))
              : <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>无</span>}</div>
          </div>

          {/* 命中添加剂 */}
          <div style={{ marginBottom: 16 }}>
            <p style={labelStyle}>命中添加剂（{result.matched_additives?.length || 0}）</p>
            <div>{(result.matched_additives && result.matched_additives.length)
              ? result.matched_additives.map((x) => chip(x, '#B8923A'))
              : <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>无（未命中 GB2760 添加剂库）</span>}</div>
          </div>

          {/* 风险点 */}
          <div>
            <p style={labelStyle}>风险点</p>
            <div>{(result.risk_flags && result.risk_flags.length)
              ? result.risk_flags.map((x) => chip(x, '#DC2626'))
              : <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>无</span>}</div>
          </div>
        </div>
      )}
    </div>
  )
}
