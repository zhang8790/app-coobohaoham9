# 一次性脚本：向 src/components/Icon/iconBase64.ts 追加两个手绘线性图标（tune 设置 / truck 待收货）
# 说明：原生成脚本 gen-icon-base64.py 已不在仓库，此处按现有 svg 规格（viewBox 0 0 64 64 / stroke-width 2.4）手工补齐。
import base64
import re

PATH = 'src/components/Icon/iconBase64.ts'

TEMPLATE = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" '
    'stroke="{color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">{body}</svg>'
)

# 设置（滑杆样式，比齿轮更轻、更贴合中性灰线性风格）
TUNE_BODY = (
    '<line x1="8" y1="20" x2="18" y2="20"/><circle cx="24" cy="20" r="6"/>'
    '<line x1="30" y1="20" x2="56" y2="20"/>'
    '<line x1="8" y1="44" x2="34" y2="44"/><circle cx="40" cy="44" r="6"/>'
    '<line x1="46" y1="44" x2="56" y2="44"/>'
)

# 货车（订单「待收货」）
TRUCK_BODY = (
    '<rect x="6" y="16" width="30" height="22" rx="2"/>'
    '<path d="M36 24h10l8 8v6H36z"/>'
    '<circle cx="18" cy="43" r="5"/><circle cx="46" cy="43" r="5"/>'
)

NEW_ICONS = {'tune': TUNE_BODY, 'truck': TRUCK_BODY}
COLORS = {'ICON_INK': '#333333', 'ICON_PRIMARY': '#333333', 'ICON_WHITE': '#FFFFFF'}


def encode(body: str, color: str) -> str:
    svg = TEMPLATE.format(color=color, body=body)
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode('utf-8')).decode('ascii')


def main() -> None:
    with open(PATH, encoding='utf-8') as fh:
        lines = fh.readlines()

    out = []
    for line in lines:
        out.append(line)
        m = re.match(r'^export const (ICON_INK|ICON_PRIMARY|ICON_WHITE):', line)
        if not m:
            continue
        name = m.group(1)
        color = COLORS[name]
        for icon_name, body in NEW_ICONS.items():
            out.append(f'  "{icon_name}": "{encode(body, color)}",\n')

    with open(PATH, 'w', encoding='utf-8', newline='\n') as fh:
        fh.writelines(out)
    print('done, inserted', len(NEW_ICONS), 'icons x', len(COLORS), 'palettes')


if __name__ == '__main__':
    main()
