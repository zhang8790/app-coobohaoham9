import sys
raw = open('dist/pages/content/content-center/make/index.js', encoding='utf-8').read()
try:
    dec = raw.encode('utf-8').decode('unicode_escape')
except Exception:
    dec = raw
checks = {
    '新提示-手动粘贴原文': '该链接暂不支持自动提取，请手动粘贴原文',
    '阈值分支-length>=20': 'length >= 20',
    'import入口-article-fetch': 'article-fetch',
    '旧文案已移除': '已自动填充模板，请补充内容',
}
for k, v in checks.items():
    if k.startswith('旧文案'):
        print(('OK   ' if v not in dec else 'MISS ') + k)
    else:
        print(('OK   ' if v in dec else 'MISS ') + k)
