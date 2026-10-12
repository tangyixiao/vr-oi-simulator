const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:8765';
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
(async () => {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader'
    ]
  });
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 }
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const remote = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(base)) remote.push(req.url());
  });
  try {
    await page.goto(base);
    await page.waitForFunction(
      () => typeof initWeapons === 'function' && !!fistRig
    );
    await page.screenshot({ path: '.work/menu.png' });
    assert.equal(await page.locator('#comfortStart').inputValue(), 'comfort');
    await page.locator('#guardTarget').fill('200');
    await page.locator('#guardTarget').dispatchEvent('change');
    await page.locator('#btnStart').click();
    await page.keyboard.press('r');
    assert.equal(await page.evaluate(() => state.weapon), 'chair');
    // E must open the computer while the teacher is still attackable globally.
    await page.evaluate(() => {
      const face = interactables.find(
        (o) => o.userData.interact.label === '使用电脑'
      );
      const p = new THREE.Vector3();
      face.getWorldPosition(p);
      state.pos.set(p.x, 1.65, p.z + 1.5);
      camera.position.copy(state.pos);
      camera.lookAt(p);
      state.pitch = camera.rotation.x;
      state.yaw = camera.rotation.y;
      yawTarget = state.yaw;
      pitchTarget = state.pitch;
    });
    await page.waitForFunction(() => actionE && state.view === 'world');
    await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => state.view), 'code');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      dismissDialogs();
      state.view = 'world';
      resetPlayer(0, -1.72);
    });
    await page.mouse.click(640, 400);
    assert.equal(await page.evaluate(() => state.teacherDown), true);
    assert.equal(await page.evaluate(() => teacher), null);
    await page.evaluate(() => {
      showBannedWordDialog('shit');
      triggerNPCComplaint('test');
      if (hasDialog()) throw new Error('Absent teacher reopened a dialog');
    });
    const first = await page.evaluate(() => {
      for (let i = 0; i < 40 && battle.active; i++) {
        updateBattle(0.3);
        punchGuardsArc();
      }
      return {
        kills: battle.kills,
        spawned: battle.spawned,
        ready: battle.ready,
        total: state.guardKills,
        debris: debrisList.length,
        cap: effectiveDebrisCap(),
        army: state.achievements.has('army')
      };
    });
    assert.equal(first.kills, 200);
    assert.equal(first.spawned, 200);
    assert.equal(first.ready, true);
    assert.equal(first.army, true);
    assert.ok(first.debris <= first.cap);
    await page.evaluate(() => {
      state.pos.set(6.3, 1.65, 0);
      updateInteract();
    });
    await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => hasDialog()), true);
    await page.keyboard.press('1');
    assert.equal(await page.evaluate(() => battle.stage), 'campus-0');
    assert.equal(await page.evaluate(() => state.weapon), 'chair');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '.work/corridor.png' });
    for (const stage of ['campus-0', 'campus-1', 'campus-2']) {
      assert.equal(await page.evaluate(() => battle.stage), stage);
      const result = await page.evaluate(() => {
        for (let i = 0; i < 20 && battle.active; i++) {
          updateBattle(0.3);
          punchGuardsArc();
        }
        state.pos.set(campusExit.x, 1.65, campusExit.z + 1);
        updateInteract();
        return {
          kills: battle.kills,
          target: battle.target,
          ready: battle.ready
        };
      });
      assert.equal(result.kills, result.target);
      assert.equal(result.ready, true);
      if (stage === 'campus-2')
        await page.screenshot({ path: '.work/courtyard.png' });
      await page.keyboard.press('e');
    }
    assert.equal(await page.evaluate(() => state.ended), true);
    assert.equal(await page.locator('#endTitle').textContent(), '校 园 突 围');
    assert.equal(await page.evaluate(() => state.guardKills), 300);
    await page.screenshot({ path: '.work/ending.png' });
    // Reload a newly captured stage checkpoint with locked challenge settings.
    await page.reload();
    await page.waitForFunction(() => !!fistRig);
    await page.locator('#combatMode').selectOption('challenge');
    await page.locator('#guardTarget').fill('50');
    await page.locator('#guardTarget').dispatchEvent('change');
    await page.locator('#btnStart').click();
    await page.evaluate(() => {
      punchTeacher(); /* may be out of arc; move near teacher */
      if (teacher) {
        const p = teacher.group.position;
        resetPlayer(p.x, p.z + 1);
        punchTeacher();
      }
      battle.kills = battle.target;
      battle.ready = true;
      battle.active = false;
      enterCampus();
    });
    assert.equal(await page.evaluate(() => battle.stage), 'campus-0');
    const before = await page.evaluate(() => ({
      config: state.runConfig,
      checkpoint,
      keys: Object.keys(JSON.parse(localStorage.getItem(SAVE_KEY)))
    }));
    assert.equal(before.config.guardTarget, 50);
    await page.reload();
    await page.waitForFunction(() => !!fistRig);
    await page.locator('#btnStart').click();
    assert.equal(await page.evaluate(() => battle.stage), 'campus-0');
    assert.equal(
      await page.evaluate(() => currentRun().combatMode),
      'challenge'
    );
    assert.equal(await page.evaluate(() => battle.kills), 0);
    // Low graphics and no-fragments apply without changing quotas or attack rules.
    await page.evaluate(() => {
      gameOptions.quality = 'low';
      gameOptions.fragments = false;
      applyQuality();
      clearDebris();
    });
    assert.equal(await page.evaluate(() => debrisList.length), 0);
    const cp = await page.evaluate(() => localStorage.getItem(SAVE_KEY));
    await page.reload();
    await page.waitForFunction(() => !!fistRig);
    await page.locator('#runMode').selectOption('endless');
    await page.locator('#combatMode').selectOption('power');
    await page.locator('#btnStart').click();
    const endless = await page.evaluate(() => {
      for (let i = 0; i < 130; i++) {
        updateBattle(0.3);
        punchGuardsArc();
      }
      endEndless('测试结束');
      return {
        kills: state.guardKills,
        ready: battle.ready,
        ended: state.ended,
        best: JSON.parse(localStorage.getItem('oi_endless_power')),
        saved: localStorage.getItem(SAVE_KEY)
      };
    });
    assert.ok(endless.kills > 1000);
    assert.equal(endless.ready, false);
    assert.equal(endless.best.kills, endless.kills);
    assert.equal(endless.saved, cp);
    // Migrate an existing answer-only v8 save, then verify death + actual retry.
    await page.evaluate(() => {
      localStorage.removeItem(SAVE_KEY);
      const ids = state.problems.map((p) => p.id);
      localStorage.setItem(
        LEGACY_SAVE_KEY,
        JSON.stringify({
          problems: ids,
          curProb: ids[0],
          score: { [ids[0]]: 40 },
          code: { [ids[0]]: state.problems[0].starter },
          elapsed: 123,
          warnCount: 0,
          achievements: ['guard10']
        })
      );
    });
    await page.reload();
    await page.waitForFunction(() => !!fistRig);
    await page.locator('#runMode').selectOption('campaign');
    await page.locator('#btnStart').click();
    assert.equal(await page.evaluate(() => state.totalScore), 40);
    assert.equal(
      await page.evaluate(() => state.achievements.has('guard10')),
      true
    );
    await page.mouse.click(640, 400);
    assert.equal(await page.evaluate(() => state.teacherDown), true);
    await page.evaluate(() => openCode());
    await page.waitForFunction(() => !document.pointerLockElement);
    await page.locator('#btnSubmit').click();
    await page.evaluate(() => {
      closeCode();
      endByGuards();
    });
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('#endScore').textContent(), '40');
    assert.equal(await page.evaluate(() => state.totalScore), 40);
    assert.equal(
      await page.locator('#btnRestart').textContent(),
      '从检查点重试'
    );
    assert.equal(await page.locator('#btnSubmit').isEnabled(), true);
    await page.locator('#btnRestart').click();
    await page.waitForFunction(() => !!fistRig && !state.started);
    await page.locator('#btnStart').click();
    assert.equal(await page.evaluate(() => state.totalScore), 40);
    assert.equal(await page.evaluate(() => battle.stage), 'classroom');
    assert.equal(await page.evaluate(() => battle.kills), 0);
    await page.evaluate(() => {
      state.runConfig = Object.freeze({
        ...state.runConfig,
        runMode: 'campaign',
        guardTarget: 200
      });
    });
    // Actual resource cleanup across repeated scene transitions.
    const memories = await page.evaluate(() => {
      const samples = [];
      for (let i = 0; i < 9; i++) {
        enterCampusSection(i % 3);
        renderer.render(scene, camera);
        samples.push({ ...renderer.info.memory });
      }
      return samples;
    });
    assert.ok(
      Math.max(...memories.slice(3).map((m) => m.geometries)) -
        Math.min(...memories.slice(3).map((m) => m.geometries)) <=
        10
    );
    await page.reload();
    await page.waitForFunction(() => !!fistRig);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.work/mobile.png' });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= 390),
      true
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
    console.log(
      'Browser smoke passed: chair/input/IDE, 200+100 campaign, checkpoint, endless>1000, legacy saves, death retry, scene cleanup, mobile, local resources.'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
