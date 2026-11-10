/*
 * 真实渲染 + 像素级解码验证（第一阶段：输出 PGM 灰度图）
 *   node tools/test-qr-pixels.js
 *
 * 后续用隔离 Python 环境（opencv）解码校验，脚本见 tools/decode_verify.py
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '.qr_verify');
fs.mkdirSync(OUT, { recursive: true });

const CASES = [
  ['pages-subpath', 'https://shanliqu.github.io/quiz/'],
  ['lan', 'http://192.168.1.100:8080/'],
  ['public', 'https://myquiz.pages.dev/'],
  ['root', 'https://shanliqu.github.io/']
];

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true
});
const { window } = dom;

// 记录绘制像素的 canvas 上下文
const pixels = [];
window.HTMLCanvasElement.prototype.getContext = function () {
  const ctx = {
    fillStyle: '#fff', font: '',
    fillRect(x, y, w, h) {
      const c = this.fillStyle;
      for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
        for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
          pixels.push([xx, yy, c]);
        }
      }
    },
    fillText() {}, drawImage() {}, clearRect() {}, setTransform() {},
    getImageData() { return { data: [] }; }, putImageData() {}
  };
  return ctx;
};

window.eval(fs.readFileSync(path.join(ROOT, 'assets', 'vendor', 'qrcode.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(ROOT, 'assets', 'vendor', 'qrcode-render.js'), 'utf8'));

console.log('\n=== 渲染像素输出 ===\n');

const manifest = [];
CASES.forEach(([name, text]) => {
  pixels.length = 0;
  const canvas = window.document.createElement('canvas');
  window.QRCodeRender.toCanvas(canvas, text, { width: 360, margin: 2, correctLevel: 'M' });

  const W = canvas.width, H = canvas.height;
  const dark = pixels.filter(p => p[2] === '#0f172a').length;

  // 输出 PGM（P5 灰度图），OpenCV 可直接读
  const pgm = path.join(OUT, name + '.pgm');
  const buf = Buffer.alloc(W * H, 255);
  for (const p of pixels) {
    const [x, y, c] = p;
    if (c === '#0f172a' && x < W && y < H) buf[y * W + x] = 0;
  }
  fs.writeFileSync(pgm, Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`), buf]));

  manifest.push({ name, text, w: W, h: H, dark });
  console.log(`  ${name}: ${W}x${H}  暗像素 ${dark}  -> ${path.basename(pgm)}`);
});

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('\n  已写入 ' + path.join(OUT, 'manifest.json'));
console.log('  下一步用隔离 Python 环境解码校验。\n');
