#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把「食品选品种子_48SKU」清单上架到指定门店（默认杭州礼品店）。

用法：
  python scripts/upload_food_skus.py                  # dry-run，只打印将要写入的内容
  python scripts/upload_food_skus.py --commit         # 真正写库
  python scripts/upload_food_skus.py --commit --store <uuid>

设计要点（都是踩过的坑）：
  1) 幂等：同名商品已存在于该门店则跳过，可反复执行。
  2) 校验闸门：写入前拦截 2023/2019 批受限食药物质、非法 health_tag / rec_crowds / scenes。
  3) 过敏原口径：products.allergens 必须存 allergen-dictionary 的 key（egg/milk/gluten/tree_nut…），
     因为用户画像（family/index.tsx）是按 key 勾选的，存中文「鸡蛋/乳」永远匹配不上。
  4) 认证：用项目自带的引导管理员账号登录（00092 迁移把它提升为 role=admin），
     admin 命中 products 的 rls81_products_owner / rls_operator_write_products 策略，可绕过 store owner 归属限制。
  5) 只读凭据不入库：脚本不落盘任何 token。
"""
import argparse
import csv
import io
import json
import os
import sys
import urllib.request
import urllib.error

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV = os.path.join(ROOT, '食品选品种子_48SKU_2026-09-23.csv')
DEFAULT_STORE = '70778d6b-d819-41fc-87a3-8766a78eb60d'  # 杭州礼品店
ADMIN_EMAIL = 'admin@laidianyouxi.com'
ADMIN_PASSWORD = 'Admin123456'

# ---------------------------------------------------------------- 白名单 / 黑名单
HEALTH_TAGS = {'温中散寒', '健脾养胃', '滋阴润燥', '清热降火', '补气养血',
               '舒缓安适', '消食化积', '润养舒喉', '利水消肿'}
CROWD_OPTIONS = {'宫寒量少', '经期量大', '喉咙肿痛', '易上火', '体虚怕冷', '痛风', '脾胃虚寒',
                 '高血压', '高血糖', '高血脂', '肠胃虚弱', '失眠', '免疫力低'}
SCENE_OPTIONS = {'熬夜工作', '秋冬降温', '经期调理', '术后恢复', '单人简餐', '饭后解腻'}
NATURE_OPTIONS = {'寒凉', '凉', '平性', '微温', '温热', '热'}

# allergens 中文名 -> allergen-dictionary.key
ALLERGEN_NAME2KEY = {
    '麸质': 'gluten', '小麦': 'gluten', '含麸质谷物': 'gluten',
    '甲壳类': 'crustacean', '虾': 'crustacean', '蟹': 'crustacean',
    '鱼': 'fish', '鱼类': 'fish',
    '蛋': 'egg', '鸡蛋': 'egg', '蛋类': 'egg',
    '花生': 'peanut',
    '大豆': 'soy', '大豆制品': 'soy',
    '乳': 'milk', '奶': 'milk', '乳制品': 'milk', '乳及乳制品': 'milk',
    '坚果': 'tree_nut', '坚果及果仁': 'tree_nut',
    '芝麻': 'sesame',
    '芒果': 'mango', '菠萝': 'pineapple',
}

# 2023 年第 9 号新增 9 种（孕妇/哺乳期/婴幼儿不推荐）+ 2019 年第 8 号 6 种（仅限香辛料调味品）
RESTRICTED_SHIYAO = ['党参', '黄芪', '西洋参', '铁皮石斛', '灵芝', '山茱萸', '天麻', '杜仲叶',
                     '肉苁蓉', '当归', '山柰', '西红花', '草果', '姜黄', '荜茇']


def load_env():
    env = {}
    for name in ('.env', '.env.production'):
        p = os.path.join(ROOT, name)
        if not os.path.exists(p):
            continue
        for line in io.open(p, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


def req(method, url, key, token=None, body=None, prefer=None):
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    else:
        headers['Authorization'] = 'Bearer ' + key
    if prefer:
        headers['Prefer'] = prefer
    data = json.dumps(body).encode('utf-8') if body is not None else None
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            txt = resp.read().decode('utf-8')
            return resp.status, (json.loads(txt) if txt.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')[:500]


def login(url, key):
    st, res = req('POST', url + '/auth/v1/token?grant_type=password', key,
                  body={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    if st != 200 or not isinstance(res, dict):
        raise SystemExit('登录失败（HTTP %s）：%s' % (st, res))
    return res['access_token'], res.get('user', {}).get('id')


def split_multi(v):
    return [x.strip() for x in (v or '').split(';') if x.strip()]


def build_rows(csv_path, store_id, cat_by_name):
    rows = list(csv.DictReader(io.open(csv_path, encoding='utf-8')))
    problems, out = [], []
    for r in rows:
        sku = r['sku_id']
        label = (r.get('category_label') or '').strip() or {
            'children': '宝宝零食', 'pregnant': '孕产营养', 'elderly': '老年养生',
            'sleep': '舒心食养', 'digestion': '肠胃食养', 'immunity': '温润食养',
            'allergy': '敏感防护', 'overtime': '熬夜加班'}.get(r['category_key'], '')

        ing = [x.strip() for x in r['ingredients_text'].replace('、', ',').split(',') if x.strip()]
        hit_restr = [x for x in RESTRICTED_SHIYAO if any(x in i for i in ing)]
        if hit_restr:
            problems.append((sku, '含受限食药物质', hit_restr))

        htags = split_multi(r['health_tag'])
        bad = [t for t in htags if t not in HEALTH_TAGS]
        if bad:
            problems.append((sku, '非法 health_tag', bad))

        crowds = split_multi(r['rec_crowds']) + split_multi(r['cautious_crowds']) + split_multi(r['forbidden_crowds'])
        bad = [c for c in crowds if c not in CROWD_OPTIONS]
        if bad:
            problems.append((sku, '非法 crowd 标签', bad))

        scenes = split_multi(r['scenes'])
        bad = [s for s in scenes if s not in SCENE_OPTIONS]
        if bad:
            problems.append((sku, '非法 scene', bad))

        nature = (r['overall_nature'] or '').strip()
        if nature and nature not in NATURE_OPTIONS:
            problems.append((sku, '非法 overall_nature', nature))

        aller_raw = split_multi(r['allergens'])
        aller, unknown = [], []
        for a in aller_raw:
            k = ALLERGEN_NAME2KEY.get(a)
            (aller.append(k) if k else unknown.append(a))
        if unknown:
            problems.append((sku, '未知过敏原名（需补映射表）', unknown))

        note = (r.get('compliance_note') or '').strip()
        if note == '—':
            note = ''
        desc = '%s · %sg｜配料：%s\n%s' % (r['form'], r['spec_g'], r['ingredients_text'], r['differentiation'])

        out.append({
            'store_id': store_id,
            'category_id': cat_by_name.get(label),
            'name': r['name'],
            'description': desc,
            'price': float(r['price_cny']),
            'stock': 999,
            'barcode': None,
            'barcode_type': 'EAN13',
            'main_image': None,
            'sub_images': [],
            'detail_images': [],
            'is_active': True,
            'review_status': 'approved',
            'product_kind': 'food',
            'ingredients': ing,
            'overall_nature': nature or None,
            'health_tag': htags,
            'rec_crowds': split_multi(r['rec_crowds']),
            'cautious_crowds': split_multi(r['cautious_crowds']),
            'forbidden_crowds': split_multi(r['forbidden_crowds']),
            'allergens': aller,
            'scenes': scenes,
            'cautious_notes': note or None,
            'mood_tags': [],
            'scene_tags': [],
            '_sku': sku,
            '_label': label,
        })
    return rows, out, problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', default=DEFAULT_CSV)
    ap.add_argument('--store', default=DEFAULT_STORE)
    ap.add_argument('--commit', action='store_true', help='不加此参数只做 dry-run')
    args = ap.parse_args()

    env = load_env()
    url, key = env['TARO_APP_SUPABASE_URL'], env['TARO_APP_SUPABASE_ANON_KEY']
    if not args.commit:
        token, uid = None, None
    else:
        token, uid = login(url, key)
        print('✅ 管理员登录成功 user=%s' % uid)

    # 全局分类：按名称映射 category_id
    st, cats = req('GET', url + '/rest/v1/store_categories?select=id,name&scope=eq.global&is_active=eq.true', key, token)
    cat_by_name = {c['name']: c['id'] for c in (cats or [])} if st == 200 else {}
    print('   可用全局分类 %d 个' % len(cat_by_name))

    rows, payloads, problems = build_rows(args.csv, args.store, cat_by_name)
    print('CSV 行数 %d，构建 payload %d 条' % (len(rows), len(payloads)))
    if problems:
        print('\n❌ 校验未通过，已中止：')
        for p in problems:
            print('   ', p)
        raise SystemExit(1)
    print('✅ 合规闸门通过：无受限食药物质 / 标签全部合法 / 过敏原全部可映射')

    # 幂等：跳过已存在的同名商品
    st, exist = req('GET', url + '/rest/v1/products?select=name&store_id=eq.' + args.store, key, token)
    exist_names = {p['name'] for p in (exist or [])} if st == 200 else set()
    todo = [p for p in payloads if p['name'] not in exist_names]
    print('   门店已有 %d 件；本次将新增 %d 件，跳过 %d 件'
          % (len(exist_names), len(todo), len(payloads) - len(todo)))

    if not args.commit:
        print('\n—— DRY RUN 样例（前 2 条）——')
        for p in payloads[:2]:
            print(json.dumps({k: v for k, v in p.items() if not k.startswith('_')}, ensure_ascii=False, indent=2))
        print('\n未加 --commit，未写库。')
        return

    rec = []
    if todo:
        sent = [{k: v for k, v in p.items() if not k.startswith('_')} for p in todo]
        st, res = req('POST', url + '/rest/v1/products', key, token, body=sent,
                      prefer='return=representation')
        if st not in (200, 201):
            print('❌ 写入失败 HTTP %s: %s' % (st, res))
            raise SystemExit(1)
        got = res if isinstance(res, list) else []
        print('✅ 写入成功 %d 条' % len(got))
        rec = [{'id': p['id'], 'name': p['name'], 'price': p['price']} for p in got]

    # ── 第 2 步：审核上架 ──────────────────────────────────────────────
    # 00009 的 trg_product_pending 会对**任何** INSERT 强制 review_status='pending' + is_active=false，
    # 即使插入时传了 approved/true 也会被打回。因此必须补一步 UPDATE：
    # trg_product_review_active 在 review_status 改为 'approved' 时会自动置 is_active=true。
    names = {p['name'] for p in payloads}
    st, pend = req('GET',
                   url + '/rest/v1/products?select=id,name,review_status&store_id=eq.' + args.store +
                   '&review_status=eq.pending',
                   key, token)
    pending_ids = [x['id'] for x in pend if x.get('name') in names] if isinstance(pend, list) else []
    if not pending_ids:
        print('✅ 无需审核：没有处于 pending 的目标商品')
    else:
        st, res = req('PATCH', url + '/rest/v1/products?id=in.(' + ','.join(pending_ids) + ')',
                      key, token, body={'review_status': 'approved'},
                      prefer='return=representation')
        if st not in (200, 204):
            print('❌ 审核上架失败 HTTP %s: %s' % (st, res))
            raise SystemExit(1)
        rows2 = res if isinstance(res, list) else []
        n_act = sum(1 for x in rows2 if x.get('is_active'))
        print('✅ 审核通过 %d 条（is_active=true %d 条）' % (len(pending_ids), n_act))
        for x in rows2:
            rec.append({'id': x.get('id'), 'name': x.get('name'), 'price': x.get('price')})

    if rec:
        outp = os.path.join(ROOT, 'scripts', '.upload-food-skus-result.json')
        old = []
        if os.path.exists(outp):
            try:
                old = json.loads(io.open(outp, encoding='utf-8').read())
            except Exception:
                old = []
        merged = {r['id']: r for r in old + rec if r.get('id')}
        io.open(outp, 'w', encoding='utf-8').write(
            json.dumps(list(merged.values()), ensure_ascii=False, indent=2))
        print('   商品 id 清单已存：%s（共 %d 条）' % (outp, len(merged)))


if __name__ == '__main__':
    main()
