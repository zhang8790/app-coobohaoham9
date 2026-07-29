// 消费偏好雷达图 · 零依赖 Canvas 2D 六边形组件（守主包 <1.5MB，不引图表库）
// 墨韵国潮风：赭红半透明填充 + 古金顶点 + 墨线网格。
import { useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { Canvas, View, Text } from '@tarojs/components'
import type { RadarDim } from '@/utils/food-therapy/radar-profile'

interface Props {
  dims: RadarDim[]
  size?: number
}

const INK = 'rgba(120,53,15,0.16)' // 网格墨线
const AXIS = 'rgba(120,53,15,0.28)' // 轴线
const FILL = 'rgba(154,51,36,0.22)' // 赭红半透明
const STROKE = '#9A3324' // 赭红描边
const GOLD = '#C8A45C' // 古金顶点
const LABEL = '#5B4636' // 标签墨色

export default function RadarChart({ dims, size = 260 }: Props) {
  const canvasId = useRef(`radar-${Math.random().toString(36).slice(2, 8)}`).current

  useEffect(() => {
    const n = dims.length
    if (n < 3) return
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
        ctx.clearRect(0, 0, size, size)

        const cx = size / 2
        const cy = size / 2
        const R = size / 2 - 42 // 预留标签空间
        const ringSteps = [0.25, 0.5, 0.75, 1]

        const angleAt = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n

        // 网格环
        ctx.lineWidth = 1
        for (const step of ringSteps) {
          ctx.beginPath()
          for (let i = 0; i <= n; i++) {
            const a = angleAt(i % n)
            const r = R * step
            const x = cx + r * Math.cos(a)
            const y = cy + r * Math.sin(a)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.strokeStyle = INK
          ctx.stroke()
        }

        // 轴线 + 标签
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (let i = 0; i < n; i++) {
          const a = angleAt(i)
          const x = cx + R * Math.cos(a)
          const y = cy + R * Math.sin(a)
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(x, y)
          ctx.strokeStyle = AXIS
          ctx.stroke()

          // 标签放在外圈外
          const lx = cx + (R + 22) * Math.cos(a)
          const ly = cy + (R + 22) * Math.sin(a)
          ctx.fillStyle = LABEL
          ctx.fillText(dims[i].label, lx, ly - 7)
          ctx.fillStyle = STROKE
          ctx.font = 'bold 12px sans-serif'
          ctx.fillText(`${Math.round(dims[i].value * 100)}%`, lx, ly + 8)
          ctx.font = '12px sans-serif'
        }

        // 数据多边形
        ctx.beginPath()
        for (let i = 0; i <= n; i++) {
          const idx = i % n
          const a = angleAt(idx)
          const r = R * Math.max(0.02, dims[idx].value)
          const x = cx + r * Math.cos(a)
          const y = cy + r * Math.sin(a)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fillStyle = FILL
        ctx.fill()
        ctx.strokeStyle = STROKE
        ctx.lineWidth = 2
        ctx.stroke()

        // 顶点古金圆点
        for (let i = 0; i < n; i++) {
          const a = angleAt(i)
          const r = R * Math.max(0.02, dims[i].value)
          const x = cx + r * Math.cos(a)
          const y = cy + r * Math.sin(a)
          ctx.beginPath()
          ctx.arc(x, y, 3.5, 0, 2 * Math.PI)
          ctx.fillStyle = GOLD
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      })
  }, [dims, size, canvasId])

  return (
    <View style={{ width: size, height: size, margin: '0 auto' }}>
      <Canvas type="2d" id={canvasId} style={{ width: size, height: size }} />
    </View>
  )
}
