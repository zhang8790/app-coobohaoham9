// 块编辑器（公众号式图文排版的小程序可行解）
// 小程序无 contenteditable，改用「块」组合表达排版，序列化为 token 存 articles.content。
import { useState, useEffect, useMemo, useCallback, useRef, type MutableRefObject } from 'react'
import Taro, { useShareAppMessage, useShareTimeline, useRouter } from '@tarojs/taro'
import { View, Text, Image, Input, Textarea, Button, ScrollView } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import {
  createArticle, updateArticle, getArticleById, searchProducts,
  addEmotionTongbao, grantEmotionBadge,
} from '@/db/api'
import { uploadToStorage } from '@/utils/upload'
import { checkIllegalWords } from '@/utils/compliance-words'
import { PRODUCT_DISCLAIMER, shieldCopy } from '@/utils/compliance/shield'
import {
  newBlock, serializeBlocks, deserializeBlocks, plainText,
  similarity, REWRITE_THRESHOLD, ARTICLE_TEMPLATES, BLOCK_META,
} from '@/utils/article-blocks'
import type { Block, BlockType } from '@/utils/article-blocks'
import Icon from '@/components/Icon'

const UGC_REWARD = 2

const INSERT_BAR: { type: BlockType; label: string }[] = [
  { type: 'text', label: '正文' },
  { type: 'h1', label: '大标题' },
  { type: 'h2', label: '小标题' },
  { type: 'quote', label: '引用' },
  { type: 'hr', label: '分割线' },
  { type: 'img', label: '图片' },
]

export default function RichEditor({ shareRef, articleIdProp }: {
  shareRef: MutableRefObject<{ title: string; path: string; imageUrl: string }>
  articleIdProp?: string | null
}) {
  const { user } = useAuth()
  const router = useRouter()
  const editId = articleIdProp || router.params?.articleId

  const [title, setTitle] = useState('')
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [coverUploading, setCoverUploading] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([newBlock('text')])
  const [articleId, setArticleId] = useState<string | null>(null)
  const [sourceRaw, setSourceRaw] = useState<string>('')   // 素材原文快照 → 改写率闸门
  const [publishing, setPublishing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showProducts, setShowProducts] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [productLoading, setProductLoading] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [lastSaved, setLastSaved] = useState<string>('')

  // ── 载入已有文章 / 素材草稿 ──
  useEffect(() => {
    if (!editId) return
    let alive = true
    getArticleById(editId).then((a: any) => {
      if (!alive || !a) return
      setArticleId(a.id)
      setTitle(a.title || '')
      setCoverImage(a.cover_image || null)
      setBlocks(deserializeBlocks(a.content || ''))
      if (a.source_raw) setSourceRaw(a.source_raw)
    }).catch(() => {})
    return () => { alive = false }
  }, [editId])

  const contentText = useMemo(() => serializeBlocks(blocks), [blocks])

  // ── 自动保存草稿（内容变化 3s 后静默存） ──
  const savedRef = useRef('')
  useEffect(() => {
    if (!title.trim() && !plainText(blocks).trim()) return
    const snapshot = `${title}|${contentText}`
    if (snapshot === savedRef.current) return
    const timer = setTimeout(async () => {
      try {
        savedRef.current = snapshot
        if (articleId) {
          await updateArticle(articleId, { title: title || '未命名草稿', content: contentText })
        } else {
          const art = await createArticle(title || '未命名草稿', contentText, [], [], { status: 'draft' })
          if ((art as any)?.id) setArticleId((art as any).id)
        }
        setLastSaved(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      } catch { /* 静默 */ }
    }, 3000)
    return () => clearTimeout(timer)
  }, [title, contentText, articleId, blocks])

  // ── 块操作 ──
  const updateBlock = (id: string, value: string) =>
    setBlocks(bs => bs.map(b => (b.id === id ? { ...b, value } : b)))

  const removeBlock = (id: string) =>
    setBlocks(bs => (bs.length <= 1 ? [newBlock('text')] : bs.filter(b => b.id !== id)))

  const moveBlock = (id: string, dir: -1 | 1) =>
    setBlocks(bs => {
      const i = bs.findIndex(b => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= bs.length) return bs
      const next = [...bs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const appendBlock = async (type: BlockType) => {
    if (type === 'img') {
      try {
        const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
        const tmp = res.tempFilePaths?.[0]
        if (!tmp) return
        Taro.showLoading({ title: '上传中…' })
        const url = await uploadToStorage(tmp, { bucket: 'images', silent: true })
        Taro.hideLoading()
        setBlocks(bs => [...bs, newBlock('img', url)])
      } catch {
        Taro.hideLoading()
        Taro.showToast({ title: '图片上传失败', icon: 'none' })
      }
      return
    }
    setBlocks(bs => [...bs, newBlock(type)])
  }

  /** 一键插入免责声明（合规必备，固定文本） */
  const insertDisclaimer = () => {
    if (blocks.some(b => b.type === 'tip' && b.value.includes(PRODUCT_DISCLAIMER.slice(0, 12)))) {
      Taro.showToast({ title: '已包含免责声明', icon: 'none' })
      return
    }
    setBlocks(bs => [...bs, newBlock('tip', PRODUCT_DISCLAIMER)])
    Taro.showToast({ title: '已插入免责声明', icon: 'success' })
  }

  // ── 好物卡 ──
  const openProducts = async () => {
    setShowProducts(true)
    if (products.length) return
    setProductLoading(true)
    try {
      const list = await searchProducts('', 0)
      setProducts((list || []).slice(0, 30))
    } catch { setProducts([]) } finally { setProductLoading(false) }
  }

  const insertProduct = (p: any) => {
    setBlocks(bs => [...bs, newBlock('product', p.id)])
    setShowProducts(false)
    Taro.showToast({ title: '已插入好物卡', icon: 'success' })
  }

  // ── 模板 ──
  const applyTemplate = (key: string) => {
    const tpl = ARTICLE_TEMPLATES.find(t => t.key === key)
    if (!tpl) return
    const hasContent = plainText(blocks).trim().length > 0
    const doApply = () => {
      setBlocks(tpl.build())
      if (!title.trim()) setTitle(tpl.title)
      setShowTemplates(false)
      Taro.showToast({ title: `已套用「${tpl.name}」`, icon: 'success' })
    }
    if (hasContent) {
      Taro.showModal({ title: '套用模板', content: '会替换当前正文内容，确定继续吗？', confirmText: '替换' })
        .then(r => { if (r.confirm) doApply() })
    } else doApply()
  }

  // ── 封面 ──
  const chooseCover = async () => {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      const tmp = res.tempFilePaths?.[0]
      if (!tmp) return
      setCoverImage(tmp)
      setCoverUploading(true)
      const url = await uploadToStorage(tmp, { bucket: 'images', silent: true })
      setCoverImage(url)
    } catch {
      setCoverImage(null)
      Taro.showToast({ title: '封面上传失败', icon: 'none' })
    } finally { setCoverUploading(false) }
  }

  // 分享配置上抛到页面根（MakePage 统一注册分享钩子）：标题/路径/封面随编辑实时更新
  useEffect(() => {
    shareRef.current = {
      title: title.trim() || '来电有喜 · 好文分享',
      path: articleId ? `/pages/content/article-detail/index?id=${articleId}` : '/pages/content/content-center/make-rich/index',
      imageUrl: coverImage || '',
    }
  }, [title, articleId, coverImage, shareRef])

  // ── 存草稿 ──
  const handleSaveDraft = async () => {
    if (savingDraft) return
    setSavingDraft(true)
    try {
      if (articleId) {
        await updateArticle(articleId, { title: title || '未命名草稿', content: contentText, status: 'draft', cover_image: coverImage ?? undefined })
      } else {
        const art = await createArticle(title || '未命名草稿', contentText, coverImage ? [coverImage] : [], [], { status: 'draft', cover_image: coverImage ?? undefined })
        if ((art as any)?.id) setArticleId((art as any).id)
      }
      Taro.showToast({ title: '已存草稿箱', icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' })
    } finally { setSavingDraft(false) }
  }

  // ── 发布（双闸门：合规词 + 改写率） ──
  const handlePublish = useCallback(async () => {
    const body = plainText(blocks)
    if (!title.trim() || !body.trim()) { Taro.showToast({ title: '标题和正文都要写点内容', icon: 'none' }); return }
    if (publishing) return
    if (coverUploading) { Taro.showToast({ title: '封面上传中，请稍候', icon: 'none' }); return }
    if (coverImage && !/^https?:\/\//.test(coverImage)) {
      Taro.showToast({ title: '封面未上传成功，请重新选择', icon: 'none' }); return
    }

    // 闸门① 合规词
    const hits = Array.from(new Set([
      ...checkIllegalWords(`${title} ${body}`).found,
      ...shieldCopy(`${title} ${body}`).hits,
    ]))
    if (hits.length) {
      Taro.showModal({
        title: '文案需要修改',
        content: `检测到不合规词汇：${hits.slice(0, 6).join('、')}${hits.length > 6 ? ' 等' : ''}。\n食品文案请统一使用「日常膳食搭配参考」类表述，不可宣称功效。`,
        confirmText: '去修改', showCancel: false,
      })
      return
    }

    // 闸门② 改写率（素材工坊导入的内容必须大幅改写）
    if (sourceRaw) {
      const sim = similarity(sourceRaw, body)
      if (sim > REWRITE_THRESHOLD) {
        Taro.showModal({
          title: '请再改写一些',
          content: `当前内容与导入素材相似度约 ${Math.round(sim * 100)}%，直接搬运存在版权风险。\n请用自己的话重写段落、调整顺序、加入个人感受后再发布。`,
          confirmText: '去改写', showCancel: false,
        })
        return
      }
    }

    setPublishing(true)
    try {
      if (articleId) {
        await updateArticle(articleId, { title, content: contentText, status: 'published', cover_image: coverImage ?? undefined })
      } else {
        const art = await createArticle(title, contentText, coverImage ? [coverImage] : [], [], { status: 'published', cover_image: coverImage ?? undefined })
        if ((art as any)?.id) setArticleId((art as any).id)
      }
      const id = articleId
      if (user?.id) {
        try { await addEmotionTongbao(user.id, UGC_REWARD, 'ugc_earn', id || undefined, '发布图文') } catch { /* ignore */ }
        try { await grantEmotionBadge(user.id, 'first_share') } catch { /* ignore */ }
      }
      Taro.showToast({ title: `发布成功 +${UGC_REWARD}金豆`, icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({ url: `/pages/content/content-center/my-articles/index?tab=published` })
      }, 900)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '发布失败', icon: 'none' })
    } finally { setPublishing(false) }
  }, [title, blocks, contentText, coverImage, coverUploading, publishing, articleId, sourceRaw, user?.id])

  // ─────────────── 渲染 ───────────────
  const renderBlockEditor = (b: Block, idx: number) => {
    const meta = BLOCK_META[b.type]
    return (
      <View key={b.id} className="mt-3 rounded-2xl bg-card border border-border overflow-hidden">
        {/* 块头：类型 + 上下移 + 删除 */}
        <View className="flex items-center gap-2 px-3 py-1.5 bg-black/[0.03]">
          <Text className="text-xs text-muted-foreground">{meta.icon} {meta.label}</Text>
          <View className="ml-auto flex items-center gap-3">
            <Text className="text-sm text-muted-foreground" onClick={() => moveBlock(b.id, -1)}>↑</Text>
            <Text className="text-sm text-muted-foreground" onClick={() => moveBlock(b.id, 1)}>↓</Text>
            <Text className="text-sm text-destructive" onClick={() => removeBlock(b.id)}>删除</Text>
          </View>
        </View>

        <View className="p-3">
          {b.type === 'hr' && <View className="h-0.5 bg-border my-2" />}

          {b.type === 'img' && (
            b.value
              ? <Image src={b.value} mode="widthFix" className="w-full rounded-xl" />
              : <Text className="text-sm text-muted-foreground">图片未上传</Text>
          )}

          {b.type === 'product' && (
            <View className="flex items-center gap-2">
              <Text className="text-lg">🛒</Text>
              <Text className="text-base text-foreground">好物卡（发布后显示商品详情）</Text>
            </View>
          )}

          {(b.type === 'h1' || b.type === 'h2') && (
            <Input
              className={`w-full bg-transparent text-foreground ${b.type === 'h1' ? 'text-2xl font-bold' : 'text-xl font-bold'}`}
              placeholder={b.type === 'h1' ? '输入大标题' : '输入小标题'}
              value={b.value}
              onInput={(e: any) => updateBlock(b.id, e.detail?.value || '')} />
          )}

          {(b.type === 'text' || b.type === 'quote' || b.type === 'tip') && (
            <Textarea
              className={`w-full bg-transparent leading-relaxed ${b.type === 'text' ? 'text-xl text-foreground' : 'text-lg text-muted-foreground'}`}
              style={{ height: b.type === 'text' ? '120px' : '90px' }}
              placeholder={b.type === 'text' ? '写点什么…' : b.type === 'quote' ? '引用 / 小提示' : '温馨提示'}
              value={b.value}
              autoHeight
              maxlength={-1}
              onInput={(e: any) => updateBlock(b.id, e.detail?.value || '')} />
          )}
        </View>
      </View>
    )
  }

  // 预览模式
  if (previewMode) {
    return (
      <View className="min-h-screen bg-background pb-28">
        <View className="px-4 pt-4">
          {coverImage && <Image src={coverImage} mode="widthFix" className="w-full rounded-2xl mb-3" />}
          <Text className="text-3xl font-bold text-foreground leading-snug">{title || '未命名'}</Text>
        </View>
        <View className="px-4 mt-4">
          {blocks.map(b => {
            if (b.type === 'hr') return <View key={b.id} className="h-0.5 bg-border my-6 mx-8" />
            if (b.type === 'img') return b.value ? <Image key={b.id} src={b.value} mode="widthFix" className="w-full rounded-xl my-3" /> : null
            if (b.type === 'product') return (
              <View key={b.id} className="my-3 p-4 rounded-2xl bg-primary/5 border border-primary/20">
                <Text className="text-base text-primary">🛒 好物卡 · 发布后显示完整商品</Text>
              </View>
            )
            if (b.type === 'h1') return <Text key={b.id} className="block text-3xl font-bold text-foreground mt-6 mb-2">{b.value}</Text>
            if (b.type === 'h2') return <Text key={b.id} className="block text-2xl font-bold text-foreground mt-5 mb-2 pl-3 border-l-4 border-primary">{b.value}</Text>
            if (b.type === 'quote') return (
              <View key={b.id} className="my-3 p-3 rounded-xl bg-card border-l-4 border-border">
                <Text className="text-lg text-muted-foreground leading-relaxed italic">{b.value}</Text>
              </View>
            )
            if (b.type === 'tip') return (
              <View key={b.id} className="my-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <Text className="text-sm text-amber-800 leading-relaxed">{b.value}</Text>
              </View>
            )
            return <Text key={b.id} className="block text-xl text-foreground leading-relaxed my-2">{b.value}</Text>
          })}
        </View>
        <View className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 z-20">
          <View className="flex items-center justify-center py-3 rounded-2xl bg-primary" hoverClass="none" onClick={() => setPreviewMode(false)}>
            <Text className="text-lg text-white font-bold">← 返回继续编辑</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-background pb-40">
      {/* 顶栏 */}
      <View className="flex items-center justify-between px-4 py-3">
        <Text className="text-2xl font-bold text-foreground">写图文</Text>
        <View className="flex items-center gap-3">
          {lastSaved && <Text className="text-xs text-muted-foreground">已存 {lastSaved}</Text>}
          <Text className="text-sm text-primary" onClick={() => setPreviewMode(true)}>预览</Text>
        </View>
      </View>

      {/* 标题 + 封面 */}
      <View className="px-4">
        <Input
          className="w-full text-2xl font-bold text-foreground bg-transparent"
          placeholder="写个标题…"
          value={title}
          onInput={(e: any) => setTitle(e.detail?.value || '')} />
        <View className="flex items-center gap-3 mt-3">
          <View className="w-20 h-20 rounded-xl bg-card border border-dashed border-border flex items-center justify-center overflow-hidden"
            hoverClass="none" onClick={chooseCover}>
            {coverImage
              ? <Image src={coverImage} mode="aspectFill" className="w-full h-full" />
              : <Icon name="image-plus" size={26} className="text-muted-foreground" />}
          </View>
          <Text className="text-sm text-muted-foreground">
            {coverUploading ? '封面上传中…' : '加张封面图，分享出去更好看'}
          </Text>
        </View>
      </View>

      {/* 快捷条 */}
      <View className="px-4 mt-4 flex flex-wrap gap-2">
        <View className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20" hoverClass="none" onClick={() => setShowTemplates(true)}>
          <Text className="text-sm text-primary">📄 套用模板</Text>
        </View>
        <View className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20" hoverClass="none" onClick={openProducts}>
          <Text className="text-sm text-primary">🛒 插入好物卡</Text>
        </View>
        <View className="px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200" hoverClass="none" onClick={insertDisclaimer}>
          <Text className="text-sm text-amber-700">⚠️ 免责声明</Text>
        </View>
      </View>

      {/* 素材来源提示 */}
      {sourceRaw && (
        <View className="mx-4 mt-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
          <Text className="text-sm text-destructive leading-relaxed">
            本文来自导入素材。发布前需大幅改写，系统会自动校验相似度。
          </Text>
        </View>
      )}

      {/* 块列表 */}
      <View className="px-4">
        {blocks.map(renderBlockEditor)}
      </View>

      {/* 添加块 */}
      <View className="px-4 mt-4">
        <Text className="text-sm text-muted-foreground">添加内容块</Text>
        <View className="flex flex-wrap gap-2 mt-2">
          {INSERT_BAR.map(it => (
            <View key={it.type} className="px-3 py-2 rounded-xl bg-card border border-border"
              hoverClass="none" onClick={() => appendBlock(it.type)}>
              <Text className="text-sm text-foreground">+ {it.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 底部操作 */}
      <View className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 z-20 flex gap-2">
        <View className="flex-1 flex items-center justify-center py-3 rounded-2xl border border-border"
          hoverClass="none" onClick={handleSaveDraft}>
          <Text className="text-lg text-foreground">{savingDraft ? '保存中…' : '存草稿'}</Text>
        </View>
        <View className={`flex items-center justify-center py-3 rounded-2xl ${publishing ? 'bg-primary/50' : 'bg-primary'}`}
          style={{ flex: 2 }} hoverClass="none" onClick={handlePublish}>
          <Text className="text-lg text-white font-bold">{publishing ? '发布中…' : `发布 +${UGC_REWARD}金豆`}</Text>
        </View>
      </View>

      {/* 模板弹层 */}
      {showTemplates && (
        <View className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowTemplates(false)}>
          <View className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl p-4 pb-8" onClick={(e: any) => e.stopPropagation()}>
            <Text className="text-xl font-bold text-foreground">选个模板，填空就能发</Text>
            <View className="mt-3 flex flex-col gap-2">
              {ARTICLE_TEMPLATES.map(t => (
                <View key={t.key} className="flex items-center gap-3 p-3 rounded-2xl bg-background border border-border"
                  hoverClass="none" onClick={() => applyTemplate(t.key)}>
                  <Text className="text-3xl">{t.emoji}</Text>
                  <View className="flex-1">
                    <Text className="block text-lg font-bold text-foreground">{t.name}</Text>
                    <Text className="block text-sm text-muted-foreground">{t.desc}</Text>
                  </View>
                  <Text className="text-muted-foreground">›</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* 好物卡选择弹层 */}
      {showProducts && (
        <View className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowProducts(false)}>
          <View className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl p-4 pb-8"
            style={{ maxHeight: '70vh' }} onClick={(e: any) => e.stopPropagation()}>
            <Text className="text-xl font-bold text-foreground">选择好物，插入到文末</Text>
            {productLoading && <Text className="block mt-3 text-sm text-muted-foreground">加载中…</Text>}
            <ScrollView scrollY style={{ maxHeight: '55vh' }} className="mt-3">
              <View className="flex flex-col gap-2">
                {products.map(p => (
                  <View key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-background border border-border"
                    hoverClass="none" onClick={() => insertProduct(p)}>
                    <Image src={p.image_url} mode="aspectFill" className="w-14 h-14 rounded-xl flex-shrink-0" />
                    <View className="flex-1 min-w-0">
                      <Text className="block text-base font-bold text-foreground truncate">{p.name}</Text>
                      <Text className="text-sm text-destructive font-bold">¥{(p.price ?? 0).toFixed(2)}</Text>
                    </View>
                    <Text className="text-primary text-lg">＋</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  )
}
