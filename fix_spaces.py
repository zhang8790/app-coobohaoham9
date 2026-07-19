import subprocess, re

out = subprocess.run("git diff --name-only", shell=True, capture_output=True, text=True).stdout
for f in out.split():
    if not (f.startswith("src/") and (f.endswith(".ts") or f.endswith(".tsx"))):
        continue
    try:
        with open(f, encoding="utf-8") as fh:
            lines = fh.readlines()
    except Exception:
        continue
    changed = False
    for i, l in enumerate(lines):
        if "import" in l:
            new = re.sub(r"import\s{2,}", "import ", l)
            new = re.sub(r"\{\s{2,}", "{ ", new)
            if new != l:
                lines[i] = new
                changed = True
    if changed:
        with open(f, "w", encoding="utf-8") as fh:
            fh.writelines(lines)
        print("fixed spaces:", f)
print("[done]")
