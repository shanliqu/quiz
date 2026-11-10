/* 界面层端到端测试 (jsdom): node tools/test-ui.js */
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

console.log('\n=== 界面层端到端测试 (jsdom) ===\n');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const coreJs = fs.readFileSync(path.join(ROOT, 'assets', 'core.js'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8');
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions.sample.json'), 'utf8'));

const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
const { document } = window;

const store = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  },
  configurable: true
});
window.fetch = () => Promise.resolve({
  ok: true, status: 200,
  json: () => Promise.resolve(bank)
});

window.eval(coreJs);
window.eval(appJs);

function $(id) { return document.getElementById(id); }
function click(el) { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function activePage() {
  return ['page-home', 'page-quiz', 'page-result', 'page-detail']
    .find(p => $(p).classList.contains('active'));
}
function flush() { return new Promise(r => setTimeout(r, 30)); }

/** 前进到指定题型的第一道题（题型是乱序的，不能假设位置） */
function gotoType(label) {
  let guard = 0;
  while ($('q-type').textContent !== label && guard++ < 60) click($('btn-next'));
  if ($('q-type').textContent !== label) throw new Error('未找到题型 ' + label);
}

(async function run() {
  await flush(); await flush(); await flush();

  t('启动后停在首页', () => {
    eq(activePage(), 'page-home', '初始页面不对');
  });

  t('首页显示 50 题', () => {
    eq($('home-total').textContent, '50');
  });

  click($('btn-start'));
  await flush();

  t('点击开始后进入答题页', () => {
    eq(activePage(), 'page-quiz');
  });

  t('答题页渲染题干和选项', () => {
    ok($('q-stem').textContent.trim().length > 0, '题干为空');
    const n = $('q-options').children.length;
    ok(n >= 2 && n <= 6, '选项数量异常: ' + n);
  });

  t('题号显示 1/50，上一题禁用', () => {
    eq($('q-cur').textContent, '1');
    eq($('q-total').textContent, '50');
    ok($('btn-prev').disabled, '第一题时上一题应禁用');
  });

  t('单选题点击选项后标记为 selected', () => {
    gotoType('单选题');
    const opts = Array.from($('q-options').children);
    click(opts[1]);
    ok(opts[1].classList.contains('selected'), '选项未标记 selected');
    eq(opts[1].getAttribute('data-key'), 'B');
  });

  t('单选题再次点击其他选项会取消前一个', () => {
    gotoType('单选题');
    const opts = Array.from($('q-options').children);
    click(opts[1]);
    click(opts[2]);
    const after = Array.from($('q-options').children);
    eq(after.filter(o => o.classList.contains('selected')).length, 1, '应只有一个选中');
    ok(after[2].classList.contains('selected'));
  });

  t('下一题切换题号并渲染新题', () => {
    const cur = parseInt($('q-cur').textContent, 10);
    const before = $('q-stem').textContent;
    click($('btn-next'));
    eq($('q-cur').textContent, String(cur + 1));
    ok($('q-stem').textContent !== before, '题目内容未变化');
    ok(!$('btn-prev').disabled, '非第一题时上一题应可用');
  });

  t('上一题可以回退', () => {
    const cur = parseInt($('q-cur').textContent, 10);
    click($('btn-prev'));
    eq($('q-cur').textContent, String(cur - 1));
  });

  t('多选题可多选，再次点击取消', () => {
    gotoType('多选题');
    const opts = Array.from($('q-options').children);
    click(opts[0]);
    click(opts[1]);
    let after = Array.from($('q-options').children);
    eq(after.filter(o => o.classList.contains('selected')).length, 2, '应选中两个');
    click(opts[0]);
    after = Array.from($('q-options').children);
    eq(after.filter(o => o.classList.contains('selected')).length, 1, '再次点击应取消');
  });

  t('判断题只有 2 个选项', () => {
    gotoType('判断题');
    eq($('q-options').children.length, 2, '判断题应有 2 个选项');
  });

  t('交卷弹出确认框', () => {
    click($('btn-submit-top'));
    ok($('modal-mask').classList.contains('show'), '确认框未弹出');
  });

  t('确认提交后进入成绩页并显示得分', async () => {
    click($('modal-ok'));
    await flush();
    eq(activePage(), 'page-result', '未进入成绩页');
    const score = parseInt($('res-score').textContent, 10);
    ok(score >= 0 && score <= 100, '得分越界: ' + score);
  });

  t('成绩页题号总览有 50 个格子', () => {
    eq($('res-grid').children.length, 50);
  });

  t('题号格子按对错上色（正确绿/错误红/未答灰）', () => {
    const cells = Array.from($('res-grid').children);
    const cls = cells.map(c => c.className);
    ok(cls.every(c => /grid-cell (ok|bad|none)/.test(c)), '存在未上色的格子');
    ok(cls.some(c => c.includes('none')), '应存在未答的灰色格子');
  });

  t('点击题号展开该题解析（含题干、我的答案、正确答案、解析）', () => {
    const cell = Array.from($('res-grid').children).find(c => c.className.includes('bad')) ||
                 $('res-grid').children[0];
    click(cell);
    const h = $('res-detail').innerHTML;
    ok(h.includes('dc-analysis'), '缺少解析块');
    ok(h.includes('正确答案'), '缺少正确答案');
    ok(h.includes('我的答案'), '缺少我的答案');
    ok(h.includes('📖 解析'), '缺少解析标题');
  });

  t('查看全体详解渲染 50 张解析卡，每题都有解析正文', () => {
    click($('btn-show-all'));
    eq(activePage(), 'page-detail', '未进入详解页');
    eq($('detail-list').children.length, 50, '详解卡片数量不对');
    const texts = Array.from($('detail-list').children).map(c => c.textContent);
    ok(texts.every(x => x.includes('解析')), '有卡片缺少解析');
  });

  t('返回成绩页正常', () => {
    click($('btn-back-result'));
    eq(activePage(), 'page-result');
  });

  t('再答一次会重新抽题并重置', async () => {
    click($('btn-restart'));
    click($('modal-ok'));
    await flush();
    eq(activePage(), 'page-quiz', '未回到答题页');
    eq($('q-cur').textContent, '1');
    eq($('res-detail').innerHTML, '');
  });

  t('答题进度写入 localStorage', async () => {
    gotoType('单选题');
    click($('q-options').children[0]);
    await flush();
    const saved = JSON.parse(store['quiz_state_v1']);
    eq(saved.idx, 0);
    ok(saved.paper.length === 50, '未保存试卷');
    ok(Object.keys(saved.answers).length > 0, '未保存答案');
  });

  t('全部答对时成绩为 100 分', () => {
    const C = window.QuizCore;
    const paper = C.buildPaper(bank, { single: 20, multi: 20, judge: 10 });
    const ans = {};
    paper.forEach(q => { ans[q.id] = C.normAns(q.answer); });
    const r = C.grade(paper, ans, { single: 2, multi: 2, judge: 2 });
    eq(r.total, 100);
  });

  console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===\n');
  process.exit(fail ? 1 : 0);
})();
