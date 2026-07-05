import Taro from '@tarojs/taro'
import { View, Image } from '@tarojs/components'
import { useRef, useEffect, useState } from 'react'
import './index.scss'

export interface LazyImageProps {
  src: string
  width?: number | string
  height?: number | string
  mode?: 'scaleToFill' | 'aspectFit' | 'aspectFill' | 'widthFix' | 'heightFix'
  className?: string
  placeholder?: string  // 占位图 URL
  threshold?: number     // 提前加载的阈值（px）
  onLoad?: () => void
  onError?: () => void
}

/**
 * 图片懒加载组件
 * 使用 Taro 的 IntersectionObserver 实现懒加载
 * 
 * 使用示例：
 * <LazyImage 
 *   src="https://example.com/image.jpg"
 *   width={200}
 *   height={200}
 *   mode="aspectFill"
 * />
 */
export default function LazyImage(props: LazyImageProps) {
  const {
    src,
    width,
    height,
    mode = 'aspectFill',
    className = '',
    placeholder = '',  // 可以设置为默认占位图
    threshold = 100,
    onLoad,
    onError,
  } = props

  const [loaded, setLoaded] = useState(false)
  const [currentSrc, setCurrentSrc] = useState(placeholder || '')
  const imgRef = useRef<any>(null)
  const observerRef = useRef<any>(null)

  useEffect(() => {
    // 小程序环境使用 Taro.createIntersectionObserver
    if (typeof Taro.createIntersectionObserver === 'function') {
      observerRef.current = Taro.createIntersectionObserver()
      observerRef.current
        .relativeToViewport({ top: threshold, bottom: threshold })
        .observe(imgRef.current, (res) => {
          if (res.intersectionRatio > 0 && !loaded) {
            setCurrentSrc(src)
            setLoaded(true)
            observerRef.current?.disconnect()
          }
        })
    } else {
      // H5 环境直接使用 src
      setCurrentSrc(src)
      setLoaded(true)
    }

    return () => {
      observerRef.current?.disconnect()
    }
  }, [src, threshold])

  const handleLoad = () => {
    onLoad?.()
  }

  const handleError = () => {
    console.warn('[LazyImage] 图片加载失败', src)
    onError?.()
  }

  return (
    <View ref={imgRef} className={`lazy-image ${className}`} style={{ width, height }}>
      {currentSrc && (
        <Image
          src={currentSrc}
          mode={mode}
          className={`lazy-image__img ${loaded ? 'lazy-image__img--loaded' : ''}`}
          onLoad={handleLoad}
          onError={handleError}
          lazyLoad={true}  // 启用 Taro 的懒加载
        />
      )}
      {!loaded && (
        <View className="lazy-image__placeholder">
          {/* 可以放骨架屏或默认占位图 */}
        </View>
      )}
    </View>
  )
}
