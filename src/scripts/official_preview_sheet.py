# -*- coding: utf-8 -*-
"""
成品验收总览：把 final/<SKU>.jpg 拼成带商品名的总览图，一张图核完全部主图。
用法：python src/scripts/official_preview_sheet.py
"""
import csv
import io
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = os.path.join(ROOT, 'product-images', 'official_seed.csv')
FINAL = os.path.join(ROOT, 'product-images', 'final')
OUT = os.path.join(ROOT, 'product-images', 'official', 'official-preview.jpg')
FONT = 'C:/Windows/Fonts/msyh.ttc'

CELL, PAD, LAB = 240, 14, 30


def main():
    rows = list(csv.DictReader(io.open(SEED, encoding='utf-8-sig')))
    cols = 5
    n = len(rows)
    rn = (n + cols - 1) // cols
    W = cols * CELL + PAD * 2
    H = rn * (CELL + LAB) + PAD * 2 + 56
    sheet = Image.new('RGB', (W, H), (247, 243, 233))
    d = ImageDraw.Draw(sheet)
    f_head = ImageFont.truetype(FONT, 30)
    f_lab = ImageFont.truetype(FONT, 19)
    d.text((PAD, 14), '来店有喜 · 官方店 商品主图（%d 款）' % n, font=f_head, fill=(42, 42, 42))

    y0 = 56 + PAD
    for i, r in enumerate(rows):
        p = os.path.join(FINAL, '%s.jpg' % r['sku'])
        if not os.path.exists(p):
            continue
        c, rw = i % cols, i // cols
        x = PAD + c * CELL
        y = y0 + rw * (CELL + LAB)
        im = Image.open(p).convert('RGB').resize((CELL - 16, CELL - 16), Image.LANCZOS)
        sheet.paste(im, (x + 8, y))
        d.rectangle([x + 8, y, x + CELL - 8, y + CELL - 16], outline=(226, 238, 226), width=2)
        d.text((x + 8, y + CELL - 12), '%s %s' % (r['sku'], r['name'][:11]), font=f_lab, fill=(64, 110, 78))
    sheet.save(OUT, 'JPEG', quality=88)
    print('总览：%s (%dx%d)' % (OUT, W, H))


if __name__ == '__main__':
    main()
