# -*- coding: utf-8 -*-
"""
把候选图拼成总览图（contact sheet），一次目视挑完全部候选，避免逐张读图烧上下文。
每行 = 一款商品（4 张候选），左上标注 <sku>_<n>，便于回查。

用法：
  python src/scripts/make_contact_sheet.py --rows 1-10 --out sheet1.jpg
  python src/scripts/make_contact_sheet.py --rows 11-19 --out sheet2.jpg
"""
import argparse
import io
import os
import re

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAND = os.path.join(ROOT, 'product-images', 'official', 'cand')
OUT = os.path.join(ROOT, 'product-images', 'official')
FONT = 'C:/Windows/Fonts/msyh.ttc'
CELL = 210
LABEL = 26


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rows', default='1-19')
    ap.add_argument('--out', default='sheet.jpg')
    args = ap.parse_args()

    a, b = args.rows.split('-')
    skus = ['OS%02d' % i for i in range(int(a), int(b) + 1)]
    files = sorted(os.listdir(CAND))
    grid = {}
    for f in files:
        m = re.match(r'(OS\d+)_(\d)\.jpg$', f)
        if m:
            grid.setdefault(m.group(1), []).append((int(m.group(2)), f))
    for k in grid:
        grid[k].sort()

    font = ImageFont.truetype(FONT, 20)
    rows = [s for s in skus if s in grid]
    W = CELL * 4 + 20
    H = (CELL + LABEL) * len(rows) + 20
    sheet = Image.new('RGB', (W, H), (245, 245, 245))
    d = ImageDraw.Draw(sheet)
    y = 10
    for sku in rows:
        d.text((10, y + 3), sku, font=font, fill=(20, 20, 20))
        x = 10
        for n, f in grid[sku]:
            im = Image.open(os.path.join(CAND, f)).convert('RGB')
            im.thumbnail((CELL - 10, CELL - 10), Image.LANCZOS)
            box = Image.new('RGB', (CELL - 6, CELL - 6), (255, 255, 255))
            box.paste(im, ((CELL - 6 - im.width) // 2, (CELL - 6 - im.height) // 2))
            sheet.paste(box, (x, y + LABEL))
            d.text((x + 4, y + LABEL + CELL - 26), '%s_%d' % (sku, n), font=font, fill=(200, 40, 40))
            x += CELL
        y += CELL + LABEL
    out = os.path.join(OUT, args.out)
    sheet.save(out, 'JPEG', quality=85)
    print('总览图：%s  (%dx%d)  含 %d 款' % (out, W, H, len(rows)))


if __name__ == '__main__':
    main()
