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
          ctx.fillStyle = '#C77B30'
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
          ctx.fillText('好物推荐', textLeft + 60, brandY + 26)

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

/**
 * 朋友圈海报（带小程序码）：扫码打开即���定访客为作者客户。
 * 尺寸 500x680（竖版，适合朋友圈长图）。
 * codeImageBase64: wxacode 返回的 "data:image/png;base64,..." 小程序码。
 */
export const CODE_POSTER_WIDTH = 500
export const CODE_POSTER_HEIGHT = 680

export async function generateArticleCodePoster(
  article: any,
  canvasId = 'articleCodePosterCanvas',
  codeImageBase64?: string
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

        canvas.width = CODE_POSTER_WIDTH
        canvas.height = CODE_POSTER_HEIGHT
        const ctx = canvas.getContext('2d') as any
        const W = CODE_POSTER_WIDTH
        const H = CODE_POSTER_HEIGHT

        // 背景：暖米黄渐变（贴合品牌）
        const bg = ctx.createLinearGradient(0, 0, 0, H)
        bg.addColorStop(0, '#FFF7F0')
        bg.addColorStop(1, '#F6E7D6')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, W, H)

        // 标题
        const title = (article?.title || '发现一篇好文')
          .replace(/[\s]*预览时标签不可点[\s]*$/gi, '')
          .replace(/[\s]*测试[\s]*$/gi, '')
        ctx.fillStyle = '#3A2A1E'
        ctx.font = 'bold 34px sans-serif'
        const titleLines = wrapText(ctx, title, W - 80, 3)
        let y = 72
        for (const line of titleLines) {
          ctx.fillText(line, 40, y)
          y += 48
        }

        // 摘要
        const excerpt = extractPlainExcerpt(article, 56)
        ctx.fillStyle = '#7A6A5C'
        ctx.font = '22px sans-serif'
        const excerptLines = wrapText(ctx, excerpt, W - 80, 3)
        y += 14
        for (const line of excerptLines) {
          ctx.fillText(line, 40, y)
          y += 34
        }

        // 封面图（中部方块），无封面则留白
        const coverY = 250
        const coverSize = 300
        const coverX = (W - coverSize) / 2
        if (article?.cover_image) {
          const img = canvas.createImage()
          img.src = article.cover_image
          img.onload = () => {
            roundRect(ctx, coverX, coverY, coverSize, coverSize, 18)
            ctx.save()
            ctx.clip()
            ctx.drawImage(img, coverX, coverY, coverSize, coverSize)
            ctx.restore()
            drawFooterAndCode()
          }
          img.onerror = drawFooterAndCode
        } else {
          // 无封面：画占位
          roundRect(ctx, coverX, coverY, coverSize, coverSize, 18)
          ctx.fillStyle = '#EFE0D0'
          ctx.fill()
          ctx.fillStyle = '#B9A48F'
          ctx.font = '26px sans-serif'
          ctx.fillText('🍲 好文分享', coverX + 80, coverY + coverSize / 2)
          drawFooterAndCode()
        }

        function drawFooterAndCode() {
          // 底部品牌
          ctx.fillStyle = '#C77B30'
          ctx.font = 'bold 24px sans-serif'
          ctx.fillText('来电有喜', 40, H - 220)
          ctx.fillStyle = '#9A8070'
          ctx.font = '18px sans-serif'
          ctx.fillText('好物推荐 · 日常膳食搭配参考', 40, H - 192)

          // 小程序码（右下）
          const codeSize = 150
          const codeX = W - codeSize - 40
          const codeY = H - codeSize - 60
          if (codeImageBase64) {
            const codeImg = canvas.createImage()
            codeImg.src = codeImageBase64
            codeImg.onload = () => {
              roundRect(ctx, codeX - 8, codeY - 8, codeSize + 16, codeSize + 16, 12)
              ctx.fillStyle = '#ffffff'
              ctx.fill()
              ctx.drawImage(codeImg, codeX, codeY, codeSize, codeSize)
              finish()
            }
            codeImg.onerror = finish
          } else {
            finish()
          }

          function finish() {
            // 提示语（码左侧）
            ctx.fillStyle = '#5A4A3C'
            ctx.font = 'bold 22px sans-serif'
            const tip = '长按识别小程序码'
            ctx.fillText(tip, 40, H - 120)
            ctx.fillStyle = '#9A8070'
            ctx.font = '18px sans-serif'
            ctx.fillText('好友打开即锁定为你的客户', 40, H - 92)

            Taro.canvasToTempFilePath({
              canvas,
              width: W,
              height: H,
              destWidth: W,
              destHeight: H,
              fileType: 'jpg',
              quality: 0.92,
              success: (r: any) => resolve(r.tempFilePath),
              fail: (err: any) => reject(err),
            })
          }
        }
      })
  })
}

/** 圆角矩形路径 */
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
