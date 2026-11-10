/* ==========================================================
   核心逻辑（纯函数，无 DOM 依赖）
   浏览器: window.QuizCore    Node: module.exports
   ========================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.QuizCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPE_LABEL = { single: '单选题', multi: '多选题', judge: '判断题' };
  var LETTERS = 'ABCDEFGH';

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** 按配额随机抽题并整体打乱 */
  function buildPaper(bank, quota) {
    var groups = { single: [], multi: [], judge: [] };
    bank.forEach(function (q) { if (groups[q.type]) groups[q.type].push(q); });
    var paper = [];
    Object.keys(quota).forEach(function (t) {
      paper = paper.concat(shuffle(groups[t].slice()).slice(0, quota[t]));
    });
    return shuffle(paper);
  }

  /** 答案归一化为排序后的字符数组（统一大写，去空白） */
  function normAns(a) {
    var raw = Array.isArray(a) ? a : String(a == null ? '' : a).split('');
    return raw
      .map(function (x) { return String(x).trim().toUpperCase(); })
      .filter(function (x) { return x.length === 1; })
      .sort();
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** 多选：全对才得分（选集完全一致） */
  function isCorrect(q, picked) {
    if (!picked || !picked.length) return false;
    var right = normAns(q.answer);
    if (q.type === 'multi') return sameSet(normAns(picked), right);
    return normAns(picked)[0] === right[0];
  }

  /** 判分 */
  function grade(paper, answers, scoreCfg) {
    var total = 0, correct = 0, wrong = 0, unanswered = 0;
    var byType = { single: [0, 0], multi: [0, 0], judge: [0, 0] };
    var details = paper.map(function (q, i) {
      var picked = answers[q.id] || [];
      var ok = isCorrect(q, picked);
      var blank = picked.length === 0;
      if (blank) unanswered++;
      else if (ok) correct++;
      else wrong++;
      var pts = ok ? (scoreCfg[q.type] || 0) : 0;
      total += pts;
      if (byType[q.type]) { byType[q.type][0] += pts; byType[q.type][1]++; }
      return {
        no: i + 1, q: q, picked: picked, right: normAns(q.answer),
        ok: ok, unanswered: blank, points: pts
      };
    });
    return {
      total: total, correct: correct, wrong: wrong, unanswered: unanswered,
      details: details, byType: byType
    };
  }

  /** 题库完整性检查 */
  function checkBank(bank, quota) {
    var have = { single: 0, multi: 0, judge: 0 };
    bank.forEach(function (q) { if (have[q.type] != null) have[q.type]++; });
    var problems = [];
    Object.keys(quota).forEach(function (t) {
      if (have[t] < quota[t]) {
        problems.push(TYPE_LABEL[t] + ' 不足：需 ' + quota[t] + ' 道，实际 ' + have[t] + ' 道');
      }
    });
    var badId = bank.filter(function (q) {
      return !q.id || !q.question || !q.options || !q.options.length ||
             q.answer == null || q.answer === '' ||
             (q.type === 'multi' ? !Array.isArray(q.answer) : !normAns(q.answer).length);
    });
    if (badId.length) problems.push('有 ' + badId.length + ' 道题字段不完整（缺 id/题干/选项/答案）');
    return { ok: problems.length === 0, have: have, problems: problems };
  }

  /** 正确答案字母是否都在选项范围内 */
  function checkAnswersInRange(bank) {
    var bad = [];
    bank.forEach(function (q) {
      var maxIdx = (q.options || []).length;
      normAns(q.answer).forEach(function (k) {
        if (LETTERS.indexOf(k) < 0 || LETTERS.indexOf(k) >= maxIdx) {
          bad.push(q.id + ' 的答案 ' + k + ' 超出选项范围');
        }
      });
    });
    return bad;
  }

  /**
   * 计算当前站点的基础目录（带尾斜杠）
   * 兼容:
   *   https://host/repo/index.html  -> /repo/
   *   https://host/repo/            -> /repo/
   *   https://host/repo             -> /repo/   (补斜杠)
   *   https://host/                 -> /
   */
  function baseDir() {
    var p = (typeof location !== 'undefined' && location.pathname) || '/';
    if (p.charAt(0) !== '/') p = '/' + p;
    var last = p.slice(p.lastIndexOf('/') + 1);
    // 最后一段没有扩展名 => 它本身是目录名，需要补斜杠
    if (last && last.indexOf('.') === -1) {
      return p.replace(/[^/]*$/, '') + last + '/';
    }
    return p.replace(/[^/]*$/, '');
  }

  /** 拼接站点内的相对资源路径 */
  function assetUrl(relPath) {
    return baseDir() + String(relPath).replace(/^\//, '');
  }

  return {
    TYPE_LABEL: TYPE_LABEL, LETTERS: LETTERS,
    shuffle: shuffle, buildPaper: buildPaper,
    normAns: normAns, sameSet: sameSet,
    isCorrect: isCorrect, grade: grade,
    checkBank: checkBank, checkAnswersInRange: checkAnswersInRange,
    baseDir: baseDir, assetUrl: assetUrl
  };
});
