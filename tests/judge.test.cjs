const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function judge() {
  const c = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../js/judge.js'), 'utf8'),
    c
  );
  return c;
}
test('padding with comments or blank lines cannot increase simulated score', () => {
  const c = judge();
  const code =
    '#include <iostream>\nint main() {\nint x;\nstd::cin >> x;\nstd::cout << x;\nreturn 0;\n}';
  const base = c.judgeUnified(code, { id: 'demo' }, [
    'int',
    'return',
    'cin',
    'cout'
  ]);
  const padded = c.judgeUnified(
    code + '\n'.repeat(200) + '// fake solver\n'.repeat(200),
    { id: 'demo' },
    ['int', 'return', 'cin', 'cout']
  );
  assert.equal(padded.score, base.score);
  assert.deepEqual(
    JSON.parse(JSON.stringify(padded.cases)),
    JSON.parse(JSON.stringify(base.cases))
  );
});
test('blank-line padding cannot bypass the minimum meaningful-source check', () => {
  const c = judge(),
    short = 'int main(){return 0;}';
  const a = c.judgeUnified(short, { id: 'demo' }, ['int', 'return']);
  const b = c.judgeUnified(short + '\n'.repeat(100), { id: 'demo' }, [
    'int',
    'return'
  ]);
  assert.equal(b.status, a.status);
  assert.equal(b.score, a.score);
});
