// 生成条形码（独立板块）：先出码打空白标签，再去「扫码上架」建商品
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import Icon from '@/components/Icon'
import { allocStoreBarcode, callPrintBarcode } from '@/db/api'
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
  // 本次会话已生成的店内码（尚未建商品，可补打空白标签）
  const [genCodes, setGenCodes] = useState<{ code: string; ts: number }[]>([])
  const [genLoading, setGenLoading] = useState(false)

  // 生成条形码（独立板块）：仅原子出码，不建商品；出码后可打印空白标签贴商品，
  // 再用上方「扫码上架」扫此码即可建档上架（两步分离：先生成、后扫码）。
  const genBarcode = async () => {
    if (!store) { Taro.showToast({ title: '请先进入门店', icon: 'none' }); return }
    setGenLoading(true)
    try {
      const code = await allocStoreBarcode(store.id)
      if (!code) { Taro.showToast({ title: '生成失败', icon: 'none' }); return }
      setGenCodes(g => [{ code, ts: Date.now() }, ...g].slice(0, 30))
      Taro.showToast({ title: '已生成店内码', icon: 'success' })
    } finally {
      setGenLoading(false)
    }
  }

  // 打印空白店内码标签（裸码，无商品名/价格，待上架）
  const printBare = async (code: string) => {
    if (!store) return
    Taro.showLoading({ title: '推送打印…' })
    try {
      const r = await callPrintBarcode({ storeId: store.id, barcode: code })
      if (r.need_config) Taro.showModal({ title: '未配置打印机', content: '请先在门店设置配置云打印机后再打印标签。' })
      else if (r.success) Taro.showToast({ title: '空白标签已推送打印', icon: 'success' })
      else Taro.showToast({ title: r.error || '打印失败', icon: 'none' })
    } catch (e) {
      Taro.showToast({ title: '操作失败' })
    } finally {
      Taro.hideLoading()
    }
  }

  return (
    <View style={{ padding: '10px 14px 0' }}>
      <View style={{ background: '#0F172A', borderRadius: '16px', padding: '16px', boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
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
          style={{ marginTop: '12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', borderRadius: '12px', background: genLoading ? '#374151' : 'linear-gradient(135deg,#15803D,#059669)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {genLoading ? null : <Icon name="qrcode-scan" size={14} className="text-white" />}
            <Text style={{ color: '#FFF', fontSize: '28rpx', fontWeight: 'bold' }}>{genLoading ? '生成中…' : '生成新店内码'}</Text>
          </View>
        </View>
        {genCodes.length > 0 ? (
          <View style={{ marginTop: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px' }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: '24rpx' }}>最新店内码</Text>
            <Text style={{ color: '#15803D', fontSize: '44rpx', fontWeight: 'bold', letterSpacing: '2px', fontFamily: 'monospace' }}>{genCodes[0].code}</Text>
            <View
              onClick={() => printBare(genCodes[0].code)}
              style={{ marginTop: '10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', borderRadius: '10px', background: '#FF8C42' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="tag-multiple" size={14} className="text-white" />
                <Text style={{ color: '#FFF', fontSize: '26rpx', fontWeight: '600' }}>打印空白标签</Text>
              </View>
            </View>
          </View>
        ) : null}
        {genCodes.length > 1 ? (
          <View style={{ marginTop: '10px' }}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: '22rpx' }}>本次已生成（点击补打）</Text>
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              {genCodes.slice(1).map((g, i) => (
                <View
                  key={i}
                  onClick={() => printBare(g.code)}
                  style={{ padding: '6px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.12)' }}>
                  <Text style={{ color: '#FFF', fontSize: '24rpx', fontFamily: 'monospace' }}>{g.code}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  )
}
