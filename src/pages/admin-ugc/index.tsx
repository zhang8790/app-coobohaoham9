// @title 武林贴管理
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { getAdminArticles, adminToggleArticlePublish, adminDeleteArticle } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import { RouteGuard } from '@/components/RouteGuard'
import type { Article } from '@/db/types'

type Tab = 'all' | 'published' | 'hidden'

function AdminUgcPage() {
  const { profile, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<Tab>('all')
  const [list, setList] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (authLoading) return
    if (profile?.role !== 'admin') { Taro.reLaunch({ url: '/pages/index/index' }); return }
    setLoading(true)
    const data = await getAdminArticles()
    setList(data)
    setLoading(false)
  }, [profile, authLoading])

  useEffect(() => { load() }, [load])

  const filtered = list.filter(a => {
    if (tab === 'published') return a.is_published
    if (tab === 'hidden') return !a.is_published
    return true
  })

  const handleToggle = async (article: Article) => {
    setProcessing(article.id)
    const ok = await adminToggleArticlePublish(article.id, !article.is_published)
    setProcessing(null)
    if (ok) {
      setList(prev => prev.map(a => a.id === article.id ? { ...a, is_published: !a.is_published } : a))
      Taro.showToast({ title: article.is_published ? '已下架' : '已上架', icon: 'success' })
    } else Taro.showToast({ title: '操作失败', icon: 'none' })
  }

  const handleDelete = async (id: string) => {
    Taro.showModal({
      title: '销毁秘籍',
      content: '删除后不可恢复，确认删除该帖子？',
      success: async (res) => {
        if (!res.confirm) return
        setProcessing(id)
        await adminDeleteArticle(id)
        setProcessing(null)
        setList(prev => prev.filter(a => a.id !== id))
        Taro.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'published', label: '已发布' },
    { key: 'hidden', label: '已隐藏' },
  ]

  return (<RouteGuard>
    <div className="min-h-screen bg-background pb-10">
      {/* Tab 筛选 */}
      <div className="flex flex-row px-4 py-3 gap-2 border-b border-border bg-card sticky top-0 z-10">
        {TABS.map(t => (
          <button key={t.key} type="button"
            className={`flex-1 flex items-center justify-center leading-none rounded-xl ${tab === t.key ? 'bg-primary' : 'bg-muted'}`}
            onClick={() => setTab(t.key)}>
            <div className={`py-2 text-xl font-bold ${tab === t.key ? 'text-white' : 'text-muted-foreground'}`}>{t.label}</div>
          </button>
        ))}
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="i-mdi-loading text-5xl text-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="i-mdi-newspaper-remove text-6xl text-muted-foreground" />
            <span className="text-2xl text-muted-foreground">暂无内容</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map(a => (
              <div key={a.id} className="rounded-2xl bg-card border border-border overflow-hidden">
                {/* 顶部信息 */}
                <div className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl font-bold text-foreground flex-1 line-clamp-1">{a.title}</span>
                    <span className={`text-base px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${a.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {a.is_published ? '已发布' : '已隐藏'}
                    </span>
                  </div>
                  {a.content && <p className="text-xl text-muted-foreground line-clamp-2">{a.content}</p>}
                  {Array.isArray(a.images) && a.images.length > 0 && (
                    <div className="flex flex-row gap-2 overflow-x-hidden">
                      {a.images.slice(0, 3).map((img, i) => (
                        <Image key={i} src={img} mode="aspectFill"
                          style={{ width: '80px', height: '80px', borderRadius: '8px', flexShrink: 0 }} />
                      ))}
                    </div>
                  )}
                  <span className="text-base text-muted-foreground">{new Date(a.created_at).toLocaleDateString('zh-CN')}</span>
                </div>

                {/* 操作行 */}
                <div className="flex flex-row border-t border-border">
                  <button type="button"
                    className={`flex-1 flex items-center justify-center leading-none py-3 ${processing === a.id ? 'opacity-50' : ''}`}
                    onClick={() => handleToggle(a)}>
                    <div className={`flex items-center gap-1 text-xl font-bold ${a.is_published ? 'text-amber-600' : 'text-emerald-600'}`}>
                      <div className={`${a.is_published ? 'i-mdi-eye-off' : 'i-mdi-eye'} text-xl`} />
                      <span>{a.is_published ? '封印下架' : '解封上架'}</span>
                    </div>
                  </button>
                  <div className="w-px bg-border" />
                  <button type="button"
                    className={`flex-1 flex items-center justify-center leading-none py-3 ${processing === a.id ? 'opacity-50' : ''}`}
                    onClick={() => handleDelete(a.id)}>
                    <div className="flex items-center gap-1 text-xl font-bold text-destructive">
                      <div className="i-mdi-delete text-xl" />
                      <span>销毁秘籍</span>
                    </div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default AdminUgcPage
