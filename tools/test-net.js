/* 网卡识别测试: node tools/test-net.js
 *
 * 复现真实故障：代理/VPN 隧道网卡（Clash fake-ip 198.18.x、深信服 aTrust）
 * 被误选为对外地址，导致二维码扫了打不开。
 */
const path = require('path');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}
function ok(v, m) { if (!v) throw new Error(m || '断言失败'); }
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((m || '') + ' 期望 ' + JSON.stringify(b) + ' 实际 ' + JSON.stringify(a));
  }
}

console.log('\n=== 网卡识别测试 ===\n');

// 从 server.js 中提取纯函数，避免直接 require 触发监听
const src = require('fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extract(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('未在 server.js 中找到函数 ' + name);
  return m[0];
}

// 构造一个可执行的沙箱
const kwMatch = src.match(/const VIRTUAL_KEYWORDS = \[[\s\S]*?\];/);
const VIRTUAL_KEYWORDS = eval(kwMatch[0].replace('const VIRTUAL_KEYWORDS =', '').replace(/;$/, ''));

const code = [extract('isCGNAT'), extract('isFakeIP'), extract('isVirtual'), extract('scoreIFace')]
  .join('\n');
const fn = new Function('VIRTUAL_KEYWORDS',
  code + '\nreturn {isCGNAT, isFakeIP, isVirtual, scoreIFace};');
const { isFakeIP, isVirtual, scoreIFace } = fn(VIRTUAL_KEYWORDS);

t('fake-ip 段被识别（Clash 198.18.x / sing-box 28.x）', () => {
  ok(isFakeIP('198.18.0.1'), '198.18.0.1 应是 fake-ip');
  ok(isFakeIP('198.19.255.255'), '198.19.x 应是 fake-ip');
  ok(isFakeIP('28.0.0.1'), '28.x 应是 fake-ip');
  ok(!isFakeIP('192.168.1.10'), '192.168.1.10 不该是 fake-ip');
  ok(!isFakeIP('100.96.222.30'), '100.96.x 不该是 fake-ip');
});

t('Unknown adapter 被视为虚拟网卡', () => {
  ok(isVirtual('Unknown adapter chaoshihui'), 'Unknown adapter 应是虚拟网卡');
  ok(!isVirtual('以太网适配器 以太网'), '以太网不该是虚拟网卡');
});

t('隧道 fake-ip 网卡直接判负分', () => {
  const s = scoreIFace({ name: 'Unknown adapter chaoshihui', address: '198.18.0.1', gateway: '198.18.0.2' });
  ok(s < 0, 'fake-ip 网卡分数应 < 0，实际 ' + s);
});

t('真实家庭 WiFi 地址分数最高', () => {
  const wifi = scoreIFace({ name: 'WLAN', address: '192.168.1.10', gateway: '192.168.1.1' });
  const eth = scoreIFace({ name: '以太网适配器 以太网', address: '192.168.2.20', gateway: '192.168.2.1' });
  ok(wifi > eth, '无线应优先于有线: ' + wifi + ' vs ' + eth);
  ok(wifi > 0, '家庭 WiFi 应可用: ' + wifi);
});

t('VMware 虚拟网卡被判负分', () => {
  const s = scoreIFace({ name: 'VMware Network Adapter VMnet8', address: '192.168.88.1', gateway: '192.168.88.2' });
  ok(s < 0, 'VMware 网卡应不可用: ' + s);
});

t('无网关的独立网段网卡被判负分', () => {
  const s = scoreIFace({ name: 'Ethernet adapter VMnet1', address: '192.168.83.1', gateway: '' });
  ok(s < 0, '无网关应不可用: ' + s);
});

t('企业 VPN 网段(100.96.x)物理网卡仍可用但优先级低', () => {
  const s = scoreIFace({ name: '以太网适配器 以太网', address: '100.96.222.30', gateway: '100.96.0.1' });
  ok(s > 0, '企业 VPN 物理网卡应仍可用: ' + s);
  const home = scoreIFace({ name: 'WLAN', address: '192.168.1.10', gateway: '192.168.1.1' });
  ok(home > s, '家庭网段应优先于企业 VPN 段: ' + home + ' vs ' + s);
});

console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===\n');
process.exit(fail ? 1 : 0);
