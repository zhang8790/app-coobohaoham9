# -*- coding: utf-8 -*-
"""
为官方店 19 款商品「全网搜图」：Bing 图片搜索 → 取原始图 URL → 下载候选图。

产物：product-images/official/cand/<sku>_<n>.jpg   （每款最多 4 张候选）
下一步由 pick_candidates.py 拼总览图人工/目视挑选，再裁切上传。

用法：
  python src/scripts/fetch_candidates.py                 # 全部
  python src/scripts/fetch_candidates.py --only OS07     # 只抓某款（逗号分隔）
  python src/scripts/fetch_candidates.py --per 6         # 每款候选数（默认 4）
"""
import argparse
import csv
import html
import io
import os
import re
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = os.path.join(ROOT, 'product-images', 'official_seed.csv')
CAND = os.path.join(ROOT, 'product-images', 'official', 'cand')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

# 商品名太泛或含 OCR 噪声时，用更精准的搜索词（决定成败，务必人工定）
SEARCH_OVERRIDE = {
    '平台精选水果拼盘': '水果拼盘 果切 盒装',
    '牛肉': '牛肉干 休闲零食 包装',
    '羊肉烩面': '羊肉烩面 方便速食 包装',
    '彝香麻辣': '麻辣味 休闲零食 包装',
    '山药薄片': '山药薄片 薯片 包装',
    '老卤小黑蛋': '卤蛋 休闲零食 包装',
    '老卤鸡脚筋': '泡椒鸡脚筋 零食 包装',
    '老味豆干': '豆干 休闲零食 包装',
    '糖水型黄桃罐头': '糖水黄桃罐头',
    '柠檬味脆笋鸭掌筋': '鸭掌 零食 包装',
    '爽露爽米酒': '爽露爽 米酒',
    '盛兴源花生系列': '花生 休闲零食 包装',
    '桑坡手工锅巴': '手工锅巴 零食 包装',
    '榴莲软心蛋卷': '榴莲蛋卷 零食 包装',
    '海盐芝士条蛋糕': '海盐芝士 蛋糕 条 包装',
    '燕麦咖啡味高纤夹心卷': '夹心卷 蛋卷 饼干 包装',
    '五香味鸭翅根': '鸭翅根 卤味 包装',
    '人参黄精复合压片糖果': '压片糖果 人参 包装',
    '东方树叶绿茶原味茶饮料': '东方树叶 绿茶 饮料',
}

MURL = re.compile(r'murl&quot;:&quot;(.*?)&quot;')


def search(q, per=4):
    url = 'https://cn.bing.com/images/search?q=' + urllib.parse.quote(q) + '&form=HDRSC2&first=1'
    rq = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(rq, timeout=30) as r:
        page = r.read().decode('utf-8', 'ignore')
    out, seen = [], set()
    for m in MURL.finditer(page):
        u = html.unescape(m.group(1))
        if u.startswith('http') and u not in seen:
            seen.add(u)
            out.append(u)
        if len(out) >= per * 3:      # 多取一些，下载失败可递补
            break
    return out


def download(u, dest, min_px=320):
    rq = urllib.request.Request(u, headers={'User-Agent': UA, 'Referer': 'https://cn.bing.com/'})
    with urllib.request.urlopen(rq, timeout=25) as r:
        data = r.read(8 * 1024 * 1024)
    if len(data) < 5 * 1024:
        return 'too_small'
    im = Image.open(io.BytesIO(data))
    im.load()
    w, h = im.size
    if max(w, h) < min_px:
        return 'too_small_px'
    im.convert('RGB').save(dest, 'JPEG', quality=92)
    return '%dx%d' % (w, h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--per', type=int, default=4)
    args = ap.parse_args()

    os.makedirs(CAND, exist_ok=True)
    rows = list(csv.DictReader(io.open(SEED, encoding='utf-8-sig')))
    only = [s.strip() for s in args.only.split(',') if s.strip()]

    total_ok = 0
    for r in rows:
        sku, name = r['sku'], r['name']
        if only and sku not in only:
            continue
        q = SEARCH_OVERRIDE.get(name, name)
        try:
            urls = search(q, args.per)
        except Exception as e:
            print('  ❌ %-4s 搜索失败 %s' % (sku, str(e)[:60]))
            continue
        got = []
        for u in urls:
            if len(got) >= args.per:
                break
            dest = os.path.join(CAND, '%s_%d.jpg' % (sku, len(got) + 1))
            try:
                info = download(u, dest)
                if info.startswith('too'):
                    continue
                got.append((dest, u, info))
            except Exception:
                continue
        total_ok += len(got)
        print('  %-4s %-22s q=%-24s 候选 %d' % (sku, name[:20], q[:22], len(got)))
        for d, u, info in got:
            print('        %s  %s  <- %s' % (info, os.path.basename(d), u[:70]))
    print('\n候选图合计：%d 张 → %s' % (total_ok, CAND))


if __name__ == '__main__':
    main()
