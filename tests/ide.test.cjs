const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
function ide() {
  let tick;
  const button = { disabled: false };
  const c = vm.createContext({
    state: {
      started: true,
      ended: false,
      view: 'code',
      code: {},
      score: {},
      curProb: 'demo',
      teacherDown: true,
      submitCount: {},
      problems: [{ id: 'demo', max: 100, name: 'demo' }]
    },
    battle: { generation: 1 },
    teacher: null,
    codeArea: { value: 'int main(){return 0;}' },
    hudProbs: {},
    verdictEl: { classList: { remove() {} }, innerHTML: '' },
    $: (id) =>
      id === 'btnSubmit'
        ? button
        : { style: {}, appendChild() {}, innerHTML: '' },
    audio: { beep() {} },
    scheduleAutoSave() {},
    scheduleDeskScreensUpdate() {},
    containsBannedWord: () => null,
    judgeUnified: () => ({ score: 100, status: 'AC', cases: [] }),
    KEYWORDS_LIST: [],
    setInterval(fn) {
      tick = fn;
      return 1;
    },
    clearInterval() {},
    unlockAch() {},
    document: { createElement: () => ({}) }
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../js/ide.js'), 'utf8'),
    c
  );
  return { c, button, tick: () => tick() };
}
test('pending simulated judging cannot change scores after ending', () => {
  const { c, button, tick } = ide();
  c.submitCode();
  c.state.ended = true;
  for (let i = 0; i < 20; i++) tick();
  assert.equal(c.state.score.demo, undefined);
  assert.equal(button.disabled, false);
});
test('pending simulated judging cannot change scores after chapter switch', () => {
  const { c, button, tick } = ide();
  c.submitCode();
  c.battle.generation++;
  for (let i = 0; i < 20; i++) tick();
  assert.equal(c.state.score.demo, undefined);
  assert.equal(button.disabled, false);
});
