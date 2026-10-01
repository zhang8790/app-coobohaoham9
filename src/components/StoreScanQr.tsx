// 门店「普通二维码」Canvas 组件（应用内「扫码购物」可识别）
// 太阳码（小程序码）应用内 wx.scanCode 无法识别（微信平台限制），故门店进店码
// 同时提供一张普通二维码：内容为标准 scene 串 `s=短码&r=推广码`，应用内扫码后
// scanAndRoute 命中 s= 即 navigateTo 进店。纯前端 canvas 绘制，零后端依赖。
import { useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { Canvas, View } from '@tarojs/components'

// @ts-ignore - 内联 UMD 单文件（MIT），无类型声明
import qrcode from '@/utils/qrcode-generator'

interface Props {
  content: string
  size?: number
}

export default function StoreScanQr({ content, size = 224 }: Props) {
  const canvasId = useRef(`scanqr-${Math.random().toString(36).slice(2, 8)}`).current

  useEffect(() => {
    if (!content) return
    const q = Taro.createSelectorQuery()
    q.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res: any) => {
        const info = res && res[0]
        if (!info || !info.node) return
        const canvas = info.node
        const ctx = canvas.getContext('2d')
        const dpr = (Taro.getSystemInfoSync() as any).pixelRatio || 2
        canvas.width = size * dpr
        canvas.height = size * dpr
        ctx.scale(dpr, dpr)

        // 白底
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, size, size)

        try {
          const qr = (qrcode as any)(0, 'M')
          qr.addData(content)
          qr.make()
          const count = qr.getModuleCount()
          const margin = 2 // 静区（模块数）
          const total = count + margin * 2
          const cell = Math.floor((size / total) * 100) / 100
          ctx.fillStyle = '#000000'
          for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) {
              if (qr.isDark(r, c)) {
                // +0.6 抵消抗锯齿白缝
                ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell + 0.6, cell + 0.6)
              }
            }
          }
        } catch (e) {
          console.error('[StoreScanQr] 生成失败', e)
        }
      })
  }, [content, size, canvasId])

  return (
    <View style={{ width: size, height: size, backgroundColor: '#FFFFFF' }}>
      <Canvas type="2d" id={canvasId} style={{ width: size, height: size }} />
    </View>
  )
}
