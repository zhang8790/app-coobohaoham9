// @title 食品配料安全
import { useState, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Textarea, Button, Image } from '@tarojs/components'
import { resolveFoodAdditivesByText, createIngredientOcrTask, getFoodAdditivesByNames } from '@/db/food-api'
import { supabase } from '@/client/supabase'
import { matchIngredientKeys, resolveIngredientEntries } from '@/utils/ingredient-analysis'
import type { IngredientEntry } from '@/utils/shiyang-dictionary'
import FoodSafetyPanel from '@/components/FoodSafetyPanel'
import { useLocation } from '@/contexts/LocationContext'
import { uploadToStorage } from '@/utils/upload'
import type { FoodAdditive } from '@/db/types'

export default function FoodScanPage() {
  const { currentStore } = useLocation()
  const [text, setText] = useState('')
  const [additives, setAdditives] = useState<FoodAdditive[]>([])
  const [shiyang, setShiyang] = useState<IngredientEntry[]>([])
  const [analyzed, setAnalyzed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [imgPreview, setImgPreview] = useState('')
  const [ocrMsg, setOcrMsg] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)

  // 安全评级汇总：命中配料风险等级 → S(全白) / A(含黄) / C(含黑)
  const grade = useMemo(() => {
    if (!additives.length) return null
    if (additives.some((a) => a.risk_level === 'black')) return { g: 'C', label: '含慎用成分', color: '#DC2626' }
    if (additives.some((a) => a.risk_level === 'yellow')) return { g: 'A', label: '含限量成分', color: '#D97706' }
    return { g: 'S', label: '配料较安全', color: '#16A34A' }
  }, [additives])

  const analyze = async () => {
    if (!text.trim()) {
      Taro.showToast({ title: '请输入配料或商品名', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const [add, keys] = await Promise.all([
        resolveFoodAdditivesByText(text),
        Promise.resolve(matchIngredientKeys(text)),
      ])
      setAdditives(add)
      setShiyang(resolveIngredientEntries({ ingredients: keys }))
      setAnalyzed(true)
    } catch (e) {
      console.error('[FoodScan] 解析失败', e)
      Taro.showToast({ title: '解析失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const chooseImage = async () => {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      const tp = res.tempFilePaths[0]
      setImgPreview(tp)
      setOcrLoading(true)
      setOcrMsg('正在上传并提交识别...')
      try {
        const url = await uploadToStorage(tp, { bucket: 'product-images' })
        const task = await createIngredientOcrTask({ image_url: url, store_id: currentStore?.id || null })
        if (!task) {
          setOcrMsg('提交失败，请重试')
          return
        }
        setOcrMsg('正在识别配料表...')
        const { data: ef, error: efErr } = await supabase.functions.invoke('ocr-ingredient', {
          body: { task_id: task.id },
        })
        if (efErr || !ef?.success) {
          const msg: string = ef?.error || efErr?.message || '识别服务异常'
          if (msg.includes('百度OCR未配置') || msg.includes('BAIDU_OCR')) {
            setOcrMsg('OCR 识别服务未配置，请改用「粘贴配料文字」方式分析')
          } else {
            setOcrMsg('识别失败：' + msg)
          }
          return
        }
        // 用引擎回传的命中名回查完整安全库记录，复用既有评级与面板
        const full = await getFoodAdditivesByNames(ef.matched_additives || [])
        setAdditives(full)
        const keys = matchIngredientKeys((ef.parsed_ingredients || []).join(','))
        setShiyang(resolveIngredientEntries({ ingredients: keys }))
        setAnalyzed(true)
        setOcrMsg(ef.safety_grade === 'C' ? '识别完成：含慎用成分，请查看安全评级' : '识别完成')
      } catch (e: any) {
        setOcrMsg('处理失败：' + (e?.message || '网络异常'))
      } finally {
        setOcrLoading(false)
      }
    } catch {
      /* 用户取消选择，忽略 */
    }
  }

  return (
    <View className="min-h-screen bg-[#FFFBF7] px-4 pt-4 pb-12">
      <Text className="text-xl font-bold text-foreground">🍱 食品配料安全</Text>
      <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 4, lineHeight: 1.6 }}>
        粘贴配料表文字或输入商品名，即时分析添加剂安全与食材食养。拍照可提交服务端识别（后台审核后生成结果）。
      </Text>

      {/* 文本输入解析（主控，即时可用） */}
      <View className="mt-4 rounded-2xl border border-black/5 bg-white p-3">
        <Textarea
          value={text}
          onInput={(e) => setText(e.detail.value)}
          placeholder="例如：水、白砂糖、山梨酸钾、柠檬黄、食用香精..."
          maxlength={2000}
          style={{ width: '100%', height: 96, fontSize: 14, lineHeight: '1.6' }}
        />
        <Button
          onClick={analyze}
          loading={loading}
          className="mt-2 rounded-full"
          style={{ background: '#1A1A1A', color: '#fff', fontSize: 14 }}
        >
          解析配料
        </Button>
      </View>

      {/* 拍照识别（提交 OCR 任务，后端引擎待接） */}
      <View className="mt-3 flex flex-row items-center" style={{ gap: 12 }}>
        <Button
          onClick={chooseImage}
          loading={ocrLoading}
          className="rounded-full"
          style={{ background: '#F0EDE8', color: '#1A1A1A', fontSize: 14 }}
        >
          📷 拍照识别
        </Button>
        {imgPreview && <Image src={imgPreview} style={{ width: 56, height: 56, borderRadius: 10 }} />}
      </View>
      {ocrMsg && (
        <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 6, lineHeight: 1.6 }}>
          {ocrMsg}
        </Text>
      )}

      {/* 安全评级总览 */}
      {analyzed && grade && (
        <View
          className="mt-4 rounded-2xl p-4"
          style={{
            backgroundColor: grade.color + '14',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text className="text-base font-bold" style={{ color: grade.color }}>
            安全评级 {grade.g}
          </Text>
          <Text className="text-sm" style={{ color: grade.color }}>
            {grade.label}
          </Text>
        </View>
      )}

      {/* 明细面板 */}
      {analyzed && <FoodSafetyPanel foodAdditives={additives} shiyangEntries={shiyang} />}
      {analyzed && !additives.length && !shiyang.length && (
        <Text className="text-sm text-muted-foreground mt-4" style={{ display: 'block', lineHeight: 1.6 }}>
          未识别到已知配料或食材，请检查输入内容。
        </Text>
      )}
    </View>
  )
}
