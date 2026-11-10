#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
本地服务（Python 版，无需 Node.js）
启动:  python server.py
功能与 server.js 一致：静态托管 + 局域网网卡识别 + 二维码

环境变量：
    PORT      端口，默认 8080
    QUIZ_URL  二维码里写死的地址（最高优先级）
"""
import http.server
import socketserver
import socket
import os
import re
import json
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 8080))
FIXED_URL = os.environ.get("QUIZ_URL") or None

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}

# 虚拟/隧道网卡关键词：这些网卡的 IP 手机访问不到
VIRTUAL_KEYWORDS = [
    "loopback", "teredo", "isatap", "tap", "tun", "vpn", "virtual", "vmware",
    "virtualbox", "hyper-v", "vethernet", "wsl", "docker", "zerotier",
    "tailscale", "clash", "mihomo", "sing-box", "v2ray", "pptp", "l2tp",
    "openvpn", "wireguard", "bluetooth", "本地连接",
]


def is_cgnat(ip):
    """CGNAT 段 100.64-127，代理/TUN 网卡常用，手机路由不到"""
    return bool(re.match(r"^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.", ip or ""))


def is_virtual(name):
    n = (name or "").lower()
    return any(k in n for k in VIRTUAL_KEYWORDS)


def parse_ipconfig():
    """解析 ipconfig，返回 [{name, address, gateway}]"""
    out = []
    if os.name != "nt":
        return out
    try:
        import subprocess
        r = subprocess.run(["ipconfig"], capture_output=True, timeout=8)
        # ipconfig 输出为 GBK/ANSI 编码，按中文系统解码
        try:
            text = r.stdout.decode("gbk", errors="ignore")
        except Exception:
            text = r.stdout.decode("utf-8", errors="ignore")
    except Exception:
        return out

    name, address, gateway = "", "", ""

    def flush():
        nonlocal address, gateway
        if address:
            out.append({"name": name or "未知网卡", "address": address,
                        "gateway": gateway})
        address, gateway = "", ""

    skip_prefix = re.compile(
        r"^(ipv4|ipv6|link-local|dhcp|default gateway|subnet mask|"
        r"connection-specific|默认网关|子网掩码|媒体状态|media state)", re.I)

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        head = re.match(r"^(.+?):\s*$", line)
        if head and not skip_prefix.match(head.group(1)):
            flush()
            name = re.sub(r"\badapter$", "", head.group(1), flags=re.I)
            name = re.sub(r"适配器$", "", name).strip()
            continue
        if re.match(r"^ipv4", line, re.I):
            m = re.search(r":\s*(\d+\.\d+\.\d+\.\d+)", line)
            if m:
                address = m.group(1)
        elif re.match(r"^(default gateway|默认网关)", line, re.I):
            m = re.search(r":\s*(\d+\.\d+\.\d+\.\d+)", line)
            if m:
                gateway = m.group(1)
    flush()
    return out


def score_iface(iface):
    """网卡评分，越高越可能是手机能连到的真实局域网网卡"""
    score = 0
    if is_virtual(iface["name"]):
        return -100
    gw = iface.get("gateway") or ""
    if not gw or gw == "0.0.0.0":
        return -50
    score += 40
    ip = iface["address"]
    if ip.startswith("192.168."):
        score += 20
    elif ip.startswith("10."):
        score += 18
    elif re.match(r"^172\.(1[6-9]|2\d|3[01])\.", ip):
        score += 16
    if is_cgnat(ip):
        score -= 60
    if is_cgnat(gw):
        score -= 40
    if re.search(r"wi-?fi|wireless|wlan|无线|802\.11", iface["name"], re.I):
        score += 10
    if re.search(r"ethernet|以太网|eth", iface["name"], re.I):
        score += 6
    return score


def list_ifaces():
    items = parse_ipconfig()
    if not items:
        # 通用回退
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            items = [{"name": "default", "address": s.getsockname()[0],
                      "gateway": "8.8.8.8"}]
            s.close()
        except Exception:
            pass
    for it in items:
        it["score"] = score_iface(it)
    items.sort(key=lambda x: x["score"], reverse=True)
    return items


def pick_iface():
    items = list_ifaces()
    return items[0] if items and items[0]["score"] > 0 else None


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith("/api/qr"):
            text = (query.get("text") or [""])[0]
            if not text:
                self._send(400, b"missing text", "text/plain")
                return
            try:
                import io
                import qrcode
                img = qrcode.make(text)
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                self._send(200, buf.getvalue(), "image/png")
            except ImportError:
                self._send(501, b"qr lib missing", "text/plain")
            except Exception as e:
                self._send(500, str(e).encode(), "text/plain")
            return

        if path.startswith("/api/info"):
            best = pick_iface()
            items = list_ifaces()
            url = FIXED_URL or (
                "http://%s:%d/" % (best["address"], PORT) if best else None)
            info = {
                "ip": best["address"] if best else None,
                "iface": best["name"] if best else None,
                "port": PORT,
                "url": url,
                "host": "http://localhost:%d/" % PORT,
                "fixed": bool(FIXED_URL),
                "all": [{"address": c["address"], "name": c["name"],
                         "gateway": c["gateway"], "score": c["score"],
                         "usable": c["score"] > 0} for c in items],
            }
            self._send(200, json.dumps(info, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8")
            return

        if path == "/":
            path = "/index.html"
        full = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not full.startswith(ROOT) or not os.path.isfile(full):
            self._send(404, ("404 Not Found: " + path).encode("utf-8"),
                       "text/plain; charset=utf-8")
            return
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            data = f.read()
        self._send(200, data, MIME.get(ext, "application/octet-stream"))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    best = pick_iface()
    items = list_ifaces()

    print("=" * 50)
    print("  扫码答题服务已启动")
    print("=" * 50)
    print("  本机访问 : http://localhost:%d/" % PORT)
    print("  投放大屏 : http://localhost:%d/cast.html" % PORT)
    print("-" * 50)

    if FIXED_URL:
        print("  * 二维码地址(固定) : %s" % FIXED_URL)
    elif best:
        print("  * 二维码地址 : http://%s:%d/" % (best["address"], PORT))
        print("    来自网卡: %s" % best["name"])
    else:
        print("  [!] 未找到可用的局域网网卡")
        print("      请确认电脑已连接 WiFi 或网线")
        print("      或手动指定: set QUIZ_URL=http://<你的IP>:%d/" % PORT)

    if items:
        print("-" * 50)
        print("  检测到的网卡:")
        for c in items:
            mark = "[可用]" if c["score"] > 0 else "[不可用]"
            print("    %s %-16s%s  %s" % (
                mark, c["address"], c["name"],
                ("网关:" + c["gateway"]) if c["gateway"] else "(无网关)"))

    print("=" * 50)
    print("  手机需与电脑连同一个 WiFi，用微信「扫一扫」扫码")
    print("  按 Ctrl+C 停止")
    print("=" * 50)

    with Server(("0.0.0.0", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  服务已停止。")
