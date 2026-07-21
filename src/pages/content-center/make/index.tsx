// @title 创作江湖令
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView, Input, Textarea } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { createArticle, updateArticle, searchProducts } from '@/db/api'
import { supabase } from '@/client/supabase'
import './index.scss'
import Icon from '@/components/Icon'

type Step = 'choose' | 'fetch' | 'edit'
type EditMode = 'blank' | 'fetch' | 'template'

// 创作方式卡片配置
const MODES = [
  {
    key: 'blank' as EditMode,
    icon: 'pencil-outline',
    emoji: '✏️',
    title: '空白原创',
    desc: '从零开始，尽情挥毫',
    bg: '#F1E9D9',
    border: '#F59E0B'},
  {
    key: 'fetch' as EditMode,
    icon: '🔗',
    emoji: '🔗',
    title: '链接导入',
    desc: '导入好文，改编再创',
    bg: '#EFF6FF',
    border: '#3B82F6'},
  {
    key: 'template' as EditMode,
    icon: 'file-document-outline',
    emoji: '📝',
    title: '模板套用',
    desc: '套用范式，快速成文',
    bg: '#F0FDF4',
    border: '#22C55E'},
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
  const [fetchResult, setFetchResult] = useState<{ title: string; content: string; images?: string[] } | null>(null)

  // 模板选择
  const [showTemplates, setShowTemplates] = useState(false)

  // 文章编辑
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [fetchedImages, setFetchedImages] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [articleId, setArticleId] = useState<string | null>(null)

  // 插入好物卡（商品卡占位符）
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productList, setProductList] = useState<any[]>([])
  const [productLoading, setProductLoading] = useState(false)
  // 已插入的商品ID（从 content 解析，便于展示与管理）
  const insertedProducts = useMemo(() => {
    const ids = (content.match(/\[\[product:([\w-]+)\]\]/g) || []).map(m => m.replace(/\[\[product:/, '').replace(/\]\]/, ''))
    return Array.from(new Set(ids))
  }, [content])

  const openProductPicker = () => {
    setShowProductPicker(true)
    setProductSearch('')
    setProductList([])
  }

  const handleProductSearch = async (kw: string) => {
    setProductSearch(kw)
    setProductLoading(true)
    try {
      const list = await searchProducts(kw.trim(), 0)
      setProductList(list || [])
    } catch {
      setProductList([])
    } finally {
      setProductLoading(false)
    }
  }

  // 插入占位符到文末（避免重复）
  const insertProductCard = (product: any) => {
    if (insertedProducts.includes(product.id)) {
      Taro.showToast({ title: '已在文中', icon: 'none' })
      return
    }
    const token = `[[product:${product.id}]]`
    const base = content.trim()
    setContent(base ? `${base}\n\n${token}` : token)
    Taro.showToast({ title: '已附到文末', icon: 'success' })
    setShowProductPicker(false)
  }

  // 从文中移除某个商品占位符
  const removeProductCard = (productId: string) => {
    const next = content.replace(new RegExp(`\\n*\\s*🛍️?\\[\\[product:${productId}\\]\\]`, 'g'), '').trim()
    setContent(next)
    Taro.showToast({ title: '已移除', icon: 'none' })
  }

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

  // 提取文章内容（智能解析链接 + 手动输入辅助）
  const handleFetchArticle = async () => {
    if (!fetchUrl.trim()) { Taro.showToast({ title: '请输入文章链接', icon: 'none' }); return }
    setFetchLoading(true)
    setFetchResult(null)

    try {
      // 尝试调用后端 Edge Function（如果已部署）
      const { data, error } = await supabase.functions.invoke('article-fetch', {
        body: { url: fetchUrl.trim() }})

      if (!error && data?.title) {
        // 后端提取成功 — 去掉内容末尾的【原文图片】段落（图片单独展示）
        let cleanContent = data.content ?? ''
        const imgSectionIndex = cleanContent.indexOf('\n【原文图片】')
        if (imgSectionIndex > 0) {
          cleanContent = cleanContent.slice(0, imgSectionIndex).trim()
        }
        setFetchResult({ title: data.title, content: cleanContent, images: data.images })
      } else {
        // 后端不可用 → 智能辅助模式：从URL解析信息，引导用户手动输入
        const url = fetchUrl.trim()
        let platform = '未知平台'
        let guessedTitle = ''

        // 解析来源平台
        if (url.includes('mp.weixin.qq.com')) platform = '微信公众号'
        else if (url.includes('zhihu.com')) platform = '知乎'
        else if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) platform = '小红书'
        else if (url.includes('bilibili.com') || url.includes('b23.tv')) platform = 'B站'
        else if (url.includes('douyin.com')) platform = '抖音'
        else if (url.includes('weibo.com')) platform = '微博'
        else { platform = '网页文章' }

        // 从 URL 解析来源信息
        try {
          const urlObj = new URL(url)
          // 微信公众号文章路径特殊处理
          if (url.includes('mp.weixin.qq.com')) {
            guessedTitle = '微信公众号文章'
          } else {
            const pathParts = urlObj.pathname.split('/').filter(Boolean)
            if (pathParts.length > 0) {
              const lastPart = decodeURIComponent(pathParts[pathParts.length - 1])
              guessedTitle = lastPart
                .replace(/[_\-]/g, ' ')
                .replace(/\.(html|htm|shtml|md)$/, '')
                .slice(0, 50)
              // 如果解析出来的像ID（纯字母数字+短横线且超过15字符），替换掉
              if (/^[a-zA-Z0-9\-_]{15,}$/.test(guessedTitle)) {
                guessedTitle = platform + '文章'
              }
            } else {
              guessedTitle = platform + '文章'
            }
          }
        } catch (_) { /* ignore */ }

        setFetchResult({
          title: guessedTitle || '我的转载文章',
          content: `【原文链接】\n${url}\n\n【引用内容】\n\n请在此粘贴或输入原文主要内容...\n\n【个人观点】\n\n`})

        Taro.showToast({ title: '已自动填充模板，请补充内容', icon: 'none', duration: 2000 })
      }
    } catch (e: any) {
      // 网络异常等 → 也走辅助模式
      setFetchResult({
        title: '我的转载文章',
        content: `【原文链接】\n${fetchUrl.trim()}\n\n【引用内容】\n\n请在此粘贴或输入原文主要内容...\n\n【个人观点】\n\n`})
      Taro.showToast({ title: '已生成编辑模板', icon: 'none' })
    }
    setFetchLoading(false)
  }

  const handleUseFetched = () => {
    if (!fetchResult) return
    setTitle(fetchResult.title); setContent(fetchResult.content)
    setCoverImage(null); setArticleId(null); setVideoUrl(null)
    // 保存提取的图片
    setFetchedImages(fetchResult.images || [])
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
      console.log('[MakePage] 开始保存草稿...', { title, contentLength: content.length, articleId })
      
      if (articleId) {
        await updateArticle(articleId, { title, content, status: 'draft', images: fetchedImages, video_url: videoUrl })
        Taro.showToast({ title: '草稿已更新', icon: 'success' })
      } else {
        const art = await createArticle(title, content, fetchedImages, [], { status: 'draft', cover_image: coverImage ?? undefined, video_url: videoUrl ?? undefined })
        console.log('[MakePage] 草稿创建成功:', art)
        if (art?.id) setArticleId(art.id)
        Taro.showToast({ title: '已存草稿', icon: 'success' })
      }
    } catch (e: any) {
      console.error('[MakePage] 保存草稿失败:', e.message || e)
      Taro.showToast({
        title: e.message || '保存失败，请重试',
        icon: 'none',
        duration: 3000})
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
      console.log('[MakePage] 开始发布文章...', { title, contentLength: content.length, articleId })
      
      if (articleId) {
        console.log('[MakePage] 更新已有文章:', articleId)
        await updateArticle(articleId, { title, content, status: 'published', cover_image: coverImage ?? undefined, images: fetchedImages, video_url: videoUrl })
      } else {
        console.log('[MakePage] 创建新文章...')
        const art = await createArticle(title, content, fetchedImages, [], { status: 'published', cover_image: coverImage ?? undefined, video_url: videoUrl ?? undefined })
        console.log('[MakePage] 文章创建成功:', art)
        if (art?.id) setArticleId(art.id)
      }
      
      Taro.showToast({ title: '发布成功！', icon: 'success' })
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/content-center/my-articles/index?tab=published' })
      }, 800)
    } catch (e: any) {
      console.error('[MakePage] 发布失败:', e.message || e)
      Taro.showToast({
        title: e.message || '发布失败，请重试',
        icon: 'none',
        duration: 3000})
      setPublishing(false)
    }
  }

  const wordCount = content.length

  // 动态设置导航栏标题
  useEffect(() => {
    if (showTemplates) {
      Taro.setNavigationBarTitle({ title: '选择模板' })
    } else {
      const titleMap = { choose: '创作江湖令', fetch: '链接导入', edit: '文章编辑' }
      Taro.setNavigationBarTitle({ title: titleMap[step] })
    }
  }, [step, showTemplates])

  // ── 模板弹层 ──
  if (showTemplates) {
    return (
      <View className="min-h-screen bg-background">
        <View className="p-4 flex flex-col gap-4">
          {TEMPLATES.map(tpl => (
            <View key={tpl.name}
              onClick={() => handleSelectTemplate(tpl)}
              className="p-4 rounded-2xl bg-card border-2 border-border"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <View className="flex items-center gap-2 mb-2">
                <Icon name="file-document" size={24} className="text-primary" />
                <Text className="text-2xl font-bold text-foreground">{tpl.name}</Text>
              </View>
              <Text className="text-xl text-muted-foreground whitespace-pre-line leading-relaxed">{tpl.content}</Text>
              <View className="mt-3 flex justify-end">
                <Text className="px-4 py-1 rounded-full bg-primary/10 text-primary text-xl">使用此模板</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-background pb-10">
      {/* ── 创作方式选择 ── */}
      {step === 'choose' && (
        <View className="p-4">
          {/* 题头 */}
          <View className="mb-6 p-4 rounded-2xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#FFEEDD,#FFFBF7)' }}>
            <View className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Text className="text-white text-2xl">✍️</Text>
            </View>
            <View>
              <Text className="text-2xl font-bold text-foreground">创作你的江湖令</Text>
              <Text className="text-xl text-muted-foreground mt-1">一文传千里，好物享江湖</Text>
            </View>
          </View>

          {/* 三种方式 */}
          <View className="flex flex-col gap-4 mb-6">
            {MODES.map(mode => (
              <View key={mode.key}
                onClick={() => handleChooseMode(mode.key)}
                className="p-4 rounded-2xl flex items-center gap-4"
                style={{ background: mode.bg, border: `2px solid ${mode.border}22`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <View className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: mode.border + '22' }}>
                  <Text className="text-3xl">{mode.emoji}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-2xl font-bold text-foreground">{mode.title}</Text>
                  <Text className="text-xl text-muted-foreground mt-1">{mode.desc}</Text>
                </View>
                <Icon name="chevron-right" size={24} className="text-muted-foreground" />
              </View>
            ))}
          </View>

          {/* 查看我的文章 */}
          <View className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3"
            onClick={() => Taro.navigateTo({ url: '/pages/content-center/my-articles/index' })}>
            <Icon name="text-box-multiple" size={24} className="text-primary" />
            <Text className="text-xl text-foreground flex-1">查看我的文章</Text>
            <Icon name="chevron-right" size={24} className="text-muted-foreground" />
          </View>
        </View>
      )}

      {/* ── 链接导入 ── */}
      {step === 'fetch' && (
        <View className="p-4">
          <View className="mb-4 p-3 rounded-xl bg-muted/50 flex items-start gap-2">
            <Icon name="information-outline" size={20} className="text-primary flex-shrink-0 mt-0.5" />
            <Text className="text-xl text-muted-foreground leading-relaxed">粘贴链接后自动识别来源平台，生成编辑模板，支持微信/知乎/小红书等</Text>
          </View>

          {/* 链接输入 */}
          <Text className="text-xl font-bold text-foreground mb-2">文章链接</Text>
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-4">
            <Input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="粘贴文章链接..."
              value={fetchUrl}
              onInput={(e) => { const ev = e as any; setFetchUrl(ev.detail?.value ?? ev.target?.value ?? '') }} />
          </View>

          <View
            className={`w-full flex items-center justify-center leading-none rounded-xl ${fetchLoading ? 'bg-primary/50' : 'bg-primary'}`}
            onClick={handleFetchArticle}>
            <View className="py-4 flex items-center gap-2">
              {fetchLoading
                ? <Icon name="loading" size={24} className="text-white animate-spin" />
                : <Icon name="download" size={24} className="text-white" />}
              <Text className="text-xl text-white font-bold">{fetchLoading ? '提取中...' : '提取内容'}</Text>
            </View>
          </View>

          {/* 提取结果 */}
          {fetchResult && (
            <View className="mt-4 p-4 rounded-2xl bg-card border-2 border-primary/30">
              <View className="flex items-center gap-2 mb-3">
                <Icon name="check-circle" size={24} className="text-primary" />
                <Text className="text-xl font-bold text-primary">提取成功</Text>
              </View>
              <Text className="text-2xl font-bold text-foreground mb-2">{fetchResult.title}</Text>
              <Text className="text-xl text-muted-foreground line-clamp-4 leading-relaxed">
                {fetchResult.content.slice(0, 150)}{fetchResult.content.length > 150 ? '...' : ''}
              </Text>

              {/* 图片预览 */}
              {fetchResult.images && fetchResult.images.length > 0 && (
                <View className="mt-3">
                  <View className="flex items-center gap-1 mb-2">
                    <Icon name="image-multiple" size={18} className="text-primary" />
                    <Text className="text-base font-bold text-primary">原文图片 ({fetchResult.images.length}张)</Text>
                  </View>
                  <ScrollView scrollX style={{ whiteSpace: 'nowrap' }} className="flex-row gap-2">
                    {fetchResult.images.slice(0, 9).map((imgUrl, idx) => (
                      <View key={idx}
                        className="flex-shrink-0 rounded-xl overflow-hidden"
                        style={{ width: '120px', height: '90px', position: 'relative' }}
                        onClick={() => {
                          // 点击预览大图
                          Taro.previewImage({ urls: fetchResult.images!, current: imgUrl })
                        }}>
                        <Image src={imgUrl} mode="aspectFill" style={{ width: '120px', height: '90px' }} lazyLoad />
                        <View style={{
                          position: 'absolute', bottom: 2, right: 4,
                          background: 'rgba(0,0,0,0.5)', borderRadius: '8px',
                          padding: '1px 6px'}}>
                          <Text style={{ fontSize: '10px', color: '#FFF' }}>🔍</Text>
                        </View>
                      </View>
                    ))}
                    {fetchResult.images.length > 9 && (
                      <View
                        className="flex-shrink-0 rounded-xl flex items-center justify-center"
                        style={{ width: '120px', height: '90px', background: '#F5F5F5' }}
                        onClick={() => {
                          Taro.previewImage({ urls: fetchResult.images!, current: fetchResult.images![9] })
                        }}>
                        <Text style={{ fontSize: '14px', color: '#999' }}>+{fetchResult.images.length - 9}张</Text>
                      </View>
                    )}
                  </ScrollView>
                  {/* 设为封面按钮 */}
                  {!coverImage && fetchResult.images[0] && (
                    <View
                      className="mt-2 flex items-center justify-center gap-1 py-2 rounded-lg bg-blue-50 border border-blue-200"
                      onClick={() => setCoverImage(fetchResult!.images![0])}>
                      <Icon name="image-plus" size={16} className="text-blue-600" />
                      <Text className="text-base text-blue-600 font-bold">用第1张图做封面</Text>
                    </View>
                  )}
                </View>
              )}

              <Text className="text-base text-muted-foreground mt-3 italic">💡 可在编辑页补充原文内容和你的观点</Text>
              <View
                className="mt-4 w-full flex items-center justify-center leading-none rounded-xl bg-primary"
                onClick={handleUseFetched}>
                <View className="py-4 flex items-center gap-2">
                  <Icon name="pencil" size={20} className="text-white" />
                  <Text className="text-xl text-white font-bold">使用此内容，开始编辑</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── 文章编辑 ── */}
      {step === 'edit' && (
        <View className="p-4">
          {/* 标题 */}
          <View className="mb-4">
            <Text className="text-xl font-bold text-foreground mb-2">
              文章标题 <Text className="text-destructive">*</Text>
            </Text>
            <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
              <Input
                className="w-full text-2xl text-foreground bg-transparent outline-none font-bold"
                placeholder="输入文章标题（吸引人的标题更容易传播）"
                value={title}
                onInput={(e) => { const ev = e as any; setTitle(ev.detail?.value ?? ev.target?.value ?? '') }} />
            </View>
          </View>

          {/* 内容 */}
          <View className="mb-4">
            <Text className="text-xl font-bold text-foreground mb-2">
              文章内容 <Text className="text-destructive">*</Text>
            </Text>
            <View className="border-2 border-input rounded-xl px-4 py-3 bg-card">
              <Textarea
                className="w-full text-xl text-foreground bg-transparent outline-none leading-relaxed"
                style={{ height: '40vw', minHeight: '200px' }}
                placeholder="在这里尽情挥毫，分享你的江湖见闻..."
                maxLength={5000}
                value={content}
                onInput={(e) => { const ev = e as any; setContent(ev.detail?.value ?? ev.target?.value ?? '') }} />
            </View>
            <Text className="text-right text-base text-muted-foreground mt-1">{wordCount}/5000</Text>
          </View>

          {/* 封面图 */}
          <View className="mb-6">
            <Text className="text-xl font-bold text-foreground mb-2">封面图（可选）</Text>
            {coverImage ? (
              <View className="relative rounded-xl overflow-hidden" style={{ height: '160px' }}>
                <Image src={coverImage} mode="aspectFill" className="w-full" style={{ height: '160px' }} />
                <View
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center"
                  onClick={() => setCoverImage(null)}>
                  <Icon name="close" size={20} className="text-white" />
                </View>
              </View>
            ) : (
              <View
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl bg-muted/30"
                style={{ height: '100px' }}
                onClick={handleChooseCover}>
                <Icon name="image-plus" size={30} className="text-muted-foreground" />
                <Text className="text-xl text-muted-foreground">选择封面图</Text>
              </View>
            )}
          </View>

          {/* 视频链接（可选） */}
          <View className="mb-6">
            <Text className="text-xl font-bold text-foreground mb-2">视频链接（可选）</Text>
            <View className="flex items-center gap-2">
              <View className="flex-1 border-2 border-input rounded-xl px-4 py-3 bg-card">
                <Input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="粘贴视频链接（mp4直链或B站/抖音等）"
                  value={videoUrl || ''}
                  onInput={(e: any) => setVideoUrl((e.detail?.value || e.target?.value || '').trim() || null)} />
              </View>
              {videoUrl && (
                <View
                  className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center flex-shrink-0"
                  onClick={() => setVideoUrl(null)}
                >
                  <Icon name="close" size={20} className="text-white" />
                </View>
              )}
            </View>
            <Text className="text-base text-muted-foreground mt-1">支持 mp4 直链视频（可播放）或外链（复制链接观看）</Text>
          </View>

          {/* 插入好物卡（文章内商品转化卡片） */}
          <View className="mb-6">
            <View className="flex items-center justify-between mb-2">
              <Text className="text-xl font-bold text-foreground">🛍️ 插入好物卡</Text>
              <View
                className="px-3 py-1.5 rounded-full bg-primary/10 flex items-center gap-1"
                onClick={openProductPicker}>
                <Icon name="plus" size={16} className="text-primary" />
                <Text className="text-base text-primary font-bold">选商品</Text>
              </View>
            </View>
            <Text className="text-base text-muted-foreground mb-2">选中商品会附在文末，读者读到此处可见情绪好物卡并直达购买。</Text>
            {insertedProducts.length > 0 ? (
              <View className="flex flex-col gap-2">
                {insertedProducts.map(pid => {
                  const p = productList.find(x => x.id === pid)
                  return (
                    <View key={pid} className="flex items-center gap-2 p-2 rounded-xl bg-card border border-border">
                      {p?.image_url ? (
                        <Image src={p.image_url} mode="aspectFill" className="w-12 h-12 rounded-lg flex-shrink-0" />
                      ) : (
                        <View className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Icon name="package-variant" size={20} className="text-muted-foreground" />
                        </View>
                      )}
                      <View className="flex-1 min-w-0">
                        <Text className="text-base font-bold text-foreground truncate block">{p?.name || '商品'}</Text>
                        {p?.product_emotion?.emotion_title && (
                          <Text className="text-sm text-primary truncate block">✨ {p.product_emotion.emotion_title}</Text>
                        )}
                      </View>
                      <View
                        className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center flex-shrink-0"
                        onClick={() => removeProductCard(pid)}>
                        <Icon name="close" size={16} className="text-muted-foreground" />
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : (
              <View className="p-3 rounded-xl bg-muted/30 border border-dashed border-border flex items-center gap-2">
                <Icon name="package-variant-closed" size={20} className="text-muted-foreground" />
                <Text className="text-base text-muted-foreground">尚未插入好物，点击右上「选商品」</Text>
              </View>
            )}
          </View>

          {/* 操作按钮 */}
          <View className="flex flex-col gap-3">
            {/* 发布按钮 */}
            <View
              className={`w-full flex items-center justify-center leading-none rounded-xl ${publishing ? 'bg-primary/50' : 'bg-primary'}`}
              onClick={handlePublish}>
              <View className="py-4 flex items-center gap-2">
                {publishing && <Icon name="loading" size={24} className="text-white animate-spin" />}
                <Text className="text-xl text-white font-bold">{publishing ? '发布中...' : (articleId ? '更新文章' : '发布文章')}</Text>
              </View>
            </View>

            <View className="flex gap-3">
              {/* 存草稿 */}
              <View
                className={`flex-1 flex items-center justify-center leading-none rounded-xl border-2 border-border bg-card ${saving ? 'opacity-50' : ''}`}
                onClick={handleSaveDraft}>
                <View className="py-3 flex items-center gap-2">
                  {saving && <Icon name="loading" size={20} className="text-foreground animate-spin" />}
                  <Text className="text-xl text-foreground">{saving ? '保存中...' : '存草稿'}</Text>
                </View>
              </View>
              {/* 返回重选 */}
              <View
                className="flex-1 flex items-center justify-center leading-none rounded-xl border-2 border-border bg-card"
                onClick={() => setStep('choose')}>
                <View className="py-3 text-xl text-muted-foreground">返回重选</View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── 商品选择器弹层（插入好物卡） ── */}
      {showProductPicker && (
        <View className="product-picker-mask" onClick={() => setShowProductPicker(false)}>
          <View className="product-picker-sheet" onClick={(e: any) => e.stopPropagation()}>
            <View className="picker-header">
              <Text className="text-2xl font-bold text-foreground">选择好物</Text>
              <View className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center" onClick={() => setShowProductPicker(false)}>
                <Icon name="close" size={20} className="text-muted-foreground" />
              </View>
            </View>

            {/* 搜索框 */}
            <View className="picker-search border-2 border-input rounded-xl px-4 py-2.5 bg-card mb-3">
              <Input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="搜索商品名 / 关键词"
                value={productSearch}
                onInput={(e: any) => handleProductSearch(e.detail?.value || e.target?.value || '')} />
            </View>

            {/* 列表 */}
            <ScrollView scrollY className="picker-list" enhanced showScrollbar={false}>
              {productLoading && (
                <View className="picker-empty">
                  <Icon name="loading" size={30} className="text-primary animate-spin" />
                  <Text className="text-base text-muted-foreground mt-2">搜索中...</Text>
                </View>
              )}
              {!productLoading && productList.length === 0 && (
                <View className="picker-empty">
                  <Icon name="package-variant" size={30} className="text-muted-foreground" />
                  <Text className="text-base text-muted-foreground mt-2">{productSearch ? '未找到相关商品' : '输入关键词搜索商品'}</Text>
                </View>
              )}
              {!productLoading && productList.map(p => {
                const inserted = insertedProducts.includes(p.id)
                return (
                  <View
                    key={p.id}
                    className={`picker-item ${inserted ? 'picker-item-disabled' : ''}`}
                    onClick={() => !inserted && insertProductCard(p)}>
                    {p.image_url ? (
                      <Image src={p.image_url} mode="aspectFill" className="picker-item-img" />
                    ) : (
                      <View className="picker-item-img bg-muted flex items-center justify-center">
                        <Icon name="package-variant" size={24} className="text-muted-foreground" />
                      </View>
                    )}
                    <View className="picker-item-body">
                      <Text className="text-xl font-bold text-foreground truncate block">{p.name}</Text>
                      {p.product_emotion?.emotion_title ? (
                        <Text className="text-base text-primary truncate block">✨ {p.product_emotion.emotion_title}</Text>
                      ) : (
                        <Text className="text-base text-muted-foreground truncate block">{p.store_name || '好物推荐'}</Text>
                      )}
                      <Text className="text-base text-destructive font-bold mt-0.5">¥{(p.price ?? 0).toFixed(2)}</Text>
                    </View>
                    {inserted ? (
                      <Text className="picker-item-tag text-sm text-muted-foreground">已插入</Text>
                    ) : (
                      <View className="picker-item-add">
                        <Icon name="plus" size={18} className="text-white" />
                      </View>
                    )}
                  </View>
                )
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  )
}
