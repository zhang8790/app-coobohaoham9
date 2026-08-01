// @title 我的创作
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Taro, { useShareAppMessage, useShareTimeline, useRouter, useDidShow } from '@tarojs/taro'
import { View, Button, Text, Canvas } from '@tarojs/components'
import {
  getMyArticles, deleteArticle, getMyProfile,
  getMyArticleStats, getMyContentSummary, setArticlePublished,
} from '@/db/api'
import type { ArticleStat, ContentSummary } from '@/db/api'
import type { Article } from '@/db/types'
import Icon from '@/components/Icon'
import { generateArticleSharePoster, generateVideoSharePoster } from '@/utils/share-poster'

type Tab = 'all' | 'published' | 'draft'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'published', label: '已发布' },
  { key: 'draft', label: '草稿箱' },
]

export default function MyArticlesPage() {
  // 修复：用 useRouter() 取响应式 params，原 useMemo(..., []) 冻结首屏参数快照，
  // 导致 ?tab=draft 等深链在页面实例复用/冷启动时落到默认 tab。
  const routeParams = useRouter().params ?? {}
  const defaultTab = (routeParams.tab as Tab) ?? 'all'
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [myCode, setMyCode] = useState('')
  const [shareArticle, setShareArticle] = useState<Article | null>(null)
  const [stats, setStats] = useState<ArticleStat[]>([])
  const [summary, setSummary] = useState<ContentSummary | null>(null)
  // 分享海报缓存：articleId → 临时文件路径（解决"无封面图→微信截屏锁客面板"的根因）
  const [posterMap, setPosterMap] = useState<Record<string, string>>({})
  const posterCanvasRef = useRef<number>(0) // 用于生成唯一 canvas ID

  // 预生成分享海报：文章列表加载后，对已发布文章静默生成公众号风格卡片
  // 确保用户点分享时 imageUrl 一定有值（不再依赖 cover_image，避免微信截屏）
  useEffect(() => {
    if (loading || articles.length === 0) return
    const published = articles.filter(a => a.status === 'published')
    if (published.length === 0) return
    let alive = true
    const timer = setTimeout(async () => {
      const map: Record<string, string> = {}
      for (const art of published.slice(0, 8)) { // 最多预生成 8 张，防性能过载
        if (!alive) break
        try {
          posterCanvasRef.current += 1
          const cid = `sharePreCanvas${posterCanvasRef.current}`
          const url = art.video_url
            ? await generateVideoSharePoster({ title: art.title, cover_image: art.cover_image || '', video_url: art.video_url }, cid)
            : await generateArticleSharePoster(art, cid)
          if (url && alive) map[art.id] = url
        } catch (e) {
          console.warn('[我的创作] 预生成海报失败:', art.id, e)
        }
      }
      if (alive && Object.keys(map).length > 0) setPosterMap(prev => ({ ...prev, ...map }))
    }, 800) // 延迟 800ms 让页面先渲染完
    return () => { alive = false }
  }, [loading, articles])

  // 分享：跳到文章详情页（带推广码归属推荐关系 + 封面缩略图），原生面板含好友/群/朋友圈
  // 关键修复：imageUrl 优先读预生成的海报（一定有图），不再裸用 cover_image（为空时微信截屏→锁客面板）
  useShareAppMessage(() => ({
    title: shareArticle
      ? `【来电有喜】${shareArticle.title}`
      : '我在来电有喜发现了好内容，快来看看！',
    path: `/pages/content/article-detail/index${shareArticle ? `?id=${shareArticle.id}${myCode ? `&ref=${myCode}` : ''}` : ''}`,
    imageUrl: (shareArticle?.id && posterMap[shareArticle.id])
      ? posterMap[shareArticle.id]
      : shareArticle?.cover_image || undefined,
  }))
  // 朋友圈分享（query 拼 id + ref，参数名与 useShareWithReferral / article-detail 落地解析保持一致）
  useShareTimeline(() => ({
    title: shareArticle
      ? `【来电有喜】${shareArticle.title}`
      : '来电有喜',
    query: shareArticle ? `id=${shareArticle.id}${myCode ? `&ref=${myCode}` : ''}` : '',
    imageUrl: shareArticle?.cover_image || undefined,
  }))

  const loadArticles = useCallback(async () => {
    setLoading(true)
    const [data, profile] = await Promise.all([
      getMyArticles(activeTab === 'all' ? undefined : activeTab),
      getMyProfile(),
    ])
    setArticles(data)
    if (profile) setMyCode((profile as any).invite_code || '')
    setLoading(false)
  }, [activeTab])

  // 战绩数据（锁客是本功能唯一 KPI：成交在线下）
  const loadStats = useCallback(async () => {
    const [s, sum] = await Promise.all([getMyArticleStats(), getMyContentSummary()])
    setStats(s)
    setSummary(sum)
  }, [])

  useEffect(() => { loadArticles() }, [loadArticles])
  useEffect(() => { loadStats() }, [loadStats])
  // 从详情页返回时刷新战绩
  useDidShow(() => { loadStats() })

  const statMap = useMemo(() => {
    const m: Record<string, ArticleStat> = {}
    stats.forEach(s => { m[s.article_id] = s })
    return m
  }, [stats])

  const handleDelete = (article: Article) => {
    Taro.showModal({ title: '确认删除', content: `删除《${article.title}》？此操作不可恢复。`, confirmText: '删除', confirmColor: '#EF4444' }).then(async res => {
      if (!res.confirm) return
      await deleteArticle(article.id)
      Taro.showToast({ title: '已删除', icon: 'success' })
      setArticles(prev => prev.filter(a => a.id !== article.id))
      loadStats()
    })
  }

  // 下架 / 重新发布：下架后他人打开分享链接会看到「该内容已下架」
  const handleTogglePublish = async (article: Article) => {
    const toPublished = article.status !== 'published'
    if (!toPublished) {
      const res = await Taro.showModal({
        title: '确认下架',
        content: '下架后，已分享出去的链接将无法访问，转为草稿保存。',
        confirmText: '下架',
      })
      if (!res.confirm) return
    }
    await setArticlePublished(article.id, toPublished)
    Taro.showToast({ title: toPublished ? '已重新发布' : '已下架', icon: 'success' })
    setArticles(prev => prev.map(a =>
      a.id === article.id ? { ...a, status: toPublished ? 'published' : 'draft', is_published: toPublished } as Article : a
    ))
    loadStats()
  }

  const handleEdit = (article: Article) => {
    Taro.navigateTo({ url: `/pages/content/content-center/make-rich/index?articleId=${article.id}` })
  }

  const handlePreview = (e: any, article: Article) => {
    // 阻止事件冒泡，避免触发行点击
    if (e?.stopPropagation) e.stopPropagation()
    Taro.navigateTo({ url: `/pages/content/article-detail/index?id=${article.id}` })
  }

  return (
    <View className="min-h-screen bg-background pb-10">
      {/* ── 锁客战绩总览：图文的唯一 KPI ── */}
      {summary && (
        <View className="mx-4 mt-3 p-4 rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#8B5E3C 0%,#A6714B 100%)' }}>
          <View className="flex items-center justify-between">
            <Text className="text-lg font-bold text-white">我的内容锁客战绩</Text>
            <Text className="text-xs text-white/70">成交在线下 · 图文负责锁人</Text>
          </View>
          <View className="flex mt-3">
            <View className="flex-1 flex flex-col items-center">
              <Text className="text-3xl font-bold text-white">{summary.locks}</Text>
              <Text className="text-xs text-white/80 mt-0.5">锁客</Text>
            </View>
            <View className="flex-1 flex flex-col items-center">
              <Text className="text-3xl font-bold text-white">{summary.new_customers}</Text>
              <Text className="text-xs text-white/80 mt-0.5">新客</Text>
            </View>
            <View className="flex-1 flex flex-col items-center">
              <Text className="text-3xl font-bold text-white">{summary.views}</Text>
              <Text className="text-xs text-white/80 mt-0.5">阅读</Text>
            </View>
            <View className="flex-1 flex flex-col items-center">
              <Text className="text-3xl font-bold text-white">{summary.shares}</Text>
              <Text className="text-xs text-white/80 mt-0.5">分享</Text>
            </View>
          </View>
          {summary.locks === 0 && (
            <Text className="block mt-3 text-xs text-white/85 leading-relaxed">
              把图文分享到微信群和朋友圈，好友打开阅读即自动锁定为你的客户，后续线下成交都算你的。
            </Text>
          )}
        </View>
      )}

      {/* Tab栏 */}
      <View className="flex border-b border-border mt-3">
          {TABS.map(tab => (
            <View key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center py-3 relative">
              <Text className={`text-xl ${activeTab === tab.key ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                {tab.label}
              </Text>
              {activeTab === tab.key && (
                <View className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
              )}
            </View>
          ))}
        </View>

      {/* 内容区 */}
      <View className="p-4">
        {loading && (
          <View className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <View key={i} className="h-28 bg-card rounded-2xl border border-border animate-pulse" />
            ))}
          </View>
        )}

        {!loading && articles.length === 0 && (
          <View className="flex flex-col items-center justify-center py-20 gap-4">
            <Icon name="file-document-outline" size={60} className="text-muted-foreground" />
            <Text className="text-xl text-muted-foreground">
              {activeTab === 'draft' ? '暂无草稿' : activeTab === 'published' ? '还未发布文章' : '还没有文章，赶快创作吧'}
            </Text>
            <Button type="button"
              className="px-6 flex items-center justify-center leading-none rounded-xl bg-primary"
              onClick={() => Taro.navigateTo({ url: '/pages/content/content-center/make-rich/index' })}>
              <View className="py-3 text-xl text-white font-bold">开始创作</View>
            </Button>
          </View>
        )}

        {!loading && articles.length > 0 && (
          <View className="flex flex-col gap-3">
            {articles.map(article => {
              const st = statMap[article.id]
              return (
              <View key={article.id} className="p-4 rounded-2xl bg-card border border-border active:scale-[0.98] transition-transform"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                onClick={(e) => handlePreview(e, article)}>
                <View className="flex items-start gap-3">
                  <View className="flex-1">
                    <Text className="text-2xl font-bold text-foreground leading-snug">{article.title}</Text>
                    {article.content && (
                      <Text className="text-xl text-muted-foreground mt-1 leading-relaxed"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {article.content}
                      </Text>
                    )}
                    <View className="flex items-center gap-3 mt-3">
                      {/* 状态标签 */}
                      <Text className={`px-3 py-1 rounded-full text-base font-bold ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {article.status === 'published' ? '已发布' : '草稿'}
                      </Text>
                      <Text className="text-base text-muted-foreground">
                        {new Date(article.created_at).toLocaleDateString('zh-CN')}
                      </Text>
                      </View>

                    {/* 单篇战绩 */}
                    {st && (
                      <View className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                        <Text className="text-base text-foreground font-bold">🔒 锁客 {st.lock_count}</Text>
                        <Text className="text-base text-muted-foreground">👁 {st.view_count}</Text>
                        <Text className="text-base text-muted-foreground">↗ {st.share_count}</Text>
                        <Text className="text-base text-muted-foreground">♡ {st.like_count}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* 操作按钮 */}
                <View className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                  {/* 查看预览按钮 */}
                  <Button type="button"
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-blue-300 bg-blue-50"
                    onClick={(e) => handlePreview(e, article)}>
                    <Icon name="eye-outline" size={20} className="text-blue-600" />
                    <Text className="text-xl text-blue-600">预览</Text>
                  </Button>
                  {/* 已发布：走原生分享面板；草稿：一键发布 */}
                  {article.status === 'published' ? (
                    <Button
                      openType="share"
                      data-id={article.id}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-green-300 bg-green-50"
                      style={{ lineHeight: 'normal', padding: '8px 0', fontSize: '20px', color: '#16A34A', fontWeight: 'bold' }}
                      onClick={() => setShareArticle(article)}
                    >
                      <Icon name="share-variant" size={20} className="text-green-600" />
                      分享
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-green-300 bg-green-50"
                      style={{ lineHeight: 'normal', padding: '8px 0', fontSize: '20px', color: '#16A34A', fontWeight: 'bold' }}
                      onClick={(e) => { e.stopPropagation(); handleTogglePublish(article) }}
                    >
                      <Icon name="upload" size={20} className="text-green-600" />
                      发布
                    </Button>
                  )}
                  <Button type="button"
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-primary/30 bg-primary/5"
                    onClick={(e) => { e.stopPropagation(); handleEdit(article) }}>
                    <Icon name="pencil" size={20} className="text-primary" />
                    <Text className="text-xl text-primary">编辑</Text>
                  </Button>
                  {/* 已发布：下架；草稿：删除 */}
                  {article.status === 'published' ? (
                    <Button type="button"
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-amber-300 bg-amber-50"
                      style={{ lineHeight: 'normal', padding: '8px 0', fontSize: '20px', color: '#D97706', fontWeight: 'bold' }}
                      onClick={(e) => { e.stopPropagation(); handleTogglePublish(article) }}>
                      <Icon name="archive-arrow-down-outline" size={20} className="text-amber-600" />
                      下架
                    </Button>
                  ) : (
                    <Button type="button"
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-destructive/30 bg-destructive/5"
                      onClick={(e) => { e.stopPropagation(); handleDelete(article) }}>
                      <Icon name="delete-outline" size={20} className="text-destructive" />
                      <Text className="text-xl text-destructive">删除</Text>
                    </Button>
                  )}
                </View>
              </View>
              )
            })}
          </View>
        )}
      </View>

      {/* 隐藏 Canvas 池：用于预生成分享海报（公众号风格卡片），解决无封面图时微信截屏问题 */}
      {Array.from({ length: 8 }).map((_, i) => (
        <Canvas key={`precanvas${i}`} id={`sharePreCanvas${i + 1}`}
          type="2d"
          style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '500px', height: '400px' }}
          canvasId={`sharePreCanvas${i + 1}`}
        />
      ))}
    </View>
  )
}
