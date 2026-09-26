// 门店定位（经纬度坐标）—— 纯展示，状态由父页 form 驱动
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import type { StoreForm } from './index'
import { forwardGeocode } from '@/utils/lbs-service'

export default function StoreLocation({
  form,
  updateField,
}: {
  form: StoreForm
  updateField: <K extends keyof StoreForm>(field: K, value: StoreForm[K]) => void
}) {
  const [geoLoading, setGeoLoading] = useState(false)

  const handleGeocode = async () => {
    const addr = (form.address || '').trim()
    if (!addr) {
      Taro.showToast({ title: '请先在「联系信息」填写店铺地址', icon: 'none' })
      return
    }
    if (geoLoading) return
    setGeoLoading(true)
    Taro.showLoading({ title: '解析坐标中...' })
    try {
      const loc = await forwardGeocode(addr)
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        updateField('lat', loc.lat.toFixed(6))
        updateField('lng', loc.lng.toFixed(6))
        Taro.showToast({ title: '已自动填充坐标', icon: 'success' })
      } else {
        Taro.showToast({ title: '未解析到坐标，请检查地址', icon: 'none' })
      }
    } catch (e) {
      Taro.showToast({ title: '解析失败，请稍后重试', icon: 'none' })
    } finally {
      Taro.hideLoading()
      setGeoLoading(false)
    }
  }

  return (
    <View className="px-4 mt-3 p-4 rounded-2xl bg-white border border-gray-100">
      <Text className="text-base font-bold text-foreground mb-1 block">门店定位</Text>
      <Text className="text-xs text-gray-400 mb-3 block">
        填写经纬度后，顾客在门店选择器里才能按距离正确排序并看到距离。留空的门店会排在列表末尾。
      </Text>

      {/* 一键根据地址解析坐标：读取「联系信息」里的地址 → 腾讯地理编码 → 自动填 lat/lng */}
      <View
        onClick={handleGeocode}
        className="mb-3 flex items-center justify-center gap-1 rounded-xl"
        style={{ background: 'hsl(var(--primary))', height: '40px' }}
      >
        <Text style={{ color: '#ffffff', fontSize: '28rpx', fontWeight: '700' }}>
          {geoLoading ? '解析中...' : '📍 根据地址自动获取坐标'}
        </Text>
      </View>

      <View className="flex items-center gap-3">
        <View className="flex-1">
          <Text className="text-xs text-gray-500 mb-1 block">纬度 (lat)</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm"
            type="digit"
            value={form.lat}
            placeholder="如 30.2930"
            onInput={e => updateField('lat', (e.detail?.value as string) ?? '')} />
        </View>
        <View className="flex-1">
          <Text className="text-xs text-gray-500 mb-1 block">经度 (lng)</Text>
          <Input
            className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm"
            type="digit"
            value={form.lng}
            placeholder="如 120.1300"
            onInput={e => updateField('lng', (e.detail?.value as string) ?? '')} />
        </View>
      </View>
      <Text className="text-xs text-gray-400 mt-2 block">
        小提示：在「联系信息」填好店铺地址后，点上方按钮即可自动解析经纬度；也可在高德 / 腾讯地图长按门店位置复制「纬度, 经度」手动填入。
      </Text>
    </View>
  )
}
