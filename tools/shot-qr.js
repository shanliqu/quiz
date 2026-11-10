/**
 * 线上二维码生成与地址推导验证
 *   node tools/shot-qr.js [页面URL] [输出PNG]
 * 复现 cast.html 的 baseDir 逻辑，确认二维码里写的是正确的站点根地址
 */
const path = require('path');
const QRCode = require('qrcode');

const url = process.argv[2] || 'https://shanliqu.github.io/quiz/cast.html';
const out = process.argv[3] || path.join(__dirname, '..', 'online-qr.png');

(async () => {
  const u = new URL(url);
  const p = u.pathname;
  const last = p.slice(p.lastIndexOf('/') + 1);
  const base = (last && last.indexOf('.') === -1)
    ? u.origin + p.replace(/[^/]*$/, '') + last + '/'
    : u.origin + p.replace(/[^/]*$/, '');

  console.log('页面地址  :', url);
  console.log('二维码内容:', base);

  await QRCode.toFile(out, base, {
    width: 360, margin: 2, errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' }
  });
  console.log('已保存    :', out);
})();
