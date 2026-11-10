# -*- coding: utf-8 -*-
"""
像素级解码校验（第二阶段，配合 tools/test-qr-pixels.js）
    .\\.venv-qrcheck\\Scripts\\python.exe tools\\decode_verify.py

读取 .qr_verify/*.pgm，用 OpenCV 解码，验证内容与预期完全一致。
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".qr_verify")

try:
    import cv2
except ImportError:
    print("缺少 opencv-python-headless，请先安装：")
    print("  python -m venv .venv-qrcheck")
    print("  .\\.venv-qrcheck\\Scripts\\python.exe -m pip install opencv-python-headless")
    sys.exit(2)

manifest_path = os.path.join(OUT, "manifest.json")
if not os.path.exists(manifest_path):
    print("找不到 manifest.json，请先运行: node tools/test-qr-pixels.js")
    sys.exit(2)

with open(manifest_path, encoding="utf-8") as f:
    items = json.load(f)

print("\n=== 像素级解码校验 ===\n")
det = cv2.QRCodeDetector()
ok = 0
fail = 0

for it in items:
    pgm = os.path.join(OUT, it["name"] + ".pgm")
    img = cv2.imread(pgm, cv2.IMREAD_GRAYSCALE)
    if img is None:
        print("  x %-16s 读取失败" % it["name"])
        fail += 1
        continue
    data, pts, _ = det.detectAndDecode(img)
    if data == it["text"]:
        print("  v %-16s -> %s" % (it["name"], data))
        ok += 1
    else:
        print("  x %-16s 期望 %s 实际 %s" % (it["name"], it["text"], repr(data)))
        fail += 1

print("\n=== 结果: %d 通过, %d 失败 ===\n" % (ok, fail))
sys.exit(1 if fail else 0)
