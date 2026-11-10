/**
 * 本地服务：静态托管 + 二维码生成 + 局域网地址探测
 * 启动:  node server.js
 *
 * 环境变量：
 *   PORT       端口，默认 8080
 *   QUIZ_URL   二维码里写死的地址（最高优先级）
 *              例：QUIZ_URL=http://192.168.1.10:8080/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* ---------- 网卡识别 ---------- */

/** 虚拟/隧道网卡关键词：这些网卡的 IP 手机访问不到 */
const VIRTUAL_KEYWORDS = [
  'loopback', 'teredo', 'isatap', 'tap', 'tun', 'vpn', 'virtual', 'vmware',
  'virtualbox', 'hyper-v', 'vethernet', 'wsl', 'docker', 'zerotier',
  'tailscale', 'clash', 'mihomo', 'sing-box', 'v2ray', 'pptp', 'l2tp',
  'openvpn', 'wireguard', 'bluetooth', '本地连接', 'loopback'
];

/** CGNAT 段 100.64-127，代理/TUN 常用，优先级最低 */
function isCGNAT(ip) {
  return /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
}

/**
 * 代理软件的 fake-ip 段：这些地址只存在于本机的虚拟网卡上，
 * 手机在局域网里根本路由不到，扫了也连不上。
 *   198.18.0.0/15  Clash 默认 fake-ip 段
 *   28.0.0.0/8     sing-box / 部分 Clash 配置
 */
function isFakeIP(ip) {
  return /^198\.(1[89]|2[0-9]|3[01])\./.test(ip) || /^28\./.test(ip);
}

function isVirtual(name) {
  const n = (name || '').toLowerCase();
  // "Unknown adapter xxx" 是 Windows 对第三方/虚拟驱动的默认命名
  if (n.startsWith('unknown adapter')) return true;
  return VIRTUAL_KEYWORDS.some(k => n.includes(k));
}

/**
 * 解析 ipconfig，得到每块网卡的 IPv4 与默认网关
 * 返回 [{ name, address, gateway }]
 */
function parseIpconfig() {
  const { execFileSync } = require('child_process');
  let buf;
  try {
    buf = execFileSync('ipconfig', [], { timeout: 8000 });
  } catch (e) {
    return [];
  }
  // ipconfig 输出是 GBK/ANSI 编码，需按中文系统解码，否则乱码
  let out;
  try {
    out = new TextDecoder('gbk').decode(buf);
  } catch (e) {
    out = buf.toString('utf8');
  }

  const list = [];
  let name = '';
  let address = '';
  let gateway = '';

  const flush = () => {
    if (address) list.push({ name: name || '未知网卡', address, gateway });
    address = ''; gateway = '';
  };

  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // 网卡标题行: "Ethernet adapter 以太网:" / "无线局域网适配器 WLAN:"
    // 必须含 "适配器"/"adapter" 才算标题，避免把
    // "连接特定的 DNS 后缀  . :" 这类行误判成网卡名
    const head = line.match(/^(.+?):\s*$/);
    if (head && /适配器|adapter/i.test(head[1]) &&
        !/^(IPv4|IPv6|Link-local|DHCP|Default Gateway|Subnet Mask|Connection-specific|默认网关|子网掩码|媒体状态|Media State)/i.test(head[1])) {
      flush();
      name = head[1].replace(/\badapter$/i, '').replace(/适配器$/, '').trim();
      continue;
    }
    if (/^IPv4/i.test(line)) {
      const m = line.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
      if (m) address = m[1];
    } else if (/^Default Gateway|默认网关/i.test(line)) {
      const m = line.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
      if (m) gateway = m[1];
    }
  }
  flush();
  return list;
}

/**
 * 网卡评分：分数越高越可能是"手机能连到的真实局域网网卡"
 * 关键：网卡必须有默认网关，否则手机无法通过它访问本机
 */
function scoreIFace(iface) {
  let score = 0;

  // 虚拟网卡直接排除
  if (isVirtual(iface.name)) return -100;

  // fake-ip 段：只存在于本机虚拟网卡，手机路由不到，直接排除
  if (isFakeIP(iface.address) || isFakeIP(iface.gateway)) return -100;

  // 没有默认网关 = 独立网段（VMware/VirtualBox/WSL），手机连不到
  if (!iface.gateway || iface.gateway === '0.0.0.0') return -50;

  // 有默认网关 = 真实接入的网络
  score += 40;

  // 私有地址段优先级
  if (iface.address.startsWith('192.168.')) score += 20;
  else if (iface.address.startsWith('10.')) score += 18;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(iface.address)) score += 16;

  // CGNAT 段 100.64-127：常见于企业网络/运营商 NAT。
  // 这类地址在同网段内是可达的，但不属于家庭/办公常见段，优先级降低。
  if (isCGNAT(iface.address)) score -= 25;
  // 网关也是 CGNAT 段 => 企业 VPN 网络（如深信服 aTrust）
  if (isCGNAT(iface.gateway)) score -= 15;

  // 无线网卡加分（现场活动最常用）
  if (/wi-?fi|wireless|wlan|无线|802\.11/i.test(iface.name)) score += 10;

  // 以太网也可用
  if (/ethernet|以太网|eth/i.test(iface.name)) score += 6;

  return score;
}

/** 枚举所有 IPv4 网卡并评分 */
function listIFaces() {
  const list = parseIpconfig();
  // 补充 os.networkInterfaces 的 mac 信息
  const nets = os.networkInterfaces();
  const macOf = {};
  for (const n of Object.keys(nets)) {
    const v4 = (nets[n] || []).find(x => x.family === 'IPv4' && !x.internal);
    if (v4) macOf[n] = v4.mac;
  }
  return list
    .map(c => Object.assign({}, c, {
      mac: macOf[c.name] || '',
      score: scoreIFace(c)
    }))
    .sort((a, b) => b.score - a.score);
}

/** 选出最适合对外提供服务的网卡 */
function pickIFace() {
  const list = listIFaces();
  if (!list.length) return null;
  const best = list[0];
  // 最高分必须为正，否则没有真实局域网网卡
  return best.score > 0 ? best : null;
}

/* ---------- 服务 ---------- */

function safeResolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const p = path.normalize(path.join(ROOT, clean === '/' ? '/index.html' : clean));
  if (!p.startsWith(ROOT)) return null;
  return p;
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (url.startsWith('/api/qr')) {
    const target = decodeURIComponent((url.split('text=')[1] || '').split('&')[0]);
    if (!target) { res.writeHead(400); res.end('missing text'); return; }
    try {
      const buf = await QRCode.toBuffer(target, {
        width: 720, margin: 2, errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(buf);
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
    return;
  }

  if (url.startsWith('/api/info')) {
    const best = pickIFace();
    const list = listIFaces();
    const url_ = process.env.QUIZ_URL ||
      (best ? `http://${best.address}:${PORT}/` : null);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ip: best ? best.address : null,
      iface: best ? best.name : null,
      port: PORT,
      url: url_,
      host: `http://localhost:${PORT}/`,
      fixed: !!process.env.QUIZ_URL,
      all: list.map(c => ({
        address: c.address, name: c.name,
        gateway: c.gateway, score: c.score,
        usable: c.score > 0
      }))
    }));
    return;
  }

  const file = safeResolve(url);
  if (!file) { res.writeHead(403); res.end('forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + url);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  const best = pickIFace();
  const list = listIFaces();

  console.log('==================================================');
  console.log('  扫码答题服务已启动');
  console.log('==================================================');
  console.log('  本机访问 : http://localhost:' + PORT + '/');
  console.log('  投放大屏 : http://localhost:' + PORT + '/cast.html');
  console.log('--------------------------------------------------');

  if (process.env.QUIZ_URL) {
    console.log('  ★ 二维码地址(固定) : ' + process.env.QUIZ_URL);
    console.log('    用 env QUIZ_URL 设置');
  } else if (best) {
    console.log('  ★ 二维码地址 : http://' + best.address + ':' + PORT + '/');
    console.log('    来自网卡: ' + best.name);
  } else {
    console.log('  [!] 未找到可用的局域网网卡');
    console.log('      请确认电脑已连接 WiFi 或网线');
    console.log('      或手动指定: set QUIZ_URL=http://<你的IP>:' + PORT + '/');
  }

  if (list.length) {
    console.log('--------------------------------------------------');
    console.log('  检测到的网卡:');
    list.forEach(c => {
      const mark = c.score > 0 ? '[可用]' : '[不可用]';
      console.log('    ' + mark + ' ' + c.address.padEnd(16) + c.name +
                  (c.gateway ? '  网关:' + c.gateway : '  (无网关)'));
    });
  }

  console.log('==================================================');
  console.log('  手机需与电脑连同一个 WiFi，用微信「扫一扫」扫码');
  console.log('  按 Ctrl+C 停止');
  console.log('==================================================');

  // 生成二维码
  const target = process.env.QUIZ_URL ||
    (best ? `http://${best.address}:${PORT}/` : `http://localhost:${PORT}/`);
  try {
    const buf = await QRCode.toBuffer(target, {
      width: 720, margin: 2, errorCorrectionLevel: 'M'
    });
    fs.writeFileSync(path.join(ROOT, 'qrcode.png'), buf);
    console.log('  二维码已保存: qrcode.png   内容: ' + target);
  } catch (e) {
    console.log('  二维码生成失败: ' + e.message);
  }
});
