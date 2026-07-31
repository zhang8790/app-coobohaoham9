// @title 微传媒图文编辑器
// 复用 RichEditor.tsx 组件，专注路由分发
import { useEffect, useRef } from 'react'
import { View, Text } from '@tarojs/components'
import RichEditor from '../make/RichEditor'

export default function MakeRichPage() {
  const shareRef = useRef<{ title: string; path: string; imageUrl: string }>({
    title: '来电有喜 · 创作',
    path: '/pages/content/content-center/make-rich/index',
    imageUrl: '',
  })

  return <RichEditor shareRef={shareRef} />
}
