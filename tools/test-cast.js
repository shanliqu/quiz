/* 投放大屏页测试: node tools/test-cast.js */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
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

console.log('\n=== 投放大屏页测试 ===\n');

const html = fs.readFileSync(path.join(ROOT, 'cast.html'), 'utf8');
const qrJs = fs.readFileSync(path.join(ROOT, 'assets', 'vendor', 'qrcode.js'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost:8080/cast.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

const store = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  configurable: true
});
window.fetch = () => Promise.resolve({
  ok: true, status: 200,
  json: () => Promise.resolve({
    ip: '192.168.83.1', iface: 'WLAN', port: 8080,
    url: 'http://192.168.83.1:8080/', host: 'http://localhost:8080/',
    fixed: false,
    all: [
      { address: '192.168.83.1', name: 'WLAN', gateway: '192.168.83.2', score: 70, usable: true },
      { address: '100.96.222.30', name: 'Ethernet adapter', gateway: '100.96.0.1', score: -54, usable: false }
    ]
  })
});
// jsdom 无 canvas 实现，桩一个最小可用对象
window.HTMLCanvasElement.prototype.getContext = function () {
  return { fillStyle: '', font: '', fillRect(){}, fillText(){}, drawImage(){}, clearRect(){}, getImageData(){ return { data: [] }; }, putImageData(){} };
};
window.eval(qrJs);
// 抽取 cast.html 中的内联脚本
const inline = html.match(/<script>([\s\S]*?)<\/script>/);
window.eval(inline[1]);

const flush = () => new Promise(r => setTimeout(r, 60));

(async function run() {
  await flush();

  t('解析出局域网地址并显示', () => {
    eq(document.getElementById('cast-url').textContent, 'http://192.168.83.1:8080/');
  });

  t('二维码画布已渲染', () => {
    const c = document.getElementById('cast-qr-canvas');
    ok(c, '缺少 canvas');
    ok(c.width === 360 && c.height === 360, '画布尺寸不对');
  });

  t('列出所有检测到的网卡', () => {
    const html = document.getElementById('cast-ifs').innerHTML;
    ok(html.includes('192.168.83.1'), '未列出可用网卡地址');
    ok(html.includes('100.96.222.30'), '未列出不可用网卡地址');
    ok(html.includes('WLAN'), '未列出网卡名');
    ok(html.includes('🟢'), '未标记可用状态');
  });

  t('统计区读取 localStorage 并显示人数/平均分/最高分', () => {
    store['quiz_stats_v1'] = JSON.stringify([
      { t: 1, score: 80, correct: 40, total: 50 },
      { t: 2, score: 100, correct: 50, total: 50 },
      { t: 3, score: 60, correct: 30, total: 50 }
    ]);
    // 手动触发一次 stats 刷新
    const ev = new window.Event('load');
    window.dispatchEvent(ev);
    // 直接调用内部逻辑不方便，改为等待轮询
    return new Promise(res => setTimeout(() => {
      try {
        eq(document.getElementById('st-count').textContent, '3', '人数不对');
        eq(document.getElementById('st-avg').textContent, '80', '平均分不对');
        eq(document.getElementById('st-max').textContent, '100', '最高分不对');
        res();
      } catch (e) { throw e; }
    }, 2200));
  });

  console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===\n');
  process.exit(fail ? 1 : 0);
})();
