# 生成 src/components/brandIcons.ts —— 品牌专属线性图标（鼠尾草绿描边）
# 微信不支持内联 SVG，统一用 data-uri <Image> 渲染（与 iconBase64 同一约定）。
# 用法：python gen-brand-icons.py  （在 src/components/ 目录执行）
import base64, os

C = '#5E7A4F'  # 品牌鼠尾草绿（对齐 home-ui-replica 场景图标 green-mid）

def svg(paths, sw=1.8):
    inner = ''.join(f'<path d="{d}"/>' for d in paths)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
            f'stroke="{C}" stroke-width="{sw}" stroke-linecap="round" '
            f'stroke-linejoin="round">{inner}</svg>')

ICONS = {
    # 八大场景（home-ui-replica 同款路径）
    '宝宝零食': ['M9 4h6v3l-1.5 2v3a4 4 0 0 1-3 3.8V19h3', 'M10 19v1.5a2 2 0 0 0 4 0V19'],
    '孕产营养': ['M4 11h16a8 8 0 0 1-16 0Z', 'M7 11a5 5 0 0 0 10 0', 'M12 11v6',
                 'M9 6c0-1 1.5-1.5 3-1.5S15 5 15 6'],
    '老年养生': ['M12 21c0-7 4-11 8-12-1 8-4 12-8 12Z', 'M12 21C9 15 6 12 3 11c2 6 5 9 9 10Z'],
    '舒心食养': ['M5 11l7-6 7 6v8a1 1 0 0 1-1 1h-4v-5h-4v5H6a1 1 0 0 1-1-1Z', 'M11 13h2'],
    '肠胃食养': ['M5 9h14v4a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6Z', 'M9 9V7a3 3 0 0 1 6 0v2'],
    '温润食养': ['M12 4v3', 'M12 17v3', 'M4 12h3', 'M17 12h3', 'M6.5 6.5l2 2', 'M15.5 15.5l2 2',
                 'M17.5 6.5l-2 2', 'M8.5 15.5l-2 2', 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'],
    '敏感防护': ['M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6Z', 'M9 12l2 2 4-4'],
    '熬夜加餐': ['M5 9h14a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v0a3 3 0 0 1 3-3Z',
                 'M7 6h10v3a5 5 0 0 1-10 0Z', 'M9 15h6'],
    # 搜索条
    'search': ['M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-4.35 -4.35'],
    'scan': ['M4 8V5a1 1 0 0 1 1-1h3', 'M20 8V5a1 1 0 0 0-1-1h-3', 'M4 16v3a1 1 0 0 0 1 1h3',
             'M20 16v3a1 1 0 0 1-1 1h-3', 'M4 12h16'],
    # 工具 / 通用
    'map-pin': ['M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z',
                'M12 10m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0'],
    'truck': ['M3 7h11v8H3z', 'M14 10h4l3 3v2h-7z',
              'M7 17m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0',
              'M17 17m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0'],
    'leaf': ['M5 19c0-8 6-13 14-13 0 8-5 14-14 14Z', 'M9 15c2-3 5-5 8-6'],
}

uri = {k: 'data:image/svg+xml;base64,' + base64.b64encode(svg(v).encode()).decode() for k, v in ICONS.items()}

L = [
    '// @title 品牌专属线性图标（鼠尾草绿描边，对齐 home-ui-replica 场景图标）',
    '// 微信不支持内联 SVG，统一用 data-uri <Image> 渲染（与 iconBase64 同一约定）。',
    '// 由 src/components/gen-brand-icons.py 生成（改图形后重跑）。',
    'export const BRAND_LINE_ICONS: Record<string, string> = {',
]
for k in ICONS:
    L.append(f"  {k!r}: {uri[k]!r},")
L.append('}')
L.append('')
L.append('export const SCENE_ICON: Record<string, string> = {')
for k in ['宝宝零食', '孕产营养', '老年养生', '舒心食养', '肠胃食养', '温润食养', '敏感防护', '熬夜加餐']:
    L.append(f"  {k!r}: BRAND_LINE_ICONS[{k!r}],")
L.append('}')
L.append('')

out = os.path.join(os.path.dirname(__file__), 'brandIcons.ts')
open(out, 'w', encoding='utf-8').write('\n'.join(L))
print('written', out, '(%d icons)' % len(ICONS))
