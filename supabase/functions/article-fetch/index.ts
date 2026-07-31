import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// HTML 实体解码
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/gi, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

// 把 HTML 转成保留段落结构的纯文本（块级标签转换行）
function htmlToTextPreserve(html: string): string {
  let s = html
    // 块级结束标签 → 换行
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/section>/gi, '\n')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<\/article>/gi, '\n')
    .replace(/<\/main>/gi, '\n')
    // 去掉脚本/样式
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // 去剩余标签
    .replace(/<[^>]+>/g, ' ')
  s = decodeEntities(s)
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
  return s
}

// 提取 <title> 或 og:title
function extractTitle(html: string): string {
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
  if (ogTitle?.[1]) return decodeEntities(ogTitle[1].trim())
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return title?.[1] ? decodeEntities(title[1].trim()) : ''
}

// 把相对 URL 解析成绝对 URL
function toAbsolute(url: string, base: string): string {
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}

// 从某容器标签内部，深度平衡地截取内部 HTML（修复非贪婪截断问题）
function extractContainerInner(html: string, openRegex: RegExp, openTag: 'div' | 'article' | 'main'): string | null {
  const m = html.match(openRegex)
  if (!m || m.index === undefined) return null
  const start = m.index + m[0].length
  const openRe = new RegExp(`<${openTag}[\\s>]`, 'i')
  const closeRe = new RegExp(`</${openTag}>`, 'i')
  let depth = 1
  let i = start
  const n = html.length
  while (i < n && depth > 0) {
    const openAt = html.indexOf('<', i)
    if (openAt === -1) break
    const tagEnd = html.indexOf('>', openAt)
    if (tagEnd === -1) break
    const tag = html.slice(openAt, tagEnd + 1)
    if (closeRe.test(tag)) {
      depth--
      if (depth === 0) return html.slice(start, openAt)
    } else if (openRe.test(tag)) {
      // 仅统计目标标签的开启（img/br 等非 div/article/main 标签不匹配）
      depth++
    }
    i = tagEnd + 1
  }
  return depth === 0 ? html.slice(start, i) : html.slice(start)
}

// 从完整 HTML 抽取正文容器内部 HTML
function extractBodyHtml(html: string): string | null {
  const candidates: { re: RegExp; tag: 'div' | 'article' | 'main' }[] = [
    { re: /<article[^>]*>/i, tag: 'article' },
    { re: /<main[^>]*>/i, tag: 'main' },
    { re: /<div[^>]+class="[^"]*rich_media_content[^"]*"[^>]*>/i, tag: 'div' },
    { re: /<div[^>]+class="[^"]*article-content[^"]*"[^>]*>/i, tag: 'div' },
    { re: /<div[^>]+class="[^"]*content[^"]*"[^>]*>/i, tag: 'div' },
    { re: /<div[^>]+id="content"[^>]*>/i, tag: 'div' },
  ]
  for (const c of candidates) {
    const inner = extractContainerInner(html, c.re, c.tag)
    if (inner) {
      const text = htmlToTextPreserve(inner)
      if (text.length > 100) return inner
    }
  }
  return null
}

// 从一段 HTML 里抽取图片 URL（含懒加载 data-src）
function extractImagesFromHtml(html: string, base: string): string[] {
  const found: string[] = []
  const imgRe = /<img\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html))) {
    const tag = m[0]
    const src = (tag.match(/\ssrc="([^"]+)"/i) || [])[1] || (tag.match(/\sdata-src="([^"]+)"/i) || [])[1]
    if (src && !src.startsWith('data:') && !src.startsWith('javascript:')) {
      found.push(toAbsolute(src, base))
    }
  }
  // 去重
  return Array.from(new Set(found))
}

// 抽取视频 URL（og:video / <video src> / <source src>）
function extractVideosFromHtml(html: string, base: string): string[] {
  const found: string[] = []
  const og = html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i)
  if (og?.[1]) found.push(decodeEntities(og[1]))
  const videoRe = /<video\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = videoRe.exec(html))) {
    const tag = m[0]
    const src = (tag.match(/\ssrc="([^"]+)"/i) || [])[1]
    if (src && !src.startsWith('data:')) found.push(toAbsolute(src, base))
  }
  const srcRe = /<source\b[^>]*\ssrc="([^"]+)"[^>]*>/gi
  while ((m = srcRe.exec(html))) {
    const u = m[1]
    if (u && !u.startsWith('data:')) found.push(toAbsolute(u, base))
  }
  return Array.from(new Set(found))
}

// readability-lite：当页面没有标准正文容器时，聚合所有较长的 <p> 段落作为正文。
// 覆盖大量普通博客/新闻站（无 rich_media_content / article-content 这类 class）。
function extractByParagraphs(html: string): string | null {
  const ps: string[] = []
  const re = /<p[\s>][\s\S]*?<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const text = htmlToTextPreserve(m[0]).trim()
    if (text.length >= 40) ps.push(text)
  }
  // 至少 3 段、总字数足够，才视为正文
  if (ps.length < 3 || ps.join('').length < 120) return null
  return ps.join('\n\n')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = (await req.json()) as { url?: string }
    if (!url || !url.startsWith('http')) {
      return new Response(JSON.stringify({ error: '请提供有效的文章链接' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 抓取页面 HTML（上限 1MB，避免超大页面超时）
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    })
    clearTimeout(timeout)

    const buf = new Uint8Array(await resp.arrayBuffer())
    const decoder = new TextDecoder('utf-8')
    let html = decoder.decode(buf.slice(0, 1024 * 1024)) // 只读前 1MB

    const title = extractTitle(html) || '未知标题'
    const bodyHtml = extractBodyHtml(html)
    let content = bodyHtml ? htmlToTextPreserve(bodyHtml) : ''
    // 容器法失败 → 段落聚合法兜底（覆盖无标准 class 的普通网页）
    if (!content) {
      const para = extractByParagraphs(html)
      if (para) content = para
    }
    // 仍为空 → 全页文本兜底（反爬站可能为空/含导航噪声，前端会再做阈值判断）
    if (!content) content = htmlToTextPreserve(html)

    // 内容上限（与前端编辑框上限对齐）
    if (content.length > 8000) content = content.slice(0, 8000) + '\n…（原文较长，已截取，可在编辑器中补全）'

    const images = extractImagesFromHtml(bodyHtml ?? html, url)
    const videos = extractVideosFromHtml(bodyHtml ?? html, url)

    return new Response(
      JSON.stringify({ title, content, images, videos }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('article-fetch error:', err)
    return new Response(
      JSON.stringify({ error: err?.message ?? '链接解析失败，请检查链接是否有效' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
