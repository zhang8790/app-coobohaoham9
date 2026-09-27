#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
批量为「尚无店内码」的商品分配并回写 EAN-13 店内码。

背景：杭州礼品店 barcode_counter 已涨到 7，但全库 products.barcode 无一非空
（码分配了、商品上没落）。服务端打印时读 products.barcode 为空 → 「该商品无条码」。
本脚本用管理员会话直连 PostgREST 补码，让条码体系真正可用。

用法：
    python scripts/backfill_store_barcodes.py                 # dry-run（默认，只打印计划）
    python scripts/backfill_store_barcodes.py --commit        # 真实写入
    python scripts/backfill_store_barcodes.py --store <uuid>  # 指定门店（默认杭州礼品店）

要点：
  * 只写 barcode IS NULL 的商品，已有码的不动（幂等）
  * 出码走 RPC fn_alloc_store_barcode（SECURITY DEFINER，行锁防并发撞码）
  * 回写必须 .select() 回读，按「返回行数」判定是否真落库 —— PostgREST 对被 RLS
    拒绝的 UPDATE 不报错、只返回 0 行，只看 error 会得出「成功」的假象
"""
import os
import io
import re
import sys
import json
import urllib.request
import urllib.error

DEFAULT_STORE = '70778d6b-d819-41fc-87a3-8766a78eb60d'  # 杭州礼品店
ADMIN_EMAIL = 'admin@laidianyouxi.com'
ADMIN_PASSWORD = 'Admin123456'


def load_env():
    env = {}
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
    if not os.path.exists(p):
        print('缺少 .env'); sys.exit(1)
    for line in io.open(p, encoding='utf-8', errors='replace'):
        m = re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$', line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env.get('TARO_APP_SUPABASE_URL'), env.get('TARO_APP_SUPABASE_ANON_KEY')


def main():
    commit = '--commit' in sys.argv
    store = DEFAULT_STORE
    if '--store' in sys.argv:
        store = sys.argv[sys.argv.index('--store') + 1]

    url, key = load_env()
    if not (url and key):
        print('读不到 SUPABASE_URL / ANON_KEY'); sys.exit(1)

    # 管理员会话（products 写入需命中 admin_all_products 策略）
    req = urllib.request.Request(
        '%s/auth/v1/token?grant_type=password' % url,
        data=json.dumps({'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}).encode(),
        headers={'apikey': key, 'Content-Type': 'application/json'},
    )
    tok = json.load(urllib.request.urlopen(req, timeout=30)).get('access_token')
    if not tok:
        print('管理员登录失败'); sys.exit(1)
    H = {'apikey': key, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'}

    def get(path):
        r = urllib.request.Request('%s/rest/v1/%s' % (url, path), headers=H)
        try:
            return json.load(urllib.request.urlopen(r, timeout=30))
        except urllib.error.HTTPError as e:
            print('  HTTP %s %s' % (e.code, e.read().decode('utf-8', 'replace')[:200]))
            return None

    def rpc(fn, body):
        r = urllib.request.Request('%s/rest/v1/rpc/%s' % (url, fn), data=json.dumps(body).encode(), headers=H)
        try:
            return json.load(urllib.request.urlopen(r, timeout=30))
        except urllib.error.HTTPError as e:
            print('  RPC HTTP %s %s' % (e.code, e.read().decode('utf-8', 'replace')[:200]))
            return None

    def patch(path, body):
        r = urllib.request.Request('%s/rest/v1/%s' % (url, path), data=json.dumps(body).encode(),
                                   headers=dict(H, Prefer='return=representation'), method='PATCH')
        try:
            return json.load(urllib.request.urlopen(r, timeout=30))
        except urllib.error.HTTPError as e:
            print('  PATCH HTTP %s %s' % (e.code, e.read().decode('utf-8', 'replace')[:200]))
            return None

    store_row = get('stores?select=id,name,barcode_prefix,barcode_counter&id=eq.%s' % store)
    if not store_row:
        print('门店不存在:', store); sys.exit(1)
    s = store_row[0]
    print('门店：%s  前缀=%s  已分配序号=%s' % (s['name'], s.get('barcode_prefix'), s.get('barcode_counter')))

    rows = get('products?select=id,name,barcode&store_id=eq.%s&barcode=is.null&limit=500' % store)
    if rows is None:
        sys.exit(1)
    print('待补码商品：%d 个' % len(rows))
    if not rows:
        return

    print('\n===== %s =====' % ('真实写入' if commit else 'DRY-RUN（加 --commit 才写库）'))
    ok = blocked = 0
    for p in rows:
        alloc = rpc('fn_alloc_store_barcode', {'p_store_id': store})
        code = (alloc or [{}])[0].get('barcode') if isinstance(alloc, list) else None
        if not code:
            print('  %-22s 出码失败' % p['name']); continue
        if not commit:
            print('  %-22s -> %s' % (p['name'][:22], code))
            ok += 1
            continue
        upd = patch('products?id=eq.%s' % p['id'], {'barcode': code, 'barcode_type': 'EAN13'})
        if upd:
            ok += 1
            print('  %-22s -> %s  已写入' % (p['name'][:22], code))
        else:
            blocked += 1
            print('  %-22s -> %s  ✗ 被安全策略拒绝（0 行回读）' % (p['name'][:22], code))

    print('\n结果：成功 %d，被拒 %d' % (ok, blocked))
    if commit:
        left = get('products?select=id&store_id=eq.%s&barcode=is.null&limit=1' % store)
        print('补码后仍无码商品：%d' % (len(left) if left is not None else -1))


if __name__ == '__main__':
    main()
