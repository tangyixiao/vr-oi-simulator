const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:8765';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base);
    await page.waitForFunction(() => !!gunRigs.gatling && typeof getNpcWorkSnapshot === 'function');
    await page.locator('#combatMode').selectOption('challenge');
    await page.locator('#guardHealthStart').fill('100');
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => pointerLocked);
    await page.evaluate(() => {
      timeScale = 1; state.elapsed = 0; state.teacherWarnActive = true;
      teacher.userData.mode = 'warn';
      for (const n of npcs) { n.userData.state = 'away'; n.userData.timer = 0; }
      useNPCComputer(0);
    });
    await page.waitForFunction(() => state.view === 'npcComputer');
    assert.match(await page.locator('#npcCompProgress').textContent(), /0|未|进度/);
    await page.locator('#btnCopyNPCCode').click();
    assert.equal(await page.evaluate(() => state.view), 'code');
    assert.notEqual(await page.evaluate(() => judgeCode(codeArea.value, state.problems.find(p => p.id === state.curProb)).status), 'AC');
    await page.keyboard.press('Escape');
    const schedule = await page.evaluate(() => {
      const samples = npcs.map(n => getNpcWorkSnapshot(n.userData.name, n.userData.id, state.problems, 550));
      return { ids: samples.map(s => s.problemId), done: samples.map(s => s.accepted) };
    });
    assert.ok(new Set(schedule.ids).size > 1, 'different students must work on different problems');
    assert.ok(schedule.done.some(Boolean));
    await page.evaluate(() => {
      state.elapsed = 550;
      const i = npcs.findIndex(n => getNpcWorkSnapshot(n.userData.name, n.userData.id, state.problems, state.elapsed).accepted);
      useNPCComputer(i);
    });
    await page.waitForFunction(() => state.view === 'npcComputer');
    const displayed = await page.locator('#npcCompCode').textContent();
    await page.screenshot({ path: '.work/npc-copy-ready.png' });
    await page.locator('#btnCopyNPCCode').click();
    assert.equal(await page.locator('#codeArea').inputValue(), displayed);
    const copiedId = await page.evaluate(() => state.curProb);
    await page.locator('#btnSubmit').click();
    await page.waitForFunction(() => state.score[state.curProb] === 100);
    assert.match(await page.locator('#verdict').textContent(), /Accepted/);
    assert.notEqual(await page.evaluate(() => {
      const other = state.problems.find(p => p.id !== state.curProb);
      return judgeCode(codeArea.value, other).status;
    }), 'AC', 'copy proof must be tied to the matching problem');
    assert.notEqual(await page.evaluate(() => {
      const p = state.problems.find(p => p.id === state.curProb);
      return judgeCode(codeArea.value + '\nint changed = 123;', p).status;
    }), 'AC', 'editing code must invalidate the acquired-code guarantee');
    await page.evaluate(() => persistSave());
    await page.reload(); await page.waitForFunction(() => !!gunRigs.gatling);
    await page.locator('#btnStart').click();
    assert.equal(await page.evaluate(() => state.curProb), copiedId);
    assert.equal(await page.evaluate(() => judgeCode(state.code[state.curProb], state.problems.find(p => p.id === state.curProb)).status), 'AC');
    // Real standing model, independent health and visible damage bar.
    await page.evaluate(() => {
      dismissDialogs(); state.view = 'world'; state.teacherWarnActive = true;
      if (teacher) { scene.remove(teacher.group); teacher = null; }
      state.teacherDown = true; state.hp = 3; state.hpVisible = true; state.lastDamageAt = 1e9;
      stopBattle(); resetPlayer(-2.5, 0);
      const g = buildSecurityGuard(-2.5, -3);
      g.userData = { alive: true, navSlot: 0, speedFactor: 1 };
      initGuardHealth(g); securityGuards.push(g); battle.target = Infinity;
      gameOptions.guardSpeed = 0.5;
      camera.lookAt(-2.5, 1.58, -3); state.pitch = pitchTarget = camera.rotation.x;
      state.yaw = yawTarget = camera.rotation.y;
    });
    await page.waitForFunction(() => pointerLocked);
    const standing = await page.evaluate(() => {
      const g = securityGuards[0];
      return { left: !!g.legL, right: !!g.legR, hp: g.userData.hp };
    });
    assert.deepEqual(standing, { left: true, right: true, hp: 100 });
    await page.keyboard.press('2');
    await page.mouse.click(640, 400);
    assert.equal(await page.evaluate(() => securityGuards[0].userData.hp), 40);
    assert.equal(await page.evaluate(() => state.guardKills), 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => state.view === 'pause');
    await page.locator('#guardHealthPause').fill('200');
    assert.equal(await page.evaluate(() => securityGuards[0].userData.hp), 80);
    assert.equal(await page.evaluate(() => securityGuards[0].userData.maxHp), 200);
    await page.locator('#btnResume').click();
    await page.waitForFunction(() => pointerLocked);
    await page.keyboard.press('4');
    assert.equal(await page.evaluate(() => state.weapon), 'gatling');
    await page.waitForFunction(() => gunRigs.gatling.visible && $('battleHud').textContent.includes('加特林'));
    assert.equal(await page.evaluate(() => gunMagazine('gatling')), 200);
    await page.mouse.down();
    await page.waitForFunction(() => gunMagazine('gatling') <= 194);
    await page.mouse.up();
    const released = await page.evaluate(() => gunMagazine('gatling'));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => gunMagazine('gatling')), released);
    await page.screenshot({ path: '.work/gatling-health.png' });
    await page.keyboard.press('r');
    await page.waitForFunction(() => gunReload === 0 && gunMagazine('gatling') === 200);
    // Checkpoint roundtrip preserves the new weapon and live setting.
    await page.evaluate(() => { beginBattle('classroom', 50); captureCheckpoint(); });
    await page.reload(); await page.waitForFunction(() => !!gunRigs.gatling);
    assert.equal(await page.locator('#guardHealthStart').inputValue(), '200');
    await page.locator('#btnStart').click();
    assert.equal(await page.evaluate(() => state.weapon), 'gatling');
    assert.equal(await page.evaluate(() => gunMagazine('gatling')), 200);
    const infinite = await page.evaluate(() => {
      const original = state.runConfig;
      state.runConfig = Object.freeze({ ...original, combatMode: 'power' });
      const rounds = gunAmmo.gatling;
      setFirearmTrigger(true);
      for (let i = 0; i < 100; i++) updateFirearms(0.1);
      clearFirearmInput();
      renderBattleHud();
      const result = { infinite: gunMagazine('gatling') === Infinity, stored: gunAmmo.gatling === rounds,
        reload: reloadGun(), text: $('battleHud').textContent };
      state.runConfig = original; resetFirearms();
      return result;
    });
    assert.equal(infinite.infinite, true);
    assert.equal(infinite.stored, true);
    assert.equal(infinite.reload, false);
    assert.match(infinite.text, /∞|无限/);
    // Actual new courtyard resources and ground height connect to the scene.
    const terrain = await page.evaluate(() => {
      battle.ready = true; enterCampusSection(2); stopBattle(); state.lastDamageAt = 1e9;
      let raised = 0;
      for (let x = -10; x <= 10; x += 0.5) for (let z = -8; z <= 8; z += 0.5)
        if (groundHeight(x, z) > 0.2) raised++;
      renderer.render(scene, camera);
      return { raised, children: scene.children.length, height: camera.position.y };
    });
    assert.ok(terrain.raised > 10);
    await page.waitForFunction(() => $('battleHud').textContent.includes('庭院'));
    await page.screenshot({ path: '.work/terrain-courtyard.png' });
    assert.deepEqual(errors, []);
    console.log('Arsenal/copy browser passed: incomplete/complete copied-code verdicts, different student schedules, proof save/reload, standing guards, independent tunable HP, Gatling input/reload/checkpoint and raised courtyard terrain.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
