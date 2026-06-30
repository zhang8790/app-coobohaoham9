import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 从 HTML 提取纯文字，去掉脚本/样式/标签
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, '\n')
    .trim()
}

// 从 HTML 提取 <title> 或 og:title
function extractTitle(html: string): string {
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
  if (ogTitle?.[1]) return ogTitle[1].trim()
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return title?.[1]?.trim() ?? ''
}

// 尝试提取正文主体内容（article / main / div.rich_media_content 等常见容器）
function extractBody(html: string): string {
  const containers = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]+class="[^"]*rich_media_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+id="content"[^>]*>([\s\S]*?)<\/div>/i,
  ]
  for (const re of containers) {
    const m = html.match(re)
    if (m?.[1]) {
      const text = extractText(m[1])
      if (text.length > 100) return text
    }
  }
  // 兜底：全文
  return extractText(html)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json() as { url?: string }
    if (!url || !url.startsWith('http')) {
      return new Response(JSON.stringify({ error: '请提供有效的文章链接' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 抓取页面 HTML（最多读取前 200KB，避免大页面超时）
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArticleFetcher/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    })
    clearTimeout(timeout)

    const html = await resp.text()

    const title = extractTitle(html) || '未知标题'
    let content = extractBody(html)

    // 截取前 5000 字
    if (content.length > 5000) content = content.slice(0, 5000) + '...'

    return new Response(JSON.stringify({ title, content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('article-fetch error:', err)
    return new Response(
      JSON.stringify({ error: err?.message ?? '链接解析失败，请检查链接是否有效' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
