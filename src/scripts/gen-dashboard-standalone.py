#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
gen-dashboard-standalone.py
把「依赖 _shared/ 的 Edge Function」转换成「零外部依赖的自包含单文件」，
用于在 Supabase Dashboard 网页编辑器里粘贴部署。

背景（必读）：
  Dashboard 的 Deploy function 编辑器只上传你粘贴的那一个文件，不会打包
  同级的 supabase/functions/_shared/ 目录。因此任何 `import ... from '../_shared/xxx.ts'`
  的函数在网页编辑器里必然报：Module not found ".../_shared/xxx.ts"。
  本脚本把被 import 的 _shared 符号原地内联，产出可粘贴的单文件版本。

用法：
  # 默认处理 refund-order
  python src/scripts/gen-dashboard-standalone.py

  # 处理其它函数（同样把 `_shared` 依赖内联）
  python src/scripts/gen-dashboard-standalone.py --fn create-order

  # 只检查是否与仓库版本同步（CI / 提交前用），不同步则退出码 1
  python src/scripts/gen-dashboard-standalone.py --check

维护约定：
  改动 index.ts 或 _shared/*.ts 后，务必重跑本脚本，否则 Dashboard 版会与 CLI 版
  产生「两套资金口径」漂移（资损风险）。
"""

import argparse
import io
import os
import re
import sys

# 本脚本位于 src/scripts/，项目根在两级之上（2026-09-27 目录迁移后修正）
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FUNCS_DIR = os.path.join(ROOT, "supabase", "functions")
OUT_DIR = os.path.join(FUNCS_DIR, "_dashboard-paste")  # `_` 前缀目录不会被 CLI 当函数部署

HEADER = """/**
 * {fn} Edge Function —— 自包含单文件版（用于 Supabase Dashboard 网页编辑器粘贴部署）
 *
 * ⚠️ 本文件由 `src/scripts/gen-dashboard-standalone.py` 自动生成，请勿手工编辑。
 *    源文件：supabase/functions/{fn}/index.ts + 其 import 的 _shared/*.ts
 *
 * 为什么需要它：
 *    Dashboard 的 Deploy function 编辑器只上传单个文件，不打包 `../_shared/`，
 *    直接粘贴 index.ts 必然报 `Module not found ".../_shared/xxx.ts"`。
 *    本文件已把被依赖的 _shared 符号原地内联，零外部依赖，可直接粘贴部署。
 *
 * 部署方式（二选一）：
 *   A. Dashboard 网页编辑器：打开 {fn} → 全选粘贴本文件内容 → Deploy
 *   B. CLI（推荐，保持单一事实源）：
 *        cd 项目根 && supabase login && supabase functions deploy {fn}
 *
 * 重新生成：python src/scripts/gen-dashboard-standalone.py --fn {fn}
 */

"""


def read(p: str) -> str:
    with io.open(p, encoding="utf-8") as f:
        return f.read()


def write(p: str, s: str) -> None:
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def match_brace(src: str, open_idx: int) -> int:
    """从 src[open_idx] == '{' 开始做花括号配平，返回配对 '}' 的下标。"""
    depth = 0
    i = open_idx
    n = len(src)
    while i < n:
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("花括号不配平，无法提取声明体")


def match_paren(src: str, open_idx: int) -> int:
    """从 src[open_idx] == '(' 开始做圆括号配平，返回配对 ')' 的下标。"""
    depth = 0
    i = open_idx
    n = len(src)
    while i < n:
        c = src[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("圆括号不配平，无法提取参数表")


DECL_RE = re.compile(
    r"(?m)^export\s+(?:async\s+)?"
    r"(?P<kind>function|const|let|var|type|interface|enum|class)\s+"
    r"(?P<name>[A-Za-z_$][\w$]*)"
)


def _decl_end(src: str, kind: str, m: "re.Match", next_start: int) -> int:
    """返回该声明最后一个字符的下标。next_start = 下一个顶层声明的起点（用于无分号声明的兜底）。"""
    if kind == "function":
        # ⚠️ 不能直接找第一个 '{'：参数/返回类型里可能含对象类型字面量（如 Array<{ price }>）。
        #    先配平参数圆括号，再跳过可选返回类型注解，最后定位函数体 '{'。
        paren = src.index("(", m.end())
        cp = match_paren(src, paren)
        bm = re.search(r"\s*(?::[^{]*?)?\s*\{", src[cp:])
        if not bm:
            raise ValueError(f"找不到函数体起始大括号：{m.group('name')}")
        return match_brace(src, cp + bm.end() - 1)
    if kind in ("class", "interface", "enum"):
        return match_brace(src, src.index("{", m.end()))
    if kind == "type":
        end = src.find(";", m.end())
        return end if 0 <= end < next_start else next_start - 1
    # const / let / var：扫描到深度 0 的分号（跳过数组/对象/调用内部的分号）
    depth = 0
    i = m.end()
    while i < len(src) and i < next_start:
        c = src[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == ";" and depth == 0:
            return i
        i += 1
    # 无分号声明（如 `] as const` 后直接换行）→ 以「下一个顶层声明」为界，回退掉尾部空白
    j = next_start - 1
    while j > m.end() and src[j].isspace():
        j -= 1
    return j


def _absorb_leading_comments(src: str, start: int) -> int:
    """把 start 上方紧邻的 JSDoc / 行注释一并纳入，输出时保留原注释便于阅读。"""
    lines = src[:start].split("\n")
    j = len(lines) - 1
    while j >= 0 and lines[j].strip() == "" and (len(lines) - 1 - j) < 2:
        j -= 1
    absorbed = 0
    while j >= 0:
        if lines[j].strip().startswith(("*", "/*", "*/", "//")):
            j -= 1
            absorbed += 1
        else:
            break
    if not absorbed:
        return start
    ns = len("\n".join(lines[: j + 1]))
    return ns + 1 if ns else ns


def collect_exported(src: str) -> dict:
    """收集共享模块中所有顶层导出符号：name -> {kind, body_start, end}。"""
    ms = list(DECL_RE.finditer(src))
    out = {}
    for i, m in enumerate(ms):
        nxt = ms[i + 1].start() if i + 1 < len(ms) else len(src)
        out[m.group("name")] = {
            "kind": m.group("kind"),
            "body_start": m.start(),
            "end": _decl_end(src, m.group("kind"), m, nxt),
        }
    return out


def resolve_closure(src: str, exported: dict, seeds: list) -> list:
    """
    依赖闭包解析。
    🔴 关键：被 import 的符号可能又引用同模块内「未被 import」的导出符号，
       例如 isRefundableStatus 内部用到 REFUNDABLE_STATUSES（后者没出现在 import 列表里）。
       只内联 import 列表会产出「运行时报 xxx is not defined」的残缺文件。
    这里迭代扩散到不动点，最后按源码顺序输出（保证 const 先于使用它的函数）。
    """
    missing = [s for s in seeds if s not in exported]
    if missing:
        raise ValueError(f"共享模块中找不到这些导出声明：{', '.join(missing)}")

    needed = set()
    queue = list(seeds)
    while queue:
        n = queue.pop()
        if n in needed:
            continue
        needed.add(n)
        body = src[exported[n]["body_start"] : exported[n]["end"] + 1]
        for other in exported:
            if other in needed:
                continue
            if re.search(r"(?<![\w$])" + re.escape(other) + r"(?![\w$])", body):
                queue.append(other)
    return sorted(needed, key=lambda x: exported[x]["body_start"])


def render_decl(src: str, exported: dict, name: str) -> str:
    """输出单个声明的完整源码（含上方注释），并去掉 export 前缀。"""
    d = exported[name]
    start = _absorb_leading_comments(src, d["body_start"])
    text = src[start : d["end"] + 1].rstrip()
    return re.sub(r"(?m)^export\s+", "", text)


def build(fn: str) -> str:
    idx_path = os.path.join(FUNCS_DIR, fn, "index.ts")
    if not os.path.exists(idx_path):
        raise SystemExit(f"❌ 找不到 {idx_path}")
    src = read(idx_path)

    # 收集所有 `from '../_shared/xxx.ts'` 的 import（含 `import type { ... }` 整句类型导入）
    imp_re = re.compile(
        r"(?ms)^import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'\.\./_shared/([A-Za-z0-9_.\-]+)'\s*;?\s*\n"
    )
    matches = list(imp_re.finditer(src))
    if not matches:
        raise SystemExit(f"❌ {fn}/index.ts 没有 `../_shared/` 依赖，无需生成单文件版")

    inlined_blocks = []
    for m in matches:
        names = []
        for x in m.group(1).split(","):
            x = x.strip()
            if not x:
                continue
            # 处理花括号内的 `type X` 修饰符与 `X as Y` 别名，取真实符号名
            x = re.sub(r"^type\s+", "", x)
            x = re.split(r"\s+as\s+", x)[0].strip()
            names.append(x)
        shared_path = os.path.join(FUNCS_DIR, "_shared", m.group(2))
        if not os.path.exists(shared_path):
            raise SystemExit(f"❌ 找不到共享模块 {shared_path}")
        shared = read(shared_path)
        exported = collect_exported(shared)
        # 依赖闭包：自动补齐「被 import 的符号内部引用、但自身未被 import」的符号
        order = resolve_closure(shared, exported, names)
        extra = [n for n in order if n not in names]
        decls = "\n\n".join(render_decl(shared, exported, n) for n in order)
        note = f"，并自动补齐传递依赖 {', '.join(extra)}" if extra else ""
        print(f"   内联 _shared/{m.group(2)}: {', '.join(order)}{note}")
        # 去掉 export 前缀（单文件内无需导出）
        decls = re.sub(r"(?m)^export\s+", "", decls)
        inlined_blocks.append(
            "/* ===== 内联自 _shared/%s —— 保持公式/常量一字不改 ===== */\n\n%s"
            % (m.group(2), decls)
        )

    # 用内联块替换 import 语句
    out = ""
    last = 0
    for m, block in zip(matches, inlined_blocks):
        out += src[last : m.start()]
        out += block + "\n\n"
        last = m.end()
    out += src[last:]

    # 入口：Dashboard 部署时模块即主模块，直接 serve（无需 import.meta.main 守卫）
    out = re.sub(
        r"(?ms)^if\s*\(import\.meta\.main\)\s*\{\s*Deno\.serve\((handleRefundOrder)\)\s*\}\s*$",
        r"Deno.serve(\1)",
        out,
    )
    out = re.sub(
        r"(?ms)^if\s*\(import\.meta\.main\)\s*\n\s*Deno\.serve\(([A-Za-z_][A-Za-z0-9_]*)\)\s*$",
        r"Deno.serve(\1)",
        out,
    )

    # 顶部再加一层「本文件说明」头部
    first_import = out.find("import ")
    header = HEADER.format(fn=fn)
    if first_import > 0:
        out = header + out[first_import:]
    else:
        out = header + out

    return out.rstrip() + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fn", default="refund-order", help="函数名（默认 refund-order）")
    ap.add_argument("--check", action="store_true", help="只检查是否与仓库同步，不同步退出码 1")
    args = ap.parse_args()

    content = build(args.fn)
    out_path = os.path.join(OUT_DIR, f"{args.fn}.standalone.ts")

    if args.check:
        cur = read(out_path) if os.path.exists(out_path) else ""
        if cur == content:
            print(f"✅ {args.fn}: Dashboard 单文件版与仓库同步")
            return 0
        print(f"❌ {args.fn}: 单文件版与仓库不同步，请重跑本脚本重新生成", file=sys.stderr)
        return 1

    write(out_path, content)
    n_lines = content.count("\n") + 1
    print(f"✅ 已生成 {os.path.relpath(out_path, ROOT)}  ({n_lines} 行)")
    print("   部署：Dashboard → Edge Functions → %s → 全选粘贴本文件 → Deploy" % args.fn)
    return 0


if __name__ == "__main__":
    sys.exit(main())
