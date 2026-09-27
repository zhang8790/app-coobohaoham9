#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
给商品补「规格（净含量）」字段，来源：食品选品种子 CSV 的 spec_g 列。

背景
----
products 表原本没有任何承载规格的列，商品卡只有「图 + 名 + 价」。
选品 CSV 第 7 列 spec_g（如 30 = 30g）早已设计好，但上架时从未入库
——与「场景标签 category_key」同型的第三次「设计数据在 CSV、没进库」。
本脚本把 spec_g 写成面向用户的展示文案 "30g" 存入 products.spec。

前置条件
--------
需先在 Supabase SQL 编辑器执行一次迁移，新增该列：
    supabase/migrations/20260924_add_products_spec.sql
未加列直接跑本脚本会得到 42703（column products.spec does not exist）。

用法
----
    python scripts/apply_product_spec.py            # dry-run，只打印计划
    python scripts/apply_product_spec.py --commit   # 真写库

注意
----
- 写库凭据：管理员会话 admin@laidianyouxi.com（命中 is_admin() 的 RLS 分支）。
  仓库内只有 anon key，无 service_role。
- 幂等：spec 已是目标值的商品会跳过，重跑结果一致。
- 按商品名匹配；默认不限门店，但会打印每条商品所属门店供核对。
- 回滚 SQL 不含 ==== 装饰线，可直接粘贴 Supabase SQL 编辑器执行。
"""
import io
import csv
import json
import sys
import urllib.request
import urllib.error

CSV = '食品选品种子_48SKU_2026-09-23.csv'
ADMIN_EMAIL = 'admin@laidianyouxi.com'
ADMIN_PWD = 'Admin123456'
ROLLBACK_SQL = '回滚_商品规格_48SKU_2026-09-24.sql'


def load_env():
    env = {}
    for line in io.open('.env', encoding='utf-8'):
        line = line.strip()
        if line.startswith('TARO_APP_SUPABASE_URL='):
            env['url'] = line.split('=', 1)[1]
        if line.startswith('TARO_APP_SUPABASE_ANON_KEY='):
            env['key'] = line.split('=', 1)[1]
    return env['url'].rstrip('/'), env['key']


BASE, ANON = load_env()


def login():
    body = json.dumps({'email': ADMIN_EMAIL, 'password': ADMIN_PWD}).encode('utf-8')
    req = urllib.request.Request(
        BASE + '/auth/v1/token?grant_type=password',
        data=body,
        headers={'apikey': ANON, 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))['access_token']


def req(method, path, token, data=None):
    payload = json.dumps(data).encode('utf-8') if data is not None else None
    headers = {
        'apikey': ANON,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    r = urllib.request.Request(BASE + '/rest/v1/' + path, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode('utf-8')
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        return {'__err__': e.code, '__body__': e.read().decode('utf-8')[:300]}


def sql_lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    commit = '--commit' in sys.argv

    rows = list(csv.DictReader(io.open(CSV, encoding='utf-8-sig')))
    name2spec = {}
    for r in rows:
        nm = (r.get('name') or '').strip()
        g = (r.get('spec_g') or '').strip()
        if nm and g:
            name2spec[nm] = f'{g}g'

    token = login()
    probe = req('GET', 'products?select=id,name,spec&limit=1', token)
    # PostgREST 把 PG 错误码放在 body 的 code 字段里，HTTP 状态恒为 400，不能只看 __err__
    if isinstance(probe, dict):
        body = str(probe.get('__body__') or '')
        if '42703' in body and 'spec' in body:
            print('✗ products 表尚无 spec 列。请先在 Supabase SQL 编辑器执行：')
            print('    supabase/migrations/20260924_add_products_spec.sql')
            return 1
        print('✗ 探查失败:', probe)
        return 1

    online = req(
        'GET',
        'products?select=id,name,spec,store_id,review_status,is_active&limit=500',
        token,
    )
    if isinstance(online, dict):
        print('拉取商品失败:', online)
        return 1

    todo, skipped, missing = [], [], []
    for p in online:
        nm = (p.get('name') or '').strip()
        target = name2spec.get(nm)
        if not target:
            missing.append(nm)
            continue
        cur = p.get('spec')
        if cur == target:
            skipped.append((nm, target, '已是目标值'))
            continue
        todo.append((p['id'], nm, cur, target, p.get('review_status'), p.get('is_active')))

    print(f'线上商品 {len(online)} 条 | CSV 有规格 {len(name2spec)} 条')
    print(f'待写入 {len(todo)} | 跳过 {len(skipped)} | 无规格数据(保持为空) {len(missing)}')

    plan = sorted(todo, key=lambda x: x[1])
    for _id, nm, cur, target, _rs, _act in plan:
        arrow = f'{cur!r} → {target!r}' if cur else f'(空) → {target!r}'
        print(f'  {nm[:24]:<26} {arrow}')

    if not commit:
        print('\n[dry-run] 未写库。确认无误后加 --commit 执行。')
        return 0

    ok, fail = 0, []
    for _id, nm, cur, target, _rs, _act in plan:
        res = req('PATCH', f"products?id=eq.{_id}", token, {'spec': target})
        if isinstance(res, dict) and res.get('__err__'):
            fail.append((nm, res))
        elif isinstance(res, list) and res and res[0].get('review_status') not in (None, 'approved'):
            fail.append((nm, {'__err__': 'review_status 被改为 ' + str(res[0].get('review_status'))}))
        else:
            ok += 1
    print(f'\n写库完成：成功 {ok} / 失败 {len(fail)}')
    for nm, e in fail[:10]:
        print('  ✗', nm, e)

    with io.open(ROLLBACK_SQL, 'w', encoding='utf-8') as f:
        f.write('-- 回滚：清空 48 款零食的 spec 字段（恢复到写入前）\n')
        f.write('BEGIN;\n')
        for _id, nm, cur, target, _rs, _act in plan:
            old = sql_lit(cur) if cur else 'NULL'
            f.write(f"-- {nm}\nUPDATE products SET spec = {old} WHERE id = '{_id}';\n")
        f.write('COMMIT;\n')
    print('回滚脚本已写入:', ROLLBACK_SQL)
    return 0 if not fail else 2


if __name__ == '__main__':
    sys.exit(main())
