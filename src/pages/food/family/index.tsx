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
import { CONSTITUTION_TYPES } from '@/utils/constitution-test'

// 复用内联样式常量（重复字面量提取，行为不变）
const S = {
  lh16: { lineHeight: 1.6 },
  bgSoft: { background: '#F6F2EE' },
  borderPlain: { borderWidth: 1, borderColor: '#ECE6DD' },
  cardPlain: { background: '#FFFFFF', borderWidth: 1, borderColor: '#ECE6DD' },
  primarySoft: { background: 'hsl(var(--primary-soft))' },
  primaryFill: { background: 'hsl(var(--primary))', color: '#fff' },
  softText: { background: '#F6F2EE', color: '#2A2A2A' },
} as const


const AVATAR_COLORS = ['hsl(var(--primary))', '#3B82F6', '#0369A1', '#8B5CF6', '#F59E0B', '#64748B']

// 体质选项（单选，驱动「为 TA 定制」食养参考）。首项是「暂不设置」。
const CONSTITUTION_NAMES = Object.values(CONSTITUTION_TYPES).map((c) => c.name)
const CONSTITUTION_PICKER = ['暂不设置', ...CONSTITUTION_NAMES]

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
 constitution_type: string
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
 constitution_type: '',
})

export default function FamilyArchivePage() {
 const { profile } = useAuth()
 const { familyMembers, refreshFamilyMembers } = useFoodTherapy()

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<MemberForm>(blankForm)
  const [saving, setSaving] = useState(false)
  const updateForm = (p: Partial<MemberForm>) => setForm((f) => ({ ...f, ...p }))

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
 constitution_type: m.constitution_type ?? '',
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
 constitution_type: form.constitution_type || null,
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
 confirmColor: 'hsl(var(--primary))',
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
 <View className="min-h-screen bg-[#F7F3E9] px-4 pt-5 pb-16">
 {/* 标题 */}
 <Text className="text-2xl font-bold text-[#2A2A2A]"> 家庭食养档案</Text>
 <Text className="text-xs text-[#6F675C] mt-1 block">一户一档 · 全家人的食养参考都留在这里</Text>

 {/* 迁移成本 banner：成员越多，换小程序损失越大（中性，不涉医疗宣称） */}
 {familyMembers.length > 0 ? (
 <View className="mt-4 rounded-2xl p-4" style={{ background: '#FBF1E8', borderWidth: 1, borderColor: '#E9D3BC' }}>
 <View className="flex items-center gap-2">
 <Text className="text-xl"></Text>
 <Text className="text-sm font-bold text-[hsl(var(--primary))]">
 已为 {familyMembers.length} 位家人建立专属食养档案
 </Text>
 </View>
 <Text className="text-xs text-[#8A6A4B] mt-1.5 block" style={S.lh16}>
 全家人的体质偏好、过敏史与饮食节奏都沉淀在此。换小程序这些数据将全部丢失，重新建立要花不少功夫。
 </Text>
 </View>
 ) : (
 <View className="mt-4 rounded-2xl p-4" style={S.cardPlain}>
 <Text className="text-sm font-bold text-[#2A2A2A]">为全家建立专属食养档案</Text>
 <Text className="text-xs text-[#6F675C] mt-1.5 block" style={S.lh16}>
 添加家人后，给谁买零食都能一键切换「为 TA 定制」的食养参考，避开过敏、顺着体质挑。
 </Text>
 </View>
 )}

 {/* 门店分享授权：线上工具引流 → 线下门店承接到店精准导购 */}
 <View className="mt-4 rounded-2xl p-4" style={S.cardPlain}>
 <View className="flex items-center justify-between">
 <View className="flex-1 pr-3">
 <Text className="text-sm font-bold text-[#2A2A2A]">向常去门店分享食养档案</Text>
 <Text className="text-[11px] text-muted-foreground mt-1 block" style={S.lh16}>
 开启后，你锁定的门店店员可在你到店时查看中性食养参考（体质 / 过敏原 / 慢病 / 目标），做精准导购。仅分享膳食参考维度，不含任何病历或诊断信息，可随时关闭。
 </Text>
 </View>
 <View
 onClick={handleToggleShare}
 className="w-12 h-7 rounded-full flex items-center px-0.5 flex-shrink-0"
 style={{
 background: shareToStore ? 'hsl(var(--primary))' : '#E5E0DA',
 justifyContent: shareToStore ? 'flex-end' : 'flex-start',
 opacity: toggling ? 0.6 : 1,
 }}
 >
 <View className="w-6 h-6 rounded-full bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }} />
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
 <View key={m.id} className="rounded-2xl bg-white p-4 shadow-sm" style={S.borderPlain}>
 <View className="flex items-center gap-3">
 <View
 className="w-11 h-11 rounded-full flex items-center justify-center"
 style={{ background: `${color}1a` }}
 >
 <Text className="text-lg font-bold" style={{ color }}>{m.name.slice(0, 1)}</Text>
 </View>
 <View className="flex-1 min-w-0">
 <View className="flex items-center gap-2">
 <Text className="text-base font-bold text-[#2A2A2A]">{m.name}</Text>
 {m.age_group ? (
 <Text className="text-[10px] text-[#8A6A4B] px-2 py-0.5 rounded-full" style={{ background: '#FBF1E8' }}>{m.age_group}</Text>
 ) : null}
 {m.constitution_type && CONSTITUTION_TYPES[m.constitution_type] ? (
 <Text className="text-[10px] text-[hsl(var(--primary))] px-2 py-0.5 rounded-full" style={S.primarySoft}>
 {CONSTITUTION_TYPES[m.constitution_type].emoji} {CONSTITUTION_TYPES[m.constitution_type].name}
 </Text>
 ) : null}
 {ac > 0 ? (
 <Text className="text-[10px] text-[hsl(var(--primary))] px-2 py-0.5 rounded-full" style={S.primarySoft}>过敏 {ac}</Text>
 ) : null}
 </View>
 {m.gender ? <Text className="text-xs text-muted-foreground">{m.gender}</Text> : null}
 </View>
 <View className="flex items-center gap-3">
 <Text className="text-xs text-[hsl(var(--primary))] font-semibold" onClick={() => openEdit(m)}>编辑</Text>
 <Text className="text-xs text-muted-foreground" onClick={() => handleDelete(m)}>移除</Text>
 </View>
 </View>

 {tags.length > 0 ? (
 <View className="mt-3 flex flex-wrap gap-1.5">
 {tags.map((t) => (
 <Text key={t} className="text-[11px] text-[#6F675C] px-2 py-0.5 rounded-full" style={S.bgSoft}>{t}</Text>
 ))}
 </View>
 ) : null}

 {m.notes ? (
 <Text className="text-xs text-muted-foreground mt-2 block" style={S.lh16}>备注：{m.notes}</Text>
 ) : null}
 </View>
 )
 })}
 </View>

 {/* 添加家人：常驻入口，点击展开 inline 表单（无浮层依赖） */}
 {!formOpen ? (
 <Button onClick={openAdd} className="mt-4 rounded-full" style={S.primaryFill}>
 ＋ 添加家人
 </Button>
 ) : (
 <View className="mt-4 rounded-2xl bg-white p-4 shadow-sm" style={S.borderPlain}>
 <Text className="text-base font-bold text-[#2A2A2A]">{form.id ? '编辑家人' : '添加家人'}</Text>

 {/* 称呼 */}
 <View className="mt-3">
 <Text className="text-xs text-[#6F675C]">称呼 *</Text>
 <Input
 className="mt-1 rounded-xl px-3 py-2 text-sm"
 style={S.softText}
 placeholder="如：爸爸 / 女儿 / 奶奶"
 value={form.name}
 onInput={(e) => updateForm({ name: e.detail.value })}
 />
 </View>

 {/* 生命阶段 + 性别 */}
 <View className="mt-3 flex gap-3">
 <View className="flex-1">
 <Text className="text-xs text-[#6F675C]">生命阶段</Text>
 <Picker
 mode="selector"
 range={AGE_GROUP_OPTIONS as unknown as string[]}
 onChange={(e) => updateForm({ age_group: AGE_GROUP_OPTIONS[e.detail.value as number] })}
 >
 <View className="mt-1 rounded-xl px-3 py-2" style={S.bgSoft}>
 <Text className="text-sm" style={{ color: form.age_group ? '#2A2A2A' : 'var(--muted-foreground)' }}>
 {form.age_group || '请选择'}
 </Text>
 </View>
 </Picker>
 </View>
 <View className="flex-1">
 <Text className="text-xs text-[#6F675C]">性别</Text>
 <Picker
 mode="selector"
 range={GENDER_OPTIONS as unknown as string[]}
 onChange={(e) => updateForm({ gender: GENDER_OPTIONS[e.detail.value as number] })}
 >
 <View className="mt-1 rounded-xl px-3 py-2" style={S.bgSoft}>
 <Text className="text-sm" style={{ color: form.gender ? '#2A2A2A' : 'var(--muted-foreground)' }}>
 {form.gender || '请选择'}
 </Text>
 </View>
 </Picker>
 </View>
 </View>

 {/* 体质（单选，驱动「为 TA 定制」食养参考） */}
 <View className="mt-3">
 <Text className="text-xs text-[#6F675C]">体质（单选 · 食养参考）</Text>
 <Picker
 mode="selector"
 range={CONSTITUTION_PICKER as unknown as string[]}
 onChange={(e) => {
 const idx = e.detail.value as number
 if (idx === 0) { updateForm({ constitution_type: '' }); return }
 const name = CONSTITUTION_PICKER[idx]
 const key = Object.keys(CONSTITUTION_TYPES).find((k) => CONSTITUTION_TYPES[k].name === name) ?? ''
 updateForm({ constitution_type: key })
 }}
 >
 <View className="mt-1 rounded-xl px-3 py-2" style={S.bgSoft}>
 <Text className="text-sm" style={{ color: form.constitution_type ? '#2A2A2A' : 'var(--muted-foreground)' }}>
 {form.constitution_type ? `${CONSTITUTION_TYPES[form.constitution_type]?.emoji ?? ''} ${CONSTITUTION_TYPES[form.constitution_type]?.name ?? ''}` : '暂不设置'}
 </Text>
 </View>
 </Picker>
 </View>

 {/* 身体状态（多选 chip） */}
 <View className="mt-3">
 <Text className="text-xs text-[#6F675C]">身体状态（可多选）</Text>
 <View className="mt-1.5 flex flex-wrap gap-2">
 {BODY_STATE_OPTIONS.map((o) => {
 const active = form.body_states.includes(o)
 return (
 <Text
 key={o}
 onClick={() => updateForm({ body_states: toggleInArray(form.body_states, o) })}
 className="text-xs px-3 py-1.5 rounded-full"
 style={{ background: active ? 'hsl(var(--primary))' : '#F6F2EE', color: active ? '#fff' : '#6F675C' }}
 >
 {o}
 </Text>
 )
 })}
 </View>
 </View>

 {/* 健康人群（多选 chip） */}
 <View className="mt-3">
 <Text className="text-xs text-[#6F675C]">健康人群（可多选 · 仅作食养参考）</Text>
 <View className="mt-1.5 flex flex-wrap gap-2">
 {CHRONIC_OPTIONS.map((o) => {
 const active = form.chronic_conditions.includes(o)
 return (
 <Text
 key={o}
 onClick={() => updateForm({ chronic_conditions: toggleInArray(form.chronic_conditions, o) })}
 className="text-xs px-3 py-1.5 rounded-full"
 style={{ background: active ? '#8A6B22' : '#F6F2EE', color: active ? '#fff' : '#6F675C' }}
 >
 {o}
 </Text>
 )
 })}
 </View>
 </View>

 {/* 致敏原（多选 chip，用 key） */}
 <View className="mt-3">
 <Text className="text-xs text-[#6F675C]">致敏原（可多选）</Text>
 <View className="mt-1.5 flex flex-wrap gap-2">
 {ALLERGY_OPTIONS.map((o) => {
 const active = form.allergies.includes(o.key)
 return (
 <Text
 key={o.key}
 onClick={() => updateForm({ allergies: toggleInArray(form.allergies, o.key) })}
 className="text-xs px-3 py-1.5 rounded-full"
 style={{ background: active ? 'hsl(var(--primary))' : '#F6F2EE', color: active ? '#fff' : '#6F675C' }}
 >
 {o.name}
 </Text>
 )
 })}
 </View>
 </View>

 {/* 健康目标（多选 chip） */}
 <View className="mt-3">
 <Text className="text-xs text-[#6F675C]">健康目标（可多选）</Text>
 <View className="mt-1.5 flex flex-wrap gap-2">
 {HEALTH_GOAL_OPTIONS.map((o) => {
 const active = form.health_goals.includes(o)
 return (
 <Text
 key={o}
 onClick={() => updateForm({ health_goals: toggleInArray(form.health_goals, o) })}
 className="text-xs px-3 py-1.5 rounded-full"
 style={{ background: active ? 'hsl(var(--primary))' : '#F6F2EE', color: active ? '#fff' : '#6F675C' }}
 >
 {o}
 </Text>
 )
 })}
 </View>
 </View>

 {/* 备注 */}
 <View className="mt-3">
 <Text className="text-xs text-[#6F675C]">备注（选填 · 中性食养偏好，非病历）</Text>
 <Input
 className="mt-1 rounded-xl px-3 py-2 text-sm"
 style={S.softText}
 placeholder="如：口味偏淡 / 喜欢温热"
 value={form.notes}
 onInput={(e) => updateForm({ notes: e.detail.value })}
 />
 </View>

 {/* 操作 */}
 <View className="mt-4 flex gap-3">
 <Button
 onClick={handleSave}
 loading={saving}
 className="flex-1 rounded-full"
 style={S.primaryFill}
 >
 {form.id ? '保存修改' : '保存家人'}
 </Button>
 <Button
 onClick={() => { setFormOpen(false); setForm(blankForm()) }}
 className="flex-1 rounded-full"
 style={{ background: '#fff', color: 'hsl(var(--primary))', borderWidth: 1, borderColor: '#ECE6DD' }}
 >
 取消
 </Button>
 </View>
 </View>
 )}

 {/* 免责声明 */}
 <View className="mt-5 rounded-2xl bg-[#FBF7EF] p-4" style={S.borderPlain}>
 <Text className="text-[11px] text-muted-foreground leading-relaxed block">{FOOD_THERAPY_DISCLAIMER}</Text>
 </View>
 </View>
 )
}
