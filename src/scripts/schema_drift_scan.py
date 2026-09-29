#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
schema_drift_scan.py — 扫描 src/ 里 `from('t').select('cols')` 引用的列是否真实存在。

动因：2026-09-29 线上「头像保存失败」，真因是 public.profiles 缺 avatar_url 列
（代码 6 处引用 → 42703），属典型的 schema drift：代码先行、迁移没跟上。
本脚本把这类「代码引用了库里不存在的列」一次性扫出来。

用法：python src/scripts/schema_drift_scan.py
"""
import os, re, sys, csv, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 允许被忽略的伪列（PostgREST 内嵌关联 / 通配 / 计算别名）
IGNORE = {'*'}

SELECT_RE = re.compile(r"from\(\s*['\"]([a-z_][a-z0-9_]*)['\"]\s*\)([\s\S]{0,200}?)\.select\(\s*['\"]([^'\"]+)['\"]", re.M)


def load_columns():
    """读线上表结构，返回 {table: set(cols)}

    优先读 $1 指定的 CSV（由 `supabase db query --linked --output csv` 产出，
    两列：table_name, cols；cols 内含逗号故被双引号包裹，用 csv 模块解析）。
    为什么不直接 subprocess 调 supabase：Windows 上 supabase 是 shim 而非 .exe，
    subprocess 会 FileNotFoundError。约定由 bash 侧预生成 CSV 再传路径。
    """
    if len(sys.argv) > 1 and os.path.isfile(sys.argv[1]):
        tables = {}
        with open(sys.argv[1], encoding='utf-8', newline='') as fh:
            for row in csv.reader(fh):
                if len(row) < 2 or row[0].strip() in ('table_name', ''):
                    continue
                tables[row[0].strip()] = {c.strip() for c in row[1].split(',') if c.strip()}
        return tables

    # 兜底：直连查询（需要 supabase CLI 在 PATH 且能被 exec）
    sql = ("select table_name||E'\\t'||string_agg(column_name, ',') from information_schema.columns "
           "where table_schema='public' group by table_name;")
    env = dict(os.environ, HOME='/c/Users/zhanglin')
    p = subprocess.run('supabase db query --linked "%s"' % sql,
                       capture_output=True, text=True, cwd=ROOT, env=env, timeout=180, shell=True)
    tables = {}
    for line in p.stdout.splitlines():
        line = line.strip().strip('│').strip()
        if '\t' not in line or line.startswith('table_name'):
            continue
        name, cols = line.split('\t', 1)
        if name.strip():
            tables[name.strip()] = {c.strip() for c in cols.split(',') if c.strip()}
    return tables


def iter_ts_files():
    for base, _dirs, files in os.walk(os.path.join(ROOT, 'src')):
        for f in files:
            if f.endswith(('.ts', '.tsx')):
                yield os.path.join(base, f)


def parse_cols(sel: str):
    """把 'id, nickname, profiles(id, nickname)' 拆成顶层列名列表"""
    cols, depth, buf = [], 0, ''
    for ch in sel:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            cols.append(buf); buf = ''
        else:
            buf += ch
    if buf:
        cols.append(buf)
    out = []
    for c in cols:
        c = c.strip()
        if not c:
            continue
        if '(' in c:            # 内嵌关联（profiles(...) / table!fk(...)），跳过不校验
            continue
        # 去掉别名 a:b 与 !hint
        c = c.split(':')[-1].split('!')[0].strip()
        if c:
            out.append(c)
    return out


def load_checks(path):
    """读 CHECK 约束 CSV（两列：tbl, def），解析出 {table: {column: set(allowed)}}。

    只处理 `col = ANY (ARRAY['a','b',...])` 形式（枚举型状态列）。
    Bash 侧生成方式：
      supabase db query --linked --output csv \\
        "select conrelid::regclass::text as tbl, pg_get_constraintdef(oid) as def
           from pg_constraint where contype='c' and connamespace='public'::regnamespace
             and pg_get_constraintdef(oid) ilike '%any (array%';" > checks.csv
    """
    out = {}
    if not path or not os.path.isfile(path):
        return out
    any_re = re.compile(r"\(([a-z_][a-z0-9_]*)\s*=\s*ANY\s*\(ARRAY\[(.*?)\]\)\)", re.I)
    with open(path, encoding='utf-8', newline='') as fh:
        for row in csv.reader(fh):
            if len(row) < 2 or row[0].strip() in ('tbl', 'table_name', ''):
                continue
            tbl = row[0].strip().split('.')[-1]
            for col, vals in any_re.findall(row[1]):
                allowed = set(re.findall(r"'([^']*)'", vals))
                if allowed:
                    out.setdefault(tbl, {})[col] = allowed
    return out


def extract_object_entries(body: str):
    """从对象字面量取顶层 (key, literal_value)。value 非字符串字面量时为 None。"""
    keys, depth, buf = [], 0, ''
    for ch in body:
        if ch in '{[(':
            depth += 1
        elif ch in '}])':
            depth -= 1
        if depth == 0:
            if ch == ',':
                keys.append(buf); buf = ''
                continue
            buf += ch
        else:
            buf += ch
    if buf:
        keys.append(buf)

    out = []
    for seg in keys:
        seg = seg.strip()
        if not seg or seg.startswith('...'):
            continue
        m = re.match(r"^([a-z_][a-z0-9_]*)\s*:\s*(.*)$", seg, re.S)
        if not m:
            continue
        key, raw = m.group(1), m.group(2).strip()
        lit = re.match(r"^['\"]([^'\"]*)['\"]$", raw)
        out.append((key, lit.group(1) if lit else None))
    return out


def balanced_body(text: str, start: int):
    """取调用实参里的对象字面量内容。

    只在实参**本身就是对象字面量**时返回内容：
      .insert({ a: 1 })   → ' a: 1 '
      .insert([{ a: 1 }]) → ' a: 1 '
      .insert(rows) / .update(params as any) / .insert(build()) → None（变量载荷无从静态校验）
    """
    i = start
    # 跳过空白
    while i < len(text) and text[i] in ' \t\r\n':
        i += 1
    if i >= len(text):
        return None
    if text[i] == '[':                      # 数组形式 [{...}]
        i += 1
        while i < len(text) and text[i] in ' \t\r\n':
            i += 1
    if i >= len(text) or text[i] != '{':    # 首字符不是 '{' ⇒ 变量/表达式载荷，放弃
        return None

    depth, j = 0, i
    while j < len(text):
        if text[j] == '{':
            depth += 1
        elif text[j] == '}':
            depth -= 1
            if depth == 0:
                return text[i + 1:j]
        j += 1
    return None


TABLE_RE = re.compile(r"from\(\s*['\"]([a-z_][a-z0-9_]*)['\"]\s*\)")
WRITE_RE = re.compile(r"\.(update|insert)\s*\(", re.M)


def scan_writes(text, tables, rel, checks=None):
    """检查 .update({...}) / .insert({...}) 的 key 是否为真实列，值是否满足 CHECK 约束"""
    checks = checks or {}
    found, bad_values = [], []
    # 以每个 from('t') 为锚，向后 500 字符内找最近的 update/insert
    for tm in TABLE_RE.finditer(text):
        table = tm.group(1)
        if table not in tables:
            continue
        # 只看本条语句：在下一个 ';' 或下一次 .from( 处截断，避免窗口跨到下一条语句而误报
        # （例：await supabase.from('profiles').select(...); 之后紧跟的另一个
        #   supabase.from('x').update({...}) 会被错误归因到 profiles）
        window = text[tm.end():tm.end() + 500]
        cut = len(window)
        for token in (';', '.from('):
            i = window.find(token)
            if i >= 0:
                cut = min(cut, i)
        window = window[:cut]
        wm = WRITE_RE.search(window)
        if not wm:
            continue
        body = balanced_body(text, tm.end() + wm.end())
        if body is None:
            continue
        entries = extract_object_entries(body)
        line = text[:tm.start()].count('\n') + 1

        unknown = [k for k, _ in entries if k not in tables[table]]
        if unknown:
            found.append((rel, line, table, wm.group(1), unknown))

        # 状态值 vs CHECK 约束（例：withdrawals.status 写 'paid' 但词表无 'paid'）
        for k, v in entries:
            allowed = checks.get(table, {}).get(k)
            if allowed and v is not None and v not in allowed:
                bad_values.append((rel, line, table, k, v, sorted(allowed)))
    return found, bad_values


def main():
    tables = load_columns()
    if not tables:
        print('❌ 无法读取线上表结构（未提供 schema CSV 且 supabase CLI 不可用）')
        return 2
    checks = load_checks(sys.argv[2] if len(sys.argv) > 2 else None)
    print('线上 public 表数:', len(tables), '｜枚举约束表数:', len(checks))

    problems = []
    checked = 0
    write_problems = []
    value_problems = []
    for path in iter_ts_files():
        try:
            text = open(path, encoding='utf-8').read()
        except Exception:
            continue
        rel = os.path.relpath(path, ROOT)
        for m in SELECT_RE.finditer(text):
            table, sel = m.group(1), m.group(3)
            if table not in tables:
                continue                      # 视图/RPC/未在 public 的表，跳过
            checked += 1
            unknown = [c for c in parse_cols(sel)
                       if c not in IGNORE and c not in tables[table]]
            if unknown:
                line = text[:m.start()].count('\n') + 1
                problems.append((rel, line, table, unknown))
        wp, vp = scan_writes(text, tables, rel, checks)
        write_problems.extend(wp)
        value_problems.extend(vp)

    print('校验 select 语句数:', checked)
    if not problems:
        print('✅ select 未发现 schema drift')
    else:
        print('\n⚠️ select 发现 %d 处引用了不存在的列：' % len(problems))
        for f, line, table, cols in problems:
            print('  %s:%d  %s → %s' % (f, line, table, ', '.join(cols)))

    if not write_problems:
        print('✅ insert/update 载荷未发现 schema drift')
    else:
        print('\n⚠️ insert/update 发现 %d 处引用了不存在的列：' % len(write_problems))
        for f, line, table, op, cols in write_problems:
            print('  %s:%d  %s.%s → %s' % (f, line, table, op, ', '.join(cols)))

    if not value_problems:
        print('✅ 写入值未违反枚举 CHECK 约束')
    else:
        print('\n⚠️ 写入值违反 CHECK 约束 %d 处：' % len(value_problems))
        for f, line, table, col, val, allowed in value_problems:
            print('  %s:%d  %s.%s = %r  ∉ %s' % (f, line, table, col, val, allowed))

    return 1 if (problems or write_problems or value_problems) else 0


if __name__ == '__main__':
    sys.exit(main())
