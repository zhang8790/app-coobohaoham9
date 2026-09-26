# -*- coding: utf-8 -*-
"""
为「来店有喜」48 款食养零食生成本地成品图：
  A. 主图：按商品名归位生成图 -> 裁掉右下角水印 -> 正方形 -> product-images/final/<sku>.jpg
  B. 详情图：程序化排版长图（750px 宽）-> product-images/detail/<sku>.png

只读 CSV，输出到 product-images/ 下，不触碰任何源码与数据库。
用法：
  python scripts/build_product_images.py
  python scripts/build_product_images.py --only C1,S1   # 只处理指定 SKU
"""
import argparse
import csv
import io
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, '食品选品种子_48SKU_2026-09-23.csv')
SRC_DIR = os.path.join(ROOT, 'product-images')
MAIN_DIR = os.path.join(SRC_DIR, 'final')
DETAIL_DIR = os.path.join(SRC_DIR, 'detail')

FONT_REG = 'C:/Windows/Fonts/msyh.ttc'
FONT_BOLD = 'C:/Windows/Fonts/msyhbd.ttc'

# ---- 设计系统（与 src/app.scss :root 对齐）----
GREEN = (31, 157, 107)          # --primary 清新绿
GREEN_DEEP = (21, 122, 82)
GREEN_SOFT = (234, 246, 238)
BG = (248, 248, 248)
CARD = (255, 255, 255)
TXT = (51, 51, 51)
TXT_SUB = (102, 102, 102)
TXT_MUTED = (153, 153, 153)
BORDER = (230, 230, 230)

# ---- 免责声明原文（取自 src/utils/compliance/shield.ts，禁止改写）----
# 注：免责声明统一由「商品详情页」渲染（src/pages/product/index.tsx 底部免责卡），
#     详情长图不再烤入免责卡，避免长图底部与页面底部出现两遍「食用提示」。此处仅留档备查。
PRODUCT_DISCLAIMER = ('【食用温馨提示】本品为普通食品，不是药品、保健食品，不具备调理疾病功效。'
                      '每个人体质不同，请结合自身情况选择食用；特殊身体状态请遵从专业人员建议。')
FOOD_REFERENCE_DISCLAIMER = ('提示：内容仅为传统饮食文化参考，不构成膳食指导，不可替代医师诊疗建议。'
                             '身体存在慢性基础疾病人群，请遵从医嘱选择食材。')

# ---- 每款的一句话卖点（自撰，规避一切功效/医疗宣称）----
SELLING = {
    'C1': '配料只有苹果', 'C2': '非膨化 0 铝', 'C3': '不加香精色素', 'C4': '甜味来自红枣',
    'C5': '酵母发酵 不加膨松剂', 'C6': '无麸质 不加植脂末',
    'P1': '冻干保形 不加糖浆', 'P2': '五谷研磨 不加蔗糖', 'P3': '性味平和 口感松脆',
    'P4': '银耳自然成稠 不加胶', 'P5': '蒸制非油炸 本色不染色', 'P6': '甜味来自大枣 零添加糖',
    'E1': '入口即化 少咀嚼', 'E2': '可含化 不费力', 'E3': '复水即化 清润不腻',
    'E4': '小块好拿 短保无防腐', 'E5': '不加盐 原味研磨', 'E6': '不加蔗糖 冲泡免搅拌',
    'S1': '经典食材 零食新形态', 'S2': '含化即食 免冲调', 'S3': '无添加糖 佐温牛奶',
    'S4': '冻干保形 不加糖浆', 'S5': '无添加糖 配料表见真章', 'S6': '小份即食 温热更佳',
    'D1': '不加色素 无胭脂红', 'D2': '独立小包 便携', 'D3': '药食同源食材零食化',
    'D4': '酵母发酵 0 铝', 'D5': '含化形态 饭后清爽', 'D6': '一块一杯 免熬煮',
    'I1': '经典温润食材组合', 'I2': '不加蔗糖 甜味来自大枣', 'I3': '含化形态 免冲泡',
    'I4': '清润不腻 冻干保形', 'I5': '柚子皮果胶成型 不加胶', 'I6': '基础款 配料干净',
    'A1': '配料 1 项', 'A2': '配料 1 项', 'A3': '无麸质 单一原料', 'A4': '单一原料 无麸质',
    'A5': '以椰子替代坚果', 'A6': '无麸质 高蛋白',
    'O1': '冻干保色 不加色素', 'O2': '办公室含化 0 咖啡因', 'O3': '无添加糖',
    'O4': '脆片形态 市面少见', 'O5': '清润方向 口感干脆', 'O6': '基础款 日常走量',
}

# ---- 名称 -> 图片文件名前缀（用于归位）。仅 O6 需覆盖，避免与 P3 前缀歧义 ----
KEY_OVERRIDE = {'O6': '小米山药脆片'}

HONEY_SKUS = {'P2', 'P6', 'D5', 'I1', 'I3', 'I6', 'O2'}
CHILD_SKUS = {'C1', 'C2', 'C3', 'C4', 'C5', 'C6'}
PREGNANT_SKUS = {'P1', 'P2', 'P3', 'P4', 'P5', 'P6'}
HAWTHORN_SKUS = {'D1', 'D2'}
DYSPHAGIA_SKUS = {'E1', 'E2', 'E3', 'E5'}
SUGAR_WATCH = {'E4', 'E6'}

ALLERGEN_TEXT = {'鸡蛋': '含鸡蛋', '乳': '含乳制品', '小麦': '含小麦（麸质）', '坚果': '含坚果'}


def key_of(row):
    sku = row['sku_id']
    if sku in KEY_OVERRIDE:
        return KEY_OVERRIDE[sku]
    return re.sub(r'[（(].*?[)）]', '', row['name']).strip()


def notes_of(row):
    """生成 C 端可展示的注意事项（剔除内部质控指令与内部话术）。"""
    sku = row['sku_id']
    out = []
    for a in (row['allergens'] or '').split(';'):
        a = a.strip()
        if a and a in ALLERGEN_TEXT:
            out.append(ALLERGEN_TEXT[a])
    if sku in CHILD_SKUS:
        out.append('3 岁以下婴幼儿不适用（吞咽风险）')
    if sku in PREGNANT_SKUS:
        out.append('孕期、哺乳期请遵医嘱')
    if sku in HONEY_SKUS:
        out.append('含蜂蜜，1 岁以下婴幼儿不宜食用')
    if sku in HAWTHORN_SKUS:
        out.append('孕妇不宜食用含山楂产品')
    if sku in DYSPHAGIA_SKUS:
        out.append('吞咽障碍者请遵医嘱')
    if sku in SUGAR_WATCH:
        out.append('控糖人群请注意总碳水摄入')
    if sku.startswith('A'):
        out.append('过敏体质请遵医嘱；本品与含致敏原产品共线生产时以实际标签为准')
    seen, uniq = set(), []
    for t in out:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq or ['普通食品，特殊身体状态请遵从专业人员建议']


# ============ A. 主图 ============
def build_main_images(rows):
    os.makedirs(MAIN_DIR, exist_ok=True)
    files = [f for f in os.listdir(SRC_DIR) if f.lower().endswith('.png')]
    keys = [(key_of(r), r['sku_id']) for r in rows]
    assign, orphans = {}, list(files)
    # 长键优先，避免「山药脆片」误吃「小米山药脆片」
    for k, sku in sorted(keys, key=lambda x: -len(x[0])):
        hit = [f for f in orphans if k in f]
        if not hit:
            print('  ! 未找到图片: %s (%s)' % (sku, k))
            continue
        hit.sort(key=lambda f: os.path.getmtime(os.path.join(SRC_DIR, f)))
        pick = hit[-1]           # 重生成的取最新
        assign[sku] = pick
        for f in hit:
            if f in orphans:
                orphans.remove(f)
    if orphans:
        print('  - 多余文件（非本批商品，跳过）:', len(orphans))
        for f in orphans[:6]:
            print('      ', f[:50])

    made = 0
    for r in rows:
        sku = r['sku_id']
        if sku not in assign:
            continue
        im = Image.open(os.path.join(SRC_DIR, assign[sku])).convert('RGB')
        w, h = im.size
        # 右下角水印带：裁掉底部 7.5%
        cut = int(h * 0.075)
        im = im.crop((0, 0, w, h - cut))
        # 居中取正方形
        w2, h2 = im.size
        s = min(w2, h2)
        left = (w2 - s) // 2
        im = im.crop((left, 0, left + s, s)).resize((900, 900), Image.LANCZOS)
        im.save(os.path.join(MAIN_DIR, '%s.jpg' % sku), 'JPEG', quality=90, optimize=True)
        made += 1
    print('A. 主图完成: %d 张 -> %s' % (made, MAIN_DIR))
    return assign


# ============ B. 详情图 ============
def font(path, size):
    return ImageFont.truetype(path, size)


def wrap(draw, text, fnt, max_w):
    lines, cur = [], ''
    for ch in text:
        if ch == '\n':
            lines.append(cur)
            cur = ''
            continue
        if draw.textlength(cur + ch, font=fnt) <= max_w:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def draw_block(d, x, y, w, title, lines, fnt_title, fnt_body, pad=26, title_color=GREEN_DEEP,
               body_color=TXT, line_gap=12, top_gap=18):
    """白色圆角卡片区块，返回新的 y。"""
    inner = w - pad * 2
    body_lines = []
    for ln in lines:
        body_lines.extend(wrap(d, ln, fnt_body, inner))
    h_title = fnt_title.size + 6 if title else 0
    h_body = len(body_lines) * (fnt_body.size + line_gap)
    h = pad * 2 + h_title + (top_gap if title else 0) + h_body
    d.rounded_rectangle([x, y, x + w, y + h], radius=20, fill=CARD, outline=BORDER, width=2)
    yy = y + pad
    if title:
        d.text((x + pad, yy), title, font=fnt_title, fill=title_color)
        yy += h_title + top_gap
    for ln in body_lines:
        d.text((x + pad, yy), ln, font=fnt_body, fill=body_color)
        yy += fnt_body.size + line_gap
    return y + h


def build_detail_images(rows, assign):
    os.makedirs(DETAIL_DIR, exist_ok=True)
    W = 750
    M = 30                      # 页边距
    iw = W - M * 2
    f_brand = font(FONT_BOLD, 24)
    f_name = font(FONT_BOLD, 46)
    f_cat = font(FONT_REG, 24)
    f_sell = font(FONT_BOLD, 28)
    f_title = font(FONT_BOLD, 28)
    f_body = font(FONT_REG, 25)
    f_tiny = font(FONT_REG, 21)

    for r in rows:
        sku = r['sku_id']
        if sku not in assign:
            continue
        probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
        # 预排版算高度
        blocks = []
        blocks.append(('配料表', [r['ingredients_text']]))
        blocks.append(('规格', ['净含量：%s g' % r['spec_g'], '形态：%s' % r['form']]))
        blocks.append(('食养方向', [' / '.join([t for t in (r['health_tag'] or '').split(';') if t]) or '性味平和']))
        blocks.append(('注意事项', notes_of(r)))

        hei = 0
        for t, ls in blocks:
            body = []
            for ln in ls:
                body.extend(wrap(probe, ln, f_body, iw - 52))
            hei += 52 + (f_title.size + 6) + 18 + len(body) * (f_body.size + 12)
        # 画布高度：顶栏(176) + 主图(iw+22) + 卖点(62+34) + 内容区 + 页脚 + 底边距
        # 免责卡已移除（改由详情页渲染），仅保留单行品牌签名页脚
        H = iw + hei + 470

        img = Image.new('RGB', (W, H), BG)
        d = ImageDraw.Draw(img)

        # 顶部品牌头
        d.rectangle([0, 0, W, 150], fill=GREEN)
        d.text((M, 34), '来店有喜 · %s' % r['category_label'], font=f_cat, fill=(220, 240, 230))
        d.text((M, 70), r['name'], font=f_name, fill=(255, 255, 255))

        y = 150 + 26
        # 主图
        thumb = Image.open(os.path.join(MAIN_DIR, '%s.jpg' % sku)).resize((iw, iw), Image.LANCZOS)
        img.paste(thumb, (M, y))
        y += iw + 22

        # 卖点胶囊
        sell = SELLING.get(sku, '配料干净')
        sw = probe.textlength(sell, font=f_sell) + 60
        d.rounded_rectangle([M, y, M + sw, y + 62], radius=31, fill=GREEN_SOFT, outline=GREEN, width=2)
        d.text((M + 30, y + 15), sell, font=f_sell, fill=GREEN_DEEP)
        y += 62 + 34

        # 内容区块
        for t, ls in blocks:
            y = draw_block(d, M, y, iw, t, ls, f_title, f_body) + 22

        # 页脚：仅品牌签名。免责声明统一由商品详情页渲染，长图不再烤入，避免与页面重复
        d.text((M, y + 10), '来店有喜 · 食养零食', font=f_tiny, fill=TXT_MUTED)

        img.save(os.path.join(DETAIL_DIR, '%s.png' % sku), 'PNG', optimize=True)
        print('   详情图 %s %s (%dx%d)' % (sku, r['name'], W, H))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    args = ap.parse_args()

    rows = list(csv.DictReader(io.open(CSV_PATH, encoding='utf-8')))
    if args.only:
        want = {s.strip() for s in args.only.split(',')}
        rows = [r for r in rows if r['sku_id'] in want]
    print('处理 %d 款' % len(rows))
    assign = build_main_images(rows)
    build_detail_images(rows, assign)
    print('B. 详情图完成 ->', DETAIL_DIR)


if __name__ == '__main__':
    main()
