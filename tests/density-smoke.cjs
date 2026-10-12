const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader'
    ]
  });
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } }),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(process.env.TEST_URL || 'http://127.0.0.1:8765');
    await p.waitForFunction(() => !!fistRig);
    await p.locator('#runMode').selectOption('endless');
    await p.locator('#btnStart').click();
    await p.keyboard.press('r');
    const density = await p.evaluate(() => {
      perfScale = 0.5;
      for (let i = 0; i < 15; i++) updateBattle(1);
      return { alive: aliveGuardCount(), spawned: battle.spawned };
    });
    assert.equal(density.alive, 64);
    assert.equal(density.spawned, 64);
    await p.mouse.click(640, 400);
    assert.equal(await p.evaluate(() => state.bestPunch), 64);
    assert.equal(
      await p.evaluate(
        () =>
          state.achievements.has('one_punch') &&
          state.achievements.has('chair50')
      ),
      true
    );
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => state.view === 'pause');
    await p.locator('#comfortPause').selectOption('strong');
    assert.equal(
      await p.evaluate(
        () => gameOptions.trail && gameOptions.blink && shakeEnabled
      ),
      true
    );
    await p.locator('#trailPause').uncheck();
    assert.equal(await p.evaluate(() => gameOptions.trail), false);
    await p.locator('#fragmentsPause').uncheck();
    assert.equal(await p.evaluate(() => debrisList.length), 0);
    await p.locator('#qualityPause').selectOption('low');
    await p.locator('#comfortPause').selectOption('comfort');
    await p.reload();
    await p.waitForFunction(() => !!fistRig);
    assert.equal(await p.locator('#qualityStart').inputValue(), 'low');
    assert.equal(await p.locator('#comfortStart').inputValue(), 'comfort');
    assert.equal(await p.locator('#fragmentsStart').isChecked(), false);
    assert.deepEqual(errors, []);
    console.log(
      'Density/settings smoke passed: 64-guard actual chair click, one-punch achievement, independent effects and persisted quality.'
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
