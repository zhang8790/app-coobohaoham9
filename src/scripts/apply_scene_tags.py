#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
给 48 款零食追加「场景专属标签」，让首页 8 个分类不再串货。

背景
----
原方案下 8 个分类共用同一小池 health_tag（健脾养胃/补气养血/…），
导致「宝宝零食」与「老年养生」商品重合 97%。本脚本按选品 CSV 的
category_key（设计意图真相源），给每款商品追加唯一场景标签。

用法
----
    python scripts/apply_scene_tags.py            # dry-run，只打印
    python scripts/apply_scene_tags.py --commit   # 真写库

写库凭据：管理员会话 admin@laidianyouxi.com（命中 is_admin() 的 RLS 分支）。
仓库内只有 anon key，无 service_role。

注意
----
- products.health_tag 是 text[]，**无 CHECK 约束**（迁移 00100 仅 COMMENT），可自由写新值。
- 场景标签**不加入** HEALTH_TAGS 常量（避免污染商家后台下拉 / 雷达图分母 / dishAnalyzer）。
- 幂等：已含该标签的商品会跳过。
- 会同时生成回滚 SQL（不含 ==== 装饰线，可直接粘贴执行）。
"""
import io
import csv
import json
import sys
import urllib.request
import urllib.error

# ---------------- 配置 ----------------
CSV = '食品选品种子_48SKU_2026-09-23.csv'
HZ_STORE = '70778d6b-d819-41fc-87a3-8766a78eb60d'
ADMIN_EMAIL = 'admin@laidianyouxi.com'
ADMIN_PWD = 'Admin123456'
ROLLBACK_SQL = '回滚_场景标签_48SKU_2026-09-23.sql'

SCENE_TAG = {
    'children': '适合儿童',
    'pregnant': '适合孕产',
    'elderly': '适合银发',
    'sleep': '适合睡前',
    'digestion': '适合肠胃虚弱',
    'immunity': '适合体虚',
    'overtime': '适合熬夜',
    # allergy 不打专属标签：敏感防护走「排除你的过敏原」特判，本来就应是全集
}


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


def sql_arr(tags):
    lit = ', '.join("'" + t.replace("'", "''") + "'" for t in tags)
    return 'ARRAY[' + lit + ']'


def main():
    commit = '--commit' in sys.argv

    rows = list(csv.DictReader(io.open(CSV, encoding='utf-8-sig')))
    name2cat = {r['name'].strip(): r['category_key'] for r in rows}

    token = login()
    online = req('GET', f'products?select=id,name,health_tag,review_status&store_id=eq.{HZ_STORE}&limit=200', token)
    if isinstance(online, dict):
        print('拉取商品失败:', online)
        return 1
    online = [p for p in online if p.get('health_tag')]

    todo, skipped, missing = [], [], []
    for p in online:
        nm = (p.get('name') or '').strip()
        cat = name2cat.get(nm)
        if not cat:
            missing.append(nm)
            continue
        tag = SCENE_TAG.get(cat)
        cur = list(p.get('health_tag') or [])
        if not tag:
            skipped.append((nm, cat, 'allergy 不打专属标签'))
            continue
        if tag in cur:
            skipped.append((nm, cat, '已含'))
            continue
        todo.append((p['id'], nm, cat, tag, cur, cur + [tag]))

    print(f'线上候选 {len(online)} 款 | 待更新 {len(todo)} | 跳过 {len(skipped)} | CSV 未匹配 {len(missing)}')
    if missing:
        print('  ⚠ 未匹配:', missing[:10])

    plan = sorted(todo, key=lambda x: x[1])
    for _id, nm, cat, tag, old, new in plan:
        print(f'  {nm[:22]:<24} [{cat}] {"、".join(old)}  → +{tag}')

    if not commit:
        print('\n[dry-run] 未写库。确认无误后加 --commit 执行。')
        return 0

    ok, fail = 0, []
    for _id, nm, cat, tag, old, new in plan:
        res = req('PATCH', f"products?id=eq.{_id}", token, {'health_tag': new})
        if isinstance(res, dict) and res.get('__err__'):
            fail.append((nm, res))
        elif isinstance(res, list) and res and (res[0].get('review_status') not in (None, 'approved')):
            fail.append((nm, {'__err__': 'review_status 被改动为 ' + str(res[0].get('review_status'))}))
        else:
            ok += 1
    print(f'\n写库完成：成功 {ok} / 失败 {len(fail)}')
    for nm, e in fail[:10]:
        print('  ✗', nm, e)

    # 回滚 SQL：恢复为更新前的 health_tag（零 ==== 装饰线，可直接粘贴）
    with io.open(ROLLBACK_SQL, 'w', encoding='utf-8') as f:
        f.write('-- 回滚：撤销 48 款零食的场景专属标签（恢复到追加前）\n')
        f.write('-- 生成时间：本次 apply_scene_tags.py 执行时\n')
        f.write('BEGIN;\n')
        for _id, nm, cat, tag, old, new in plan:
            f.write(f"-- {nm}\nUPDATE products SET health_tag = {sql_arr(old)} WHERE id = '{_id}';\n")
        f.write('COMMIT;\n')
    print('回滚脚本已写入:', ROLLBACK_SQL)
    return 0 if not fail else 2


if __name__ == '__main__':
    sys.exit(main())
