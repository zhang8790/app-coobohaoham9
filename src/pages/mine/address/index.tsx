// @title 地址管理
import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { getMyAddresses, saveAddress, deleteAddress } from '@/db/api'
import type { UserAddress } from '@/db/types'
import { withRouteGuard } from '@/components/RouteGuard'
import Icon from '@/components/Icon'

type AddrForm = { name: string; phone: string; province: string; city: string; district: string; detail: string; is_default: boolean }
const emptyForm = (): AddrForm => ({ name: '', phone: '', province: '', city: '', district: '', detail: '', is_default: false })

function AddressPage() {
  const [addresses, setAddresses] = useState<UserAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AddrForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setAddresses(await getMyAddresses())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openAdd = async () => {
    setForm(emptyForm())
    setEditId(null)
    setShowForm(true)

    // 自动获取用户位置并解析省市区
    try {
      const isWeapp = Taro.getEnv() === 'WEAPP'
      if (isWeapp) {
        // 先检查权限
        const setting = await Taro.getSetting()
        if (setting.authSetting['scope.userLocation'] === false) {
          Taro.showModal({
            title: '需要位置权限',
            content: '为了自动填写地址信息，请在设置中允许访问位置',
            confirmText: '去设置',
            success: (res) => { if (res.confirm) Taro.openSetting() },
          })
          return
        }

        // 获取当前位置坐标
        let latitude: number, longitude: number
        try {
          const locRes = await Taro.getLocation({ type: 'gcj02' })
          latitude = locRes.latitude
          longitude = locRes.longitude
        } catch (locErr) {
          console.warn('[Address] 获取位置失败，使用默认定位', locErr)
          // 默认定位到北京
          latitude = 39.9042
          longitude = 116.4074
        }

        // 使用 chooseLocation 让用户选择具体地址（返回详细地址信息）
        try {
          const chosenLoc = await Taro.chooseLocation({
            latitude,
            longitude,
          })
          
          if (chosenLoc && chosenLoc.address) {
            // 解析地址字符串，提取省市区
            const fullAddress = chosenLoc.address || ''
            const name = chosenLoc.name || ''
            
            // 简单解析中国地址格式
            let province = '', city = '', district = '', detail = ''
            
            // 尝试匹配常见格式：广东省广州市天河区xxx路
            const provinceMatch = fullAddress.match(/^(.+?省|.+?自治区)/)
            if (provinceMatch) {
              province = provinceMatch[1]
              const restAfterProvince = fullAddress.slice(provinceMatch[0].length)
              const cityMatch = restAfterProvince.match(/^(.+?市)/)
              if (cityMatch) {
                city = cityMatch[1]
                const restAfterCity = restAfterProvince.slice(cityMatch[0].length)
                const districtMatch = restAfterCity.match(/^(.+?区|.+?县)/)
                if (districtMatch) {
                  district = districtMatch[1]
                  detail = restAfterCity.slice(districtMatch[0].length)
                } else {
                  detail = restAfterCity
                }
              } else {
                // 没有匹配到市，可能地址格式不标准
                city = restAfterProvince.split(/区|县/)[0] || ''
                detail = restAfterProvince
              }
            } else {
              // 尝试匹配直辖市格式：北京市朝阳区xxx路
              const municipalityMatch = fullAddress.match(/^(北京|上海|天津|重庆)(市)?(.+?区|.+?县)/)
              if (municipalityMatch) {
                province = municipalityMatch[1] + '市'
                city = municipalityMatch[1] + '市'
                district = municipalityMatch[3] || ''
                detail = fullAddress.slice(municipalityMatch[0].length)
              }
            }
            
            // 如果解析失败，使用 name 作为详细地址
            if (!province && !city) {
              // 无法解析，提示用户手动选择
              Taro.showToast({ title: '请手动选择省市', icon: 'none', duration: 2000 })
            } else {
              setForm(prev => ({
                ...prev,
                province,
                city,
                district,
                detail: detail || name || '',
              }))
              Taro.showToast({ title: '地址已自动填写', icon: 'success', duration: 1500 })
            }
          }
        } catch (chooseErr: any) {
          // 用户取消选择，不处理
          if (chooseErr.errMsg && chooseErr.errMsg.includes('cancel')) {
            console.log('[Address] 用户取消选择位置')
          } else {
            console.warn('[Address] chooseLocation 失败:', chooseErr)
          }
        }
      }
    } catch (e) {
      console.warn('[Address] 获取位置失败:', e)
      // 静默失败，不影响正常使用
    }
  }
  const openEdit = (a: UserAddress) => {
    setForm({ name: a.name, phone: a.phone, province: a.province ?? '', city: a.city ?? '', district: a.district ?? '', detail: a.detail, is_default: a.is_default })
    setEditId(a.id); setShowForm(true)
  }

  const setField = (key: keyof AddrForm, val: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!form.name.trim()) { Taro.showToast({ title: '请填写收货人姓名', icon: 'none' }); return }
    if (!/^1\d{10}$/.test(form.phone)) { Taro.showToast({ title: '请填写正确的手机号', icon: 'none' }); return }
    if (!form.detail.trim()) { Taro.showToast({ title: '请填写详细地址', icon: 'none' }); return }
    setSaving(true)
    await saveAddress({ id: editId ?? undefined, ...form })
    setSaving(false)
    Taro.showToast({ title: editId ? '修改成功' : '添加成功', icon: 'success' })
    setShowForm(false)
    load()
  }

  const handleDelete = (id: string) => {
    Taro.showModal({
      title: '确认删除', content: '确认删除该收货地址？',
      confirmText: '删除', confirmColor: '#ef4444',
      success: async (r) => {
        if (r.confirm) { await deleteAddress(id); load() }
      },
    })
  }

  return (
    <View className="min-h-screen bg-background pb-24">

      <View className="px-4 mt-4">
        {loading ? (
          <View className="flex justify-center py-16">
            <Icon name="loading" size={36} className="text-primary animate-spin" />
          </View>
        ) : addresses.length === 0 ? (
          <View className="flex flex-col items-center py-16 gap-3">
            <Icon name="map-marker-off" size={60} className="text-muted-foreground/40" />
            <Text className="text-xl text-muted-foreground">暂无收货地址，快去添加吧</Text>
          </View>
        ) : (
          addresses.map(a => (
            <View key={a.id} className="bg-card rounded-2xl border border-border mb-3 p-4">
              <View className="flex items-center justify-between mb-2">
                <View className="flex items-center gap-2">
                  <Text className="text-xl font-bold text-foreground">{a.name}</Text>
                  <Text className="text-xl text-muted-foreground">{a.phone}</Text>
                  {a.is_default && (
                    <Text className="text-base px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">默认</Text>
                  )}
                </View>
              </View>
              <Text className="text-xl text-foreground mb-3">
                {[a.province, a.city, a.district, a.detail].filter(Boolean).join(' ')}
              </Text>
              <View className="flex gap-3 pt-3 border-t border-border">
                <View
                  className="flex-1 flex items-center justify-center py-2 gap-1 rounded-xl bg-muted"
                  onClick={() => openEdit(a)}>
                  <Icon name="pencil" size={20} className="text-foreground" />
                  <Text className="text-xl text-foreground">编辑</Text>
                </View>
                {!a.is_default && (
                  <View
                    className="flex-1 flex items-center justify-center py-2 gap-1 rounded-xl bg-muted"
                    onClick={() => saveAddress({ id: a.id, name: a.name, phone: a.phone, province: a.province ?? undefined, city: a.city ?? undefined, district: a.district ?? undefined, detail: a.detail, is_default: true }).then(load)}>
                    <Icon name="check-circle-outline" size={20} className="text-primary" />
                    <Text className="text-xl text-primary">设为默认</Text>
                  </View>
                )}
                <View
                  className="flex-1 flex items-center justify-center py-2 gap-1 rounded-xl bg-muted"
                  onClick={() => handleDelete(a.id)}>
                  <Icon name="delete-outline" size={20} className="text-red-400" />
                  <Text className="text-xl text-red-400">删除</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* 底部新增按钮 */}
      <View className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-background" style={{ borderTop: '1px solid var(--border)' }}>
        <View
          className="w-full flex items-center justify-center leading-none rounded-2xl bg-primary"
          onClick={openAdd}>
          <View className="py-4 flex items-center gap-2">
            <Icon name="plus" size={24} className="text-white" />
            <Text className="text-xl font-bold text-white">新增收货地址</Text>
          </View>
        </View>
      </View>

      {/* 地址表单弹窗 */}
      {showForm && (
        <View className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowForm(false)}>
          <View className="w-full bg-card rounded-t-3xl px-4 pt-5 pb-8 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <View className="flex items-center justify-between mb-4">
              <Text className="text-2xl font-bold text-foreground">{editId ? '编辑地址' : '新增地址'}</Text>
              <View onClick={() => setShowForm(false)}>
                <Icon name="close" size={24} className="text-muted-foreground" />
              </View>
            </View>

            {[
              { label: '收货人*', key: 'name', placeholder: '请输入姓名' },
              { label: '手机号*', key: 'phone', placeholder: '请输入11位手机号' },
              { label: '省份', key: 'province', placeholder: '如：广东省' },
              { label: '城市', key: 'city', placeholder: '如：广州市' },
              { label: '区/县', key: 'district', placeholder: '如：天河区' },
              { label: '详细地址*', key: 'detail', placeholder: '街道、门牌号等' },
            ].map(f => (
              <View key={f.key} className="mb-3">
                <Text className="text-xl text-foreground mb-1">{f.label}</Text>
                <View className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                  <Input className="w-full text-xl text-foreground bg-transparent outline-none"
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onInput={e => { const ev = e as any; setField(f.key as keyof AddrForm, ev.detail?.value ?? ev.target?.value ?? '') }} />
                </View>
              </View>
            ))}

            <View className="flex items-center justify-between mb-4">
              <Text className="text-xl text-foreground">设为默认地址</Text>
              <View
                className={`w-12 h-7 rounded-full flex items-center transition ${form.is_default ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}
                style={{ padding: '2px' }}
                onClick={() => setField('is_default', !form.is_default)}>
                <View className="w-6 h-6 rounded-full bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </View>
            </View>

            <View
              className={`w-full flex items-center justify-center leading-none rounded-2xl ${saving ? 'bg-primary/50' : 'bg-primary'}`}
              onClick={handleSave}>
              <View className="py-4 text-xl font-bold text-white">{saving ? '保存中…' : '保存地址'}</View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

export default withRouteGuard(AddressPage)
