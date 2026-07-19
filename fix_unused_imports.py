import subprocess, re, os

ROOT = r"C:/Users/zhanglin/Desktop/app-coobohaoham9"
os.chdir(ROOT)

# 1) 读取 oxlint 文本输出（由外部 `oxlint ... > oxlint_out.txt` 生成）
with open("oxlint_out.txt", "r", encoding="utf-8", errors="replace") as f:
    raw = f.read()

# 2) 解析：Identifier/Type 'NAME' is imported but never used. \n  ,-[FILE:LINE:COL]
pat = re.compile(
    r"(?:Identifier|Type) '([^']+)' is imported but never used\.\s*\n\s*,-\[([^:\]]+):(\d+):(\d+)\]"
)
edits = {}
for m in pat.finditer(raw):
    name = m.group(1)
    fn = m.group(2)
    line = int(m.group(3))
    edits.setdefault(fn, []).append((line, name))

print(f"[info] 文件数={len(edits)}  待清理导入数={sum(len(v) for v in edits.values())}")

changed = []
for fn, items in edits.items():
    try:
        with open(fn, "r", encoding="utf-8") as f:
            lines = f.read().split("\n")
    except Exception as e:
        print(f"[skip] {fn}: {e}")
        continue
    for (line, name) in items:
        idx = line - 1
        if idx < 0 or idx >= len(lines):
            continue
        text = lines[idx]
        is_named = bool(re.search(r"import\s+(?:type\s+)?\{", text)) or \
                   ("," in text and " from " in text and "{" in text)
        if is_named:
            new = re.sub(r",\s*" + re.escape(name) + r"\b", "", text)
            if new == text:
                new = re.sub(r"\b" + re.escape(name) + r"\s*,", "", text)
            if new == text:
                new = re.sub(r"\b" + re.escape(name) + r"\b", "", text)
            new = re.sub(r"\{\s*,", "{", new)
            new = re.sub(r",\s*,", ",", new)
            new = re.sub(r",\s*\}", "}", new)
            new = re.sub(r"\{\s*\}", "{}", new)
            lines[idx] = new
        else:
            lines[idx] = ""
    content = "\n".join(lines)
    content = re.sub(r"\{\s*\n(\s*\n)+", "{\n", content)
    content = re.sub(r"(\n\s*)+\n\s*\}", "}", content)
    content = re.sub(r"\{\s*\n\s*,", "{", content)
    content = re.sub(r",\s*\n\s*\}", "}", content)
    content = re.sub(r"^\s*import\s+(?:type\s+)?\{\}\s+from\s+[^\n]+\n", "", content, flags=re.M)
    with open(fn, "w", encoding="utf-8") as f:
        f.write(content)
    changed.append(fn)

print(f"[done] 已修改 {len(changed)} 个文件")
for c in changed:
    print("  -", c)
