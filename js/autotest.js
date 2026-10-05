// Automated smoke test + screenshot setups. Only loaded with ?autotest or ?shot=<name>.
//   ?autotest      → simulates whole stages with a bot and prints a JSON report into the page
//   ?shot=battle   → freezes a scene for a screenshot (title, town, stages, smithy, skills, guide, battle, intro, result)

import { defaultSave, writeSlot, deleteSlot, listSlots, loadSlot, migrateLegacySave } from './save.js';
import { GEM_STATS, makeGem, rollGem, gemMods } from './gems.js';
import { skillParams, weaponUpCost, WEAPON_ORDER } from './data.js';
import { makeWeapon, weaponLevelMul } from './weapons.js';

const GEAR_COST_30 = weaponUpCost(30);

// Gives a save one gem of every grade and fills a few sockets.
function withGems(save) {
  for (let g = 0; g < 5; g++) save.gems.push(makeGem(save.nextGemId++, g));
  save.gems.push(makeGem(save.nextGemId++, 4), makeGem(save.nextGemId++, 3));
  save.weapons[0].sockets = [1, 0, 0];
  save.sockets.q = [5, 2, 0];
  save.sockets.e = [6, 0, 0];
  save.sockets.r = [7, 3, 0];
  return save;
}

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

function strongSave(level, gearLv, cat = 'sword') {
  const s = defaultSave();
  s.level = level;
  s.gold = 5000;
  s.sp = 3;
  s.cleared = 12;
  s.tutorialDone = true;
  s.skills = { atk: 3, q: 3, w: 2, e: 3, r: 2, hp: 2, str: 2 };
  s.gear = { armor: gearLv, boots: Math.min(10, gearLv), ring: Math.min(15, gearLv) };
  Object.assign(s.weapons[0], { cat, up: gearLv });
  s.potions = { hp: 3, atk: 2 };
  return s;
}

// Simple bot: walk toward the nearest monster, hold Space, sometimes use skills.
function drive(input, b) {
  const p = b.player;
  let best = null, bd = Infinity;
  for (const e of b.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd) { bd = d; best = e; }
  }
  for (const k of ARROWS) input.simulateUp(k);
  if (best) {
    const dx = best.x - p.x, dy = best.y - p.y;
    if (dx < -8) input.simulateDown('ArrowLeft');
    if (dx > 8) input.simulateDown('ArrowRight');
    if (dy < -8) input.simulateDown('ArrowUp');
    if (dy > 8) input.simulateDown('ArrowDown');
  }
  input.simulateDown('Space');
  for (const k of ['KeyQ', 'KeyW', 'KeyE', 'KeyR']) {
    input.simulateUp(k);
    if (Math.random() < 0.03) input.simulateDown(k);
  }
}

function simulate(env, stageIndex, save, maxSeconds, { renderEvery = 20 } = {}) {
  const { game, input, view, ctx, hud } = env;
  game.save = save;
  game.testGod = true;
  game.startStage(stageIndex);
  const b = game.battle;
  const dt = 1 / 60;
  let t = 0, frame = 0, popups = 0, maxEnemies = 0;
  const startLevel = save.level;
  while (game.battle === b && t < maxSeconds) {
    if (game.popup) {
      popups++;
      game.popup.onKey(game.popup.code, false);
    }
    drive(input, b);
    b.update(dt);
    maxEnemies = Math.max(maxEnemies, b.enemies.length);
    if (game.battle === b && frame % renderEvery === 0) {
      b.render(ctx, view);
      hud.update(b);
    }
    input.endFrame();
    t += dt;
    frame++;
  }
  for (const k of [...ARROWS, 'Space']) input.simulateUp(k);
  return {
    stage: b.stage.label,
    simSeconds: Math.round(t),
    finished: game.battle !== b,
    state: b.state,
    kills: `${b.kills}/${b.stage.killGoal}`,
    bossSpawned: b.bossSpawned,
    level: `${startLevel}->${save.level}`,
    gold: save.gold,
    popups,
    maxEnemies,
    screenAfter: game.screenName,
  };
}

function touchPointer(el, type, x, y, id) {
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

// Drives the joystick and the on-screen buttons with synthetic touch events.
function touchTest(env) {
  const { game, input } = env;
  const step = (b, n) => {
    for (let i = 0; i < n; i++) { b.update(1 / 60); input.endFrame(); }
  };
  game.save = strongSave(12, 3);
  game.startStage(1);
  const b = game.battle;
  const zone = document.querySelector('.joy-zone');
  touchPointer(zone, 'pointerdown', 200, 500, 7); // also switches the game to touch mode
  const mode = game.inputMode;
  const x0 = b.player.x, y0 = b.player.y;
  touchPointer(zone, 'pointermove', 260, 470, 7);
  step(b, 60);
  const moved = { dx: Math.round(b.player.x - x0), dy: Math.round(b.player.y - y0) };
  touchPointer(zone, 'pointerup', 260, 470, 7);
  const axisAfter = { ...input.axis() };

  const q = document.querySelector('.skill[data-id="q"]');
  touchPointer(q, 'pointerdown', 0, 0, 8);
  step(b, 1);
  touchPointer(q, 'pointerup', 0, 0, 8);
  const qFired = b.player.cds.q > 0;

  const atk = document.querySelector('.skill[data-id="atk"]');
  touchPointer(atk, 'pointerdown', 0, 0, 9);
  step(b, 1);
  const atkCd1 = b.player.cds.atk;
  step(b, 30); // held for half a second → should have attacked again
  const swings = b.player.cds.atk > 0 && atkCd1 > 0;
  touchPointer(atk, 'pointerup', 0, 0, 9);
  const spaceReleased = !input.isDown('Space');

  // skill-unlock popup: tapping the key in the picture closes it and fires the skill
  game.save.skills.w = 0;
  game.save.level = 3;
  game.save.xp = 0;
  b.gainXp(1000);
  const popupOpen = !!game.popup && game.popup.code === 'KeyW';
  const kbW = [...document.querySelectorAll('#overlay .kb-key')].find(k => k.textContent === 'W');
  touchPointer(kbW, 'pointerdown', 0, 0, 10);
  step(b, 1);
  const popupClosedAndFired = !game.popup && b.player.cds.w > 0;

  game.quitToTown();
  game.setInputMode('keyboard');
  return { touchMode: mode, moved, axisAfter, qFired, swings, spaceReleased, popupOpen, popupClosedAndFired };
}

// Grade rules: 신화 = 신화 + 영웅-range effect, 전설 = 전설 + 희귀-range effect, others one effect.
function gemRuleTest() {
  const inRange = (f, g) => f.v >= GEM_STATS[f.s].ranges[g][0] && f.v <= GEM_STATS[f.s].ranges[g][1];
  const bad = [];
  const counts = { elite: [0, 0, 0, 0, 0], boss: [0, 0, 0, 0, 0] };
  const fake = { nextGemId: 1 };
  for (let i = 0; i < 4000; i++) {
    const boss = i % 2 === 1;
    const gem = rollGem(fake, boss ? 4 : 0, boss);
    counts[boss ? 'boss' : 'elite'][gem.g]++;
    const want = gem.g >= 3 ? 2 : 1;
    if (gem.fx.length !== want) bad.push(`count g${gem.g}`);
    if (!inRange(gem.fx[0], gem.g)) bad.push(`main range g${gem.g}`);
    if (want === 2) {
      if (gem.fx[0].s === gem.fx[1].s) bad.push('same stat twice');
      if (!inRange(gem.fx[1], gem.g === 4 ? 2 : 1)) bad.push(`second range g${gem.g}`);
    }
  }
  // socketed gems must change the skill numbers
  const s = withGems(strongSave(10, 5));
  s.gems[0].fx = [{ s: 'area', v: 20 }]; // id 1, in atk socket 0
  const base = skillParams('atk', s.skills.atk);
  const modded = skillParams('atk', s.skills.atk, gemMods(s).atk);
  const areaApplied = Math.abs(modded.range - base.range * 1.2) < 1e-6;
  return { gemRules: bad.length === 0 ? 'ok' : [...new Set(bad)], elite1: counts.elite, boss5: counts.boss, areaApplied };
}

// Gem menu: put a gem in a socket, then sell another one from the picker.
function gemScreenTest(env) {
  const { game } = env;
  const key = code => game.screen.onKey(code, false);
  game.save = withGems(strongSave(12, 3));
  game.save.sockets = { q: [0, 0, 0], w: [0, 0, 0], e: [0, 0, 0], r: [0, 0, 0] };
  game.save.weapons[0].sockets = [0, 0, 0];
  const s = game.save;
  game.show('gems');
  key('Enter'); // open picker for Space slot 1
  const picking = !!document.querySelector('.pick-list');
  key('Enter'); // best gem goes in
  const socketed = s.weapons[0].sockets[0] !== 0;
  key('ArrowRight');
  key('Enter');
  const gemsBefore = s.gems.length, goldBefore = s.gold;
  key('KeyX'); // sell the selected free gem...
  key('ArrowDown');
  key('Enter'); // ...after confirming
  const sold = s.gems.length === gemsBefore - 1 && s.gold > goldBefore;
  key('Escape');
  key('Escape');
  return { picking, socketed, sold, backInTown: game.screenName === 'town' };
}

// Gold sinks: gem fusion (from the gem menu), weapon past 30, potion shop and drinking potions.
function economyTest(env) {
  const { game, input } = env;
  const key = code => game.screen.onKey(code, false);
  const r = {};

  // fusion: 4 free 일반 + 1 socketed 일반 → uses the 3 weakest free ones
  const s = strongSave(12, 3);
  s.gold = 1000;
  for (let i = 0; i < 5; i++) s.gems.push(makeGem(s.nextGemId++, 0));
  s.weapons[0].sockets[0] = 5;
  game.save = s;
  game.show('gems');
  key('KeyF');
  key('Enter');
  const asked = !!document.querySelector('.confirm');
  key('ArrowDown');
  key('Enter');
  r.fused = asked && s.gems.length === 3 && s.gems.some(g => g.g === 1) && s.gold === 900 && s.gems.some(g => g.id === 5);
  key('Escape');
  key('Escape');

  // weapon past the old cap of 30
  s.weapons[0].up = 30;
  s.gold = 100000;
  game.show('smithy');
  key('Enter');
  r.transcend = s.weapons[0].up === 31 && s.gold === 100000 - GEAR_COST_30;

  // potion shop: one of each
  s.gold = 5000;
  s.potions = { hp: 0, atk: 0 };
  game.show('potions');
  key('Enter');
  key('ArrowDown');
  key('Enter');
  r.bought = s.potions.hp === 1 && s.potions.atk === 1 && s.gold < 5000;

  // drink them in battle with the number keys
  game.startStage(2);
  const b = game.battle;
  b.update(1 / 60);
  b.player.hp = 10;
  input.simulateDown('Digit1');
  b.update(1 / 60);
  input.endFrame();
  input.simulateUp('Digit1');
  input.simulateDown('Digit2');
  b.update(1 / 60);
  input.endFrame();
  input.simulateUp('Digit2');
  r.drank = b.player.hp > 10 && b.powerT > 0 && s.potions.hp === 0 && s.potions.atk === 0;
  game.quitToTown();
  return r;
}

// Weapons: roll rules, every weapon type clearing a stage, the weapon menu, drops, old-save upgrade.
function weaponTest(env) {
  const { game } = env;
  const key = code => game.screen.onKey(code, false);
  const r = {};

  const ranges = [[4, 7], [7, 11], [11, 16], [16, 22], [22, 30]];
  const bad = [];
  for (let i = 0; i < 3000; i++) {
    const g = i % 5, lv = 1 + (i % 25);
    const w = makeWeapon(i, WEAPON_ORDER[i % 6], g, lv);
    const k = weaponLevelMul(lv);
    if (w.atk < Math.round(ranges[g][0] * k) || w.atk > Math.round(ranges[g][1] * k)) bad.push('atk range');
    if (w.fx.length !== (g === 0 ? 0 : g >= 3 ? 2 : 1)) bad.push(`fx count g${g}`);
  }
  r.rollRules = bad.length ? [...new Set(bad)] : 'ok';

  // each weapon type must be able to clear a stage on its own attack style
  r.byType = {};
  for (const cat of WEAPON_ORDER) {
    const res = simulate(env, 7, strongSave(11, 11, cat), 240);
    r.byType[cat] = `${res.state} ${res.simSeconds}s`;
  }

  // world boss always drops a weapon
  const s = strongSave(16, 12);
  const before = s.weapons.length;
  simulate(env, 9, s, 300);
  r.bossDropsWeapon = s.weapons.length === before + 1;

  // weapon menu: equip the other weapon, then sell the old one (its gem goes back to the bag)
  const t = strongSave(12, 5);
  t.gems.push(makeGem(t.nextGemId++, 2));
  t.weapons[0].sockets = [1, 0, 0];
  t.weapons.push(makeWeapon(t.nextWeaponId++, 'bow', 3, 10));
  game.save = t;
  game.show('weapons');
  key('ArrowDown');
  key('Enter');
  r.equipped = t.weaponId === 2;
  const gold = t.gold;
  key('ArrowDown'); // back to the sword (list: equipped bow first, then sword)
  key('KeyX');
  key('ArrowDown');
  key('Enter');
  r.sold = t.weapons.length === 1 && t.gold > gold && gemMods(t).atk !== undefined && t.gems.length === 1;
  key('Escape');

  // saves from before weapon items: Space sockets and weapon level move onto the starter sword
  const old = defaultSave();
  delete old.weapons;
  old.gear = { weapon: 12, armor: 3, boots: 0, ring: 0 };
  old.gems = [makeGem(1, 1)];
  old.sockets = { atk: [1, 0, 0], q: [0, 0, 0], w: [0, 0, 0], e: [0, 0, 0], r: [0, 0, 0] };
  localStorage.setItem('dungeonHero.test.slot.3', JSON.stringify(old));
  const up = loadSlot(3);
  r.oldSaveUpgraded = up.weapons.length === 1 && up.weapons[0].up === 12 && up.weapons[0].sockets[0] === 1;
  deleteSlot(3);
  return r;
}

// Save slots: continue, new game, delete (with confirmation), and v1.0.0 save migration.
function slotTest(env) {
  const { game } = env;
  const key = code => game.screen.onKey(code, false);
  const r = {};
  for (const n of [1, 2, 3]) deleteSlot(n);
  game.prefs.lastSlot = 1;

  localStorage.setItem('dungeonHero.save.v1', JSON.stringify({ level: 7, gold: 99, tutorialDone: true, sound: false }));
  migrateLegacySave();
  const migrated = listSlots()[0];
  r.migrated = !!migrated && migrated.level === 7 && migrated.gold === 99 && localStorage.getItem('dungeonHero.save.v1') === null;

  writeSlot(2, strongSave(12, 5));
  game.show('slots');
  key('ArrowRight');
  key('Enter');
  r.continued = game.slot === 2 && game.save.level === 12 && game.screenName === 'town';

  game.exitToTitle();
  r.exited = game.screenName === 'title' && game.slot === null;

  game.show('slots');
  key('ArrowRight');
  key('ArrowRight');
  key('Enter');
  r.newGame = game.slot === 3 && game.save.level === 1 && game.screenName === 'guide';

  game.prefs.lastSlot = 2; // the slots screen opens on the last used slot
  game.show('slots');
  key('KeyX');
  const dialog = !!document.querySelector('.confirm');
  key('Escape'); // cancel keeps the slot
  const kept = !!listSlots()[1];
  key('KeyX');
  key('ArrowDown');
  key('Enter');
  r.deleteNeedsConfirm = dialog && kept;
  r.deleted = listSlots()[1] === null && game.screenName === 'slots';

  for (const n of [1, 2, 3]) deleteSlot(n);
  game.slot = null;
  return r;
}

function report(data) {
  const out = document.createElement('pre');
  out.id = 'test-out';
  out.textContent = JSON.stringify(data, null, 1);
  document.body.appendChild(out);
  document.title = data.ok ? 'TEST OK' : 'TEST FAIL';
}

export function run(env) {
  const { game, params } = env;
  const errors = [];
  window.addEventListener('error', e => errors.push(String(e.message)));
  const shot = params.get('shot');
  if (shot) return setupShot(env, shot);

  const log = [];
  try {
    for (const n of [1, 2, 3]) deleteSlot(n);
    for (const name of ['title', 'slots', 'town', 'stages', 'smithy', 'skills', 'guide', 'pause']) {
      game.show(name);
      game.screen.onKey('ArrowDown', false);
      game.screen.onKey('ArrowRight', false);
    }
    game.show('result', { stageIndex: 3, cleared: true, kills: 17, gold: 120, xp: 80, levels: 2, unlocked: ['q'], clearBonus: 60, firstClear: true });
    game.screen.onKey('ArrowDown', false);
    log.push('screens ok');

    // fresh player, first stage (tutorial, skill-unlock popup at Lv 2)
    log.push(simulate(env, 0, defaultSave(), 300));
    // world boss with a mid-level hero
    log.push(simulate(env, 4, strongSave(12, 8), 300));
    // last world boss with a strong hero
    log.push(simulate(env, 24, strongSave(40, 28), 400));

    // menus that change the save
    game.save = strongSave(12, 3);
    game.show('smithy');
    game.screen.onKey('Enter', false);
    game.show('skills');
    game.screen.onKey('Enter', false);
    game.show('town');
    log.push(`after upgrades: weapon=+${game.save.weapons[0].up} atkSkill=${game.save.skills.atk} sp=${game.save.sp}`);
    log.push(touchTest(env));
    log.push(slotTest(env));
    log.push(gemRuleTest());
    const before = 7;
    const gemFight = simulate(env, 9, withGems(strongSave(16, 12)), 300);
    gemFight.gemDropped = game.save.gems.length === before + 1;
    log.push(gemFight);
    log.push(gemScreenTest(env));
    log.push(economyTest(env));
    log.push(weaponTest(env));
  } catch (e) {
    errors.push(e.stack || String(e));
  }
  report({ ok: errors.length === 0, log, errors });
}

function setupShot(env, shot) {
  const { game, input, view, ctx, hud } = env;
  // Headless screenshots can land mid-animation; show every element in its final state.
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
  document.head.appendChild(style);
  const freeze = () => {
    game.paused = true; // stops updates without showing the pause menu
    if (game.battle) {
      game.battle.render(ctx, view);
      hud.update(game.battle);
    }
  };
  const fight = (stage, save, seconds, until = () => false) => {
    game.save = save;
    game.testGod = true;
    game.startStage(stage);
    const b = game.battle;
    for (let t = 0; t < seconds && game.battle === b && !until(b); t += 1 / 60) {
      if (game.popup) game.popup.onKey(game.popup.code, false);
      drive(input, b);
      b.update(1 / 60);
      input.endFrame();
    }
    for (const k of [...ARROWS, 'Space']) input.simulateUp(k);
  };

  switch (shot) {
    case 'battle':
      fight(7, strongSave(11, 11, env.params.get('cat') || 'sword'), 7);
      game.battle.player.cds.q = 2.2;
      game.battle.player.cds.r = 12;
      freeze();
      break;
    case 'boss':
      fight(4, strongSave(9, 6), 200, b => b.boss && b.time - (b.bossT ??= b.time) > 4.5);
      freeze();
      break;
    case 'tutorial':
      game.startStage(0);
      game.battle.update(1 / 60);
      freeze();
      break;
    case 'intro':
      game.startStage(0);
      game.battle.update(1 / 60);
      game.showSkillIntro('q');
      freeze();
      break;
    case 'result':
      game.show('result', { stageIndex: 3, cleared: true, kills: 17, gold: 120, xp: 80, levels: 2, unlocked: ['q'], clearBonus: 60, firstClear: true });
      break;
    case 'gems':
    case 'gems-pick':
      game.save = withGems(strongSave(12, 7));
      game.slot = 1;
      game.show('gems');
      game.screen.onKey('ArrowDown', false);
      if (shot === 'gems-pick') game.screen.onKey('ArrowRight', false), game.screen.onKey('Enter', false);
      break;
    case 'gems-fuse': {
      const s = withGems(strongSave(12, 7));
      for (let i = 0; i < 4; i++) s.gems.push(makeGem(s.nextGemId++, 0));
      for (let i = 0; i < 2; i++) s.gems.push(makeGem(s.nextGemId++, 1));
      game.save = s;
      game.slot = 1;
      game.show('gems');
      game.screen.onKey('KeyF', false);
      break;
    }
    case 'weapons': {
      const s = withGems(strongSave(12, 7));
      s.weapons[0].up = 7;
      s.weapons.push(makeWeapon(s.nextWeaponId++, 'hammer', 4, 12), makeWeapon(s.nextWeaponId++, 'bow', 2, 8),
        makeWeapon(s.nextWeaponId++, 'staff', 3, 11), makeWeapon(s.nextWeaponId++, 'dagger', 1, 5), makeWeapon(s.nextWeaponId++, 'spear', 0, 9));
      s.weaponSeenId = 3;
      game.save = s;
      game.slot = 1;
      game.show('weapons');
      game.screen.onKey('ArrowDown', false);
      break;
    }
    case 'potions': {
      const s = strongSave(12, 7);
      s.potions = { hp: 4, atk: 10 };
      game.save = s;
      game.slot = 1;
      game.show('potions');
      break;
    }
    case 'gem-result': {
      const s = withGems(strongSave(12, 7));
      game.save = s;
      game.show('result', { stageIndex: 4, cleared: true, kills: 18, gold: 503, xp: 278, levels: 1, unlocked: [], clearBonus: 102, firstClear: true, gems: [s.gems[4]] });
      break;
    }
    case 'skills-fx':
      fight(9, withGems(strongSave(14, 10)), 4);
      Object.assign(game.battle.player.cds, { q: 0, e: 0, r: 0 });
      game.battle.player.dash = null;
      game.battle.trySkill('r');
      game.battle.trySkill('e');
      for (let i = 0; i < 20; i++) game.battle.update(1 / 60);
      game.battle.trySkill('q');
      for (let i = 0; i < 8; i++) game.battle.update(1 / 60);
      freeze();
      break;
    case 'slots': {
      const a = strongSave(12, 7);
      a.cleared = 13;
      writeSlot(1, a);
      writeSlot(2, strongSave(3, 0));
      deleteSlot(3);
      game.show('slots');
      break;
    }
    default:
      if (shot !== 'title') {
        game.save = strongSave(12, 7);
        game.slot = 1;
      }
      game.show(shot);
  }
}
