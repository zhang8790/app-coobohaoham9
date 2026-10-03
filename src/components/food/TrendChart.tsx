// 复测趋势折线（0~100 纵轴 + 日期横轴），仅 ≥2 个点时连线，否则只落当前点。
// 零依赖 Canvas 2D（守主包体积）。被 TongueReport 与「食养画像」页共用。
import Taro from '@tarojs/taro'
import { View, Canvas } from '@tarojs/components'
import { useEffect, useRef } from 'react'
import type { TongueHistoryPoint } from '@/utils/food-therapy/tongue-history'

export default function TrendChart({ points, color }: { points: TongueHistoryPoint[]; color: string }) {
  const canvasId = useRef(`ttrend-${Math.random().toString(36).slice(2, 8)}`).current
  const W = 300
  const H = 150

  useEffect(() => {
    if (!points.length) return
    const q = Taro.createSelectorQuery()
    q.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res: any) => {
        const info = res && res[0]
        if (!info || !info.node) return
        const canvas = info.node
        const ctx = canvas.getContext('2d')
        const dpr = (Taro.getSystemInfoSync() as any).pixelRatio || 2
        canvas.width = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, W, H)

        const padL = 30
        const padR = 14
        const padT = 14
        const padB = 24
        const plotW = W - padL - padR
        const plotH = H - padT - padB
        const yAt = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH
        const n = points.length
        const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW)

        ctx.font = '10px sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        for (const v of [0, 20, 40, 60, 80, 100]) {
          const y = yAt(v)
          ctx.beginPath()
          ctx.moveTo(padL, y)
          ctx.lineTo(padL + plotW, y)
          ctx.strokeStyle = 'rgba(0,0,0,0.06)'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.fillStyle = '#9A9388'
          ctx.fillText(String(v), padL - 6, y)
        }

        if (n >= 2) {
          ctx.beginPath()
          points.forEach((p, i) => {
            const x = xAt(i)
            const y = yAt(p.v)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.stroke()
        }

        ctx.textAlign = 'center'
        points.forEach((p, i) => {
          const x = xAt(i)
          const y = yAt(p.v)
          ctx.beginPath()
          ctx.arc(x, y, 3.5, 0, 2 * Math.PI)
          ctx.fillStyle = '#fff'
          ctx.fill()
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.stroke()

          ctx.fillStyle = color
          ctx.font = 'bold 10px sans-serif'
          ctx.fillText(p.v.toFixed(1), x, y - 10)

          ctx.fillStyle = '#9A9388'
          ctx.font = '10px sans-serif'
          ctx.fillText(p.d, x, H - 10)
        })
      })
  }, [points, color, canvasId])

  return (
    <View style={{ width: '100%', marginTop: 8 }}>
      <Canvas type="2d" id={canvasId} style={{ width: `${W}px`, height: `${H}px`, margin: '0 auto' }} />
    </View>
  )
}
