// @title 食品配料安全
import { useState, useMemo, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Textarea, Button, Image, ScrollView } from '@tarojs/components'
import { resolveFoodAdditivesByText, createIngredientOcrTask, getFoodAdditivesByNames, getUserHealthProfile } from '@/db/food-api'
import { getProducts } from '@/db/api'
import { supabase, callEdgeFunction } from '@/client/supabase'
import { matchIngredientKeys, resolveIngredientEntries } from '@/utils/ingredient-analysis'
import type { IngredientEntry } from '@/utils/shiyang-dictionary'
import FoodSafetyPanel from '@/components/FoodSafetyPanel'
import ComprehensiveSafetyReport from '@/components/ComprehensiveSafetyReport'
import { analyzeFoodLabel, type ComprehensiveSafetyReport as ReportType } from '@/utils/safety-analysis'
import { getProductCareInfo } from '@/utils/product-care'
import { analyzeForProfile, profileToCrowds } from '@/utils/food-therapy'
import { buildHealthShortfalls, evaluateShortfall } from '@/utils/food-therapy/health-shortfall'
import { matchAllergens } from '@/utils/allergen-dictionary'
import { FOOD_THERAPY_DISCLAIMER } from '@/utils/compliance/shield'
import { useLocation } from '@/contexts/LocationContext'
import { useAuth } from '@/contexts/AuthContext'
import { uploadToStorage } from '@/utils/upload'
import type { FoodAdditive, Product, UserHealthProfile } from '@/db/types'
import { scanAndRoute } from '@/utils/scan'
import { useFoodKnowledgeStore } from '@/store/foodKnowledgeStore'
import { getCurrentTerm } from '@/utils/seasonal-box'

export default function FoodScanPage() {
  const { currentStore } = useLocation()
  const { profile: authProfile } = useAuth()
  const discoverFragment = useFoodKnowledgeStore((s) => s.discoverFragment)
  const [userProfile, setUserProfile] = useState<UserHealthProfile | null>(null)
  const [text, setText] = useState('')
  const [additives, setAdditives] = useState<FoodAdditive[]>([])
  const [shiyang, setShiyang] = useState<IngredientEntry[]>([])
  const [analyzed, setAnalyzed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [imgPreview, setImgPreview] = useState('')
  const [ocrMsg, setOcrMsg] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [matchedKeys, setMatchedKeys] = useState<string[]>([])   // 文本命中的添加剂标准名（来自 ADDITIVE_DICT）
  const [shiyangKeys, setShiyangKeys] = useState<string[]>([])    // 食材食养字典命中 key
  const [report, setReport] = useState<ReportType | null>(null)   // 全面安全分析报告（致敏原/营养/合规/年龄）
  const [recommend, setRecommend] = useState<Product[]>([])        // 扫描后推荐的安全好物（画像感知）
  const [recommendNote, setRecommendNote] = useState<string>('')   // 推荐区副标题（画像感知说明）
  const [loadingRec, setLoadingRec] = useState(false)

  // 登录后拉取结构化健康画像（画像感知分析 + 「为您定制」推荐的数据源）
  useEffect(() => {
    if (!authProfile?.id) return
    let alive = true
    getUserHealthProfile(authProfile.id)
      .then((hp) => alive && setUserProfile(hp))
      .catch(() => {})
    return () => { alive = false }
  }, [authProfile?.id])

  // 扫描标签命中的致敏原 ∩ 用户过敏原 → 强预警（本地文本解析，无需后端）
  const labelAllergenHits = useMemo(() => {
    if (!userProfile?.allergies?.length || !text.trim()) return []
    const fromText = matchAllergens(text).map((a) => a.key)
    return fromText.filter((k) => (userProfile.allergies ?? []).includes(k))
  }, [text, userProfile])

  // 扫描/识别后，拉取「对您安全且相宜」的好物：用画像跑 analyzeForProfile，
  // 取 tier=recommend 且无过敏原命中，按 profile-fit 排序；未建档回退通用关怀分列表。
  useEffect(() => {
    if (!analyzed) return
    let alive = true
    setLoadingRec(true)
    getProducts({ limit: 30 })
      .then((list) => {
        if (!alive) return
        const crowds = profileToCrowds(userProfile)
        if (crowds.length > 0) {
          const ranked = list
            .map((p) => ({ p, r: analyzeForProfile(p, userProfile) }))
            .filter((x) => x.r.tier === 'recommend' && x.r.allergenHits.length === 0)
            .sort((a, b) => b.r.profileFit - a.r.profileFit)
            .slice(0, 8)
            .map((x) => x.p)
          setRecommend(ranked)
          setRecommendNote(
            ranked.length > 0
              ? '已结合您的体质，筛出对您安全且相宜的好物'
              : '暂时没有对您专属推荐，先看通用安全好物',
          )
        } else {
          const scored = list
            .map((p) => ({ p, care: getProductCareInfo(p) }))
            .filter((x) => x.care.careScore >= 60 && x.care.tier !== 'avoid')
            .sort((a, b) => b.care.careScore - a.care.careScore)
            .slice(0, 8)
            .map((x) => x.p)
          setRecommend(scored)
          setRecommendNote('完成「食养偏好自测」后，推荐会更贴合您的身体')
        }
      })
      .catch(() => {})
      .finally(() => alive && setLoadingRec(false))
    return () => { alive = false }
  }, [analyzed, userProfile])

  // 安全评级汇总：命中配料风险等级 → S(全白) / A(含黄) / C(含黑)
  const grade = useMemo(() => {
    if (!additives.length) return null
    if (additives.some((a) => a.risk_level === 'black')) return { g: 'C', label: '含慎用成分', color: '#DC2626' }
    if (additives.some((a) => a.risk_level === 'yellow')) return { g: 'A', label: '含限量成分', color: '#D97706' }
    return { g: 'S', label: '配料较安全', color: '#16A34A' }
  }, [additives])

  // P4 结论层：把评级/年龄/过敏聚合为「能买吗 / 能给孩子吃吗 / 适合谁」的直接判断
  const conclusion = useMemo(() => {
    if (!analyzed || !report) return null
    const g = report.overall.grade
    // 能买吗（结合用户过敏原命中）
    let buy: { emoji: string; text: string; color: string }
    if (labelAllergenHits.length > 0) {
      buy = { emoji: '🔴', text: '不建议购买（含您过敏的成分）', color: '#DC2626' }
    } else if (g === 'D' || g === 'C') {
      buy = { emoji: '🟠', text: '谨慎购买（含风险成分，建议少买少吃）', color: '#DC2626' }
    } else if (g === 'A') {
      buy = { emoji: '🟡', text: '可适量食用', color: '#D97706' }
    } else {
      buy = { emoji: '🟢', text: '可放心选购', color: '#16A34A' }
    }
    // 能给孩子吃吗（复用引擎 ageSuitability.infantSafe）
    const childSafe = report.ageSuitability.infantSafe
    const child: { emoji: string; text: string; color: string } = childSafe
      ? { emoji: '🟢', text: '儿童可食用（仍建议适量、家长酌情）', color: '#16A34A' }
      : { emoji: '🔴', text: '不建议给婴幼儿/儿童食用', color: '#DC2626' }
    // 适合 / 不适合人群
    const unsuitable: string[] = []
    if (labelAllergenHits.length > 0) unsuitable.push('对您不适合（含过敏成分）')
    if (report.allergens.contains) {
      unsuitable.push(`过敏人群（含${report.allergens.detected.map((a) => a.name).join('、')}）`)
    }
    if (!childSafe) unsuitable.push('婴幼儿及儿童')
    const suitable: string[] = unsuitable.length === 0 ? ['一般人群均可食用'] : ['无相关过敏/禁忌的一般人群']
    if (g === 'S') suitable.push('可作日常选择')
    return { buy, child, suitable, unsuitable }
  }, [analyzed, report, labelAllergenHits])

  // 健康短板：体质标签来自 profiles.constitution_tags（自测写入的 body_state）+ user_health_profile.body_states，
  // 过敏原来自 user_health_profile.allergies。归一为体质后构建短板清单，并与扫描食养性味比对。
  const shortfalls = useMemo(
    () =>
      buildHealthShortfalls(
        [...(authProfile?.constitution_tags ?? []), ...(userProfile?.body_states ?? [])],
        userProfile?.allergies ?? [],
      ),
    [authProfile, userProfile],
  )
  const shortfallEval = useMemo(() => evaluateShortfall(shiyang, shortfalls), [shiyang, shortfalls])

  const analyze = async () => {
    if (!text.trim()) {
      Taro.showToast({ title: '请输入配料或商品名', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const [res, keys] = await Promise.all([
        resolveFoodAdditivesByText(text),
        Promise.resolve(matchIngredientKeys(text)),
      ])
      setAdditives(res.additives)
      setMatchedKeys(res.matchedNames)   // 添加剂标准名（即便库未扩也记录）
      setShiyangKeys(keys)                // 食材命中 key
      setShiyang(resolveIngredientEntries({ ingredients: keys }))
      setReport(
        analyzeFoodLabel({
          text,
          additives: res.additives.map((a) => ({ name: a.name, risk_level: a.risk_level })),
          matchedAdditiveNames: res.matchedNames,
        }),
      )
      setAnalyzed(true)

      // 发现新知识碎片（食安知识图谱）
      for (const additive of res.additives) {
        discoverFragment(additive.name)
      }
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
        if (!url) {
          setOcrMsg('存储桶未配置，无法上传图片（请在 Supabase 控制台创建 product-images 存储桶）')
          return
        }
        const task = await createIngredientOcrTask({ image_url: url, store_id: currentStore?.id || null })
        if (!task) {
          setOcrMsg('云端识别暂不可用（任务表权限未配置或网络异常）。请直接在上方「粘贴配料文字」框输入配料，本地即可立即分析，效果一致。')
          return
        }
        setOcrMsg('正在识别配料表...')
        // 直连 Edge Function（auth:false 跳过 403 登录态前戏，公开函数无需 token）
        const { data: ef, error: efErr } = await callEdgeFunction(
          'ocr-ingredient',
          { task_id: task.id },
          { auth: false },
        )
        if (efErr || !ef?.success) {
          const msg: string = ef?.error || efErr?.message || '识别服务异常'
          if (msg.includes('百度OCR未配置') || msg.includes('BAIDU_OCR')) {
            setOcrMsg('OCR 识别服务未配置，请改用「粘贴配料文字」方式分析')
          } else {
            console.error('[OCR] 识别失败:', msg)
            setOcrMsg('识别失败：' + msg)
          }
          return
        }
        // 用引擎回传的命中名回查完整安全库记录，复用既有评级与面板
        const full = await getFoodAdditivesByNames(ef.matched_additives || [])
        setAdditives(full)
        setMatchedKeys(ef.matched_additives || [])
        const keys = matchIngredientKeys((ef.parsed_ingredients || []).join(','))
        setShiyangKeys(keys)
        setShiyang(resolveIngredientEntries({ ingredients: keys }))
        setReport(
          analyzeFoodLabel({
            text: ef.raw_text || text,
            additives: full.map((a) => ({ name: a.name, risk_level: a.risk_level })),
            matchedAdditiveNames: ef.matched_additives || [],
          }),
        )
        setAnalyzed(true)
        setOcrMsg(ef.safety_grade === 'C' ? '识别完成：含慎用成分，请查看安全评级' : '识别完成')
      } catch (e: any) {
        // 兜底日志（OCR 排查用）
        console.error('[OCR] 异常详情:', {
          message: e?.message,
          name: e?.name,
          stack: e?.stack?.slice(0, 500),
        })
        setOcrMsg('识别失败：' + (e?.message || '网络异常'))
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
        粘贴配料表文字或输入商品名即可在本地即时分析（无需拍照、不依赖云端）。拍照可提交服务端智能识图（需联网，识别失败时用上方文本同样可用）。
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
          style={{ background: 'hsl(var(--primary))', color: '#fff', fontSize: 14 }}
        >
          解析配料
        </Button>
        <Button
          onClick={() => {
            if (!text.trim()) {
              Taro.showToast({ title: '请先输入或粘贴配料文字', icon: 'none' })
              return
            }
            Taro.navigateTo({
              url: `/pages/food/analysis-result/index?text=${encodeURIComponent(text.trim())}`,
            })
          }}
          className="mt-2 rounded-full"
          style={{ background: '#0f172a', color: '#fff', fontSize: 14 }}
        >
          查看标准安全报告
        </Button>
      </View>

      {/* 拍照识别 + 扫条码购买（两条下单链路） */}
      <View className="mt-3 flex flex-row items-center" style={{ gap: 12 }}>
        <Button
          onClick={chooseImage}
          loading={ocrLoading}
          className="rounded-full"
          style={{ background: '#F0EDE8', color: 'hsl(var(--foreground))', fontSize: 14 }}
        >
          📷 拍照识别
        </Button>
        <Button
          onClick={() => scanAndRoute()}
          className="rounded-full"
          style={{ background: '#EAF2FF', color: 'hsl(var(--foreground))', fontSize: 14 }}
        >
          📦 扫条码购买
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

      {/* P4 结论层：直接回答「能买吗 / 能给孩子吃吗 / 适合谁」 */}
      {analyzed && conclusion && (
        <View
          className="mt-3 rounded-2xl border-2 p-4"
          style={{ borderColor: conclusion.buy.color + '66', backgroundColor: conclusion.buy.color + '0D' }}
        >
          <Text className="text-base font-bold text-foreground" style={{ display: 'block', marginBottom: 10 }}>
            📌 一句话结论
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 18, marginRight: 8 }}>{conclusion.buy.emoji}</Text>
            <Text className="text-sm font-semibold" style={{ color: conclusion.buy.color, flex: 1, lineHeight: 1.5 }}>
              {conclusion.buy.text}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 18, marginRight: 8 }}>{conclusion.child.emoji}</Text>
            <Text className="text-sm font-semibold" style={{ color: conclusion.child.color, flex: 1, lineHeight: 1.5 }}>
              {conclusion.child.text}
            </Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', paddingTop: 10 }}>
            <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginBottom: 4, lineHeight: 1.6 }}>
              适合：{conclusion.suitable.join('；')}
            </Text>
            <Text
              className="text-xs"
              style={{ display: 'block', color: conclusion.unsuitable.length ? '#B91C1C' : '#16A34A', lineHeight: 1.6 }}
            >
              不适合：{conclusion.unsuitable.length ? conclusion.unsuitable.join('；') : '暂无明显禁忌人群'}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 10, lineHeight: 1.6 }}>
            {FOOD_THERAPY_DISCLAIMER}
          </Text>
        </View>
      )}

      {/* 针对用户的健康短板：把扫描配料性味 vs 用户短板 → 补/伤/中性 */}
      {analyzed && shortfalls.length > 0 && (
        <View className="mt-4 rounded-2xl border p-4" style={{ borderColor: '#F3D9E6', background: '#FFFBF7' }}>
          <Text className="text-base font-bold text-[#1A1A1A]">🎯 针对你的健康短板</Text>
          {shortfallEval.hits.filter((h) => h.kind === 'harm').length > 0 && (
            <View className="mt-2">
              <Text className="text-xs font-semibold" style={{ color: '#DC2626', display: 'block', marginBottom: 4 }}>
                偏伤短板，建议少碰或避开
              </Text>
              <View className="flex flex-wrap gap-2">
                {shortfallEval.hits.filter((h) => h.kind === 'harm').map((h, i) => (
                  <View key={i} className="rounded-full px-3 py-1" style={{ background: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }}>
                    <Text className="text-xs" style={{ color: '#B91C1C' }}>{h.item} · {h.shortfallLabel}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {shortfallEval.hits.filter((h) => h.kind === 'boost').length > 0 && (
            <View className="mt-2">
              <Text className="text-xs font-semibold" style={{ color: '#16A34A', display: 'block', marginBottom: 4 }}>
                正好补短板，可常吃
              </Text>
              <View className="flex flex-wrap gap-2">
                {shortfallEval.hits.filter((h) => h.kind === 'boost').map((h, i) => (
                  <View key={i} className="rounded-full px-3 py-1" style={{ background: '#ECFDF3', borderWidth: 1, borderColor: '#BBF7D0' }}>
                    <Text className="text-xs" style={{ color: '#15803D' }}>{h.item} · {h.shortfallLabel}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {shortfallEval.hits.length === 0 && (
            <Text className="text-xs text-[#6B7280] mt-2 block" style={{ lineHeight: 1.7 }}>
              当前配料与你已知的短板无明显冲突，可放心看其他维度。
            </Text>
          )}
          <Text className="text-[11px] text-[#9CA3AF] mt-2 block" style={{ lineHeight: 1.6 }}>{FOOD_THERAPY_DISCLAIMER}</Text>
        </View>
      )}

      {/* 明细面板（命中添加剂或食材才展示） */}
      {analyzed && (additives.length > 0 || shiyang.length > 0) && (
        <FoodSafetyPanel foodAdditives={additives} shiyangEntries={shiyang} />
      )}
      {/* 全面安全分析（致敏原 / 营养成分 / 标签合规 / 适宜人群） */}
      {analyzed && report && (
        <ComprehensiveSafetyReport report={report} />
      )}

      {/* 过敏原强预警：扫描标签命中的致敏原 ∩ 用户画像过敏原 */}
      {analyzed && labelAllergenHits.length > 0 && (
        <View className="mt-4 rounded-2xl border border-red-300 p-3" style={{ background: '#FEF2F2' }}>
          <Text className="text-sm font-bold" style={{ display: 'block', color: '#DC2626', marginBottom: 6 }}>
            ⚠️ 您过敏的成分预警
          </Text>
          <Text className="text-xs" style={{ display: 'block', lineHeight: 1.7, color: '#B91C1C' }}>
            识别到本标签可能含您过敏的致敏原，请谨慎选择或避开相关商品。
          </Text>
        </View>
      )}

      {/* 为您定制 / 为您推荐 的安全好物：画像感知，点选直接进商品详情下单 */}
      {analyzed && recommend.length > 0 && (
        <View className="mt-4">
          <Text className="text-base font-bold text-foreground mb-1" style={{ display: 'block' }}>
            🛒 {profileToCrowds(userProfile).length > 0 ? '为您定制的安全好物' : '为您推荐的安全好物'}
          </Text>
          {recommendNote ? (
            <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginBottom: 8, lineHeight: 1.5 }}>
              {recommendNote}
            </Text>
          ) : null}
          <ScrollView scrollX className="whitespace-nowrap">
            {recommend.map((p) => {
              const fit = analyzeForProfile(p, userProfile).profileFit
              return (
                <View
                  key={p.id}
                  onClick={() => Taro.navigateTo({ url: `/pages/product/index?id=${p.id}` })}
                  style={{ display: 'inline-block', width: 140, marginRight: 12, verticalAlign: 'top' }}
                >
                  <Image src={p.image_url || ''} style={{ width: 140, height: 140, borderRadius: 12 }} mode="aspectFill" />
                  <Text className="text-sm text-foreground mt-1" style={{ display: 'block' }} numberOfLines={1}>{p.name}</Text>
                  <Text className="text-xs" style={{ display: 'block', color: '#16A34A' }}>
                    {profileToCrowds(userProfile).length > 0 ? `契合度 ${fit}` : `食养关怀 ${getProductCareInfo(p).careScore}`}
                  </Text>
                </View>
              )
            })}
          </ScrollView>
          <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 8, lineHeight: 1.6 }}>
            {FOOD_THERAPY_DISCLAIMER}
          </Text>
        </View>
      )}
      {/* 命中添加剂名，但安全库尚未收录（需跑 00203 迁移） */}
      {analyzed && !additives.length && matchedKeys.length > 0 && (
        <View className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3">
          <Text className="text-sm font-bold" style={{ display: 'block', color: '#D97706', marginBottom: 6 }}>
            🔎 已识别 {matchedKeys.length} 项添加剂名
          </Text>
          <Text className="text-xs text-muted-foreground" style={{ display: 'block', lineHeight: 1.7 }}>
            识别到：{matchedKeys.slice(0, 12).join('、')}{matchedKeys.length > 12 ? '...' : ''}
          </Text>
          <Text className="text-xs" style={{ display: 'block', marginTop: 8, lineHeight: 1.7, color: '#D97706' }}>
            但安全库尚未收录这些添加剂的完整评级。请在 Supabase SQL Editor 跑迁移 00203（扩种子）后即可显示安全评级。
          </Text>
        </View>
      )}
      {/* 命中普通食材（无添加剂） */}
      {analyzed && !additives.length && matchedKeys.length === 0 && shiyangKeys.length > 0 && (
        <View className="mt-4 rounded-2xl border border-black/5 bg-white p-3">
          <Text className="text-sm font-bold" style={{ display: 'block', color: '#16A34A', marginBottom: 6 }}>
            ✅ 文字解析正常，已识别 {shiyangKeys.length} 项原料
          </Text>
          <Text className="text-xs text-muted-foreground" style={{ display: 'block', lineHeight: 1.7 }}>
            识别到：{shiyangKeys.slice(0, 12).join('、')}{shiyangKeys.length > 12 ? '...' : ''}
          </Text>
          <Text className="text-xs text-muted-foreground" style={{ display: 'block', marginTop: 8, lineHeight: 1.7 }}>
            这些都是普通食品原料（小麦粉、椰子油、可可粉…），不属于 GB 2760 食品添加剂，因此安全库无对应评级 — 这是预期行为，不是解析失败。如想看添加剂安全评级，请输入含「山梨酸钾、阿斯巴甜、苯甲酸钠、麦芽糖醇、罗汉果甜苷」等具体添加剂名的配料。
          </Text>
        </View>
      )}
      {/* 完全未命中 */}
      {analyzed && !additives.length && matchedKeys.length === 0 && shiyangKeys.length === 0 && (
        <Text className="text-sm text-muted-foreground mt-4" style={{ display: 'block', lineHeight: 1.6 }}>
          未识别到已知配料或食材，请检查输入内容。
        </Text>
      )}

      {/* 食安知识图谱入口 */}
      <KnowledgeAtlasEntry />

      {/* 节气食盒入口 */}
      <SeasonalBoxEntry />
    </View>
  )
}

// 节气食盒入口（独立hook取当前节气，避免JSX内直接调用getState）
function SeasonalBoxEntry() {
  const current = getCurrentTerm()
  const termName = current?.name || '当季'
  return (
    <View
      className="mt-4 pg-card rounded-2xl p-4"
      style={{ background: 'linear-gradient(135deg, hsl(var(--brand-gold) / 0.14) 0%, hsl(var(--brand-gold) / 0.05) 100%)' }}
      onClick={() => Taro.navigateTo({ url: '/pages/food/seasonal-box/index' })}
    >
      <View className="flex items-center justify-between">
        <View className="flex-1">
          <Text className="text-sm font-bold" style={{ color: 'hsl(var(--brand-ochre))' }}>🌾 节气食盒</Text>
          <Text className="text-xs mt-1 opacity-70" style={{ color: 'hsl(var(--brand-ochre))', lineHeight: 1.4 }}>
            当前{termName} · 应季食材精选，顺时而食
          </Text>
        </View>
        <View className="flex items-center gap-2">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--brand-gold) / 0.14)' }}>
            <Text className="text-xl">{current?.emoji || '🌾'}</Text>
          </View>
          <Text className="text-sm" style={{ color: 'hsl(var(--brand-ochre))' }}>→</Text>
        </View>
      </View>
    </View>
  )
}

// 知识图谱入口组件（独立hook调用，避免JSX内直接调用getState）
function KnowledgeAtlasEntry() {
  const collected = useFoodKnowledgeStore((s) => s.collected)
  const count = Object.keys(collected).length
  return (
    <View
      className="mt-6 pg-card rounded-2xl p-4"
      style={{ background: 'linear-gradient(135deg, hsl(var(--brand-jade) / 0.10) 0%, hsl(var(--brand-jade) / 0.03) 100%)' }}
      onClick={() => Taro.navigateTo({ url: '/pages/food/knowledge-atlas/index' })}
    >
      <View className="flex items-center justify-between">
        <View className="flex-1">
          <Text className="text-sm font-bold" style={{ color: 'hsl(var(--brand-jade))' }}>🧭 食安知识图谱</Text>
          <Text className="text-xs mt-1 opacity-70" style={{ color: 'hsl(var(--brand-jade))', lineHeight: 1.4 }}>
            {count === 0
              ? '扫描配料表，发现新成分收入图谱'
              : `已收录 ${count} 种成分，继续探索解锁更多`}
          </Text>
        </View>
        <View className="flex items-center gap-2">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--brand-jade) / 0.12)' }}>
            <Text className="text-xl">🧪</Text>
          </View>
          <Text className="text-sm" style={{ color: 'hsl(var(--brand-jade))' }}>→</Text>
        </View>
      </View>
    </View>
  )
}
