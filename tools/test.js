/* 核心逻辑测试: node tools/test.js */
const path = require('path');
const fs = require('fs');
const C = require(path.join(__dirname, '..', 'assets', 'core.js'));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ' 期望 ' + JSON.stringify(b) + ' 实际 ' + JSON.stringify(a));
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }

const QUOTA = { single: 20, multi: 20, judge: 10 };
const SCORE = { single: 2, multi: 2, judge: 2 };

console.log('\n=== 核心逻辑测试 ===\n');

const bankPath = path.join(__dirname, '..', 'data', 'questions.staff.json');
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const mgrPath = path.join(__dirname, '..', 'data', 'questions.manager.json');
const mgrBank = JSON.parse(fs.readFileSync(mgrPath, 'utf8'));

t('题库可加载且非空', () => { ok(bank.length > 0, '题库为空'); });

t('店员与店长两套题库都存在且非空', () => {
  ok(bank.length > 0, '店员题库为空');
  ok(mgrBank.length > 0, '店长题库为空');
});

t('题库完整性检查通过（单选20/多选20/判断10 够抽）', () => {
  const chk = C.checkBank(bank, QUOTA);
  ok(chk.ok, '检查未通过: ' + chk.problems.join('; '));
  const chk2 = C.checkBank(mgrBank, QUOTA);
  ok(chk2.ok, '店长题库检查未通过: ' + chk2.problems.join('; '));
});

t('所有题目的正确答案都在选项范围内', () => {
  const bad = C.checkAnswersInRange(bank);
  eq(bad, [], '存在越界: ' + bad.join('; '));
  const bad2 = C.checkAnswersInRange(mgrBank);
  eq(bad2, [], '店长题库存在越界: ' + bad2.join('; '));
});

t('题目不含解析字段（只保留正确答案）', () => {
  const withA = bank.filter(q => q.analysis !== undefined);
  eq(withA.length, 0, withA.length + ' 道题仍带有 analysis 字段');
});

t('id 唯一', () => {
  const ids = bank.map(q => q.id);
  eq(ids.length, new Set(ids).size, '存在重复 id');
});

t('抽题数量正确：50 题，类型配额正确', () => {
  const paper = C.buildPaper(bank, QUOTA);
  eq(paper.length, 50, '题目总数不对');
  const cnt = { single: 0, multi: 0, judge: 0 };
  paper.forEach(q => cnt[q.type]++);
  eq(cnt, { single: 20, multi: 20, judge: 10 }, '类型配额不对');
});

t('抽题不重复（同一份卷内 id 唯一）', () => {
  for (let i = 0; i < 20; i++) {
    const paper = C.buildPaper(bank, QUOTA);
    const ids = paper.map(q => q.id);
    eq(ids.length, new Set(ids).size, '第' + i + '次抽题出现重复');
  }
});

t('试卷分段排列：前20单选、中20多选、后10判断', () => {
  for (let i = 0; i < 20; i++) {
    const p = C.buildPaper(bank, QUOTA);
    for (let j = 0; j < 20; j++) {
      ok(p[j].type === 'single', '第' + (j + 1) + '题应为单选，实际 ' + p[j].type);
    }
    for (let j = 20; j < 40; j++) {
      ok(p[j].type === 'multi', '第' + (j + 1) + '题应为多选，实际 ' + p[j].type);
    }
    for (let j = 40; j < 50; j++) {
      ok(p[j].type === 'judge', '第' + (j + 1) + '题应为判断，实际 ' + p[j].type);
    }
  }
});

t('段内随机：两次抽题的同段题目不同', () => {
  const a = C.buildPaper(bank, QUOTA).map(q => q.id).join();
  let diff = false;
  for (let i = 0; i < 10; i++) {
    if (C.buildPaper(bank, QUOTA).map(q => q.id).join() !== a) { diff = true; break; }
  }
  ok(diff, '多次抽题结果完全相同，疑似未随机');
});

t('抽题是随机的（两次抽样结果不同）', () => {
  const a = C.buildPaper(bank, QUOTA).map(q => q.id).join();
  let diff = false;
  for (let i = 0; i < 10; i++) {
    if (C.buildPaper(bank, QUOTA).map(q => q.id).join() !== a) { diff = true; break; }
  }
  ok(diff, '多次抽样结果完全相同，随机性失效');
});

t('单选：答对得分，答错 0 分', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const q = paper.find(x => x.type === 'single');
  const r = C.grade([q], { [q.id]: [C.normAns(q.answer)[0]] }, SCORE);
  eq(r.total, 2, '答对应得 2 分');
  eq(r.correct, 1);
  const wrong = C.LETTERS[(C.normAns(q.answer)[0].charCodeAt(0) - 65 + 1) % q.options.length];
  const r3 = C.grade([q], { [q.id]: [wrong] }, SCORE);
  eq(r3.total, 0, '答错应为 0 分');
  eq(r3.wrong, 1);
});

t('多选：全对得分，漏选/多选/错选均 0 分', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const q = paper.find(x => x.type === 'multi');
  const right = C.normAns(q.answer);

  const rFull = C.grade([q], { [q.id]: right }, SCORE);
  eq(rFull.total, 2, '全对应得 2 分');

  if (right.length >= 2) {
    const rPart = C.grade([q], { [q.id]: right.slice(0, right.length - 1) }, SCORE);
    eq(rPart.total, 0, '漏选应为 0 分');
  }

  const extra = right.slice();
  let k = 0;
  while (extra.indexOf(C.LETTERS[k]) >= 0) k++;
  if (k < q.options.length) {
    const rExtra = C.grade([q], { [q.id]: extra.concat([C.LETTERS[k]]) }, SCORE);
    eq(rExtra.total, 0, '多选应为 0 分');
  }
});

t('判断题：正确得分，错误 0 分', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const q = paper.find(x => x.type === 'judge');
  const r = C.grade([q], { [q.id]: [C.normAns(q.answer)[0]] }, SCORE);
  eq(r.total, 2);
  const wrongKey = C.normAns(q.answer)[0] === 'A' ? 'B' : 'A';
  const r2 = C.grade([q], { [q.id]: [wrongKey] }, SCORE);
  eq(r2.total, 0);
});

t('未作答计 0 分且计入未答数', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const r = C.grade(paper, {}, SCORE);
  eq(r.total, 0);
  eq(r.unanswered, 50);
  eq(r.correct, 0);
  eq(r.wrong, 0);
});

t('满分场景 = 100 分', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const answers = {};
  paper.forEach(q => { answers[q.id] = C.normAns(q.answer); });
  const r = C.grade(paper, answers, SCORE);
  eq(r.total, 100, '全对应为 100 分');
  eq(r.correct, 50);
  eq(r.wrong, 0);
  eq(r.unanswered, 0);
});

t('错一题 = 98 分', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const answers = {};
  paper.forEach(q => { answers[q.id] = C.normAns(q.answer); });
  const first = paper[0];
  const wrongKey = C.LETTERS[(C.normAns(first.answer)[0].charCodeAt(0) - 65 + 1) % first.options.length];
  answers[first.id] = [wrongKey];
  const r = C.grade(paper, answers, SCORE);
  eq(r.total, 98, '错一题应为 98 分');
  eq(r.wrong, 1);
});

t('grade 返回逐题明细，长度与题目数一致', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const r = C.grade(paper, {}, SCORE);
  eq(r.details.length, 50);
  eq(r.details[0].no, 1);
  eq(r.details[49].no, 50);
});

t('多选答案顺序不影响判分（AC 与 CA 等价）', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const q = paper.find(x => x.type === 'multi' && C.normAns(x.answer).length >= 2);
  const right = C.normAns(q.answer);
  const r = C.grade([q], { [q.id]: right.slice().reverse() }, SCORE);
  eq(r.total, 2, '顺序不同不应影响得分');
});

t('答案大小写不敏感', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const q = paper.find(x => x.type === 'single');
  const r = C.grade([q], { [q.id]: [C.normAns(q.answer)[0].toLowerCase()] }, SCORE);
  eq(r.total, 2, '小写答案应视为正确');
});

t('checkBank 能检出题量不足', () => {
  const small = bank.filter(q => q.type !== 'multi').slice(0, 5);
  const chk = C.checkBank(small, QUOTA);
  ok(!chk.ok, '应检出不足');
  ok(chk.problems.length > 0);
});

t('checkBank 能检出字段缺失', () => {
  const bad = [{ id: 'x', type: 'single', question: 'q', options: ['a'], answer: '' }];
  const chk = C.checkBank(bad, { single: 1 });
  ok(!chk.ok, '应检出缺答案');
});

t('checkAnswersInRange 能检出越界答案', () => {
  const bad = [{ id: 'x', type: 'single', question: 'q', options: ['a','b'], answer: 'D' }];
  const r = C.checkAnswersInRange(bad);
  eq(r.length, 1);
});

/* ---- 角色（店员/店长） ---- */
t('parseRole 识别 role 参数', () => {
  eq(C.parseRole('?role=staff').key, 'staff');
  eq(C.parseRole('?role=manager').key, 'manager');
  eq(C.parseRole('?role=店长').key, 'manager');
  eq(C.parseRole('?role=店员').key, 'staff');
  eq(C.parseRole('?t=123').key, 'staff', '无 role 参数应默认店员');
  eq(C.parseRole('').key, 'staff', '空参数应默认店员');
});

t('两个角色指向不同的题库文件', () => {
  ok(C.ROLES.staff.bankUrl !== C.ROLES.manager.bankUrl, '两角色题库文件不能相同');
  eq(C.ROLES.staff.label, '店员');
  eq(C.ROLES.manager.label, '店长');
});

t('两个角色题库内容不同（各答各的）', () => {
  const s = bank.map(q => q.question).join('|');
  const m = mgrBank.map(q => q.question).join('|');
  ok(s !== m, '店员与店长题库内容相同');
});

/* ---- 成绩分母固定为 20/20/10 ---- */
t('grade 的 byType 输出各题型答对题数（分母用配额）', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const ans = {};
  paper.forEach(q => { ans[q.id] = C.normAns(q.answer); });
  const r = C.grade(paper, ans, SCORE);
  eq(r.byType.single[0], 20, '单选答对数应为 20');
  eq(r.byType.multi[0], 20, '多选答对数应为 20');
  eq(r.byType.judge[0], 10, '判断答对数应为 10');
  eq(r.byType.single[1], 20, '单选总数应为 20');
  eq(r.byType.multi[1], 20, '多选总数应为 20');
  eq(r.byType.judge[1], 10, '判断总数应为 10');
});

t('byType 答对数与实际得分一致（全对时 20/20/10 题各 2 分）', () => {
  const paper = C.buildPaper(bank, QUOTA);
  const ans = {};
  paper.forEach(q => { ans[q.id] = C.normAns(q.answer); });
  const r = C.grade(paper, ans, SCORE);
  eq(r.byType.single[2], 40, '单选得分应为 40');
  eq(r.byType.multi[2], 40, '多选得分应为 40');
  eq(r.byType.judge[2], 20, '判断得分应为 20');
  eq(r.total, 100);
});

/* ---- 子路径托管（GitHub Pages）路径计算 ---- */
function baseDirOf(pathname) {
  const p = pathname.charAt(0) !== '/' ? '/' + pathname : pathname;
  const last = p.slice(p.lastIndexOf('/') + 1);
  if (last && last.indexOf('.') === -1) return p.replace(/[^/]*$/, '') + last + '/';
  return p.replace(/[^/]*$/, '');
}

t('baseDir: GitHub Pages 仓库子路径', () => {
  eq(baseDirOf('/quiz/index.html'), '/quiz/');
  eq(baseDirOf('/quiz/cast.html'), '/quiz/');
  eq(baseDirOf('/quiz/selfcheck.html'), '/quiz/');
});

t('baseDir: 仓库根路径（无子路径）', () => {
  eq(baseDirOf('/index.html'), '/');
  eq(baseDirOf('/cast.html'), '/');
});

t('baseDir: 带尾斜杠的目录形式', () => {
  eq(baseDirOf('/quiz/'), '/quiz/');
  eq(baseDirOf('/quiz'), '/quiz/');
});

t('baseDir: 多级子路径', () => {
  eq(baseDirOf('/a/b/quiz/index.html'), '/a/b/quiz/');
});

t('assetUrl: 拼接题库相对路径', () => {
  // 模拟 baseDir + 相对路径
  const join = (base, rel) => base + String(rel).replace(/^\//, '');
  eq(join(baseDirOf('/quiz/index.html'), 'data/questions.staff.json'),
     '/quiz/data/questions.staff.json');
  eq(join(baseDirOf('/index.html'), 'data/questions.staff.json'),
     '/data/questions.staff.json');
  eq(join(baseDirOf('/quiz/index.html'), 'data/questions.manager.json'),
     '/quiz/data/questions.manager.json');
});

console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===\n');
process.exit(fail ? 1 : 0);
