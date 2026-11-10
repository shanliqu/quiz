/* ==========================================================
   扫码答题程序 - 界面层（判分/抽题逻辑见 core.js）
   ========================================================== */
(function () {
  'use strict';

  var C = window.QuizCore;

  var CONFIG = {
    bankUrl: 'data/questions.sample.json',   // 相对路径，自动适配子路径托管
    quota: { single: 20, multi: 20, judge: 10 },
    score: { single: 2, multi: 2, judge: 2 },   // 满分 100
    storageKey: 'quiz_state_v1',
    statsKey: 'quiz_stats_v1'
  };

  var TYPE_LABEL = C.TYPE_LABEL;
  var LETTERS = C.LETTERS;

  var S = { bank: [], paper: [], answers: {}, idx: 0, result: null };

  var el = {};
  function $(id) { return document.getElementById(id); }
  function cacheDom() {
    ['page-home','page-quiz','page-result','page-detail','home-total','btn-start',
     'q-cur','q-total','q-type','q-stem','q-options','q-meta','progress-bar','foot-dots',
     'btn-prev','btn-next','btn-submit-top','res-score','res-remark','res-stats','res-grid',
     'res-detail','detail-list','btn-show-all','btn-restart','btn-back-result',
     'modal-mask','modal-title','modal-body','modal-ok','modal-cancel','toast'
    ].forEach(function (id) { el[id] = $(id); });
  }

  /* ---------------- 工具 ---------------- */
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.classList.remove('show'); }, 2000);
  }
  function modal(title, body, onOk, okText) {
    el['modal-title'].textContent = title;
    el['modal-body'].innerHTML = body;
    el['modal-ok'].textContent = okText || '确定';
    el['modal-mask'].classList.add('show');
    function close() { el['modal-mask'].classList.remove('show'); }
    el['modal-ok'].onclick = function () { close(); if (onOk) onOk(); };
    el['modal-cancel'].onclick = close;
  }
  function showPage(name) {
    ['page-home','page-quiz','page-result','page-detail'].forEach(function (p) {
      el[p].classList.toggle('active', p === name);
    });
    window.scrollTo(0, 0);
    var sc = document.querySelector('#page-' + name + ' .quiz-body') ||
             document.querySelector('#page-' + name + ' .detail-list');
    if (sc) sc.scrollTop = 0;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function setHTML(id, html) { el[id].innerHTML = html; }

  /* ---------------- 答题渲染 ---------------- */
  function renderQuestion() {
    var q = S.paper[S.idx];
    if (!q) return;
    var picked = S.answers[q.id] || [];

    el['q-cur'].textContent = S.idx + 1;
    el['q-total'].textContent = S.paper.length;
    el['q-type'].textContent = TYPE_LABEL[q.type];
    el['q-type'].className = 'qh-type ' + q.type;

    setHTML('q-stem', esc(q.question));

    var html = '';
    (q.options || []).forEach(function (opt, i) {
      var key = LETTERS[i];
      var on = picked.indexOf(key) >= 0;
      html += '<button type="button" class="opt' + (on ? ' selected' : '') + (q.type === 'multi' ? ' multi' : '') +
              '" data-key="' + key + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
              '<span class="opt-key">' + key + '</span>' +
              '<span class="opt-text">' + esc(opt) + '</span></button>';
    });
    setHTML('q-options', html);

    var extra = q.type === 'multi' ? '（多选，点击选项可切换，可选多个）'
              : q.type === 'judge' ? '（判断题，点选一项）'
              : '（单选，点选一项）';
    el['q-meta'].textContent = extra + (q.knowledge ? ' · 知识点：' + q.knowledge : '');

    el['progress-bar'].style.width = ((S.idx + 1) / S.paper.length * 100) + '%';
    el['btn-prev'].disabled = S.idx === 0;
    el['btn-next'].textContent = S.idx === S.paper.length - 1 ? '交卷' : '下一题';

    renderDots();
    saveState();
  }

  function renderDots() {
    var html = '';
    for (var i = 0; i < S.paper.length; i++) {
      var q = S.paper[i];
      var done = (S.answers[q.id] || []).length > 0;
      var cls = 'foot-dot ' + q.type + (done ? ' done' : '') + (i === S.idx ? ' cur' : '');
      html += '<i class="' + cls + '"></i>';
    }
    setHTML('foot-dots', html);
  }

  function selectOption(key) {
    var q = S.paper[S.idx];
    if (!q) return;
    var cur = (S.answers[q.id] || []).slice();
    var i = cur.indexOf(key);
    if (q.type === 'multi') {
      if (i >= 0) cur.splice(i, 1); else cur.push(key);
      cur.sort();
      if (cur.length) S.answers[q.id] = cur; else delete S.answers[q.id];
    } else {
      S.answers[q.id] = [key];
    }
    // 原地更新选项样式，避免整体重渲染导致节点失效/焦点丢失
    syncOptionStyles(q);
    renderDots();
    saveState();
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
  }

  /** 同步选项的 selected 状态（不重建 DOM） */
  function syncOptionStyles(q) {
    var picked = S.answers[q.id] || [];
    var kids = el['q-options'].children;
    for (var i = 0; i < kids.length; i++) {
      var node = kids[i];
      var key = node.getAttribute('data-key');
      var on = picked.indexOf(key) >= 0;
      node.classList.toggle('selected', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ---------------- 成绩渲染 ---------------- */
  function optRowsHtml(q, picked, right) {
    var html = '';
    (q.options || []).forEach(function (opt, i) {
      var key = LETTERS[i];
      var isRight = right.indexOf(key) >= 0;
      var isMine = picked.indexOf(key) >= 0;
      var cls = isRight ? 'right' : (isMine ? 'wrong' : '');
      var mark = isRight ? ' ✓' : (isMine ? ' ✗' : '');
      html += '<div class="dc-opt' + (cls ? ' ' + cls : '') + '">' +
              '<span class="k">' + key + '.</span>' +
              '<span>' + esc(opt) + mark + '</span></div>';
    });
    return html;
  }

  function renderResult() {
    var r = S.result;
    el['res-score'].textContent = r.total;

    var pct = r.total / 100, remark;
    if (pct >= 0.9) remark = '🏆 优秀！知识掌握得非常扎实';
    else if (pct >= 0.8) remark = '🎉 很棒！再接再厉';
    else if (pct >= 0.6) remark = '👍 不错，还有提升空间';
    else if (pct >= 0.4) remark = '🙂 继续加油，多看解析';
    else remark = '📖 别灰心，仔细阅读解析后会进步';
    el['res-remark'].textContent = remark;

    var maxS = CONFIG.quota.single * CONFIG.score.single;
    var maxM = CONFIG.quota.multi * CONFIG.score.multi;
    var maxJ = CONFIG.quota.judge * CONFIG.score.judge;
    setHTML('res-stats',
      '<div class="res-stat">答对<b>' + r.correct + '</b></div>' +
      '<div class="res-stat">答错<b>' + r.wrong + '</b></div>' +
      '<div class="res-stat">未答<b>' + r.unanswered + '</b></div>' +
      '<div class="res-stat">单选<b>' + r.byType.single[0] + '/' + maxS + '</b></div>' +
      '<div class="res-stat">多选<b>' + r.byType.multi[0] + '/' + maxM + '</b></div>' +
      '<div class="res-stat">判断<b>' + r.byType.judge[0] + '/' + maxJ + '</b></div>');

    var g = '';
    r.details.forEach(function (d) {
      var cls = d.unanswered ? 'none' : (d.ok ? 'ok' : 'bad');
      g += '<button class="grid-cell ' + cls + '" data-no="' + d.no + '">' + d.no + '</button>';
    });
    setHTML('res-grid', g);
    setHTML('res-detail', '');
    recordStats(r);
  }

  function detailCardHtml(d) {
    var cls = d.unanswered ? 'none' : (d.ok ? 'ok' : 'bad');
    var resText = d.unanswered ? '未作答' : (d.ok ? '✅ 正确 +' + d.points : '❌ 错误 0分');
    var mineText = d.picked.length ? d.picked.join('、') : '未作答';
    return '<div class="detail-card ' + cls + '">' +
      '<div class="dc-head">' +
        '<span class="dc-no">第 ' + d.no + ' 题</span>' +
        '<span class="dc-tag">' + TYPE_LABEL[d.q.type] + '</span>' +
        '<span class="dc-res ' + cls + '">' + resText + '</span>' +
      '</div>' +
      '<div class="dc-stem">' + esc(d.q.question) + '</div>' +
      '<div class="dc-opts">' + optRowsHtml(d.q, d.picked, d.right) + '</div>' +
      '<div class="dc-meta">我的答案：' + mineText + '　|　正确答案：' + d.right.join('、') + '</div>' +
      '<div class="dc-analysis"><div class="dc-analysis-title">📖 解析</div>' +
        esc(d.q.analysis || '暂无解析') + '</div>' +
    '</div>';
  }

  function showSingleDetail(no) {
    var d = S.result.details[no - 1];
    if (!d) return;
    setHTML('res-detail', detailCardHtml(d));
    showPage('page-result');
    setTimeout(function () {
      var card = el['res-detail'].querySelector('.detail-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function renderAllDetail() {
    var html = '';
    S.result.details.forEach(function (d) {
      var cls = d.unanswered ? 'none' : (d.ok ? 'ok' : 'bad');
      html += '<div class="dd-card ' + cls + '">' +
        '<div class="dd-num">第 ' + d.no + ' 题 · ' + TYPE_LABEL[d.q.type] +
          ' · ' + (d.unanswered ? '未作答' : (d.ok ? '✅ 正确' : '❌ 错误')) + '</div>' +
        '<div class="dd-stem">' + esc(d.q.question) + '</div>' +
        '<div class="dc-opts">' + optRowsHtml(d.q, d.picked, d.right) + '</div>' +
        '<div class="dc-analysis"><div class="dc-analysis-title">📖 解析</div>' +
          esc(d.q.analysis || '暂无解析') + '</div>' +
      '</div>';
    });
    setHTML('detail-list', html);
    showPage('page-detail');
  }

  /* ---------------- 持久化 / 统计 ---------------- */
  function recordStats(r) {
    try {
      var arr = JSON.parse(localStorage.getItem(CONFIG.statsKey) || '[]');
      arr.push({ t: Date.now(), score: r.total, correct: r.correct, total: S.paper.length });
      if (arr.length > 500) arr = arr.slice(-500);
      localStorage.setItem(CONFIG.statsKey, JSON.stringify(arr));
    } catch (e) {}
  }
  function saveState() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({
        t: Date.now(), paper: S.paper, answers: S.answers, idx: S.idx,
        submitted: !!S.result
      }));
    } catch (e) {}
  }
  function loadState() {
    try { return JSON.parse(localStorage.getItem(CONFIG.storageKey) || 'null'); }
    catch (e) { return null; }
  }
  function clearState() {
    try { localStorage.removeItem(CONFIG.storageKey); } catch (e) {}
  }

  /* ---------------- 提交流程 ---------------- */
  function doSubmit() {
    var unanswered = S.paper.filter(function (q) { return !(S.answers[q.id] || []).length; }).length;
    var body = unanswered > 0
      ? '还有 <b>' + unanswered + '</b> 道题未作答，未答题目计 0 分。<br/>确定提交吗？'
      : '共 ' + S.paper.length + ' 题已作答完毕，确定提交并查看成绩吗？';
    modal('确认交卷', body, function () {
      S.result = C.grade(S.paper, S.answers, CONFIG.score);
      saveState();
      renderResult();
      showPage('page-result');
    }, '提交');
  }

  function startPaper() {
    S.paper = C.buildPaper(S.bank, CONFIG.quota);
    S.answers = {};
    S.idx = 0;
    S.result = null;
    setHTML('res-detail', '');
    renderQuestion();
    showPage('page-quiz');
  }

  /* ---------------- 事件 ---------------- */
  function bindEvents() {
    el['btn-start'].onclick = startPaper;

    el['btn-next'].onclick = function () {
      if (S.idx === S.paper.length - 1) { doSubmit(); return; }
      S.idx++; renderQuestion();
    };
    el['btn-prev'].onclick = function () {
      if (S.idx > 0) { S.idx--; renderQuestion(); }
    };
    el['btn-submit-top'].onclick = doSubmit;

    el['q-options'].onclick = function (e) {
      var t = e.target.closest ? e.target.closest('.opt') : null;
      if (!t && e.target.parentNode && e.target.parentNode.classList.contains('opt')) t = e.target.parentNode;
      if (t) selectOption(t.getAttribute('data-key'));
    };

    el['res-grid'].onclick = function (e) {
      var b = e.target.closest ? e.target.closest('.grid-cell') : null;
      if (!b && e.target.parentNode && e.target.parentNode.classList.contains('grid-cell')) b = e.target.parentNode;
      if (b) showSingleDetail(parseInt(b.getAttribute('data-no'), 10));
    };

    el['btn-show-all'].onclick = renderAllDetail;
    el['btn-back-result'].onclick = function () { showPage('page-result'); };
    el['btn-restart'].onclick = function () {
      modal('再答一次', '将重新抽取一套随机题目，当前成绩不再保留。确定吗？', startPaper, '确定');
    };

    document.addEventListener('keydown', function (e) {
      if (!el['page-quiz'].classList.contains('active')) return;
      var k = e.key;
      if (k >= '1' && k <= '8') {
        var q = S.paper[S.idx];
        if (q) { selectOption(LETTERS[parseInt(k, 10) - 1]); e.preventDefault(); }
      } else if (k === 'ArrowRight') { el['btn-next'].click(); }
      else if (k === 'ArrowLeft') { el['btn-prev'].click(); }
    });
  }

  /* ---------------- 启动 ---------------- */
  function start() {
    cacheDom();
    bindEvents();
    el['home-total'].textContent =
      CONFIG.quota.single + CONFIG.quota.multi + CONFIG.quota.judge;

    fetch(C.assetUrl(CONFIG.bankUrl) + '?t=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (bank) {
        if (!Array.isArray(bank) || !bank.length) throw new Error('题库为空');

        var chk = C.checkBank(bank, CONFIG.quota);
        var rangeBad = C.checkAnswersInRange(bank);
        if (rangeBad.length) console.warn('题库答案越界:', rangeBad);

        S.bank = bank;
        if (!chk.ok) {
          console.warn('题库检查:', chk.problems);
          toast('题库提醒：' + chk.problems[0]);
        }

        var st = loadState();
        if (st && st.paper && st.paper.length && !st.submitted) {
          S.paper = st.paper; S.answers = st.answers || {}; S.idx = st.idx || 0;
          renderQuestion(); showPage('page-quiz');
          toast('已恢复上次答题进度');
        } else if (st && st.submitted && st.paper) {
          S.paper = st.paper; S.answers = st.answers || {};
          S.result = C.grade(S.paper, S.answers, CONFIG.score);
          renderResult(); showPage('page-result');
        } else {
          showPage('page-home');
        }
      })
      .catch(function (err) {
        console.error(err);
        setHTML('q-stem',
          '<div style="color:#ef4444;font-size:15px;line-height:1.8">题库加载失败：' +
          esc(err.message) + '<br/><br/>' +
          '请确认 <code>data/questions.sample.json</code> 存在，' +
          '且是通过 HTTP 服务打开本页（不要直接双击 html 文件）。</div>');
        showPage('page-quiz');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
})();
