// 商品编辑/新增弹窗（从 merchant-products 页抽出，纯展示；全部逻辑由 useProductForm 钩子提供）
// 布局 1:1 对齐网页版 admin-web/src/pages/merchant/Products.tsx：2 步上架向导 + 可折叠分区
import Taro from '@tarojs/taro'
import { View, Text, Input, Textarea, Switch, Image, ScrollView } from '@tarojs/components'
import { useState, useEffect, type ReactNode } from 'react'
import ProductGridCard from '@/components/ProductGridCard'
import Icon from '@/components/Icon'
import { EAN13Preview } from './BarcodeTools'
import { COOKING_METHODS, AUX_OPTIONS, NATURE_COLOR, type ProductFormController } from './useProductForm'
import { getProductCareInfo } from '@/utils/product-care'
import { HEALTH_TAGS, NATURE_SCALE } from '@/utils/food-therapy/types'
import { FIT_CROWD_OPTIONS } from '@/utils/food-therapy/product-therapy'
import { calcMargin } from './types'
import { FOOD_CATEGORIES } from '@/lib/food-engine/wordTables'
import type { Product, StoreCategory } from '@/db/types'

// 复用内联样式常量（原页面内重复字面量提取，行为不变）
const S = {
  fieldGap: { marginBottom: '14px' },
  labelStrong: { fontSize: '28rpx', color: '#333', fontWeight: '600', marginBottom: '6px' },
  labelStrongBlock: { fontSize: '26rpx', color: '#333', fontWeight: '600', marginBottom: '6px', display: 'block' },
  labelMedium: { fontSize: '26rpx', color: '#333', fontWeight: '600', marginBottom: '6px' },
  flex1: { flex: 1 },
  sectionLabel: { fontSize: '26rpx', color: '#333', fontWeight: '600', marginTop: '12px', marginBottom: '6px', display: 'block' },
  textareaBox: { width: '100%', minHeight: '50px', borderRadius: '10px', background: '#FBF7EF', border: '1.5px solid #EEE', fontSize: '28rpx', color: '#333', padding: '10px 14px', boxSizing: 'border-box' },
  hintSmall: { fontSize: '22rpx', color: '#AAA', marginTop: '4px' },
  fullFill: { width: '100%', height: '100%' },
  primaryLabel: { fontSize: '26rpx', color: 'hsl(var(--primary))', fontWeight: '700', marginBottom: '8px', display: 'block' },
  bigText56: { fontSize: '56rpx' },
  mutedSmallBlock: { fontSize: '22rpx', color: 'var(--muted-foreground)', display: 'block' },
  marginTop10: { marginTop: '10px' },
  text26: { fontSize: '26rpx', color: '#333' },
  warmCard: { marginBottom: '14px', padding: '12px', borderRadius: '12px', background: '#FBF7F2', border: '1.5px solid #E8D9C8' },
  whiteText26: { color: '#fff', fontSize: '26rpx', fontWeight: '600' },
  textareaBoxLg: { width: '100%', minHeight: '56px', borderRadius: '10px', background: '#FBF7EF', border: '1.5px solid #EEE', fontSize: '28rpx', color: '#333', padding: '10px 14px', boxSizing: 'border-box' },
} as const

// 商品上架向导（对齐网页版 FORM_STEPS）：把近 50 个字段收成 2 步，一次只面对一组，降低一眼复杂度
const FORM_STEPS: { key: number; label: string; hint: string }[] = [
  { key: 1, label: '基本信息', hint: '图片 / 名称 / 分类 / 价格库存' },
  { key: 2, label: '食养配置', hint: '原料成分 / 食疗系统 / 门店配套（可跳过）' },
]

// 可折叠分区（对齐网页版 Section 组件）：标题 + 副提示 + 展开箭头，把长表单收进分区
function Section({ title, hint, open, onToggle, children }: {
  title: string
  hint?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <View style={{ marginBottom: '14px' }}>
      <View
        onClick={onToggle}
        className="flex flex-row items-center justify-between"
        style={{ padding: '11px 14px', background: '#FBF7EF', border: '1px solid #EEE', borderRadius: '10px' }}>
        <View className="flex flex-row items-center flex-wrap">
          <Text style={{ fontSize: '28rpx', fontWeight: '600', color: '#333' }}>{title}</Text>
          {hint ? <Text style={{ fontSize: '22rpx', color: '#AAA', marginLeft: '8px' }}>{hint}</Text> : null}
        </View>
        <Text style={{ fontSize: '26rpx', color: '#999' }}>{open ? '▴' : '▾'}</Text>
      </View>
      {open && <View style={{ marginTop: '12px' }}>{children}</View>}
    </View>
  )
}

type ProductFormModalProps = {
  controller: ProductFormController
  categories: StoreCategory[]
  products: Product[]
  onManageCategory: () => void
}

export default function ProductFormModal({ controller, categories, products, onManageCategory }: ProductFormModalProps) {
  // 分类两级排序：一级在前，其二级子类紧跟其后（兼容未迁移：parent_id 全空时原序不变）
  const hasHierarchy = categories.some((c) => !!c.parent_id)
  const orderedCats = hasHierarchy
    ? categories
        .filter((c) => !c.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .flatMap((p) => [p, ...categories.filter((c) => c.parent_id === p.id).sort((a, b) => a.sort_order - b.sort_order)])
    : categories
  // 占比合计（C5：与网页后台一致的占比之和校验）
  const ratioTotal = controller.ingredientItems.reduce((s, it) => s + (Number(it.ratio) || 0), 0)
  // 分步 + 折叠分区（对齐网页版：默认展开 基础信息/价格与库存/食疗系统；媒体/分类/原料 收起）
  const [step, setStep] = useState(1)
  const [sections, setSections] = useState<Record<string, boolean>>({
    media: false, base: true, price: true, category: false, ingredients: false, therapy: true, manualTweak: false,
  })
  const toggleSection = (k: string) => setSections(s => ({ ...s, [k]: !s[k] }))
  // 每次打开弹窗重置回第 1 步
  useEffect(() => { if (controller.showForm) setStep(1) }, [controller.showForm])
  // 第 1 步必填项校验后再放行第 2 步（对齐网页版 goNext）
  const goNext = () => {
    if (step === 1 && (!controller.form.name || !controller.form.price || !controller.form.stock)) {
      Taro.showToast({ title: '请先填写商品名称、售价、库存', icon: 'none' })
      return
    }
    setStep(s => Math.min(FORM_STEPS.length, s + 1))
  }
  // 底部缺项提示（对齐网页版左侧 hint：缺什么直接说什么）
  const missingRequired = !controller.form.name || !controller.form.price || !controller.form.stock
  const missingHint = !controller.form.name
    ? '请填写商品名称'
    : !controller.form.price
      ? '请填写售价'
      : !controller.form.stock
        ? '请填写库存'
        : (FORM_STEPS[step - 1]?.hint ?? '')
  return (
    <>
 {controller.showForm && (
 <View className="flex flex-col" style={{
 position: 'fixed',
 top: 0, left: 0, right: 0, bottom: 0,
 zIndex: 9999,
 display: 'flex', flexDirection: 'column',
 background: 'rgba(0,0,0,0.55)',
}} catchMove>
 {/* 弹窗内容区 —— 不在背景上加 onClick，避免误触关闭；catchMove 防背景滚动 */}
 <View className="flex flex-col" style={{
marginTop: 'auto',
 width: '100%',
 background: '#FFF',
 borderTopLeftRadius: '24px',
 borderTopRightRadius: '24px',
 paddingHorizontal: '20px',
 paddingTop: '20px',
 maxHeight: '90vh',
 }}>
 {/* 标题栏 + 步骤指示（对齐网页版「第 X / 2 步」） */}
 <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
 <Text style={{ fontSize: '36rpx', fontWeight: 'bold', color: '#333' }}>
 {controller.editId ? ' 编辑商品' : ' 新增商品'}
 </Text>
 <Text style={{ fontSize: '24rpx', color: '#999' }}>第 {step} / {FORM_STEPS.length} 步</Text>
 <View
 onClick={controller.handleCloseForm}
 style={{
 width: '32px', height: '32px', borderRadius: '16px',
 background: '#FBF7EF',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 }}>
 <Icon name="close" size={18} />
 </View>
 </View>

 {/* 步骤条：一次只面对一组字段；已完成的步骤可点击回看（对齐网页版） */}
 <View className="flex flex-row items-center gap-2" style={{ marginBottom: '18px' }}>
 {FORM_STEPS.map((s, i) => {
 const active = step === s.key
 const done = step > s.key
 return (
 <View key={s.key} className="flex flex-row items-center gap-1.5">
 <View
 onClick={() => setStep(s.key)}
 className="flex flex-row items-center gap-1"
 style={{
 padding: '5px 12px', borderRadius: '9999px',
 background: active ? 'hsl(var(--primary))' : done ? '#E8F7EC' : '#F5F0EB',
 border: `1px solid ${active ? 'hsl(var(--primary))' : done ? '#BFE3C4' : '#EEE'}`,
 }}>
 <View style={{ width: '18px', height: '18px', borderRadius: '9px', background: active ? 'rgba(255,255,255,0.3)' : done ? '#15803D' : '#DDD', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <Text style={{ fontSize: '20rpx', color: active || done ? '#FFF' : '#999' }}>{done ? '✓' : s.key}</Text>
 </View>
 <Text style={{ fontSize: '24rpx', color: active ? '#FFF' : done ? '#15803D' : '#999', fontWeight: active ? '700' : '400' }}>{s.label}</Text>
 </View>
 {i < FORM_STEPS.length - 1 && <Text style={{ fontSize: '22rpx', color: '#BBB' }}>›</Text>}
 </View>
 )
 })}
 </View>

 {/* 可滚动内容区：ScrollView 自管手势，真机上不再被 catchMove 吞掉滚动；标题/步骤条固定在弹窗顶部 */}
 <ScrollView
   scrollY
   enhanced
   bounces
   showScrollbar
   style={{ flex: 1, minHeight: 0, maxHeight: '72vh' }}
   contentContainerStyle={{ paddingBottom: '24px' }}
 >

 {/* ===== 第 1 步：基本信息 ===== */}
 {step === 1 && (
 <View className="flex flex-col">

 <Section title="商品图片 / 视频" hint="主图 / 副图 / 视频 / 详情图" open={sections.media} onToggle={() => toggleSection('media')}>
      {/* 商品图片（统一图库：主图/副图/详情图合一，首图即封面） */}
      <View style={S.fieldGap}>
        <Text style={S.labelStrong}>商品图片（{controller.form.media.length}/20）</Text>
        <View className="flex flex-row flex-wrap gap-2">
          {controller.form.media.map((img, i) => (
            <View key={i} style={{ width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: i === 0 ? '2px solid hsl(var(--primary))' : '1px solid #EEE', position: 'relative' }}>
              <Image src={img} mode="aspectFill" style={S.fullFill} />
              {i === 0 && (
                <View style={{ position: 'absolute', left: 0, bottom: 0, background: 'hsl(var(--primary))', paddingVertical: 1, paddingHorizontal: 4 }}>
                  <Text style={{ color: '#FFF', fontSize: '18rpx' }}>封面</Text>
                </View>
              )}
              <View
                onClick={() => controller.handleRemoveMedia(i)}
                style={{ position: 'absolute', top: 0, right: 0, width: '18px', height: '18px', background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottomLeftRadius: '8px' }}>
                <Text style={{ color: '#FFF', fontSize: '22rpx' }}>×</Text>
              </View>
              {i !== 0 && (
                <View
                  onClick={() => controller.handleSetMain(i)}
                  style={{ position: 'absolute', bottom: 0, right: 0, background: 'rgba(0,0,0,0.55)', paddingVertical: 1, paddingHorizontal: 3 }}>
                  <Text style={{ color: '#FFF', fontSize: '18rpx' }}>设封面</Text>
                </View>
              )}
            </View>
          ))}
          {controller.form.media.length < 20 && (
            <View
              onClick={controller.handleChooseMedia}
              style={{ width: '64px', height: '64px', borderRadius: '8px', background: '#F5F0EB', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #DDD' }}>
              <Text style={{ fontSize: '40rpx', color: '#BBB' }}>+</Text>
            </View>
          )}
        </View>
        <Text style={S.hintSmall}>第一张自动作为商品主图，其余图片会在详情页依次展示（最多 20 张，支持一次选多张）</Text>
      </View>

      {/* 商品视频 */}
 <View style={S.fieldGap}>
 <Text style={S.labelStrong}> 商品视频（可选）</Text>
 <View className="flex flex-row items-center gap-3">
 <View
 onClick={controller.handleChooseVideo}
 style={{
 width: '120px', height: '80px', borderRadius: '12px',
 background: '#F5F0EB',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 overflow: 'hidden', border: '2px dashed #DDD',
 }}>
 {controller.form.video_url
 ? <View style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
 <Text style={{ fontSize: '64rpx', color: '#FFF' }}></Text>
 </View>
 : <View style={{ textAlign: 'center' }}>
 <Text style={S.bigText56}></Text>
 <Text style={{ fontSize: '22rpx', color: 'var(--muted-foreground)', display: 'block', marginTop: '4px' }}>上传视频</Text>
 </View>}
 </View>
 <View style={S.flex1}>
 <Text style={{ fontSize: '24rpx', color: '#AAA', display: 'block', marginBottom: '4px' }}>点击上传商品展示视频</Text>
 <Text style={S.mutedSmallBlock}>支持 MP4/MOV 格式</Text>
 <Text style={S.mutedSmallBlock}>最长 60 秒，最大 200MB</Text>
 {controller.form.video_url && (
 <View
 onClick={() => controller.setForm(f => ({ ...f, video_url: '' }))}
 style={{
 marginTop: '8px',
 padding: '4px 12px',
 borderRadius: '6px',
 background: '#FEE2E2',
 display: 'inline-block',
 }}>
 <Text style={{ fontSize: '24rpx', color: '#DC2626' }}>删除视频</Text>
 </View>
 )}
 </View>
 </View>
 </View>
 </Section>

 <Section title="基础信息" hint="名称 / 描述 / 类型" open={sections.base} onToggle={() => toggleSection('base')}>
 {/* 商品名称 */}
 <View style={S.fieldGap}>
 <Text style={S.labelStrong}>商品名称 *</Text>
 <Input
 style={{
 width: '100%', height: '44px',
 borderRadius: '10px',
 background: '#FBF7EF',
 border: '1.5px solid #EEE',
 fontSize: '30rpx', color: '#333',
 padding: '0 14px',
 boxSizing: 'border-box',
 }}
 placeholder="请输入商品名称"
 placeholderStyle="color:#BBB;font-size:14px"
 value={controller.form.name}
 onInput={(e: any) => controller.setForm(f => ({ ...f, name: e.detail?.value ?? '' }))} />
 </View>

 {/* 商品描述（商家寄语，对齐网页版「商品描述」字段） */}
 <View style={{ marginBottom: '14px', padding: '12px', borderRadius: '12px', background: '#FFFAF5', border: '1px solid hsl(var(--primary-soft))', borderLeftWidth: '4px', borderLeftColor: 'hsl(var(--primary))' }}>
 <Text style={{ fontSize: '28rpx', color: '#333', fontWeight: '700', marginBottom: '6px' }}> 商品描述（分享文案，80 字以内）</Text>
 <Textarea
 style={{
 width: '100%', minHeight: '80px',
 borderRadius: '10px',
 background: '#FFF', border: '1.5px solid #EEE',
 fontSize: '28rpx', color: '#333',
 padding: '10px 14px', boxSizing: 'border-box',
 }}
 placeholder="例：手工羊肉烩面——羊骨高汤慢熬，宽面筋道，配海带、豆腐丝、青菜、粉条，暖身适口。"
 placeholderStyle="color:#BBB;font-size:13px"
 maxlength={80}
 value={controller.form.description}
 onInput={(e: any) => controller.setForm(f => ({ ...f, description: e.detail?.value ?? '' }))} />
 <Text style={{ fontSize: '22rpx', color: 'var(--muted-foreground)', marginTop: '4px', display: 'block' }}>这段话会以「商家寄语」卡片醒目展示在商品详情页，建议写出商品最大卖点和风味，{controller.form.description?.length ?? 0}/80</Text>
 </View>

 {/* 商品类型（迁移 20260803）：食养食品 / 药膳手串礼品 / 手作 / 护理 —— 决定详情页渲染哪套模块 */}
 <View style={S.fieldGap}>
 <Text style={S.labelStrong}>商品类型</Text>
 <View className="flex flex-row flex-wrap gap-2">
 {[
 { k: 'food', label: '食养食品' },
 { k: 'gift', label: '药膳手串礼品' },
 { k: 'craft', label: '手作' },
 { k: 'care', label: '护理' },
 ].map((opt) => {
 const sel = (controller.form.product_kind || 'food') === opt.k
 return (
 <View
 key={opt.k}
 onClick={() => controller.setForm(f => ({ ...f, product_kind: opt.k }))}
 style={{
 padding: '7px 14px', borderRadius: '9999px',
 background: sel ? 'hsl(var(--primary))' : '#FFF',
 border: sel ? '1px solid hsl(var(--primary))' : '1px solid #EEE',
 }}>
 <Text style={{ fontSize: '26rpx', color: sel ? '#FFF' : '#666' }}>{opt.label}</Text>
 </View>
 )
 })}
 </View>
 <Text style={S.hintSmall}>
 {controller.form.product_kind === 'gift'
 ? '礼品详情页走「寓意 / 材质 / 场景 / 保养」专属模块，不与食养共用描述'
 : controller.form.product_kind && controller.form.product_kind !== 'food'
 ? '该类型走礼品化详情模块，不展示食疗 / 配料安全'
 : '食养食品走食疗 / 配料安全模块'}
 </Text>
 </View>

 {/* 礼品专属字段（药膳手串 / 手作 / 护理）：与食养模块互斥，仅当类型≠食养食品时展示 */}
 {controller.form.product_kind !== 'food' && (
 <View style={{ marginBottom: '16px', padding: '12px', borderRadius: '12px', background: '#FBF7EF', border: '1px solid #F0D9A8' }}>
 <Text style={{ fontSize: '28rpx', color: '#8A6B22', fontWeight: '700', marginBottom: '8px', display: 'block' }}> 礼品详情（与食养模块互斥）</Text>

 <Text style={S.labelStrongBlock}>寓意文化（灵魂文案）</Text>
 <Textarea
 style={{ width: '100%', minHeight: '58px', borderRadius: '10px', background: '#FBF7EF', border: '1.5px solid #EEE', fontSize: '28rpx', color: '#333', padding: '10px 14px', boxSizing: 'border-box' }}
 placeholder="如：合欢解郁、艾草驱秽——串起一腕清欢"
 placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
 value={controller.form.gift_meaning}
 onInput={(e: any) => controller.setForm(f => ({ ...f, gift_meaning: e.detail?.value ?? '' }))} />

 <Text style={S.sectionLabel}>材质 / 草本成分（逗号分隔，绝不填食用食材）</Text>
 <Textarea
 style={S.textareaBox}
 placeholder="如：檀香、艾草、合欢皮、925银饰"
 placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
 value={(controller.form.materials || []).join('、')}
 onInput={(e: any) => controller.setForm(f => ({ ...f, materials: (e.detail?.value ?? '').split(/[、，,\s]+/).filter(Boolean) }))} />

 <Text style={S.sectionLabel}>材质工艺说明</Text>
 <Textarea
 style={S.textareaBox}
 placeholder="如：天然草木+925银饰，古法编绳，单串手作约40分钟"
 placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
 value={controller.form.gift_craft}
 onInput={(e: any) => controller.setForm(f => ({ ...f, gift_craft: e.detail?.value ?? '' }))} />

 <Text style={S.sectionLabel}>送礼场景（每行一个）</Text>
 <Textarea
 style={S.textareaBox}
 placeholder={'如：送给总熬夜的她\n乔迁新居\n长辈安康'}
 placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
 value={controller.form.gift_scene}
 onInput={(e: any) => controller.setForm(f => ({ ...f, gift_scene: e.detail?.value ?? '' }))} />

 <Text style={S.sectionLabel}>保养与使用注意</Text>
 <Textarea
 style={S.textareaBox}
 placeholder="如：天然草木，佩戴前后以软布轻拭；孕妇及敏感体质请遵医嘱使用"
 placeholderStyle="color:#BBB;font-size:13px" maxlength={200}
 value={controller.form.gift_care}
 onInput={(e: any) => controller.setForm(f => ({ ...f, gift_care: e.detail?.value ?? '' }))} />
 <Text style={{ fontSize: '22rpx', color: 'var(--muted-foreground)', marginTop: '6px', display: 'block' }}>详情页将强制展示"本品为工艺礼品，非药品"免责；请勿填写疗效 / 辟邪等违规词</Text>
 </View>
 )}
 </Section>

 <Section title="价格与库存" hint="售价 / 成本价 / 库存 / 上架" open={sections.price} onToggle={() => toggleSection('price')}>
 {/* 价格行：售价 / 原价（对齐网页版两列布局） */}
 <View className="flex flex-row gap-2.5" style={{ marginBottom: '12px' }}>
 <View style={S.flex1}>
 <Text style={S.labelMedium}>售价 *</Text>
 <Input
 style={{
 width: '100%', height: '42px', borderRadius: '10px',
 background: '#FBF7EF', border: '1.5px solid #EEE',
 fontSize: '28rpx', color: '#333', padding: '0 10px', boxSizing: 'border-box',
 }}
 placeholder="0.00" type="digit"
 value={controller.form.price}
 onInput={(e: any) => controller.setForm(f => ({ ...f, price: e.detail?.value ?? '' }))} />
 </View>
 <View style={S.flex1}>
 <Text style={S.labelMedium}>原价（划线价）</Text>
 <Input
 style={{
 width: '100%', height: '42px', borderRadius: '10px',
 background: '#FBF7EF', border: '1.5px solid #EEE',
 fontSize: '28rpx', color: '#333', padding: '0 10px', boxSizing: 'border-box',
 }}
 placeholder="划线价" type="digit"
 value={controller.form.original_price}
 onInput={(e: any) => controller.setForm(f => ({ ...f, original_price: e.detail?.value ?? '' }))} />
 </View>
 </View>
 {/* 成本价 / 库存（对齐网页版两列布局） */}
 <View className="flex flex-row gap-2.5" style={{ marginBottom: '14px' }}>
 <View style={S.flex1}>
 <Text style={S.labelMedium}>成本价 *</Text>
 <Input
 style={{
 width: '100%', height: '42px', borderRadius: '10px',
 background: '#FBF7EF', border: '1.5px solid #EEE',
 fontSize: '28rpx', color: '#333', padding: '0 10px', boxSizing: 'border-box',
 }}
 placeholder="0.00" type="digit"
 value={controller.form.cost_price}
 onInput={(e: any) => controller.setForm(f => ({ ...f, cost_price: e.detail?.value ?? '' }))} />
 <Text style={S.hintSmall}>用于计算毛利率</Text>
 </View>
 <View style={S.flex1}>
 <Text style={S.labelMedium}>库存 *</Text>
 <Input
 style={{
 width: '100%', height: '42px', borderRadius: '10px',
 background: '#FBF7EF', border: '1.5px solid #EEE',
 fontSize: '28rpx', color: '#333', padding: '0 10px', boxSizing: 'border-box',
 }}
 placeholder="0" type="number"
 value={controller.form.stock}
 onInput={(e: any) => controller.setForm(f => ({ ...f, stock: e.detail?.value ?? '' }))} />
 </View>
 </View>

 {/* 上架开关（对齐网页版「立即上架」P0-4） */}
 <View style={{
 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
 marginBottom: '14px',
 padding: '12px 14px', borderRadius: '12px', background: '#FBF7EF',
 }}>
 <View style={{ flex: 1 }}>
 <Text style={{ fontSize: '28rpx', color: '#333', fontWeight: '600' }}>立即上架</Text>
 <Text style={{ fontSize: '22rpx', color: '#AAA', marginTop: '2px', display: 'block' }}>开启后保存即对外可见；关闭则保存为下架</Text>
 </View>
 <Switch
 checked={controller.form.is_active}
 onChange={(v: any) => controller.setForm(f => ({ ...f, is_active: v.detail.value }))}
 color="hsl(var(--primary))" />
 </View>

 {/* 条形码 / 店内码标签（EAN-13 超市同款，对齐网页版：无条件展示，不限商品类型） */}
 <View style={S.warmCard}>
 <Text style={S.primaryLabel}> 商品条码（EAN-13 店内码）</Text>
 <Input
 style={{
 width: '100%', height: '42px', borderRadius: '10px',
 background: '#FBF7EF', border: '1.5px solid #EEE',
 fontSize: '28rpx', color: '#333', padding: '0 10px', boxSizing: 'border-box',
 }}
 placeholder="13 位 EAN-13，可留空一键生成"
 value={controller.form.barcode}
 onInput={(e: any) => controller.setForm(f => ({ ...f, barcode: e.detail?.value ?? '' }))} />
 {/* 条码操作：生成 / 预览 / 打印 */}
 <View className="flex flex-col gap-2" style={{ marginTop: '8px' }}>
 <View className="flex flex-row flex-wrap gap-2">
 {!controller.form.barcode ? (
 <View
 onClick={controller.onGenerateBarcode}
 style={{ padding: '8px 14px', borderRadius: '10px', background: controller.generatingBarcode ? '#6F675C' : '#15803D', opacity: controller.generatingBarcode ? 0.7 : 1 }}>
 <Text style={S.whiteText26}>{controller.generatingBarcode ? '生成中…' : '⚡ 一键生成店内码'}</Text>
 </View>
 ) : null}
 {controller.form.barcode ? (
 <View
 onClick={controller.onPrintBarcode}
 style={{ padding: '8px 14px', borderRadius: '10px', background: controller.printingBarcode ? '#6F675C' : '#FF8C42', opacity: controller.printingBarcode ? 0.7 : 1 }}>
 <Text style={S.whiteText26}>{controller.printingBarcode ? '打印中…' : '🖨 打印标签'}</Text>
 </View>
 ) : null}
 </View>
 {controller.form.barcode ? (
 <EAN13Preview code={controller.form.barcode} />
 ) : (
 <Text style={{ fontSize: '24rpx', color: 'var(--muted-foreground)' }}>无条码：点击「⚡ 一键生成店内码」即可自动分配 EAN-13 店内码（新建商品保存后也会自动分配），分配后即可「🖨 打印标签」。</Text>
 )}
 </View>
 </View>

 {/* 让利% — 与自营门店 API discount_rate 对齐 */}
 <View style={S.fieldGap}>
 <Text style={S.labelMedium}> 商品让利 %</Text>
 <Input
 style={{
 width: '100%', height: '42px', borderRadius: '10px',
 background: '#FBF7EF', border: '1.5px solid #E0E0E0',
 fontSize: '28rpx', color: '#B45309', padding: '0 10px', boxSizing: 'border-box',
 }}
 placeholder="如: 15 表示让利15%（最高30%）"
 placeholderStyle={{ color: 'var(--muted-foreground)' }}
 type="digit"
 value={controller.form.discount_rate}
 onInput={(e: any) => controller.setForm(f => ({ ...f, discount_rate: e.detail?.value ?? '' }))}
 onBlur={() => {
 const v = parseFloat(controller.form.discount_rate)
 if (!isNaN(v) && v > 30) {
 controller.setForm(f => ({ ...f, discount_rate: '30' }))
 Taro.showToast({ title: '让利最高30%', icon: 'none' })
 }
 }} />
 <Text style={S.hintSmall}>让利比例最高 30%，超出将自动校正为 30%</Text>
 </View>

 {/* 毛利率 / 让利提示（对齐网页版实时利润预览） */}
 {(controller.form.cost_price || controller.form.discount_rate) && controller.form.price && (
 <View style={{
 marginBottom: '14px', padding: '8px 12px', borderRadius: '10px',
 background: '#FBF7EF', border: '1px dashed #E0E0E0',
 }}>
 <Text style={{ fontSize: '26rpx', color: '#B45309' }}>
 {controller.form.cost_price && `毛利率：${calcMargin(parseFloat(controller.form.price) || 0, parseFloat(controller.form.cost_price) || 0)}`}
 {controller.form.original_price && controller.form.cost_price && ` · `}
 {controller.form.original_price && !controller.form.cost_price && ''}
 {controller.form.original_price && `让利 ¥${(parseFloat(controller.form.original_price) - parseFloat(controller.form.price)).toFixed(2)}`}
 {controller.form.discount_rate && (controller.form.cost_price || controller.form.original_price ? ' · ' : '')}
 {controller.form.discount_rate && `让利 ${controller.form.discount_rate}%`}
 </Text>
 </View>
 )}
 </Section>

 <Section title="商品分类" hint="预设 / 自定义" open={sections.category} onToggle={() => toggleSection('category')}>
 {/* 食疗导购分类（food_categories 参考表驱动；表为空时回退硬编码常量）——对齐网页版「商品分类」预设 */}
 <View style={S.fieldGap}>
 <Text style={S.labelStrongBlock}>食疗导购分类</Text>
 <View className="flex flex-row flex-wrap gap-2">
 <View
 onClick={() => controller.setForm(f => ({ ...f, food_category: '' }))}
 style={{
 padding: '7px 14px', borderRadius: '9999px',
 background: controller.form.food_category === '' ? 'hsl(var(--primary))' : '#FFF',
 border: controller.form.food_category === '' ? '1px solid hsl(var(--primary))' : '1px solid #EEE',
 }}>
 <Text style={{ fontSize: '26rpx', color: controller.form.food_category === '' ? '#FFF' : '#666' }}>未分类</Text>
 </View>
 {(controller.foodCategories.length ? controller.foodCategories : FOOD_CATEGORIES).map((c: any) => {
 const name = typeof c === 'string' ? c : c.name
 const sel = controller.form.food_category === name
 return (
 <View
 key={name}
 onClick={() => controller.setForm(f => ({ ...f, food_category: name }))}
 style={{
 padding: '7px 14px', borderRadius: '9999px',
 background: sel ? 'hsl(var(--primary))' : '#FFF',
 border: sel ? '1px solid hsl(var(--primary))' : '1px solid #EEE',
 }}>
 <Text style={{ fontSize: '26rpx', color: sel ? '#FFF' : '#666' }}>{name}</Text>
 </View>
 )
 })}
 </View>
 <Text style={S.hintSmall}>粉面 / 炖汤 / 热饮 / 小菜…，驱动食疗导购分类筛选（后台可扩展，无需发版）</Text>
 </View>

 {/* 商品分类（store_categories：本店 + 平台全局）——对齐网页版「商品分类（自定义）」 */}
 <View style={S.fieldGap}>
 <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
 <Text style={{ fontSize: '28rpx', color: '#333', fontWeight: '600' }}>商品分类（自定义）</Text>
 <View onClick={() => onManageCategory()} style={{ padding: '3px 12px', borderRadius: '9999px', background: '#FBF7EF' }}>
 <Text style={{ fontSize: '26rpx', color: 'hsl(var(--primary))' }}>管理分类</Text>
 </View>
 </View>
 <View className="flex flex-row flex-wrap gap-2">
 <View
 onClick={() => controller.setForm(f => ({ ...f, category_id: '', sub_category_id: '' }))}
 style={{
 padding: '7px 14px', borderRadius: '9999px',
 background: (controller.form.sub_category_id || controller.form.category_id) === '' ? 'hsl(var(--primary))' : '#FFF',
 border: (controller.form.sub_category_id || controller.form.category_id) === '' ? '1px solid hsl(var(--primary))' : '1px solid #EEE',
 }}>
 <Text style={{ fontSize: '26rpx', color: (controller.form.sub_category_id || controller.form.category_id) === '' ? '#FFF' : '#666' }}>未分类</Text>
 </View>
 {orderedCats.map((c: StoreCategory) => {
 const sel = (controller.form.sub_category_id || controller.form.category_id) === c.id
 return (
 <View
 key={c.id}
 onClick={() => controller.setForm(f => c.parent_id
   ? { ...f, category_id: c.parent_id as string, sub_category_id: c.id }
   : { ...f, category_id: c.id, sub_category_id: '' })}
 className="flex flex-row items-center gap-1"
style={{
padding: '7px 14px', borderRadius: '9999px',
background: sel ? 'hsl(var(--primary))' : '#FFF',
 border: sel ? '1px solid hsl(var(--primary))' : '1px solid #EEE',
 }}>
 <Text style={{ fontSize: c.parent_id ? '24rpx' : '26rpx', color: sel ? '#FFF' : (c.parent_id ? '#888' : '#666') }}>{c.parent_id ? `└ ${c.name}` : c.name}</Text>
 {c.scope === 'global' && <Icon name="globe" size={12} className={sel ? 'text-white' : ''} style={{ marginLeft: 2 }} />}
 </View>
 )
 })}
 {categories.length === 0 && (
 <Text style={{ fontSize: '24rpx', color: '#BBB' }}>暂无分类，点「管理分类」新建</Text>
 )}
 </View>
 </View>
 </Section>
 </View>
 )}

 {/* ===== 第 2 步：食养配置 ===== */}
 {step === 2 && (
 <View className="flex flex-col">

 <Section title="原料成分" hint="可选 · 自动识别" open={sections.ingredients} onToggle={() => toggleSection('ingredients')}>
 {/* 原料成分分析 */}
 <View style={S.fieldGap}>
 <Text style={S.labelStrong}> 原料成分分析（可选）</Text>
 <Text style={{ fontSize: '22rpx', color: '#AAA', marginBottom: '8px', display: 'block' }}>① 填商品名称点「自动识别原料」自动带出，或直接输入原料名搜索添加 → 功效/人群/场景展示在商品详情页</Text>
 <View
 onClick={controller.handleIdentifyIngredients}
 style={{
 display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 14px',
 borderRadius: '12px', background: '#FFF', border: '2px solid #34A853',
 }}>
 <Text style={{ color: '#34A853', fontSize: '26rpx', fontWeight: 'bold' }}>⚡ 自动识别原料</Text>
 </View>

 {/* 输入原料名快速添加 */}
 <View style={S.marginTop10}>
 <Input
 value={controller.ingredientQuery}
 onInput={(e: any) => {
 const v = e.detail.value
 controller.setIngredientQuery(v)
 controller.setIngredientResults(controller.ingredientDict.filter(r => r.name.includes(v.trim())).map(r => r.name))
 }}
 placeholder='或直接输入原料名（如：姜、梨、番茄）快速添加'
 style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '26rpx', background: '#FFF' }} />
 {controller.ingredientResults.length > 0 && (
 <View className="flex flex-row flex-wrap gap-1.5" style={{ marginTop: '8px' }}>
 {controller.ingredientResults.map(name => {
 const row = controller.ingredientDict.find(r => r.name === name)
 if (!row) return null
 const selected = controller.ingredientItems.some(i => i.id === row.id)
 return (
 <View
 key={row.id}
 onClick={() => { if (!selected) controller.setIngredientItems(prev => [...prev, controller.dictRowToItem(row)]); controller.setIngredientQuery(''); controller.setIngredientResults([]) }}
 style={{ padding: '4px 10px', borderRadius: '14px', border: `1px solid ${selected ? '#34A853' : '#ECE6DD'}`, background: selected ? '#E8F7EC' : '#FFF' }}>
 <Text style={{ fontSize: '26rpx', color: selected ? '#34A853' : '#3F3A34' }}>{name}</Text>
 </View>
 )
 })}
 </View>
 )}
 </View>

 {!controller.form.name?.trim() && (
 <Text style={{ fontSize: '22rpx', color: '#E08A00', marginTop: '6px', display: 'block' }}> 提示：先填写商品名称，识别更准确</Text>
 )}

 {controller.ingredientItems.length > 0 && (
 <View style={S.marginTop10}>
 {controller.ingredientItems.map((it) => (
 <View key={it.id} style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '12px', background: '#F6FBF7', border: '1px solid #F0DAD2' }}>
 <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <View className="flex flex-row items-center gap-1.5">
          <Text style={{ fontSize: '30rpx', fontWeight: 'bold', color: '#2A2A2A' }}>{it.name}</Text>
          {it.id.startsWith('free:') ? (
            <Text style={{ fontSize: '20rpx', color: '#fff', background: '#3B82F6', padding: '1px 8px', borderRadius: '10px' }}>自定义</Text>
          ) : (
            <Text style={{ fontSize: '22rpx', color: '#fff', background: '#34A853', padding: '1px 8px', borderRadius: '10px' }}>{it.nature}</Text>
          )}
        </View>
 <View onClick={() => controller.setIngredientItems(prev => prev.filter(x => x.id !== it.id))} style={{ padding: '2px 8px' }}>
 <Text style={{ fontSize: '26rpx', color: '#EF4444' }}>✕ 移除</Text>
 </View>
 </View>
 {/* 占比 */}
 <View className="flex flex-row items-center gap-2" style={{ marginTop: '8px' }}>
 <Text style={{ fontSize: '24rpx', color: '#4A443D' }}>占比</Text>
 <Input
 value={String(it.ratio)}
 type="number"
 onInput={(e: any) => { const v = Math.max(0, Math.min(100, Number(e.detail.value) || 0)); controller.setIngredientItems(prev => prev.map(x => x.id === it.id ? { ...x, ratio: v } : x)) }}
 style={{ width: '64px', height: '30px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '26rpx', padding: '0 8px', background: '#FFF' }} />
 <Text style={{ fontSize: '22rpx', color: 'var(--muted-foreground)' }}>%（越高过敏提醒越强）</Text>
 </View>
 {/* 烹饪方式 */}
 <View className="flex flex-row flex-wrap gap-1.5" style={{ marginTop: '8px' }}>
 {COOKING_METHODS.map(m => {
 const sel = it.cooking === m
 return (
 <View key={m} onClick={() => controller.setIngredientItems(prev => prev.map(x => x.id === it.id ? { ...x, cooking: m } : x))}
 style={{ padding: '3px 10px', borderRadius: '9999px', background: sel ? '#34A853' : '#FFF', border: `1px solid ${sel ? '#34A853' : '#ECE6DD'}` }}>
 <Text style={{ fontSize: '24rpx', color: sel ? '#FFF' : '#3F3A34' }}>{m}</Text>
 </View>
 )
 })}
 </View>
 {/* 辅料 */}
 <View className="flex flex-row flex-wrap gap-1.5" style={{ marginTop: '6px' }}>
 {AUX_OPTIONS.map(a => {
 const sel = it.aux.includes(a)
 return (
 <View key={a} onClick={() => controller.setIngredientItems(prev => prev.map(x => x.id === it.id ? { ...x, aux: sel ? x.aux.filter(y => y !== a) : [...x.aux, a] } : x))}
 style={{ padding: '3px 10px', borderRadius: '9999px', background: sel ? '#FDE68A' : '#FFF', border: '1px solid #E5C07B' }}>
 <Text style={{ fontSize: '24rpx', color: sel ? 'hsl(var(--primary))' : '#3F3A34' }}>{a}</Text>
 </View>
 )
 })}
 </View>
 </View>
 ))}
 </View>
 )}
 {/* 占比合计条：食材占比之和，超 100% 提示（与网页后台一致） */}
 {controller.ingredientItems.length > 0 && (
 <View style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '10px', background: ratioTotal > 100 ? '#FDECEC' : '#F6FBF7', border: `1px solid ${ratioTotal > 100 ? '#F5C2C2' : '#F0DAD2'}` }}>
 <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
 <Text style={{ fontSize: '24rpx', color: '#4A443D' }}>占比合计</Text>
 <Text style={{ fontSize: '26rpx', fontWeight: 'bold', color: ratioTotal > 100 ? '#C0392B' : '#2E7D32' }}>{ratioTotal}%</Text>
 </View>
 {ratioTotal > 100 && (
 <Text style={{ fontSize: '22rpx', color: '#C0392B', display: 'block', marginTop: '4px' }}> 占比之和已超过 100%，请调整各项占比</Text>
 )}
 </View>
 )}
 </View>

 {/* 自由原料：食材库没有的自定义原料（不参与食养派生，仅作原料清单记录） */}
 <View style={{ marginTop: '10px' }}>
 <Text style={{ fontSize: '24rpx', color: '#4A443D', fontWeight: '600', display: 'block', marginBottom: '6px' }}>自由原料（库里没有可手动填）</Text>
 <View className="flex flex-row items-center gap-2">
 <Input
 value={controller.freeIngredient}
 onInput={(e: any) => controller.setFreeIngredient(e.detail.value)}
 placeholder='多个原料用空格 / 顿号分隔，如：虫草花、竹荪'
 style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '26rpx', background: '#FFF' }} />
 <View onClick={controller.addFreeIngredient} style={{ padding: '8px 14px', borderRadius: '10px', background: '#3B82F6', whiteSpace: 'nowrap' }}>
 <Text style={{ color: '#FFF', fontSize: '26rpx', fontWeight: 'bold' }}>添加</Text>
 </View>
 </View>
 </View>
 </Section>

 {controller.form.product_kind === 'food' && (
 <Section title="商品食疗系统" hint="系统自动计算 · 可一键填充" open={sections.therapy} onToggle={() => toggleSection('therapy')}>
 {/* 食养系统开关（仅食品类出现）：关掉后顾客端不展示食养 / 关怀信息 */}
 {controller.form.product_kind === 'food' && (
 <View style={{ marginBottom: '14px', padding: '12px 16px', borderRadius: '12px', background: '#FBF7EF', border: '1px solid #E8D9C8', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
 <View>
 <Text style={{ fontSize: '28rpx', color: '#333', fontWeight: '700' }}>启用食养系统</Text>
 <Text style={{ fontSize: '22rpx', color: '#999', marginTop: '2px', display: 'block' }}>关闭后顾客端不展示食养 / 关怀信息</Text>
 </View>
 <View onClick={() => controller.setForm(f => ({ ...f, enable_therapy: !f.enable_therapy }))}
 style={{ padding: '8px 18px', borderRadius: '9999px', background: controller.form.enable_therapy ? '#15803D' : '#E0E0E0' }}>
 <Text style={{ fontSize: '26rpx', color: controller.form.enable_therapy ? '#FFF' : '#888', fontWeight: '700' }}>{controller.form.enable_therapy ? '已开启' : '已关闭'}</Text>
 </View>
 </View>
 )}
 {/* 智能食养 · 食疗配对（仅食养食品且已开启食养系统） */}
 {controller.form.product_kind === 'food' && controller.form.enable_therapy && (
 <View>
 {/* 智能识别：菜名/图片 → 自动识别属性（替代手动选择，仍可微调） */}
 <View style={{ marginBottom: '14px', padding: '12px', borderRadius: '12px', background: '#FFF', border: '1.5px solid hsl(var(--primary))' }}>
 <Text style={S.primaryLabel}>识别（输菜名/传图，自动识别属性）</Text>
 <Input
 style={{ width: '100%', height: '40px', borderRadius: '10px', background: '#FBF7EF', border: '1.5px solid #EEE', fontSize: '28rpx', color: '#333', padding: '0 12px', boxSizing: 'border-box' }}
 placeholder="输入商品/菜名，如：冰糖雪梨羹、姜枣茶"
 placeholderStyle="color:#BBB;font-size:13px"
 value={controller.dishName}
 onInput={(e: any) => controller.setDishName(e.detail?.value ?? '')} />
 <View className="flex flex-row items-center gap-2" style={{ marginTop: '10px' }}>
 <View onClick={controller.pickDishImage}
 style={{ padding: '8px 12px', borderRadius: '10px', background: '#F0F4F8', border: '1px solid #DDD' }}>
 <Text style={S.text26}>📷 上传图片</Text>
 </View>
 {controller.dishImageUrl ? (
 <Image src={controller.dishImageUrl} mode="aspectFill" style={{ width: '40px', height: '40px', borderRadius: '8px' }} />
 ) : null}
 <View onClick={controller.runSmartAnalyze}
 style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 12px', borderRadius: '10px', background: controller.analyzing ? '#E0E0E0' : 'hsl(var(--primary))' }}>
 <Text style={{ fontSize: '26rpx', color: '#FFF', fontWeight: '700' }}>{controller.analyzing ? '识别中…' : '⚡ 一键识别'}</Text>
 </View>
 </View>
 <Text style={{ fontSize: '22rpx', color: 'var(--muted-foreground)', marginTop: '8px', display: 'block' }}>识别后自动填充下方食养字段，仍可手动微调。配置识图后支持"看图识菜"。</Text>
 </View>

 {/* 实时食疗安全分析（引擎边填边算） */}
 <View style={S.warmCard}>
 <Text style={S.primaryLabel}> 实时食疗安全分析（引擎边填边算）</Text>
 {controller.therapyReport ? (
 <View>
 <View className="flex flex-row items-center flex-wrap gap-2" style={{ marginBottom: '8px' }}>
 <View style={{ padding: '4px 10px', borderRadius: '9999px', background: '#EAF6EC', border: '1px solid #BFE3C4' }}>
 <Text style={{ fontSize: '24rpx', color: '#2E7D32', fontWeight: '700' }}>整体性味 · {controller.therapyReport.overall_nature}</Text>
 </View>
 </View>
 {/* 三色预警：红=过敏 / 橙=慎食 / 蓝=慢病适配 */}
 {controller.therapyReport.warnings.length > 0 && (
 <View style={{ marginBottom: '8px' }}>
 {controller.therapyReport.warnings.map((w, i) => {
 const tone = w.level === 'red'
 ? { bg: '#FDECEC', border: '#F5C2C2', fg: '#C0392B' }
 : w.level === 'orange'
 ? { bg: '#FBF3DD', border: '#E7D9B0', fg: '#8A6B22' }
 : { bg: '#F6F2EE', border: '#ECE6DD', fg: '#15803D' }
 return (
 <View key={i} style={{ padding: '6px 8px', borderRadius: '8px', background: tone.bg, borderLeftWidth: '3px', borderLeftColor: tone.fg, borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderTopColor: tone.border, borderRightColor: tone.border, borderBottomColor: tone.border, marginBottom: '6px' }}>
 <Text style={{ fontSize: '22rpx', fontWeight: '700', color: tone.fg }}>{w.level === 'red' ? '🔴' : w.level === 'orange' ? '🟠' : '🔵'} {w.label}</Text>
 <Text style={{ fontSize: '24rpx', color: '#444', lineHeight: '17px', display: 'block', marginTop: '2px' }}>{w.text}</Text>
 </View>
 )
 })}
 </View>
 )}
 {/* 商家寄语模板 + 一键套用 */}
 <View style={{ marginTop: '6px', padding: '8px 10px', borderRadius: '8px', background: '#FFFAF5', border: '1px dashed hsl(var(--primary-soft))' }}>
 <Text style={{ fontSize: '22rpx', color: 'var(--muted-foreground)' }}>系统生成商家寄语（80字内，可一键套用到下方描述）</Text>
 <Text style={{ fontSize: '24rpx', color: '#333', lineHeight: '18px', display: 'block', marginTop: '4px' }}>{controller.therapyReport.merchant_note}</Text>
 <View onClick={() => controller.setForm(f => ({ ...f, description: controller.therapyReport.merchant_note }))}
 style={{ marginTop: '6px', alignSelf: 'flex-start', padding: '4px 12px', borderRadius: '9999px', background: 'hsl(var(--primary))' }}>
 <Text style={{ fontSize: '24rpx', color: '#FFF' }}>一键套用寄语</Text>
 </View>
 </View>
 <Text style={{ fontSize: '20rpx', color: '#AAA', marginTop: '6px', display: 'block' }}>{controller.therapyReport.disclaimer}</Text>
 </View>
 ) : (
 <Text style={{ fontSize: '24rpx', color: 'var(--muted-foreground)', display: 'block' }}>从食材库添加食材或点「自动识别食材」后，这里实时显示整体性味 / 三色预警 / 商家寄语。</Text>
 )}
 </View>

 {/* 实时预览：顾客端卡片长什么样（边填边看，更赏心悦目） */}
 <Text style={{ fontSize: '24rpx', color: '#888', marginBottom: '6px', display: 'block' }}>实时预览（顾客视角）</Text>
 <View style={{ background: '#FFF', borderRadius: '12px', padding: '8px', marginBottom: '12px' }}>
 {(() => {
 try {
 const previewProduct: any = {
 health_tag: controller.form.health_tag,
 overall_nature: controller.form.overall_nature,
 match_goods: controller.form.match_goods,
 conflict_goods: controller.form.conflict_goods,
 ingredients: controller.form.ingredients,
 description: controller.form.description,
 aux_remind: controller.form.aux_remind,
 }
 const care = getProductCareInfo(previewProduct, [])
 return (
 <ProductGridCard
 id={'preview'}
 name={controller.form.name || '商品名称预览'}
 price={Number(controller.form.price) || 0}
 imageUrl={controller.form.main_image || undefined}
 care={care}
 width="100%"
 onAddCart={() => {}}
 disabled
 />
 )
 } catch {
 // 关怀引擎在 partial 商品上偶发异常时，降级为纯卡片，不拖垮编辑表单
 return (
 <ProductGridCard
 id={'preview'}
 name={controller.form.name || '商品名称预览'}
 price={Number(controller.form.price) || 0}
 imageUrl={controller.form.main_image || undefined}
 width="100%"
 onAddCart={() => {}}
 disabled
 />
 )
 }
 })()}
 </View>

{/* 手动微调开关（简洁 / 高级双模式，默认收起） */}
<View onClick={() => setSections(s => ({ ...s, manualTweak: !s.manualTweak }))}
 style={{ marginTop: '12px', marginBottom: '14px', padding: '12px 16px', borderRadius: '12px', background: '#FBF7EF', border: '1px dashed #D8C7B4', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
 <Text style={{ fontSize: '26rpx', color: 'hsl(var(--primary))', fontWeight: '700' }}>{sections.manualTweak ? '▾ 收起手动微调' : '▸ 展开手动微调（逐项核对 / 修改）'}</Text>
 <Text style={{ fontSize: '22rpx', color: '#999' }}>{sections.manualTweak ? '' : '系统已自动计算，无需逐项填'}</Text>
</View>

{/* 高级态：手动微调字段（默认收起） */}
{sections.manualTweak && (<View>
{/* 整体性味（引擎自动计算，可手动覆盖） */}
 <Text style={S.labelStrongBlock}>整体性味（引擎自动算，可手动覆盖）</Text>
 <View className="flex flex-row flex-wrap gap-2" style={{ marginBottom: '12px' }}>
 {NATURE_SCALE.map((n: string) => {
 const sel = controller.form.overall_nature === n
 return (
 <View key={n} onClick={() => controller.setForm(f => ({ ...f, overall_nature: sel ? '' : n }))}
 style={{
 padding: '6px 12px', borderRadius: '9999px',
 background: sel ? (NATURE_COLOR[n] || 'hsl(var(--primary))') : '#FFF',
 border: `1px solid ${NATURE_COLOR[n] || '#DDD'}`,
 }}>
 <Text style={{ fontSize: '26rpx', color: sel ? '#FFF' : (NATURE_COLOR[n] || '#666'), fontWeight: sel ? '700' : '400' }}>{n}</Text>
 </View>
 )
 })}
 </View>

 {/* 食疗标签（赭红） */}
 <Text style={S.labelStrongBlock}>食疗标签（最多 3）</Text>
 <View className="flex flex-row flex-wrap gap-2" style={{ marginBottom: '12px' }}>
 {HEALTH_TAGS.map((t: string) => {
 const sel = controller.form.health_tag.includes(t)
 return (
 <View key={t} onClick={() => controller.toggleArrayField('health_tag', t, 3)}
 style={{
 padding: '6px 12px', borderRadius: '9999px',
 background: sel ? 'hsl(var(--brand-ochre))' : '#FFF',
 border: '1px solid rgba(94,122,79,0.18)',
 }}>
 <Text style={{ fontSize: '26rpx', color: sel ? '#FFF' : 'hsl(var(--primary))', fontWeight: sel ? '700' : '400' }}>{t}</Text>
 </View>
 )
 })}
 </View>

 {/* 辨证适配人群：由食疗标签自动推导，可手动增删（迁移 00237） */}
 <Text style={S.labelStrongBlock}>辨证适配人群（最多 6）</Text>
 <Text style={{ fontSize: '22rpx', color: 'var(--muted-foreground)', marginBottom: '6px', display: 'block' }}>根据上方食疗标签自动推导，可手动增删；用于详情页辨证展示与个性化匹配</Text>
 <View className="flex flex-row flex-wrap gap-2" style={{ marginBottom: '12px' }}>
 {FIT_CROWD_OPTIONS.map((t: string) => {
 const sel = controller.form.fit_crowd_tags.includes(t)
 return (
 <View key={t} onClick={() => controller.toggleArrayField('fit_crowd_tags', t, 6)}
 style={{
 padding: '6px 12px', borderRadius: '9999px',
 background: sel ? '#15803D' : '#FFF',
 border: '1px solid rgba(22,163,74,0.25)',
 }}>
 <Text style={{ fontSize: '26rpx', color: sel ? '#FFF' : '#15803D', fontWeight: sel ? '700' : '400' }}>{t}</Text>
 </View>
 )
 })}
 </View>

 {/* 适合人群：引擎辨证生成，商家可手填覆盖（迁移 00237） */}
 <Text style={S.labelStrongBlock}>适合人群（可手改，留空则用系统辨证结果）</Text>
 <Textarea
 style={S.textareaBoxLg}
 placeholder={controller.therapyReport?.fit_people || '系统会根据食疗标签与配料自动辨证生成，也可在此手改…'}
 placeholderStyle="color:#BBB;font-size:13px"
 value={controller.form.fit_people_override}
 onInput={(e: any) => controller.setForm(f => ({ ...f, fit_people_override: e.detail?.value ?? '' }))} />

 {/* 辅料提醒：过敏/禁忌，让商品更懂用户 */}
 <Text style={S.labelStrongBlock}>辅料提醒（过敏/禁忌，如"含坚果，过敏慎选"）</Text>
 <Textarea
 style={S.textareaBoxLg}
 placeholder="填写辅料/过敏提醒，让商品更懂用户…"
 placeholderStyle="color:#BBB;font-size:13px"
 value={controller.form.aux_remind}
 onInput={(e: any) => controller.setForm(f => ({ ...f, aux_remind: e.detail?.value ?? '' }))} />

 {/* 宜搭 / 慎搭：从本店商品选择，互斥 */}
 {products.length > 0 && (
 <View style={{ marginTop: '14px' }}>
 <Text style={S.labelStrongBlock}>宜搭 / 慎搭商品（从本店选择，互斥）</Text>
 <ScrollView scrollY enhanced showScrollbar style={{ maxHeight: '130px', marginBottom: '8px' }}>
 {products.filter(p => p.id !== (controller.form as any).id).map((p: any) => {
 const isMatch = controller.form.match_goods.includes(p.id)
 const isConflict = controller.form.conflict_goods.includes(p.id)
 const tint = isMatch ? '#15803D' : isConflict ? '#DC2626' : '#999'
 return (
 <View key={p.id} onClick={() => {
 if (isMatch) { controller.toggleArrayField('match_goods', p.id); return }
 if (isConflict) { controller.toggleArrayField('conflict_goods', p.id); return }
 controller.toggleArrayField('match_goods', p.id)
 }}
 className="flex flex-row items-center justify-between" style={{ padding: '8px 10px', borderRadius: '8px', background: isMatch ? 'rgba(22,163,74,0.08)' : isConflict ? 'rgba(220,38,38,0.08)' : '#FBF7EF', border: `1px solid ${isMatch ? 'rgba(22,163,74,0.25)' : isConflict ? 'rgba(220,38,38,0.25)' : '#EEE'}`, marginBottom: '6px' }}>
 <Text style={S.text26}>{p.name}</Text>
 <Text style={{ fontSize: '24rpx', color: tint, fontWeight: '600' }}>{isMatch ? '宜搭' : isConflict ? '慎搭' : '—'}</Text>
 </View>
 )
 } )}
 </ScrollView>
 </View>
 )}
 </View>)}
 </View>
 )}

 {/* 导购文案 / 商家寄语（本地规则引擎生成，可手改；对齐网页版「店员导购短句」，置于食疗区末位） */}
 {controller.form.product_kind === 'food' && controller.form.enable_therapy && (
 <View style={S.fieldGap}>
 <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
 <Text style={S.labelStrong}>导购文案（可手改）</Text>
 <View onClick={controller.handleRegenerateCopy} style={{ padding: '6px 12px', borderRadius: '8px', background: '#FFF', border: '1px solid #E0E0E0' }}>
 <Text style={{ fontSize: '24rpx', color: '#34A853', fontWeight: '600' }}>重新生成文案</Text>
 </View>
 </View>
 <Textarea
 style={{ width: '100%', minHeight: '70px', borderRadius: '10px', background: '#FFF', border: '1.5px solid #EEE', fontSize: '28rpx', color: '#333', padding: '10px 14px', boxSizing: 'border-box', marginTop: '8px' }}
 placeholder='点「重新生成文案」自动生成，或手动填写一段导购话术'
 placeholderStyle="color:#BBB;font-size:13px"
 maxlength={80}
 value={controller.form.guide_sentence}
 onInput={(e: any) => controller.setForm(f => ({ ...f, guide_sentence: e.detail.value }))}
 />
 </View>
 )}
 </Section>
 )}

 {/* 存为模板（localStorage，无 schema 依赖；小程序端特色，保留在向导末尾） */}
 <View style={S.fieldGap}>
 <Text style={S.labelStrongBlock}>存为模板（可复用到新商品）</Text>
 <View className="flex flex-row items-center gap-2">
 <Input
 value={controller.templateName}
 onInput={(e: any) => controller.setTemplateName(e.detail?.value ?? '')}
 placeholder="模板名称（留空用商品名）"
 style={{ flex: 1, height: '40px', borderRadius: '10px', background: '#FBF7EF', border: '1.5px solid #EEE', fontSize: '28rpx', color: '#333', padding: '0 12px', boxSizing: 'border-box' }}
 />
 <View
 onClick={() => controller.saveAsTemplate()}
 style={{ padding: '9px 18px', borderRadius: '10px', background: '#FBF7EF', border: '1.5px solid #E8D9C8' }}>
 <Text style={{ fontSize: '26rpx', color: 'hsl(var(--primary))', fontWeight: '600' }}>💾 存为模板</Text>
 </View>
 </View>
 </View>
 </View>
 )}

 </ScrollView>

 {/* 底部操作条：固定在弹窗底部（不随内容滚动），任何时候都能取消/翻步/保存；适配iPhone安全区 */}
 <View style={{
   marginHorizontal: '-20px',
   paddingHorizontal: '20px',
   paddingTop: '12px',
   paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
   borderTop: '1px solid #F2EEEA',
   background: '#FFF',
   borderBottomLeftRadius: '24px',
   borderBottomRightRadius: '24px',
 }}>
 <View className="flex flex-row items-center gap-2">
 <Text style={{ flex: 1, fontSize: '22rpx', color: missingRequired ? '#DC2626' : '#999' }}>{missingHint}</Text>
 <View onClick={controller.handleCloseForm} style={{ padding: '10px 18px', borderRadius: '10px', background: '#FFF', border: '1px solid #EEE' }}>
 <Text style={{ fontSize: '28rpx', color: '#666' }}>取消</Text>
 </View>
 {step > 1 && (
 <View onClick={() => setStep(s => Math.max(1, s - 1))} style={{ padding: '10px 18px', borderRadius: '10px', background: '#FFF', border: '1px solid #EEE' }}>
 <Text style={{ fontSize: '28rpx', color: '#333' }}>上一步</Text>
 </View>
 )}
 {step < FORM_STEPS.length && (
 <View onClick={goNext} style={{ padding: '10px 18px', borderRadius: '10px', background: '#FFF', border: '1px solid hsl(var(--primary))' }}>
 <Text style={{ fontSize: '28rpx', color: 'hsl(var(--primary))', fontWeight: '600' }}>下一步</Text>
 </View>
 )}
 <View
 onClick={() => controller.handleSave()}
 style={{ padding: '10px 22px', borderRadius: '10px', background: missingRequired || controller.saving ? '#E0E0E0' : '#15803D' }}>
 <Text style={{ fontSize: '28rpx', fontWeight: 'bold', color: '#FFF' }}>{controller.saving ? '保存中…' : '确定'}</Text>
 </View>{/* 确定按钮 */}
 </View>{/* 分步导航行 */}
 </View>{/* 底部操作条（固定 footer） */}
 </View>{/* 弹窗内容区 */}
 </View>
 )}

    </>
  )
}
