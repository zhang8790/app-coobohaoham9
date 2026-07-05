// @title 城市选择
import { useState, useEffect, useCallback } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Input, Text } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import { getCityList, getUserLocation, matchCityByLocation, saveUserFrequentAddress, getUserFrequentAddresses } from '@/utils/lbs-service'
import { useLocation } from '@/contexts/LocationContext'

function CitySelectPage() {
  const { currentCity, setCity, detectLocation, loading: locationLoading } = useLocation()
  const [cities, setCities] = useState<any[]>([])
  const [filteredCities, setFilteredCities] = useState<any[]>([])
  const [keyword, setKeyword] = useState('')
  const [frequentAddresses, setFrequentAddresses] = useState<any>({})
  const [loading, setLoading] = useState(true)

  // 加载城市列表
  const loadCities = useCallback(async () => {
    setLoading(true)
    const list = await getCityList()
    setCities(list)
    setFilteredCities(list)

    // 加载常用地址
    const userInfo = Taro.getStorageSync('user_info')
    if (userInfo?.id) {
      const addrs = getUserFrequentAddresses(userInfo.id)
      setFrequentAddresses(addrs)
    }

    setLoading(false)
  }, [])

  useDidShow(() => {
    loadCities()
  })

  // 搜索过滤
  const handleSearch = (value: string) => {
    setKeyword(value)
    if (!value.trim()) {
      setFilteredCities(cities)
      return
    }
    const filtered = cities.filter(c =>
      c.city_name.includes(value) ||
      c.province?.includes(value)
    )
    setFilteredCities(filtered)
  }

  // 选择城市
  const handleSelectCity = (city: any) => {
    setCity(city)
    Taro.showToast({ title: `已切换到${city.city_name}`, icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 500)
  }

  // 快速切换到常用地址
  const handleQuickSwitch = (addressType: 'home' | 'company') => {
    const addr = frequentAddresses[addressType]
    if (!addr?.city_name) return
    const city = cities.find(c => c.city_name === addr.city_name)
    if (city) handleSelectCity(city)
  }

  if (loading) return (
    <RouteGuard>
      <View className="flex items-center justify-center min-h-screen bg-background">
        <View className="i-mdi-loading text-4xl text-primary animate-spin" />
      </View>
    </RouteGuard>
  )

  return (
    <RouteGuard>
      <View className="min-h-screen bg-background">
        {/* 搜索栏 */}
        <View className="sticky top-0 z-10 bg-background px-4 py-3" style={{ borderBottom: '1px solid #E7DDD0' }}>
          <View className="flex items-center gap-3">
            <View className="flex-1 border-2 border-input rounded-full px-4 py-2 bg-muted flex items-center gap-2">
              <View className="i-mdi-magnify text-xl text-muted-foreground" />
              <Input
                className="flex-1 text-xl text-foreground bg-transparent outline-none"
                placeholder="搜索城市..."
                value={keyword}
                onInput={(e: any) => handleSearch(e.detail?.value ?? '')}
              />
            </View>
          </View>
        </View>

        {/* 当前定位城市 */}
        {currentCity && (
          <View className="mx-4 mt-4 p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <Text className="text-base text-muted-foreground">当前定位城市</Text>
            <View className="flex items-center justify-between mt-2">
              <Text className="text-2xl font-bold text-foreground">{currentCity.city_name}</Text>
              <View className="flex items-center gap-2">
                <View
                  className="px-3 py-2 rounded-full bg-muted flex items-center gap-1"
                  onClick={async () => {
                    await detectLocation()
                    loadCities()
                  }}
                >
                  <View className="i-mdi-crosshairs-gps text-base text-primary" />
                  <Text className="text-base text-primary">重新定位</Text>
                </View>
                <View
                  className="px-4 py-2 rounded-full bg-primary text-white text-base font-bold"
                  onClick={() => handleSelectCity(currentCity)}
                >
                  选择此城市
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 常用地址快捷切换 */}
        {(frequentAddresses.home || frequentAddresses.company) && (
          <View className="mx-4 mt-4">
            <Text className="text-xl font-bold text-foreground mb-3 block">常用地址</Text>
            <View className="flex gap-3">
              {frequentAddresses.home && (
                <View
                  className="flex-1 p-3 rounded-xl bg-card border border-border flex items-center justify-center gap-2"
                  onClick={() => handleQuickSwitch('home')}
                >
                  <View className="i-mdi-home text-2xl text-primary" />
                  <Text className="text-base text-foreground">家</Text>
                </View>
              )}
              {frequentAddresses.company && (
                <View
                  className="flex-1 p-3 rounded-xl bg-card border border-border flex items-center justify-center gap-2"
                  onClick={() => handleQuickSwitch('company')}
                >
                  <View className="i-mdi-office-building text-2xl text-primary" />
                  <Text className="text-base text-foreground">公司</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 城市列表 */}
        <View className="mx-4 mt-4">
          <Text className="text-xl font-bold text-foreground mb-3 block">全部城市</Text>
          <View className="grid grid-cols-2 gap-3">
            {filteredCities.map(city => (
              <View
                key={city.id}
                className="p-4 rounded-xl bg-card border border-border flex items-center justify-between"
                onClick={() => handleSelectCity(city)}
              >
                <View>
                  <Text className="text-xl font-bold text-foreground">{city.city_name}</Text>
                  <Text className="text-base text-muted-foreground mt-1 block">{city.province || ''}</Text>
                </View>
                <View className="i-mdi-chevron-right text-xl text-muted-foreground" />
              </View>
            ))}
          </View>
        </View>

        {/* 空状态 */}
        {!filteredCities.length && (
          <View className="flex flex-col items-center justify-center py-16 gap-4">
            <View className="i-mdi-city-off text-6xl text-muted-foreground/30" />
            <Text className="text-xl text-muted-foreground">未找到匹配的城市</Text>
          </View>
        )}
      </View>
    </RouteGuard>
  )
}

export default CitySelectPage
