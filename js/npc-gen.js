'use strict';
/* =========================================================
   NPC 代码生成器
   模拟选手代码与确定性的答题时间表。
   代码只用于游戏内玩法，并非题库中真实题目的参考解答。
   ========================================================= */

const NPC_STYLES = {
  '小明': {
    indent: '    ',
    header: id => `// ${id} \u2014\u2014 小明\n// 认真读题，稳扎稳打`,
    inline: ['// 先读入', '// 核心处理', '// 输出结果'],
    stmtRange: [6, 9],
    useSort: true,
    useBubble: false,
  },
  '小红': {
    indent: '    ',
    header: id => `// ${id} \u2014\u2014 小红`,
    inline: ['// 注意边界'],
    stmtRange: [5, 8],
    useSort: true,
    useBubble: false,
  },
  '小刚': {
    indent: '    ',
    header: id => `// ${id} by 小刚`,
    inline: [],
    stmtRange: [4, 6],
    useSort: true,
    useBubble: false,
  },
  '小强': {
    indent: '  ',
    header: id => `// ${id}`,
    inline: [],
    stmtRange: [3, 5],
    useSort: false,
    useBubble: true,
  },
  '小丽': {
    indent: '    ',
    header: id => `// ${id} …… 好难`,
    inline: ['// 不会写', '// 先随便写写'],
    stmtRange: [2, 4],
    useSort: false,
    useBubble: false,
  },
};

const STMT_POOL = {
  loopBody: [
    'ans += a[i];',
    'ans = max(ans, a[i]);',
    'ans = min(ans, a[i]);',
    'sum += i;',
    'if (a[i] > 0) ans++;',
    'ans = (ans + a[i]) % 1000000007;',
  ],
  sortStmt: [
    'sort(a.begin(), a.end());',
    'sort(a.begin(), a.end(), greater<long long>());',
    'reverse(a.begin(), a.end());',
  ],
  write: [
    'cout << ans << endl;',
    'cout << sum << endl;',
    'cout << ans + sum << endl;',
  ],
};

function genNpcCode(npcName, probId){
  const style = NPC_STYLES[npcName] || NPC_STYLES['小刚'];
  const rng = mulberry32(hashStr(npcName + '|' + probId));
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const range = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const ind = style.indent;
  const inner = ind + ind;

  const lines = [];
  lines.push('// 游戏内选手模拟代码，非本题真实参考解答');
  lines.push(style.header(probId));
  lines.push('#include <bits/stdc++.h>');
  lines.push('using namespace std;');
  lines.push('');
  lines.push('int main() {');
  lines.push(ind + 'ios::sync_with_stdio(false);');
  lines.push(ind + 'cin.tie(0);');
  lines.push('');

  /* 1. 声明区 */
  lines.push(ind + 'int n;');
  lines.push(ind + 'long long ans = 0;');
  lines.push(ind + 'long long sum = 0;');
  lines.push(ind + 'vector<long long> a;');

  /* 2. 输入区 */
  lines.push(ind + 'cin >> n;');
  lines.push(ind + 'a.resize(n);');
  lines.push(ind + 'for (int i = 0; i < n; i++) cin >> a[i];');

  /* 3. 逻辑区 */
  if (style.inline.length && rng() < 0.6){
    lines.push(ind + pick(style.inline));
  }
  const bodyN = range(style.stmtRange[0], style.stmtRange[1]);
  lines.push(ind + 'for (int i = 0; i < n; i++) {');
  for (let i = 0; i < bodyN; i++){
    lines.push(inner + pick(STMT_POOL.loopBody));
  }
  lines.push(ind + '}');

  /* 4. 排序 / 冒泡（可选） */
  if (style.useSort && rng() < 0.7){
    lines.push(ind + pick(STMT_POOL.sortStmt));
  } else if (style.useBubble && rng() < 0.6){
    lines.push(ind + 'for (int i = 0; i < n - 1; i++)');
    lines.push(inner + 'for (int j = 0; j < n - 1 - i; j++)');
    lines.push(inner + ind + 'if (a[j] > a[j + 1]) swap(a[j], a[j + 1]);');
  }

  /* 5. 输出 */
  lines.push('');
  lines.push(ind + pick(STMT_POOL.write));
  lines.push('');
  lines.push(ind + 'return 0;');
  lines.push('}');

  return lines.join('\n');
}

/* 每位选手的题序、起步时间和速度不同；完成后保留代码直到下一题。
   输入只包含本局题目和比赛时间，因此重新读档会恢复同一时间表。 */
function getNpcWorkSnapshot(npcName, studentId, problems, elapsed){
  if (!Array.isArray(problems) || !problems.length ||
      !Number.isInteger(studentId) ||
      Object.keys(NPC_STYLES)[studentId] !== npcName) return null;
  const capturedAt = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const direction = studentId % 2 === 0 ? 1 : -1;
  let startedAt = studentId * 20 + hashStr(npcName + '|start') % 20;
  let problem, completedAt, nextAt;
  for (let phase = 0; phase < problems.length; phase++){
    const index = ((studentId + direction * phase) % problems.length + problems.length) % problems.length;
    problem = problems[index];
    const seed = hashStr(npcName + '|' + studentId + '|' + problem.id);
    completedAt = startedAt + 180 + studentId * 65 + seed % 50;
    nextAt = startedAt + 600 + studentId * 55 + seed % 120;
    if (capturedAt < nextAt || phase === problems.length - 1) break;
    startedAt = nextAt;
  }
  const accepted = capturedAt >= completedAt;
  const progress = accepted ? 100 : Math.max(0,
    Math.min(99, Math.floor((capturedAt - startedAt) / (completedAt - startedAt) * 100)));
  const completeCode = genNpcCode(npcName, problem.id);
  let code = completeCode;
  if (!accepted){
    const lines = completeCode.split('\n');
    const visibleLines = Math.min(lines.length - 2, 6 + Math.floor((lines.length - 8) * progress / 100));
    code = lines.slice(0, visibleLines).join('\n') + '\n// 正在编写，尚未完成';
  }
  return {
    studentId, studentName: npcName, problemId: problem.id, problemName: problem.name,
    progress, accepted, code, startedAt, completedAt, nextAt, capturedAt
  };
}

/* 存档与评测都重新核验来源、完成时刻、题号及完整文本。
   代码里的注释不会被当作已抄取的凭据。 */
function isValidCopiedNpcCodeProof(proof, code, problemId, problems, elapsed){
  if (!proof || proof.version !== 1 || typeof code !== 'string' ||
      proof.problemId !== problemId || proof.code !== code ||
      !Number.isFinite(elapsed) || !Number.isFinite(proof.capturedAt) ||
      !Number.isFinite(proof.copiedAt) || proof.capturedAt < 0 ||
      proof.capturedAt > proof.copiedAt || proof.copiedAt > elapsed) return false;
  const snapshot = getNpcWorkSnapshot(proof.studentName, proof.studentId, problems, proof.capturedAt);
  return !!snapshot && snapshot.accepted && snapshot.problemId === problemId && snapshot.code === code;
}
