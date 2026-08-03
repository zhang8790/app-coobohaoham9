import glob

DIST = "dist"

FORBIDDEN = [
    "感冒", "嗓子疼", "上火长痘", "清热养阴", "大补温阳", "温补肾阳",
    "健脾祛湿", "清肝润肺", "补益气血", "滋阴润燥", "温补驱寒",
    "温阳", "驱寒", "润肺", "祛湿", "养阴", "滋阴", "补益", "大补",
    "清肝", "健脾", "温补", "补肾",
]

REQUIRED = [
    "体质匹配度", "日常饮食偏好", "配料风险台账", "一键加购",
    "游客版", "已为你个性化", "家庭食安档案", "扫码记录已自动同步",
    "一键加购本节气精选", "本节气精选组合", "年度会员专属",
]


def esc(s):
    return "".join("\\u%04x" % ord(c) for c in s)


files = []
for ext in ("*.js", "*.json", "*.wxss", "*.wxml"):
    files += glob.glob(f"{DIST}/**/{ext}", recursive=True)
print(f"Scanning {len(files)} files in {DIST}/")


def scan(phrase):
    raw = phrase
    e = esc(phrase)
    hits = []
    for f in files:
        try:
            data = open(f, encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        nr = data.count(raw)
        ne = data.count(e)
        if nr or ne:
            hits.append((f, nr, ne))
    return hits


print("\n=== FORBIDDEN PHRASE CHECK (raw + \\u-escaped) ===")
total_bad = 0
for p in FORBIDDEN:
    h = scan(p)
    if h:
        total_bad += 1
        print(f"[VIOLATION] {p}:")
        for f, nr, ne in h:
            print(f"    {f}  raw={nr} escaped={ne}")
    else:
        print(f"[clean]     {p}")
print(f"\n>>> Forbidden phrases with hits: {total_bad} / {len(FORBIDDEN)}")

print("\n=== REQUIRED NEW COPY CHECK ===")
miss = 0
for p in REQUIRED:
    h = scan(p)
    if h:
        tot = sum(nr + ne for _, nr, ne in h)
        print(f"[present]    {p}  (total occurrences {tot})")
    else:
        miss += 1
        print(f"[MISSING]    {p}")
print(f"\n>>> Missing required copy: {miss} / {len(REQUIRED)}")
