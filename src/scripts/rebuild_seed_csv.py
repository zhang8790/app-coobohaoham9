# -*- coding: utf-8 -*-
"""
从 Supabase 杭州礼品店 48 款商品重建种子 CSV（食品选品种子_48SKU_2026-09-23.csv）。

只产出 build_product_images.py 需要的列：
  sku_id, name, ingredients_text, spec_g, form, health_tag, category_label, allergens

说明：
  - sku 从 main_image URL 提取（products 表无 sku 列）
  - allergens 在库里是英文代码（milk/egg/wheat/nut...），需映射回中文，
    才能命中 build_product_images.py 的 ALLERGEN_TEXT 红线逻辑
  - form 库里无此列，按商品名关键词推导（仅用于详情图「形态」行）
"""
import csv
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '食品选品种子_48SKU_2026-09-23.csv')
STORE = '70778d6b-d819-41fc-87a3-8766a78eb60d'

# 过敏原英文代码 -> 中文名（命中 build_product_images.py 的 ALLERGEN_TEXT 键）
ALLERGEN_CN = {
    'milk': '乳', 'egg': '鸡蛋', 'wheat': '小麦', 'gluten': '小麦',
    'nut': '坚果', 'tree_nut': '坚果',
    'soy': '大豆', 'peanut': '花生', 'fish': '鱼', 'shellfish': '贝类',
    'sesame': '芝麻',
}

# form 无法按关键词推导时的显式覆盖（sku -> 形态）
FORM_OVERRIDE = {
    'D1': '软片', 'D4': '饼干', 'E4': '小方', 'E5': '坚果碎',
}

# 形态推导：长规则优先
FORM_RULES = [
    ('溶豆', '溶豆'), ('含片', '含片'), ('软糕卷', '软糕卷'), ('软糕', '软糕'),
    ('脆片', '脆片'), ('薄脆', '薄脆'), ('小圆子', '小圆子'), ('冻干球', '冻干球'),
    ('冻干块', '冻干块'), ('冻干', '冻干'), ('奶片', '奶片'), ('粥块', '粥块'),
    ('糊片', '糊片'), ('糊块', '糊块'), ('糊', '糊'), ('丸', '丸'), ('卷', '卷'),
    ('酥', '酥'), ('球', '球'), ('条', '条'), ('脆', '脆'), ('块', '块'),
]


def env():
    e = {}
    for line in io.open(os.path.join(ROOT, '.env'), encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            e[k.strip()] = v.strip().strip('"').strip("'")
    return e['TARO_APP_SUPABASE_URL'], e['TARO_APP_SUPABASE_ANON_KEY']


def req(method, url, key, token=None, body=None):
    h = {'apikey': key}
    if token:
        h['Authorization'] = 'Bearer ' + token
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            txt = resp.read().decode()
            try:
                return resp.status, json.loads(txt)
            except Exception:
                return resp.status, txt
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]
    except Exception as e:
        return 'ERR', str(e)[:600]


def sku_from_url(u):
    if not u:
        return ''
    m = re.search(r'/products/([^/.]+?)(?:-detail)?\.jpg', u)
    return m.group(1) if m else ''


def derive_form(name, sku=''):
    if sku in FORM_OVERRIDE:
        return FORM_OVERRIDE[sku]
    for kw, f in FORM_RULES:
        if kw in name:
            return f
    return ''


def main():
    url, key = env()
    st, res = req('POST', url + '/auth/v1/token?grant_type=password', key,
                  body={'email': 'admin@laidianyouxi.com', 'password': 'Admin123456'})
    if st != 200:
        print('LOGIN FAIL', st, res); sys.exit(1)
    tok = res['access_token']

    st, prods = req('GET', url + '/rest/v1/products?select=id,name,ingredients,spec,'
                    'health_tag,allergens,category_id,main_image'
                    '&store_id=eq.' + STORE + '&limit=200', key, tok)
    if not isinstance(prods, list):
        print('READ FAIL', st, prods); sys.exit(1)
    print('门店商品 %d 条' % len(prods))

    # 类目名映射
    st, cats = req('GET', url + '/rest/v1/store_categories?select=id,name&limit=200', key, tok)
    cat_name = {}
    if isinstance(cats, list):
        cat_name = {c['id']: c['name'] for c in cats}

    rows = []
    unmapped_allergen = set()
    no_form = []
    for p in prods:
        sku = sku_from_url(p.get('main_image'))
        if not sku:
            print('  ! 无法提取 sku:', p.get('name'), p.get('main_image'))
            continue
        ing = '、'.join(p.get('ingredients') or [])
        m = re.search(r'(\d+)', p.get('spec') or '')
        spec_g = m.group(1) if m else ''
        ht = ';'.join(p.get('health_tag') or [])
        al = p.get('allergens') or []
        al_cn = []
        for a in al:
            if a in ALLERGEN_CN:
                al_cn.append(ALLERGEN_CN[a])
            else:
                unmapped_allergen.add(a)
                al_cn.append(a)
        form = derive_form(p.get('name') or '', sku)
        if not form:
            no_form.append((sku, p.get('name')))
        rows.append({
            'sku_id': sku,
            'name': p.get('name', ''),
            'ingredients_text': ing,
            'spec_g': spec_g,
            'form': form,
            'health_tag': ht,
            'category_label': cat_name.get(p.get('category_id'), ''),
            'allergens': ';'.join(al_cn),
        })

    rows.sort(key=lambda r: r['sku_id'])
    with io.open(OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['sku_id', 'name', 'ingredients_text', 'spec_g',
                                          'form', 'health_tag', 'category_label', 'allergens'])
        w.writeheader()
        w.writerows(rows)
    print('已写 %s  (%d 行)' % (OUT, len(rows)))

    print('\n===== 校验表 =====')
    print('%-5s %-14s %-8s %-5s %-22s %s' % ('sku', 'name', 'spec', 'form', 'health_tag', 'allergens'))
    for r in rows:
        print('%-5s %-14s %-8s %-5s %-22s %s' % (r['sku_id'], r['name'][:14], r['spec_g'],
                                                 r['form'], r['health_tag'][:22], r['allergens']))
    if unmapped_allergen:
        print('\n! 未映射过敏原代码:', unmapped_allergen)
    if no_form:
        print('\n! 未能推导 form 的商品（详情图将无「形态」行或需手动补）:')
        for s, n in no_form:
            print('   ', s, n)


if __name__ == '__main__':
    main()
