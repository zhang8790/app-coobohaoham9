# -*- coding: utf-8 -*-
"""
给官方店 19 款商品挂分类（category_id 一级 / sub_category_id 二级），
并清掉全库仍处上架状态的「【待录入】」占位商品。

为什么挂现有场景而不是新增「休闲零食」：
  首页金刚区与好物页左栏都读 store_categories(scope='global', is_active=true)。
  新增一级若 is_active=true → 首页会多出第 9 个入口，破坏已拍板的 8 场景设计；
  若 is_active=false → 两处都不显示，等于没挂。所以走「挂靠现有场景」，可逆。

默认 dry-run，--commit 才写。
用法：
  python src/scripts/assign_official_categories.py
  python src/scripts/assign_official_categories.py --commit
"""
import argparse
import csv
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = os.path.join(ROOT, 'product-images', 'official_seed.csv')

# 一级场景 id
L1 = {
    '宝宝零食': '689bc729-5e75-4d16-b573-b1861d89d228',
    '孕产营养': '6ed844cd-7163-4006-b005-6496a0647966',
    '老年养生': 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9',
    '舒心食养': 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4',
    '肠胃食养': 'ef38bc5b-3749-4404-a1a1-5db3270b9254',
    '温润食养': '8d545cbf-cf34-4d56-ac43-a35142365298',
    '敏感防护': 'bf890924-5893-48c5-bc20-b7120ad415e7',
    '熬夜加餐': '52f0659d-2aac-4533-87c5-04a07cf529a4',
}
# 二级 id（一级名 → 二级名 → id）
L2 = {
    '温润食养': {'山药脆': 'dff3697d-4e08-4a63-976b-19d1bbdd4460',
                 '润养含片': 'f7007cc7-c91b-47d0-85eb-ceec016c2dbd'},
    '老年养生': {'坚果谷物': '97247c46-6fb7-40ef-a8a8-c0f413cd99b7',
                 '润燥冻干': '4bc0f199-17e5-46b9-a913-2cf71b65f572'},
    '熬夜加餐': {'熬夜轻脆': 'dad6800f-5584-4f2d-9b04-17736e1406b1'},
}
# 商品名 → (一级, 二级或 None)
ASSIGN = {
    '山药薄片': ('温润食养', '山药脆'),
    '人参黄精复合压片糖果': ('温润食养', '润养含片'),
    '盛兴源花生系列': ('老年养生', '坚果谷物'),
    '糖水型黄桃罐头': ('老年养生', '润燥冻干'),
    '平台精选水果拼盘': ('熬夜加餐', '熬夜轻脆'),
}
DEFAULT_L1 = '熬夜加餐'


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
        data, h['Content-Type'] = json.dumps(body).encode(), 'application/json'
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
    ap.add_argument('--commit', action='store_true')
    args = ap.parse_args()

    url, key = env()
    st, res = req('POST', url + '/auth/v1/token?grant_type=password', key,
                  body={'email': 'admin@laidianyouxi.com', 'password': 'Admin123456'})
    if st != 200:
        print('登录失败', st, res)
        raise SystemExit(1)
    tok = res['access_token']

    rows = list(csv.DictReader(io.open(SEED, encoding='utf-8-sig')))
    plan = []
    for r in rows:
        name = r['name']
        l1, l2 = ASSIGN.get(name, (DEFAULT_L1, None))
        body = {'category_id': L1[l1]}
        body['sub_category_id'] = L2.get(l1, {}).get(l2) if l2 else None
        plan.append((r['sku'], name, r['id'], l1, l2, body))

    print('── 挂分类方案 ──')
    for sku, name, pid, l1, l2, body in plan:
        print('  %-4s %-22s → %s%s' % (sku, name[:20], l1, (' / ' + l2) if l2 else ''))

    # 仍上架的「【待录入】」占位商品
    # PostgREST 的 like 通配符是 * 不是 %，且中文需 URL 编码
    like = urllib.parse.quote('【待录入】*')
    st, junk = req('GET', "%s/rest/v1/products?select=id,name,store_id&name=like.%s&is_active=eq.true"
                   % (url, like), key, tok)
    junk = junk if isinstance(junk, list) else []
    print('\n待录入占位商品仍上架：%d 条' % len(junk))
    for j in junk:
        print('  %s  %s' % (j['name'], j['id'][:8]))

    if not args.commit:
        print('\n[dry-run] 加 --commit 执行（挂分类 %d 条 + 下线占位 %d 条）' % (len(plan), len(junk)))
        return

    ok = 0
    for sku, name, pid, l1, l2, body in plan:
        st, res = req('PATCH', '%s/rest/v1/products?id=eq.%s' % (url, pid), key, tok,
                      body=body, prefer='return=representation')
        if st in (200, 204) and res:
            ok += 1
        else:
            print('  ❌ 挂分类失败', sku, st, res)
    print('挂分类 %d/%d 条' % (ok, len(plan)))

    off = 0
    for j in junk:
        st, res = req('PATCH', '%s/rest/v1/products?id=eq.%s' % (url, j['id']), key, tok,
                      body={'is_active': False}, prefer='return=representation')
        if st in (200, 204) and res:
            off += 1
        else:
            print('  ❌ 下线失败', j['name'], st, res)
    print('占位商品下线 %d/%d 条' % (off, len(junk)))


if __name__ == '__main__':
    main()
