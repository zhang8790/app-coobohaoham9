#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将情绪文案中主观绝对化「最X」替换为合规表述（很/总/能/该等），保留事实性阈值词。"""
import io

# 顺序很重要：更长的具体词先替换，避免被更短的前缀词提前命中
REPLACEMENTS = [
    ("最想念", "总想念"),
    ("最该被", "该被"),
    ("最惦记", "总惦记"),
    ("最抚", "能抚"),          # 覆盖 最抚凡人心 / 最抚人心
    ("最懂", "很懂"),          # 覆盖 最懂身体/安慰/生活/珍惜/这份温柔...
    ("最想", "很想"),          # 覆盖 最想{name}（最想念已先处理）
    ("最对", "很对"),          # 覆盖 最对味 / 是最对的选择
    ("最值得", "很值得"),
    ("最期待", "很期待"),
    ("最能", "很能"),
    ("最珍贵", "很珍贵"),
    ("最需要", "很需要"),
    ("最好的款待", "很用心的款待"),
    ("身体最知道", "身体很知道"),
    ("最先被注意到", "先被注意到"),
    ("自己开心最重要", "自己开心很重要"),
    ("最不需要", "很不需要"),
    ("最诚实", "很诚实"),
    ("最熨帖", "很熨帖"),
    ("最勾人", "很勾人"),
    ("最舍不得", "很舍不得"),
    ("最踏实", "很踏实"),
    ("最原始", "很原始"),
    ("最诱人", "很诱人"),
    ("最抓人", "很抓人"),
    ("最奢侈", "很奢侈"),
    ("最实在", "很实在"),
    ("最见", "很见"),          # 覆盖 最见功夫 / 最见心意
    ("最没有", "很没有"),
    ("最稳妥", "很稳妥"),
    ("最简单", "很简单"),
    ("最民主", "很民主"),
    ("最让人", "很让人"),
    ("最讲", "很讲"),          # 覆盖 最讲火候
    ("最带劲", "很带劲"),
    ("最讲究", "很讲究"),
    ("最合适", "很合适"),
    ("最自由", "很自由"),
    ("最朴素", "很朴素"),
    ("最养人", "很养人"),
    ("最是温柔", "很是温柔"),
    ("最是难得", "很是难得"),
    ("最需", "很需"),
    ("最吸引", "很吸引"),
    ("最可能", "很可能"),
]

FILES = [
    "src/utils/category-emotion.ts",
    "src/utils/emotion-description.ts",
    "src/utils/product-emotion-lexicon.ts",
    "src/utils/emotionEngine.ts",
    "admin-web/src/pages/BehaviorAnalytics.tsx",
]

total = 0
for rel in FILES:
    try:
        with io.open(rel, "r", encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        print(f"[SKIP] 未找到: {rel}")
        continue
    before = text
    cnt = 0
    for k, v in REPLACEMENTS:
        n = text.count(k)
        if n:
            text = text.replace(k, v)
            cnt += n
    if text != before:
        with io.open(rel, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"[OK] {rel}: 替换 {cnt} 处")
        total += cnt
    else:
        print(f"[--] {rel}: 无匹配")
print(f"\n合计替换 {total} 处")
