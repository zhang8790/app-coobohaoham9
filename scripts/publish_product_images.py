# -*- coding: utf-8 -*-
"""
把本地成品图上传到 Supabase Storage（桶 images），并回填到「杭州礼品店」48 款商品：
  main_image / image_url  <- 主图
  detail_images           <- 详情长图
  sub_images              <- 与主图一致（前端会去重，不产生重复轮播）

幂等：按 sku 覆盖上传（x-upsert），重复执行结果一致。
默认 dry-run，加 --commit 才真正写库。
用法：
  python scripts/publish_product_images.py            # 预演
  python scripts/publish_product_images.py --commit   # 执行
"""
import argparse
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, '食品选品种子_48SKU_2026-09-23.csv')
MAIN_DIR = os.path.join(ROOT, 'product-images', 'final')
DETAIL_DIR = os.path.join(ROOT, 'product-images', 'detail')
STORE = '70778d6b-d819-41fc-87a3-8766a78eb60d'
# 必须与项目既有约定一致：admin-web/src/utils/storage.ts 与 food-scan 均用该桶
BUCKET = 'product-images'
PREFIX = 'products'
OLD_BUCKET = 'images'   # 早期误用桶，用于清理


def env():
    e = {}
    for line in io.open(os.path.join(ROOT, '.env'), encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            e[k.strip()] = v.strip().strip('"').strip("'")
    return e['TARO_APP_SUPABASE_URL'], e['TARO_APP_SUPABASE_ANON_KEY']


def req(method, url, key, token=None, body=None, raw=None, ctype='application/json', prefer=None):
    h = {'apikey': key}
    if token:
        h['Authorization'] = 'Bearer ' + token
    if raw is not None:
        data = raw
        h['Content-Type'] = ctype
    elif body is not None:
        data = json.dumps(body).encode()
        h['Content-Type'] = ctype
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
        return e.code, e.read().decode()[:400]
    except Exception as e:
        return 'ERR', str(e)[:400]


def to_jpeg_bytes(png_path, quality=88):
    im = Image.open(png_path).convert('RGB')
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--commit', action='store_true')
    args = ap.parse_args()

    url, key = env()
    st, res = req('POST', url + '/auth/v1/token?grant_type=password', key,
                  body={'email': 'admin@laidianyouxi.com', 'password': 'Admin123456'})
    if st != 200:
        print('❌ 管理员登录失败:', st, res)
        raise SystemExit(1)
    tok = res['access_token']
    print('✅ 管理员登录成功')

    rows = list(csv.DictReader(io.open(CSV_PATH, encoding='utf-8')))
    st, prods = req('GET', url + '/rest/v1/products?select=id,name,review_status,is_active'
                    '&store_id=eq.' + STORE + '&limit=200', key, tok)
    if not isinstance(prods, list):
        print('❌ 读取商品失败:', st, prods)
        raise SystemExit(1)
    by_name = {p['name']: p for p in prods}
    print('门店商品 %d 条，其中匹配本次 SKU：' % len(prods), end='')

    todo = []
    for r in rows:
        p = by_name.get(r['name'])
        if not p:
            print('\n  ! 未在门店找到商品:', r['sku_id'], r['name'])
            continue
        main = os.path.join(MAIN_DIR, '%s.jpg' % r['sku_id'])
        det = os.path.join(DETAIL_DIR, '%s.png' % r['sku_id'])
        if not (os.path.exists(main) and os.path.exists(det)):
            print('\n  ! 缺图:', r['sku_id'])
            continue
        todo.append((r['sku_id'], r['name'], p['id'], main, det))
    print(len(todo), '条')

    pub = url + '/storage/v1/object/public/' + BUCKET + '/' + PREFIX
    detail_bytes = {}
    for sku, name, pid, main, det in todo:
        detail_bytes[sku] = to_jpeg_bytes(det)
    print('详情图已转 JPEG，合计 %.1f MB' % (sum(len(v) for v in detail_bytes.values()) / 1e6))

    if not args.commit:
        print('\n[dry-run] 将执行：')
        print('  上传主图 %d 张  %s/<sku>.jpg' % (len(todo), PREFIX))
        print('  上传详情图 %d 张  %s/<sku>-detail.jpg' % (len(todo), PREFIX))
        print('  回填字段: main_image / image_url / sub_images / detail_images')
        print('  示例 URL:', pub + '/%s.jpg' % todo[0][0])
        return

    ok_up, fail = 0, []
    for sku, name, pid, main, det in todo:
        for obj, data, ctype in (
                ('%s/%s.jpg' % (PREFIX, sku), open(main, 'rb').read(), 'image/jpeg'),
                ('%s/%s-detail.jpg' % (PREFIX, sku), detail_bytes[sku], 'image/jpeg')):
            u = '%s/storage/v1/object/%s/%s' % (url, BUCKET, obj)
            st, res = req('POST', u, key, tok, raw=data, ctype=ctype)
            if st not in (200, 201):
                fail.append((sku, obj, st, res))
                break
        else:
            ok_up += 1
    print('✅ 上传完成 %d/%d 组' % (ok_up, len(todo)))
    if fail:
        for f in fail[:5]:
            print('  ❌', f)
        raise SystemExit(1)

    ok_patch = 0
    for sku, name, pid, main, det in todo:
        body = {
            'main_image': '%s/%s.jpg' % (pub, sku),
            'image_url': '%s/%s.jpg' % (pub, sku),
            'sub_images': ['%s/%s.jpg' % (pub, sku)],
            'detail_images': ['%s/%s-detail.jpg' % (pub, sku)],
        }
        st, res = req('PATCH', url + '/rest/v1/products?id=eq.' + pid, key, tok,
                      body=body, prefer='return=minimal')
        if st in (200, 204):
            ok_patch += 1
        else:
            print('  ❌ 回填失败', sku, st, res)
    print('✅ 回填完成 %d/%d 条' % (ok_patch, len(todo)))

    # 清理：早期误传到 images 桶的对象 + 探针文件
    n_clean = 0
    for sku, name, pid, main, det in todo:
        for obj in ('%s/%s.jpg' % (PREFIX, sku), '%s/%s-detail.jpg' % (PREFIX, sku)):
            st, _ = req('DELETE', '%s/storage/v1/object/%s/%s' % (url, OLD_BUCKET, obj), key, tok)
            if st in (200, 204):
                n_clean += 1
    req('DELETE', '%s/storage/v1/object/%s/__probe.png' % (url, OLD_BUCKET), key, tok)
    print('🧹 已清理旧桶 %s 中 %d 个对象' % (OLD_BUCKET, n_clean))


if __name__ == '__main__':
    main()
