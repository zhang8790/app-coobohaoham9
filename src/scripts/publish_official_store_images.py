# -*- coding: utf-8 -*-
"""
官方店 19 款商品：上传图片 → 回填商品字段 → 写批次日期。

  product-images/products/<SKU>.jpg         主图   → main_image / image_url / sub_images
  product-images/products/<SKU>-detail.jpg  长图   → detail_images
  stock_batches: produced_at = 建档日, shelf_life_days, expire_at = produced_at + days
                 （OCR 未识别保质期的用品类默认值，属占位数据，须按实物标签替换）

幂等：对象名由 SKU 决定 + x-upsert 覆盖；批次按 (product_id, batch_no) 先查后写。
默认 dry-run，加 --commit 才写。

用法：
  python src/scripts/publish_official_store_images.py
  python src/scripts/publish_official_store_images.py --commit
"""
import argparse
import csv
import datetime
import io
import json
import os
import urllib.error
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = os.path.join(ROOT, 'product-images', 'official_seed.csv')
FINAL = os.path.join(ROOT, 'product-images', 'final')
DETAIL = os.path.join(ROOT, 'product-images', 'detail')
STORE = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
BUCKET = 'product-images'
PREFIX = 'products'
BUILD_DATE = datetime.date(2026, 9, 28)      # 建档日（生产日期占位值）

DEFAULT_SHELF = {
    '平台精选水果拼盘': 30, '羊肉烩面': 180, '海盐芝士条蛋糕': 90, '牛肉': 180,
    '燕麦咖啡味高纤夹心卷': 270, '五香味鸭翅根': 180, '老卤小黑蛋': 180, '老味豆干': 180,
    '糖水型黄桃罐头': 730, '柠檬味脆笋鸭掌筋': 180, '爽露爽米酒': 365,
    '东方树叶绿茶原味茶饮料': 270, '彝香麻辣': 180, '盛兴源花生系列': 240,
    '老卤鸡脚筋': 180, '山药薄片': 270, '榴莲软心蛋卷': 180,
    '人参黄精复合压片糖果': 540, '桑坡手工锅巴': 240,
}


def env():
    e = {}
    for line in io.open(os.path.join(ROOT, '.env'), encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            e[k.strip()] = v.strip().strip('"').strip("'")
    return e['TARO_APP_SUPABASE_URL'], e['TARO_APP_SUPABASE_ANON_KEY']


def req(method, url, key, token=None, body=None, raw=None, ctype='application/json',
        prefer=None, upsert=False):
    h = {'apikey': key}
    if token:
        h['Authorization'] = 'Bearer ' + token
    if upsert:
        h['x-upsert'] = 'true'          # 缺此头 = 只能建不能覆盖（409 Duplicate）
    if raw is not None:
        data, h['Content-Type'] = raw, ctype
    elif body is not None:
        data, h['Content-Type'] = json.dumps(body).encode(), ctype
    else:
        data = None
    if prefer:
        h['Prefer'] = prefer
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
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
    print('管理员登录成功')

    rows = list(csv.DictReader(io.open(SEED, encoding='utf-8-sig')))
    pub = '%s/storage/v1/object/public/%s/%s' % (url, BUCKET, PREFIX)

    todo = []
    for r in rows:
        sku, name = r['sku'], r['name']
        main = os.path.join(FINAL, '%s.jpg' % sku)
        det = os.path.join(DETAIL, '%s.jpg' % sku)
        if not (os.path.exists(main) and os.path.exists(det)):
            print('  ! 缺图', sku)
            continue
        shelf = int(r['shelf_life_days']) if r['shelf_life_days'] else DEFAULT_SHELF.get(name, 180)
        todo.append((sku, name, r['id'], main, det, shelf))
    print('待处理 %d 款' % len(todo))

    if not args.commit:
        print('\n[dry-run] 将执行：')
        print('  上传主图 %d + 长图 %d  → %s/%s/<SKU>[-detail].jpg' % (len(todo), len(todo), BUCKET, PREFIX))
        print('  回填 main_image / image_url / sub_images / detail_images')
        print('  写 stock_batches：produced_at=%s, expire_at=produced_at+shelf_life_days' % BUILD_DATE)
        for sku, name, pid, m, d, shelf in todo[:3]:
            print('    例 %s %s 保质期 %d 天 → 到期 %s' % (sku, name, shelf, BUILD_DATE + datetime.timedelta(days=shelf)))
        return

    # ── ① 上传 ──
    ok_up, fail = 0, []
    for sku, name, pid, main, det, shelf in todo:
        for obj, path in (('%s/%s.jpg' % (PREFIX, sku), main),
                          ('%s/%s-detail.jpg' % (PREFIX, sku), det)):
            data = io.open(path, 'rb').read()
            st, res = req('POST', '%s/storage/v1/object/%s/%s' % (url, BUCKET, obj), key, tok,
                          raw=data, ctype='image/jpeg', upsert=True)
            if st not in (200, 201):
                fail.append((sku, obj, st, res))
                break
        else:
            ok_up += 1
    print('上传 %d/%d 组' % (ok_up, len(todo)))
    for f in fail[:5]:
        print('  ❌', f)
    if fail:
        raise SystemExit(1)

    # ── ② 回填商品字段 ──
    ok_p = 0
    for sku, name, pid, main, det, shelf in todo:
        body = {
            'main_image': '%s/%s.jpg' % (pub, sku),
            'image_url': '%s/%s.jpg' % (pub, sku),
            'sub_images': ['%s/%s.jpg' % (pub, sku)],
            'detail_images': ['%s/%s-detail.jpg' % (pub, sku)],
        }
        st, res = req('PATCH', '%s/rest/v1/products?id=eq.%s' % (url, pid), key, tok,
                      body=body, prefer='return=representation')
        if st in (200, 204) and res:
            ok_p += 1
        elif st in (200, 204):
            print('  ⚠ 回填 0 行（可能被 RLS 拦）', sku)
        else:
            print('  ❌ 回填失败', sku, st, res)
    print('回填 %d/%d 条' % (ok_p, len(todo)))

    # ── ③ 批次日期（幂等：先查后写）──
    ok_b = 0
    for sku, name, pid, main, det, shelf in todo:
        batch_no = 'OS%s-%s' % (BUILD_DATE.strftime('%Y%m%d'), sku)
        st, exist = req('GET', '%s/rest/v1/stock_batches?select=id&product_id=eq.%s&batch_no=eq.%s'
                        % (url, pid, batch_no), key, tok)
        body = {
            'product_id': pid, 'store_id': STORE, 'batch_no': batch_no,
            'qty': 100, 'produced_at': BUILD_DATE.isoformat(),
            'shelf_life_days': shelf,
            'expire_at': (BUILD_DATE + datetime.timedelta(days=shelf)).isoformat(),
            'status': 'normal', 'discount_stage': 'normal', 'decided_by': 'rule',
        }
        if isinstance(exist, list) and exist:
            st, res = req('PATCH', '%s/rest/v1/stock_batches?id=eq.%s' % (url, exist[0]['id']), key, tok,
                          body=body, prefer='return=representation')
        else:
            st, res = req('POST', '%s/rest/v1/stock_batches' % url, key, tok,
                          body=body, prefer='return=representation')
        if st in (200, 201) and res:
            ok_b += 1
        else:
            print('  ❌ 批次失败', sku, st, res)
    print('批次写入 %d/%d 条' % (ok_b, len(todo)))


if __name__ == '__main__':
    main()
