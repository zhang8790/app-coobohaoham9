// @title 我的文章
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Button, Text } from '@tarojs/components'
import { getMyArticles, deleteArticle, getMyProfile } from '@/db/api'
import { useShareWithReferral } from '@/hooks/useShareWithReferral'
import type { Article } from '@/db/types'

type Tab = 'all' | 'published' | 'draft'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'published', label: '已发布' },
  { key: 'draft', label: '草稿箱' },
]

export default function MyArticlesPage() {
  const routeParams = useMemo(() => Taro.getCurrentInstance().router?.params ?? {}, [])
  const defaultTab = (routeParams.tab as Tab) ?? 'all'
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [myCode, setMyCode] = useState('')
  const [shareArticle, setShareArticle] = useState<Article | null>(null)

  // 分享：携带推广码锁定下线，动态返回文章标题
  useShareAppMessage(() => ({
    title: shareArticle
      ? `【来店有喜】${shareArticle.title}`
      : '我在来店有喜发现了好内容，快来看看！',
    path: `/pages/content-center/my-articles/index${shareArticle ? `?articleId=${shareArticle.id}` : ''}`,
  }))
  useShareTimeline(() => ({
    title: shareArticle
      ? `【来店有喜】${shareArticle.title}`
      : '来店有喜 · 武侠生活平台',
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

  useEffect(() => { loadArticles() }, [loadArticles])

  const handleDelete = (article: Article) => {
    Taro.showModal({ title: '确认删除', content: `删除《${article.title}》？此操作不可恢复。`, confirmText: '删除', confirmColor: '#EF4444' }).then(async res => {
      if (!res.confirm) return
      await deleteArticle(article.id)
      Taro.showToast({ title: '已删除', icon: 'success' })
      setArticles(prev => prev.filter(a => a.id !== article.id))
    })
  }

  const handleEdit = (article: Article) => {
    Taro.navigateTo({ url: `/pages/content-center/make/index?articleId=${article.id}` })
  }

  const handlePreview = (e: any, article: Article) => {
    // 阻止事件冒泡，避免触发行点击
    if (e?.stopPropagation) e.stopPropagation()
    Taro.navigateTo({ url: `/pages/article-detail/index?id=${article.id}` })
  }

  return (
    <View className="min-h-screen bg-background pb-10">
      {/* Tab栏 */}
      <View className="flex border-b border-border">
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
            <View className="i-mdi-file-document-outline text-6xl text-muted-foreground" />
            <Text className="text-xl text-muted-foreground">
              {activeTab === 'draft' ? '暂无草稿' : activeTab === 'published' ? '还未发布文章' : '还没有文章，赶快创作吧'}
            </Text>
            <Button type="button"
              className="px-6 flex items-center justify-center leading-none rounded-xl bg-primary"
              onClick={() => Taro.navigateTo({ url: '/pages/content-center/make/index' })}>
              <View className="py-3 text-xl text-white font-bold">开始创作</View>
            </Button>
          </View>
        )}

        {!loading && articles.length > 0 && (
          <View className="flex flex-col gap-3">
            {articles.map(article => (
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
                  </View>
                </View>

                {/* 操作按钮 */}
                <View className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                  {/* 查看预览按钮 */}
                  <Button type="button"
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-blue-300 bg-blue-50"
                    onClick={(e) => handlePreview(e, article)}>
                    <View className="i-mdi-eye-outline text-xl text-blue-600" />
                    <Text className="text-xl text-blue-600">预览</Text>
                  </Button>
                  {/* 分享按钮 — 已发布的文章才能分享锁客 */}
                  {article.status === 'published' && (
                    <Button
                      openType="share"
                      data-id={article.id}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-green-300 bg-green-50"
                      style={{ lineHeight: 'normal', padding: '8px 0', fontSize: '20px', color: '#16A34A', fontWeight: 'bold' }}
                      onClick={() => setShareArticle(article)}
                    >
                      分享赚佣
                    </Button>
                  )}
                  <Button type="button"
                    className={`flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-primary/30 bg-primary/5 ${article.status === 'published' ? 'flex-1' : 'flex-1'}`}
                    onClick={(e) => { e.stopPropagation(); handleEdit(article) }}>
                    <View className="i-mdi-pencil text-xl text-primary" />
                    <Text className="text-xl text-primary">编辑</Text>
                  </Button>
                  <Button type="button"
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-destructive/30 bg-destructive/5"
                    onClick={(e) => { e.stopPropagation(); handleDelete(article) }}>
                    <View className="i-mdi-delete-outline text-xl text-destructive" />
                    <Text className="text-xl text-destructive">删除</Text>
                  </Button>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
