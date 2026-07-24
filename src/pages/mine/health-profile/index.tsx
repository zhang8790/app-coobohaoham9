// @title 我的体质档案
import { useState, useEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { getUserHealthProfile, upsertUserHealthProfile } from '@/db/food-api'
import {
  ALLERGY_OPTIONS,
  BODY_STATE_OPTIONS,
  CHRONIC_OPTIONS,
  HEALTH_GOAL_OPTIONS,
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
} from '@/utils/food-therapy/profile-map'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import type { UserHealthProfile } from '@/db/types'

function Chip({
  label,
  active,
  danger,
  onClick,
}: {
  label: string
  active: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <View
      onClick={onClick}
      className="px-4 py-2 rounded-full text-base border"
      style={{
        background: active ? (danger ? '#FEE2E2' : 'hsl(var(--primary))') : '#fff',
        borderColor: active ? (danger ? '#DC2626' : 'hsl(var(--primary))') : 'rgba(0,0,0,0.08)',
        color: active ? (danger ? '#DC2626' : '#fff') : 'hsl(var(--muted-foreground))',
      }}
    >
      <Text style={{ color: 'inherit' }}>{label}</Text>
    </View>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
      <Text className="text-base font-bold text-foreground" style={{ display: 'block' }}>{title}</Text>
      {hint && (
        <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 2, lineHeight: 1.5 }}>
          {hint}
        </Text>
      )}
      <View className="flex flex-row flex-wrap" style={{ gap: 10, marginTop: 12 }}>
        {children}
      </View>
    </View>
  )
}

export default function HealthProfilePage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [age_group, setAgeGroup] = useState<string | null>(null)
  const [gender, setGender] = useState<string | null>(null)
  const [allergies, setAllergies] = useState<string[]>([])
  const [body_states, setBodyStates] = useState<string[]>([])
  const [chronic_conditions, setChronic] = useState<string[]>([])
  const [health_goals, setGoals] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    if (!profile?.id) { setLoading(false); return }
    getUserHealthProfile(profile.id)
      .then((p: UserHealthProfile | null) => {
        if (!alive) return
        if (p) {
          setAgeGroup(p.age_group)
          setGender(p.gender)
          setAllergies(p.allergies ?? [])
          setBodyStates(p.body_states ?? [])
          setChronic(p.chronic_conditions ?? [])
          setGoals(p.health_goals ?? [])
        }
        setLoading(false)
      })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [profile?.id])

  const toggleArr = (setter: Dispatch<SetStateAction<string[]>>) => (val: string) =>
    setter((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]))

  const handleSave = async () => {
    if (!profile?.id) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    setSaving(true)
    const ok = await upsertUserHealthProfile({
      user_id: profile.id,
      age_group,
      gender,
      allergies,
      body_states,
      chronic_conditions,
      health_goals,
    })
    setSaving(false)
    if (ok) Taro.showToast({ title: '已保存', icon: 'success' })
    else Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
  }

  if (loading) {
    return (
      <View className="min-h-screen bg-[#FFFBF7] flex items-center justify-center">
        <Text className="text-base text-muted-foreground">加载中...</Text>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-[#FFFBF7] px-4 pt-5 pb-16">
      <Text className="text-xl font-bold text-foreground">📋 我的体质档案</Text>
      <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 4, lineHeight: 1.6 }}>
        填写后，扫配料/挑好物会按「您的身体」给出安不安全、适不适合的食养参考。
      </Text>

      <Section title="生命阶段">
        {AGE_GROUP_OPTIONS.map((o) => (
          <Chip key={o} label={o} active={age_group === o} onClick={() => setAgeGroup(age_group === o ? null : o)} />
        ))}
      </Section>

      <Section title="性别">
        {GENDER_OPTIONS.map((o) => (
          <Chip key={o} label={o} active={gender === o} onClick={() => setGender(gender === o ? null : o)} />
        ))}
      </Section>

      <Section title="过敏原" hint="您过敏的成分会触发强预警，扫到含相关成分的商品将提示谨慎">
        {ALLERGY_OPTIONS.map((o) => (
          <Chip
            key={o.key}
            label={o.name}
            danger={o.severity === 'high'}
            active={allergies.includes(o.key)}
            onClick={() => toggleArr(setAllergies)(o.key)}
          />
        ))}
      </Section>

      <Section title="身体状态" hint="近期身体感受，用于食养宜忌匹配">
        {BODY_STATE_OPTIONS.map((o) => (
          <Chip key={o} label={o} active={body_states.includes(o)} onClick={() => toggleArr(setBodyStates)(o)} />
        ))}
      </Section>

      <Section title="慢病 / 健康人群" hint="仅作食养参考，不替代医嘱">
        {CHRONIC_OPTIONS.map((o) => (
          <Chip key={o} label={o} active={chronic_conditions.includes(o)} onClick={() => toggleArr(setChronic)(o)} />
        ))}
      </Section>

      <Section title="健康目标">
        {HEALTH_GOAL_OPTIONS.map((o) => (
          <Chip key={o} label={o} active={health_goals.includes(o)} onClick={() => toggleArr(setGoals)(o)} />
        ))}
      </Section>

      <Button
        onClick={handleSave}
        loading={saving}
        className="mt-6 rounded-full"
        style={{ background: 'hsl(var(--primary))', color: '#fff', fontSize: 15 }}
      >
        保存体质档案
      </Button>

      <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 14, lineHeight: 1.7 }}>
        {FOOD_THERAPY_DISCLAIMER}
      </Text>
    </View>
  )
}
