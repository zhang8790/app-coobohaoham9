#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全面扫描源码与构建产物中的乱码（U+FFFD 替换字符 = 真正的乱码）。
思路：terser 会把 ord>255 的字符转成反斜杠 u XXXX（emoji 是 surrogate 对），
所以先把这些转义反解成明文，再判断是否存在 U+FFFD。"""
import os, re, sys

ROOT = r"C:\Users\zhanglin\Desktop\app-coobohaoham9"
UNI = re.compile(r'\\u([0-9a-fA-F]{4})')

def decode_unicode_escapes(s: str) -> str:
    """把 \\uXXXX 反解为字符，并把相邻的 surrogate 对合并成正确的码点（emoji）。"""
    s = UNI.sub(lambda m: chr(int(m.group(1), 16)), s)
    # 合并 surrogate 对：把散落的 D800-DFFF 相邻码元合成一个 astral 码点
    try:
        return s.encode('utf-16', 'surrogatepass').decode('utf-16')
    except Exception:
        return s

def scan_text(raw: bytes, label: str):
    """返回 (has_fffd, decoded_len)。utf-8 严格失败也视为潜在乱码。"""
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        # 字节层面就不是合法 utf-8 → 必然乱码
        return True, 0, "utf-8-decode-error"
    decoded = decode_unicode_escapes(text)
    return ('\ufffd' in decoded), len(decoded), None

# 源码文本后缀
SRC_EXT = {'.ts', '.tsx', '.js', '.jsx', '.scss', '.css', '.json', '.wxml', '.wxss', '.md'}
# 产物扫描范围（js/wxml/wxss/json）
DIST_EXT = {'.js', '.wxml', '.wxss', '.json'}

SKIP_DIRS = {'.git', 'node_modules', 'dist', 'dist_new', 'dist-cloud', 'deliverables',
             '.workbuddy', 'miniprogram_npm'}

def iter_files(root, exts):
    for dp, dn, fn in os.walk(root):
        # 跳过无关目录（dist_new 单独处理）
        parts = dp.split(os.sep)
        if any(p in SKIP_DIRS for p in parts):
            continue
        for f in fn:
            if os.path.splitext(f)[1] in exts:
                yield os.path.join(dp, f)

src_hits = []
print("===== 源码扫描（src / 配置 / 脚本，排除 dist*）=====")
for path in iter_files(ROOT, SRC_EXT):
    try:
        with open(path, 'rb') as fh:
            raw = fh.read()
    except Exception as e:
        continue
    has, ln, err = scan_text(raw, path)
    if has:
        src_hits.append((path, err))
        print(f"  [乱码] {os.path.relpath(path, ROOT)}  {err or ''}")

print(f"  源码命中乱码文件数: {len(src_hits)}")

# 产物扫描
dist_root = os.path.join(ROOT, 'dist_new')
dist_hits = []
print("\n===== 构建产物扫描（dist_new）=====")
for dp, dn, fn in os.walk(dist_root):
    for f in fn:
        if os.path.splitext(f)[1] in DIST_EXT:
            path = os.path.join(dp, f)
            try:
                with open(path, 'rb') as fh:
                    raw = fh.read()
            except Exception:
                continue
            has, ln, err = scan_text(raw, path)
            if has:
                dist_hits.append(path)
                # 找出具体包含 FFFD 的片段
                try:
                    text = raw.decode('utf-8')
                except UnicodeDecodeError:
                    text = raw.decode('utf-8', 'replace')
                text = decode_unicode_escapes(text)
                idxs = [i for i, c in enumerate(text) if c == '\ufffd']
                snippet = text[max(0, idxs[0]-30):idxs[0]+30] if idxs else ''
                print(f"  [乱码] {os.path.relpath(path, ROOT)}  片段: ...{snippet}...")

print(f"  产物命中乱码文件数: {len(dist_hits)}")

# 专项：确认关键 emoji 在产物中是否正确落盘（首页 + 金刚区）
print("\n===== 关键 emoji 落盘校验（dist_new/pages/index/index.js）=====")
idx_path = os.path.join(dist_root, 'pages', 'index', 'index.js')
if os.path.exists(idx_path):
    with open(idx_path, 'rb') as fh:
        raw = fh.read()
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        text = raw.decode('utf-8', 'replace')
    text = decode_unicode_escapes(text)
    checks = {
        '🔍 搜索': '🔍',
        '📷 扫码': '📷',
        '📍 定位': '📍',
        '扫码配料 文案': '扫码配料',
        '搜索好物 文案': '搜索好物',
    }
    for name, token in checks.items():
        print(f"  {'OK ' if token in text else '缺失'} {name}: {token!r}")

# 金刚区 emoji 校验（可能因独立 chunk 在 common.js 或 index.js）
print("\n===== 金刚区 emoji 落盘校验（全部 dist_new js）=====")
cat_emojis = ['🍼','🥕','👵','🌙','🥣','💪','🛡️','⚡','🌿']
found = {e: False for e in cat_emojis}
for dp, dn, fn in os.walk(dist_root):
    for f in fn:
        if f.endswith('.js'):
            p = os.path.join(dp, f)
            try:
                raw = open(p, 'rb').read()
                t = decode_unicode_escapes(raw.decode('utf-8', 'replace'))
            except Exception:
                continue
            for e in cat_emojis:
                if e in t:
                    found[e] = True
for e in cat_emojis:
    print(f"  {'OK ' if found[e] else '缺失'} {e}")

print("\n===== 结论 =====")
if not src_hits and not dist_hits:
    print("未发现任何 U+FFFD 乱码（源码与产物均干净）。")
else:
    print(f"源码乱码 {len(src_hits)} 处，产物乱码 {len(dist_hits)} 处，需修复。")
