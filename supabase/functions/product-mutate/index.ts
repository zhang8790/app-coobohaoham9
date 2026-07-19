/**
 * product-mutate Edge Function —— 商家商品写入统一兜底
 *   - 新增（body 无 id）：service_role 直插，绕过 products 表 RLS 写策略。
 *   - 更新（body 有 id）：校验该商品归属门店 = 当前用户，再 service_role 更新。
 *   - 前端仍用 anon key 鉴权，本函数用 service_role 在服务端写库，
 *     彻底规避「安全加固迁移把商家写策略删掉 → 上架/编辑/上下架保存失败」的反复问题。
 *   - ingredients 列缺失（迁移 00090 未执行）时自动剥离重试。
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ProductInput = {
  id?: string
  store_id?: string
  name?: string
  description?: string
  price?: number
  stock?: number
  barcode?: string | null
  main_image?: string
  sub_images?: string[] | null
  detail_images?: string[] | null
  video_url?: string | null
  cost_price?: number | null
  original_price?: number | null
  discount_rate?: number | null
  mood_tags?: string[] | null
  scene_tags?: string[] | null
  ingredients?: string[] | null
  is_active?: boolean
  // 食材食疗智能导购字段（迁移 00100）
  overall_nature?: string | null
  health_tag?: string[] | null
  emotion_tag?: string[] | null
  match_goods?: string[] | null
  conflict_goods?: string[] | null
  aux_remind?: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // service_role：绕过 RLS 写库
  // 注意：Supabase Edge Function Secrets 不允许以 SUPABASE_ 开头，所以这里用 SERVICE_ROLE_KEY
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SERVICE_ROLE_KEY')!
  )

  // 鉴权：用 anon key + 前端传来的 Authorization 头解析出真实用户
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authErr } = await anonClient.auth.getUser()
  if (authErr || !user) return Response.json({ error: '未授权' }, { status: 401, headers: corsHeaders })

  try {
    const body = (await req.json()) as ProductInput

    // ── 更新分支：校验归属后更新 ──
    if (body.id) {
      const { data: existing, error: existErr } = await supabase
        .from('products').select('id, store_id').eq('id', body.id).maybeSingle()
      if (existErr) {
        console.error('[product-mutate] 商品查询失败:', existErr.message)
        return Response.json({ error: '商品查询失败' }, { status: 500, headers: corsHeaders })
      }
      if (!existing) return Response.json({ error: '商品不存在' }, { status: 404, headers: corsHeaders })

      const { data: store, error: storeErr } = await supabase
        .from('stores').select('id').eq('id', existing.store_id).eq('owner_id', user.id).maybeSingle()
      if (storeErr) {
        console.error('[product-mutate] 门店查询失败:', storeErr.message)
        return Response.json({ error: '门店查询失败' }, { status: 500, headers: corsHeaders })
      }
      if (!store) {
        return Response.json({ error: '无权操作该商品（归属不匹配）', code: 'PRODUCT_OWNER_MISMATCH' }, { status: 403, headers: corsHeaders })
      }

      const updatePayload: Record<string, unknown> = {}
      if (body.name !== undefined) updatePayload.name = (body.name || '').trim()
      if (body.description !== undefined) updatePayload.description = body.description ?? null
      if (body.price !== undefined) updatePayload.price = Number(body.price)
      if (body.stock !== undefined) updatePayload.stock = Number(body.stock)
      if (body.barcode !== undefined) updatePayload.barcode = body.barcode && body.barcode.trim() ? body.barcode.trim() : null
      if (body.main_image !== undefined) updatePayload.main_image = body.main_image || null
      if (body.sub_images !== undefined) updatePayload.sub_images = body.sub_images && body.sub_images.length ? body.sub_images : null
      if (body.detail_images !== undefined) updatePayload.detail_images = body.detail_images && body.detail_images.length ? body.detail_images : null
      if (body.video_url !== undefined) updatePayload.video_url = body.video_url || null
      if (body.cost_price !== undefined) updatePayload.cost_price = body.cost_price ?? null
      if (body.original_price !== undefined) updatePayload.original_price = body.original_price ?? null
      if (body.discount_rate !== undefined) updatePayload.discount_rate = body.discount_rate ?? null
      if (body.mood_tags !== undefined) updatePayload.mood_tags = body.mood_tags && body.mood_tags.length ? body.mood_tags : []
      if (body.scene_tags !== undefined) updatePayload.scene_tags = body.scene_tags && body.scene_tags.length ? body.scene_tags : []
      if (body.is_active !== undefined) updatePayload.is_active = body.is_active
      if (body.ingredients !== undefined && body.ingredients.length) updatePayload.ingredients = body.ingredients
      if (body.overall_nature !== undefined) updatePayload.overall_nature = body.overall_nature && body.overall_nature.trim() ? body.overall_nature.trim() : null
      if (body.health_tag !== undefined) updatePayload.health_tag = body.health_tag && body.health_tag.length ? body.health_tag : []
      if (body.emotion_tag !== undefined) updatePayload.emotion_tag = body.emotion_tag && body.emotion_tag.length ? body.emotion_tag : []
      if (body.match_goods !== undefined) updatePayload.match_goods = body.match_goods && body.match_goods.length ? body.match_goods : []
      if (body.conflict_goods !== undefined) updatePayload.conflict_goods = body.conflict_goods && body.conflict_goods.length ? body.conflict_goods : []
      if (body.aux_remind !== undefined) updatePayload.aux_remind = body.aux_remind && body.aux_remind.trim() ? body.aux_remind.trim() : null

      const { data, error } = await supabase.from('products').update(updatePayload).eq('id', body.id).select().maybeSingle()
      if (error) {
        if (/ingredients|overall_nature|health_tag|emotion_tag|match_goods|conflict_goods|aux_remind/.test(error.message)) {
          const { ingredients, overall_nature, health_tag, emotion_tag, match_goods, conflict_goods, aux_remind, ...rest } = updatePayload
          const r2 = await supabase.from('products').update(rest).eq('id', body.id).select().maybeSingle()
          if (r2.error) return Response.json({ error: `更新失败: ${r2.error.message}` }, { status: 500, headers: corsHeaders })
          return Response.json({ success: true, product: r2.data }, { headers: corsHeaders })
        }
        console.error('[product-mutate] 更新失败:', error.message)
        return Response.json({ error: `更新失败: ${error.message}` }, { status: 500, headers: corsHeaders })
      }
      return Response.json({ success: true, product: data }, { headers: corsHeaders })
    }

    // ── 新增分支 ──
    const store_id = (body.store_id || '').trim()
    const name = (body.name || '').trim()
    const price = Number(body.price)
    const stock = Number(body.stock)

    if (!store_id) return Response.json({ error: '缺少 store_id' }, { status: 400, headers: corsHeaders })
    if (!name) return Response.json({ error: '商品名称不能为空' }, { status: 400, headers: corsHeaders })
    if (!Number.isFinite(price) || price <= 0) return Response.json({ error: '价格不正确' }, { status: 400, headers: corsHeaders })
    if (!Number.isFinite(stock) || stock < 0) return Response.json({ error: '库存不正确' }, { status: 400, headers: corsHeaders })

    // P0 归属校验：仅允许商家写「自己拥有」的门店下的商品
    const { data: store, error: storeErr } = await supabase
      .from('stores').select('id').eq('id', store_id).eq('owner_id', user.id).maybeSingle()
    if (storeErr) {
      console.error('[product-mutate] 门店查询失败:', storeErr.message)
      return Response.json({ error: '门店查询失败' }, { status: 500, headers: corsHeaders })
    }
    if (!store) {
      return Response.json({ error: '无权操作该门店（门店归属不匹配）', code: 'STORE_OWNER_MISMATCH' }, { status: 403, headers: corsHeaders })
    }

    const insertPayload: Record<string, unknown> = {
      store_id,
      name,
      description: body.description ?? null,
      price,
      stock,
      barcode: body.barcode && body.barcode.trim() ? body.barcode.trim() : null,
      main_image: body.main_image || null,
      sub_images: body.sub_images && body.sub_images.length ? body.sub_images : null,
      detail_images: body.detail_images && body.detail_images.length ? body.detail_images : null,
      video_url: body.video_url || null,
      cost_price: body.cost_price ?? null,
      original_price: body.original_price ?? null,
      discount_rate: body.discount_rate ?? null,
      mood_tags: body.mood_tags && body.mood_tags.length ? body.mood_tags : [],
      scene_tags: body.scene_tags && body.scene_tags.length ? body.scene_tags : [],
      review_status: 'pending',
      is_active: body.is_active ?? false,
    }
    if (body.ingredients && body.ingredients.length) insertPayload.ingredients = body.ingredients
    if (body.overall_nature && body.overall_nature.trim()) insertPayload.overall_nature = body.overall_nature.trim()
    if (body.health_tag && body.health_tag.length) insertPayload.health_tag = body.health_tag
    if (body.emotion_tag && body.emotion_tag.length) insertPayload.emotion_tag = body.emotion_tag
    if (body.match_goods && body.match_goods.length) insertPayload.match_goods = body.match_goods
    if (body.conflict_goods && body.conflict_goods.length) insertPayload.conflict_goods = body.conflict_goods
    if (body.aux_remind && body.aux_remind.trim()) insertPayload.aux_remind = body.aux_remind.trim()

    const { data, error } = await supabase.from('products').insert(insertPayload).select().maybeSingle()
    if (error) {
      if (/ingredients|overall_nature|health_tag|emotion_tag|match_goods|conflict_goods|aux_remind/.test(error.message)) {
        const { ingredients, overall_nature, health_tag, emotion_tag, match_goods, conflict_goods, aux_remind, ...rest } = insertPayload
        const r2 = await supabase.from('products').insert(rest).select().maybeSingle()
        if (r2.error) return Response.json({ error: `保存失败: ${r2.error.message}` }, { status: 500, headers: corsHeaders })
        return Response.json({ success: true, product: r2.data }, { headers: corsHeaders })
      }
      console.error('[product-mutate] 插入失败:', error.message)
      return Response.json({ error: `保存失败: ${error.message}` }, { status: 500, headers: corsHeaders })
    }
    return Response.json({ success: true, product: data }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[product-mutate]', err)
    return Response.json({ error: err?.message ?? '内部错误' }, { status: 500, headers: corsHeaders })
  }
})
