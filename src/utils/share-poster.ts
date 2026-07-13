// 文章分享海报生成器：用 Canvas 2D 画出 500x400 的精美卡片
// 用于 onShareAppMessage 的 imageUrl，让分享卡片更吸睛
import Taro from '@tarojs/taro'

export const POSTER_WIDTH = 500
export const POSTER_HEIGHT = 400

/** 测量文本宽度（Canvas 2D 无 measureText 时兜底） */
function measureText(ctx: any, text: string): number {
  try {
    return ctx.measureText(text).width
  } catch {
    return text.length * 14
  }
}

/** 按最大宽度折行，最多 maxLines 行，超出追加省略号 */
function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number): string[] {
  if (!text) return []
  const chars = text.split('')
  const lines: string[] = []
  let currentLine = ''

  for (const char of chars) {
    const testLine = currentLine + char
    const width = measureText(ctx, testLine)
    if (width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = char
    } else {
      currentLine = testLine
    }
    if (lines.length >= maxLines) break
  }

  if (lines.length < maxLines) {
    lines.push(currentLine)
  }

  // 如果还有剩余字符，最后一行加省略号
  if (lines.length >= maxLines) {
    const last = lines[lines.length - 1]
    if (last && text.length > last.length) {
      let trimmed = last
      while (measureText(ctx, trimmed + '…') > maxWidth && trimmed.length > 0) {
        trimmed = trimmed.slice(0, -1)
      }
      lines[lines.length - 1] = trimmed + '…'
    }
  }

  return lines
}

/** 在离屏 Canvas 上画一张文章分享海报 */
export async function generateArticleSharePoster(
  article: any,
  canvasId = 'articleShareCanvas'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const query = Taro.createSelectorQuery()
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res?.[0]?.node as any
        if (!canvas) {
          reject(new Error('Canvas 节点未找到'))
          return
        }

        canvas.width = POSTER_WIDTH
        canvas.height = POSTER_HEIGHT
        const ctx = canvas.getContext('2d') as any

        // 1. 背景渐变：暗紫→深蓝，适合任何封面图
        const gradient = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
        gradient.addColorStop(0, '#1a1a2e')
        gradient.addColorStop(1, '#16213e')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

        // 2. 准备封面图
        const coverUrl = article?.cover_image || ''

        const drawContent = () => {
          // 3. 左侧文字区：先画半透明遮罩，确保文字可读
          const textLeft = 28
          const textRight = coverUrl ? 280 : 460
          const textMaxWidth = textRight - textLeft - 10

          // 顶部小标签
          ctx.fillStyle = '#8b5cf6'
          ctx.font = 'bold 18px sans-serif'
          ctx.fillText('好文推荐', textLeft, 54)

          // 标题
          const title = (article?.title || '发现一篇好文').replace(/[\s]*预览时标签不可点[\s]*$/gi, '')
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 30px sans-serif'
          const titleLines = wrapText(ctx, title, textMaxWidth, 3)
          let titleY = 96
          for (const line of titleLines) {
            ctx.fillText(line, textLeft, titleY)
            titleY += 42
          }

          // 摘要
          const excerpt = extractPlainExcerpt(article, 60)
          ctx.fillStyle = '#d1d5db'
          ctx.font = '20px sans-serif'
          const excerptLines = wrapText(ctx, excerpt, textMaxWidth, 2)
          let excerptY = titleY + 16
          for (const line of excerptLines) {
            ctx.fillText(line, textLeft, excerptY)
            excerptY += 32
          }

          // 底部品牌
          const brandY = POSTER_HEIGHT - 42
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.fillRect(textLeft, brandY - 16, 48, 2)
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 22px sans-serif'
          ctx.fillText('来电有喜', textLeft + 60, brandY)
          ctx.fillStyle = '#a5b4fc'
          ctx.font = '16px sans-serif'
          ctx.fillText('武侠生活 · 好物推荐', textLeft + 60, brandY + 26)

          // 5. 保存为临时图片
          Taro.canvasToTempFilePath({
            canvas,
            width: POSTER_WIDTH,
            height: POSTER_HEIGHT,
            destWidth: POSTER_WIDTH,
            destHeight: POSTER_HEIGHT,
            fileType: 'jpg',
            quality: 0.92,
            success: (r: any) => resolve(r.tempFilePath),
            fail: (err: any) => reject(err),
          })
        }

        if (!coverUrl) {
          // 无封面：直接画文字区
          drawContent()
          return
        }

        // 有封面：右侧显示封面图，并和左侧做渐变融合
        const img = canvas.createImage()
        img.src = coverUrl
        img.onload = () => {
          const drawWidth = 220
          const drawHeight = POSTER_HEIGHT
          const drawX = POSTER_WIDTH - drawWidth

          // 先画右侧图片
          ctx.drawImage(img, drawX, 0, drawWidth, drawHeight)

          // 从左向右的遮罩，让图片左侧融入文字背景
          const blend = ctx.createLinearGradient(drawX - 60, 0, drawX + drawWidth, 0)
          blend.addColorStop(0, 'rgba(22, 33, 62, 1)')
          blend.addColorStop(0.25, 'rgba(22, 33, 62, 0.85)')
          blend.addColorStop(0.55, 'rgba(22, 33, 62, 0.35)')
          blend.addColorStop(1, 'rgba(22, 33, 62, 0)')
          ctx.fillStyle = blend
          ctx.fillRect(drawX - 60, 0, drawWidth + 60, POSTER_HEIGHT)

          drawContent()
        }
        img.onerror = () => {
          // 封面加载失败：用纯色背景兜底
          drawContent()
        }
      })
  })
}

/** 提取纯文本摘要（供海报使用） */
function extractPlainExcerpt(article: any, maxLength = 80): string {
  if (!article) return '发现一篇好文，快来看看~'
  if (article.summary && typeof article.summary === 'string') {
    return article.summary.slice(0, maxLength)
  }
  if (article.content && typeof article.content === 'string') {
    const plain = article.content
      .replace(/\[\[product:[\w-]+\]\]/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (plain.length > 0) return plain.slice(0, maxLength)
  }
  return (article.title || '发现一篇好文，快来看看~').slice(0, maxLength)
}
