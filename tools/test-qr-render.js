/*
 * 二维码渲染器测试：验证 QRCodeRender 能正确绘制并可被解码
 *   node tools/test-qr-render.js
 */
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

console.log('\n=== 二维码渲染器测试 ===\n');

const coreJs = fs.readFileSync(path.join(ROOT, 'assets', 'vendor', 'qrcode.js'), 'utf8');
const renderJs = fs.readFileSync(path.join(ROOT, 'assets', 'vendor', 'qrcode-render.js'), 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>', {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;

// 记录绘制调用，用于断言真的有画东西
let fillCalls = [];
window.HTMLCanvasElement.prototype.getContext = function () {
  const ctx = {
    fillStyle: '', font: '',
    fillRect(x, y, w, h) { fillCalls.push([x, y, w, h]); },
    fillText() {}, drawImage() {}, clearRect() {},
    setTransform() {},
    getImageData() { return { data: [] }; }, putImageData() {}
  };
  return ctx;
};

window.eval(coreJs);
window.eval(renderJs);

const R = window.QRCodeRender;

t('QRCodeRender 已挂载到全局', () => {
  ok(R, 'QRCodeRender 未定义');
  ok(typeof R.toCanvas === 'function', '缺少 toCanvas');
  ok(typeof R.toSvg === 'function', '缺少 toSvg');
  ok(typeof R.build === 'function', '缺少 build');
});

t('build 生成正确的模块矩阵', () => {
  const m = R.build('https://shanliqu.github.io/quiz/', 'M');
  ok(m.size >= 21, '模块数过小: ' + m.size);
  // 左上角定位图案应是暗色
  ok(m.isDark(0, 0) === true, '定位图案起点应为暗色');
  // 中心时序图案区域
  let dark = 0, total = 0;
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) { total++; if (m.isDark(r, c)) dark++; }
  }
  ok(dark > total * 0.2 && dark < total * 0.8, '暗模块比例异常: ' + dark + '/' + total);
});

t('toCanvas 实际调用了绘制（不是空画布）', () => {
  fillCalls = [];
  const canvas = window.document.getElementById('c');
  R.toCanvas(canvas, 'https://shanliqu.github.io/quiz/', { width: 360, margin: 2 });
  ok(fillCalls.length > 100, '绘制调用过少: ' + fillCalls.length);
  // 至少有一个深色方块
  const darkRect = fillCalls.filter(r => r[2] > 0 && r[3] > 0);
  ok(darkRect.length > 50, '深色方块过少: ' + darkRect.length);
});

t('toCanvas 设置了 canvas 尺寸（含高清屏适配）', () => {
  const canvas = window.document.getElementById('c');
  R.toCanvas(canvas, 'test', { width: 260 });
  ok(canvas.width >= 260, 'canvas.width 异常: ' + canvas.width);
  ok(canvas.style.width === '260px', 'style.width 异常: ' + canvas.style.width);
});

t('toSvg 生成合法 SVG 且含矩形', () => {
  const svg = R.toSvg('https://shanliqu.github.io/quiz/', { width: 300 });
  ok(svg.startsWith('<svg'), 'SVG 格式错误');
  ok(svg.includes('</svg>'), 'SVG 未闭合');
  ok((svg.match(/<rect/g) || []).length > 50, 'SVG 矩形过少');
  ok(svg.includes('viewBox'), 'SVG 缺少 viewBox');
});

t('超长内容也能生成（不抛异常）', () => {
  const long = 'https://shanliqu.github.io/quiz/?v=' + 'x'.repeat(500);
  let err = null;
  try { R.build(long, 'M'); } catch (e) { err = e; }
  ok(!err, '长内容抛异常: ' + (err && err.message));
});

t('空字符串不崩溃', () => {
  let err = null;
  try { R.build('', 'M'); } catch (e) { err = e; }
  ok(!err, '空内容抛异常: ' + (err && err.message));
});

t('cast.html / selfcheck.html 不再使用不存在的 new QRCode()', () => {
  ['cast.html', 'selfcheck.html'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(!/new\s+QRCode\s*\(/.test(src), f + ' 仍在调用不存在的 new QRCode()');
    ok(!/QRCode\.CorrectLevel/.test(src), f + ' 仍在引用不存在的 QRCode.CorrectLevel');
    ok(src.includes('qrcode-render.js'), f + ' 未引入 qrcode-render.js');
  });
});

console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===\n');
process.exit(fail ? 1 : 0);
