// @title 情绪检查
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input, Button } from '@tarojs/components'
import { matchEmotion, getEmotionResponse } from '@/db/emotion'
import type { EmotionResponse } from '@/db/types'

// 情绪标签配置
const EMOTION_CONFIG = {
  drained_low: { name: '耗竭态', color: '#A8B5C0', icon: '😴' },
  lonely_still: { name: '孤独态', color: '#C0C8D4', icon: '🌙' },
  expressive_high: { name: '表达驱动态', color: '#FADEA8', icon: '🎉' },
  peaceful_zen: { name: '平稳态', color: '#E8DDD0', icon: '🍃' },
  nostalgic_soft: { name: '怀念态', color: '#D9C6A6', icon: '📷' },
  eager_forward: { name: '渴望态', color: '#C9D6E8', icon: '✨' },
}

export default function EmotionCheckPage() {
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [emotionResponse, setEmotionResponse] = useState<EmotionResponse | null>(null)
  const [showResult, setShowResult] = useState(false)

  // 提交情绪表达
  const handleSubmit = async () => {
    if (!inputText.trim()) {
      Taro.showToast({ title: '请输入你的感受', icon: 'none' })
      return
    }

    setLoading(true)
    try {
      // 匹配情绪
      const innerLabel = await matchEmotion(inputText)

      if (!innerLabel) {
        Taro.showToast({ title: '暂未识别到情绪，请换个说法试试', icon: 'none' })
        setLoading(false)
        return
      }

      console.log('[Emotion] 匹配到情绪:', innerLabel)

      // 获取情绪响应
      const response = await getEmotionResponse(innerLabel)
      setEmotionResponse(response)
      setShowResult(true)

    } catch (error) {
      console.error('[Emotion] 处理失败:', error)
      Taro.showToast({ title: '处理失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 重置
  const handleReset = () => {
    setInputText('')
    setEmotionResponse(null)
    setShowResult(false)
  }

  // 渲染结果页
  if (showResult && emotionResponse) {
    const config = EMOTION_CONFIG[emotionResponse.inner_label]

    return (
      <View className="min-h-screen bg-background p-4">
        {/* 情绪标签 */}
        <View className="flex items-center justify-center gap-2 mb-6">
          <Text className="text-4xl">{config.icon}</Text>
          <Text className="text-2xl font-bold" style={{ color: config.color }}>
            {config.name}
          </Text>
        </View>

        {/* 情绪翻译文案（0.4秒浮现） */}
        <View className="bg-card rounded-2xl border border-border p-6 mb-4 animate-fade-in">
          <Text className="text-lg text-foreground leading-relaxed">
            {emotionResponse.translation}
          </Text>
        </View>

        {/* 场景卡片标题 (N005) */}
        <Text className="text-xl font-bold text-foreground mb-3">为你推荐</Text>
        <View className="space-y-3 mb-6">
          {emotionResponse.sceneCards.map((card, index) => (
            <View key={card.id} className="bg-card rounded-2xl border border-border p-4"
              style={{ borderLeftWidth: '4px', borderLeftColor: config.color }}>
              <Text className="text-lg font-bold text-foreground">{card.title}</Text>
              {card.subtitle && (
                <Text className="text-base text-muted-foreground mt-1">{card.subtitle}</Text>
              )}
            </View>
          ))}
        </View>

        {/* Feed流标题 (F019) */}
        <Text className="text-xl font-bold text-foreground mb-3">附近推荐</Text>
        <View className="space-y-3 mb-6">
          {emotionResponse.feedTitles.map((feed, index) => (
            <View key={feed.id} className="bg-card rounded-2xl border border-border p-4">
              <Text className="text-base font-bold text-foreground">{feed.title}</Text>
              {feed.subtitle && (
                <View className="flex items-center gap-2 mt-2">
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                  <Text className="text-sm text-muted-foreground">{feed.subtitle}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* 重新表达按钮 */}
        <Button className="!bg-primary !border-none !rounded-2xl !py-3"
          onClick={handleReset}>
          <Text className="text-base font-bold text-white">重新表达</Text>
        </Button>
      </View>
    )
  }

  // 输入页
  return (
    <View className="min-h-screen bg-background p-4">
      {/* 标题 */}
      <View className="text-center mb-8 mt-10">
        <Text className="text-3xl font-bold text-foreground">情绪表达</Text>
        <Text className="text-base text-muted-foreground mt-2 block">
          说出你现在的感受，我会帮你找到合适的地方
        </Text>
      </View>

      {/* 输入框 */}
      <View className="bg-card rounded-2xl border border-border p-4 mb-4">
        <Input
          className="w-full min-h-[120px] text-lg"
          placeholder="例如：今天好累、一个人好无聊、心情超好..."
          value={inputText}
          onInput={(e) => setInputText(e.detail.value)}
          maxlength={100}
          multiline
        />
      </View>

      {/* 提示词 */}
      <View className="flex flex-wrap gap-2 mb-6">
        {['累', '一个人', '开心', '放松', '怀念', '想要'].map((word, index) => (
          <View key={index}
            className="px-4 py-2 bg-primary/10 rounded-full"
            onClick={() => setInputText(word)}>
            <Text className="text-primary">{word}</Text>
          </View>
        ))}
      </View>

      {/* 提交按钮 */}
      <Button
        className="!bg-primary !border-none !rounded-2xl !py-3"
        onClick={handleSubmit}
        disabled={loading}>
        <Text className="text-base font-bold text-white">
          {loading ? '识别中...' : '开始表达'}
        </Text>
      </Button>

      {/* 说明 */}
      <View className="mt-8 p-4 bg-muted/30 rounded-2xl">
        <Text className="text-sm text-muted-foreground leading-relaxed">
          💡 我会识别你的情绪，并为你推荐合适的地方和活动。
          支持的情绪：疲惫、孤独、开心、放松、怀念、渴望等。
        </Text>
      </View>
    </View>
  )
}
