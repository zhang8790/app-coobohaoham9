// 服务场景标签（堂食 / 配送）—— 纯展示，状态由父页 form.scene_tags 驱动
import { View, Text } from '@tarojs/components'

const SCENE_OPTIONS = ['堂食', '配送']

export default function SceneTags({
  sceneTags,
  onToggle,
}: {
  sceneTags: string[]
  onToggle: (tag: string) => void
}) {
  return (
    <View className="px-4 mt-4">
      <Text className="text-base font-bold text-foreground mb-2 block">服务场景</Text>
      <View className="flex gap-2">
        {SCENE_OPTIONS.map(tag => {
          const active = sceneTags.includes(tag)
          return (
            <View
              key={tag}
              className={`px-4 py-2 rounded-full border text-sm font-bold ${active
                ? '!bg-primary !border-primary'
                : '!bg-white !border-gray-300'}`}
              onClick={() => onToggle(tag)}
            >
              <Text className={active ? 'text-white' : 'text-gray-600'}>{tag}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
