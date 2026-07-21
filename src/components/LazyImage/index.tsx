import { useState, useEffect } from 'react'
import { View, Image } from '@tarojs/components'
import './index.scss'

export interface LazyImageProps {
  src: string
  width?: number | string
  height?: number | string
  mode?: 'scaleToFill' | 'aspectFit' | 'aspectFill' | 'widthFix' | 'heightFix'
  className?: string
  placeholder?: string
  onLoad?: () => void
  onError?: () => void
}

/**
 * 图片懒加载组件（小程序安全版）
 *
 * ⚠️ 重要变更：移除了 ref + IntersectionObserver
 * 微信小程序中 Taro 组件 ref 返回内部节点对象，
 * 该对象包含 parentNode↔childNodes 循环引用，
 * 传入事件系统会触发 "Converting circular structure to JSON" 错误。
 *
 * 现在依赖 Taro Image 自带的 lazyLoad 属性实现原生懒加载。
 */
export default function LazyImage(props: LazyImageProps) {
  const {
    src,
    width,
    height,
    mode = 'aspectFill',
    className = '',
    onLoad,
    onError,
  } = props

  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  // 组件挂载后标记可加载（配合 CSS 过渡效果）
  useEffect(() => {
    // 使用 requestAnimationFrame 确保 DOM 已渲染
    const timer = setTimeout(() => setLoaded(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const handleLoad = () => {
    onLoad?.()
  }

  const handleError = () => {
    console.warn('[LazyImage] 图片加载失败', src)
    setFailed(true)
    onError?.()
  }

  return (
    <View className={`lazy-image ${className}`} style={{ width, height }}>
      <Image
        src={src}
        mode={mode}
        className={`lazy-image__img ${loaded ? 'lazy-image__img--loaded' : ''}`}
        lazyLoad={true}
        onLoad={handleLoad}
        onError={handleError} />
      {!loaded && !failed && (
        <View className="lazy-image__placeholder" />
      )}
      {failed && (
        <View className="lazy-image__error">
          {/* 加载失败时留空或显示默认占位 */}
        </View>
      )}
    </View>
  )
}
