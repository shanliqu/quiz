# -*- coding: utf-8 -*-
"""
二维码生成与解码验证（独立虚拟环境，不污染系统 Python）
    .\\.venv-qrcheck\\Scripts\\python.exe tools\\verify_qr.py

验证三种部署场景下二维码都能被正确识别：
    1. GitHub Pages 子路径托管
    2. 局域网模式
    3. 手动指定公网地址
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".qr_verify")

os.makedirs(OUT, exist_ok=True)

try:
    import cv2
except ImportError:
    print("缺少 opencv-python-headless，请在隔离环境中安装：")
    print("  python -m venv .venv-qrcheck")
    print("  .\\.venv-qrcheck\\Scripts\\python.exe -m pip install opencv-python-headless")
    sys.exit(2)

try:
    import qrcode
    HAVE_QR = True
except ImportError:
    HAVE_QR = False
    print("提示: 未装 qrcode 库，改用 Node 端生成")


def decode(path):
    img = cv2.imread(path)
    if img is None:
        return None
    det = cv2.QRCodeDetector()
    data, pts, _ = det.detectAndDecode(img)
    return data if data else None


def make_with_node(text, out_path):
    """调用项目的 Node 端二维码生成（与实际部署完全一致）"""
    js = (
        "const QRCode=require('qrcode');"
        "QRCode.toFile(%r,%r,{width:720,margin:2,errorCorrectionLevel:'M'})"
        ".then(()=>console.log('ok')).catch(e=>{console.error(e);process.exit(1)})"
        % (out_path.replace("\\", "/"), text)
    )
    r = subprocess.run(["node", "-e", js], cwd=ROOT,
                       capture_output=True, text=True)
    return r.returncode == 0


def make_with_python(text, out_path):
    img = qrcode.make(text)
    img.save(out_path)
    return True


SCENARIOS = [
    ("GitHub Pages 子路径托管", "https://yourname.github.io/quiz/"),
    ("局域网模式",              "http://192.168.1.100:8080/"),
    ("手动指定公网地址",        "https://myquiz.pages.dev/"),
    ("根路径托管",              "https://yourname.github.io/"),
]

print("\n=== 二维码生成与解码验证 ===\n")
ok = 0
fail = 0

for name, text in SCENARIOS:
    out = os.path.join(OUT, "qr_%d.png" % SCENARIOS.index((name, text)))
    made = make_with_node(text, out) if not HAVE_QR else make_with_python(text, out)
    if not made:
        print("  ✗ %-22s 生成失败" % name)
        fail += 1
        continue
    got = decode(out)
    if got == text:
        print("  ✓ %-22s -> %s" % (name, got))
        ok += 1
    else:
        print("  ✗ %-22s 期望 %s 实际 %s" % (name, text, got))
        fail += 1

print("\n=== 结果: %d 通过, %d 失败 ===\n" % (ok, fail))
sys.exit(1 if fail else 0)
