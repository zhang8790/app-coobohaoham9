// @title 发布内容
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { createArticle } from '@/db/api'
import { RouteGuard } from '@/components/RouteGuard'

const TAG_OPTIONS = ['美食', '购物', '治愈', '分享', '推荐', '好物', '打卡', '日记']

function UGCPublishPage() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag].slice(0, 5))
  }

  const handleSubmit = async () => {
    if (!title.trim()) { Taro.showToast({ title: '请输入标题', icon: 'none' }); return }
    if (!content.trim()) { Taro.showToast({ title: '请输入内容', icon: 'none' }); return }
    setSubmitting(true)
    await createArticle(title.trim(), content.trim(), [], selectedTags, { status: 'published' })
    setSubmitting(false)
    Taro.showToast({ title: '发布成功！', icon: 'success' })
    setTimeout(() => Taro.navigateTo({ url: '/pages/content-center/my-articles/index?tab=published' }), 1500)
  }

  return (<RouteGuard>
    <div className="min-h-screen bg-background pb-24">
      {/* 顶部返回 */}
      <div className="flex items-center px-4 pt-4 pb-2">
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-muted"
          onClick={() => Taro.navigateBack()}>
          <div className="i-mdi-arrow-left text-2xl text-foreground" />
        </button>
        <span className="flex-1 text-center text-xl font-bold text-foreground pr-10">创作园地</span>
      </div>
      <div className="px-4 pt-2">
        {/* 标题输入 */}
        <div className="mb-4">
          <p className="text-xl font-bold text-foreground mb-2">文章标题</p>
          <div className="border-2 border-input rounded-xl px-4 py-3 bg-card">
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="一个吸引人的标题..."
              value={title}
              maxLength={50}
              onInput={(e) => { const ev = e as any; setTitle(ev.detail?.value ?? ev.target?.value ?? '') }}
            />
          </div>
          <p className="text-base text-muted-foreground text-right mt-1">{title.length}/50</p>
        </div>

        {/* 内容输入 */}
        <div className="mb-4">
          <p className="text-xl font-bold text-foreground mb-2">内容</p>
          <div className="border-2 border-input rounded-xl px-4 py-3 bg-card overflow-hidden">
            <textarea
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="分享你的发现和感受，让更多侠客看到~"
              value={content}
              maxLength={1000}
              style={{ height: '200px' }}
              onInput={(e) => { const ev = e as any; setContent(ev.detail?.value ?? ev.target?.value ?? '') }}
            />
          </div>
          <p className="text-base text-muted-foreground text-right mt-1">{content.length}/1000</p>
        </div>

        {/* 标签选择 */}
        <div className="mb-4">
          <p className="text-xl font-bold text-foreground mb-2">添加标签（最多5个）</p>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map(tag => (
              <div key={tag}
                className={`px-4 py-2 rounded-full border-2 text-xl transition ${selectedTags.includes(tag) ? 'bg-primary border-primary text-white' : 'bg-card border-border text-foreground'}`}
                onClick={() => toggleTag(tag)}>
                #{tag}
              </div>
            ))}
          </div>
        </div>

        {/* 武侠提示 */}
        <div className="p-4 rounded-2xl" style={{ background: '#FFF0E8' }}>
          <div className="flex items-start gap-2">
            <div className="i-mdi-information text-2xl text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xl text-secondary leading-relaxed">
              江湖之大，汝之所见或为他人所求。一篇好文，胜过千言万语，愿汝笔墨留香。
            </p>
          </div>
        </div>
      </div>

      {/* 发布按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-4 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <button type="button"
          className={`w-full flex items-center justify-center leading-none rounded-2xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
          onClick={handleSubmit}>
          <div className="py-4 text-2xl font-bold text-white">
            {submitting ? '发布中...' : '发布内容'}
          </div>
        </button>
      </div>
    </div>
  </RouteGuard>)
}

/* wrapped by RouteGuard - see render */
export default UGCPublishPage
