// Automated smoke test + screenshot setups. Only loaded with ?autotest or ?shot=<name>.
//   ?autotest      → simulates whole stages with a bot and prints a JSON report into the page
//   ?shot=battle   → freezes a scene for a screenshot (title, town, stages, smithy, skills, guide, battle, intro, result)

import { defaultSave, writeSlot, deleteSlot, listSlots, migrateLegacySave } from './save.js';

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

function strongSave(level, gearLv) {
  const s = defaultSave();
  s.level = level;
  s.gold = 5000;
  s.sp = 3;
  s.cleared = 12;
  s.tutorialDone = true;
  s.skills = { atk: 3, q: 3, w: 2, e: 3, r: 2, hp: 2, str: 2 };
  s.gear = { weapon: gearLv, armor: gearLv, boots: Math.min(10, gearLv), ring: Math.min(15, gearLv) };
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
    log.push(`after upgrades: weapon=${game.save.gear.weapon} atkSkill=${game.save.skills.atk} sp=${game.save.sp}`);
    log.push(touchTest(env));
    log.push(slotTest(env));
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
      fight(7, strongSave(11, 11), 7);
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
