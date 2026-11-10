/* ==========================================================
   二维码渲染器（浏览器端）
   基于 qrcode-generator 核心 API，自行绘制到 canvas / 生成 SVG
   不依赖任何 CDN，也不依赖 qrcode-generator 的 UI 包装器
   全局导出: window.QRCodeRender
   ========================================================== */
(function (global) {
  'use strict';

  // qrcode-generator 核心（dist/qrcode.js）暴露全局 qrcode
  var QrCore = global.qrcode;
  if (!QrCore) {
    console.error('[QRCodeRender] 未找到 qrcode-generator 核心');
    return;
  }

  // qrcode-generator 的 QRErrorCorrectionLevel 按字母索引: {L:1, M:0, Q:3, H:2}
  // 必须传字母，传数字会导致内部查表得到 undefined 而报错
  var VALID_LEVEL = { L: 1, M: 1, Q: 1, H: 1 };

  /**
   * 生成二维码模块矩阵
   * @param {string} text 内容
   * @param {string} level 纠错等级 L/M/Q/H
   * @returns {{size:number, isDark:function(r,c):boolean}}
   */
  function build(text, level) {
    var lv = String(level || 'M').toUpperCase();
    if (!VALID_LEVEL[lv]) lv = 'M';

    // typeNumber = 0 表示自动选择合适的版本（make() 内部会逐版试算）
    var qr = QrCore(0, lv);
    qr.addData(String(text == null ? '' : text), 'Byte');
    qr.make();

    var count = qr.getModuleCount();
    return {
      size: count,
      isDark: function (row, col) { return qr.isDark(row, col); }
    };
  }

  /**
   * 绘制到 canvas
   * @param {HTMLCanvasElement} canvas
   * @param {string} text
   * @param {Object} opt {width, height, margin, dark, light}
   */
  function toCanvas(canvas, text, opt) {
    if (!canvas || !canvas.getContext) {
      throw new Error('canvas 不可用');
    }
    opt = opt || {};
    var width = opt.width || 320;
    var margin = opt.margin == null ? 2 : opt.margin;
    var dark = opt.dark || '#0f172a';
    var light = opt.light || '#ffffff';

    var m = build(text, opt.correctLevel || 'M');
    var modules = m.size;
    var total = modules + margin * 2;
    var cell = width / total;

    // 高清屏适配
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(width * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = width + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, width);
    ctx.fillStyle = dark;

    for (var r = 0; r < modules; r++) {
      for (var c = 0; c < modules; c++) {
        if (m.isDark(r, c)) {
          ctx.fillRect(
            Math.round((c + margin) * cell),
            Math.round((r + margin) * cell),
            Math.ceil(cell),
            Math.ceil(cell)
          );
        }
      }
    }
    return canvas;
  }

  /**
   * 生成 SVG 字符串（可内联到页面，便于矢量打印）
   */
  function toSvg(text, opt) {
    opt = opt || {};
    var size = opt.width || 320;
    var margin = opt.margin == null ? 2 : opt.margin;
    var dark = opt.dark || '#0f172a';
    var light = opt.light || '#ffffff';

    var m = build(text, opt.correctLevel || 'M');
    var modules = m.size;
    var total = modules + margin * 2;
    var cell = size / total;

    var parts = [];
    for (var r = 0; r < modules; r++) {
      for (var c = 0; c < modules; c++) {
        if (m.isDark(r, c)) {
          parts.push('<rect x="' + ((c + margin) * cell).toFixed(2) +
                     '" y="' + ((r + margin) * cell).toFixed(2) +
                     '" width="' + cell.toFixed(2) +
                     '" height="' + cell.toFixed(2) + '"/>');
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
           '" viewBox="0 0 ' + size + ' ' + size + '">' +
           '<rect width="' + size + '" height="' + size + '" fill="' + light + '"/>' +
           '<g fill="' + dark + '">' + parts.join('') + '</g></svg>';
  }

  global.QRCodeRender = { build: build, toCanvas: toCanvas, toSvg: toSvg };
})(typeof window !== 'undefined' ? window : this);
