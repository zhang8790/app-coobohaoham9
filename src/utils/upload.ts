import Taro from "@tarojs/taro";
import { supabase } from "@/client/supabase";

/** 默认存储桶名 */
const DEFAULT_BUCKET = 'images'

/**
 * MIME type mappings for common file extensions
 */
export const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  json: 'application/json',
  xml: 'application/xml',
  csv: 'text/csv'
} as const

export interface MiniProgramFileInput {
  name: string
  type: string
  size: number
  tempFilePath: string
}

export interface SelectMediaOptions {
  count?: number
  mediaType?: ('image' | 'video' | 'mix')[]
  sourceType?: ('album' | 'camera')[]
  maxDuration?: number
  camera?: 'back' | 'front'
}

export interface SelectMessageFileOptions {
  count?: number
  type?: 'all' | 'video' | 'image' | 'file'
  extension?: string[]
}

export interface FileInputOptions {
  bucket: string
  userId?: string
}

export type FileBody =
  | ArrayBuffer
  | ArrayBufferView
  | Buffer
  | File
  | string

export type FileInput = MiniProgramFileInput | File

/**
 * Generate unique storage file name
 */
export function generateFileName(ext: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}.${ext}`
}

export function getMimeType(ext: string): string {
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream'
}

// ============================================================
// 核心上传函数：tempFilePath → Supabase Storage → 公网 URL
// ============================================================

/**
 * 将本地临时文件路径上传到 Supabase Storage，返回公网 URL
 *
 * 微信小程序限制说明：
 * - <Image src> 支持：网络URL / 本地临时路径(wxfile://)
 * - <Image src> 不支持：data URI (base64)
 *
 * 所以本函数只做「上传→返回URL」，不做 base64 转换
 *
 * @param options.silent 为 true 时不弹错误 Toast（用于回退场景，避免误导用户）
 */
export async function uploadToStorage(tempFilePath: string, options?: { bucket?: string; silent?: boolean }): Promise<string> {
  try {
    const bucket = options?.bucket || DEFAULT_BUCKET
    const ext = tempFilePath.split('.').pop() || 'jpg'
    const fileName = generateFileName(ext)

    // 获取当前用户 ID（用于存储路径）
    let userId = 'public'
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user?.id) userId = userData.user.id
      console.log('[uploadToStorage] 用户ID:', userId)
    } catch (authErr: any) {
      console.warn('[uploadToStorage] 获取用户失败，使用 public:', authErr?.message)
    }
    const storagePath = `${userId}/${fileName}`
    console.log('[uploadToStorage] 目标路径:', storagePath, '| 桶:', bucket)

    // 微信小程序必须先读成 ArrayBuffer 再传给 Supabase
    let fileBody: FileBody = tempFilePath
    try {
      const fs = Taro.getFileSystemManager()
      fileBody = await new Promise<ArrayBuffer>((resolve, reject) => {
        fs.readFile({
          filePath: tempFilePath,
          success: (res: any) => {
            console.log('[uploadToStorage] readFile 成功，大小:', res.data?.byteLength || 'unknown')
            resolve(res.data as ArrayBuffer)
          },
          fail: (err: any) => {
            console.error('[uploadToStorage] readFile 失败:', err?.errMsg || err)
            reject(err)
          },
        } as any)
      })
    } catch (readErr: any) {
      console.warn('[uploadToStorage] readFile 异常，尝试直接传路径:', readErr?.errMsg || readErr?.message)
      // readFile 失败时继续用原始路径尝试（某些情况下 supabase-js 可直接处理）
    }

    console.log('[uploadToStorage] 开始上传到 Supabase Storage...')
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBody, {
        contentType: getMimeType(ext),
        upsert: true,
      })

    if (error) {
      // 详细错误分类
      const errMsg = error.message || JSON.stringify(error)
      console.error('[uploadToStorage] ❌ 上传失败:', errMsg)

      if (!options?.silent) {
        if (errMsg.includes('bucket') || errMsg.includes('Bucket')) {
          Taro.showToast({ title: '存储桶不存在，请联系管理员', icon: 'none', duration: 3000 })
        } else if (errMsg.includes('permission') || errMsg.includes('RLS') || errMsg.includes('policy')) {
          Taro.showToast({ title: '无权限上传，检查存储策略', icon: 'none', duration: 3000 })
        } else if (errMsg.includes('quota') || errMsg.includes('size')) {
          Taro.showToast({ title: '文件太大或空间不足', icon: 'none', duration: 3000 })
        } else {
          Taro.showToast({ title: '上传失败: ' + errMsg.slice(0, 40), icon: 'none', duration: 3000 })
        }
      }
      return ''
    }

    if (!data?.path) {
      console.error('[uploadToStorage] 上传成功但 data.path 为空:', data)
      if (!options?.silent) Taro.showToast({ title: '上传返回异常', icon: 'none' })
      return ''
    }

    // 获取公网 URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
    const publicUrl = urlData?.publicUrl || ''
    console.log('[uploadToStorage] ✅ 上传成功! URL:', publicUrl.slice(0, 80))
    return publicUrl
  } catch (error: any) {
    const errMsg = error?.message || error?.errMsg || String(error)
    console.error('[uploadToStorage] 💥 未捕获异常:', errMsg)
    if (!options?.silent) Taro.showToast({ title: '上传异常: ' + errMsg.slice(0, 50), icon: 'none', duration: 3000 })
    return ''
  }
}

// ============================================================
// 便捷选图+上传（返回 Storage URL，用于持久化存储）
// ============================================================

/**
 * 🖼️ 选图并上传到 Storage，返回公网 URL
 *
 * 注意：此 URL 用于**持久化存储到数据库**
 * 如果需要**立即可见的预览**，请直接使用 chooseMedia 返回的 tempFilePath
 */
export async function uploadImage(options?: {
  filePath?: string
  count?: number
  bucket?: string
}): Promise<string | string[]> {
  try {
    let tempPaths: string[] = []

    if (options?.filePath) {
      tempPaths = [options.filePath]
    } else {
      const res = await Taro.chooseMedia({
        mediaType: ['image'],
        count: options?.count || 1,
        sizeType: ['compressed'],
      })
      tempPaths = res.tempFiles.map((f: any) => f.tempFilePath)
      if (!tempPaths.length) return options?.count ? [] : ''
    }

    // 逐张上传到 Storage
    const urls: string[] = []
    for (const tp of tempPaths) {
      const url = await uploadToStorage(tp, { bucket: options?.bucket })
      urls.push(url)
    }

    return options?.count ? urls : urls[0]
  } catch (error: any) {
    console.error('[uploadImage] 异常:', error?.message || error)
    return options?.count ? [] : ''
  }
}

// ============================================================
// 🎬 视频上传函数
// ============================================================

/**
 * 🎬 选择视频并上传到 Storage，返回公网 URL
 *
 * 限制：
 * - 微信小程序视频大小限制：最大 200MB
 * - 建议时长：不超过 60 秒
 * - 支持格式：MP4, MOV, AVI
 *
 * 容错：优先写入 videos 桶；若 videos 桶尚未创建（迁移未执行），
 * 静默回退到已存在的 images 桶，保证视频上传功能始终可用。
 */
export async function uploadVideo(options?: {
  filePath?: string
  bucket?: string
  maxDuration?: number
}): Promise<string> {
  try {
    let tempFilePath: string = ''

    if (options?.filePath) {
      tempFilePath = options.filePath
    } else {
      const res = await Taro.chooseMedia({
        mediaType: ['video'],
        count: 1,
        maxDuration: options?.maxDuration || 60,
        sourceType: ['album', 'camera'],
      })
      tempFilePath = res.tempFiles[0]?.tempFilePath || ''
      if (!tempFilePath) return ''
    }

    // 优先上传到 videos 桶；若桶不存在（未创建）则静默回退到 images 桶，保证可用性
    let url = await uploadToStorage(tempFilePath, { bucket: options?.bucket || 'videos', silent: true })
    if (!url) {
      console.warn('[uploadVideo] videos 桶不可用，回退到 images 桶')
      url = await uploadToStorage(tempFilePath, { bucket: 'images' })
    }
    return url
  } catch (error: any) {
    console.error('[uploadVideo] 异常:', error?.message || error)
    Taro.showToast({ title: '视频上传失败', icon: 'none' })
    return ''
  }
}

// ============================================================
// 旧版兼容接口（保持不动）
// ============================================================

export async function uploadToSupabase(
  file: FileInput,
  options: FileInputOptions
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { bucket, userId } = options
    const ext = file?.name?.split('.').pop() || 'file'
    const storageName = `${userId || 'public'}/${generateFileName(ext)}`
    const fileBody: FileBody = Taro.getEnv() === Taro.ENV_TYPE.WEB ? (file as File)
      : (file as MiniProgramFileInput).tempFilePath

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storageName, fileBody, { contentType: file.type, upsert: false })

    if (error) throw error
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Upload failed' }
  }
}

export async function selectMediaFiles(options: SelectMediaOptions = {}): Promise<(MiniProgramFileInput | File)[]> {
  const {
    count = 1,
    mediaType = ['image', 'video'],
    sourceType = ['album', 'camera'],
    maxDuration,
    camera = 'back'
  } = options

  try {
    const result = await Taro.chooseMedia({ count, mediaType, sourceType, maxDuration, camera })
    if (!result.tempFiles?.length) return []
    return result.tempFiles.map((file: any) => {
      if (Taro.getEnv() === Taro.ENV_TYPE.WEB) return file.originalFileObj as File
      const tempFilePath = file.tempFilePath
      const ext = tempFilePath.split('.').pop() || 'unknown'
      return { name: generateFileName(ext), type: getMimeType(ext), size: file.size, tempFilePath }
    })
  } catch (error: any) {
    console.error('Failed to select media files:', error)
    return []
  }
}

export async function selectMessageFile(options: SelectMessageFileOptions = {}): Promise<MiniProgramFileInput | File | null> {
  const { count = 1, type = 'file', extension = ['pdf'] } = options
  try {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      return new Promise<File | null>((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = extension.map(ext => `.${ext}`).join(',')
        input.onchange = (e: Event) => {
          const target = e.target as HTMLInputElement
          const selectedFile = target.files?.[0]
          input.remove()
          resolve(selectedFile || null)
        }
        input.oncancel = () => { input.remove(); resolve(null) }
        input.click()
      })
    }
    const result = await Taro.chooseMessageFile({ count, type, extension })
    if (!result.tempFiles?.length) return null
    const file = result.tempFiles[0]
    const ext = file.name?.split('.').pop() || extension[0]
    return { name: file.name, type: getMimeType(ext), size: file.size, tempFilePath: file.path }
  } catch (error: any) {
    console.error('Failed to select message file:', error)
    return null
  }
}
