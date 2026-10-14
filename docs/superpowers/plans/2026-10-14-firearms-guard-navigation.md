# 枪械与包围追击 Implementation Plan

**Goal:** 支持手枪、自动步枪，并让保安主动绕障碍包围玩家。

**Architecture:** 独立 `navigation.js` 管理共享栅格路线与分工；`firearms.js` 管理射击、弹匣、计时和特效。沿用 `combat.js` 击倒处理、`weapons.js` 模型和 `campaign.js` 检查点。

**Tech Stack:** 原生 JavaScript、Three.js 0.128.0、Node test、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-14-firearms-guard-navigation-design.md`

## Global Constraints

- 本地离线资源；不新增运行时依赖。
- 保留近战模式、E 交互、弹窗数字选项以及旧存档兼容。
- 枪械使用实际射线遮挡；保安移动和接触攻击不得穿越障碍。

## Review Focus

- 松开鼠标、暂停和失焦后不得继续连射。
- 玩家跳上障碍，保安不得穿入或隔桌扣血。
- 武器切换保留椅子，不产生重复物体。
- 开闸与切关不能沿用旧路线或旧弹道物体。
- 恢复旧检查点与枪械检查点均可正常开始。

### Task 1: 保安主动绕障碍包围

Files: `js/navigation.js`, `js/combat.js`, `js/world.js`, `js/campaign.js`, `index.html`, `tests/navigation.test.cjs`。

Interfaces: `createGuardNavigation(bounds, obstacles)` 生成导航，`navigationTarget(nav, from, target)` 给出安全下一路点；`moveGuard(g, index, dt)` 执行包围、分离及碰撞移动；`resetGuardNavigation()` 切关／开闸清缓存。

- [x] 写绕桌、拐角、追踪移动目标和障碍内目标测试，运行并确认失败。
- [x] 实现静态邻接栅格及缓存流场；接入保安移动、提高速度与无穿墙接触检查。
- [x] 增加保安基础移速设置（0.5～10，默认 1.5，步长 0.1），开始和暂停均可调、实时生效并持久化；测试数值归一化及运行中变化。
- [x] 运行 `node --test tests/navigation.test.cjs`，再运行 `npm test`。

### Task 2: 枪械与玩法整合

Files: `js/firearms.js`, `js/weapons.js`, `js/interact.js`, `js/main.js`, `js/core.js`, `js/campaign.js`, `js/upgrade-ui.js`, `index.html`, `README.md`, `tests/firearms.test.cjs`, `tests/firearms-browser.cjs`。

Interfaces: `isFirearm(weapon)`, `selectWeapon(weapon)`, `fireGun()`, `reloadGun()`, `updateFirearms(dt)`, `clearFirearmInput()`；枪械击倒使用现有 `killGuard`／老师击倒逻辑。

- [x] 写弹匣、冷却、换弹、连射中断、射击单目标及状态限制测试并确认失败。
- [x] 实现射线命中、模型、有限弹道特效、音效、输入和 HUD；检查点保存／恢复弹匣。
- [x] 运行 `npm test`、`npm run check`，执行浏览器实测与既有回归，核对资源清理。
- [x] 更新玩法文档、完成自查与独立审查，报告本地结果。

验证记录：`docs/verification/2026-10-14-firearms-navigation.md`。
