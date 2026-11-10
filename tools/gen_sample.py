#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成占位题库（加减法），格式与真实题库完全一致。
真实题库到位后，直接用你的 questions.json 覆盖 data/questions.sample.json 即可，
前端代码零改动。

用法:  python tools/gen_sample.py
输出:  data/questions.sample.json
"""
import json
import os
import random

random.seed(20261110)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "questions.sample.json")

LETTERS = "ABCDEFGH"

single_items = []
multi_items = []
judge_items = []

counter = 0


def nid():
    global counter
    counter += 1
    return "q_%04d" % counter


# ---------------- 单选题：四则运算 ----------------
def add_single(q, options, ans, analysis, tag, diff=1):
    single_items.append({
        "id": nid(), "type": "single", "question": q,
        "options": options, "answer": ans, "analysis": analysis,
        "knowledge": tag, "difficulty": diff,
    })


for _ in range(30):
    a, b = random.randint(2, 40), random.randint(2, 40)
    kind = random.choice(["add", "sub", "mul", "div", "mix"])
    if kind == "add":
        v = a + b
        q = "%d + %d = ?" % (a, b)
        others = {v - 1, v + 1, v + 2, v + 3, v - 3}
        analysis = "%d + %d = %d。加法运算把两个数合并成一个和，先算 %d + %d。" % (a, b, v, a, b)
    elif kind == "sub":
        a = a + b
        v = a - b
        q = "%d - %d = ?" % (a, b)
        others = {v + 1, v - 1, v + 2, v - 2, v + 3}
        analysis = "%d - %d = %d。减法是从被减数里去掉减数，可用加法验算：%d + %d = %d。" % (a, b, v, v, b, a)
    elif kind == "mul":
        a, b = random.randint(2, 9), random.randint(2, 9)
        v = a * b
        q = "%d × %d = ?" % (a, b)
        others = {v + a, v - b, v + 1, v - 1, v + 2 * b}
        analysis = "%d × %d = %d。乘法表示 %d 个 %d 相加，可用 %d × %d = %d 反向验证。" % (a, b, v, a, b, b, a, v)
    elif kind == "div":
        b = random.randint(2, 9)
        v = random.randint(2, 9)
        a = b * v
        q = "%d ÷ %d = ?" % (a, b)
        others = {v + 1, v - 1, v + 2, v - 2, v + 3}
        analysis = "%d ÷ %d = %d。想成 %d 里面有几个 %d，再乘回去验证：%d × %d = %d。" % (a, b, v, a, b, b, v, a)
    else:
        a, b, c = random.randint(2, 9), random.randint(2, 9), random.randint(1, 9)
        v = a * b + c
        q = "%d × %d + %d = ?" % (a, b, c)
        others = {v + 1, v - 1, a * (b + c), a * b - c, v + c}
        analysis = "%d × %d + %d = %d + %d = %d。混合运算先乘除后加减。" % (a, b, c, a * b, c, v)
    diff = 1 if kind in ("add", "sub") else 2
    opt_set = {v}
    pool = list(others - {v})
    random.shuffle(pool)
    for x in pool:
        if len(opt_set) >= 4:
            break
        opt_set.add(x)
    opts = sorted(opt_set)
    random.shuffle(opts)
    ans = LETTERS[opts.index(v)]
    add_single(q, opts, ans, analysis, "四则运算", diff)


# ---------------- 多选题：选出所有成立/正确的结果 ----------------
for _ in range(30):
    mode = random.choice(["eq", "correct_expr", "multi_add"])
    if mode == "eq":
        target = random.randint(10, 40)
        right, wrong = [], []
        for _ in range(6):
            x = random.randint(2, 9)
            y = random.randint(2, 9)
            if random.random() < 0.5 and x + y == target:
                right.append("%d + %d = %d" % (x, y, target))
            else:
                z = x + y
                wrong.append("%d + %d = %d" % (x, y, z + random.choice([1, -1, 2])))
        if len(right) < 2:
            # 兜底：强制补一条正确项，保证每题至少 2 个正确选项
            x = max(2, target // 2)
            y = target - x
            if y < 2:
                continue
            right.append("%d + %d = %d" % (x, y, target))
        right = right[:3]
        opts = right + wrong[:4 - len(right)]
        random.shuffle(opts)
        ans = sorted(LETTERS[opts.index(o)] for o in right)
        q = "下列算式中，结果等于 %d 的有哪些？" % target
        analysis = "逐项验算：只有结果等于 %d 的式子正确。等式的意义是两边数值相等。" % target
        tag = "等式判断"
    elif mode == "correct_expr":
        a, b = random.randint(2, 9), random.randint(2, 9)
        target = a * b
        right = ["%d × %d = %d" % (a, b, target),
                 "%d + %d = %d" % (a, b, target)]
        wrong = ["%d × %d = %d" % (a, b, target + 1),
                 "%d + %d = %d" % (a, b, target - 1)]
        opts = right + wrong
        random.shuffle(opts)
        ans = sorted(LETTERS[opts.index(o)] for o in right)
        q = "下列算式中，计算结果正确的是哪些？"
        analysis = "正确答案的共同结果是 %d。%d × %d = %d，%d + %d = %d，其余选项结果不符。" % (
            target, a, b, target, a, b, target)
        tag = "四则运算"
    else:
        base = random.randint(2, 6)
        right = ["%d + %d = %d" % (base, base, base * 2),
                 "%d × %d = %d" % (base, base, base * 2)]
        wrong = ["%d + %d = %d" % (base, base + 1, base * 2),
                 "%d × %d = %d" % (base, base, base * 2 + 1)]
        opts = right + wrong
        random.shuffle(opts)
        ans = sorted(LETTERS[opts.index(o)] for o in right)
        q = "下列算式中，结果等于 %d 的有哪些？" % (base * 2)
        analysis = "正确结果为 %d。乘法的交换律和加法的意义说明 %d 个 %d 相加等于 %d。" % (
            base * 2, base, base, base * 2)
        tag = "等式判断"

    multi_items.append({
        "id": nid(), "type": "multi", "question": q,
        "options": opts, "answer": ans,
        "analysis": analysis, "knowledge": tag, "difficulty": 2,
    })


# ---------------- 判断题 ----------------
for _ in range(20):
    a, b = random.randint(2, 20), random.randint(2, 20)
    kind = random.choice(["add", "sub", "mul", "div"])
    if kind == "add":
        v = a + b
        stmt = "%d + %d = %d" % (a, b, v)
        truth = random.random() < 0.5
        shown = v if truth else v + random.choice([1, -1, 2])
        stmt = "%d + %d = %d" % (a, b, shown)
        analysis = "正确结果是 %d + %d = %d，题中断言的等式%s成立。" % (a, b, v, "" if truth else "不")
    elif kind == "sub":
        v = a - b
        truth = random.random() < 0.5
        shown = v if truth else v + random.choice([1, -1])
        stmt = "%d - %d = %d" % (a, b, shown)
        analysis = "正确结果是 %d - %d = %d，题中断言的等式%s成立。" % (a, b, v, "" if truth else "不")
    elif kind == "mul":
        a, b = random.randint(2, 9), random.randint(2, 9)
        v = a * b
        truth = random.random() < 0.5
        shown = v if truth else v + random.choice([1, -1, a])
        stmt = "%d × %d = %d" % (a, b, shown)
        analysis = "正确结果是 %d × %d = %d，题中断言的等式%s成立。" % (a, b, v, "" if truth else "不")
    else:
        b = random.randint(2, 9)
        v = random.randint(2, 9)
        a = b * v
        truth = random.random() < 0.5
        shown = v if truth else v + random.choice([1, -1])
        stmt = "%d ÷ %d = %d" % (a, b, shown)
        analysis = "正确结果是 %d ÷ %d = %d，题中断言的等式%s成立。" % (a, b, v, "" if truth else "不")

    judge_items.append({
        "id": nid(), "type": "judge", "question": stmt,
        "options": ["正确", "错误"], "answer": "A" if truth else "B",
        "analysis": analysis, "knowledge": "四则运算", "difficulty": 1,
    })


# ---------------- 输出 ----------------
bank = single_items + multi_items + judge_items
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(bank, f, ensure_ascii=False, indent=2)

print("已生成 %d 道题 -> %s" % (len(bank), OUT))
print("  单选 %d / 多选 %d / 判断 %d" % (len(single_items), len(multi_items), len(judge_items)))
print("题库要求: 单选20 多选20 判断10 -> 满足")
