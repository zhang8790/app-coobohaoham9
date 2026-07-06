// 图片上传 Hook
import { useState, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'

export interface UseImageUploadOptions {
  bucket?: string
  folder?: string
  maxSizeMB?: number
  allowedTypes?: string[]
}

export interface UseImageUploadReturn {
  uploading: boolean
  uploadProgress: number
  error: string | null
  uploadImage: (filePath: string) => Promise<string | null>
  uploadImages: (filePaths: string[]) => Promise<string[]>
  clearError: () => void
}

export function useImageUpload(options: UseImageUploadOptions = {}): UseImageUploadReturn {
  const {
    bucket = 'product-images',
    folder = 'uploads',
    maxSizeMB = 5,
    allowedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  } = options

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // 上传单张图片
  const uploadImage = useCallback(async (filePath: string): Promise<string | null> => {
    setUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      // 验证文件类型
      // 注意：小程序环境中无法获取 file.type，需要跳过类型检查
      // if (file.type && !allowedTypes.includes(file.type)) {
      //   throw new Error('不支持的文件类型')
      // }

      // 生成唯一文件名
      const fileExt = filePath.split('.').pop() || 'jpg'
      const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`

      // 上传到 Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, filePath, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      setUploadProgress(100)

      // 获取公开 URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path)

      return publicUrl
    } catch (err: any) {
      const errorMsg = err.message || '上传失败'
      setError(errorMsg)
      Taro.showToast({ title: errorMsg, icon: 'none' })
      return null
    } finally {
      setUploading(false)
    }
  }, [bucket, folder])

  // 上传多张图片
  const uploadImages = useCallback(async (filePaths: string[]): Promise<string[]> => {
    setUploading(true)
    setError(null)
    setUploadProgress(0)

    const urls: string[] = []
    const total = filePaths.length

    try {
      for (let i = 0; i < total; i++) {
        const url = await uploadImage(filePaths[i])
        if (url) {
          urls.push(url)
        }
        setUploadProgress(Math.round(((i + 1) / total) * 100))
      }

      return urls
    } catch (err: any) {
      setError(err.message || '上传失败')
      return urls  // 返回已上传的 URL
    } finally {
      setUploading(false)
    }
  }, [uploadImage])

  // 清除错误
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    uploading,
    uploadProgress,
    error,
    uploadImage,
    uploadImages,
    clearError,
  }
}

// 默认导出
export default useImageUpload
