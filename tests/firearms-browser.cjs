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
    await page.waitForFunction(() => !!gunRigs.rifle);
    await page.locator('#combatMode').selectOption('challenge');
    await page.locator('#guardSpeedStart').fill('3.7');
    assert.equal(await page.locator('#guardSpeedValueStart').textContent(), '3.7 米/秒');
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => pointerLocked);
    await page.keyboard.press('r');
    assert.equal(await page.evaluate(() => state.weapon), 'chair');
    await page.keyboard.press('2');
    await page.waitForFunction(() => gunRigs.pistol.visible && !fistRig.visible && !heldChair.group.visible);
    await page.keyboard.press('1'); await page.keyboard.press('r');
    assert.equal(await page.evaluate(() => state.weapon), 'chair');
    await page.keyboard.press('2');
    // A real aimed click downs the actual teacher and captures a firearm checkpoint.
    await page.evaluate(() => {
      teacher.group.position.set(0, 0, 0); teacher.userData.mode = 'warn';
      resetPlayer(0, 1.8);
      camera.lookAt(0, 1.5, 0);
      state.pitch = pitchTarget = camera.rotation.x;
      state.yaw = yawTarget = camera.rotation.y;
    });
    await page.mouse.click(640, 400);
    assert.equal(await page.evaluate(() => state.teacherDown), true);
    assert.equal(await page.evaluate(() => gunMagazine('pistol')), 11);
    assert.equal(await page.evaluate(() => checkpoint.weapon), 'pistol');
    await page.keyboard.press('r');
    await page.waitForFunction(() => gunReload === 0 && gunMagazine('pistol') === 12);
    // Pause controls persist and apply to guards already in the scene.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => state.view === 'pause');
    await page.locator('#guardSpeedPause').fill('8');
    assert.equal(await page.evaluate(() => gameOptions.guardSpeed), 8);
    await page.locator('#btnResume').click();
    await page.waitForFunction(() => pointerLocked);
    // Isolate shooting from the spawning scheduler, keeping the actual models and raycast.
    await page.evaluate(() => {
      stopBattle();
      for (const g of securityGuards) { scene.remove(g.group); disposeOwnedMaterials(g.group); }
      securityGuards.length = 0;
      resetPlayer(-2.5, 0);
      const g = buildSecurityGuard(-2.5, -3);
      g.userData = { alive: true, navSlot: 0, speedFactor: 1 };
      initGuardHealth(g);
      securityGuards.push(g); battle.target = Infinity;
      gameOptions.guardSpeed = 0.5;
      camera.lookAt(-2.5, 1.58, -3); state.pitch = pitchTarget = camera.rotation.x;
      state.yaw = yawTarget = camera.rotation.y;
    });
    const before = await page.evaluate(() => state.guardKills);
    await page.mouse.click(640, 400);
    assert.equal(await page.evaluate(() => securityGuards[0].userData.hp), 40);
    assert.equal(await page.evaluate(() => state.guardKills), before);
    await page.waitForFunction(() => gunCooldown <= 0);
    await page.evaluate(() => {
      const p = securityGuards[0].group.position;
      camera.lookAt(p.x, p.y + 1.58, p.z);
      state.pitch = pitchTarget = camera.rotation.x; state.yaw = yawTarget = camera.rotation.y;
      recoilPitch = recoilYaw = 0;
    });
    await page.mouse.click(640, 400);
    assert.equal(await page.evaluate(() => state.guardKills), before + 1);
    assert.equal(await page.evaluate(() => state.gunKills), 1);
    await page.keyboard.press('3');
    await page.mouse.down();
    await page.waitForFunction(() => gunMagazine('rifle') <= 27);
    await page.mouse.up();
    const released = await page.evaluate(() => gunMagazine('rifle'));
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => gunMagazine('rifle')), released);
    await page.screenshot({ path: '.work/firearms-rifle.png' });
    // Holding the trigger into pause, then resuming, cannot resume automatic fire.
    await page.mouse.down();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => state.view === 'pause');
    const paused = await page.evaluate(() => gunMagazine('rifle'));
    await page.mouse.up(); await page.locator('#btnResume').click();
    await page.waitForFunction(() => pointerLocked);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => gunMagazine('rifle')), paused);
    // A dialog number key chooses the option, rather than changing weapons.
    await page.evaluate(() => openDialog({ title: '测试', text: '数字选项', options: [
      { label: '关闭', cb: dlg => closeDialog(dlg) }
    ] }));
    await page.keyboard.press('1');
    assert.equal(await page.evaluate(() => state.weapon), 'rifle');
    assert.equal(await page.evaluate(() => hasDialog()), false);
    // Stage transition retains ammo, removes shot effects and invalidates old paths.
    const ammo = await page.evaluate(() => {
      captureCheckpoint();
      const ammo = gunMagazine('rifle');
      enterCampusSection(0);
      if (shotTrails.length || gunTrigger) throw new Error('Shot state survived transition');
      if (guardNavigation) throw new Error('Old navigation survived transition');
      return ammo;
    });
    assert.equal(await page.evaluate(() => gunMagazine('rifle')), ammo);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => state.view === 'pause');
    await page.locator('#guardSpeedPause').fill('6.2');
    await page.reload(); await page.waitForFunction(() => !!gunRigs.rifle);
    assert.equal(await page.locator('#guardSpeedStart').inputValue(), '6.2');
    await page.locator('#btnStart').click();
    assert.equal(await page.evaluate(() => state.weapon), 'rifle');
    assert.equal(await page.evaluate(() => gunMagazine('rifle')), ammo);
    assert.equal(await page.evaluate(() => state.gunKills), 1);
    assert.equal(await page.evaluate(() => battle.stage), 'campus-0');
    assert.equal(await page.evaluate(() => !!heldChair), true, 'stored chair should survive checkpoint reload');
    // Real collision data: one guard must get around the classroom's center desk.
    const routing = await page.evaluate(() => {
      clearLevel(); Object.assign(worldBounds, { w: 16, d: 14 });
      delete worldBounds.minZ; delete worldBounds.maxZ;
      buildWorld();
      if (teacher) { scene.remove(teacher.group); teacher = null; }
      resetPlayer(0, -4.5); state.lastDamageAt = 1e9;
      const g = buildSecurityGuard(0, -1.5);
      g.userData = { alive: true, navSlot: 0, speedFactor: 1, closingIn: true };
      securityGuards.push(g); gameOptions.guardSpeed = 2;
      for (let i = 0; i < 600; i++) {
        updateGuards(1 / 60, i / 60);
        if (collides(g.group.position.x, g.group.position.z, 0.3)) throw new Error('Guard crossed a desk');
      }
      return Math.hypot(g.group.position.x - state.pos.x, g.group.position.z - state.pos.z);
    });
    assert.ok(routing < 0.5, `Guard remained ${routing}m away`);
    assert.deepEqual(errors, []);
    console.log('Firearms/navigation browser passed: actual aimed teacher/guard shots, R reload, rifle hold/release/pause, chair storage, dialog keys, checkpoint ammo, live persisted speed, real desk routing.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
