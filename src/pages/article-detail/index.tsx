// @title 文章详情页 - 公众号风格
import { useState, useEffect, useRef } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Text, Image, ScrollView, RichText } from '@tarojs/components'
import './index.scss'

import { useAuth } from '@/contexts/AuthContext'
import { getArticleById, incrementArticleView, getArticles, getProductById } from '@/db/api'
import { handleInviterFromQuery } from '@/utils/share'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'

export default function ArticleDetailPage() {
  const { user } = useAuth()
  const [article, setArticle] = useState<any>(null)
  const [relatedArticles, setRelatedArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isFavorited, setIsFavorited] = useState(false)
  const viewedRef = useRef(false)

  const instance = Taro.getCurrentInstance()
  const articleId = instance.router?.params?.id

  // 分享钩子
  useShareWithReferral({
    title: article?.title || '来电有喜 - 好文推荐',
    path: `/pages/article-detail/index?id=${articleId}`,
    imageUrl: article?.cover_image || '',
  })

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

  // 预览时锁客
  useEffect(() => {
    if (article && user) {
      const query = instance.router?.params || {}
      const inviterCode = (query as any).ref || (query as any).inviter
      if (inviterCode && article.store_id) {
        import('@/db/api').then(({ lockCustomerByArticle }) => {
          lockCustomerByArticle(article.store_id, inviterCode).catch(() => {})
        })
      }
    }
  }, [article, user])

  const loadArticle = async () => {
    try {
      setLoading(true)
      const data = await getArticleById(articleId!)
      if (!data) {
        setError('文章不存在或已下架')
      } else {
        setArticle(data)

        if (!viewedRef.current) {
          viewedRef.current = true
          incrementArticleView(articleId!).catch(() => {})
        }

        loadRelatedArticles(data)
      }
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
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

  const handleFavorite = () => {
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    setIsFavorited(!isFavorited)
    Taro.showToast({
      title: isFavorited ? '已取消收藏' : '收藏成功',
      icon: 'success',
    })
  }

  const handleShare = () => {
    Taro.showShareMenu({ withShareTicket: true })
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
              className="hero-image"
            />
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
                  mode="aspectFill"
                />
              ) : (
                <View className="avatar-default">
                  <Text className="avatar-default-text">
                    {(profile.nickname || '侠')[0]}
                  </Text>
                </View>
              )}
            </View>
            <View className="author-meta">
              <Text className="author-name">
                {profile.nickname || '匿名侠客'}
              </Text>
              <Text className="author-date">
                {new Date(article.created_at).toLocaleDateString('zh-CN', {
                  month: 'long',
                  day: 'numeric',
                })}
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
        </View>

        {/* ===== 标签 ===== */}
        {article.tags && article.tags.length > 0 && (
          <View className="tags-bar">
            {article.tags.map((tag: string, idx: number) => (
              <Text key={idx} className="tag-chip">#{tag}</Text>
            ))}
          </View>
        )}

        {/* ===== 正文内容（公众号风格排版） ===== */}
        <View className="content-body">
          {/* 图片列表 */}
          {article.images && article.images.length > 0 && (
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
                      current: imgUrl,
                    })
                  }
                />
              ))}
            </View>
          )}

          {/* HTML 正文 - 使用 RichText，文中商品卡占位符会被替换成商品卡组件 */}
          {article.content && (
            <ArticleContentWithProducts content={article.content} articleId={articleId} />
          )}

          {/* 视频提示 */}
          {article.video_url && (
            <View className="video-tip-bar">
              <Text className="video-tip-icon">🎬</Text>
              <Text className="video-tip-text">本文包含视频内容</Text>
              <View
                className="video-copy-btn"
                onClick={() => {
                  Taro.setClipboardData({ data: article.video_url })
                  Taro.showToast({ title: '链接已复制', icon: 'success' })
                }}
              >
                <Text className="video-copy-text">复制链接</Text>
              </View>
            </View>
          )}
        </View>

        {/* ===== 底部操作栏 ===== */}
        <View className="bottom-actions">
          <View className="action-item" onClick={handleShare}>
            <Text className="action-icon">↗</Text>
            <Text className="action-label">分享</Text>
          </View>
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
                      url: `/pages/article-detail/index?id=${item.id}`,
                    })
                  }}
                >
                  {item.cover_image && (
                    <Image
                      src={item.cover_image}
                      mode="aspectFill"
                      className="related-card-img"
                    />
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

        {/* ===== 底部账号信息（公众号风格） ===== */}
        <View className="account-footer">
          <View className="account-line" />
          <Text className="account-name">来电有喜</Text>
          <Text className="account-desc">武侠生活 · 好物推荐</Text>
        </View>

        <View className="safe-bottom" />
      </ScrollView>
    </View>
  )
}

// ─────────────────────────────────────────────
// 文中商品卡：把 content 里的 [[product:ID]] 占位符替换成可点击的商品卡
// ─────────────────────────────────────────────
type ContentPart = { type: 'product'; id: string } | { type: 'text'; value: string }

function parseContent(content: string): ContentPart[] {
  if (!content) return []
  const raw = content.split(/(\[\[product:[\w-]+\]\])/g)
  const parts: ContentPart[] = []
  for (const seg of raw) {
    const m = seg.match(/^\[\[product:([\w-]+)\]\]$/)
    if (m) {
      parts.push({ type: 'product', id: m[1] })
    } else if (seg.trim() !== '') {
      parts.push({ type: 'text', value: seg })
    }
  }
  return parts
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
            <View className="i-mdi-package-variant text-3xl text-muted-foreground" />
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
        ) : (
          <RichText key={idx} nodes={part.value} className="rich-content" />
        )
      )}
    </View>
  )
}
