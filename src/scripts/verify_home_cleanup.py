# 产物中文/转义校验：terser 会把非 ASCII 转成 \uXXXX，直接搜中文必然失配 —— 先反解再判断
import glob
import os
import re
import sys

def unesc(t: str) -> str:
    """把 terser 落盘的 \\uXXXX 反解回明文（仅非 ASCII 会被转义，空格/数字保持明文）"""
    # 必须用双反斜杠：re 会把单 \u 当作 Unicode 转义起点而报错
    return re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), t)


MUST_HAVE = ['我的段位', '食品管家', '浏览足迹', '食养中心', '帮助中心']
# 2026-10-01：'绑定手机号' / '输入邀请码绑定门店' 已按张林要求从「我的」页移除
# （「我的」页改为大厂式「我的服务」宫格）；功能仍在设置页 / 商家申请页保留，故不再作为本页断言。
# 仅针对首页信任行「已识别 10万+ 零食配料」；food-scan/login 里的「已识别」属正常文案，不可误伤
MUST_GONE = ['已识别 10万', '虚位以待']
ICONS = ['tune', 'truck']

dist_js = glob.glob('dist_new/**/*.js', recursive=True)
blob = {}
for p in dist_js:
    blob[os.path.relpath(p, 'dist_new')] = unesc(open(p, encoding='utf-8', errors='replace').read())

fail = 0
print('== 必须落盘的入口文案 ==')
for k in MUST_HAVE:
    where = [p for p, t in blob.items() if k in t]
    flag = 'OK  ' if where else 'MISS'
    if not where:
        fail += 1
    print(f'  {flag} {k} -> {where[:3]}')

print('== 首页必须已删除的内容 ==')
for k in MUST_GONE:
    where = [p for p, t in blob.items() if k in t]
    flag = 'OK  ' if not where else 'STILL-THERE'
    if where:
        fail += 1
    print(f'  {flag} {k} -> {where[:3]}')

print('== 新增图标白名单 ==')
for k in ICONS:
    where = [p for p, t in blob.items() if f'"{k}"' in t]
    flag = 'OK  ' if where else 'MISS'
    if not where:
        fail += 1
    print(f'  {flag} "{k}" -> {where[:2]}')

print('== 好物页分类字体类 ==')
css = open('dist_new/app.wxss', encoding='utf-8', errors='replace').read()
for k in ['.cat-name', '.cat-name-active', '.cat-eyebrow']:
    flag = 'OK  ' if k in css else 'MISS'
    if k not in css:
        fail += 1
    print(f'  {flag} {k} in app.wxss')

print('== 首页专属断言（pages/index/index.js） ==')
home_js = unesc(open('dist_new/pages/index/index.js', encoding='utf-8', errors='replace').read())
home_checks = [
    ('信任行已删(10万+)', '10万+' not in home_js),
    ('占位块已删(虚位以待)', '虚位以待' not in home_js),
    ('旧HomeAdSlot已移除', 'HomeAdSlot' not in home_js),
    # terser 会重命名 import 绑定，故用 HomeBanner 读取的配置键 home_ad_slots 作为接入证据
    ('新HomeBanner已接入(home_ad_slots)', 'home_ad_slots' in home_js),
    ('广告位外链webview分支', 'ext/webview' in home_js or 'webview' in home_js),
    # 2026-09-24：附近门店横滑条(StoreStrip)按张林要求整块移除，门店/城市切换统一收进左上角定位行
    ('附近门店块已删(StoreStrip)', '附近门店' not in home_js),
    ('左上角定位行保留(定位入口)', '定位中' in home_js),
]
for label, ok in home_checks:
    flag = 'OK  ' if ok else 'BAD'
    if not ok:
        fail += 1
    print(f'  {flag} {label}')

print('\nFAIL_COUNT =', fail)
sys.exit(1 if fail else 0)
