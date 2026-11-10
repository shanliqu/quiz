#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成占位题库（店员 / 店长各一套），格式与真实题库完全一致。

真实题库到位后，直接覆盖这两个文件即可，前端代码零改动：
    data/questions.staff.json     店员题库
    data/questions.manager.json   店长题库

注意：题目里【不需要 analysis（解析）】字段，只需要正确答案。

用法:  python tools/gen_sample.py
输出:  data/questions.staff.json
       data/questions.manager.json
"""
import json
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")

LETTERS = "ABCDEFGH"


def build_bank(role, seed, topic, count_single=30, count_multi=30, count_judge=20):
    """生成一套题库。

    role:  'staff' / 'manager'
    topic: 知识点标签前缀
    """
    rnd = random.Random(seed)
    items = []
    counter = 0

    def nid():
        nonlocal counter
        counter += 1
        return "%s_%04d" % (role, counter)

    # ---------------- 单选题 ----------------
    for _ in range(count_single):
        a, b = rnd.randint(2, 40), rnd.randint(2, 40)
        kind = rnd.choice(["add", "sub", "mul", "div", "mix"])
        if kind == "add":
            v = a + b
            q = "%d + %d = ?" % (a, b)
            others = {v - 1, v + 1, v + 2, v + 3, v - 3}
        elif kind == "sub":
            a = a + b
            v = a - b
            q = "%d - %d = ?" % (a, b)
            others = {v + 1, v - 1, v + 2, v - 2, v + 3}
        elif kind == "mul":
            a, b = rnd.randint(2, 9), rnd.randint(2, 9)
            v = a * b
            q = "%d × %d = ?" % (a, b)
            others = {v + a, v - b, v + 1, v - 1, v + 2 * b}
        elif kind == "div":
            b = rnd.randint(2, 9)
            v = rnd.randint(2, 9)
            a = b * v
            q = "%d ÷ %d = ?" % (a, b)
            others = {v + 1, v - 1, v + 2, v - 2, v + 3}
        else:
            a, b, c = rnd.randint(2, 9), rnd.randint(2, 9), rnd.randint(1, 9)
            v = a * b + c
            q = "%d × %d + %d = ?" % (a, b, c)
            others = {v + 1, v - 1, a * (b + c), a * b - c, v + c}

        opt_set = {v}
        pool = list(others - {v})
        rnd.shuffle(pool)
        for x in pool:
            if len(opt_set) >= 4:
                break
            opt_set.add(x)
        opts = sorted(opt_set)
        rnd.shuffle(opts)
        items.append({
            "id": nid(), "type": "single", "question": q,
            "options": opts, "answer": LETTERS[opts.index(v)],
            "knowledge": topic, "difficulty": 1 if kind in ("add", "sub") else 2,
        })

    # ---------------- 多选题 ----------------
    for _ in range(count_multi):
        mode = rnd.choice(["eq", "correct_expr", "multi_add"])
        if mode == "eq":
            target = rnd.randint(10, 40)
            right, wrong = [], []
            for _ in range(6):
                x, y = rnd.randint(2, 9), rnd.randint(2, 9)
                if rnd.random() < 0.5 and x + y == target:
                    right.append("%d + %d = %d" % (x, y, target))
                else:
                    z = x + y
                    wrong.append("%d + %d = %d" % (x, y, z + rnd.choice([1, -1, 2])))
            if len(right) < 2:
                x = max(2, target // 2)
                y = target - x
                if y < 2:
                    continue
                right.append("%d + %d = %d" % (x, y, target))
            right = right[:3]
            opts = right + wrong[:4 - len(right)]
            rnd.shuffle(opts)
            ans = sorted(LETTERS[opts.index(o)] for o in right)
            q = "下列算式中，结果等于 %d 的有哪些？" % target
            tag = "等式判断"
        elif mode == "correct_expr":
            a, b = rnd.randint(2, 9), rnd.randint(2, 9)
            target = a * b
            right = ["%d × %d = %d" % (a, b, target), "%d + %d = %d" % (a, b, target)]
            wrong = ["%d × %d = %d" % (a, b, target + 1), "%d + %d = %d" % (a, b, target - 1)]
            opts = right + wrong
            rnd.shuffle(opts)
            ans = sorted(LETTERS[opts.index(o)] for o in right)
            q = "下列算式中，计算结果正确的是哪些？"
            tag = "四则运算"
        else:
            base = rnd.randint(2, 6)
            right = ["%d + %d = %d" % (base, base, base * 2),
                     "%d × %d = %d" % (base, base, base * 2)]
            wrong = ["%d + %d = %d" % (base, base + 1, base * 2),
                     "%d × %d = %d" % (base, base, base * 2 + 1)]
            opts = right + wrong
            rnd.shuffle(opts)
            ans = sorted(LETTERS[opts.index(o)] for o in right)
            q = "下列算式中，结果等于 %d 的有哪些？" % (base * 2)
            tag = "等式判断"

        items.append({
            "id": nid(), "type": "multi", "question": q,
            "options": opts, "answer": ans,
            "knowledge": tag, "difficulty": 2,
        })

    # ---------------- 判断题 ----------------
    for _ in range(count_judge):
        a, b = rnd.randint(2, 20), rnd.randint(2, 20)
        kind = rnd.choice(["add", "sub", "mul", "div"])
        if kind == "add":
            v = a + b
            truth = rnd.random() < 0.5
            shown = v if truth else v + rnd.choice([1, -1, 2])
            stmt = "%d + %d = %d" % (a, b, shown)
        elif kind == "sub":
            v = a - b
            truth = rnd.random() < 0.5
            shown = v if truth else v + rnd.choice([1, -1])
            stmt = "%d - %d = %d" % (a, b, shown)
        elif kind == "mul":
            a, b = rnd.randint(2, 9), rnd.randint(2, 9)
            v = a * b
            truth = rnd.random() < 0.5
            shown = v if truth else v + rnd.choice([1, -1, a])
            stmt = "%d × %d = %d" % (a, b, shown)
        else:
            b = rnd.randint(2, 9)
            v = rnd.randint(2, 9)
            a = b * v
            truth = rnd.random() < 0.5
            shown = v if truth else v + rnd.choice([1, -1])
            stmt = "%d ÷ %d = %d" % (a, b, shown)

        items.append({
            "id": nid(), "type": "judge", "question": stmt,
            "options": ["正确", "错误"], "answer": "A" if truth else "B",
            "knowledge": "四则运算", "difficulty": 1,
        })

    return items


def write_bank(items, filename):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    counts = {"single": 0, "multi": 0, "judge": 0}
    for q in items:
        counts[q["type"]] += 1
    print("已生成 %d 道题 -> data/%s" % (len(items), filename))
    print("    单选 %d / 多选 %d / 判断 %d" % (counts["single"], counts["multi"], counts["judge"]))
    return counts


if __name__ == "__main__":
    print("=" * 50)
    print("生成占位题库（店员 / 店长）")
    print("=" * 50)

    staff = build_bank("staff", 20261110, "店员业务知识")
    write_bank(staff, "questions.staff.json")

    print()
    manager = build_bank("manager", 20261111, "店长管理知识")
    write_bank(manager, "questions.manager.json")

    print()
    print("题库要求: 单选20 多选20 判断10 -> 两套均满足")
