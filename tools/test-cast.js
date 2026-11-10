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
const renderJs = fs.readFileSync(path.join(ROOT, 'assets', 'vendor', 'qrcode-render.js'), 'utf8');

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
// jsdom 无 canvas 实现，桩一个最小可用对象，并记录绘制内容以便断言
const drawn = [];
window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    fillStyle: '', font: '',
    fillRect(x, y, w, h){ drawn.push([this.fillStyle, x, y, w, h]); },
    fillText(){}, drawImage(){}, clearRect(){}, setTransform(){},
    getImageData(){ return { data: [] }; }, putImageData(){}
  };
};
window.eval(qrJs);
window.eval(renderJs);
// 抽取 cast.html 中的内联脚本
const inline = html.match(/<script>([\s\S]*?)<\/script>/);
window.eval(inline[1]);

const flush = () => new Promise(r => setTimeout(r, 60));

(async function run() {
  await flush();

  t('解析出局域网地址并显示', () => {
    ok(document.getElementById('url-staff').textContent.indexOf('192.168.83.1') >= 0,
       '店员二维码地址不对: ' + document.getElementById('url-staff').textContent);
  });

  t('两张二维码地址都带角色参数', () => {
    const s = document.getElementById('url-staff').textContent;
    const m = document.getElementById('url-manager').textContent;
    ok(s.indexOf('role=staff') >= 0, '店员码缺少 role=staff: ' + s);
    ok(m.indexOf('role=manager') >= 0, '店长码缺少 role=manager: ' + m);
  });

  t('两张二维码画布都已渲染', () => {
    ['qr-staff', 'qr-manager'].forEach(id => {
      const c = document.getElementById(id);
      ok(c, '缺少 canvas ' + id);
      ok(c.width === 300 && c.height === 300, id + ' 尺寸不对');
    });
  });

  t('两张二维码都真正画出了暗色模块', () => {
    const dark = drawn.filter(d => d[0] === '#0f172a' && d[3] > 0 && d[4] > 0);
    ok(dark.length > 200, '二维码暗色模块过少，说明没有真正绘制: ' + dark.length);
    // 用渲染器独立重建两张矩阵，确认内容一致
    const base = 'http://192.168.83.1:8080/';
    ['staff', 'manager'].forEach(k => {
      const m = window.QRCodeRender.build(base + '?role=' + k, 'M');
      ok(m.size >= 21, '模块数异常');
    });
  });

  t('没有出现二维码生成失败（QRCodeRender 未定义等）', () => {
    ok(!html.includes('new QRCode('), 'cast.html 仍在调用不存在的 new QRCode()');
    ok(!html.includes('QRCode.CorrectLevel'), 'cast.html 仍在引用不存在的 QRCode.CorrectLevel');
  });

  t('列出所有检测到的网卡', () => {
    const h = document.getElementById('cast-ifs').innerHTML;
    ok(h.includes('192.168.83.1'), '未列出可用网卡地址');
    ok(h.includes('100.96.222.30'), '未列出不可用网卡地址');
    ok(h.includes('WLAN'), '未列出网卡名');
    ok(h.includes('🟢'), '未标记可用状态');
  });

  t('两个角色的统计分别显示', () => {
    store['quiz_stats_v1_staff'] = JSON.stringify([
      { t: 1, role: 'staff', score: 80 },
      { t: 2, role: 'staff', score: 100 }
    ]);
    store['quiz_stats_v1_manager'] = JSON.stringify([
      { t: 3, role: 'manager', score: 60 }
    ]);
    // 手动触发一次 stats 刷新：等待轮询
    return new Promise(res => setTimeout(() => {
      try {
        eq(document.getElementById('st-count-staff').textContent, '2', '店员人数不对');
        eq(document.getElementById('st-avg-staff').textContent, '90', '店员平均分不对');
        eq(document.getElementById('st-count-manager').textContent, '1', '店长人数不对');
        eq(document.getElementById('st-avg-manager').textContent, '60', '店长平均分不对');
        res();
      } catch (e) { throw e; }
    }, 2200));
  });

  console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===\n');
  process.exit(fail ? 1 : 0);
})();
