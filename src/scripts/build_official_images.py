# -*- coding: utf-8 -*-
"""
官方店 19 款商品出图：
  ① 主图  product-images/final/<SKU>.jpg     900x900 居中裁切（短边定方，避免拉伸）
  ② 长图  product-images/detail/<SKU>.jpg    750 宽（直接 JPEG q88 上传，省体积）

挑选结果写死在下表 PICK（由总览图目视确定），保证可复现。
品牌调性：米白宣纸底 + 鼠尾草绿 + 暖杏；文案只讲配料/规格/储存，不做功效表述，不出现「AI」。
保质期：OCR 文本能抽到的用真实值，其余按品类默认（占位，需按实物标签替换）。

用法：python src/scripts/build_official_images.py
"""
import csv
import io
import os
import re

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = os.path.join(ROOT, 'product-images', 'official_seed.csv')
CAND = os.path.join(ROOT, 'product-images', 'official', 'cand')
FINAL = os.path.join(ROOT, 'product-images', 'final')
DETAIL = os.path.join(ROOT, 'product-images', 'detail')
FONT_REG = 'C:/Windows/Fonts/msyh.ttc'
FONT_BOLD = 'C:/Windows/Fonts/msyhbd.ttc'

BG = (247, 243, 233)
GREEN = (100, 143, 108)
GREEN_DEEP = (64, 110, 78)
GREEN_SOFT = (226, 238, 226)
SAND = (217, 169, 120)
TXT = (42, 42, 42)
TXT_MUTED = (122, 122, 122)

# ── 目视挑选结果（sku → 候选序号）──
PICK = {
    'OS01': 1, 'OS02': 2, 'OS03': 3, 'OS04': 1, 'OS05': 1, 'OS06': 4, 'OS07': 1,
    'OS08': 3, 'OS09': 1, 'OS10': 2, 'OS11': 1, 'OS12': 2, 'OS13': 3, 'OS14': 2,
    'OS15': 2, 'OS16': 4, 'OS17': 2, 'OS18': 1, 'OS19': 3,
}
# 品类默认保质期（天）——OCR 未识别到保质期时的占位值，正式上架须按实物标签替换
DEFAULT_SHELF = {
    '平台精选水果拼盘': 30, '羊肉烩面': 180, '海盐芝士条蛋糕': 90, '牛肉': 180,
    '燕麦咖啡味高纤夹心卷': 270, '五香味鸭翅根': 180, '老卤小黑蛋': 180, '老味豆干': 180,
    '糖水型黄桃罐头': 730, '柠檬味脆笋鸭掌筋': 180, '爽露爽米酒': 365,
    '东方树叶绿茶原味茶饮料': 270, '彝香麻辣': 180, '盛兴源花生系列': 240,
    '老卤鸡脚筋': 180, '山药薄片': 270, '榴莲软心蛋卷': 180,
    '人参黄精复合压片糖果': 540, '桑坡手工锅巴': 240,
}
# 卖点胶囊（中性描述，不做功效表述）
SELLING = {
    '平台精选水果拼盘': '当日鲜切', '羊肉烩面': '方便速食', '海盐芝士条蛋糕': '咸甜适口',
    '牛肉': '手撕肉感', '燕麦咖啡味高纤夹心卷': '高纤配方', '五香味鸭翅根': '卤香入味',
    '老卤小黑蛋': '经典卤味', '老味豆干': '豆香扎实', '糖水型黄桃罐头': '整颗果肉',
    '柠檬味脆笋鸭掌筋': '爽脆筋道', '爽露爽米酒': '米香清甜', '东方树叶绿茶原味茶饮料': '零糖茶饮',
    '彝香麻辣': '麻辣过瘾', '盛兴源花生系列': '颗粒饱满', '老卤鸡脚筋': '筋道弹牙',
    '山药薄片': '轻薄脆爽', '榴莲软心蛋卷': '榴莲夹心', '人参黄精复合压片糖果': '含片便携',
    '桑坡手工锅巴': '手工脆制',
}
# 储存建议（按品类）
STORAGE = {
    '平台精选水果拼盘': '冷藏 0-4℃ 保存，建议当日食用完毕',
    '东方树叶绿茶原味茶饮料': '常温阴凉处存放，开盖后请冷藏并尽快饮用',
}


def font(p, s):
    return ImageFont.truetype(p, s)


def wrap(d, text, fnt, max_w):
    lines, cur = [], ''
    for ch in text:
        if ch == '\n':
            lines.append(cur)
            cur = ''
            continue
        if d.textlength(cur + ch, font=fnt) <= max_w:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def square(path, out, size=900):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    im = im.resize((size, size), Image.LANCZOS)
    im.save(out, 'JPEG', quality=90, optimize=True)
    return size


def build_detail(row, main_path, out):
    W, M = 750, 30
    iw = W - M * 2
    f_name = font(FONT_BOLD, 42)
    f_cat = font(FONT_REG, 23)
    f_sell = font(FONT_BOLD, 27)
    f_title = font(FONT_BOLD, 27)
    f_body = font(FONT_REG, 24)
    f_tiny = font(FONT_REG, 20)

    probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    name = row['name']
    shelf = int(row['shelf_life_days']) if row['shelf_life_days'] else DEFAULT_SHELF.get(name, 180)
    storage = STORAGE.get(name, '常温阴凉干燥处存放，避免阳光直射；开封后请尽快食用')

    blocks = [
        ('商品信息', [
            '品名：%s' % name,
            '规格：%s' % (row['spec'] or '散装 / 以实际到货为准'),
            '保质期：%d 天（以实物标签为准）' % shelf,
        ]),
        ('储存方式', [storage]),
        ('温馨提示', [
            '本商品为预包装食品，具体配料与致敏信息请以实物标签为准。',
            '请置于儿童不易触及处，勿食用包装内干燥剂。',
        ]),
    ]
    lines_cache = []
    hei = 0
    for t, ls in blocks:
        body = []
        for ln in ls:
            body.extend(wrap(probe, ln, f_body, iw - 52))
        lines_cache.append((t, body))
        hei += 52 + (f_title.size + 6) + 18 + len(body) * (f_body.size + 12)

    H = iw + hei + 470
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 150], fill=GREEN)
    d.text((M, 30), '来店有喜 · 官方店', font=f_cat, fill=(226, 240, 228))
    d.text((M, 66), name, font=f_name, fill=(255, 255, 255))

    y = 150 + 26
    thumb = Image.open(main_path).resize((iw, iw), Image.LANCZOS)
    img.paste(thumb, (M, y))
    y += iw + 22

    sell = SELLING.get(name, '精选好物')
    sw = probe.textlength(sell, font=f_sell) + 60
    d.rounded_rectangle([M, y, M + sw, y + 60], radius=30, fill=GREEN_SOFT, outline=GREEN, width=2)
    d.text((M + 30, y + 14), sell, font=f_sell, fill=GREEN_DEEP)
    y += 60 + 34

    for t, body in lines_cache:
        d.text((M, y), t, font=f_title, fill=GREEN_DEEP)
        d.line([M, y + 40, M + 46, y + 40], fill=SAND, width=3)
        yy = y + 40 + 18
        for ln in body:
            d.text((M + 4, yy), ln, font=f_body, fill=TXT)
            yy += f_body.size + 12
        y = yy + 22

    d.text((M, y + 10), '来店有喜 · 官方店', font=f_tiny, fill=TXT_MUTED)
    img.save(out, 'JPEG', quality=88, optimize=True, progressive=True)
    return W, H


def main():
    os.makedirs(FINAL, exist_ok=True)
    os.makedirs(DETAIL, exist_ok=True)
    rows = list(csv.DictReader(io.open(SEED, encoding='utf-8-sig')))
    print('处理 %d 款' % len(rows))
    for r in rows:
        sku = r['sku']
        n = PICK.get(sku)
        src = os.path.join(CAND, '%s_%d.jpg' % (sku, n))
        if not os.path.exists(src):
            print('  ! 缺候选图 %s' % src)
            continue
        fin = os.path.join(FINAL, '%s.jpg' % sku)
        square(src, fin)
        w, h = build_detail(r, fin, os.path.join(DETAIL, '%s.jpg' % sku))
        print('  %-4s %-22s 主图900x900  长图 %dx%d' % (sku, r['name'][:20], w, h))
    print('完成 → %s / %s' % (FINAL, DETAIL))


if __name__ == '__main__':
    main()
