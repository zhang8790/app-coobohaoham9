// @title 创作江湖令
import { useState, useRef } from 'react'
import Taro from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { createArticle, getArticleById, updateArticle } from '@/db/api'
import { supabase } from '@/client/supabase'

type Step = 'choose' | 'fetch' | 'edit'
type EditMode = 'blank' | 'fetch' | 'template'

// 创作方式卡片配置
const MODES = [
  {
    key: 'blank' as EditMode,
    icon: 'i-mdi-pencil-outline',
    emoji: '✏️',
    title: '空白原创',
    desc: '从零开始，尽情挥毫',
    bg: '#FFF0E8',
    border: '#F59E0B',
  },
  {
    key: 'fetch' as EditMode,
    icon: 'i-mdi-link-variant',
    emoji: '🔗',
    title: '链接导入',
    desc: '导入好文，改编再创',
    bg: '#EFF6FF',
    border: '#3B82F6',
  },
  {
    key: 'template' as EditMode,
    icon: 'i-mdi-file-document-outline',
    emoji: '📝',
    title: '模板套用',
    desc: '套用范式，快速成文',
    bg: '#F0FDF4',
    border: '#22C55E',
  },
]

// 内置模板
const TEMPLATES = [
  { name: '探店推荐', content: '【探店地址】\n\n【环境氛围】\n\n【主推好物】\n\n【性价比评分】\n\n【侠客总结】' },
  { name: '美食攻略', content: '【必点菜品】\n\n【口味描述】\n\n【人均消费】\n\n【排队情况】\n\n【推荐指数】⭐⭐⭐⭐⭐' },
  { name: '购物心得', content: '【购买理由】\n\n【使用体验】\n\n【优缺点分析】\n\n【适合人群】\n\n【是否回购】' },
  { name: '江湖见闻', content: '【时间地点】\n\n【所见所闻】\n\n【心情感悟】\n\n【江湖寄语】' },
]

export default function MakePage() {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('choose')
  const [editMode, setEditMode] = useState<EditMode>('blank')

  // 链接导入
  const [fetchUrl, setFetchUrl] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ title: string; content: string } | null>(null)

  // 模板选择
  const [showTemplates, setShowTemplates] = useState(false)

  // 文章编辑
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [articleId, setArticleId] = useState<string | null>(null)

  const handleChooseMode = (mode: EditMode) => {
    setEditMode(mode)
    if (mode === 'blank') {
      setTitle(''); setContent(''); setCoverImage(null); setArticleId(null)
      setStep('edit')
    } else if (mode === 'fetch') {
      setFetchUrl(''); setFetchResult(null)
      setStep('fetch')
    } else {
      setShowTemplates(true)
    }
  }

  const handleSelectTemplate = (tpl: typeof TEMPLATES[number]) => {
    setShowTemplates(false)
    setTitle(tpl.name); setContent(tpl.content); setCoverImage(null); setArticleId(null)
    setStep('edit')
  }

  // 提取文章内容（调用 Edge Function）
  const handleFetchArticle = async () => {
    if (!fetchUrl.trim()) { Taro.showToast({ title: '请输入文章链接', icon: 'none' }); return }
    setFetchLoading(true)
    setFetchResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('article-fetch', {
        body: { url: fetchUrl.trim() },
      })
      if (error || !data?.title) throw new Error(error?.message ?? '提取失败')
      setFetchResult({ title: data.title, content: data.content ?? '' })
    } catch (e: any) {
      Taro.showToast({ title: e.message ?? '链接解析失败，请检查链接', icon: 'none' })
    }
    setFetchLoading(false)
  }

  const handleUseFetched = () => {
    if (!fetchResult) return
    setTitle(fetchResult.title); setContent(fetchResult.content)
    setCoverImage(null); setArticleId(null)
    setStep('edit')
  }

  // 选封面图
  const handleChooseCover = () => {
    Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] }).then(res => {
      setCoverImage(res.tempFilePaths[0])
    }).catch(() => {})
  }

  // 存草稿
  const handleSaveDraft = async () => {
    if (!title.trim()) { Taro.showToast({ title: '请填写标题', icon: 'none' }); return }
    setSaving(true)
    try {
      if (articleId) {
        await updateArticle(articleId, { title, content, status: 'draft' })
        Taro.showToast({ title: '草稿已更新', icon: 'success' })
      } else {
        const art = await createArticle(title, content, [], [], { status: 'draft', cover_image: coverImage ?? undefined })
        if (art?.id) setArticleId(art.id)
        Taro.showToast({ title: '已存草稿', icon: 'success' })
      }
    } catch {
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
    setSaving(false)
  }

  // 发布
  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      Taro.showToast({ title: '标题和内容不能为空', icon: 'none' }); return
    }
    if (publishing) return
    setPublishing(true)
    try {
      if (articleId) {
        await updateArticle(articleId, { title, content, status: 'published', cover_image: coverImage ?? undefined })
      } else {
        await createArticle(title, content, [], [], { status: 'published', cover_image: coverImage ?? undefined })
      }
      Taro.showToast({ title: '发布成功！', icon: 'success' })
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/content-center/my-articles/index?tab=published' })
      }, 800)
    } catch {
      Taro.showToast({ title: '发布失败，请重试', icon: 'none' })
      setPublishing(false)
    }
  }

  const wordCount = content.length

  // ── 模板弹层 ──
  if (showTemplates) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background px-4 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
          <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
            onClick={() => setShowTemplates(false)}>
            <div className="i-mdi-arrow-left text-2xl text-foreground" />
          </button>
          <h1 className="text-2xl font-bold text-foreground">选择模板</h1>
        </div>
        <div className="p-4 flex flex-col gap-4">
          {TEMPLATES.map(tpl => (
            <div key={tpl.name}
              onClick={() => handleSelectTemplate(tpl)}
              className="p-4 rounded-2xl bg-card border-2 border-border"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="i-mdi-file-document text-2xl text-primary" />
                <span className="text-2xl font-bold text-foreground">{tpl.name}</span>
              </div>
              <p className="text-xl text-muted-foreground whitespace-pre-line leading-relaxed">{tpl.content}</p>
              <div className="mt-3 flex justify-end">
                <span className="px-4 py-1 rounded-full bg-primary/10 text-primary text-xl">使用此模板</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-background px-4 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => {
            if (step === 'choose') Taro.navigateBack()
            else setStep('choose')
          }}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <h1 className="text-2xl font-bold text-foreground flex-1">
          {step === 'choose' ? '创作江湖令' : step === 'fetch' ? '链接导入' : '文章编辑'}
        </h1>
        {step === 'edit' && (
          <span className="text-xl text-muted-foreground">{wordCount}/5000字</span>
        )}
      </div>

      {/* ── 创作方式选择 ── */}
      {step === 'choose' && (
        <div className="p-4">
          {/* 题头 */}
          <div className="mb-6 p-4 rounded-2xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#FFEEDD,#FFFBF7)' }}>
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-white text-2xl">✍️</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">创作你的江湖令</p>
              <p className="text-xl text-muted-foreground mt-1">一文传千里，好物享江湖</p>
            </div>
          </div>

          {/* 三种方式 */}
          <div className="flex flex-col gap-4 mb-6">
            {MODES.map(mode => (
              <div key={mode.key}
                onClick={() => handleChooseMode(mode.key)}
                className="p-4 rounded-2xl flex items-center gap-4"
                style={{ background: mode.bg, border: `2px solid ${mode.border}22`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: mode.border + '22' }}>
                  <span className="text-3xl">{mode.emoji}</span>
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-foreground">{mode.title}</p>
                  <p className="text-xl text-muted-foreground mt-1">{mode.desc}</p>
                </div>
                <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
              </div>
            ))}
          </div>

          {/* 查看我的文章 */}
          <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3"
            onClick={() => Taro.navigateTo({ url: '/pages/content-center/my-articles/index' })}>
            <div className="i-mdi-text-box-multiple text-2xl text-primary" />
            <span className="text-xl text-foreground flex-1">查看我的文章</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
        </div>
      )}

      {/* ── 链接导入 ── */}
      {step === 'fetch' && (
        <div className="p-4">
          <div className="mb-4 p-3 rounded-xl bg-muted/50 flex items-start gap-2">
            <div className="i-mdi-information-outline text-xl text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xl text-muted-foreground leading-relaxed">支持微信公众号、知乎、小红书等平台文章链接</p>
          </div>

          {/* 链接输入 */}
          <p className="text-xl font-bold text-foreground mb-2">文章链接</p>
          <div className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="粘贴文章链接..."
              value={fetchUrl}
              onInput={(e) => { const ev = e as any; setFetchUrl(ev.detail?.value ?? ev.target?.value ?? '') }}
            />
          </div>

          <button type="button"
            className={`w-full flex items-center justify-center leading-none rounded-xl ${fetchLoading ? 'bg-primary/50' : 'bg-primary'}`}
            onClick={handleFetchArticle}>
            <div className="py-4 flex items-center gap-2">
              {fetchLoading
                ? <div className="i-mdi-loading text-2xl text-white animate-spin" />
                : <div className="i-mdi-download text-2xl text-white" />}
              <span className="text-xl text-white font-bold">{fetchLoading ? '提取中...' : '提取内容'}</span>
            </div>
          </button>

          {/* 提取结果 */}
          {fetchResult && (
            <div className="mt-4 p-4 rounded-2xl bg-card border-2 border-primary/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="i-mdi-check-circle text-2xl text-primary" />
                <span className="text-xl font-bold text-primary">提取成功</span>
              </div>
              <p className="text-2xl font-bold text-foreground mb-2">{fetchResult.title}</p>
              <p className="text-xl text-muted-foreground line-clamp-4 leading-relaxed">
                {fetchResult.content.slice(0, 150)}{fetchResult.content.length > 150 ? '...' : ''}
              </p>
              <button type="button"
                className="mt-4 w-full flex items-center justify-center leading-none rounded-xl bg-primary"
                onClick={handleUseFetched}>
                <div className="py-4 text-xl text-white font-bold">使用此内容，开始编辑</div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 文章编辑 ── */}
      {step === 'edit' && (
        <div className="p-4">
          {/* 标题 */}
          <div className="mb-4">
            <p className="text-xl font-bold text-foreground mb-2">
              文章标题 <span className="text-destructive">*</span>
            </p>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-card">
              <input
                className="w-full text-2xl text-foreground bg-transparent outline-none font-bold"
                placeholder="输入文章标题（吸引人的标题更容易传播）"
                value={title}
                onInput={(e) => { const ev = e as any; setTitle(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
          </div>

          {/* 内容 */}
          <div className="mb-4">
            <p className="text-xl font-bold text-foreground mb-2">
              文章内容 <span className="text-destructive">*</span>
            </p>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-card">
              <textarea
                className="w-full text-xl text-foreground bg-transparent outline-none leading-relaxed"
                style={{ height: '40vw', minHeight: '200px' }}
                placeholder="在这里尽情挥毫，分享你的江湖见闻..."
                maxLength={5000}
                value={content}
                onInput={(e) => { const ev = e as any; setContent(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
            <p className="text-right text-base text-muted-foreground mt-1">{wordCount}/5000</p>
          </div>

          {/* 封面图 */}
          <div className="mb-6">
            <p className="text-xl font-bold text-foreground mb-2">封面图（可选）</p>
            {coverImage ? (
              <div className="relative rounded-xl overflow-hidden" style={{ height: '160px' }}>
                <Image src={coverImage} mode="aspectFill" className="w-full" style={{ height: '160px' }} />
                <button type="button"
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center"
                  onClick={() => setCoverImage(null)}>
                  <div className="i-mdi-close text-xl text-white" />
                </button>
              </div>
            ) : (
              <button type="button"
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl bg-muted/30"
                style={{ height: '100px' }}
                onClick={handleChooseCover}>
                <div className="i-mdi-image-plus text-3xl text-muted-foreground" />
                <span className="text-xl text-muted-foreground">选择封面图</span>
              </button>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-col gap-3">
            {/* 发布按钮 */}
            <button type="button"
              className={`w-full flex items-center justify-center leading-none rounded-xl ${publishing ? 'bg-primary/50' : 'bg-primary'}`}
              onClick={handlePublish}>
              <div className="py-4 flex items-center gap-2">
                {publishing && <div className="i-mdi-loading text-2xl text-white animate-spin" />}
                <span className="text-xl text-white font-bold">{publishing ? '发布中...' : (articleId ? '更新文章' : '发布文章')}</span>
              </div>
            </button>

            <div className="flex gap-3">
              {/* 存草稿 */}
              <button type="button"
                className={`flex-1 flex items-center justify-center leading-none rounded-xl border-2 border-border bg-card ${saving ? 'opacity-50' : ''}`}
                onClick={handleSaveDraft}>
                <div className="py-3 flex items-center gap-2">
                  {saving && <div className="i-mdi-loading text-xl text-foreground animate-spin" />}
                  <span className="text-xl text-foreground">{saving ? '保存中...' : '存草稿'}</span>
                </div>
              </button>
              {/* 返回重选 */}
              <button type="button"
                className="flex-1 flex items-center justify-center leading-none rounded-xl border-2 border-border bg-card"
                onClick={() => setStep('choose')}>
                <div className="py-3 text-xl text-muted-foreground">返回重选</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
