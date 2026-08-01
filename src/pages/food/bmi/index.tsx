// @title BMI计算器
import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'

export default function BmiPage() {
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [result, setResult] = useState<{ bmi: number; label: string; color: string; advice: string } | null>(null)

  const calc = () => {
    const h = parseFloat(height) / 100
    const w = parseFloat(weight)
    if (!h || !w || h <= 0 || w <= 0) return
    const bmi = Math.round((w / (h * h)) * 10) / 10
    let label = '', color = '', advice = ''
    if (bmi < 18.5) { label = '偏瘦'; color = '#0ea5e9'; advice = '建议适当增加营养摄入，搭配蛋白质丰富的食物' }
    else if (bmi < 24) { label = '正常'; color = '#16a34a'; advice = '体重健康，保持均衡饮食和规律运动' }
    else if (bmi < 28) { label = '偏胖'; color = '#e67e22'; advice = '建议控制热量摄入，多吃蔬菜水果，适量运动' }
    else { label = '肥胖'; color = '#dc2626'; advice = '建议咨询营养师制定科学减重计划' }
    setResult({ bmi, label, color, advice })
  }

  return (
    <View style={{ minHeight: '100vh', background: '#f8fafc', padding: 16 }}>
      <View style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>⚖️ BMI 计算器</Text>
        <Text style={{ fontSize: 13, color: '#fff', opacity: 0.7, marginTop: 4, display: 'block' }}>身体质量指数，评估体重是否健康</Text>
      </View>

      <View style={{ background: '#fff', borderRadius: 14, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 4 }}>身高 (cm)</Text>
        <Input style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 16 }}
          type="digit" placeholder="输入身高，如 170" value={height} onInput={(e: any) => setHeight(e.detail.value)} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 16 }}>体重 (kg)</Text>
        <Input style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 16 }}
          type="digit" placeholder="输入体重，如 65" value={weight} onInput={(e: any) => setWeight(e.detail.value)} />
        <View style={{ marginTop: 16, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
          onClick={calc}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>计算 BMI</Text>
        </View>
      </View>

      {result && (
        <View style={{ background: '#fff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', alignItems: 'center' }}>
          <Text style={{ fontSize: 48, fontWeight: '800', color: result.color }}>{result.bmi}</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: result.color, marginTop: 4 }}>{result.label}</Text>
          <Text style={{ fontSize: 13, color: '#64748b', marginTop: 8, textAlign: 'center', lineHeight: '20px', display: 'block' }}>{result.advice}</Text>
        </View>
      )}
    </View>
  )
}
