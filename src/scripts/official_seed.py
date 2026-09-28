# -*- coding: utf-8 -*-
"""
来店有喜官方店（ffffffff-ffff-ffff-ffff-ffffffffffff）商品清洗 + 出图种子生成。

背景：该店 65 条商品全部来自 food-scan 的 OCR 建档，含大量垃圾名与重复行，
且 0 图 0 规格。本脚本负责：
  1) 从生产库导出该店商品（REST，管理员 JWT）
  2) 清洗商品名（剥离 OCR 混入的「保质期：9个月生产日期：见瓶体」「○食品别：肉制品」等串）
  3) 抽取保质期线索（保质期 X 个月/天/年 → shelf_life_days）
  4) 判定垃圾名 / 重复行 → 生成软下线（is_active=false）清单（不物理删除，可逆）
  5) 产出 product-images/official_seed.csv 供后续搜图/上传消费

默认 dry-run，加 --commit 才执行软下线。
用法：
  python src/scripts/official_seed.py            # 导出 + 打印清洗方案
  python src/scripts/official_seed.py --commit   # 额外执行软下线
"""
import argparse
import csv
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

# 脚本位于 src/scripts/ → 项目根需上溯三级（src/scripts → src → root）
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STORE = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
OUT_CSV = os.path.join(ROOT, 'product-images', 'official_seed.csv')
OUT_JSON = os.path.join(ROOT, 'product-images', 'official_seed.json')

# ── 垃圾名判据：OCR 把包装上的字段名/时间戳/水印当成商品名 ──
JUNK_PAT = re.compile(r'(OCR零食|产品名称|Baidu|18:58|B2026033|test|测试)', re.I)
PURE_CODE = re.compile(r'^[A-Za-z0-9:._\-]{1,12}$')          # B2026033 / 18:58
NOISE_TAIL = re.compile(r'[○●·].*$')                          # 「彝香麻辣○食品别：肉制品」
DATE_TAIL = re.compile(r'(保质期|生产日期|净含量|规格|配料)[：:].*$')  # 「…保质期：9个月生产日期：见瓶体」
SHELF_PAT = re.compile(r'保质期[：:\s]*(\d+)\s*(个?月|天|日|年)')


def env():
    e = {}
    for line in io.open(os.path.join(ROOT, '.env'), encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            e[k.strip()] = v.strip().strip('"').strip("'")
    return e['TARO_APP_SUPABASE_URL'], e['TARO_APP_SUPABASE_ANON_KEY']


def req(method, url, key, token=None, body=None, prefer=None):
    h = {'apikey': key}
    if token:
        h['Authorization'] = 'Bearer ' + token
    if body is not None:
        data = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    else:
        data = None
    if prefer:
        h['Prefer'] = prefer
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            txt = resp.read().decode()
            try:
                return resp.status, json.loads(txt)
            except Exception:
                return resp.status, txt
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return 'ERR', str(e)[:300]


def clean_name(raw):
    n = (raw or '').strip()
    n = NOISE_TAIL.sub('', n)
    n = DATE_TAIL.sub('', n)
    n = n.strip(' ·-—_')
    return n


def shelf_days(*texts):
    for t in texts:
        if not t:
            continue
        m = SHELF_PAT.search(str(t))
        if m:
            v = int(m.group(1))
            unit = m.group(2)
            if unit in ('个月', '月'):
                return v * 30
            if unit == '年':
                return v * 365
            return v
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--commit', action='store_true', help='执行软下线（默认只打印方案）')
    args = ap.parse_args()

    url, key = env()
    st, res = req('POST', url + '/auth/v1/token?grant_type=password', key,
                  body={'email': 'admin@laidianyouxi.com', 'password': 'Admin123456'})
    if st != 200:
        print('登录失败:', st, res)
        raise SystemExit(1)
    tok = res['access_token']

    sel = 'id,name,description,label_info,ingredients,spec,price,is_active,created_at,' \
          'nutrition,barcode,food_category'
    st, prods = req('GET', '%s/rest/v1/products?select=%s&store_id=eq.%s&order=created_at.asc&limit=200'
                    % (url, sel, STORE), key, tok)
    if not isinstance(prods, list):
        print('读取失败:', st, prods)
        raise SystemExit(1)
    print('官方店商品：%d 条' % len(prods))

    keep, junk, dup = [], [], []
    seen = {}
    for p in prods:
        raw = p['name'] or ''
        cn = clean_name(raw)
        is_junk = bool(JUNK_PAT.match(raw.strip()) or PURE_CODE.match(raw.strip()) or not cn)
        shelf = shelf_days(raw, p.get('label_info'), p.get('description'))
        rec = {
            'id': p['id'], 'raw_name': raw, 'name': cn, 'is_active': p.get('is_active'),
            'created_at': p.get('created_at'), 'price': p.get('price'),
            'spec': p.get('spec'), 'shelf_life_days': shelf,
            'label_info': (p.get('label_info') or '')[:200],
            'description': (p.get('description') or '')[:200],
        }
        if is_junk:
            junk.append(rec)
            continue
        if cn in seen:
            dup.append(rec)                      # 重复行 → 软下线
            continue
        seen[cn] = rec
        rec['sku'] = 'OS%02d' % (len(seen))
        keep.append(rec)

    print('\n── 清洗方案 ──')
    print('保留（独立商品）：%d' % len(keep))
    print('垃圾名 → 软下线：%d' % len(junk))
    print('同名重复 → 软下线：%d' % len(dup))
    print('\n垃圾名明细：')
    for r in junk:
        print('   %-46s %s' % (r['raw_name'][:44], r['id'][:8]))
    print('\n保留清单（sku / 清洗后名称 / 保质期天数）：')
    for r in keep:
        print('   %-4s %-30s shelf=%s  %s' % (r['sku'], r['name'][:28], r['shelf_life_days'],
                                              '原名有噪' if r['raw_name'] != r['name'] else ''))

    with io.open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['sku', 'id', 'name', 'raw_name', 'spec',
                                          'price', 'shelf_life_days', 'label_info'])
        w.writeheader()
        for r in keep:
            w.writerow({k: r.get(k) for k in w.fieldnames})
    with io.open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump({'keep': keep, 'junk': junk, 'dup': dup}, f, ensure_ascii=False, indent=1)
    print('\n已写出：%s' % OUT_CSV)

    off = junk + dup
    if not args.commit:
        print('\n[dry-run] 将把 %d 条置为 is_active=false（不物理删除）。加 --commit 执行。' % len(off))
        return

    ok = 0
    for r in off:
        st, _ = req('PATCH', url + '/rest/v1/products?id=eq.' + r['id'], key, tok,
                    body={'is_active': False}, prefer='return=minimal')
        if st in (200, 204):
            ok += 1
        else:
            print('   下线失败', r['raw_name'], st)
    print('已软下线 %d/%d 条' % (ok, len(off)))


if __name__ == '__main__':
    main()
