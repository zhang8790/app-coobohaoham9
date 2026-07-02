// @title 我的文章
import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { View, Button } from '@tarojs/components'
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
    if (profile) setMyCode((profile as any).referral_code || '')
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

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-background px-4 pt-4 pb-0" style={{ borderBottom: '1px solid #E7DDD0' }}>
        <div className="flex items-center gap-3 pb-3">
          <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
            onClick={() => Taro.navigateBack()}>
            <div className="i-mdi-arrow-left text-2xl text-foreground" />
          </button>
          <h1 className="text-2xl font-bold text-foreground flex-1">我的文章</h1>
          <button type="button"
            className="flex items-center gap-1 px-4 py-2 rounded-full bg-primary"
            onClick={() => Taro.navigateTo({ url: '/pages/content-center/make/index' })}>
            <div className="i-mdi-plus text-xl text-white" />
            <span className="text-xl text-white">新建</span>
          </button>
        </div>
        {/* Tab栏 */}
        <div className="flex">
          {TABS.map(tab => (
            <div key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center py-3 relative">
              <span className={`text-xl ${activeTab === tab.key ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                {tab.label}
              </span>
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="p-4">
        {loading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-28 bg-card rounded-2xl border border-border animate-pulse" />
            ))}
          </div>
        )}

        {!loading && articles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="i-mdi-file-document-outline text-6xl text-muted-foreground" />
            <p className="text-xl text-muted-foreground">
              {activeTab === 'draft' ? '暂无草稿' : activeTab === 'published' ? '还未发布文章' : '还没有文章，赶快创作吧'}
            </p>
            <button type="button"
              className="px-6 flex items-center justify-center leading-none rounded-xl bg-primary"
              onClick={() => Taro.navigateTo({ url: '/pages/content-center/make/index' })}>
              <div className="py-3 text-xl text-white font-bold">开始创作</div>
            </button>
          </div>
        )}

        {!loading && articles.length > 0 && (
          <div className="flex flex-col gap-3">
            {articles.map(article => (
              <div key={article.id} className="p-4 rounded-2xl bg-card border border-border"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-2xl font-bold text-foreground leading-snug">{article.title}</p>
                    {article.content && (
                      <p className="text-xl text-muted-foreground mt-1 leading-relaxed"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {article.content}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      {/* 状态标签 */}
                      <span className={`px-3 py-1 rounded-full text-base font-bold ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {article.status === 'published' ? '已发布' : '草稿'}
                      </span>
                      <span className="text-base text-muted-foreground">
                        {new Date(article.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 mt-4">
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
                  <button type="button"
                    className={`flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-primary/30 bg-primary/5 ${article.status === 'published' ? 'flex-1' : 'flex-1'}`}
                    onClick={() => handleEdit(article)}>
                    <div className="i-mdi-pencil text-xl text-primary" />
                    <span className="text-xl text-primary">编辑</span>
                  </button>
                  <button type="button"
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-destructive/30 bg-destructive/5"
                    onClick={() => handleDelete(article)}>
                    <div className="i-mdi-delete-outline text-xl text-destructive" />
                    <span className="text-xl text-destructive">删除</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
