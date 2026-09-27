// 商品列表（搜索框 + 筛选 Tab + 列表行），中间操作区作为 children 透传，
// 以精确保留原 DOM 顺序：搜索 → 筛选 → children(新增/扫码/条码/批量) → 列表
import type { ReactNode } from 'react'
import { View, Text, Image, Input } from '@tarojs/components'
import Icon from '@/components/Icon'
import { calcMargin } from './types'
import type { Product, StoreCategory } from '@/db/types'

type Props = {
  products: Product[]
  filter: 'all' | 'online' | 'offline'
  setFilter: (f: 'all' | 'online' | 'offline') => void
  expiryMap: Record<string, string>
  categories: StoreCategory[]
  onEdit: (p: Product) => void
  onToggleActive: (p: Product) => void
  onDelete: (p: Product) => void
  onBatchIn: (p: Product) => void
  children?: ReactNode
}

export default function ProductList({
  products, filter, setFilter, expiryMap, categories,
  onEdit, onToggleActive, onDelete, onBatchIn, children,
}: Props) {
  const catNameOf = (id: string | null | undefined): string => {
    if (!id) return '未分类'
    const c = categories.find(x => x.id === id)
    return c ? c.name : '未分类'
  }

  return (
    <>
      {/* 搜索框 */}
      <View style={{ padding: '10px 14px 0' }}>
        <View style={{
          height: '40px', borderRadius: '12px',
          background: '#FAF6F1', border: '1px solid #E8DDD4',
          display: 'flex', alignItems: 'center', paddingHorizontal: '14px',
        }}>
          <Input
            style={{ width: '100%', fontSize: '28rpx', color: '#333' }}
            placeholder="搜索商品..."
            placeholderStyle="color:#BBB;font-size:14px" />
        </View>
      </View>

      {/* 筛选 Tab */}
      <View style={{
        display: 'flex', margin: '10px 14px', padding: '4px',
        background: '#F5F0EB', borderRadius: '14px',
      }}>
        {(['all', 'online', 'offline'] as const).map(key => (
          <View key={key}
            onClick={() => setFilter(key)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 0', borderRadius: '12px',
              background: filter === key ? '#FFF' : 'transparent',
            }}>
            <Text style={{
              fontSize: '28rpx', fontWeight: 'bold',
              color: filter === key ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            }}>{key === 'all' ? '全部' : key === 'online' ? '在售' : '下架'}</Text>
          </View>
        ))}
      </View>

      {children}

      {/* 商品列表 */}
      {products.length === 0 ? (
        <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0 20px', gap: '12px' }}>
          <Icon name="box" size={48} className="text-muted-foreground" />
          <Text style={{ fontSize: '28rpx', color: 'var(--muted-foreground)' }}>暂无商品，点击上方"新增商品"添加</Text>
        </View>
      ) : (
        products.map(p => {
          const margin = calcMargin(p.price, p.cost_price)
          return (
            <View key={p.id} style={{ margin: '10px 14px 0', borderRadius: '16px', background: '#FFF', border: '1px solid #F2F2F2', overflow: 'hidden' }}>
              <View style={{ display: 'flex', gap: '12px', padding: '12px' }}>
                <View style={{ width: '80px', height: '80px', borderRadius: '12px', background: '#F5F0EB', flexShrink: 0, overflow: 'hidden' }}>
                  {(p.main_image ?? p.image_url)
                    ? <Image src={p.main_image ?? p.image_url!} mode="aspectFill" style={{ width: '100%', height: '100%' }} />
                    : <View style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: '48rpx' }}></Text>
                    </View>}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Text style={{ fontSize: '30rpx', fontWeight: 'bold', color: '#333', flex: 1 }}>{p.name}</Text>
                    <View style={{
                      padding: '2px 8px', borderRadius: '10px',
                      background: p.is_active ? '#DCFCE7' : '#FBF7EF',
                    }}>
                      <Text style={{ fontSize: '22rpx', color: p.is_active ? '#15803D' : 'var(--muted-foreground)' }}>{p.is_active ? '在售' : '下架'}</Text>
                      {expiryMap[p.id] && (() => {
                        const s = expiryMap[p.id]
                        const m: Record<string, { c: string; t: string }> = { red: { c: '#DC2626', t: '紧急' }, orange: { c: '#B45309', t: '紧迫' }, amber: { c: '#B45309', t: '临期' } }
                        const info = m[s] || m.amber
                        return (
                          <View onClick={() => Taro.navigateTo({ url: '/pages/merchant/merchant-expiry/index' })}
                            style={{ padding: '2px 8px', borderRadius: 10, background: `${info.c}22`, borderWidth: 1, borderColor: info.c }}>
                            <Text style={{ fontSize: '22rpx', color: info.c, fontWeight: 'bold' }}>{info.t}</Text>
                          </View>
                        )
                      })()}
                    </View>
                  </View>
                  {p.category_id && (
                    <Text style={{ fontSize: '22rpx', color: 'hsl(var(--primary))', marginTop: '2px' }}> {catNameOf(p.category_id)}</Text>
                  )}
                  <Text style={{ fontSize: '36rpx', fontWeight: 'bold', color: 'hsl(var(--primary))', marginTop: '4px' }}>¥{p.price}</Text>
                  {p.original_price && <Text style={{ fontSize: '24rpx', color: '#BBB', textDecorationLine: 'line-through', marginLeft: '4px' }}>¥{p.original_price}</Text>}
                  {p.cost_price != null && (
                    <Text style={{ fontSize: '24rpx', color: '#AAA', marginTop: '2px' }}>成本 ¥{p.cost_price} · 毛利 {margin}</Text>
                  )}
                  {p.discount_rate != null && (
                    <Text style={{ fontSize: '24rpx', color: 'hsl(var(--primary))', marginTop: '2px' }}> 让利 {p.discount_rate}%</Text>
                  )}
                  <Text style={{ fontSize: '24rpx', color: '#AAA', marginTop: '2px' }}>库存：{p.stock}</Text>
                  {(p as any).sales_count != null && (
                    <Text style={{ fontSize: '24rpx', color: '#AAA', marginTop: '2px' }}>已售：{(p as any).sales_count}</Text>
                  )}
                </View>
              </View>
              {/* 操作栏 */}
              <View style={{
                display: 'flex', borderTop: '1px solid #F2F2F2',
              }}>
                <View
                  onClick={() => onEdit(p)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '26rpx', color: 'hsl(var(--primary))', fontWeight: '500' }}> 编辑</Text>
                </View>
                <View style={{ width: '1px', background: '#F2F2F2' }} />
                <View
                  onClick={() => onToggleActive(p)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '26rpx', color: '#666' }}>{p.is_active ? ' 下架' : ' 上架'}</Text>
                </View>
                <View style={{ width: '1px', background: '#F2F2F2' }} />
                <View
                  onClick={() => onDelete(p)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '26rpx', color: '#EF4444' }}> 删除</Text>
                </View>
                <View style={{ width: '1px', background: '#F2F2F2' }} />
                <View
                  onClick={() => onBatchIn(p)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <Text style={{ fontSize: '26rpx', color: 'hsl(var(--primary))' }}> 入库</Text>
                </View>
              </View>
            </View>
          )
        })
      )}
    </>
  )
}
