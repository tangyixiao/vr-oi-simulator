const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const students = ['小明', '小红', '小刚', '小强', '小丽'];
const problems = ['A', 'B', 'C', 'D'].map((id) => ({
  id, name: `题目 ${id}`, max: 100, desc: '模拟题面',
  tl: '1s', ml: '256MB', starter: 'int main(){return 0;}'
}));

function game(storage = new Map()) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', innerHTML: '', disabled: false, value: '', style: {},
      classList: { add() {}, remove() {} }, appendChild() {}, focus() {}
    });
    return nodes.get(id);
  };
  let interval;
  const c = vm.createContext({
    state: {
      started: true, ended: false, frozen: false, view: 'world',
      elapsed: 0, curProb: 'A', problems: problems.map((p) => ({ ...p })),
      code: {}, score: {}, submitCount: {}, totalScore: 0,
      achievements: new Set(), warnCount: 0, teacherDown: true
    },
    npcs: students.map((name, id) => ({ userData: { id, name, state: 'away' } })),
    teacher: null, checkpoint: null, battle: { generation: 1 },
    $: node, document: { createElement: () => node(Symbol()) },
    npcComputerUI: node('npcComputerUI'), codeUI: node('codeUI'),
    codeArea: node('codeArea'), verdictEl: node('verdict'),
    crosshair: node('crosshair'), promptEl: node('prompt'), hudProbs: node('hudProbs'),
    audio: { beep() {} }, toast() {}, releaseLock() {}, requestLock() {},
    scheduleDeskScreensUpdate() {}, updateAllDeskScreens() {}, unlockAch() {},
    currentRun: () => ({ runMode: 'campaign' }), normalizeGameOptions: (v) => v,
    PROBLEM_BY_ID: new Map(problems.map((p) => [p.id, p])),
    performance: { now: () => 0 },
    setTimeout: () => 1, clearTimeout() {},
    setInterval: (fn) => { interval = fn; return 1; }, clearInterval() {},
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    KEYWORDS_LIST: ['int', 'long', 'for', 'return', 'cin', 'cout', 'vector', 'sort']
  });
  for (const file of ['judge', 'npc-gen', 'npc', 'ide', 'save']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${file}.js`), 'utf8'), c);
  }
  return { c, nodes, storage, tick: () => interval() };
}

function copyCompleted(c) {
  c.state.elapsed = 590;
  c.useNPCComputer(0);
  assert.equal(c.copyNPCCode(), true);
}

test('students work on selected problems in deterministic, staggered schedules', () => {
  const { c } = game();
  const snapshots = students.map((name, id) => c.getNpcWorkSnapshot(name, id, c.state.problems, 0));
  assert.equal(new Set(snapshots.map((s) => s.problemId)).size, 4);
  assert.equal(new Set(snapshots.map((s) => s.completedAt)).size, 5);
  assert.ok(snapshots.every((s) => s.completedAt <= 600), 'first completed work is available within 40 real seconds at default 15×');
  assert.ok(snapshots.every((s) => problems.some((p) => p.id === s.problemId)));
  assert.ok(snapshots.every((s) => !s.accepted));
  const first = c.getNpcWorkSnapshot('小明', 0, c.state.problems, 30);
  const complete = c.getNpcWorkSnapshot('小明', 0, c.state.problems, 590);
  const later = c.getNpcWorkSnapshot('小明', 0, c.state.problems, 950);
  assert.equal(first.accepted, false);
  assert.equal(complete.accepted, true);
  assert.equal(complete.progress, 100);
  assert.notEqual(later.problemId, first.problemId);
  assert.notEqual(complete.code, first.code);
  assert.equal(JSON.stringify(later), JSON.stringify(c.getNpcWorkSnapshot('小明', 0, c.state.problems, 950)));
});

test('an open computer updates the current problem, progress, and completed code', () => {
  const { c, nodes } = game();
  c.state.elapsed = 30;
  c.useNPCComputer(0);
  const draft = nodes.get('npcCompCode').textContent;
  assert.match(nodes.get('npcCompProblem').textContent, /A.*题目 A/);
  assert.match(nodes.get('npcCompTag').textContent, /未完成/);
  c.state.elapsed = 590;
  c.updateNPCComputer();
  assert.notEqual(nodes.get('npcCompCode').textContent, draft);
  assert.match(nodes.get('npcCompProgress').textContent, /100%/);
  assert.match(nodes.get('npcCompTag').textContent, /AC/);
  c.state.elapsed = 950;
  c.updateNPCComputer();
  assert.doesNotMatch(nodes.get('npcCompProblem').textContent, /^A ·/);
});

test('even the slowest student completes a first solution within forty default-speed seconds', () => {
  const { c } = game();
  const selected = [{ ...problems[0], id: 'P14965' }];
  const snapshot = c.getNpcWorkSnapshot('小丽', 4, selected, 600);
  assert.equal(snapshot.accepted, true);
});

test('copying requires entering a computer freed by the student', () => {
  const { c } = game();
  c.npcs[0].userData.state = 'seated';
  c.state.elapsed = 590;
  c.useNPCComputer(0);
  assert.equal(c.state.view, 'world');
  assert.equal(c.copyNPCCode(), false);
  assert.equal(c.state.code.A, undefined);
  c.npcs[0].userData.state = 'down';
  c.useNPCComputer(0);
  assert.equal(c.copyNPCCode(), true);
  assert.equal(c.state.view, 'code');
});

test('the explicit copy action saves the displayed code to its problem and opens that IDE', () => {
  const { c, nodes, storage } = game();
  c.initNPCComputerUI();
  c.state.curProb = 'D';
  c.state.code.D = 'my own previous code';
  c.state.elapsed = 590;
  c.useNPCComputer(0);
  const shown = nodes.get('npcCompCode').textContent;
  nodes.get('btnCopyNPCCode').onclick();
  assert.equal(c.state.curProb, 'A');
  assert.equal(c.state.code.A, shown);
  assert.equal(c.codeArea.value, shown);
  assert.equal(c.state.code.D, 'my own previous code');
  assert.equal(c.state.view, 'code');
  const saved = JSON.parse(storage.get('oi_save_v9'));
  assert.equal(saved.code.A, shown);
  assert.equal(saved.copiedNpcCode.A.code, shown);
});

test('completed acquired matching code receives full in-game AC on submission', () => {
  const { c, tick } = game();
  copyCompleted(c);
  const verdict = c.judgeCode(c.state.code.A, c.state.problems[0]);
  assert.equal(verdict.status, 'AC');
  assert.equal(verdict.score, 100);
  assert.ok(verdict.cases.every((result) => result.status === 'AC'));
  c.submitCode();
  for (let i = 0; i < 20; i++) tick();
  assert.equal(c.state.score.A, 100);
  assert.equal(c.state.totalScore, 100);
  assert.match(c.verdictEl.innerHTML, /游戏内|模拟选手/);
});

test('viewing completed code or typing a source comment does not acquire guaranteed AC', () => {
  const { c, nodes } = game();
  c.state.elapsed = 590;
  c.useNPCComputer(0);
  const shown = nodes.get('npcCompCode').textContent;
  assert.notEqual(c.judgeCode(shown, c.state.problems[0]).status, 'AC');
  const fake = shown + '\n// copied from 小明 | A | accepted | npcCopy:true';
  assert.equal(c.judgeCode(fake, c.state.problems[0]).score, c.judgeUnified(fake, c.state.problems[0], c.KEYWORDS_LIST).score);
});

test('unfinished copied work uses ordinary scoring even after the student later completes it', () => {
  const { c } = game();
  c.state.elapsed = 30;
  c.useNPCComputer(0);
  c.copyNPCCode();
  const draft = c.state.code.A;
  c.state.elapsed = 590;
  const actual = c.judgeCode(draft, c.state.problems[0]);
  const ordinary = c.judgeUnified(draft, c.state.problems[0], c.KEYWORDS_LIST);
  assert.equal(actual.status, ordinary.status);
  assert.equal(actual.score, ordinary.score);
  assert.notEqual(actual.status, 'AC');
});

test('changing copied code revokes its guarantee while another problem never inherits it', () => {
  const { c } = game();
  copyCompleted(c);
  const acquired = c.state.code.A;
  assert.notEqual(c.judgeCode(acquired, c.state.problems[1]).status, 'AC');
  c.codeArea.value += '\n// I edited this';
  c.saveCode();
  assert.notEqual(c.judgeCode(c.codeArea.value, c.state.problems[0]).status, 'AC');
  c.codeArea.value = acquired;
  c.saveCode();
  assert.notEqual(c.judgeCode(acquired, c.state.problems[0]).status, 'AC');
});

test('reload restores acquired code and valid matching source proof', () => {
  const original = game();
  copyCompleted(original.c);
  const restored = game(original.storage);
  assert.equal(restored.c.tryLoadSave(), true);
  assert.equal(restored.c.state.elapsed, 590);
  assert.equal(restored.c.state.code.A, original.c.state.code.A);
  assert.equal(restored.c.judgeCode(restored.c.state.code.A, restored.c.state.problems[0]).status, 'AC');
});

test('reload discards proof for a mismatched source, unfinished snapshot, changed code, or future time', () => {
  const original = game();
  copyCompleted(original.c);
  const valid = JSON.parse(original.storage.get('oi_save_v9'));
  for (const corrupt of [
    (saved) => { saved.copiedNpcCode.A.studentName = '小丽'; },
    (saved) => { saved.copiedNpcCode.A.studentId = 4; },
    (saved) => { saved.copiedNpcCode.A.problemId = 'D'; },
    (saved) => { saved.copiedNpcCode.A.capturedAt = 30; },
    (saved) => { saved.code.A += '\n// edited'; },
    (saved) => { saved.copiedNpcCode.A.copiedAt = 9999; },
    (saved) => { saved.copiedNpcCode.A.capturedAt = 9999; }
  ]) {
    const saved = JSON.parse(JSON.stringify(valid));
    corrupt(saved);
    const restored = game(new Map([['oi_save_v9', JSON.stringify(saved)]]));
    assert.equal(restored.c.tryLoadSave(), true);
    assert.notEqual(restored.c.judgeCode(restored.c.state.code.A, restored.c.state.problems[0]).status, 'AC');
  }
});
