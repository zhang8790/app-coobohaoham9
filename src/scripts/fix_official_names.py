# -*- coding: utf-8 -*-
"""
修正官方店（ffffffff-ffff-ffff-ffff-ffffffffffff）活跃商品名。

背景：official_seed.py 之前只软下线了垃圾名/重复行，但漏了把清洗后的 name
写回 products 表（只写进了 CSV/JSON），导致线上仍有 OCR 脏名：
  「东方树叶绿茶原味茶饮料保质期：9个月生产日期：见瓶体」
  「彝香麻辣○食品别：肉制品」
本脚本补这个洞：对官方店 is_active=true 的商品应用 clean_name，仅对确实会变名的执行 UPDATE。

幂等：clean_name 对干净名不产生变化，重跑安全。默认 dry-run。
用法：
  python src/scripts/fix_official_names.py            # 打印变更
  python src/scripts/fix_official_names.py --commit   # 执行 UPDATE name
"""
import argparse
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STORE = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

# 与 official_seed.py 保持一致的清洗规则
NOISE_TAIL = re.compile(r'[○●·].*$')                       # 「彝香麻辣○食品别：肉制品」
DATE_TAIL = re.compile(r'(保质期|生产日期|净含量|规格|配料)[：:].*$')  # 「…保质期：9个月生产日期：见瓶体」


def clean_name(raw):
    n = (raw or '').strip()
    n = NOISE_TAIL.sub('', n)
    n = DATE_TAIL.sub('', n)
    return n.strip(' ·-—_')


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--commit', action='store_true', help='执行 UPDATE name（默认只打印变更）')
    args = ap.parse_args()

    url, key = env()
    st, res = req('POST', url + '/auth/v1/token?grant_type=password', key,
                  body={'email': 'admin@laidianyouxi.com', 'password': 'Admin123456'})
    if st != 200:
        print('登录失败:', st, res)
        raise SystemExit(1)
    tok = res['access_token']

    st, prods = req('GET',
                    '%s/rest/v1/products?select=id,name,is_active&store_id=eq.%s&is_active=eq.true&limit=200'
                    % (url, STORE), key, tok)
    if not isinstance(prods, list):
        print('读取失败:', st, prods)
        raise SystemExit(1)

    changes = []
    for p in prods:
        raw = p['name'] or ''
        cn = clean_name(raw)
        if cn != raw:
            changes.append((p['id'], raw, cn))

    print('官方店活跃商品 %d 条，需改名 %d 条：' % (len(prods), len(changes)))
    for i, r, cn in changes:
        print('   %s -> %s   [%s]' % (r, cn, i[:8]))

    if not args.commit:
        print('\n[dry-run] 加 --commit 执行 UPDATE name。')
        return

    ok = 0
    for i, r, cn in changes:
        st, _ = req('PATCH', '%s/rest/v1/products?id=eq.%s' % (url, i), key, tok,
                    body={'name': cn}, prefer='return=minimal')
        if st in (200, 204):
            ok += 1
        else:
            print('   失败', r, st)
    print('已改名 %d/%d' % (ok, len(changes)))


if __name__ == '__main__':
    main()
