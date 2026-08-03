// 分享海报生成器 —— 精美卡片级设计
// 文章分享卡片(500x400) + 朋友圈竖版海报(500x680) + 视频分享卡片
// 设计理念：温暖品牌色、清晰层次、圆角现代感、一眼吸睛
import Taro from '@tarojs/taro'

export const POSTER_WIDTH = 500
export const POSTER_HEIGHT = 400

// ──── 工具函数 ────

function measureText(ctx: any, text: string): number {
  try { return ctx.measureText(text).width } catch { return text.length * 14 }
}

function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number): string[] {
  if (!text) return []
  const chars = text.split('')
  const lines: string[] = []
  let currentLine = ''
  for (const char of chars) {
    const testLine = currentLine + char
    if (measureText(ctx, testLine) > maxWidth && currentLine.length > 0) {
      lines.push(currentLine); currentLine = char
    } else { currentLine = testLine }
    if (lines.length >= maxLines) break
  }
  if (lines.length < maxLines) lines.push(currentLine)
  if (lines.length >= maxLines && lines[lines.length - 1].length < text.length) {
    let trimmed = lines[lines.length - 1]
    while (measureText(ctx, trimmed + '…') > maxWidth && trimmed.length > 0) trimmed = trimmed.slice(0, -1)
    lines[lines.length - 1] = trimmed + '…'
  }
  return lines
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function extractPlainExcerpt(article: any, maxLength = 80): string {
  if (!article) return '发现一篇好文，快来看看~'
  if (article.summary && typeof article.summary === 'string') return article.summary.slice(0, maxLength)
  if (article.content && typeof article.content === 'string') {
    const plain = article.content.replace(/\[\[product:[\w-]+\]\]/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    if (plain.length > 0) return plain.slice(0, maxLength)
  }
  return (article.title || '发现一篇好文，快来看看~').slice(0, maxLength)
}

// ──── 绘制装饰性背景纹理（细微光点/线条） ────
function drawDecorDots(ctx: any, W: number, H: number, color: string) {
  // 右上角装饰点阵
  const positions = [[W - 30, 20], [W - 55, 40], [W - 20, 50], [W - 70, 18], [W - 42, 65]]
  positions.forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
  })
  // 左下角小装饰
  const positions2 = [[25, H - 25], [45, H - 45], [18, H - 50]]
  positions2.forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
  })
}

// ──── ① 文章分享卡片（onShareAppMessage imageUrl） ────
// 尺寸 500×400，暖橙→琥珀渐变底，封面大图+标题叠加或左右分栏
export async function generateArticleSharePoster(
  article: any,
  canvasId = 'articleShareCanvas'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const query = Taro.createSelectorQuery()
    query.select(`#${canvasId}`).fields({ node: true, size: true }).exec((res) => {
      const canvas = res?.[0]?.node as any
      if (!canvas) { reject(new Error('Canvas 节点未找到')); return }

      canvas.width = POSTER_WIDTH; canvas.height = POSTER_HEIGHT
      const ctx = canvas.getContext('2d') as any
      const W = POSTER_WIDTH, H = POSTER_HEIGHT

      // ═══ 背景：暖橙 → 琥珀金渐变（品牌主色系） ═══
      const bgGrad = ctx.createLinearGradient(0, 0, W, H)
      bgGrad.addColorStop(0, '#FF6B35')
      bgGrad.addColorStop(0.5, '#F7931E')
      bgGrad.addColorStop(1, '#C77B30')
      ctx.fillStyle = bgGrad
      roundRect(ctx, 0, 0, W, H, 24)
      ctx.fill()

      // 装饰性半透明圆形（增加层次感）
      ctx.globalAlpha = 0.12
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(W - 60, 80, 90, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(50, H - 60, 70, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1.0

      // 装饰点
      drawDecorDots(ctx, W, H, 'rgba(255,255,255,0.35)')

      const coverUrl = article?.cover_image || ''

      const drawContent = () => {
        const pad = 28
        const textMaxW = coverUrl ? W - 280 : W - pad * 2
        const textLeft = pad

        // 顶部标签胶囊
        const tagText = article?.video_url ? '🎬 视频分享' : '📝 好文推荐'
        const tagW = measureText(ctx, tagText) + 28
        roundRect(ctx, textLeft, 36, tagW, 34, 17)
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 17px sans-serif'
        ctx.fillText(tagText, textLeft + 14, 58)

        // 标题（粗体大白字）
        const title = (article?.title || '发现一篇好文').replace(/[\s]*预览时标签不可点[\s]*$/gi, '')
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 29px sans-serif'
        const titleLines = wrapText(ctx, title, textMaxW, 3)
        let ty = 96
        for (const line of titleLines) { ctx.fillText(line, textLeft, ty); ty += 40 }

        // 摘要（半透明白）
        const excerpt = extractPlainExcerpt(article, 56)
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.font = '19px sans-serif'
        const excLines = wrapText(ctx, excerpt, textMaxW, 2)
        ty += 12
        for (const line of excLines) { ctx.fillText(line, textLeft, ty); ty += 30 }

        // 底部品牌条
        const by = H - 46
        roundRect(ctx, pad, by - 18, W - pad * 2, 36, 18)
        ctx.fillStyle = 'rgba(0,0,0,0.15)'
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 21px sans-serif'
        ctx.fillText('✦ 来电有喜', pad + 16, by)
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.font = '15px sans-serif'
        ctx.fillText('好物推荐 · 日常膳食搭配', pad + 16, by + 22)

        // 导出
        Taro.canvasToTempFilePath({
          canvas, width: W, height: H, destWidth: W, destHeight: H,
          fileType: 'jpg', quality: 0.95,
          success: (r: any) => resolve(r.tempFilePath),
          fail: (err: any) => reject(err),
        })
      }

      if (!coverUrl) { drawContent(); return }

      // 有封面：右侧圆角大图
      const img = canvas.createImage()
      img.src = coverUrl
      img.onload = () => {
        const cSize = 230, cX = W - cSize - 16, cY = (H - cSize) / 2
        // 图片容器阴影效果（深色底层）
        roundRect(ctx, cX + 4, cY + 4, cSize, cSize, 20)
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        ctx.fill()
        // 圆角裁剪画图
        roundRect(ctx, cX, cY, cSize, cSize, 20)
        ctx.save(); ctx.clip()
        ctx.drawImage(img, cX, cY, cSize, cSize)
        ctx.restore()

        // 图片左侧微渐变遮罩（让文字区自然过渡）
        const blend = ctx.createLinearGradient(cX - 30, 0, cX + 60, 0)
        blend.addColorStop(0, 'rgba(199,123,48,0)')
        blend.addColorStop(0.5, 'rgba(199,123,48,0.15)')
        blend.addColorStop(1, 'rgba(199,123,48,0)')
        ctx.fillStyle = blend
        ctx.fillRect(cX - 30, 0, 90, H)

        drawContent()
      }
      img.onerror = () => { drawContent() }
    })
  })
}

// ──── ② 朋友圈竖版海报（带小程序码）500×680 ────
export const CODE_POSTER_WIDTH = 500
export const CODE_POSTER_HEIGHT = 680

export async function generateArticleCodePoster(
  article: any,
  canvasId = 'articleCodePosterCanvas',
  codeImageBase64?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const query = Taro.createSelectorQuery()
    query.select(`#${canvasId}`).fields({ node: true, size: true }).exec((res) => {
      const canvas = res?.[0]?.node as any
      if (!canvas) { reject(new Error('Canvas 节点未找到')); return }

      canvas.width = CODE_POSTER_WIDTH; canvas.height = CODE_POSTER_HEIGHT
      const ctx = canvas.getContext('2d') as any
      const W = CODE_POSTER_WIDTH, H = CODE_POSTER_HEIGHT

      // ═══ 背景：奶油白→浅杏渐变（干净高级感） ═══
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#FFFBF5')
      bg.addColorStop(0.5, '#FFF5EB')
      bg.addColorStop(1, '#F6E7D6')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // 顶部装饰弧形
      ctx.fillStyle = '#F7931E'
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(W, 0, W, 120); ctx.lineTo(0, 120); ctx.closePath(); ctx.fill()
      // 弧内文字
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText('来电有喜', 32, 52)
      ctx.font = '15px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillText('好物推荐', 32, 76)

      // 标题区域（带圆角卡片背景）
      const title = (article?.title || '发现一篇好文')
        .replace(/[\s]*预览时标签不可点[\s]*$/gi, '')
        .replace(/[\s]*测试[\s]*$/gi, '')

      roundRect(ctx, 24, 140, W - 48, 10, 5)
      ctx.fillStyle = '#F7931E'
      ctx.fill()

      ctx.fillStyle = '#2D1810'
      ctx.font = 'bold 33px sans-serif'
      const titleLines = wrapText(ctx, title, W - 56, 3)
      let y = 192
      for (const line of titleLines) { ctx.fillText(line, 32, y); y += 48 }

      // 摘要
      const excerpt = extractPlainExcerpt(article, 60)
      ctx.fillStyle = '#6B5A4A'
      ctx.font = '21px sans-serif'
      const excLines = wrapText(ctx, excerpt, W - 56, 3)
      y += 16
      for (const line of excLines) { ctx.fillText(line, 32, y); y += 34 }

      // 封面图（居中圆角大方块）
      const coverY = 270, coverSize = 300, coverX = (W - coverSize) / 2
      if (article?.cover_image) {
        const img = canvas.createImage()
        img.src = article.cover_image
        img.onload = () => {
          // 阴影层
          roundRect(ctx, coverX + 4, coverY + 4, coverSize, coverSize, 20)
          ctx.fillStyle = 'rgba(0,0,0,0.08)'
          ctx.fill()
          // 圆角图片
          roundRect(ctx, coverX, coverY, coverSize, coverSize, 20)
          ctx.save(); ctx.clip()
          ctx.drawImage(img, coverX, coverY, coverSize, coverSize)
          ctx.restore()
          // 如果是视频，叠加播放按钮
          if (article?.video_url) {
            const cx = coverX + coverSize / 2, cy = coverY + coverSize / 2, pr = 36
            ctx.globalAlpha = 0.7
            ctx.fillStyle = '#000000'
            ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill()
            ctx.globalAlpha = 1.0
            ctx.fillStyle = '#ffffff'
            ctx.beginPath(); ctx.moveTo(cx - 12, cy - 18); ctx.lineTo(cx - 12, cy + 18); ctx.lineTo(cx + 18, cy); ctx.closePath(); ctx.fill()
          }
          drawFooterAndCode()
        }
        img.onerror = drawFooterAndCode
      } else {
        // 无封面占位
        roundRect(ctx, coverX, coverY, coverSize, coverSize, 20)
        ctx.fillStyle = '#F0E4D4'
        ctx.fill()
        ctx.fillStyle = '#B9A48F'
        ctx.font = '24px sans-serif'
        const phText = article?.video_url ? '🎬 视频分享' : '📝 好文分享'
        ctx.fillText(phText, coverX + 72, coverY + coverSize / 2 + 8)
        drawFooterAndCode()
      }

      function drawFooterAndCode() {
        // 底部深色品牌栏
        const barY = H - 180
        roundRect(ctx, 0, barY, W, 180, 0)
        const barGrad = ctx.createLinearGradient(0, barY, 0, H)
        barGrad.addColorStop(0, '#3A2A1E'); barGrad.addColorStop(1, '#2D1810')
        ctx.fillStyle = barGrad; ctx.fill()

        // 品牌名
        ctx.fillStyle = '#F7931E'
        ctx.font = 'bold 26px sans-serif'
        ctx.fillText('✦ 来电有喜', 32, barY + 44)
        ctx.fillStyle = '#C4A98E'
        ctx.font = '17px sans-serif'
        ctx.fillText('好物推荐 · 日常膳食搭配参考', 32, barY + 72)

        // 小程序码
        const codeSize = 140
        const codeX = W - codeSize - 36
        const codeY = barY + 20
        if (codeImageBase64) {
          const codeImg = canvas.createImage()
          codeImg.src = codeImageBase64
          codeImg.onload = () => {
            roundRect(ctx, codeX - 8, codeY - 8, codeSize + 16, codeSize + 16, 14)
            ctx.fillStyle = '#ffffff'; ctx.fill()
            ctx.drawImage(codeImg, codeX, codeY, codeSize, codeSize)
            finish()
          }
          codeImg.onerror = finish
        } else { finish() }

        function finish() {
          // 提示语
          ctx.fillStyle = '#E8DDD0'
          ctx.font = 'bold 21px sans-serif'
          ctx.fillText('长按识别小程序码', 32, barY + 118)
          ctx.fillStyle = '#A69080'
          ctx.font = '17px sans-serif'
          ctx.fillText('好友打开即锁定为你的客户', 32, barY + 146)

          Taro.canvasToTempFilePath({
            canvas, width: W, height: H, destWidth: W, destHeight: H,
            fileType: 'jpg', quality: 0.95,
            success: (r: any) => resolve(r.tempFilePath),
            fail: (err: any) => reject(err),
          })
        }
      }
    })
  })
}

// ──── ③ 视频专属分享卡片（500×400） ────
// 用于视频发布后的分享，突出"视频"属性 + 播放按钮视觉
export async function generateVideoSharePoster(
  videoData: { title: string; cover_image?: string; video_url?: string },
  canvasId = 'videoShareCanvas'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const query = Taro.createSelectorQuery()
    query.select(`#${canvasId}`).fields({ node: true, size: true }).exec((res) => {
      const canvas = res?.[0]?.node as any
      if (!canvas) { reject(new Error('Canvas 节点未找到')); return }

      canvas.width = POSTER_WIDTH; canvas.height = POSTER_HEIGHT
      const ctx = canvas.getContext('2d') as any
      const W = POSTER_WIDTH, H = POSTER_HEIGHT

      // ═══ 背景：深邃蓝紫渐变（视频=沉浸感） ═══
      const bgGrad = ctx.createLinearGradient(0, 0, W, H)
      bgGrad.addColorStop(0, '#0F0C29')
      bgGrad.addColorStop(0.5, '#302B63')
      bgGrad.addColorStop(1, '#24243E')
      ctx.fillStyle = bgGrad
      roundRect(ctx, 0, 0, W, H, 24)
      ctx.fill()

      // 装饰性光晕
      ctx.globalAlpha = 0.1
      ctx.fillStyle = '#7C3AED'
      ctx.beginPath(); ctx.arc(W * 0.8, H * 0.2, 100, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(W * 0.15, H * 0.8, 80, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1.0

      const coverUrl = videoData?.cover_image || ''

      const drawVideoContent = () => {
        const pad = 28

        // 顶部视频标签
        const tagW = 130
        roundRect(pad, 32, tagW, 32, 16)
        ctx.fillStyle = 'rgba(124,58,237,0.35)'
        ctx.fill()
        ctx.fillStyle = '#C4B5FD'
        ctx.font = 'bold 17px sans-serif'
        ctx.fillText('▶ 视频分享', pad + 18, 54)

        // 标题
        const title = videoData?.title || '精彩视频'
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 30px sans-serif'
        const maxW = coverUrl ? W - 280 : W - pad * 2
        const titleLines = wrapText(ctx, title, maxW, 3)
        let ty = 96
        for (const line of titleLines) { ctx.fillText(line, pad, ty); ty += 42 }

        // 副标题提示
        ctx.fillStyle = 'rgba(196,181,253,0.7)'
        ctx.font = '18px sans-serif'
        ctx.fillText('点击播放，看看有什么好内容 ✨', pad, ty + 16)

        // 底部品牌
        const by = H - 44
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fillRect(pad, by - 14, W - pad * 2, 2)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 20px sans-serif'
        ctx.fillText('✦ 来电有喜', pad + 14, by)
        ctx.fillStyle = 'rgba(196,181,253,0.6)'
        ctx.font = '14px sans-serif'
        ctx.fillText('好物推荐', pad + 14, by + 20)

        Taro.canvasToTempFilePath({
          canvas, width: W, height: H, destWidth: W, destHeight: H,
          fileType: 'jpg', quality: 0.95,
          success: (r: any) => resolve(r.tempFilePath),
          fail: (err: any) => reject(err),
        })
      }

      if (!coverUrl) {
        // 无封面：中央大播放按钮占位
        const cx = W / 2, cy = H / 2 + 10, pr = 48
        ctx.globalAlpha = 0.15
        ctx.fillStyle = '#7C3AED'
        ctx.beginPath(); ctx.arc(cx, cy, pr + 16, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 0.4
        ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1.0
        ctx.fillStyle = '#C4B5FD'
        ctx.beginPath(); ctx.moveTo(cx - 16, cy - 24); ctx.lineTo(cx - 16, cy + 24); ctx.lineTo(cx + 26, cy); ctx.closePath(); ctx.fill()
        drawVideoContent()
        return
      }

      // 有封面：右侧圆角大图 + 播放按钮叠加
      const img = canvas.createImage()
      img.src = coverUrl
      img.onload = () => {
        const cSize = 230, cX = W - cSize - 16, cY = (H - cSize) / 2
        // 阴影
        roundRect(ctx, cX + 4, cY + 4, cSize, cSize, 20)
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fill()
        // 圆角图
        roundRect(ctx, cX, cY, cSize, cSize, 20)
        ctx.save(); ctx.clip()
        ctx.drawImage(img, cX, cY, cSize, cSize)
        ctx.restore()

        // 半透明遮罩（暗化一点让播放按钮更醒目）
        ctx.fillStyle = 'rgba(15,12,41,0.25)'
        roundRect(ctx, cX, cY, cSize, cSize, 20)
        ctx.fill()

        // 中央播放按钮
        const pcx = cX + cSize / 2, pcy = cY + cSize / 2, ppr = 30
        ctx.globalAlpha = 0.85
        ctx.fillStyle = '#000000'
        ctx.beginPath(); ctx.arc(pcx, pcy, ppr, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1.0
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.moveTo(pcx - 10, pcy - 16); ctx.lineTo(pcx - 10, pcy + 16); ctx.lineTo(pcx + 18, pcy); ctx.closePath(); ctx.fill()

        // 左侧渐变过渡
        const blend = ctx.createLinearGradient(cX - 30, 0, cX + 60, 0)
        blend.addColorStop(0, 'rgba(36,36,62,0)')
        blend.addColorStop(0.5, 'rgba(36,36,62,0.3)')
        blend.addColorStop(1, 'rgba(36,36,62,0)')
        ctx.fillStyle = blend
        ctx.fillRect(cX - 30, 0, 90, H)

        drawVideoContent()
      }
      img.onerror = () => { drawVideoContent() }
    })
  })
}
