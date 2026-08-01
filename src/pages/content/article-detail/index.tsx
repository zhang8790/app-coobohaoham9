// @title 文章详情页 - 公众号风格
import { useState, useEffect, useRef } from 'react'
import Taro, {} from '@tarojs/taro'
import { View, Text, Image, ScrollView, RichText, Button, Canvas, Video } from '@tarojs/components'
import './index.scss'

import { useAuth } from '@/contexts/AuthContext'
import { getArticleById, incrementArticleView, getArticles, getProductById, getProducts, toggleArticleFavorite, isArticleFavorited, toggleAuthorFollow, isFollowingAuthor, toggleArticleLike, isArticleLiked, getArticleLikeCount, incrementArticleShare, addEmotionTongbao, grantEmotionBadge, getArticleShareCode } from '@/db/api'
import { handleInviterFromQuery, buildArticleShareTitle, getMyReferralCode } from '@/utils/share'
import { generateArticleSharePoster, POSTER_WIDTH, POSTER_HEIGHT, generateArticleCodePoster, CODE_POSTER_WIDTH, CODE_POSTER_HEIGHT } from '@/utils/share-poster'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import Icon from '@/components/Icon'

const SHARE_REWARD = 1 // 分享得金豆（健康豆，1:1 元）

export default function ArticleDetailPage() {
  const { user } = useAuth()
  const [article, setArticle] = useState<any>(null)
  const [relatedArticles, setRelatedArticles] = useState<any[]>([])
  const [recProducts, setRecProducts] = useState<any[]>([])
  const [recProdLoading, setRecProdLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isFavorited, setIsFavorited] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const viewedRef = useRef(false)

  const instance = Taro.getCurrentInstance()
  const articleId = instance.router?.params?.id

  // 分享钩子
  const shareTitle = buildArticleShareTitle(article)
  const [sharePosterUrl, setSharePosterUrl] = useState<string>('')
  const [savingPoster, setSavingPoster] = useState(false)

  // 文章加载成功后，异步生成分享海报
  useEffect(() => {
    if (!article) return
    let alive = true
    const timer = setTimeout(() => {
      generateArticleSharePoster(article, 'articleShareCanvas')
        .then((url) => {
          if (alive) setSharePosterUrl(url)
        })
        .catch((err) => {
          console.warn('[文章分享] 生成海报失败，回退到封面图', err)
        })
    }, 500)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [article])

  useShareWithReferral({
    title: shareTitle,
    path: `/pages/content/article-detail/index?id=${articleId}`,
    imageUrl: sharePosterUrl || article?.cover_image || '',
    timelineTitle: shareTitle,
    timelineQuery: `id=${articleId}`})

  // 获取当前城市名称
  const getCityName = () => {
    try {
      const cityData = Taro.getStorageSync('current_city')
      return cityData?.name || '未知'
    } catch {
      return '未知'
    }
  }

  useEffect(() => {
    if (!articleId) {
      setError('文章不存在')
      setLoading(false)
      return
    }
    handleInviterFromQuery()
    loadArticle()
  }, [articleId])

  // ── 锁客（本产品图文的唯一目的：成交在线下，图文只负责把人锁住）──
  // 双保险：① 分享链接带推广码 → 绑推广链；② 无论有无码，只要读到这篇图文就把作者锁为上级
  const lockedRef = useRef(false)
  useEffect(() => {
    if (!article || !user || lockedRef.current) return
    lockedRef.current = true

    const query = instance.router?.params || {}
    // 兼容历史已分享出去的 from= 链接（早期「我的创作」用的是 from）
    const inviterCode = (query as any).ref || (query as any).inviter || (query as any).from

    import('@/db/api').then(({ lockCustomerByArticle, lockCustomerByArticleId }) => {
      // ① 带码：优先按推广码绑定（谁分享算谁的）
      if (inviterCode) {
        lockCustomerByArticle((article as any).store_id, inviterCode).catch(() => {})
      }
      // ② 图文锁客：记录本篇锁到的客，访客若还没上级则认作者为上级
      lockCustomerByArticleId(article.id).then(res => {
        if (res.is_new_customer && res.first_visit) {
          console.log('[锁客] 本篇图文锁定新客成功')
        }
      }).catch(() => {})
    })
  }, [article, user])

  const loadArticle = async () => {
    try {
      setLoading(true)
      const data = await getArticleById(articleId!)
      if (!data) {
        setError('文章不存在或已下架')
      } else if ((data as any).is_published === false && data.user_id !== user?.id) {
        // 下架即分享链接失效：非作者访问已下架内容 → 占位页（作者自己仍可预览草稿）
        setError('该内容已下架')
      } else {
        setArticle(data)

        // 拉取当前用户对该文章的收藏/关注作者状态（报告 P3 内容闭环）
        isArticleFavorited(articleId!).then(setIsFavorited).catch(() => {})
        if (data.user_id) isFollowingAuthor(data.user_id).then(setIsFollowing).catch(() => {})
        isArticleLiked(articleId!).then(setIsLiked).catch(() => {})
        getArticleLikeCount(articleId!).then(setLikeCount).catch(() => {})

        if (!viewedRef.current) {
          viewedRef.current = true
          incrementArticleView(articleId!).catch(() => {})
        }

        loadRelatedArticles(data)
        // 异步加载推荐商品（基于文章标签）
        loadRecProducts(data)
      }
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 基于文章标签推荐商品
  const loadRecProducts = async (currentArticle: any) => {
    setRecProdLoading(true)
    try {
      const tags = currentArticle.tags || []
      const kw = tags.length > 0 ? tags[0] : (currentArticle.title || '').slice(0, 8)
      const products = await getProducts({ search: kw, limit: 4 })
      setRecProducts(products.filter(p => p.is_active).slice(0, 3))
    } catch {}
    setRecProdLoading(false)
  }

  const loadRelatedArticles = async (currentArticle: any) => {
    try {
      const data = await getArticles(0, 10)
      if (!data) return
      const related = data
        .filter((a: any) => a.id !== currentArticle.id)
        .filter((a: any) => {
          if (currentArticle.tags?.length > 0) {
            return a.tags?.some((t: string) => currentArticle.tags.includes(t))
          }
          return a.user_id === currentArticle.user_id
        })
        .slice(0, 4)
      setRelatedArticles(related)
    } catch {}
  }

  const handleFavorite = async () => {
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const { isFav } = await toggleArticleFavorite(articleId!)
    setIsFavorited(isFav)
    Taro.showToast({
      title: isFav ? '收藏成功' : '已取消收藏',
      icon: 'success'})
  }

  const handleFollow = async () => {
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (!article?.user_id) return
    const { isFollowing: f } = await toggleAuthorFollow(article.user_id)
    setIsFollowing(f)
    Taro.showToast({
      title: f ? '已关注作者' : '已取消关注',
      icon: 'success'})
  }

  const handleLike = async () => {
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (!articleId) return
    const { isLiked: liked } = await toggleArticleLike(articleId)
    setIsLiked(liked)
    setLikeCount(c => (liked ? c + 1 : Math.max(0, c - 1)))
    Taro.showToast({ title: liked ? '点赞了' : '已取消', icon: 'none' })
  }

  const handleShare = () => {
    // 分享时发奖励：分享自增 + 分享者得金豆 + 首次分享徽章
    if (articleId) {
      incrementArticleShare(articleId).catch(() => {})
      if (user?.id) {
        addEmotionTongbao(user.id, SHARE_REWARD, 'share_invite', articleId, '分享文章').catch(() => {})
        grantEmotionBadge(user.id, 'first_share').catch(() => {})
      }
    }
    Taro.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
  }

  // 朋友圈锁客海报：生成带小程序码的海报并保存到相册
  const handleSavePoster = async () => {
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (!articleId || savingPoster) return
    setSavingPoster(true)
    try {
      Taro.showLoading({ title: '生成海报…' })
      const myCode = await getMyReferralCode().catch(() => '')
      const { code } = await getArticleShareCode(articleId, myCode)
      const filePath = await generateArticleCodePoster(article, 'articleCodePosterCanvas', code)
      Taro.hideLoading()
      await savePosterToAlbum(filePath)
    } catch (e: any) {
      Taro.hideLoading()
      Taro.showToast({ title: e?.message || '生成失败', icon: 'none' })
    } finally {
      setSavingPoster(false)
    }
  }

  const savePosterToAlbum = async (filePath: string) => {
    try {
      await Taro.saveImageToPhotosAlbum({ filePath })
      Taro.showToast({ title: '海报已保存到相册', icon: 'success' })
    } catch (e: any) {
      const msg: string = e?.errMsg || ''
      if (msg.includes('auth') || msg.includes('deny')) {
        const r = await Taro.showModal({
          title: '需要相册权限',
          content: '保存海报需要授权相册，是否去设置开启？',
          confirmText: '去设置' })
        if (r.confirm) Taro.openSetting({})
      } else {
        Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    }
  }

  if (loading) {
    return (
      <View className="article-loading">
        <View className="loading-spinner" />
      </View>
    )
  }

  if (error || !article) {
    return (
      <View className="article-error">
        <Text className="error-icon">📭</Text>
        <Text className="error-text">{error || '文章不存在'}</Text>
        <View className="error-btn" onClick={() => Taro.navigateBack()}>
          <Text className="error-btn-text">返回</Text>
        </View>
      </View>
    )
  }

  const profile = article.profiles || {}
  const coverImage = article.cover_image
  const hasCover = !!coverImage

  return (
    <View className="article-page">
      <ScrollView scrollY className="article-scroll" enhanced showScrollbar={false}>

        {/* ===== 封面大图 + 标题叠加（公众号风格） ===== */}
        {hasCover && (
          <View className="hero-section">
            <Image
              src={coverImage}
              mode="aspectFill"
              className="hero-image" />
            {/* 渐变遮罩 */}
            <View className="hero-gradient" />
            {/* 标题叠加在封面上 */}
            <View className="hero-title-wrap">
              <Text className="hero-title">{article.title}</Text>
            </View>
          </View>
        )}

        {/* ===== 如果没有封面图，标题直接显示 ===== */}
        {!hasCover && (
          <View className="title-no-cover">
            <Text className="title-no-cover-text">{article.title}</Text>
          </View>
        )}

        {/* ===== 作者信息栏（公众号风格：小字号、灰色） ===== */}
        <View className="author-bar">
          <View className="author-left">
            <View className="author-avatar">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  className="avatar-img"
                  mode="aspectFill" />
              ) : (
                <View className="avatar-default">
                  <Text className="avatar-default-text">
                    {(profile.nickname || '喜')[0]}
                  </Text>
                </View>
              )}
            </View>
            <View className="author-meta">
              <Text className="author-name">
                {profile.nickname || '匿名用户'}
              </Text>
              <Text className="author-date">
                {new Date(article.created_at).toLocaleDateString('zh-CN', {
                  month: 'long',
                  day: 'numeric'})}
                {' · '}
                {article.view_count || 0} 阅读
              </Text>
            </View>
          </View>

          {/* 收藏按钮 */}
          <View
            className={`fav-btn ${isFavorited ? 'fav-active' : ''}`}
            onClick={handleFavorite}
          >
            <Text className="fav-btn-icon">{isFavorited ? '★' : '☆'}</Text>
            <Text className="fav-btn-text">
              {isFavorited ? '已收藏' : '收藏'}
            </Text>
          </View>

          {/* 关注作者（报告 P3） */}
          <View
            className={`fav-btn ${isFollowing ? 'fav-active' : ''}`}
            style={{ marginLeft: 10 }}
            onClick={handleFollow}
          >
            <Text className="fav-btn-icon">{isFollowing ? '✓' : '＋'}</Text>
            <Text className="fav-btn-text">
              {isFollowing ? '已关注' : '关注'}
            </Text>
          </View>
        </View>

        {/* ===== 标签 ===== */}
        {article.tags && article.tags.length > 0 && (
          <View className="tags-bar">
            {article.tags.map((tag: string, idx: number) => (
              <Text key={idx} className="tag-chip">#{tag}</Text>
            ))}
          </View>
        )}

        {/* ===== 情绪食养配方卡标识 ===== */}
        {(article as any).mood_tag && (
          <View className="mx-4 mt-3 p-3 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-3">
            <Text className="text-2xl">💭</Text>
            <View className="flex-1">
              <Text className="text-lg font-bold text-foreground">情绪食养配方 · {(article as any).mood_tag}</Text>
              <Text className="text-sm text-muted-foreground">这一刻的心情，值得被好好对待</Text>
            </View>
          </View>
        )}

        {/* ===== 正文内容（公众号风格排版） ===== */}
        <View className="content-body">
          {/* 视频：有 video_url 直接内联播放器（发布视频入口产出） */}
          {article.video_url && <InlineVideo url={article.video_url} />}

          {/* 图片列表（仅当正文未内联图片时展示，避免与 [[img:]] 重复） */}
          {article.images && article.images.length > 0 && !/\[\[img:/.test(article.content || '') && (
            <View className="content-images">
              {article.images.map((imgUrl: string, idx: number) => (
                <Image
                  key={idx}
                  src={imgUrl}
                  mode="widthFix"
                  className="content-img"
                  onClick={() =>
                    Taro.previewImage({
                      urls: article.images,
                      current: imgUrl})
                  } />
              ))}
            </View>
          )}

          {/* HTML 正文 - 使用 RichText，文中商品卡占位符会被替换成商品卡组件 */}
          {article.content && (
            <ArticleContentWithProducts content={article.content} articleId={articleId} />
          )}
        </View>

        {/* ===== 底部操作栏 ===== */}
        <View className="bottom-actions">
          <View
            className={`action-item ${isLiked ? 'action-active' : ''}`}
            onClick={handleLike}
          >
            <Text className="action-icon">{isLiked ? '❤' : '♡'}</Text>
            <Text className="action-label">{likeCount > 0 ? likeCount : '点赞'}</Text>
          </View>
          <Button openType="share" className="action-item action-share-btn" onClick={handleShare}>
            <Text className="action-icon">↗</Text>
            <Text className="action-label">分享</Text>
          </Button>
          <View
            className={`action-item ${isFavorited ? 'action-active' : ''}`}
            onClick={handleFavorite}
          >
            <Text className="action-icon">{isFavorited ? '★' : '☆'}</Text>
            <Text className="action-label">
              {isFavorited ? '已收藏' : '收藏'}
            </Text>
          </View>
          <View
            className="action-item"
            onClick={handleSavePoster}
          >
            <Text className="action-icon">{savingPoster ? '⏳' : '🖼'}</Text>
            <Text className="action-label">{savingPoster ? '生成中' : '海报'}</Text>
          </View>
          <View
            className="action-item"
            onClick={() => {
              Taro.pageScrollTo({ scrollTop: 0, duration: 300 })
            }}
          >
            <Text className="action-icon">↑</Text>
            <Text className="action-label">顶部</Text>
          </View>
        </View>

        {/* ===== 相关推荐 ===== */}
        {relatedArticles.length > 0 && (
          <View className="related-section">
            <View className="related-header">
              <View className="related-header-line" />
              <Text className="related-header-text">相关推荐</Text>
              <View className="related-header-line" />
            </View>
            <View className="related-list">
              {relatedArticles.map((item: any) => (
                <View
                  key={item.id}
                  className="related-card"
                  onClick={() => {
                    Taro.navigateTo({
                      url: `/pages/content/article-detail/index?id=${item.id}`})
                  }}
                >
                  {item.cover_image && (
                    <Image
                      src={item.cover_image}
                      mode="aspectFill"
                      className="related-card-img" />
                  )}
                  <View className="related-card-body">
                    <Text className="related-card-title">{item.title}</Text>
                    <Text className="related-card-meta">
                      {item.profiles?.nickname || '匿名'}
                      {' · '}
                      {item.view_count || 0} 阅读
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ===== 好物推荐（内容→商品闭环） ===== */}
        {recProducts.length > 0 && (
          <View className="related-section">
            <View className="related-header">
              <View className="related-header-line" />
              <Text className="related-header-text">🛍️ 好物推荐</Text>
              <View className="related-header-line" />
            </View>
            <View className="related-list">
              {recProducts.map((item: any) => (
                <View
                  key={item.id}
                  className="related-card"
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${encodeURIComponent(item.id)}` })}
                >
                  {(item.image_url || item.main_image) && (
                    <Image
                      src={item.image_url || item.main_image}
                      mode="aspectFill"
                      className="related-card-img" />
                  )}
                  <View className="related-card-body">
                    <Text className="related-card-title">{item.name}</Text>
                    <Text className="related-card-meta" style={{ color: '#dc2626', fontWeight: '700' }}>
                      ¥{(item.price || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ===== 底部账号信息（公众号风格） ===== */}
        <View className="account-footer">
          <View className="account-line" />
          <Text className="account-name">来电有喜</Text>
          <Text className="account-desc">好物推荐</Text>
        </View>

        <View className="safe-bottom" />
      </ScrollView>

      {/* 隐藏 Canvas：用于绘制文章分享海报 */}
      <Canvas
        type="2d"
        id="articleShareCanvas"
        className="share-canvas-hidden"
        style={{ width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px` }} />
      {/* 隐藏 Canvas：用于绘制带小程序码的朋友圈海报 */}
      <Canvas
        type="2d"
        id="articleCodePosterCanvas"
        className="share-canvas-hidden"
        style={{ width: `${CODE_POSTER_WIDTH}px`, height: `${CODE_POSTER_HEIGHT}px` }} />
    </View>
  )
}

// ─────────────────────────────────────────────
// 文中商品卡：把 content 里的 [[product:ID]] 占位符替换成可点击的商品卡
// ─────────────────────────────────────────────
type ContentPart =
  | { type: 'product'; id: string }
  | { type: 'img'; url: string }
  | { type: 'video'; url: string }
  | { type: 'h1'; value: string }
  | { type: 'h2'; value: string }
  | { type: 'quote'; value: string }
  | { type: 'tip'; value: string }
  | { type: 'hr' }
  | { type: 'text'; value: string }

// 块编辑器 token：[[h1:]] [[h2:]] [[quote:]] [[tip:]] [[hr]] 与既有 [[img:]] [[video:]] [[product:]] 并存
const TOKEN_SPLIT_RE =
  /(\[\[img:[^\]]+\]\]|\[\[video:[^\]]+\]\]|\[\[product:[\w-]+\]\]|\[\[h1:[^\]]+\]\]|\[\[h2:[^\]]+\]\]|\[\[quote:[^\]]+\]\]|\[\[tip:[^\]]+\]\]|\[\[hr\]\])/g

function parseContent(content: string): ContentPart[] {
  if (!content) return []
  const raw = content.split(TOKEN_SPLIT_RE)
  const parts: ContentPart[] = []
  for (const seg of raw) {
    if (!seg) continue
    let m = seg.match(/^\[\[img:([^\]]+)\]\]$/)
    if (m) { parts.push({ type: 'img', url: m[1] }); continue }
    m = seg.match(/^\[\[video:([^\]]+)\]\]$/)
    if (m) { parts.push({ type: 'video', url: m[1] }); continue }
    m = seg.match(/^\[\[product:([\w-]+)\]\]$/)
    if (m) { parts.push({ type: 'product', id: m[1] }); continue }
    m = seg.match(/^\[\[h1:([^\]]+)\]\]$/)
    if (m) { parts.push({ type: 'h1', value: m[1] }); continue }
    m = seg.match(/^\[\[h2:([^\]]+)\]\]$/)
    if (m) { parts.push({ type: 'h2', value: m[1] }); continue }
    m = seg.match(/^\[\[quote:([^\]]+)\]\]$/)
    if (m) { parts.push({ type: 'quote', value: m[1] }); continue }
    m = seg.match(/^\[\[tip:([^\]]+)\]\]$/)
    if (m) { parts.push({ type: 'tip', value: m[1] }); continue }
    if (/^\[\[hr\]\]$/.test(seg)) { parts.push({ type: 'hr' }); continue }
    if (seg.trim() !== '') parts.push({ type: 'text', value: seg })
  }
  return parts
}

// 内联视频播放器（尝试直接播放，失败则显示复制链接）
function InlineVideo({ url }: { url: string }) {
  const [playable, setPlayable] = useState(true)
  if (!playable) {
    return (
      <View className="video-tip-bar">
        <Text className="video-tip-icon">🎬</Text>
        <Text className="video-tip-text">本文包含视频内容</Text>
        <View className="video-copy-btn" onClick={() => { Taro.setClipboardData({ data: url }); Taro.showToast({ title: '链接已复制', icon: 'success' }) }}>
          <Text className="video-copy-text">复制链接</Text>
        </View>
      </View>
    )
  }
  return (
    <Video
      src={url}
      className="content-inline-video"
      controls
      onError={() => setPlayable(false)}
    />
  )
}

// 单个商品卡（内联渲染于文章流中）
function ProductCardInline({ productId, articleId }: { productId: string; articleId?: string }) {
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getProductById(productId)
      .then(p => { if (alive) { setProduct(p); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [productId])

  if (loading) {
    return <View className="apc-skeleton"><View className="apc-skeleton-img" /><View className="apc-skeleton-line" /></View>
  }
  if (!product) return null

  const emo = product.product_emotion
  const handleTap = () => {
    const q = `/pages/product/index?id=${encodeURIComponent(product.id)}&from=article${articleId ? `&articleId=${encodeURIComponent(articleId)}` : ''}`
    Taro.navigateTo({ url: q })
  }

  return (
    <View className="article-product-card" onClick={handleTap}>
      <View className="apc-media">
        {product.image_url ? (
          <Image src={product.image_url} mode="aspectFill" className="apc-img" />
        ) : (
          <View className="apc-img apc-img-fallback">
            <Icon name="package-variant" size={30} className="text-muted-foreground" />
          </View>
        )}
        <View className="apc-badge">🛍️ 好物推荐</View>
      </View>
      <View className="apc-body">
        {emo?.emotion_title && (
          <Text className="apc-emotion">✨ {emo.emotion_title}</Text>
        )}
        <Text className="apc-name">{product.name}</Text>
        <View className="apc-foot">
          <Text className="apc-price">¥{(product.price ?? 0).toFixed(2)}</Text>
          <View className="apc-cta">立即拥有 ›</View>
        </View>
      </View>
    </View>
  )
}

// 正文拆分渲染（文本段用 RichText，商品占位符用商品卡）
function ArticleContentWithProducts({ content, articleId }: { content: string; articleId?: string }) {
  const parts = parseContent(content)
  if (parts.length === 0) return null
  return (
    <View className="content-text">
      {parts.map((part, idx) =>
        part.type === 'product' ? (
          <ProductCardInline key={idx} productId={part.id} articleId={articleId} />
        ) : part.type === 'img' ? (
          <Image
            key={idx}
            src={part.url}
            mode="widthFix"
            className="content-img"
            onClick={() => Taro.previewImage({ urls: [part.url], current: part.url })} />
        ) : part.type === 'video' ? (
          <InlineVideo key={idx} url={part.url} />
        ) : part.type === 'h1' ? (
          <Text key={idx} className="blk-h1">{part.value}</Text>
        ) : part.type === 'h2' ? (
          <Text key={idx} className="blk-h2">{part.value}</Text>
        ) : part.type === 'quote' ? (
          <View key={idx} className="blk-quote"><Text className="blk-quote-t">{part.value}</Text></View>
        ) : part.type === 'tip' ? (
          <View key={idx} className="blk-tip"><Text className="blk-tip-t">{part.value}</Text></View>
        ) : part.type === 'hr' ? (
          <View key={idx} className="blk-hr" />
        ) : (
          <RichText key={idx} nodes={part.value} className="rich-content" />
        )
      )}
    </View>
  )
}
