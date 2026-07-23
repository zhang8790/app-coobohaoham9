import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getStoreProducts, type ProductWithEmotion } from '@/api/merchant'
import {
  EMOTION_DIMENSION_TAGS,
  EMOTION_DIMENSION_ORDER,
  EMOTION_DIMENSION_LABELS,
  EMOTION_DIMENSION_MAX,
  scoreCompilation,
  localCompileEmotion,
  type ScoreResult,
} from '@/utils/emotion'
import {
  SHIYANG_CATEGORIES,
  SHIYANG_DIMENSION_KEY,
  SHIYANG_DIMENSION_LABEL,
  SHIYANG_DIMENSION_MAX,
  generateShiyangCopy,
  toShiyangTags,
} from '@/utils/shiyang'

const CARD = 'var(--surface-2)'
const BORDER = 'var(--border)'
const muted = 'var(--text-dim)'
const fg = 'var(--text)'

export default function EmotionStudio() {
  const { profile, useMock } = useAuth()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductWithEmotion[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Partial<Record<string, string[]>>>({})
  const [saving, setSaving] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  // 食养成分打标（与小程序端共用 product_emotion.shiyang_tags / shiyang_copy 同一 DB 列）
  const [shiyangDims, setShiyangDims] = useState<string[]>([])
  const [shiyangCopy, setShiyangCopy] = useState<string>('')

  const isMerchantUser = profile?.merchant_status === 'approved' || profile?.role === 'merchant'

  // 解析本商家门店
  useEffect(() => {
    if (!profile || !isMerchantUser) return
    if (useMock) { setStoreId(null); return }
    const fetchStore = async () => {
      const { data } = await supabase
        .from('stores').select('id').eq('owner_id', profile.id).maybeSingle()
      setStoreId(data?.id ?? null)
    }
    fetchStore()
  }, [profile, useMock])

  // 加载门店商品
  useEffect(() => {
    if (useMock || !isMerchantUser || !storeId) { setProducts([]); return }
    getStoreProducts(storeId).then((list) => {
      setProducts(list)
      if (list.length && !activeId) {
        setActiveId(list[0].id)
        hydrate(list[0])
      }
    })
  }, [useMock, storeId])

  const active = products.find((p) => p.id === activeId) || null

  // 选中商品时回填已编译的五维标签
  function hydrate(p: ProductWithEmotion) {
    const tags = p.product_emotion?.dimension_tags
    setSelected(tags && Object.keys(tags).length ? tags : {})
    setResult(
      p.product_emotion?.emotion_title
        ? { title: p.product_emotion.emotion_title, detail: p.product_emotion.emotion_detail || '' }
        : null,
    )
    const sy = p.product_emotion?.shiyang_tags?.[SHIYANG_DIMENSION_KEY] || []
    setShiyangDims(sy)
    setShiyangCopy(p.product_emotion?.shiyang_copy || (sy.length ? generateShiyangCopy({ ingredients: sy }).cardDetail : ''))
  }

  function toggleTag(dim: string, zh: string) {
    setSelected((prev) => {
      const cur = prev[dim] ? [...prev[dim]!] : []
      const idx = cur.indexOf(zh)
      if (idx >= 0) cur.splice(idx, 1)
      else if (cur.length < EMOTION_DIMENSION_MAX) cur.push(zh)
      return { ...prev, [dim]: cur }
    })
  }

  // 食养成分标签切换（最多 SHIYANG_DIMENSION_MAX 个，切换后自动生成文案）
  function toggleShiyangTag(zh: string) {
    const on = shiyangDims.includes(zh)
    if (!on && shiyangDims.length >= SHIYANG_DIMENSION_MAX) {
      setFlash(`最多选 ${SHIYANG_DIMENSION_MAX} 个食材`)
      setTimeout(() => setFlash(null), 3000)
      return
    }
    const next = on ? shiyangDims.filter((t) => t !== zh) : [...shiyangDims, zh]
    setShiyangDims(next)
    setShiyangCopy(next.length ? generateShiyangCopy({ ingredients: next }).cardDetail : '')
  }

  // 实时评分
  const score: ScoreResult = useMemo(() => {
    const copy = result?.detail || active?.description || ''
    const sceneBound = (selected.scene || []).length > 0
    const claimVerifiable = (selected.emotion || []).length > 0 && (selected.identity || []).length > 0
    const hasFunctionInfo = !!active?.description && (active.description.length > 6 || /\d/.test(active.description))
    return scoreCompilation({
      tagDimensions: selected,
      copyText: copy,
      hasFunctionInfo,
      sceneBound,
      claimVerifiable,
      sceneManualScore: undefined,
    })
  }, [selected, result, active])

  const tierText =
    score.tier === 'recommend' ? '✅ 推荐可得流量' : score.tier === 'shopOnly' ? ' 仅店内推荐' : ' 驳回'
  const tierColor = score.tier === 'recommend' ? 'var(--success-strong)' : score.tier === 'shopOnly' ? 'var(--warning)' : 'var(--danger)'

  async function handleCompile() {
    if (!active) return
    setCompiling(true)
    try {
      const { data, error } = await supabase.functions.invoke('emotion-compile', {
        body: {
          mode: 'compile',
          product_id: useMock ? undefined : active.id,
          name: active.name,
          description: active.description || '',
        },
      })
      if (error) {
        // 云端函数未部署/不可用时，前端本地规则兜底，保证编译不失败
        const local = localCompileEmotion({
          name: active.name,
          description: active.description || '',
          selected,
        })
        setResult({ title: local.emotion_title, detail: local.emotion_detail })
        setFlash('⚠️ 云端编译函数未部署，已用本地规则生成（部署后可升级 LLM 版）')
      } else if (data) {
        setResult({ title: data.emotion_title || '', detail: data.emotion_detail || '' })
        setFlash(`✨ 已生成情绪文案：${data.emotion_title || ''}`)
      }
      setTimeout(() => setFlash(null), 6000)
    } catch (e: any) {
      setFlash('编译异常：' + String(e?.message || e))
      setTimeout(() => setFlash(null), 6000)
    } finally {
      setCompiling(false)
    }
  }

  async function handleSave() {
    if (!active || !storeId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('product_emotion').upsert(
        {
          product_id: active.id,
          dimension_tags: selected,
          quality_score: score.total,
          emotion_title: result?.title ?? null,
          emotion_detail: result?.detail ?? null,
          shiyang_tags: toShiyangTags(shiyangDims),
          shiyang_copy: shiyangDims.length ? (shiyangCopy || generateShiyangCopy({ ingredients: shiyangDims }).cardDetail) : null,
        },
        { onConflict: 'product_id' },
      )
      if (error) throw error
      setFlash('💾 已保存五维标签、食养成分与编译分（' + score.total + '分）')
      // 本地同步
      setProducts((prev) =>
        prev.map((p) =>
          p.id === active.id
            ? {
                ...p,
                product_emotion: {
                  ...p.product_emotion,
                  dimension_tags: selected,
                  quality_score: score.total,
                  emotion_title: result?.title ?? null,
                  emotion_detail: result?.detail ?? null,
                  shiyang_tags: toShiyangTags(shiyangDims),
                  shiyang_copy: shiyangDims.length ? (shiyangCopy || generateShiyangCopy({ ingredients: shiyangDims }).cardDetail) : null,
                },
              }
            : p,
        ),
      )
      setTimeout(() => setFlash(null), 4000)
    } catch (e: any) {
      setFlash('保存失败：' + String(e?.message || e))
      setTimeout(() => setFlash(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  if (!isMerchantUser) {
    return <div style={{ color: muted, padding: 40 }}>当前账号无自营门店权限，无法进入情绪工作台。</div>
  }

  return (
    <div>
      {flash && (
        <div style={{ position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200, maxWidth: 560, background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 12, padding: '12px 18px', color: 'var(--accent-text)', fontSize: 13, lineHeight: 1.7, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
          {flash}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: fg, fontSize: 20, fontWeight: 700, margin: 0 }}>情绪编译工作台</h2>
          <p style={{ color: muted, fontSize: 13, margin: '4px 0 0' }}>为商品打五维情绪标签  实时评分  一键编译情绪文案（与小程序自营门店后台同源）</p>
        </div>
        {active && (
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: saving ? 'var(--border-soft)' : 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? '保存中…' : '💾 保存'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        {/* 左：商品列表 */}
        <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 12, maxHeight: '72vh', overflowY: 'auto' }}>
          <p style={{ color: muted, fontSize: 12, margin: '0 0 10px' }}>门店商品（{products.length}）</p>
          {products.length === 0 && <p style={{ color: muted, fontSize: 13 }}>暂无可编译商品</p>}
          {products.map((p) => {
            const scoreBadge = p.product_emotion?.quality_score
            return (
              <div
                key={p.id}
                onClick={() => { setActiveId(p.id); hydrate(p); setResult(p.product_emotion?.emotion_title ? { title: p.product_emotion.emotion_title!, detail: p.product_emotion.emotion_detail || '' } : null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, cursor: 'pointer', marginBottom: 8, background: p.id === activeId ? 'var(--border-soft)' : 'transparent', border: `1px solid ${p.id === activeId ? 'var(--accent)' : 'transparent'}` }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--border-soft)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, overflow: 'hidden' }}>
                  {p.main_image ? <img src={p.main_image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🛍️'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: fg, fontSize: 13, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                  <p style={{ color: muted, fontSize: 11, margin: '2px 0 0' }}>¥{p.price}{scoreBadge != null && ` · 分${scoreBadge}`}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* 右：工作台 */}
        <div>
          {!active ? (
            <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 40, color: muted, textAlign: 'center' }}>请选择左侧商品开始编译</div>
          ) : (
            <>
              {/* 评分总览 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 16, marginBottom: 16 }}>
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 34, fontWeight: 800, color: tierColor, lineHeight: 1 }}>{score.total}</div>
                  <div style={{ color: muted, fontSize: 11, marginTop: 4 }}>编译分 / 100</div>
                  <div style={{ color: 'var(--accent-text)', fontSize: 11, marginTop: 4 }}> 食养 {shiyangDims.length}/{SHIYANG_DIMENSION_MAX}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: tierColor, fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>{tierText}</p>
                  {score.violations.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--danger-text)', fontSize: 12, lineHeight: 1.6 }}>
                      {score.violations.map((v, i) => <li key={i}>{v.message}</li>)}
                    </ul>
                  )}
                  {score.violations.length === 0 && score.suggestions.length > 0 && (
                    <p style={{ color: '#FBBF24', fontSize: 12, margin: 0 }}>建议：{score.suggestions.join('；')}</p>
                  )}
                  {score.violations.length === 0 && score.suggestions.length === 0 && (
                    <p style={{ color: muted, fontSize: 12, margin: 0 }}>标签与文案质量良好，可提交审核。</p>
                  )}
                </div>
                <button onClick={handleCompile} disabled={compiling} style={{ padding: '10px 16px', background: compiling ? 'var(--border-soft)' : 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: compiling ? 'default' : 'pointer' }}>
                  {compiling ? '编译中…' : '✨ 一键编译'}
                </button>
              </div>

              {/* 五维标签 */}
              <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 16 }}>
                {EMOTION_DIMENSION_ORDER.map((dim) => {
                  const tags = EMOTION_DIMENSION_TAGS[dim] || []
                  const picked = selected[dim] || []
                  return (
                    <div key={dim} style={{ marginBottom: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ color: fg, fontSize: 14, fontWeight: 600 }}>{EMOTION_DIMENSION_LABELS[dim]}</span>
                        <span style={{ color: muted, fontSize: 11 }}>{picked.length}/{EMOTION_DIMENSION_MAX}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {tags.map((t) => {
                          const on = picked.includes(t.zh)
                          return (
                            <button
                              key={t.zh}
                              onClick={() => toggleTag(dim, t.zh)}
                              disabled={!on && picked.length >= EMOTION_DIMENSION_MAX}
                              style={{
                                padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                                border: `1px solid ${on ? t.color : BORDER}`,
                                background: on ? t.color + '22' : 'transparent',
                                color: on ? t.color : muted,
                                opacity: !on && picked.length >= EMOTION_DIMENSION_MAX ? 0.4 : 1,
                              }}
                            >
                              {t.icon} {t.zh}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 食养成分打标 */}
              <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 16, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ color: 'var(--accent-text)', fontSize: 14, fontWeight: 700 }}>🌿 {SHIYANG_DIMENSION_LABEL}打标</span>
                  <span style={{ color: muted, fontSize: 11 }}>{shiyangDims.length}/{SHIYANG_DIMENSION_MAX}</span>
                </div>
                <p style={{ color: muted, fontSize: 12, margin: '0 0 12px' }}>最多选 {SHIYANG_DIMENSION_MAX} 个食材，食养文案自动套食养参考措辞（传统食养参考，不替代医疗）</p>
                {Object.entries(SHIYANG_CATEGORIES).map(([catKey, cat]) => (
                  <div key={catKey} style={{ marginBottom: 14 }}>
                    <div style={{ color: fg, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{cat.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {cat.tags.map((t) => {
                        const on = shiyangDims.includes(t.zh)
                        return (
                          <button
                            key={t.zh}
                            onClick={() => toggleShiyangTag(t.zh)}
                            disabled={!on && shiyangDims.length >= SHIYANG_DIMENSION_MAX}
                            style={{
                              padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                              border: `1px solid ${on ? t.color : BORDER}`,
                              background: on ? t.color + '22' : 'transparent',
                              color: on ? t.color : muted,
                              opacity: !on && shiyangDims.length >= SHIYANG_DIMENSION_MAX ? 0.4 : 1,
                            }}
                          >
                            {t.icon} {t.zh}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {/* 食养文案（自动生成，可微调） */}
                <div style={{ marginTop: 4 }}>
                  <p style={{ color: 'var(--accent-text)', fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>食养卡片文案</p>
                  <textarea
                    value={shiyangCopy}
                    onChange={(e) => setShiyangCopy(e.target.value)}
                    placeholder="选择食材后自动生成食养文案，可手动微调"
                    disabled={shiyangDims.length === 0}
                    style={{ width: '100%', minHeight: 88, resize: 'vertical', background: 'var(--surface)', color: fg, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit' }}
                  />
                  {shiyangDims.length > 0 && (
                    <p style={{ color: muted, fontSize: 11, margin: '6px 0 0', lineHeight: 1.6 }}>以上为传统食养文化参考，个体差异较大，不能替代专业医疗建议。如身体不适应及时休息，症状持续或加重请及时就医。</p>
                  )}
                </div>
              </div>

              {/* 编译结果 */}
              {result && (
                <div style={{ background: CARD, borderRadius: 12, border: `1px solid var(--accent)`, padding: 16, marginTop: 16 }}>
                  <p style={{ color: 'var(--accent-text)', fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>✨ {result.title}</p>
                  <p style={{ color: fg, fontSize: 14, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{result.detail}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
