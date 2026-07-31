// @title 城市选择
import { useState, useCallback, useMemo } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Input, Text, ScrollView } from '@tarojs/components'
import { RouteGuard } from '@/components/RouteGuard'
import { getCityList, getUserFrequentAddresses } from '@/utils/lbs-service'
import type { CityInfo } from '@/utils/lbs-service'
import { useLocation } from '@/contexts/LocationContext'
import Icon from '@/components/Icon'

/**
 * 城市选择页
 *
 * 城市库从 5 条补全到 250 条（迁移 00226）后，原来的两列平铺已无法浏览。
 * 这里重做为「定位卡 + 热门宫格 + A-Z 分组 + 右侧字母索引 + 拼音搜索」，
 * 并在选中城市后同步重算该城市的最近门店（selectCity），保证城市/门店/商品链路一致。
 *
 * 兼容性：若 00226 迁移尚未执行（pinyin/initial/is_hot 缺失），
 * 热门区自动隐藏、全部城市归入「#」分组，页面仍可正常使用，不会白屏。
 */
function CitySelectPage() {
  const { currentCity, selectCity, detectLocation, loading: locationLoading } = useLocation()
  const [cities, setCities] = useState<CityInfo[]>([])
  const [keyword, setKeyword] = useState('')
  const [frequentAddresses, setFrequentAddresses] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [anchor, setAnchor] = useState('')
  const [activeLetter, setActiveLetter] = useState('')

  const loadCities = useCallback(async () => {
    setLoading(true)
    const list = await getCityList()
    setCities(list)

    const userInfo = Taro.getStorageSync('user_info')
    if (userInfo?.id) setFrequentAddresses(getUserFrequentAddresses(userInfo.id))

    setLoading(false)
  }, [])

  useDidShow(() => {
    loadCities()
  })

  // 搜索：支持中文名 / 省份 / 全拼 / 首字母
  const searchResult = useMemo(() => {
    const kw = keyword.trim()
    if (!kw) return null
    const lower = kw.toLowerCase()
    return cities.filter(
      (c) =>
        c.city_name?.includes(kw) ||
        c.province?.includes(kw) ||
        (c.pinyin || '').includes(lower) ||
        (c.initial || '').toLowerCase().startsWith(lower),
    )
  }, [keyword, cities])

  // 热门城市（按 sort_order）
  const hotCities = useMemo(
    () => cities.filter((c) => c.is_hot).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)),
    [cities],
  )

  // A-Z 分组
  const { grouped, letters } = useMemo(() => {
    const map: Record<string, CityInfo[]> = {}
    for (const c of cities) {
      const k = (c.initial || '#').toUpperCase()
      if (!map[k]) map[k] = []
      map[k].push(c)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.pinyin || a.city_name || '').localeCompare(b.pinyin || b.city_name || ''))
    }
    return { grouped: map, letters: Object.keys(map).sort() }
  }, [cities])

  const handleSelectCity = useCallback(
    async (city: CityInfo) => {
      Taro.showLoading({ title: '切换中', mask: true })
      try {
        await selectCity(city)
        Taro.hideLoading()
        Taro.showToast({ title: `已切换到${city.city_name}`, icon: 'success' })
        setTimeout(() => Taro.navigateBack(), 500)
      } catch {
        Taro.hideLoading()
        Taro.showToast({ title: '切换失败，请重试', icon: 'none' })
      }
    },
    [selectCity],
  )

  const handleQuickSwitch = (addressType: 'home' | 'company') => {
    const addr = frequentAddresses[addressType]
    if (!addr?.city_name) return
    const city = cities.find((c) => c.city_name === addr.city_name)
    if (city) handleSelectCity(city)
  }

  // 点击右侧索引条跳转到对应字母分组（同字母重复点击需先清空 anchor 才会再次触发滚动）
  const jumpTo = (letter: string) => {
    setActiveLetter(letter)
    setAnchor('')
    setTimeout(() => setAnchor(`grp-${letter}`), 0)
    try { Taro.vibrateShort({ type: 'light' }) } catch { /* 部分机型不支持，忽略 */ }
  }

  if (loading) {
    return (
      <RouteGuard>
        <View className="flex items-center justify-center min-h-screen bg-background">
          <Icon name="loading" size={36} className="text-primary animate-spin" />
        </View>
      </RouteGuard>
    )
  }

  return (
    <RouteGuard>
      <View className="bg-background flex flex-col" style={{ height: '100vh' }}>
        {/* 搜索栏 */}
        <View className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #E7DDD0' }}>
          <View className="border-2 border-input rounded-full px-4 py-2 bg-muted flex items-center gap-2">
            <Icon name="magnify" size={20} className="text-muted-foreground" />
            <Input
              className="flex-1 text-xl text-foreground bg-transparent outline-none"
              placeholder="城市名 / 拼音 / 首字母，如 hz、杭州"
              value={keyword}
              onInput={(e: any) => setKeyword(e.detail?.value ?? '')} />
            {!!keyword && (
              <View onClick={() => setKeyword('')} hoverClass="none">
                <Icon name="close-circle" size={18} className="text-muted-foreground" />
              </View>
            )}
          </View>
        </View>

        <View className="flex-1 relative" style={{ overflow: 'hidden' }}>
          <ScrollView
            scrollY
            scrollWithAnimation
            scrollIntoView={anchor}
            style={{ height: '100%' }}
          >
            {/* ===== 搜索结果 ===== */}
            {searchResult !== null ? (
              <View className="px-4 py-4">
                <Text className="text-base text-muted-foreground mb-3 block">
                  找到 {searchResult.length} 个城市
                </Text>
                {searchResult.map((city) => (
                  <View
                    key={city.city_code || city.city_name}
                    className="p-4 mb-2 rounded-xl bg-card border border-border flex items-center justify-between active:scale-[0.98] transition-transform"
                    hoverClass="none"
                    onClick={() => handleSelectCity(city)}
                  >
                    <View>
                      <Text className="text-xl font-bold text-foreground">{city.city_name}</Text>
                      <Text className="text-sm text-muted-foreground mt-1 block">{city.province || ''}</Text>
                    </View>
                    <Icon name="chevron-right" size={20} className="text-muted-foreground" />
                  </View>
                ))}
                {!searchResult.length && (
                  <View className="flex flex-col items-center justify-center py-16 gap-4">
                    <Icon name="city-off" size={60} className="text-muted-foreground/30" />
                    <Text className="text-xl text-muted-foreground">未找到匹配的城市</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="pb-8">
                {/* ===== 当前定位城市 ===== */}
                {currentCity && (
                  <View className="mx-4 mt-4 p-4 rounded-2xl bg-primary/10 border border-primary/20">
                    <Text className="text-base text-muted-foreground">当前定位城市</Text>
                    <View className="flex items-center justify-between mt-2">
                      <View className="flex items-center gap-2">
                        <Icon name="crosshairs-gps" size={22} className="text-primary" />
                        <Text className="text-2xl font-bold text-foreground">{currentCity.city_name}</Text>
                      </View>
                      <View className="flex items-center gap-2">
                        <View
                          className="px-3 py-2 rounded-full bg-muted flex items-center gap-1 active:scale-95 transition-transform"
                          hoverClass="none"
                          onClick={async () => {
                            await detectLocation()
                            loadCities()
                          }}
                        >
                          {locationLoading
                            ? <Icon name="loading" size={16} className="text-primary animate-spin" />
                            : <Icon name="crosshairs-gps" size={16} className="text-primary" />}
                          <Text className="text-base text-primary">重新定位</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                {/* ===== 常用地址 ===== */}
                {(frequentAddresses.home || frequentAddresses.company) && (
                  <View className="mx-4 mt-4">
                    <Text className="text-xl font-bold text-foreground mb-3 block">常用地址</Text>
                    <View className="flex gap-3">
                      {frequentAddresses.home && (
                        <View
                          className="flex-1 p-3 rounded-xl bg-card border border-border flex items-center justify-center gap-2"
                          hoverClass="none"
                          onClick={() => handleQuickSwitch('home')}
                        >
                          <Icon name="home" size={24} className="text-primary" />
                          <Text className="text-base text-foreground">家</Text>
                        </View>
                      )}
                      {frequentAddresses.company && (
                        <View
                          className="flex-1 p-3 rounded-xl bg-card border border-border flex items-center justify-center gap-2"
                          hoverClass="none"
                          onClick={() => handleQuickSwitch('company')}
                        >
                          <Icon name="office-building" size={24} className="text-primary" />
                          <Text className="text-base text-foreground">公司</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* ===== 热门城市 ===== */}
                {hotCities.length > 0 && (
                  <View className="mx-4 mt-5">
                    <View className="flex items-center gap-2 mb-3">
                      <Text className="text-xl font-bold text-foreground">🔥 热门城市</Text>
                    </View>
                    <View className="flex flex-wrap" style={{ gap: '10px' }}>
                      {hotCities.map((city) => {
                        const active = currentCity?.city_name === city.city_name
                        return (
                          <View
                            key={city.city_code || city.city_name}
                            className={`px-4 py-2 rounded-xl border text-center active:scale-95 transition-transform ${
                              active
                                ? 'bg-primary border-primary'
                                : 'bg-card border-border'
                            }`}
                            style={{ width: 'calc(25% - 8px)' }}
                            hoverClass="none"
                            onClick={() => handleSelectCity(city)}
                          >
                            <Text
                              className={`text-base font-semibold ${active ? 'text-white' : 'text-foreground'}`}
                            >
                              {city.city_name}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  </View>
                )}

                {/* ===== A-Z 分组 ===== */}
                <View className="mt-5">
                  <Text className="text-xl font-bold text-foreground mx-4 mb-2 block">
                    全部城市（{cities.length}）
                  </Text>
                  {letters.map((letter) => (
                    <View key={letter} id={`grp-${letter}`}>
                      <View className="px-4 py-1.5 bg-muted">
                        <Text className="text-sm font-bold text-muted-foreground">{letter}</Text>
                      </View>
                      {grouped[letter].map((city) => {
                        const active = currentCity?.city_name === city.city_name
                        return (
                          <View
                            key={city.city_code || city.city_name}
                            className="px-4 py-3 flex items-center justify-between active:bg-muted/50"
                            style={{ borderBottom: '1px solid #F2EBE1' }}
                            hoverClass="none"
                            onClick={() => handleSelectCity(city)}
                          >
                            <View className="flex items-center gap-2">
                              <Text className={`text-lg ${active ? 'text-primary font-bold' : 'text-foreground'}`}>
                                {city.city_name}
                              </Text>
                              <Text className="text-xs text-muted-foreground">{city.province || ''}</Text>
                            </View>
                            {active
                              ? <Icon name="check-circle" size={18} className="text-primary" />
                              : <Icon name="chevron-right" size={18} className="text-muted-foreground/50" />}
                          </View>
                        )
                      })}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* ===== 右侧字母索引条（搜索态隐藏） ===== */}
          {searchResult === null && letters.length > 1 && (
            <View
              className="absolute flex flex-col items-center justify-center"
              style={{ right: '2px', top: '50%', transform: 'translateY(-50%)', zIndex: 20 }}
            >
              {letters.map((letter) => (
                <View
                  key={letter}
                  className="flex items-center justify-center"
                  style={{ width: '22px', height: '20px' }}
                  hoverClass="none"
                  onClick={() => jumpTo(letter)}
                >
                  <Text
                    className={`text-[11px] font-bold ${
                      activeLetter === letter ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {letter}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </RouteGuard>
  )
}

export default CitySelectPage
