// 生成条形码（独立板块）：先出码打空白标签，再去「扫码上架」建商品
import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'
import { allocStoreBarcode, callPrintBarcode, listStoreBarcodes, type StoreBarcodeRow } from '@/db/api'
import { encodeEAN13 } from '@/utils/barcode'
import type { Store } from '@/db/types'

// 屏幕预览 EAN-13 条码（纯 CSS 条，人眼可辨 + 数字可读；真实扫码靠打印纸）
export function EAN13Preview({ code }: { code: string }) {
  const enc = encodeEAN13(code)
  if (!enc) {
    return <Text style={{ fontSize: '24rpx', color: '#DC2626' }}>条码格式无效（须为 13 位 EAN-13）</Text>
  }
  return (
    <View style={{ background: '#fff', border: '1px solid #EEE', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '2px' }}>
      <View style={{ display: 'flex', flexDirection: 'row', height: '54px', width: '100%', justifyContent: 'center' }}>
        {enc.modules.split('').map((m, i) => (
          <View key={i} style={{ width: '2px', height: '100%', backgroundColor: m === '1' ? '#000' : '#fff' }} />
        ))}
      </View>
      <Text style={{ fontSize: '26rpx', letterSpacing: '2px', marginTop: '6px', color: '#333' }}>{code}</Text>
    </View>
  )
}

export default function BarcodeTools({ store }: { store: Store | null }) {
  // 本次会话刚生成的店内码（尚未建商品，可补打空白标签）
  const [genCodes, setGenCodes] = useState<string[]>([])
  // 服务端台账：出码即留痕，刷新不丢、可查可补打（迁移 20260926_store_barcodes_ledger.sql）
  const [ledger, setLedger] = useState<StoreBarcodeRow[]>([])
  const [genLoading, setGenLoading] = useState(false)

  const loadLedger = useCallback(async () => {
    if (!store) return
    const rows = await listStoreBarcodes(store.id, 30)
    setLedger(rows)
  }, [store])

  useEffect(() => {
    loadLedger()
  }, [loadLedger])

  // 会话码与台账合并去重（会话码在前，保证刚生成的排最上）
  const merged: { code: string; status: 'pending' | 'bound' }[] = (() => {
    const seen = new Set<string>()
    const out: { code: string; status: 'pending' | 'bound' }[] = []
    for (const c of genCodes) {
      if (!seen.has(c)) { seen.add(c); out.push({ code: c, status: 'pending' }) }
    }
    for (const r of ledger) {
      if (!seen.has(r.barcode)) { seen.add(r.barcode); out.push({ code: r.barcode, status: r.status }) }
    }
    return out
  })()

  // 生成条形码（独立板块）：仅原子出码，不建商品；出码后可打印空白标签贴商品，
  // 再用上方「扫码上架」扫此码即可建档上架（两步分离：先生成、后扫码）。
  const genBarcode = async () => {
    if (!store) { Taro.showToast({ title: '请先进入门店', icon: 'none' }); return }
    setGenLoading(true)
    try {
      const code = await allocStoreBarcode(store.id)
      if (!code) {
        Taro.showToast({ title: '生成失败，请检查门店条码前缀', icon: 'none' })
        return
      }
      setGenCodes(g => [code, ...g].slice(0, 30))
      // 出码成功即刷新台账，让码立刻可查可补打（即便本页刷新也不丢）
      loadLedger()
      Taro.showToast({ title: '已生成店内码', icon: 'success' })
    } finally {
      setGenLoading(false)
    }
  }

  // 打印空白店内码标签（裸码，无商品名/价格，待上架）
  // 失败时给出可执行的判定，而不是一句「打印失败」：
  //   need_config → 门店没配打印机；其余 → 直出服务端返回的真实原因
  const printBare = async (code: string) => {
    if (!store) return
    Taro.showLoading({ title: '推送打印…' })
    try {
      const r = await callPrintBarcode({ storeId: store.id, barcode: code })
      if (r.need_config) Taro.showModal({ title: '未配置打印机', content: '请先在门店设置配置云打印机后再打印标签。', showCancel: false })
      else if (r.success) Taro.showToast({ title: '空白标签已推送打印', icon: 'success' })
      else Taro.showModal({ title: '打印失败', content: r.error || '未知错误，请检查打印机是否在线', showCancel: false })
    } catch (e: any) {
      Taro.showModal({ title: '打印失败', content: e?.message || '网络异常，请重试', showCancel: false })
    } finally {
      Taro.hideLoading()
    }
  }

  // 测试打印：出一张示例标签，用来区分「打印机没配好」还是「这个码有问题」
  const printTest = async () => {
    if (!store) return
    Taro.showLoading({ title: '测试打印…' })
    try {
      const r = await callPrintBarcode({ storeId: store.id, test: true })
      if (r.need_config) Taro.showModal({ title: '未配置打印机', content: '该门店尚未配置已启用的云打印机，请先到「设置—小票打印」配置。', showCancel: false })
      else if (r.success) Taro.showToast({ title: '测试标签已推送，请查看打印机', icon: 'success' })
      else Taro.showModal({ title: '测试打印失败', content: r.error || '未知错误', showCancel: false })
    } catch (e: any) {
      Taro.showModal({ title: '测试打印失败', content: e?.message || '网络异常', showCancel: false })
    } finally {
      Taro.hideLoading()
    }
  }

  return (
    <View style={{ padding: '10px 14px 0' }}>
      <View style={{ background: '#2A2A2A', borderRadius: '16px', padding: '16px', boxShadow: '0 4px 16px rgba(42,42,42,0.18)' }}>
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="qrcode-scan" size={16} className="text-white" />
            <Text style={{ color: '#FFF', fontSize: '32rpx', fontWeight: 'bold' }}>生成条形码（店内码）</Text>
          </View>
          <Text style={{ color: '#15803D', fontSize: '22rpx', fontWeight: 'bold', borderWidth: '1px', borderStyle: 'solid', borderColor: '#15803D', borderRadius: '6px', padding: '2px 6px' }}>独立板块</Text>
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: '24rpx', marginTop: '6px', lineHeight: '18px' }}>为无原厂码商品生成合法 EAN-13 店内码，打印空白标签贴商品；再去上方「扫码上架」扫此码即可建档上架。</Text>
        <View
          onClick={genBarcode}
          style={{ marginTop: '12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', borderRadius: '12px', background: genLoading ? '#3F3A34' : 'linear-gradient(135deg,hsl(var(--primary)) 0%,hsl(var(--primary-deep)) 100%)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {genLoading ? null : <Icon name="qrcode-scan" size={14} className="text-white" />}
            <Text style={{ color: '#FFF', fontSize: '28rpx', fontWeight: 'bold' }}>{genLoading ? '生成中…' : '生成新店内码'}</Text>
          </View>
        </View>

        {merged.length > 0 ? (
          <View style={{ marginTop: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px' }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: '24rpx' }}>最新店内码</Text>
            <Text style={{ color: '#15803D', fontSize: '44rpx', fontWeight: 'bold', letterSpacing: '2px', fontFamily: 'monospace' }}>{merged[0].code}</Text>
            <View
              onClick={() => printBare(merged[0].code)}
              style={{ marginTop: '10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', borderRadius: '10px', background: '#FF8C42' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="tag-multiple" size={14} className="text-white" />
                <Text style={{ color: '#FFF', fontSize: '26rpx', fontWeight: '600' }}>打印空白标签</Text>
              </View>
            </View>
            <View
              onClick={printTest}
              style={{ marginTop: '8px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.12)' }}>
              <Text style={{ color: '#FFF', fontSize: '24rpx' }}>打不出？点这里测试打印机</Text>
            </View>
          </View>
        ) : null}

        {merged.length > 1 ? (
          <View style={{ marginTop: '10px' }}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: '22rpx' }}>历史店内码（点击补打）</Text>
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              {merged.slice(1).map((g) => (
                <View
                  key={g.code}
                  onClick={() => printBare(g.code)}
                  style={{ padding: '6px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.12)' }}>
                  <Text style={{ color: g.status === 'bound' ? 'rgba(255,255,255,0.5)' : '#FFF', fontSize: '24rpx', fontFamily: 'monospace' }}>{g.code}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: '20rpx', marginTop: '6px' }}>灰色 = 已绑定商品，无需再打空白标签</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
