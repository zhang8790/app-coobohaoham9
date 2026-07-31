// @title 商品分类管理抽屉（商家端）— 从 merchant-products 主页面抽离
import { View, Text, Input } from '@tarojs/components'
import type { StoreCategory } from '@/db/types'

type Props = {
  visible: boolean
  categories: StoreCategory[]
  newCatName: string
  setNewCatName: (v: string) => void
  editingCatId: string | null
  setEditingCatId: (v: string | null) => void
  editingCatName: string
  setEditingCatName: (v: string) => void
  onClose: () => void
  onAddCategory: () => void
  onMoveCategory: (c: StoreCategory, dir: number) => void
  onSaveRename: (c: StoreCategory) => void
  onDeleteCategory: (c: StoreCategory) => void
}

export default function CategoryManager({
  visible, categories, newCatName, setNewCatName,
  editingCatId, setEditingCatId, editingCatName, setEditingCatName,
  onClose, onAddCategory, onMoveCategory, onSaveRename, onDeleteCategory,
}: Props) {
  if (!visible) return null
  return (
    <View
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <View
        style={{ marginTop: 'auto', width: '100%', background: '#FFF', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', paddingHorizontal: '20px', paddingTop: '20px', paddingBottom: '40px', maxHeight: '85vh', overflowY: 'scroll' }}
        onClick={(e: any) => e.stopPropagation()}>
        {/* 标题 */}
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <Text style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>管理商品分类</Text>
          <View onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '16px', background: '#F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: '18px', color: '#999' }}>✕</Text>
          </View>
        </View>

        {/* 新建分类 */}
        <View style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <Input
            value={newCatName}
            onInput={(e: any) => setNewCatName(e.detail?.value ?? '')}
            placeholder="输入新分类名称"
            style={{ flex: 1, height: '42px', borderRadius: '10px', background: '#FAFAFA', border: '1.5px solid #EEE', fontSize: '14px', padding: '0 12px', boxSizing: 'border-box' }} />
          <View onClick={onAddCategory} style={{ padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', background: 'linear-gradient(135deg, #C77B47, hsl(var(--primary)))' }}>
            <Text style={{ fontSize: '14px', color: '#FFF', fontWeight: 'bold' }}>新建</Text>
          </View>
        </View>

        {/* 分类列表（按 sort_order 排序） */}
        {categories.length === 0 && <Text style={{ fontSize: '13px', color: '#BBB' }}>还没有分类，先在上方新建一个吧</Text>}
        {[...categories].sort((a: StoreCategory, b: StoreCategory) => a.sort_order - b.sort_order).map((c: StoreCategory) => {
          const isGlobal = c.scope === 'global'
          return (
            <View key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', borderBottomWidth: '1px', borderBottomColor: '#F2F2F2', borderBottomStyle: 'solid' }}>
              {editingCatId === c.id ? (
                <Input
                  value={editingCatName}
                  focus
                  onInput={(e: any) => setEditingCatName(e.detail?.value ?? '')}
                  style={{ flex: 1, height: '38px', borderRadius: '8px', background: '#FAFAFA', border: '1px solid hsl(var(--primary))', fontSize: '14px', padding: '0 10px' }} />
              ) : (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: '6px' }} onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name) }}>
                  <Text style={{ fontSize: '15px', color: '#333' }}>{c.name}</Text>
                  {isGlobal && <Text style={{ fontSize: '11px', color: '#BBB' }}>🌐 平台</Text>}
                </View>
              )}
              {!isGlobal && (
                <View style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <View onClick={() => onMoveCategory(c, -1)} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '15px', color: '#888' }}>↑</Text></View>
                  <View onClick={() => onMoveCategory(c, 1)} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '15px', color: '#888' }}>↓</Text></View>
                  {editingCatId === c.id
                    ? <View onClick={() => onSaveRename(c)} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '13px', color: 'hsl(var(--primary))', fontWeight: 'bold' }}>✓</Text></View>
                    : <View onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name) }} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '13px', color: '#3B82F6' }}>改名</Text></View>}
                  <View onClick={() => onDeleteCategory(c)} style={{ padding: '4px 8px' }}><Text style={{ fontSize: '13px', color: '#EF4444' }}>删</Text></View>
                </View>
              )}
            </View>
          )
        })}
        <Text style={{ fontSize: '11px', color: '#BBB', marginTop: '12px', display: 'block' }}>🌐 平台分类由总部统一维护，店内不可修改；店内分类仅对本店商品生效。</Text>
      </View>
    </View>
  )
}
