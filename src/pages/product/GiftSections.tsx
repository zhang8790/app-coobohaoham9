// @title 礼品类商品详情模块（与食养食品彻底分开渲染）
import { View, Text } from '@tarojs/components'
import type { Product } from '@/db/types'
import { giftShieldCopy, GIFT_DISCLAIMER } from '@/utils/compliance/gift-shield'
import { lookupMaterial, type MaterialInfo } from '@/utils/gift/material-kb'

/**
 * 药膳手串 / 工艺礼品的详情模块树（金色质感，区别于食养的蓝色）。
 * 四维：寓意文化(灵魂) / 材质工艺 / 送礼场景(转化核心) / 保养与使用(合规)。
 * 与食养模块互斥：仅当 product_kind !== 'food' 时由详情页渲染。
 */
export default function GiftSections({ product }: { product: Product }) {
  const meaning = product.gift_meaning ? giftShieldCopy(product.gift_meaning).safe : ''
  const craft = product.gift_craft ? giftShieldCopy(product.gift_craft).safe : ''
  const scene = product.gift_scene ? giftShieldCopy(product.gift_scene).safe : ''
  const care = product.gift_care ? giftShieldCopy(product.gift_care).safe : ''
  const materials = (product.materials || []).filter(Boolean)

  // 自动材质解读：材质标签 → 知识库匹配（合规，零功效宣称），无匹配则不渲染
  const materialInfos = materials
    .map((m) => lookupMaterial(m))
    .filter((x): x is MaterialInfo => x !== null)

  if (!meaning && !craft && !scene && !care && materials.length === 0) return null

  // 送礼场景：按换行 / 分号拆成多行，渲染为带 ✨ 的清单
  const sceneLines = scene
    ? scene.split(/[\n；;]+/).map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <View className="mt-3">
      {/* 区块标题 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: '18px', fontWeight: '800', color: '#8A5A00', display: 'block' }}>🎁 关于这份礼遇</Text>
      </View>

      {/* ① 寓意文化（灵魂） */}
      {meaning && (
        <View className="mb-3" style={{ padding: '14px 16px', borderRadius: '16px', background: 'linear-gradient(135deg,#FFF7E6,#FCEFD2)', border: '1px solid #F0D9A8' }}>
          <Text style={{ fontSize: '13px', fontWeight: '700', color: '#B45309', display: 'block', marginBottom: 6 }}>✦ 寓意 · 一腕清欢</Text>
          <Text style={{ fontSize: '15px', color: '#7C4A03', display: 'block', lineHeight: '1.7' }}>{meaning}</Text>
        </View>
      )}

      {/* ② 材质工艺 */}
      {(craft || materials.length > 0) && (
        <View className="mb-3" style={{ padding: '14px 16px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #F0E2C4' }}>
          <Text style={{ fontSize: '13px', fontWeight: '700', color: '#B45309', display: 'block', marginBottom: 8 }}>✦ 材质工艺</Text>
          {materials.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: craft ? 8 : 0 }}>
              {materials.map((m, i) => (
                <Text key={i} style={{ fontSize: '12px', color: '#8A5A00', background: '#FBF1DA', paddingVertical: '3px', paddingHorizontal: '10px', borderRadius: '999px', marginRight: 6, marginBottom: 6, display: 'block' }}>
                  {m}
                </Text>
              ))}
            </View>
          )}
          {craft && (
            <Text style={{ fontSize: '14px', color: '#5B4326', display: 'block', lineHeight: '1.7' }}>{craft}</Text>
          )}
        </View>
      )}

      {/* ②-附 材质解读（自动生成，过 gift-shield 合规校验） */}
      {materialInfos.length > 0 && (
        <View className="mb-3" style={{ padding: '14px 16px', borderRadius: '16px', background: 'linear-gradient(135deg,#FBF6EC,#F6EEDD)', border: '1px solid #EAD9B6' }}>
          <Text style={{ fontSize: '13px', fontWeight: '700', color: '#B45309', display: 'block', marginBottom: 8 }}>✦ 材质解读</Text>
          {materialInfos.map((m, i) => (
            <View key={i} style={{ marginBottom: i < materialInfos.length - 1 ? 10 : 0 }}>
              <Text style={{ fontSize: '14px', fontWeight: '700', color: '#8A5A00', display: 'block', marginBottom: 3 }}>{m.name}</Text>
              <Text style={{ fontSize: '13px', color: '#6B4A1E', display: 'block', lineHeight: '1.7' }}>特性 · {giftShieldCopy(m.traits).safe}</Text>
              <Text style={{ fontSize: '13px', color: '#6B4A1E', display: 'block', lineHeight: '1.7' }}>寓意 · {giftShieldCopy(m.meaning).safe}</Text>
              <Text style={{ fontSize: '13px', color: '#6B4A1E', display: 'block', lineHeight: '1.7' }}>体验 · {giftShieldCopy(m.experience).safe}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ③ 送礼场景（转化核心） */}
      {sceneLines.length > 0 && (
        <View className="mb-3" style={{ padding: '14px 16px', borderRadius: '16px', background: 'linear-gradient(135deg,#FEF6EC,#FBEFE0)', border: '1px solid #F1DEC0' }}>
          <Text style={{ fontSize: '13px', fontWeight: '700', color: '#B45309', display: 'block', marginBottom: 8 }}>✦ 适合送给谁</Text>
          {sceneLines.map((s, i) => (
            <Text key={i} style={{ fontSize: '14px', color: '#6B4A1E', display: 'block', lineHeight: '1.7' }}>✨ {s}</Text>
          ))}
        </View>
      )}

      {/* ④ 保养与使用（合规，强制常驻免责） */}
      {care && (
        <View className="mb-3" style={{ padding: '14px 16px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #F0E2C4' }}>
          <Text style={{ fontSize: '13px', fontWeight: '700', color: '#B45309', display: 'block', marginBottom: 8 }}>✦ 保养与使用</Text>
          <Text style={{ fontSize: '14px', color: '#5B4326', display: 'block', lineHeight: '1.7', marginBottom: 10 }}>{care}</Text>
          <View style={{ padding: '8px 10px', borderRadius: '10px', background: '#FFF8F1', border: '1px solid #F3DEC9' }}>
            <Text style={{ fontSize: '11px', color: '#9A7B4F', display: 'block', lineHeight: '1.6' }}>{GIFT_DISCLAIMER}</Text>
          </View>
        </View>
      )}
    </View>
  )
}
