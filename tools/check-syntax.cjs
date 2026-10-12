const fs = require('node:fs'),
  vm = require('node:vm');
let count = 0;
for (const dir of ['js', 'assets', 'assets/problems'])
  for (const f of fs.readdirSync(dir))
    if (f.endsWith('.js')) {
      new vm.Script(fs.readFileSync(`${dir}/${f}`, 'utf8'), {
        filename: `${dir}/${f}`
      });
      count++;
    }
console.log(`Syntax OK: ${count} scripts`);
