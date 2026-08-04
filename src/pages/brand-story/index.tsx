// @title 品牌故事（B 端出口页）
// 承载企业使命 / 差异化战略 / 资质 / 合作 / 历程，面向新访客、合作方、潜在投资方。
// 文案与数据均为占位，标注「待补充」处由运营/创始人替换真实信息（不杜撰硬性背书）。
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect } from 'react'

// 本地简易区块标题（与首页 SectionHeader 同源视觉语言）
function BlockTitle({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <View className="flex items-center gap-2 mb-3">
      <View className="section-emoji">{emoji}</View>
      <View className="min-w-0">
        <Text className="text-lg font-extrabold text-foreground leading-tight block">{title}</Text>
        {subtitle && <Text className="text-xs text-muted-foreground block mt-0.5">{subtitle}</Text>}
      </View>
    </View>
  )
}

const STRATEGY = [
  { icon: '🧠', t: '食养引擎', d: 'AI 解读每一口成分，把"吃什么对身体好"变成可执行的日常选择——普通零食电商没有的能力。' },
  { icon: '🌿', t: '24节气顺时', d: '跟着节气吃对食物，把中医食养智慧做成可订阅的当季方案，建立长期复购心智。' },
  { icon: '👨‍👩‍👧', t: '家庭健康档案', d: '一人一档的食养方案，覆盖宝宝/长辈/孕产等全家人场景，沉淀高价值家庭关系链。' },
]

const MILESTONES = [
  { year: '2023', t: '项目立项', d: '确定"食养零食"差异化赛道，搭建 AI 食养引擎 MVP。' },
  { year: '2024', t: '首店落地', d: '杭州首店开业，跑通扫码查安全 + 节气食盒闭环。' },
  { year: '2025', t: '平台扩张', d: '多店加盟 + 分销体系上线，食养画像覆盖数万家庭。' },
  { year: '2026', t: '生态共建', d: '开放食材安全库与科研合作，强化供应链护城河。' },
]

export default function BrandStoryPage() {
  useEffect(() => {
    Taro.setNavigationBarTitle({ title: '品牌故事' })
  }, [])

  return (
    <ScrollView scrollY className="min-h-screen bg-background" style={{ paddingBottom: 40 }}>
      {/* 品牌主视觉 */}
      <View
        className="mx-4 mt-4 rounded-2xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, hsl(152 24% 38%) 0%, hsl(19 57% 42%) 100%)', color: '#fff' }}
      >
        <View style={{ position: 'absolute', right: -28, top: -28, width: 130, height: 130, borderRadius: '50%', background: 'rgba(232,198,107,0.18)' }} />
        <View className="flex items-center gap-2">
          <View className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(135deg,#E8C66B,hsl(40 42% 52%))', fontSize: 22 }}>🍃</View>
          <Text className="text-2xl font-extrabold">来电有喜</Text>
        </View>
        <Text className="text-sm block mt-3" style={{ opacity: 0.85, lineHeight: 1.6 }}>
          懂身体的好物 · 顺时而食的智慧零售
        </Text>
      </View>

      {/* 我们是谁 */}
      <View className="pg-card mx-4 mt-4 p-4 rounded-2xl">
        <BlockTitle emoji="📖" title="我们是谁" subtitle="一家把食养做成日常的消费品牌" />
        <Text className="text-sm text-muted-foreground block" style={{ lineHeight: 1.7 }}>
          来电有喜面向家庭场景，提供"可解释、可追溯、可定制"的食养好物。我们相信，零食不该只是嘴巴的快乐，更该是身体的照顾。
          <Text className="text-xs text-warning block mt-2">（此处待补充：企业使命、创始团队背景、品牌主张的真实表述）</Text>
        </Text>
      </View>

      {/* 差异化战略 */}
      <View className="mx-4 mt-4">
        <BlockTitle emoji="🧭" title="我们的差异化战略" subtitle="三道护城河，区隔普通零食电商" />
        <View style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STRATEGY.map((s) => (
            <View key={s.t} className="pg-card rounded-2xl p-4">
              <View className="flex items-center gap-2 mb-1.5">
                <Text className="text-xl">{s.icon}</Text>
                <Text className="text-base font-bold text-foreground">{s.t}</Text>
              </View>
              <Text className="text-sm text-muted-foreground block" style={{ lineHeight: 1.6 }}>{s.d}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 资质与认证 */}
      <View className="pg-card mx-4 mt-4 p-4 rounded-2xl">
        <BlockTitle emoji="🔒" title="资质与认证" subtitle="看得见的安心" />
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['食品经营许可证', 'ISO 22000', '第三方检测报告', '有机认证', 'HACCP'].map((k) => (
            <View key={k} className="seal-pill">
              <Text className="text-xs text-primary font-semibold">{k}</Text>
            </View>
          ))}
        </View>
        <Text className="text-xs text-warning block mt-3">（上述为常见资质示例，待补充：本项目真实持有的资质名称与证书编号）</Text>
      </View>

      {/* 合作机构 */}
      <View className="pg-card mx-4 mt-4 p-4 rounded-2xl">
        <BlockTitle emoji="🤝" title="合作与共建" subtitle="供应链与科研护城河" />
        <Text className="text-sm text-muted-foreground block" style={{ lineHeight: 1.7 }}>
          我们与食材直供基地、科研机构、检测平台建立长期合作，持续把更安全的食养好物带给家庭。
          <Text className="text-xs text-warning block mt-2">（待补充：真实合作机构名称、合作形式、合作年限）</Text>
        </Text>
      </View>

      {/* 发展历程 */}
      <View className="pg-card mx-4 mt-4 p-4 rounded-2xl">
        <BlockTitle emoji="🪜" title="发展历程" subtitle="六年食养长跑" />
        <View style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {MILESTONES.map((m, i) => (
            <View key={m.year} className="flex gap-3" style={{ position: 'relative', paddingBottom: i === MILESTONES.length - 1 ? 0 : 16 }}>
              <View className="flex flex-col items-center flex-shrink-0" style={{ width: 44 }}>
                <View className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: '50%', background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))', fontSize: 12, fontWeight: 800 }}>{m.year}</View>
                {i !== MILESTONES.length - 1 && <View style={{ flex: 1, width: 2, background: 'hsl(var(--border))', marginTop: 4 }} />}
              </View>
              <View className="flex-1 pb-1">
                <Text className="text-sm font-bold text-foreground block">{m.t}</Text>
                <Text className="text-xs text-muted-foreground block mt-0.5" style={{ lineHeight: 1.5 }}>{m.d}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text className="text-xs text-warning block mt-2">（里程碑为示意，待补充：真实成立时间、关键节点与数据）</Text>
      </View>

      {/* 合作入口 */}
      <View
        className="mx-4 mt-4 rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform"
        hoverClass="none"
        onClick={() => Taro.navigateTo({ url: '/pages/mine/messages/index' })}
        style={{ background: 'linear-gradient(120deg, hsl(var(--card)), hsl(40 38% 88%))', borderWidth: 1, borderColor: 'hsl(var(--border))' }}
      >
        <View className="min-w-0">
          <Text className="text-base font-extrabold text-foreground block">商务合作 / 品牌联名</Text>
          <Text className="text-xs text-muted-foreground mt-1 block">期待与您共建食养生态 →</Text>
        </View>
        <Text style={{ fontSize: 20, color: 'hsl(40 42% 52%)' }} className="flex-shrink-0">›</Text>
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
  )
}
