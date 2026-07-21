// @title 商家情绪编译工作台
// 方案 §3 核心生产入口：五维标签打标 + 一键编译 + 实时质量评分 + 提交审核
import { useState, useEffect, useMemo } from 'react'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { View, Text, Input, Textarea, Image } from '@tarojs/components'
import {
  getProductById, getProductEmotion, saveProductEmotion, compileProductEmotion} from '@/db/api'
import type { Product, ProductEmotion } from '@/db/types'
import { scoreCompilation } from '@/utils/emotion-scoring'
import {
  EMOTION_DIMENSION_TAGS, EMOTION_DIMENSION_ORDER, EMOTION_DIMENSION_LABELS,
  EMOTION_DIMENSION_MAX, recommendDimensions,
  SHIYANG_CATEGORIES, SHIYANG_DIMENSION_KEY, SHIYANG_DIMENSION_MAX,
} from '@/utils/emotion-dimensions'
import { RouteGuard } from '@/components/RouteGuard'
import { generateEmotionHeadline } from '@/utils/emotion-description'

type DimKey = 'function' | 'scene' | 'emotion' | 'identity' | 'sensory'

function MerchantEmotionCompilePage() {
  const router = getCurrentInstance().router
  const productId = router?.params?.productId

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [compiling, setCompiling] = useState(false)
  const [saving, setSaving] = useState(false)

  // 五维标签选择
  const [dims, setDims] = useState<Record<DimKey, string[]>>({
    function: [], scene: [], emotion: [], identity: [], sensory: []})
  // 食养成分标签选择
  const [shiyangDims, setShiyangDims] = useState<string[]>([])
  // 推荐标签（根据商品描述）
  const [recommended, setRecommended] = useState<Partial<Record<DimKey, string[]>>>({})

  // 编译结果（可编辑）
  const [title, setTitle] = useState('')
  const [stage1, setStage1] = useState('') // 场景化问句
  const [stage2, setStage2] = useState('') // 状态确认
  const [stage3, setStage3] = useState('') // 身份确认
  // 多段候选（云端/本地编译返回的 3 段候选文案，用于"换一版"切换）
  const [candidates, setCandidates] = useState<string[]>([])
  // 候选对应的「智能卖点标题」（与 candidates 同序，工作台展示每条文案的卖点角度）
  const [candidateHeadlines, setCandidateHeadlines] = useState<string[]>([])
  const [curHeadline, setCurHeadline] = useState('')

  // ── 加载商品 + 已有编译结果 ──
  useEffect(() => {
    if (!productId) { setLoading(false); return }
    ;(async () => {
      setLoading(true)
      try {
        const p = await getProductById(productId)
        setProduct(p)
        if (p) {
          const rec = recommendDimensions(`${p.name} ${p.description ?? ''}`)
          setRecommended(rec)
        }
        const emo: ProductEmotion | null = await getProductEmotion(productId)
        if (emo) {
          const dt = (emo.dimension_tags || {}) as Record<DimKey, string[]>
          setDims({
            function: dt.function || [], scene: dt.scene || [],
            emotion: dt.emotion || [], identity: dt.identity || [], sensory: dt.sensory || []})
          if (emo.shiyang_tags?.[SHIYANG_DIMENSION_KEY]) {
            setShiyangDims(emo.shiyang_tags[SHIYANG_DIMENSION_KEY] || [])
          }
          setTitle(emo.emotion_title ?? '')
          // 已有编译结果：优先用三阶段（存于 emotion_detail 由 ' ' 拼接），否则整体放入 stage2
          const detail = emo.emotion_detail ?? ''
          const parts = detail.split(' ').filter(Boolean)
          if (parts.length >= 3) {
            setStage1(parts[0]); setStage2(parts[1]); setStage3(parts.slice(2).join(' '))
          } else {
            setStage2(detail)
          }
        }
      } catch (e) {
        console.error('[情绪编译工作台] 加载失败', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [productId])

  // ── 维度标签切换（每维最多 3 个）──
  const toggleTag = (dim: DimKey, zh: string) => {
    setDims(prev => {
      const cur = prev[dim] || []
      if (cur.includes(zh)) return { ...prev, [dim]: cur.filter(t => t !== zh) }
      if (cur.length >= EMOTION_DIMENSION_MAX) {
        Taro.showToast({ title: `每维最多选 ${EMOTION_DIMENSION_MAX} 个`, icon: 'none' })
        return prev
      }
      return { ...prev, [dim]: [...cur, zh] }
    })
  }

  // ── 食养成分标签切换 ──
  const toggleShiyangTag = (zh: string) => {
    setShiyangDims(prev => {
      if (prev.includes(zh)) return prev.filter(t => t !== zh)
      if (prev.length >= SHIYANG_DIMENSION_MAX) {
        Taro.showToast({ title: `最多选 ${SHIYANG_DIMENSION_MAX} 个食材`, icon: 'none' })
        return prev
      }
      return [...prev, zh]
    })
  }

  // 一键采纳推荐
  const adoptRecommend = () => {
    setDims(prev => {
      const next = { ...prev }
      ;(Object.keys(recommended) as DimKey[]).forEach(dim => {
        const rec = recommended[dim] || []
        next[dim] = [...new Set([...(prev[dim] || []), ...rec])].slice(0, EMOTION_DIMENSION_MAX)
      })
      return next
    })
    Taro.showToast({ title: '已采纳推荐标签', icon: 'success' })
  }

  // ── 一键编译 ──
  const handleCompile = async () => {
    if (!product) return
    setCompiling(true)
    try {
      // product_id 不传 → 仅生成不落库；工作台统一在保存时 upsert 全部字段
      const res = await compileProductEmotion({
        name: product.name,
        description: product.description ?? '',
        mood_tags: dims.emotion,
        scene_tags: dims.scene})
      if (res) {
        if (res.emotion_title) setTitle(res.emotion_title)
        if (res.stage1) setStage1(res.stage1)
        if (res.stage2) setStage2(res.stage2)
        if (res.stage3) setStage3(res.stage3)
        if (res.candidates && Array.isArray(res.candidates)) setCandidates(res.candidates)
        if (!res.stage1 && res.emotion_detail) setStage2(res.emotion_detail)
        // 为候选文案生成「智能卖点标题」，让商家一眼分辨每条角度
        const srcList = (res.candidates && Array.isArray(res.candidates) && res.candidates.length)
          ? res.candidates
          : (res.emotion_detail ? [res.emotion_detail] : [])
        const hs = srcList.map((_, i) =>
          generateEmotionHeadline(product, dims.emotion, dims.scene, product.category, i),
        )
        setCandidateHeadlines(hs)
        setCurHeadline(hs[0] || '')
        if (res._local) Taro.showToast({ title: '⚠️ 云端未部署，已用本地规则生成', icon: 'none' })
        else Taro.showToast({ title: '编译完成', icon: 'success' })
      } else {
        Taro.showToast({ title: '编译失败，请重试', icon: 'none' })
      }
    } catch (e) {
      console.error('[情绪编译工作台] compile 失败', e)
      Taro.showToast({ title: '编译失败', icon: 'none' })
    } finally {
      setCompiling(false)
    }
  }

  // ── 换一版：在 3 段候选文案中循环切换，更新 stage2 ──
  const [candidateIdx, setCandidateIdx] = useState(0)
  const handleNextCandidate = () => {
    if (candidates.length <= 1) {
      Taro.showToast({ title: '候选仅 1 段，请先点"一键编译"', icon: 'none' })
      return
    }
    const next = (candidateIdx + 1) % candidates.length
    setCandidateIdx(next)
    setStage2(candidates[next])
    setCurHeadline(candidateHeadlines[next] || '')
    Taro.showToast({ title: `已切换到第 ${next + 1}/${candidates.length} 段`, icon: 'none' })
  }

  // ── 实时质量评分 ──
  const score = useMemo(() => {
    const copyText = [title, stage1, stage2, stage3].filter(Boolean).join(' ')
    return scoreCompilation({
      tagDimensions: dims,
      copyText,
      hasFunctionInfo: Boolean(product?.description && product.description.trim().length > 5),
      sceneBound: (dims.scene?.length || 0) > 0,
      claimVerifiable: true, // 本地生活实物可消费验证
      shiyangTagCount: shiyangDims.length})
  }, [dims, title, stage1, stage2, stage3, product])

  const tierInfo = useMemo(() => {
    switch (score.tier) {
      case 'recommend': return { text: '✅ 进入推荐池', color: '#16A34A', bg: '#DCFCE7' }
      case 'shopOnly': return { text: '🏪 仅店铺展示', color: '#A8552E', bg: '#FFEDD5' }
      default: return { text: '⛔ 驳回', color: '#DC2626', bg: '#FEE2E2' }
    }
  }, [score.tier])

  // ── 保存 / 提交 ──
  const handleSave = async (submit: boolean) => {
    if (!product) return
    setSaving(true)
    try {
      const emotion_detail = [stage1, stage2, stage3].filter(Boolean).join(' ')
      const ok = await saveProductEmotion({
        product_id: product.id,
        emotion_title: title || null,
        emotion_detail: emotion_detail || null,
        scene_tags_compiled: dims.scene?.length ? dims.scene : null,
        mood_tags_used: dims.emotion?.length ? dims.emotion : null,
        dimension_tags: dims,
        quality_score: score.total,
        review_status: submit ? 'submitted' : 'draft',
        shiyang_tags: { [SHIYANG_DIMENSION_KEY]: shiyangDims },
        shiyang_copy: shiyangDims.length > 0
          ? `食材：${shiyangDims.join('、')}（传统食养参考）`
          : null})
      if (ok) {
        Taro.showToast({ title: submit ? '已提交审核' : '已存草稿', icon: 'success' })
        if (submit) setTimeout(() => Taro.navigateBack(), 800)
      } else {
        Taro.showToast({ title: '保存失败', icon: 'error' })
      }
    } catch (e) {
      console.error('[情绪编译工作台] 保存失败', e)
      Taro.showToast({ title: '保存失败', icon: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FFF8F4' }}>
        <Text style={{ fontSize: '16px', color: '#999' }}>加载中...</Text>
      </View>
    )
  }

  if (!productId || !product) {
    return (
      <RouteGuard>
        <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FFF8F4', padding: '0 30px' }}>
          <Text style={{ fontSize: '48px' }}>🎭</Text>
          <Text style={{ fontSize: '15px', color: '#999', marginTop: '12px', textAlign: 'center' }}>请从「商品管理」进入某商品的情绪编译</Text>
        </View>
      </RouteGuard>
    )
  }

  return (
    <RouteGuard>
    <View style={{ minHeight: '100vh', background: '#FFF8F4', paddingBottom: '90px' }}>
      {/* 顶部标题栏 */}
      <View style={{ padding: '14px 16px 10px', background: '#FFF', borderBottom: '1px solid #F1E9D9' }}>
        <Text style={{ fontSize: '17px', fontWeight: 'bold', color: '#333' }}>🎭 情绪编译工作台</Text>
        <Text style={{ fontSize: '12px', color: '#AAA', display: 'block', marginTop: '2px' }}>五维打标 → 一键编译 → 实时评分 → 提交审核</Text>
      </View>

      {/* 商品信息 */}
      <View style={{ display: 'flex', gap: '10px', padding: '12px 16px' }}>
        <View style={{ width: '56px', height: '56px', borderRadius: '10px', background: '#F5F0EB', overflow: 'hidden', flexShrink: 0 }}>
          {(product.main_image ?? product.image_url)
            ? <Image src={product.main_image ?? product.image_url!} mode="aspectFill" style={{ width: '100%', height: '100%' }} />
            : <View style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: '20px' }}>🖼️</Text></View>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#333' }}>{product.name}</Text>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#A8552E', marginTop: '2px' }}>¥{product.price}</Text>
        </View>
        <View
          onClick={adoptRecommend}
          style={{ alignSelf: 'center', padding: '7px 12px', borderRadius: '10px', background: '#FFF', border: '1.5px solid #A8552E' }}>
          <Text style={{ fontSize: '12px', color: '#A8552E', fontWeight: 'bold' }}>✨ 采纳推荐</Text>
        </View>
      </View>

      {/* ── 五维标签打标 ── */}
      <View style={{ margin: '0 14px 14px', padding: '14px', borderRadius: '16px', background: '#FFF', border: '1px solid #F1E9D9' }}>
        <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>① 五维标签打标</Text>
        <Text style={{ fontSize: '11px', color: '#AAA', marginBottom: '10px', display: 'block' }}>每维限选 {EMOTION_DIMENSION_MAX} 个，带「荐」为系统按商品描述推荐</Text>

        {EMOTION_DIMENSION_ORDER.map(dim => {
          const tags = EMOTION_DIMENSION_TAGS[dim] || []
          const selected = dims[dim] || []
          const recs = recommended[dim] || []
          return (
            <View key={dim} style={{ marginBottom: '12px' }}>
              <View style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <Text style={{ fontSize: '13px', fontWeight: 'bold', color: '#A8552E' }}>{EMOTION_DIMENSION_LABELS[dim]}</Text>
                <Text style={{ fontSize: '11px', color: '#BBB', marginLeft: '6px' }}>{selected.length}/{EMOTION_DIMENSION_MAX}</Text>
              </View>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tags.map(tag => {
                  const on = selected.includes(tag.zh)
                  const isRec = recs.includes(tag.zh)
                  return (
                    <View
                      key={tag.zh}
                      onClick={() => toggleTag(dim, tag.zh)}
                      style={{
                        padding: '5px 10px', borderRadius: '14px',
                        background: on ? (tag.color || '#CCC') : (isRec ? '#F3F0FF' : '#F5F5F5'),
                        border: `1px solid ${on ? (tag.color || '#CCC') : (isRec ? '#A8552E' : '#EEE')}`,
                        display: 'flex', alignItems: 'center', gap: '3px'}}>
                      <Text style={{ fontSize: '12px', color: on ? '#FFF' : (isRec ? '#A8552E' : '#666') }}>
                        {tag.icon} {tag.zh}
                      </Text>
                      {isRec && !on && <Text style={{ fontSize: '9px', color: '#A8552E' }}>荐</Text>}
                    </View>
                  )
                })}
              </View>
            </View>
          )
        })}
      </View>

      {/* ── 食养成分打标 ── */}
      <View style={{ margin: '0 14px 14px', padding: '14px', borderRadius: '16px', background: '#FFF', border: '1px solid #F1E9D9' }}>
        <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>② 食养成分打标（可选）</Text>
        <Text style={{ fontSize: '11px', color: '#AAA', marginBottom: '10px', display: 'block' }}>最多选 {SHIYANG_DIMENSION_MAX} 个食材，所有食养文案自动套食养参考措辞</Text>
        {Object.entries(SHIYANG_CATEGORIES).map(([catKey, cat]) => (
          <View key={catKey} style={{ marginBottom: '10px' }}>
            <Text style={{ fontSize: '12px', fontWeight: 'bold', color: '#16A34A', marginBottom: '6px', display: 'block' }}>{cat.label}</Text>
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {cat.tags.map(tag => {
                const on = shiyangDims.includes(tag.zh)
                return (
                  <View
                    key={tag.zh}
                    onClick={() => toggleShiyangTag(tag.zh)}
                    style={{
                      padding: '5px 10px', borderRadius: '14px',
                      background: on ? (tag.color || '#CCC') : '#F5F5F5',
                      border: `1px solid ${on ? (tag.color || '#CCC') : '#EEE'}`,
                      display: 'flex', alignItems: 'center', gap: '3px'}}>
                    <Text style={{ fontSize: '12px', color: on ? '#FFF' : '#666' }}>
                      {tag.icon} {tag.zh}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        ))}
      </View>

      {/* ── 一键编译 ── */}
      <View style={{ margin: '0 14px 14px', padding: '14px', borderRadius: '16px', background: 'linear-gradient(135deg,#F3F0FF,#FFEFF6)', border: '1px solid #E8E0FF' }}>
        <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '8px', display: 'block' }}>③ 一键编译</Text>
        <Text style={{ fontSize: '11px', color: '#999', marginBottom: '10px', display: 'block' }}>基于三阶段翻译引擎（功能→场景→情绪→身份）生成情绪化叙事</Text>
        <View
          onClick={handleCompile}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px',
            borderRadius: '12px', background: compiling ? '#C9C2F0' : '#A8552E',
            boxShadow: compiling ? 'none' : '0 3px 10px rgba(108,92,231,0.3)'}}>
          <Text style={{ fontSize: '15px', fontWeight: 'bold', color: '#FFF' }}>{compiling ? '编译中…' : '✨ 一键生成情绪文案'}</Text>
        </View>
      </View>

      {/* ── 编译结果编辑 ── */}
      {(title || stage1 || stage2 || stage3) && (
        <View style={{ margin: '0 14px 14px', padding: '14px', borderRadius: '16px', background: '#FFF', border: '1px solid #F1E9D9' }}>
          <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '10px', display: 'block' }}>③ 编译结果（可微调）</Text>

          {curHeadline && (
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '8px 10px', borderRadius: '10px', background: '#FFF7ED', border: '1px solid #FED7AA' }}>
              <Text style={{ fontSize: '12px', color: '#A8552E', fontWeight: 'bold' }}>🏷️ {curHeadline}</Text>
              <View onClick={() => setTitle(curHeadline)} style={{ padding: '3px 10px', borderRadius: '8px', background: '#FF8A65' }}>
                <Text style={{ fontSize: '11px', color: '#FFF', fontWeight: 'bold' }}>采用</Text>
              </View>
            </View>
          )}
          <Text style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>标题</Text>
          <Input
            style={inputBox}
            value={title}
            onInput={(e: any) => setTitle(e.detail?.value ?? '')}
            placeholder="情绪化标题" />

          <Text style={{ fontSize: '12px', color: '#666', margin: '10px 0 4px', display: 'block' }}>第一屏 · 场景化问句</Text>
          <Textarea style={areaBox} value={stage1} onInput={(e: any) => setStage1(e.detail?.value ?? '')} placeholder="如：加班到十点，需要一口暖的？" />

          <Text style={{ fontSize: '12px', color: '#666', margin: '10px 0 4px', display: 'block' }}>第二屏 · 状态确认（多段叙事，可手动微调）</Text>
          <Textarea
            style={{ ...areaBox, minHeight: '160px' }}
            value={stage2}
            onInput={(e: any) => setStage2(e.detail?.value ?? '')}
            placeholder="如：明明很累了，又不想随便对付自己？" />
          {candidates.length > 1 && (
            <View
              onClick={handleNextCandidate}
              style={{
                marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 12px', borderRadius: '12px', background: '#F3F0FF', border: '1px solid #C9C2F0'}}>
              <Text style={{ fontSize: '12px', color: '#A8552E', fontWeight: 'bold' }}>
                🔄 换一版（{candidateIdx + 1}/{candidates.length}）
              </Text>
            </View>
          )}

          <Text style={{ fontSize: '12px', color: '#666', margin: '10px 0 4px', display: 'block' }}>第三屏 · 身份确认</Text>
          <Textarea style={areaBox} value={stage3} onInput={(e: any) => setStage3(e.detail?.value ?? '')} placeholder="如：你是再忙也会好好照顾自己的人" />
        </View>
      )}

      {/* ── 实时质量评分 ── */}
      <View style={{ margin: '0 14px 14px', padding: '14px', borderRadius: '16px', background: '#FFF', border: '1px solid #F1E9D9' }}>
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>④ 实时质量评分</Text>
          <View style={{ padding: '4px 12px', borderRadius: '12px', background: tierInfo.bg }}>
            <Text style={{ fontSize: '12px', fontWeight: 'bold', color: tierInfo.color }}>{tierInfo.text}</Text>
          </View>
        </View>

        {/* 总分圆环 */}
        <View style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
          <View style={{
            width: '64px', height: '64px', borderRadius: '32px',
            background: '#FFF8F0', border: `3px solid ${tierInfo.color}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
            <Text style={{ fontSize: '22px', fontWeight: 'bold', color: tierInfo.color, lineHeight: '1' }}>{score.total}</Text>
            <Text style={{ fontSize: '10px', color: '#999' }}>/100</Text>
          </View>
          <View style={{ flex: 1 }}>
            {[
              { label: '标签完整度', v: score.dimensions.tagCompleteness, max: 25, color: '#A8552E' },
              { label: '文案规范', v: score.dimensions.copyCompliance, max: 25, color: '#0EA5E9' },
              { label: '场景精准度', v: score.dimensions.scenePrecision, max: 18, color: '#16A34A' },
              { label: '确权可达性', v: score.dimensions.claimVerifiability, max: 17, color: '#A8552E' },
              { label: '食养完整度', v: score.dimensions.shiyangCompleteness, max: 15, color: '#9A8070' },
            ].map(d => (
              <View key={d.label} style={{ marginBottom: '5px' }}>
                <View style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: '11px', color: '#666' }}>{d.label}</Text>
                  <Text style={{ fontSize: '11px', color: '#999' }}>{d.v}/{d.max}</Text>
                </View>
                <View style={{ height: '6px', borderRadius: '3px', background: '#F0F0F0', marginTop: '2px', overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round((d.v / d.max) * 100)}%`, height: '100%', background: d.color }} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 建议 */}
        {score.violations.length > 0 && (
          <View style={{ marginBottom: '8px' }}>
            {score.violations.map((v, i) => (
              <View key={i} style={{
                padding: '7px 10px', borderRadius: '8px', marginBottom: '5px',
                background: v.level === 'redline' ? '#FEE2E2' : v.level === 'demote' ? '#FFEDD5' : '#F3F0FF'}}>
                <Text style={{ fontSize: '11px', color: v.level === 'redline' ? '#DC2626' : v.level === 'demote' ? '#A8552E' : '#A8552E' }}>
                  {v.level === 'redline' ? '⛔ ' : v.level === 'demote' ? '⚠️ ' : '💡 '}{v.message}
                </Text>
              </View>
            ))}
          </View>
        )}
        {score.suggestions.length > 0 && (
          <View>
            <Text style={{ fontSize: '11px', color: '#999', marginBottom: '4px', display: 'block' }}>优化建议：</Text>
            {score.suggestions.map((s, i) => (
              <Text key={i} style={{ fontSize: '11px', color: '#888', display: 'block', lineHeight: '1.6' }}>· {s}</Text>
            ))}
          </View>
        )}
      </View>

      {/* 底部固定操作栏 */}
      <View style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        display: 'flex', gap: '10px', padding: '10px 14px',
        background: '#FFF', borderTop: '1px solid #F1E9D9'}}>
        <View
          onClick={() => handleSave(false)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px',
            borderRadius: '14px', background: '#FFF', border: '2px solid #CCC'}}>
          <Text style={{ fontSize: '15px', color: '#666', fontWeight: 'bold' }}>💾 存草稿</Text>
        </View>
        <View
          onClick={() => handleSave(true)}
          style={{
            flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px',
            borderRadius: '14px', background: saving ? '#F0C9A8' : 'linear-gradient(135deg,#C77B47,#A8552E)',
            boxShadow: saving ? 'none' : '0 3px 12px rgba(255,87,34,0.3)'}}>
          <Text style={{ fontSize: '15px', color: '#FFF', fontWeight: 'bold' }}>{saving ? '提交中…' : '🚀 提交审核'}</Text>
        </View>
      </View>
    </View>
    </RouteGuard>
  )
}

const inputBox: any = {
  width: '100%', height: '42px', borderRadius: '10px',
  background: '#FAFAFA', border: '1.5px solid #EEE',
  fontSize: '14px', color: '#333', padding: '0 12px', boxSizing: 'border-box'}
const areaBox: any = {
  width: '100%', minHeight: '60px', borderRadius: '10px',
  background: '#FAFAFA', border: '1.5px solid #EEE',
  fontSize: '13px', color: '#333', padding: '10px 12px', boxSizing: 'border-box'}

export default MerchantEmotionCompilePage
