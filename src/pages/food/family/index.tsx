// @title 家庭食养档案（战略支柱② · 一户一档）
// ------------------------------------------------------------
// 绑定家庭、拉高迁移成本：把全家（本人 + 家人）的体质 / 过敏史 / 饮食周期 /
// 过往购买食养方案沉淀到本平台。成员维度全部走中性食养参考话术，严禁医疗宣称。
// 合规护栏：文案仅「食养参考 / 偏好」，不出现「治疗 / 降血压 / 病症断言」字样。
// UX 约定：主操作（添加 / 编辑 / 删除）均 inline 常驻，不依赖浮层 / 弹窗。

import { useState, useEffect, useRef } from 'react'
import { View, Text, Button, Input, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuth } from '@/contexts/AuthContext'
import { useFoodTherapy } from '@/contexts/FoodTherapyContext'
import {
  upsertFamilyMember,
  deleteFamilyMember,
} from '@/db/family-api'
import { getUserHealthProfile, upsertUserHealthProfile } from '@/db/food-api'
import type { FamilyMember } from '@/db/types'
import {
  ALLERGY_OPTIONS,
  BODY_STATE_OPTIONS,
  CHRONIC_OPTIONS,
  HEALTH_GOAL_OPTIONS,
  AGE_GROUP_OPTIONS,
  GENDER_OPTIONS,
} from '@/utils/food-therapy/profile-map'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'

const AVATAR_COLORS = ['#9A3324', '#C8A45C', '#3B5B7A', '#7A8B5A', '#B5651D', '#5B4636']

interface MemberForm {
  id?: string
  name: string
  age_group: string
  gender: string
  body_states: string[]
  chronic_conditions: string[]
  allergies: string[]
  health_goals: string[]
  notes: string
}

const blankForm = (): MemberForm => ({
  name: '',
  age_group: '',
  gender: '',
  body_states: [],
  chronic_conditions: [],
  allergies: [],
  health_goals: [],
  notes: '',
})

export default function FamilyArchivePage() {
  const { profile } = useAuth()
  const { familyMembers, refreshFamilyMembers } = useFoodTherapy()

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<MemberForm>(blankForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // 进入页面即拉一次最新家庭成员（保证与商品页「为谁选购」同源）
    refreshFamilyMembers()
  }, [refreshFamilyMembers])

  // ── 门店分享授权（战略闭环：线上食养工具 → 线下门店精准导购）──
  const [shareToStore, setShareToStore] = useState(false)
  const [toggling, setToggling] = useState(false)
  const shareFlagsRef = useRef<Record<string, unknown>>({
    history_store: true,
    cross_store_aggregate: false,
  })

  useEffect(() => {
    if (!profile?.id) return
    getUserHealthProfile(profile.id).then((p) => {
      const flags = (p?.privacy_flags ?? null) as Record<string, unknown> | null
      if (flags) shareFlagsRef.current = flags
      setShareToStore(flags?.['share_food_profile_to_store'] === true)
    })
  }, [profile?.id])

  const handleToggleShare = async () => {
    if (!profile?.id || toggling) return
    setToggling(true)
    const next = !shareToStore
    try {
      // 读取当前画像，保留其余字段（upsert 会重置未传字段，避免清空体质/过敏数据）
      const base = await getUserHealthProfile(profile.id)
      const flags: Record<string, unknown> = {
        ...(base?.privacy_flags ?? shareFlagsRef.current),
        share_food_profile_to_store: next,
      }
      const res = await upsertUserHealthProfile({
        user_id: profile.id,
        age_group: base?.age_group ?? null,
        gender: base?.gender ?? null,
        constitution_type: base?.constitution_type ?? null,
        allergies: base?.allergies ?? [],
        chronic_conditions: base?.chronic_conditions ?? [],
        body_states: base?.body_states ?? [],
        health_goals: base?.health_goals ?? [],
        privacy_flags: flags,
      })
      if (!res) {
        Taro.showToast({ title: '设置失败，请重试', icon: 'none' })
        return
      }
      shareFlagsRef.current = flags
      setShareToStore(next)
      Taro.showToast({ title: next ? '已开启门店分享' : '已关闭门店分享', icon: 'success' })
    } catch (e) {
      console.error('[family] 门店分享设置失败', e)
      Taro.showToast({ title: '设置失败，请重试', icon: 'none' })
    } finally {
      setToggling(false)
    }
  }

  const toggleInArray = (arr: string[], v: string): string[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  const openAdd = () => {
    setForm(blankForm())
    setFormOpen(true)
  }

  const openEdit = (m: FamilyMember) => {
    setForm({
      id: m.id,
      name: m.name,
      age_group: m.age_group ?? '',
      gender: m.gender ?? '',
      body_states: m.body_states ?? [],
      chronic_conditions: m.chronic_conditions ?? [],
      allergies: m.allergies ?? [],
      health_goals: m.health_goals ?? [],
      notes: m.notes ?? '',
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!profile?.id) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (!form.name.trim()) {
      Taro.showToast({ title: '请填写家人称呼', icon: 'none' })
      return
    }
    setSaving(true)
    try {
      const res = await upsertFamilyMember({
        id: form.id,
        owner_id: profile.id,
        name: form.name.trim(),
        age_group: form.age_group || null,
        gender: form.gender || null,
        body_states: form.body_states,
        chronic_conditions: form.chronic_conditions,
        allergies: form.allergies,
        health_goals: form.health_goals,
        notes: form.notes || null,
        diet_cycle: null,
        avatar_color: AVATAR_COLORS[familyMembers.length % AVATAR_COLORS.length],
      })
      if (!res) {
        Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
        return
      }
      Taro.showToast({ title: form.id ? '已更新' : '已添加家人', icon: 'success' })
      setFormOpen(false)
      setForm(blankForm())
      refreshFamilyMembers()
    } catch (e) {
      console.error('[family] 保存失败', e)
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (m: FamilyMember) => {
    if (!profile?.id) return
    Taro.showModal({
      title: '移除家人',
      content: `确定移除「${m.name}」的食养档案吗？该档案下的记录将一并删除。`,
      confirmColor: '#9A3324',
      success: async (r) => {
        if (!r.confirm) return
        const ok = await deleteFamilyMember(m.id, profile.id)
        if (ok) {
          Taro.showToast({ title: '已移除', icon: 'success' })
          refreshFamilyMembers()
        } else {
          Taro.showToast({ title: '移除失败', icon: 'none' })
        }
      },
    })
  }

  const memberCrowdTags = (m: FamilyMember): string[] => [
    ...(m.body_states ?? []),
    ...(m.chronic_conditions ?? []),
  ]
  const allergenCount = (m: FamilyMember): number => (m.allergies ?? []).length

  return (
    <View className="min-h-screen bg-[#FFFBF7] px-4 pt-5 pb-16">
      {/* 标题 */}
      <Text className="text-2xl font-bold text-[#1A1A1A]">👨‍👩‍👧 家庭食养档案</Text>
      <Text className="text-xs text-[#6B7280] mt-1 block">一户一档 · 全家人的食养参考都留在这里</Text>

      {/* 迁移成本 banner：成员越多，换小程序损失越大（中性，不涉医疗宣称） */}
      {familyMembers.length > 0 ? (
        <View className="mt-4 rounded-2xl p-4" style={{ background: '#FBF1E8', borderWidth: 1, borderColor: '#E9D3BC' }}>
          <View className="flex items-center gap-2">
            <Text className="text-xl">🔒</Text>
            <Text className="text-sm font-bold text-[#9A3324]">
              已为 {familyMembers.length} 位家人建立专属食养档案
            </Text>
          </View>
          <Text className="text-xs text-[#8A6A4B] mt-1.5 block" style={{ lineHeight: 1.6 }}>
            全家人的体质偏好、过敏史与饮食节奏都沉淀在此。换小程序这些数据将全部丢失，重新建立要花不少功夫。
          </Text>
        </View>
      ) : (
        <View className="mt-4 rounded-2xl p-4" style={{ background: '#FFFFFF', borderWidth: 1, borderColor: '#EFE6DD' }}>
          <Text className="text-sm font-bold text-[#1A1A1A]">为全家建立专属食养档案</Text>
          <Text className="text-xs text-[#6B7280] mt-1.5 block" style={{ lineHeight: 1.6 }}>
            添加家人后，给谁买零食都能一键切换「为 TA 定制」的食养参考，避开过敏、顺着体质挑。
          </Text>
        </View>
      )}

      {/* 门店分享授权：线上工具引流 → 线下门店承接到店精准导购 */}
      <View className="mt-4 rounded-2xl p-4" style={{ background: '#FFFFFF', borderWidth: 1, borderColor: '#EFE6DD' }}>
        <View className="flex items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold text-[#1A1A1A]">向常去门店分享食养档案</Text>
            <Text className="text-[11px] text-[#9CA3AF] mt-1 block" style={{ lineHeight: 1.6 }}>
              开启后，你锁定的门店店员可在你到店时查看中性食养参考（体质 / 过敏原 / 健康关注 / 目标），做精准导购。仅分享膳食参考维度，不含任何病历或诊断信息，可随时关闭。
            </Text>
          </View>
          <View
            onClick={handleToggleShare}
            className="w-12 h-7 rounded-full flex items-center px-0.5 flex-shrink-0"
            style={{
              background: shareToStore ? '#9A3324' : '#E5E0DA',
              justifyContent: shareToStore ? 'flex-end' : 'flex-start',
              opacity: toggling ? 0.6 : 1,
            }}
          >
            <View className="w-6 h-6 rounded-full bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </View>
        </View>
      </View>

      {/* 成员列表 */}
      <View className="mt-4 flex flex-col gap-3">
        {familyMembers.map((m) => {
          const color = m.avatar_color || AVATAR_COLORS[0]
          const tags = memberCrowdTags(m)
          const ac = allergenCount(m)
          return (
            <View key={m.id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ borderWidth: 1, borderColor: '#EFE6DD' }}>
              <View className="flex items-center gap-3">
                <View
                  className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ background: `${color}1a` }}
                >
                  <Text className="text-lg font-bold" style={{ color }}>{m.name.slice(0, 1)}</Text>
                </View>
                <View className="flex-1 min-w-0">
                  <View className="flex items-center gap-2">
                    <Text className="text-base font-bold text-[#1A1A1A]">{m.name}</Text>
                    {m.age_group ? (
                      <Text className="text-[10px] text-[#8A6A4B] px-2 py-0.5 rounded-full" style={{ background: '#FBF1E8' }}>{m.age_group}</Text>
                    ) : null}
                    {ac > 0 ? (
                      <Text className="text-[10px] text-[#B45309] px-2 py-0.5 rounded-full" style={{ background: '#FEF3E2' }}>过敏 {ac}</Text>
                    ) : null}
                  </View>
                  {m.gender ? <Text className="text-xs text-[#9CA3AF]">{m.gender}</Text> : null}
                </View>
                <View className="flex items-center gap-3">
                  <Text className="text-xs text-[#9A3324] font-semibold" onClick={() => openEdit(m)}>编辑</Text>
                  <Text className="text-xs text-[#9CA3AF]" onClick={() => handleDelete(m)}>移除</Text>
                </View>
              </View>

              {tags.length > 0 ? (
                <View className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Text key={t} className="text-[11px] text-[#6B7280] px-2 py-0.5 rounded-full" style={{ background: '#F6F2EE' }}>{t}</Text>
                  ))}
                </View>
              ) : null}

              {m.notes ? (
                <Text className="text-xs text-[#9CA3AF] mt-2 block" style={{ lineHeight: 1.6 }}>备注：{m.notes}</Text>
              ) : null}
            </View>
          )
        })}
      </View>

      {/* 添加家人：常驻入口，点击展开 inline 表单（无浮层依赖） */}
      {!formOpen ? (
        <Button onClick={openAdd} className="mt-4 rounded-full" style={{ background: '#9A3324', color: '#fff' }}>
          ＋ 添加家人
        </Button>
      ) : (
        <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm" style={{ borderWidth: 1, borderColor: '#EFE6DD' }}>
          <Text className="text-base font-bold text-[#1A1A1A]">{form.id ? '编辑家人' : '添加家人'}</Text>

          {/* 称呼 */}
          <View className="mt-3">
            <Text className="text-xs text-[#6B7280]">称呼 *</Text>
            <Input
              className="mt-1 rounded-xl px-3 py-2 text-sm"
              style={{ background: '#F6F2EE', color: '#1A1A1A' }}
              placeholder="如：爸爸 / 女儿 / 奶奶"
              value={form.name}
              onInput={(e) => setForm({ ...form, name: e.detail.value })}
            />
          </View>

          {/* 生命阶段 + 性别 */}
          <View className="mt-3 flex gap-3">
            <View className="flex-1">
              <Text className="text-xs text-[#6B7280]">生命阶段</Text>
              <Picker
                mode="selector"
                range={AGE_GROUP_OPTIONS as unknown as string[]}
                onChange={(e) => setForm({ ...form, age_group: AGE_GROUP_OPTIONS[e.detail.value as number] })}
              >
                <View className="mt-1 rounded-xl px-3 py-2" style={{ background: '#F6F2EE' }}>
                  <Text className="text-sm" style={{ color: form.age_group ? '#1A1A1A' : '#9CA3AF' }}>
                    {form.age_group || '请选择'}
                  </Text>
                </View>
              </Picker>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-[#6B7280]">性别</Text>
              <Picker
                mode="selector"
                range={GENDER_OPTIONS as unknown as string[]}
                onChange={(e) => setForm({ ...form, gender: GENDER_OPTIONS[e.detail.value as number] })}
              >
                <View className="mt-1 rounded-xl px-3 py-2" style={{ background: '#F6F2EE' }}>
                  <Text className="text-sm" style={{ color: form.gender ? '#1A1A1A' : '#9CA3AF' }}>
                    {form.gender || '请选择'}
                  </Text>
                </View>
              </Picker>
            </View>
          </View>

          {/* 身体状态（多选 chip） */}
          <View className="mt-3">
            <Text className="text-xs text-[#6B7280]">身体状态（可多选）</Text>
            <View className="mt-1.5 flex flex-wrap gap-2">
              {BODY_STATE_OPTIONS.map((o) => {
                const active = form.body_states.includes(o)
                return (
                  <Text
                    key={o}
                    onClick={() => setForm({ ...form, body_states: toggleInArray(form.body_states, o) })}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: active ? '#9A3324' : '#F6F2EE', color: active ? '#fff' : '#6B7280' }}
                  >
                    {o}
                  </Text>
                )
              })}
            </View>
          </View>

          {/* 健康人群（多选 chip） */}
          <View className="mt-3">
            <Text className="text-xs text-[#6B7280]">健康人群（可多选 · 仅作食养参考）</Text>
            <View className="mt-1.5 flex flex-wrap gap-2">
              {CHRONIC_OPTIONS.map((o) => {
                const active = form.chronic_conditions.includes(o)
                return (
                  <Text
                    key={o}
                    onClick={() => setForm({ ...form, chronic_conditions: toggleInArray(form.chronic_conditions, o) })}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: active ? '#C8A45C' : '#F6F2EE', color: active ? '#fff' : '#6B7280' }}
                  >
                    {o}
                  </Text>
                )
              })}
            </View>
          </View>

          {/* 致敏原（多选 chip，用 key） */}
          <View className="mt-3">
            <Text className="text-xs text-[#6B7280]">致敏原（可多选）</Text>
            <View className="mt-1.5 flex flex-wrap gap-2">
              {ALLERGY_OPTIONS.map((o) => {
                const active = form.allergies.includes(o.key)
                return (
                  <Text
                    key={o.key}
                    onClick={() => setForm({ ...form, allergies: toggleInArray(form.allergies, o.key) })}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: active ? '#B45309' : '#F6F2EE', color: active ? '#fff' : '#6B7280' }}
                  >
                    {o.name}
                  </Text>
                )
              })}
            </View>
          </View>

          {/* 健康目标（多选 chip） */}
          <View className="mt-3">
            <Text className="text-xs text-[#6B7280]">健康目标（可多选）</Text>
            <View className="mt-1.5 flex flex-wrap gap-2">
              {HEALTH_GOAL_OPTIONS.map((o) => {
                const active = form.health_goals.includes(o)
                return (
                  <Text
                    key={o}
                    onClick={() => setForm({ ...form, health_goals: toggleInArray(form.health_goals, o) })}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: active ? '#3B5B7A' : '#F6F2EE', color: active ? '#fff' : '#6B7280' }}
                  >
                    {o}
                  </Text>
                )
              })}
            </View>
          </View>

          {/* 备注 */}
          <View className="mt-3">
            <Text className="text-xs text-[#6B7280]">备注（选填 · 中性食养偏好，非病历）</Text>
            <Input
              className="mt-1 rounded-xl px-3 py-2 text-sm"
              style={{ background: '#F6F2EE', color: '#1A1A1A' }}
              placeholder="如：口味偏淡 / 喜欢温热"
              value={form.notes}
              onInput={(e) => setForm({ ...form, notes: e.detail.value })}
            />
          </View>

          {/* 操作 */}
          <View className="mt-4 flex gap-3">
            <Button
              onClick={handleSave}
              loading={saving}
              className="flex-1 rounded-full"
              style={{ background: '#9A3324', color: '#fff' }}
            >
              {form.id ? '保存修改' : '保存家人'}
            </Button>
            <Button
              onClick={() => { setFormOpen(false); setForm(blankForm()) }}
              className="flex-1 rounded-full"
              style={{ background: '#fff', color: '#9A3324', borderWidth: 1, borderColor: '#EFE6DD' }}
            >
              取消
            </Button>
          </View>
        </View>
      )}

      {/* 免责声明 */}
      <View className="mt-5 rounded-2xl bg-[#FFFBF7] p-4" style={{ borderWidth: 1, borderColor: '#EFE6DD' }}>
        <Text className="text-[11px] text-[#9CA3AF] leading-relaxed block">{FOOD_THERAPY_DISCLAIMER}</Text>
      </View>
    </View>
  )
}
