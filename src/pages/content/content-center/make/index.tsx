// @title 创作中心
import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView, Input, Textarea, Video, Button } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { createArticle, updateArticle, searchProducts } from '@/db/api'
import { supabase } from '@/client/supabase'
import './index.scss'
import Icon from '@/components/Icon'
import { uploadToStorage } from '@/utils/upload'
import { useDebouncedCallback } from '@/utils/debounce'

type Step = 'choose' | 'fetch' | 'edit'
type EditMode = 'blank' | 'fetch' | 'template'

// 创作方式选择已移除（默认直达编辑）；模板仍由 TEMPLATES 提供


// 内置模板
const TEMPLATES = [
  { name: '探店推荐', content: '【探店地址】\n\n【环境氛围】\n\n【主推好物】\n\n【性价比评分】\n\n【总结】' },
  { name: '美食攻略', content: '【必点菜品】\n\n【口味描述】\n\n【人均消费】\n\n【排队情况】\n\n【推荐指数】⭐⭐⭐⭐⭐' },
  { name: '购物心得', content: '【购买理由】\n\n【使用体验】\n\n【优缺点分析】\n\n【适合人群】\n\n【是否回购】' },
  { name: '生活见闻', content: '【时间地点】\n\n【所见所闻】\n\n【心情感悟】\n\n【寄语】' },
]

export default function MakePage() {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('edit')
  const [editMode, setEditMode] = useState<EditMode>('blank')

  // 链接导入
  const [fetchUrl, setFetchUrl] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ title: string; content: string; images?: string[]; videos?: string[] } | null>(null)

  // 模板选择
  const [showTemplates, setShowTemplates] = useState(false)

  // 文章编辑
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoTemp, setVideoTemp] = useState<string | null>(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showVideoLink, setShowVideoLink] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
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

  // 防抖：实时搜索每输入一个字就打一次网络请求，300ms 内连续输入只发最后一次（解决「防抖/速度慢」）
  const debouncedProductSearch = useDebouncedCallback(handleProductSearch, 300)

  // ── 分享（预览页顶栏「分享」按钮触发页面级转发）──
  // 已存草稿/编辑已有文章 → 直接转发详情页链接；纯新草稿未保存 → 由预览页「分享」先存草稿再分享
  Taro.useShareAppMessage(() => {
    const t = (title && title.trim()) || '来电有喜 · 好文分享'
    const path = articleId
      ? `/pages/content/article-detail/index?id=${articleId}`
      : `/pages/content/content-center/make/index`
    return { title: t, path, imageUrl: coverImage || undefined }
  })
  // 朋友圈分享（部分基础库支持）
  ;(Taro as any).useShareTimeline?.((() => {
    const t = (title && title.trim()) || '来电有喜 · 好文分享'
    return { title: t, query: articleId ? `id=${articleId}` : '', imageUrl: coverImage || undefined }
  }) as any)
  useEffect(() => {
    Taro.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
  }, [])

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

  // 创作方式选择已移除（默认直达编辑）；模板仍由模板弹层提供


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
        setFetchResult({ title: data.title, content: cleanContent, images: data.images, videos: data.videos })
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
    const imgs = fetchResult.images || []
    const vids = fetchResult.videos || []
    // 把图片以内联 [[img:url]] token 追加到正文（公众号式图文混排）
    let body = fetchResult.content || ''
    if (imgs.length) {
      const imgTokens = imgs.map((u) => `[[img:${u}]]`).join('\n')
      body = body.trim() ? `${body.trim()}\n\n${imgTokens}` : imgTokens
    }
    setTitle(fetchResult.title)
    setContent(body)
    // 封面不强制取自提取图（避免误用 logo），由用户点「封面」自选；图片已内联展示
    setCoverImage(null)
    setArticleId(null)
    // 提取到的首条视频作为视频源
    setVideoUrl(vids[0] ?? null)
    // 保存提取的图片（写入 articles.images 列，作为详情页兜底）
    setFetchedImages(imgs)
    setStep('edit')
  }

  // 选封面图
  const handleChooseCover = () => {
    Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] }).then(res => {
      setCoverImage(res.tempFilePaths[0])
    }).catch(() => {})
  }

  // 选视频并上传到 Storage（复用 uploadToStorage，自动处理小程序 readFile→ArrayBuffer→上传）
  const handleChooseVideo = async () => {
    try {
      const res: any = await Taro.chooseMedia({
        count: 1,
        mediaType: ['video'],
        sourceType: ['album', 'camera'],
        maxDuration: 60,
      })
      const file = res?.tempFiles?.[0] || res?.tempFilePaths?.[0]
      const tempPath: string = typeof file === 'string' ? file : (file?.tempFilePath || '')
      if (!tempPath) return
      setVideoTemp(tempPath)
      setVideoUploading(true)
      const url = await uploadToStorage(tempPath, { bucket: 'videos' })
      if (url) {
        setVideoUrl(url)
        Taro.showToast({ title: '视频已上传', icon: 'success' })
      } else {
        Taro.showToast({ title: '上传失败，可贴视频链接', icon: 'none' })
      }
      setVideoUploading(false)
    } catch {
      setVideoUploading(false)
    }
  }

  // 返回：navigateTo 进入，优先返回上一页
  const handleBack = () => {
    Taro.navigateBack().catch(() => Taro.switchTab({ url: '/pages/index/index' }))
  }

  // 存草稿
  // 预览页「分享」：纯新草稿未保存时，先存草稿（拿到 articleId 才有可分享的详情链接），再提示再次点击分享
  const prepareShare = async () => {
    if (articleId) return
    if (!title.trim()) { Taro.showToast({ title: '请先填写标题', icon: 'none' }); return }
    await handleSaveDraft()
    Taro.showToast({ title: '草稿已存，再点分享', icon: 'none' })
  }

  const handleSaveDraft = async () => {
    if (!title.trim()) { Taro.showToast({ title: '请填写标题', icon: 'none' }); return }
    setSaving(true)
    try {
      
      if (articleId) {
        await updateArticle(articleId, { title, content, status: 'draft', images: fetchedImages, video_url: videoUrl })
        Taro.showToast({ title: '草稿已更新', icon: 'success' })
      } else {
        const art = await createArticle(title, content, fetchedImages, [], { status: 'draft', cover_image: coverImage ?? undefined, video_url: videoUrl ?? undefined })
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
      
      if (articleId) {
        await updateArticle(articleId, { title, content, status: 'published', cover_image: coverImage ?? undefined, images: fetchedImages, video_url: videoUrl })
      } else {
        const art = await createArticle(title, content, fetchedImages, [], { status: 'published', cover_image: coverImage ?? undefined, video_url: videoUrl ?? undefined })
        if (art?.id) setArticleId(art.id)
      }
      
      Taro.showToast({ title: '发布成功！', icon: 'success' })
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/content/content-center/my-articles/index?tab=published' })
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
      Taro.setNavigationBarTitle({ title: '写文章' })
    }
  }, [showTemplates])

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
    <View className="min-h-screen bg-background mk-page">
      {/* 顶栏：我的文章入口（解决「发过的文章模块」找不到） */}
      <View className="mk-topbar">
        <View className="mk-topbar-my" hoverClass="none" onClick={() => Taro.navigateTo({ url: '/pages/content/content-center/my-articles/index' })}>
          <Icon name="file-document" size={20} className="text-primary" />
          <Text className="text-sm text-primary">我的文章</Text>
        </View>
      </View>

      {/* 创作方式选择已整合为编辑页内嵌入口（顶部「导入文章」+ 工具栏「模板」），默认直达编辑 */}

      {/* 链接导入已整合为编辑页内嵌「导入文章」入口（见下方 showImport 折叠区） */}

      {/* ── 沉浸式编辑器：直达编辑，无前置选择（系统导航栏管标题与返回） ── */}

      {/* 链接导入（内嵌折叠入口） */}
      {showImport && (
        <View className="mk-import">
          <View className="flex items-center justify-between mb-2">
            <Text className="text-xl font-bold text-foreground">导入文章链接</Text>
            <View className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center" hoverClass="none" onClick={() => setShowImport(false)}>
              <Icon name="close" size={20} className="text-muted-foreground" />
            </View>
          </View>
          <View className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-3">
            <Input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="粘贴文章链接..."
              value={fetchUrl}
              onInput={(e: any) => setFetchUrl(e.detail?.value || e.target?.value || '')} />
          </View>
          <View
            className={`w-full flex items-center justify-center leading-none rounded-xl ${fetchLoading ? 'bg-primary/50' : 'bg-primary'}`}
            hoverClass="none"
            onClick={handleFetchArticle}>
            <View className="py-3 flex items-center gap-2">
              {fetchLoading ? <Icon name="loading" size={22} className="text-white animate-spin" /> : <Icon name="download" size={22} className="text-white" />}
              <Text className="text-xl text-white font-bold">{fetchLoading ? '提取中...' : '提取内容'}</Text>
            </View>
          </View>
          {fetchResult && (
            <View className="mt-3 p-3 rounded-xl bg-card border border-primary/30">
              <Text className="text-lg font-bold text-foreground mb-1">{fetchResult.title}</Text>
              <Text className="text-base text-muted-foreground line-clamp-3">{fetchResult.content.slice(0, 120)}{fetchResult.content.length > 120 ? '...' : ''}</Text>
              <View
                className="mt-2 w-full flex items-center justify-center leading-none rounded-lg bg-primary"
                hoverClass="none"
                onClick={handleUseFetched}>
                <View className="py-2 flex items-center gap-2">
                  <Icon name="pencil" size={18} className="text-white" />
                  <Text className="text-base text-white font-bold">使用此内容</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 编辑主体 */}
      <View className="mk-body">
        {/* 顶部：导入文章入口 */}
        <View className="mk-import-entry" hoverClass="none" onClick={() => setShowImport(true)}>
          <Icon name="link-variant" size={18} className="text-primary" />
          <Text className="text-base text-primary">导入文章链接 / 转载</Text>
        </View>

        {/* 标题 */}
        <View className="mb-3">
          <Input
            className="mk-title-input w-full text-foreground bg-transparent outline-none font-bold"
            placeholder="起个响亮标题"
            value={title}
            onInput={(e) => { const ev = e as any; setTitle(ev.detail?.value ?? ev.target?.value ?? '') }} />
        </View>

        {/* 内容 */}
        <View className="mb-4">
          <Textarea
            className="mk-content w-full text-foreground bg-transparent outline-none leading-relaxed"
            style={{ height: '44vh', minHeight: '240px' }}
            placeholder="在这里尽情挥毫，分享你的生活见闻..."
            maxLength={10000}
            value={content}
            onInput={(e) => { const ev = e as any; setContent(ev.detail?.value ?? ev.target?.value ?? '') }} />
          <Text className="text-right text-sm text-muted-foreground mt-1">{wordCount}/10000</Text>
        </View>

        {/* 媒体预览：封面 + 视频 */}
        <View className="mk-media-row">
          {coverImage && (
            <View className="mk-media-thumb">
              <Image src={coverImage} mode="aspectFill" className="w-full h-full" />
              <View className="mk-media-del" hoverClass="none" onClick={() => setCoverImage(null)}>
                <Icon name="close" size={16} className="text-white" />
              </View>
            </View>
          )}
          {(videoTemp || videoUrl) && (
            <View className="mk-media-thumb mk-media-video">
              <Video src={videoTemp || videoUrl || ''} className="w-full h-full" controls={false} />
              {videoUploading && (
                <View className="mk-media-loading"><Icon name="loading" size={20} className="text-white animate-spin" /></View>
              )}
              <View className="mk-media-del" hoverClass="none" onClick={() => { setVideoUrl(null); setVideoTemp(null) }}>
                <Icon name="close" size={16} className="text-white" />
              </View>
            </View>
          )}
        </View>

        {/* 视频链接备选（上传之外，也可直接贴外链） */}
        <View className="mt-2">
          <View className="flex items-center gap-1.5" hoverClass="none" onClick={() => setShowVideoLink(v => !v)}>
            <Icon name="link-variant" size={16} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">或粘贴视频链接</Text>
          </View>
          {showVideoLink && (
            <View className="mt-2 flex items-center gap-2">
              <View className="flex-1 border-2 border-input rounded-xl px-3 py-2 bg-card">
                <Input
                  className="w-full text-base text-foreground bg-transparent outline-none"
                  placeholder="mp4 直链或 B站/抖音链接"
                  value={videoUrl || ''}
                  onInput={(e: any) => setVideoUrl((e.detail?.value || e.target?.value || '').trim() || null)} />
              </View>
            </View>
          )}
        </View>

        {/* 已插入好物卡 */}
        {insertedProducts.length > 0 && (
          <View className="mt-2 flex flex-col gap-2">
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
                    {p?.store_name && <Text className="text-sm text-muted-foreground truncate block">{p.store_name}</Text>}
                  </View>
                  <View className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center flex-shrink-0" hoverClass="none" onClick={() => removeProductCard(pid)}>
                    <Icon name="close" size={16} className="text-muted-foreground" />
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* 底部固定工具栏：封面 / 视频 / 好物 / 模板（已添加项高亮） */}
      <View className="mk-toolbar">
        <View className={`mk-tool ${coverImage ? 'mk-tool-active' : ''}`} hoverClass="none" onClick={handleChooseCover}>
          <Icon name="image-plus" size={22} className={coverImage ? 'text-primary' : 'text-foreground'} />
          <Text className={`text-xs mt-1 ${coverImage ? 'text-primary' : 'text-muted-foreground'}`}>封面</Text>
        </View>
        <View className={`mk-tool ${(videoTemp || videoUrl) ? 'mk-tool-active' : ''}`} hoverClass="none" onClick={handleChooseVideo}>
          <Icon name="video-plus" size={22} className={(videoTemp || videoUrl) ? 'text-primary' : 'text-foreground'} />
          <Text className={`text-xs mt-1 ${(videoTemp || videoUrl) ? 'text-primary' : 'text-muted-foreground'}`}>视频</Text>
        </View>
        <View className={`mk-tool ${insertedProducts.length > 0 ? 'mk-tool-active' : ''}`} hoverClass="none" onClick={openProductPicker}>
          <Icon name="package-variant" size={22} className={insertedProducts.length > 0 ? 'text-primary' : 'text-foreground'} />
          <Text className={`text-xs mt-1 ${insertedProducts.length > 0 ? 'text-primary' : 'text-muted-foreground'}`}>好物</Text>
        </View>
        <View className="mk-tool" hoverClass="none" onClick={() => setShowTemplates(true)}>
          <Icon name="file-document" size={22} className="text-foreground" />
          <Text className="text-xs text-muted-foreground mt-1">模板</Text>
        </View>
        <View className={`mk-tool ${showPreview ? 'mk-tool-active' : ''}`} hoverClass="none" onClick={() => setShowPreview(true)}>
          <Icon name="eye" size={22} className={showPreview ? 'text-primary' : 'text-foreground'} />
          <Text className={`text-xs mt-1 ${showPreview ? 'text-primary' : 'text-muted-foreground'}`}>预览</Text>
        </View>
      </View>

      {/* 底部固定发布区：存草稿 + 发布（发布占主权重 2:1） */}
      <View className="mk-publish">
        <View className="flex gap-3">
          <View style={{ flex: 1 }} className={`flex items-center justify-center leading-none rounded-2xl border-2 border-border bg-card ${saving ? 'opacity-50' : ''}`} hoverClass="none" onClick={handleSaveDraft}>
            <View className="py-3 flex items-center gap-2">
              {saving && <Icon name="loading" size={18} className="text-foreground animate-spin" />}
              <Text className="text-lg text-foreground">{saving ? '保存中' : '草稿'}</Text>
            </View>
          </View>
          <View style={{ flex: 2 }} className={`flex items-center justify-center leading-none rounded-2xl ${publishing ? 'bg-primary/50' : 'bg-primary'}`} hoverClass="none" onClick={handlePublish}>
            <View className="py-3 flex items-center gap-2">
              {publishing && <Icon name="loading" size={18} className="text-white animate-spin" />}
              <Text className="text-lg text-white font-bold">{publishing ? '发布中' : (articleId ? '更新文章' : '发布文章')}</Text>
            </View>
          </View>
        </View>
      </View>

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
                onInput={(e: any) => debouncedProductSearch(e.detail?.value || e.target?.value || '')} />
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

      {/* ── 实时预览弹层（公众号式：无需保存即可看真实排版） ── */}
      {showPreview && (
        <PreviewSheet
          title={title}
          content={content}
          coverImage={coverImage}
          videoUrl={videoUrl || videoTemp}
          articleId={articleId}
          onPrepareShare={prepareShare}
          onClose={() => setShowPreview(false)}
        />
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// 实时预览弹层：本地(未保存)渲染当前 标题/封面/图片/视频/商品卡
// 与详情页渲染逻辑一致，关掉即可继续编辑。
// ─────────────────────────────────────────────
type PreviewPart =
  | { type: 'text'; value: string }
  | { type: 'img'; url: string }
  | { type: 'video'; url: string }
  | { type: 'product'; id: string }

function parsePreviewContent(content: string): PreviewPart[] {
  if (!content) return []
  const raw = content.split(/(\[\[img:[^\]]+\]\]|\[\[video:[^\]]+\]\]|\[\[product:[\w-]+\]\])/g)
  const parts: PreviewPart[] = []
  for (const seg of raw) {
    if (!seg) continue
    let m = seg.match(/^\[\[img:([^\]]+)\]\]$/)
    if (m) { parts.push({ type: 'img', url: m[1] }); continue }
    m = seg.match(/^\[\[video:([^\]]+)\]\]$/)
    if (m) { parts.push({ type: 'video', url: m[1] }); continue }
    m = seg.match(/^\[\[product:([\w-]+)\]\]$/)
    if (m) { parts.push({ type: 'product', id: m[1] }); continue }
    if (seg.trim() !== '') parts.push({ type: 'text', value: seg })
  }
  return parts
}

// 预览内商品卡（拉取商品详情）
function PreviewProductCard({ productId }: { productId: string }) {
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    getProductById(productId)
      .then((p) => { if (alive) { setProduct(p); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [productId])
  if (loading) {
    return <View className="apc-skeleton"><View className="apc-skeleton-img" /><View className="apc-skeleton-line" /></View>
  }
  if (!product) {
    return (
      <View className="apc-fallback">
        <Text className="apc-fallback-text">好物卡片（商品可能已下架）</Text>
      </View>
    )
  }
  const emo = product.product_emotion
  return (
    <View className="article-product-card">
      <View className="apc-media">
        {product.image_url ? (
          <Image src={product.image_url} mode="aspectFill" className="apc-img" />
        ) : (
          <View className="apc-img apc-img-fallback"><Icon name="package-variant" size={30} className="text-muted-foreground" /></View>
        )}
        <View className="apc-badge">🛍️ 好物推荐</View>
      </View>
      <View className="apc-body">
        {emo?.emotion_title && <Text className="apc-emotion">✨ {emo.emotion_title}</Text>}
        <Text className="apc-name">{product.name}</Text>
        <View className="apc-foot">
          <Text className="apc-price">¥{(product.price ?? 0).toFixed(2)}</Text>
          <View className="apc-cta">立即拥有 ›</View>
        </View>
      </View>
    </View>
  )
}

function PreviewSheet({ title, content, coverImage, videoUrl, articleId, onPrepareShare, onClose }: {
  title: string; content: string; coverImage: string | null; videoUrl: string | null
  articleId: string | null; onPrepareShare: () => void; onClose: () => void
}) {
  const parts = parsePreviewContent(content)
  return (
    <View className="preview-mask">
      <View className="preview-sheet">
        {/* 顶栏：标题在左，分享 + 关闭在右 */}
        <View className="preview-bar">
          <Text className="preview-bar-title">预览</Text>
          <View className="preview-bar-actions">
            {articleId ? (
              <Button openType="share" className="preview-bar-share" hoverClass="none">
                <Icon name="share-variant" size={20} className="text-foreground" />
              </Button>
            ) : (
              <View className="preview-bar-share" hoverClass="none" onClick={onPrepareShare}>
                <Icon name="share-variant" size={20} className="text-foreground" />
              </View>
            )}
            <View className="preview-bar-close" hoverClass="none" onClick={onClose}>
              <Icon name="close" size={22} className="text-foreground" />
            </View>
          </View>
        </View>
        {/* 内容 */}
        <ScrollView scrollY className="preview-scroll" enhanced showScrollbar={false}>
          {coverImage && (
            <Image src={coverImage} mode="aspectFill" className="preview-cover" />
          )}
          <Text className="preview-title">{title || '未命名标题'}</Text>
          {parts.length === 0 && (
            <Text className="preview-empty">还没有内容，写点什么再预览吧～</Text>
          )}
          {parts.map((part, idx) => {
            if (part.type === 'img') {
              return (
                <Image
                  key={idx}
                  src={part.url}
                  mode="widthFix"
                  className="preview-img"
                  onClick={() => Taro.previewImage({ urls: [part.url], current: part.url })}
                />
              )
            }
            if (part.type === 'video') {
              return (
                <View key={idx} className="preview-video-bar">
                  <Icon name="video" size={18} className="text-primary" />
                  <Text className="preview-video-text">视频：{part.url.slice(0, 40)}{part.url.length > 40 ? '…' : ''}</Text>
                </View>
              )
            }
            if (part.type === 'product') {
              return <PreviewProductCard key={idx} productId={part.id} />
            }
            return (
              <Text key={idx} className="preview-text">{part.value}</Text>
            )
          })}
          {videoUrl && parts.length > 0 && (
            <View className="preview-video-bar">
              <Icon name="video" size={18} className="text-primary" />
              <Text className="preview-video-text">本文包含视频内容</Text>
            </View>
          )}
          <View className="safe-bottom" />
        </ScrollView>
      </View>
    </View>
  )
}
