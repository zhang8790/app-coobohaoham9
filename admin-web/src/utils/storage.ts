import { supabase } from '@/lib/supabase'

// 本地文件转 base64（离线 / mock 兜底，避免上传失败时丢图）
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 通用上传：返回公开 URL（失败抛错，由调用方决定兜底）
export async function uploadToBucket(file: File, bucket: string, folder: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData?.publicUrl || ''
}

// 商品图片 / 视频上传：优先存 product-images 存储桶，失败（mock / 离线 / 未登录）回退 base64
// 这样管理后台上传的都是真实图片 URL，而非写进数据库字段的 base64 大串。
export async function uploadProductAsset(file: File): Promise<string> {
  try {
    const url = await uploadToBucket(file, 'product-images', 'products')
    if (url) return url
    throw new Error('empty public url')
  } catch {
    return fileToBase64(file)
  }
}
