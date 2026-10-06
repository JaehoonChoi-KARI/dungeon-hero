// One stage of gameplay: the hero, monsters, skills, drops and rendering.

import { input } from './input.js';
import { sfx } from './audio.js';
import {
  MONSTERS, WORLDS, SKILLS, WEAPON_CATS, POTIONS, equippedWeapon, equippedArmor,
  DROP_GOLD, DROP_HEART, GOLD_DROP_BONUS, HEART_HEAL, BUFFS, BUFF_ORDER, BUFF_TIME, BUFF_ZONE_TIME, BUFF_RADIUS,
  BUFF_ATK, BUFF_DEF, BUFF_SPD, POTION_ORDER, POTION_HEAL, POWER_TIME, POWER_MULT,
  TIERS, SCALE, stageInfo, computeStats, skillParams, xpNeed, MAX_LEVEL,
  resourceMax, resourceOf, RES_REFILL, RES_DELAY, AIM_NEAR,
} from './data.js';
import { emojiSprite, drawSprite } from './sprites.js';
import { drawHero, SWING_TIME } from './hero.js';
import { GEM_GRADES, gemMods, rollGem } from './gems.js';
import { rollEquipment, isWeapon, itemIcon, itemName } from './items.js';

export const MAP_W = 2400;
export const MAP_H = 1600;
const TAU = Math.PI * 2;
const TILE = 120;
const DASH_TIME = 0.18;
const SPIN_TICK = 0.25; // Q hits this often while spinning
const BURN_TICK = 0.3; // E fire on the ground
const STORM_TICK = 0.4; // R extra lightning

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

// A faceted gem in its grade color, with a soft glow.
export function drawGem(ctx, x, y, size, color, time = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 14 + Math.sin(time * 6) * 5;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(20,20,40,.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.8, -size * 0.25);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.8, -size * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.35, -size * 0.25);
  ctx.lineTo(0, size * 0.2);
  ctx.lineTo(-size * 0.35, -size * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function makeDeco(world) {
  const list = [];
  for (let i = 0; i < 70; i++) {
    list.push({ x: rand(40, MAP_W - 40), y: rand(40, MAP_H - 40), spr: emojiSprite(pick(world.deco), rand(22, 34) | 0) });
  }
  return list;
}

export class Battle {
  constructor(game, stageIndex, tier = 0) {
    this.game = game;
    this.save = game.save;
    this.stage = stageInfo(stageIndex, tier);
    this.world = WORLDS[this.stage.world];
    this.stats = computeStats(this.save);
    this.mods = gemMods(this.save);
    this.weapon = equippedWeapon(this.save);
    const resMax = resourceMax(this.weapon.cat);
    // Space resource (stamina / arrows / mana): see RESOURCES in data.js
    this.res = { def: resourceOf(this.weapon.cat), max: resMax, cur: resMax, empty: false, idle: 0, heldEmpty: 0 };
    this.armor = equippedArmor(this.save);

    this.player = {
      x: MAP_W / 2, y: MAP_H / 2, r: 18, hp: this.stats.maxHp,
      face: { x: 0, y: 1 }, faceAngle: Math.PI / 2, moving: false, walkT: 0,
      inv: 0, swing: 0, swingAngle: 0, dash: null, trail: [],
      spin: 0, spinT: 0, spinTick: 0, spinPrm: null, // Q whirlwind: time left, time spun, next hit
      hasteT: 0, // W: speed boost after the dash
      cds: { atk: 0, q: 0, w: 0, e: 0, r: 0 },
    };
    this.enemies = [];
    this.shots = [];
    this.fireballs = [];
    this.missiles = []; // bow arrows and staff orbs
    this.pickups = [];
    this.effects = [];
    this.texts = [];
    this.particles = [];
    this.timers = [];
    this.zones = []; // E: burning ground
    this.storms = []; // R: lightning that keeps striking
    this.banners = [];
    this.toast = null;

    this.spawned = 0;
    this.kills = 0;
    this.spawnT = 0.6;
    this.bossDelay = -1;
    this.bossSpawned = false;
    this.boss = null;

    this.state = 'play'; // play | clear | dead
    this.stateT = 0;
    this.ended = false;
    this.time = 0;
    this.saveT = 0;
    this.shake = 0;
    this.flashScreen = 0;
    this.powerT = 0; // 힘의 물약: extra damage while > 0
    this.buffs = { atk: 0, def: 0, spd: 0 }; // seconds left from buff circles
    this.buffZones = [];
    this.earned = { gold: 0, xp: 0, levels: 0, unlocked: [], clearBonus: 0, firstClear: false, gems: [], items: [] };
    this.cam = { x: this.player.x, y: this.player.y };
    this.deco = makeDeco(this.world);
    this.tutorial = !this.save.tutorialDone && stageIndex === 0 ? { step: 0, moved: 0, attacks: 0 } : null;

    this.banner(`${this.stage.fullLabel}  ${this.world.name}`, tier > 0 ? TIERS[tier].color : '#ffffff', 2);
  }

  // ---- helpers ------------------------------------------------------------

  banner(text, color = '#fff', dur = 1.8, size = 54) {
    this.banners.push({ text, color, t: 0, dur, size });
  }

  showToast(text, dur = 1.6) {
    this.toast = { text, t: dur };
  }

  addText(x, y, text, color, size = 22) {
    this.texts.push({ x, y, text, color, size, t: 0, dur: 0.8, vy: -60 });
  }

  burst(x, y, color, n = 10, speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.3, speed);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, dur: rand(0.3, 0.6), size: rand(3, 6), color });
    }
  }

  later(t, fn) { this.timers.push({ t, fn }); }

  aliveMobs() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && e.kind === 'mob') n++;
    return n;
  }

  // ---- main update ----------------------------------------------------------

  update(dt) {
    this.time += dt;
    if (this.state === 'play') this.updatePlayer(dt);
    else this.player.moving = false;
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateFireballs(dt);
    this.updateMissiles(dt);
    this.updateBuffs(dt);
    this.updateZones(dt);
    this.updateStorms(dt);
    this.updatePickups(dt);
    if (this.state === 'play') this.updateSpawning(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);

    if (this.state !== 'play') {
      this.stateT += dt;
      if (this.stateT > 2.6 && !this.ended) {
        this.ended = true;
        this.game.onBattleEnd(this.result());
      }
    }
    this.saveT += dt;
    if (this.saveT > 8) {
      this.saveT = 0;
      this.game.persist();
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    for (const k in p.cds) if (p.cds[k] > 0) p.cds[k] -= dt;
    if (p.inv > 0) p.inv -= dt;
    if (p.swing > 0) p.swing -= dt;
    if (p.hasteT > 0) p.hasteT -= dt;
    if (this.powerT > 0) this.powerT -= dt;
    if (p.spin > 0) {
      p.spin -= dt;
      p.spinT += dt;
      p.spinTick -= dt;
      if (p.spinTick <= 0 && p.spin > 0) {
        p.spinTick += SPIN_TICK;
        this.spinHit(p.spinPrm);
      }
    }

    let mx = 0, my = 0;
    if (input.isDown('ArrowLeft')) mx -= 1;
    if (input.isDown('ArrowRight')) mx += 1;
    if (input.isDown('ArrowUp')) my -= 1;
    if (input.isDown('ArrowDown')) my += 1;
    if (!mx && !my) {
      const a = input.axis();
      if (Math.hypot(a.x, a.y) > 0.2) { mx = a.x; my = a.y; }
    }
    if (mx || my) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      p.face.x = mx; p.face.y = my;
      p.faceAngle = Math.atan2(my, mx);
    }
    p.moving = !!(mx || my) && !p.dash;

    if (p.dash) {
      const d = p.dash;
      const step = Math.min(dt, d.t);
      p.x += d.vx * step;
      p.y += d.vy * step;
      d.t -= dt;
      p.trail.push({ x: p.x, y: p.y, t: 0 });
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0 || d.hit.has(e)) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (e.r + p.r + 16) ** 2) {
          d.hit.add(e);
          const len = Math.hypot(d.vx, d.vy) || 1;
          this.hitEnemy(e, d.mult, { kb: 420, kx: d.vx / len, ky: d.vy / len, crit: d.crit });
        }
      }
      if (d.t <= 0) p.dash = null;
    } else if (p.moving) {
      const speed = this.stats.speed * (p.hasteT > 0 ? 1.4 : 1) * (this.buffs.spd > 0 ? BUFF_SPD : 1);
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      if (p.hasteT > 0 && Math.random() < 0.5) p.trail.push({ x: p.x, y: p.y, t: 0.1 });
      p.walkT += dt;
      if (this.tutorial) this.tutorial.moved += dt;
    }
    p.x = clamp(p.x, 30, MAP_W - 30);
    p.y = clamp(p.y, 40, MAP_H - 30);

    this.updateResource(dt);
    for (const id of ['q', 'w', 'e', 'r']) {
      if (input.wasPressed(SKILLS[id].code)) this.trySkill(id);
    }
    for (const id of POTION_ORDER) {
      if (input.wasPressed(POTIONS[id].code) || input.wasPressed('Numpad' + POTIONS[id].label)) this.usePotion(id);
    }
    this.updateTutorial();
  }

  updateTutorial() {
    const tu = this.tutorial;
    if (!tu) return;
    if (tu.step === 0 && tu.moved > 1.2) tu.step = 1;
    if (tu.step === 1 && tu.attacks >= 4) {
      tu.step = 2;
      this.save.tutorialDone = true;
      this.showToast('잘했어요! 몬스터를 모두 물리치면 대장 몬스터가 나와요!', 3);
      this.tutorial = null;
    }
  }

  tutorialHint() {
    const tu = this.tutorial;
    if (!tu) return null;
    if (this.game.inputMode === 'touch') {
      return tu.step === 0
        ? { keys: [], text: '🕹️ 왼쪽 화면을 누른 채로 끌어서 움직여 보세요' }
        : { keys: [], text: '오른쪽 아래 ⚔️ 버튼을 눌러 공격! (꾹 누르고 있어도 돼요)' };
    }
    return tu.step === 0
      ? { keys: ['←', '↑', '↓', '→'], text: '방향키로 움직여 보세요' }
      : { keys: ['Space'], text: '스페이스바를 눌러 공격! (꾹 누르고 있어도 돼요)' };
  }

  // ---- player skills --------------------------------------------------------

  targets() {
    return this.enemies.filter(e => !e.dead && e.spawnT <= 0);
  }

  // Space spends one unit per attack. Letting go refills it (after a short pause);
  // running dry locks Space until it's full again, like reloading.
  updateResource(dt) {
    const p = this.player, r = this.res;
    const holding = input.isDown('Space');
    r.idle = holding ? 0 : r.idle + dt;
    if (!holding && r.idle >= RES_DELAY && r.cur < r.max) {
      r.cur = Math.min(r.max, r.cur + ((r.max * this.stats.regen) / RES_REFILL) * dt); // armor 자원 회복 speeds it up
      if (r.cur >= r.max && r.empty) {
        r.empty = false;
        this.addText(p.x, p.y - 46, `${r.def.icon} 다 찼어요!`, r.def.color, 18);
      }
    }
    if (!holding) { r.heldEmpty = 0; return; }
    if (r.empty || r.cur < 1) {
      // still pressing with nothing left: remind them that letting go is what refills it
      r.heldEmpty += dt;
      if (r.heldEmpty > 0.8) {
        r.heldEmpty = -2;
        this.showToast(`스페이스에서 손을 떼야 ${r.def.name}${r.def.subj} 채워져요!`, 2);
      }
      return;
    }
    if (p.cds.atk > 0 || p.dash) return;
    this.basicAttack();
    r.cur -= 1;
    if (r.cur < 1) {
      r.cur = 0;
      r.empty = true;
      this.addText(p.x, p.y - 46, r.def.empty, r.def.color, 20);
      sfx.tired();
      if (!this.save.seenTired) {
        this.save.seenTired = true;
        this.showToast(`${r.def.icon} ${r.def.name}${r.def.obj} 다 썼어요! 스페이스에서 손을 떼면 다시 채워져요`, 3.5);
      }
    }
  }

  // Space: how it attacks depends on the equipped weapon type (WEAPON_CATS in data.js).
  basicAttack() {
    const p = this.player;
    const prm = this.skill('atk');
    p.cds.atk = prm.cd;
    p.swing = SWING_TIME;
    p.swingAngle = p.faceAngle;
    const fx = Math.cos(p.faceAngle), fy = Math.sin(p.faceAngle);
    const opts = (kx, ky) => ({ kb: prm.kb, kx, ky, crit: prm.crit, slow: prm.dur });
    switch (prm.kind) {
      case 'melee': // dagger, sword: an arc in front
        sfx.swing();
        this.effects.push({ type: 'slash', x: p.x, y: p.y, angle: p.faceAngle, r: prm.range, t: 0, dur: 0.18 });
        for (const e of this.targets()) {
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d > prm.range + e.r) continue;
          if (d > e.r + p.r && Math.abs(angleDiff(Math.atan2(dy, dx), p.faceAngle)) > prm.arc) continue;
          this.hitEnemy(e, prm.mult, opts(dx / d, dy / d));
        }
        break;
      case 'smash': { // hammer: everything around the spot in front
        const cx = p.x + fx * prm.reach, cy = p.y + fy * prm.reach;
        sfx.smash();
        this.shake = Math.max(this.shake, 0.08);
        this.effects.push({ type: 'smash', x: cx, y: cy, r: prm.radius, t: 0, dur: 0.3 });
        this.burst(cx, cy, '#d9c7a3', 10, 200);
        for (const e of this.targets()) {
          if (dist2(cx, cy, e.x, e.y) > (prm.radius + e.r) ** 2) continue;
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
          this.hitEnemy(e, prm.mult, opts(dx / d, dy / d));
        }
        break;
      }
      case 'thrust': // spear: a straight line, hits every enemy on it
        sfx.swing();
        this.effects.push({ type: 'thrust', x: p.x, y: p.y, angle: p.faceAngle, r: prm.range, w: prm.width, t: 0, dur: 0.16 });
        for (const e of this.targets()) {
          const dx = e.x - p.x, dy = e.y - p.y;
          const along = dx * fx + dy * fy, side = Math.abs(dy * fx - dx * fy);
          if (along < -e.r || along > prm.range + e.r || side > prm.width + e.r) continue;
          this.hitEnemy(e, prm.mult, opts(fx, fy));
        }
        break;
      default: { // bow arrows and staff orbs fly; see updateMissiles
        if (prm.kind === 'arrow') sfx.bow();
        else sfx.magic();
        const target = this.autoAim(prm.range, prm.aim);
        const a = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.faceAngle;
        p.swingAngle = a;
        this.lookAt(a);
        const ax = Math.cos(a), ay = Math.sin(a);
        this.missiles.push({
          kind: prm.kind, x: p.x + ax * 20, y: p.y + ay * 20, vx: ax * prm.speed, vy: ay * prm.speed, speed: prm.speed,
          life: prm.range / prm.speed, mult: prm.mult, crit: prm.crit, slow: prm.dur, kb: prm.kb, radius: prm.radius || 0,
          target, turn: prm.turn || 0, pierce: prm.pierce || 0, hit: new Set(),
        });
      }
    }
    if (this.tutorial) this.tutorial.attacks++;
  }

  // Ranged aim assist: the enemy closest to where the hero is facing (within `cone` radians either
  // side and `range`), or failing that the nearest one within AIM_NEAR in any direction.
  autoAim(range, cone = 0) {
    if (!cone) return null;
    const p = this.player;
    let best = null, bestScore = Infinity, near = null, nearD = AIM_NEAR;
    for (const e of this.targets()) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > range) continue;
      if (d < nearD) { nearD = d; near = e; }
      const off = Math.abs(angleDiff(Math.atan2(dy, dx), p.faceAngle));
      if (off > cone) continue;
      const score = off / cone + d / range; // prefer straight ahead, then closer
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best || near;
  }

  // Turn the hero toward an angle (for aimed shots) without changing how it walks.
  lookAt(a) {
    const p = this.player;
    p.faceAngle = a;
    p.face.x = Math.cos(a);
    p.face.y = Math.sin(a);
  }

  updateMissiles(dt) {
    for (const m of this.missiles) {
      if (m.turn && m.target && !m.target.dead) { // home in a little
        const want = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        const cur = Math.atan2(m.vy, m.vx);
        const d = angleDiff(want, cur);
        const a = cur + Math.max(-m.turn * dt, Math.min(m.turn * dt, d));
        m.vx = Math.cos(a) * m.speed;
        m.vy = Math.sin(a) * m.speed;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      const hit = this.enemies.find(e => !e.dead && e.spawnT <= 0 && !m.hit.has(e) && dist2(m.x, m.y, e.x, e.y) < (e.r + 14) ** 2);
      if (m.kind === 'arrow') {
        if (hit) {
          const d = Math.hypot(m.vx, m.vy) || 1;
          this.hitEnemy(hit, m.mult, { kb: m.kb, kx: m.vx / d, ky: m.vy / d, crit: m.crit, slow: m.slow });
          m.hit.add(hit);
          if (m.pierce > 0) { // carry on to the next enemy
            m.pierce--;
            m.target = null;
          } else {
            m.life = 0;
          }
        }
      } else if (hit || m.life <= 0) { // orb: bursts where it hits (or where it runs out)
        m.life = 0;
        this.effects.push({ type: 'magic', x: m.x, y: m.y, r: m.radius, t: 0, dur: 0.3 });
        this.burst(m.x, m.y, '#d6b8ff', 10, 200);
        for (const e of this.targets()) {
          const dx = e.x - m.x, dy = e.y - m.y, d = Math.hypot(dx, dy) || 1;
          if (d < m.radius + e.r) this.hitEnemy(e, m.mult, { kb: m.kb, kx: dx / d, ky: dy / d, crit: m.crit, slow: m.slow });
        }
      }
      if (m.x < 0 || m.x > MAP_W || m.y < 0 || m.y > MAP_H) m.life = 0;
    }
    this.missiles = this.missiles.filter(m => m.life > 0);
  }

  trySkill(id) {
    const p = this.player;
    const lv = this.save.skills[id];
    const def = SKILLS[id];
    if (lv <= 0) {
      this.showToast(`${def.label} 스킬은 Lv ${def.unlock}이 되면 배워요!`);
      sfx.denied();
      return;
    }
    if (p.cds[id] > 0 || p.dash) {
      sfx.denied();
      return;
    }
    const prm = this.skill(id);
    p.cds[id] = prm.cd;
    if (id === 'q') this.castSpin(prm);
    else if (id === 'w') this.castDash(prm);
    else if (id === 'e') this.castFireball(prm);
    else if (id === 'r') this.castThunder(prm);
  }

  // Number keys 1 and 2 (or the touch buttons): potions bought in town.
  usePotion(id) {
    const p = this.player, s = this.save, def = POTIONS[id];
    if (s.potions[id] <= 0) {
      this.showToast(`${def.name}이 없어요 · 마을의 물약 상점에서 살 수 있어요`, 2.2);
      sfx.denied();
      return;
    }
    if (id === 'hp') {
      if (p.hp >= this.stats.maxHp) { this.showToast('체력이 이미 가득해요'); sfx.denied(); return; }
      const heal = Math.round(this.stats.maxHp * POTION_HEAL * this.stats.potion);
      p.hp = Math.min(this.stats.maxHp, p.hp + heal);
      this.addText(p.x, p.y - 44, `+${heal}`, '#7dffa0', 26);
      this.burst(p.x, p.y, '#7dffa0', 14, 200);
      sfx.heal();
    } else {
      if (this.powerT > 3) { this.showToast('아직 힘의 물약 효과가 남아 있어요'); sfx.denied(); return; }
      this.powerT = POWER_TIME * this.stats.potion;
      this.banner('💪 힘이 솟아요!', '#ffb36b', 1.2, 40);
      this.burst(p.x, p.y, '#ff9f43', 16, 240);
      sfx.upgrade();
    }
    s.potions[id]--;
  }

  // Current numbers for a skill: its level plus the gems socketed into it.
  skill(id) {
    return skillParams(id, this.save.skills[id], this.mods[id], id === 'atk' ? this.weapon.cat : undefined);
  }

  // Q: a whirlwind that follows the hero and hits every SPIN_TICK while it lasts.
  castSpin(prm) {
    const p = this.player;
    p.spin = prm.dur;
    p.spinT = 0;
    p.spinTick = SPIN_TICK;
    p.spinPrm = prm;
    this.effects.push({ type: 'spin', follow: true, r: prm.radius, t: 0, dur: prm.dur });
    this.spinHit(prm);
  }

  spinHit(prm) {
    const p = this.player;
    sfx.spin();
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < prm.radius + e.r) this.hitEnemy(e, prm.mult * 0.55, { kb: 300, kx: dx / d, ky: dy / d, crit: prm.crit });
    }
  }

  // W: dash through enemies (invulnerable), then run faster for prm.dur seconds.
  castDash(prm) {
    const p = this.player;
    p.dash = { t: DASH_TIME, vx: (p.face.x * prm.dist) / DASH_TIME, vy: (p.face.y * prm.dist) / DASH_TIME, hit: new Set(), mult: prm.mult, crit: prm.crit };
    p.inv = Math.max(p.inv, DASH_TIME + 0.2);
    p.hasteT = DASH_TIME + prm.dur;
    p.trail = [];
    sfx.dash();
  }

  // E: fireballs; each explosion leaves fire on the ground for prm.dur seconds.
  castFireball(prm) {
    const p = this.player;
    const n = prm.count;
    const target = this.autoAim(620 * 0.85, 1.05); // same aim assist as ranged weapons
    if (target) this.lookAt(Math.atan2(target.y - p.y, target.x - p.x));
    for (let i = 0; i < n; i++) {
      const a = p.faceAngle + (i - (n - 1) / 2) * 0.22;
      this.fireballs.push({
        x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
        life: 0.85, r: 14, mult: prm.mult, radius: prm.radius, dur: prm.dur, crit: prm.crit,
      });
    }
    sfx.fireball();
  }

  castThunder(prm) {
    const p = this.player;
    this.flashScreen = 0.35;
    this.shake = 0.45;
    sfx.thunder();
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (dist2(p.x, p.y, e.x, e.y) > prm.range ** 2) continue;
      hits++;
      this.effects.push({ type: 'bolt', x: e.x, y: e.y, t: 0, dur: 0.35, seed: Math.random() * 1000 });
      this.hitEnemy(e, prm.mult, { crit: prm.crit });
    }
    for (let i = hits; i < 4; i++) {
      this.effects.push({ type: 'bolt', x: p.x + rand(-300, 300), y: p.y + rand(-220, 220), t: 0, dur: 0.35, seed: Math.random() * 1000 });
    }
    this.storms.push({ t: prm.dur, tick: STORM_TICK, mult: prm.mult * 0.3, range: prm.range, crit: prm.crit });
  }

  // E's burning ground: hurts whatever stands in it every BURN_TICK.
  updateZones(dt) {
    for (const z of this.zones) {
      z.t -= dt;
      z.tick -= dt;
      if (Math.random() < 0.5) {
        const a = rand(0, TAU), d = rand(0, z.r);
        this.particles.push({ x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, vx: 0, vy: rand(-90, -40), t: 0, dur: 0.45, size: rand(4, 8), color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f' });
      }
      if (z.tick > 0) continue;
      z.tick += BURN_TICK;
      for (const e of this.enemies) {
        if (!e.dead && e.spawnT <= 0 && dist2(z.x, z.y, e.x, e.y) < (z.r + e.r * 0.5) ** 2) this.hitEnemy(e, z.mult, { crit: z.crit });
      }
    }
    this.zones = this.zones.filter(z => z.t > 0);
  }

  // R's lingering storm: one more bolt on a random nearby enemy every STORM_TICK.
  updateStorms(dt) {
    const p = this.player;
    for (const s of this.storms) {
      s.t -= dt;
      s.tick -= dt;
      if (s.tick > 0) continue;
      s.tick += STORM_TICK;
      const near = this.enemies.filter(e => !e.dead && e.spawnT <= 0 && dist2(p.x, p.y, e.x, e.y) < s.range ** 2);
      sfx.zap();
      if (!near.length) {
        this.effects.push({ type: 'bolt', x: p.x + rand(-300, 300), y: p.y + rand(-220, 220), t: 0, dur: 0.3, seed: Math.random() * 1000 });
        continue;
      }
      const e = pick(near);
      this.effects.push({ type: 'bolt', x: e.x, y: e.y, t: 0, dur: 0.3, seed: Math.random() * 1000 });
      this.hitEnemy(e, s.mult, { crit: s.crit });
    }
    this.storms = this.storms.filter(s => s.t > 0);
  }

  // ---- combat ---------------------------------------------------------------

  // crit: extra crit chance from gems; slow: seconds the enemy moves slower (basic attack)
  hitEnemy(e, mult, { kb = 0, kx = 0, ky = 0, crit: critBonus = 0, slow = 0 } = {}) {
    if (e.dead) return;
    const st = this.stats;
    const crit = Math.random() < st.crit + critBonus;
    if (slow) e.slowT = Math.max(e.slowT || 0, slow);
    const power = (this.powerT > 0 ? POWER_MULT : 1) * (this.buffs.atk > 0 ? BUFF_ATK : 1);
    const dmg = Math.max(1, Math.round(st.atk * mult * power * rand(0.9, 1.1) * (crit ? 2 : 1)));
    e.hp -= dmg;
    e.flash = 1;
    if (kb) {
      const k = e.kind === 'mob' || e.kind === 'minion' ? kb : kb * 0.15;
      e.kvx += kx * k;
      e.kvy += ky * k;
    }
    this.addText(e.x + rand(-10, 10), e.y - e.r - 8, crit ? `${dmg}!` : String(dmg), crit ? '#ffd54f' : '#ffffff', crit ? 30 : 22);
    if (crit) sfx.crit(); else sfx.hit();
    this.burst(e.x, e.y, crit ? '#ffd54f' : '#ffffff', 4, 160);
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.burst(e.x, e.y, '#ffffff', 12, 260);
    this.effects.push({ type: 'poof', x: e.x, y: e.y, r: e.r * 1.6, t: 0, dur: 0.35 });
    this.gainXp(Math.max(1, Math.round(e.xp)));
    const gold = e.gold * this.stats.goldBonus;
    if (e.kind === 'mob' || e.kind === 'minion') this.dropLoot(e, gold);
    else this.dropGold(e.x, e.y, Math.max(1, Math.round(gold)));
    if (e.kind === 'mob') {
      this.kills++;
      this.save.kills++;
    }
    if (e.isStageBoss) {
      this.onBossDefeated(e);
      this.dropGem(e);
      this.dropEquipment(e);
    }
  }

  // Regular monsters drop exactly one thing: gold (80%, paid 1.25x), a heart (8%) or a buff circle (12%).
  dropLoot(e, gold) {
    const r = Math.random();
    if (r < DROP_GOLD) {
      this.dropGold(e.x, e.y, Math.max(1, Math.round(gold * GOLD_DROP_BONUS)));
    } else if (r < DROP_GOLD + DROP_HEART) {
      this.pickups.push({ type: 'heart', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, value: 0 });
    } else {
      const kind = pick(BUFF_ORDER);
      this.buffZones.push({ kind, x: e.x, y: e.y, t: BUFF_ZONE_TIME });
      if (!this.save.seenBuff) {
        this.save.seenBuff = true;
        this.showToast('✨ 바닥의 빛나는 원에 들어가면 7초 동안 강해져요!', 3.5);
      }
    }
  }

  // Buff circles wait on the ground; walking into one starts (or refreshes) that buff.
  updateBuffs(dt) {
    for (const k of BUFF_ORDER) if (this.buffs[k] > 0) this.buffs[k] -= dt;
    const p = this.player;
    for (const z of this.buffZones) {
      z.t -= dt;
      if (this.state !== 'play' || dist2(p.x, p.y, z.x, z.y) > BUFF_RADIUS ** 2) continue;
      z.t = 0;
      this.buffs[z.kind] = BUFF_TIME;
      const b = BUFFS[z.kind];
      this.addText(p.x, p.y - 46, `${b.icon} ${b.text}`, b.color, 22);
      this.burst(z.x, z.y, b.color, 16, 240);
      sfx.upgrade();
    }
    this.buffZones = this.buffZones.filter(z => z.t > 0);
  }

  // World bosses always drop a weapon, 대장 monsters sometimes; it goes straight into the bag.
  dropEquipment(e) {
    rollEquipment(this.save, this.stage, e.kind === 'boss').forEach((it, i) => {
      (isWeapon(it) ? this.save.weapons : this.save.armors).push(it);
      this.earned.items.push(it);
      this.pickups.push({ type: 'item', item: it, x: e.x + 30 + i * 40, y: e.y, vx: 70 - i * 140, vy: -140, t: 0, value: 0 });
      this.banner(`${itemIcon(it)} ${itemName(it)} Lv ${it.lv} 획득!`, GEM_GRADES[it.g].color, 3, 42);
    });
    this.game.persist();
  }

  // Every stage-end boss (대장 or world boss) drops one gem; it goes straight into the bag.
  dropGem(e) {
    const gem = rollGem(this.save, this.stage.lootWorld, e.kind === 'boss');
    this.save.gems.push(gem);
    this.earned.gems.push(gem);
    this.pickups.push({ type: 'gem', gem, x: e.x, y: e.y, vx: 0, vy: -140, t: 0, value: 0 });
    const grade = GEM_GRADES[gem.g];
    this.banner(`💎 ${grade.name} 보석 획득!`, grade.color, 3, 46);
    this.game.persist();
  }

  dropGold(x, y, total) {
    const n = Math.min(6, Math.max(1, Math.ceil(total / 4)));
    let left = total;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.floor(total / n);
      left -= v;
      const a = rand(0, TAU), s = rand(80, 220);
      this.pickups.push({ type: 'gold', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, value: v });
    }
  }

  gainXp(n) {
    const s = this.save;
    this.earned.xp += n;
    if (s.level >= MAX_LEVEL) return;
    s.xp += n;
    while (s.level < MAX_LEVEL && s.xp >= xpNeed(s.level)) {
      s.xp -= xpNeed(s.level);
      s.level++;
      s.sp++;
      this.earned.levels++;
      this.onLevelUp();
    }
    if (s.level >= MAX_LEVEL) s.xp = 0;
  }

  onLevelUp() {
    const s = this.save, p = this.player;
    const unlocked = [];
    for (const id of ['q', 'w', 'e', 'r']) {
      if (SKILLS[id].unlock <= s.level && s.skills[id] === 0) {
        s.skills[id] = 1;
        unlocked.push(id);
      }
    }
    this.stats = computeStats(s);
    p.hp = this.stats.maxHp;
    this.banner(`LEVEL UP!  Lv ${s.level}`, '#ffd54f', 1.8);
    this.effects.push({ type: 'levelup', x: p.x, y: p.y, t: 0, dur: 0.9 });
    sfx.levelUp();
    if (!unlocked.length) this.showToast('스킬 포인트 +1 · 마을의 [스킬] 메뉴에서 쓸 수 있어요', 2.5);
    for (const id of unlocked) {
      this.earned.unlocked.push(id);
      this.game.showSkillIntro(id);
    }
  }

  damagePlayer(raw, fromX, fromY) {
    const p = this.player;
    if (this.state !== 'play' || p.inv > 0 || p.dash) return;
    const guard = this.buffs.def > 0 ? BUFF_DEF : 1;
    const dmg = Math.max(1, Math.round(((raw * 100) / (100 + this.stats.def)) * guard * this.stats.damageTaken));
    p.hp -= dmg;
    p.inv = 0.8;
    this.shake = Math.max(this.shake, 0.18);
    this.addText(p.x, p.y - 40, `-${dmg}`, '#ff5c6c', 24);
    sfx.hurt();
    const dx = p.x - fromX, dy = p.y - fromY, d = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / d) * 18, 30, MAP_W - 30);
    p.y = clamp(p.y + (dy / d) * 18, 40, MAP_H - 30);
    if (this.game.testGod) p.hp = Math.max(p.hp, 1);
    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'dead';
      this.stateT = 0;
      this.banner('쓰러졌어요...', '#ff7b88', 3);
      sfx.death();
      this.game.persist();
    }
  }

  onBossDefeated(boss) {
    this.state = 'clear';
    this.stateT = 0;
    this.banner('스테이지 클리어!', '#7dffa0', 3, 64);
    sfx.clear();
    this.shake = 0.3;
    for (const e of this.enemies) {
      if (e.dead || e === boss) continue;
      e.dead = true;
      this.effects.push({ type: 'poof', x: e.x, y: e.y, r: e.r * 1.6, t: 0, dur: 0.35 });
    }
    this.shots = [];
    const tier = this.stage.tier;
    const first = this.stage.index > this.save.cleared[tier];
    const bonus = Math.round(40 * this.stage.rewardMul * (first ? 2 : 1));
    this.save.gold += bonus;
    this.earned.gold += bonus;
    this.earned.clearBonus = bonus;
    this.earned.firstClear = first;
    if (first) this.save.cleared[tier] = this.stage.index;
    this.game.persist();
  }

  result() {
    return {
      stageIndex: this.stage.index,
      tier: this.stage.tier,
      cleared: this.state === 'clear',
      kills: this.kills,
      ...this.earned,
    };
  }

  // ---- enemies --------------------------------------------------------------

  makeEnemy(id, x, y, kind = 'mob') {
    const d = MONSTERS[id], st = this.stage;
    let hp = d.hp * st.hpMul, dmg = d.dmg * st.dmgMul, size = d.size;
    let xp = d.xp * st.rewardMul, gold = d.gold * st.rewardMul, speed = d.speed;
    let ai = d.ai, name = d.name;
    if (kind === 'elite') {
      hp *= 10; dmg *= 1.5; size *= 2; xp *= 10; gold *= 12; speed *= 0.85;
      ai = 'elite';
      name = `대장 ${d.name}`;
    } else if (kind === 'minion') {
      hp *= 0.7; xp *= 0.5; gold *= 0.5;
    }
    if (kind === 'elite' || kind === 'boss') hp *= SCALE.bossHp;
    const e = {
      id, def: d, kind, name, ai, x, y, size, r: size * 0.42,
      hp, maxHp: hp, dmg, speed, xp, gold,
      kvx: 0, kvy: 0, flash: 0, face: -1, dead: false, spawnT: 0.45,
      t: rand(0, 10), fireT: rand(0.8, d.fireCd || 2), wander: 0, wanderA: 0,
      pattern: 0, patT: 2.2, charge: null, isStageBoss: false,
      sprite: emojiSprite(d.emoji, size),
    };
    this.enemies.push(e);
    return e;
  }

  spawnPos(minD = 480, maxD = 720) {
    const p = this.player;
    for (let i = 0; i < 24; i++) {
      const a = rand(0, TAU), d = rand(minD, maxD);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (x > 60 && x < MAP_W - 60 && y > 60 && y < MAP_H - 60) return { x, y };
    }
    return { x: rand(60, MAP_W - 60), y: rand(60, MAP_H - 60) };
  }

  updateSpawning(dt) {
    const st = this.stage;
    if (this.spawned < st.killGoal) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.aliveMobs() < st.maxAlive) {
        this.spawnT = rand(0.5, 1.1);
        const pos = this.spawnPos();
        this.makeEnemy(pick(this.world.mobs), pos.x, pos.y);
        this.spawned++;
      }
    } else if (!this.bossSpawned && this.kills >= st.killGoal) {
      if (this.bossDelay < 0) {
        this.bossDelay = 1.6;
        this.banner(st.isBossStage ? `⚠️ 보스 등장! ${MONSTERS[this.world.boss].name}` : '⚠️ 대장 몬스터 등장!', '#ffb36b', 2.2);
        sfx.boss();
      }
      this.bossDelay -= dt;
      if (this.bossDelay <= 0) {
        this.bossSpawned = true;
        const pos = this.spawnPos(300, 380);
        const e = st.isBossStage
          ? this.makeEnemy(this.world.boss, pos.x, pos.y, 'boss')
          : this.makeEnemy(pick(this.world.mobs), pos.x, pos.y, 'elite');
        e.isStageBoss = true;
        e.spawnT = 0.8;
        this.boss = e;
      }
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 6);
      if (e.slowT > 0) e.slowT -= dt;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      e.x += e.kvx * dt;
      e.y += e.kvy * dt;
      const fr = Math.pow(0.002, dt);
      e.kvx *= fr;
      e.kvy *= fr;
      if (this.state === 'play') {
        const speed = e.speed;
        if (e.slowT > 0) e.speed *= e.kind === 'mob' || e.kind === 'minion' ? 0.5 : 0.75; // basic-attack slow
        this.think(e, dt);
        e.speed = speed;
      }
      e.x = clamp(e.x, e.r, MAP_W - e.r);
      e.y = clamp(e.y, e.r, MAP_H - e.r);
      if (this.state === 'play' && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r * 0.8) ** 2) this.damagePlayer(e.dmg, e.x, e.y);
    }

    const list = this.enemies.filter(e => !e.dead);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = (a.r + b.r) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 0.01) continue;
        const d = Math.sqrt(d2), push = (min - d) / 2, ux = dx / d, uy = dy / d;
        const wa = a.kind === 'mob' || a.kind === 'minion' ? 1 : 0.1;
        const wb = b.kind === 'mob' || b.kind === 'minion' ? 1 : 0.1;
        a.x -= ux * push * wa; a.y -= uy * push * wa;
        b.x += ux * push * wb; b.y += uy * push * wb;
      }
    }
    this.enemies = list;
  }

  think(e, dt) {
    const p = this.player;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    let vx = 0, vy = 0;
    switch (e.ai) {
      case 'chase':
        vx = ux * e.speed; vy = uy * e.speed;
        break;
      case 'zigzag': {
        const s = Math.sin(e.t * 5) * 0.9;
        vx = (ux - uy * s) * e.speed * 0.8;
        vy = (uy + ux * s) * e.speed * 0.8;
        break;
      }
      case 'erratic':
        e.wander -= dt;
        if (e.wander <= 0) {
          e.wander = rand(0.4, 0.9);
          e.wanderA = Math.atan2(dy, dx) + rand(-1.3, 1.3);
        }
        vx = Math.cos(e.wanderA) * e.speed;
        vy = Math.sin(e.wanderA) * e.speed;
        break;
      case 'shoot': {
        const R = e.def.range;
        if (d > R * 0.85) { vx = ux * e.speed; vy = uy * e.speed; }
        else if (d < R * 0.5) { vx = -ux * e.speed; vy = -uy * e.speed; }
        else {
          const side = Math.sin(e.t * 0.7) > 0 ? 0.5 : -0.5;
          vx = -uy * e.speed * side; vy = ux * e.speed * side;
        }
        e.fireT -= dt;
        if (e.fireT <= 0 && d < R + 60) {
          e.fireT = e.def.fireCd * rand(0.85, 1.2);
          this.enemyShot(e, Math.atan2(dy, dx), e.def.shotSpeed, e.dmg * 0.8);
        }
        break;
      }
      case 'elite':
        this.thinkElite(e, ux, uy, dt);
        return;
      case 'boss':
        this.thinkBoss(e, ux, uy, dt);
        return;
    }
    e.x += vx * dt;
    e.y += vy * dt;
    if (Math.abs(vx) > 1) e.face = vx > 0 ? 1 : -1;
  }

  thinkElite(e, ux, uy, dt) {
    e.x += ux * e.speed * dt;
    e.y += uy * e.speed * dt;
    e.face = ux > 0 ? 1 : -1;
    e.patT -= dt;
    if (e.patT <= 0) {
      e.patT = 3.2;
      if (e.def.ai === 'shoot') {
        const a = Math.atan2(uy, ux);
        for (let k = -2; k <= 2; k++) this.enemyShot(e, a + k * 0.2, 230, e.dmg * 0.6);
      } else {
        this.ringShot(e, 10, 170, e.dmg * 0.6, rand(0, TAU));
      }
    }
  }

  thinkBoss(e, ux, uy, dt) {
    if (e.charge) {
      const c = e.charge;
      c.t -= dt;
      if (c.phase === 'aim') {
        if (c.t <= 0) { c.phase = 'go'; c.t = 0.65; sfx.dash(); }
      } else {
        e.x += c.vx * dt;
        e.y += c.vy * dt;
        if (c.t <= 0 || e.x <= e.r || e.x >= MAP_W - e.r || e.y <= e.r || e.y >= MAP_H - e.r) {
          e.charge = null;
          this.shake = Math.max(this.shake, 0.15);
        }
      }
      return;
    }
    e.x += ux * e.speed * dt;
    e.y += uy * e.speed * dt;
    e.face = ux > 0 ? 1 : -1;
    e.patT -= dt;
    if (e.patT > 0) return;
    e.patT = 2.6;
    const pattern = ['ring', 'charge', 'spread', 'summon'][e.pattern++ % 4];
    const a = Math.atan2(uy, ux);
    if (pattern === 'ring') {
      const off = rand(0, TAU);
      this.ringShot(e, 16, 180, e.dmg * 0.55, off);
      this.later(0.45, () => { if (!e.dead) this.ringShot(e, 16, 180, e.dmg * 0.55, off + Math.PI / 16); });
    } else if (pattern === 'charge') {
      e.charge = { phase: 'aim', t: 0.8, a, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560 };
    } else if (pattern === 'spread') {
      for (let k = -3; k <= 3; k++) this.enemyShot(e, a + k * 0.16, 240, e.dmg * 0.6);
    } else {
      let minions = 0;
      for (const m of this.enemies) if (!m.dead && m.kind === 'minion') minions++;
      for (let k = 0; k < Math.min(3, 6 - minions); k++) {
        const ma = rand(0, TAU);
        this.makeEnemy(pick(this.world.mobs), e.x + Math.cos(ma) * 120, e.y + Math.sin(ma) * 120, 'minion');
      }
    }
  }

  enemyShot(e, angle, speed, dmg) {
    this.shots.push({ x: e.x, y: e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 8, dmg, life: 4 });
    sfx.shoot();
  }

  ringShot(e, n, speed, dmg, offset = 0) {
    for (let i = 0; i < n; i++) this.enemyShot(e, offset + (i * TAU) / n, speed, dmg);
  }

  // ---- projectiles & pickups -----------------------------------------------

  updateShots(dt) {
    const p = this.player;
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (this.state === 'play' && dist2(s.x, s.y, p.x, p.y) < (s.r + p.r * 0.7) ** 2) {
        if (p.inv <= 0 && !p.dash) {
          this.damagePlayer(s.dmg, s.x - s.vx, s.y - s.vy);
          s.life = 0;
        }
      }
    }
    this.shots = this.shots.filter(s => s.life > 0 && s.x > -50 && s.x < MAP_W + 50 && s.y > -50 && s.y < MAP_H + 50);
  }

  updateFireballs(dt) {
    for (const f of this.fireballs) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
      if (Math.random() < 0.6) {
        this.particles.push({ x: f.x, y: f.y, vx: rand(-40, 40), vy: rand(-40, 40), t: 0, dur: 0.3, size: rand(4, 7), color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f' });
      }
      let boom = f.life <= 0 || f.x < 0 || f.x > MAP_W || f.y < 0 || f.y > MAP_H;
      if (!boom) {
        for (const e of this.enemies) {
          if (!e.dead && e.spawnT <= 0 && dist2(f.x, f.y, e.x, e.y) < (f.r + e.r) ** 2) { boom = true; break; }
        }
      }
      if (boom) {
        f.life = 0;
        sfx.explode();
        this.effects.push({ type: 'explosion', x: f.x, y: f.y, r: f.radius, t: 0, dur: 0.35 });
        this.burst(f.x, f.y, '#ff9f43', 14, 260);
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0) continue;
          const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy) || 1;
          if (d < f.radius + e.r) this.hitEnemy(e, f.mult, { kb: 260, kx: dx / d, ky: dy / d, crit: f.crit });
        }
        this.zones.push({ x: f.x, y: f.y, r: f.radius * 0.85, t: f.dur, dur: f.dur, tick: BURN_TICK, mult: f.mult * 0.15, crit: f.crit });
      }
    }
    this.fireballs = this.fireballs.filter(f => f.life > 0);
  }

  updatePickups(dt) {
    const p = this.player;
    const allIn = this.state === 'clear';
    for (const k of this.pickups) {
      k.t += dt;
      const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
      // nearby coins fly to the hero; leftovers come by themselves after a while
      const loot = k.type === 'gem' || k.type === 'item';
      const settle = loot ? 0.9 : 0.2; // let dropped loot float a moment so it's seen
      if ((k.t > 0.35 && d < 140 && !loot) || k.t > 6 || (allIn && k.t > settle)) {
        const sp = 300 + 900 / Math.max(0.3, d / 100);
        k.vx = (dx / d) * Math.min(sp, 900);
        k.vy = (dy / d) * Math.min(sp, 900);
      } else {
        const fr = Math.pow(0.03, dt);
        k.vx *= fr;
        k.vy *= fr;
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (d < p.r + 12 && k.t > (loot ? 0.9 : allIn ? 0 : 0.25)) {
        k.taken = true;
        if (k.type === 'gold') {
          this.save.gold += k.value;
          this.earned.gold += k.value;
          sfx.coin();
        } else if (loot) {
          sfx.upgrade(); // already in the bag (see dropGem); this is just the pickup flourish
        } else if (this.state === 'play') {
          const heal = Math.round(this.stats.maxHp * HEART_HEAL);
          p.hp = Math.min(this.stats.maxHp, p.hp + heal);
          this.addText(p.x, p.y - 40, `+${heal}`, '#7dffa0', 24);
          sfx.heal();
        }
      }
    }
    this.pickups = this.pickups.filter(k => !k.taken);
  }

  updateEffects(dt) {
    for (const t of this.timers) {
      t.t -= dt;
      if (t.t <= 0) t.fn();
    }
    this.timers = this.timers.filter(t => t.t > 0);
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter(e => e.t < e.dur);
    for (const t of this.texts) {
      t.t += dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.1, dt);
    }
    this.texts = this.texts.filter(t => t.t < t.dur);
    for (const q of this.particles) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const fr = Math.pow(0.05, dt);
      q.vx *= fr;
      q.vy *= fr;
    }
    this.particles = this.particles.filter(q => q.t < q.dur);
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
    const tr = this.player.trail;
    for (const g of tr) g.t += dt;
    while (tr.length && tr[0].t > 0.25) tr.shift();
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter(b => b.t < b.dur);
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
    if (this.shake > 0) this.shake -= dt;
    if (this.flashScreen > 0) this.flashScreen -= dt;
  }

  updateCamera(dt) {
    const k = 1 - Math.pow(0.0005, dt);
    this.cam.x += (this.player.x - this.cam.x) * k;
    this.cam.y += (this.player.y - this.cam.y) * k;
  }

  // ---- rendering ------------------------------------------------------------

  render(ctx, view) {
    const { w, h, zoom, dpr } = view;
    const vw = w / zoom, vh = h / zoom;
    let cx = vw >= MAP_W ? (MAP_W - vw) / 2 : clamp(this.cam.x - vw / 2, 0, MAP_W - vw);
    let cy = vh >= MAP_H ? (MAP_H - vh) / 2 : clamp(this.cam.y - vh / 2, 0, MAP_H - vh);
    if (this.shake > 0) {
      const s = Math.min(1, this.shake * 4) * 7;
      cx += rand(-s, s);
      cy += rand(-s, s);
    }
    const sc = dpr * zoom;
    ctx.setTransform(sc, 0, 0, sc, -cx * sc, -cy * sc);
    ctx.fillStyle = this.world.wall;
    ctx.fillRect(cx - 10, cy - 10, vw + 20, vh + 20);

    this.drawGround(ctx, cx, cy, vw, vh);
    this.drawTelegraphs(ctx);
    this.drawZones(ctx);
    this.drawBuffZones(ctx);
    this.drawPickups(ctx);

    const p = this.player;
    for (const g of p.trail) {
      ctx.globalAlpha = 0.35 * (1 - g.t / 0.25);
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 16, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const actors = this.enemies.filter(e => !e.dead && e.x > cx - 150 && e.x < cx + vw + 150 && e.y > cy - 150 && e.y < cy + vh + 150);
    actors.push(p);
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) {
      if (a !== p) { this.drawEnemy(ctx, a); continue; }
      if (this.powerT > 0) { // 힘의 물약 aura
        ctx.fillStyle = `rgba(255,140,40,${0.25 + 0.1 * Math.sin(this.time * 10)})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 20, 30, 11, 0, 0, TAU);
        ctx.fill();
      }
      drawHero(ctx, p, this.armor, this.time, this.weapon);
      this.drawResourceBar(ctx, p);
    }

    this.drawFireballs(ctx);
    this.drawMissiles(ctx);
    this.drawShots(ctx);
    this.drawEffects(ctx);
    for (const q of this.particles) {
      ctx.globalAlpha = 1 - q.t / q.dur;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    this.drawTexts(ctx);

    // screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawIndicators(ctx, cx, cy, zoom, w, h);
    if (this.flashScreen > 0) {
      ctx.fillStyle = `rgba(255,255,240,${Math.min(0.7, this.flashScreen * 2)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.state === 'dead') {
      ctx.fillStyle = `rgba(40,0,10,${Math.min(0.5, this.stateT * 0.4)})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawBanners(ctx, w, h);
  }

  drawGround(ctx, cx, cy, vw, vh) {
    const [c1, c2] = this.world.ground;
    const x0 = Math.max(0, Math.floor(cx / TILE)), x1 = Math.min(MAP_W / TILE - 1, Math.floor((cx + vw) / TILE));
    const y0 = Math.max(0, Math.floor(cy / TILE)), y1 = Math.min(MAP_H / TILE - 1, Math.floor((cy + vh) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        ctx.fillStyle = (tx + ty) % 2 ? c1 : c2;
        ctx.fillRect(tx * TILE, ty * TILE, TILE + 0.5, TILE + 0.5);
      }
    }
    ctx.globalAlpha = 0.6;
    for (const d of this.deco) {
      if (d.x < cx - 40 || d.x > cx + vw + 40 || d.y < cy - 40 || d.y > cy + vh + 40) continue;
      drawSprite(ctx, d.spr, d.x, d.y, { alpha: 0.6 });
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 8;
    ctx.strokeRect(-4, -4, MAP_W + 8, MAP_H + 8);
  }

  drawTelegraphs(ctx) {
    for (const e of this.enemies) {
      if (e.dead || !e.charge || e.charge.phase !== 'aim') continue;
      const len = 560 * 0.65;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.charge.a);
      ctx.fillStyle = `rgba(255,40,40,${0.18 + 0.15 * Math.sin(this.time * 30)})`;
      ctx.fillRect(0, -e.r * 0.8, len, e.r * 1.6);
      ctx.restore();
    }
  }

  drawPickups(ctx) {
    for (const k of this.pickups) {
      const bob = Math.sin((this.time + k.x) * 6) * 2;
      if (k.type === 'gold') {
        ctx.fillStyle = '#ffcf33';
        ctx.strokeStyle = '#a5741a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(k.x, k.y + bob, 7, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.fillRect(k.x - 2, k.y + bob - 4, 2, 5);
      } else if (k.type === 'gem') {
        drawGem(ctx, k.x, k.y + bob * 2, 16, GEM_GRADES[k.gem.g].color, this.time);
      } else if (k.type === 'item') {
        const color = GEM_GRADES[k.item.g].color;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(k.x, k.y + bob * 2, 20, 0, TAU);
        ctx.stroke();
        ctx.restore();
        drawSprite(ctx, emojiSprite(itemIcon(k.item), 26), k.x, k.y + bob * 2);
      } else {
        drawSprite(ctx, emojiSprite('❤️', 22), k.x, k.y + bob);
      }
    }
  }

  // Small stamina / arrows / mana bar under the hero while it isn't full; blinks red when empty.
  drawResourceBar(ctx, p) {
    const r = this.res;
    if (r.cur >= r.max) return;
    const w = 46, h = 6, x = p.x - w / 2, y = p.y + 30;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    const blink = r.empty && Math.floor(this.time * 6) % 2 === 0;
    ctx.fillStyle = blink ? '#ff5c6c' : r.def.color;
    ctx.fillRect(x, y, w * (r.cur / r.max), h);
  }

  drawMissiles(ctx) {
    for (const m of this.missiles) {
      if (m.kind === 'arrow') {
        const a = Math.atan2(m.vy, m.vx);
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(a);
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();
        ctx.fillStyle = '#e6ecf5';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(3, -5);
        ctx.lineTo(3, 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(-24, -4, 6, 8);
        ctx.restore();
      } else {
        const g = ctx.createRadialGradient(m.x, m.y, 1, m.x, m.y, 16);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, '#c9a7ff');
        g.addColorStop(1, 'rgba(140,90,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 16, 0, TAU);
        ctx.fill();
      }
    }
  }

  // Glowing circle with the buff's icon; blinks during its last 3 seconds.
  drawBuffZones(ctx) {
    for (const z of this.buffZones) {
      if (z.t < 3 && Math.floor(z.t * 6) % 2 === 0) continue;
      const b = BUFFS[z.kind];
      ctx.save();
      ctx.globalAlpha = Math.min(1, (BUFF_ZONE_TIME - z.t) * 4); // pop in
      ctx.fillStyle = b.color;
      ctx.globalAlpha *= 0.16;
      ctx.beginPath();
      ctx.arc(z.x, z.y, BUFF_RADIUS, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -this.time * 30;
      ctx.stroke();
      ctx.restore();
      const bob = Math.sin(this.time * 5 + z.x) * 4;
      drawSprite(ctx, emojiSprite(b.icon, 30), z.x, z.y - 6 + bob);
    }
  }

  drawZones(ctx) {
    for (const z of this.zones) {
      const fade = Math.min(1, z.t / 0.3);
      const g = ctx.createRadialGradient(z.x, z.y, z.r * 0.2, z.x, z.y, z.r);
      g.addColorStop(0, `rgba(255,190,60,${0.45 * fade})`);
      g.addColorStop(0.7, `rgba(255,90,30,${(0.3 + 0.08 * Math.sin(this.time * 20)) * fade})`);
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.fill();
    }
  }

  drawEnemy(ctx, e) {
    const grow = e.spawnT > 0 ? 1 - e.spawnT / 0.45 : 1;
    const scale = Math.max(0.1, Math.min(1, grow));
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.9, e.r * 0.85 * scale, e.r * 0.3 * scale, 0, 0, TAU);
    ctx.fill();
    if (e.slowT > 0) { // frosty ring = slowed by the basic attack
      ctx.strokeStyle = 'rgba(150,220,255,.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * 0.9, e.r, e.r * 0.36, 0, 0, TAU);
      ctx.stroke();
    }
    if (e.kind === 'elite' || e.kind === 'boss') {
      ctx.strokeStyle = e.kind === 'boss' ? 'rgba(255,60,60,.55)' : 'rgba(255,170,60,.55)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 8 + Math.sin(this.time * 6) * 3, 0, TAU);
      ctx.stroke();
    }
    const bob = Math.sin(e.t * 8) * 2;
    drawSprite(ctx, e.sprite, e.x, e.y + bob, { flip: e.face > 0, flash: e.flash, scale, alpha: scale });

    if (e.kind === 'elite') {
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.fillStyle = '#ffcf6b';
      ctx.strokeText(e.name, e.x, e.y - e.r - 26);
      ctx.fillText(e.name, e.x, e.y - e.r - 26);
    }
    if ((e.kind === 'mob' || e.kind === 'minion' || e.kind === 'elite') && e.hp < e.maxHp) {
      const bw = Math.max(36, e.r * 2), bx = e.x - bw / 2, by = e.y - e.r - 16;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
      ctx.fillStyle = e.kind === 'elite' ? '#ff9f43' : '#ff5c6c';
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 5);
    }
  }

  drawFireballs(ctx) {
    for (const f of this.fireballs) {
      const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r * 1.6);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.4, '#ffb02e');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 1.6, 0, TAU);
      ctx.fill();
    }
  }

  drawShots(ctx) {
    const color = this.world.shot;
    for (const s of this.shots) {
      ctx.fillStyle = 'rgba(40,0,10,.55)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r + 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath();
      ctx.arc(s.x - 2, s.y - 2, s.r * 0.35, 0, TAU);
      ctx.fill();
    }
  }

  drawEffects(ctx) {
    for (const fx of this.effects) {
      const k = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      switch (fx.type) {
        case 'slash': {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 10 * (1 - k) + 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          const a0 = fx.angle - 1.2, a1 = fx.angle - 1.2 + 2.4 * Math.min(1, k * 2.2);
          ctx.arc(fx.x, fx.y, fx.r * 0.75, a0, a1);
          ctx.stroke();
          break;
        }
        case 'spin': { // follows the hero for as long as the whirlwind lasts
          const { x, y } = this.player;
          ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 0.85;
          ctx.strokeStyle = 'rgba(191,233,255,.55)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(x, y, fx.r, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          for (let i = 0; i < 3; i++) {
            const a = fx.t * TAU * 3 + (i * TAU) / 3;
            ctx.beginPath();
            ctx.arc(x, y, fx.r * 0.8, a, a + 0.9);
            ctx.stroke();
          }
          break;
        }
        case 'smash': { // hammer: shockwave ring on the ground
          ctx.strokeStyle = '#f3e3c3';
          ctx.lineWidth = 8 * (1 - k) + 2;
          ctx.beginPath();
          ctx.ellipse(fx.x, fx.y, fx.r * (0.4 + 0.6 * k), fx.r * (0.4 + 0.6 * k) * 0.6, 0, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'thrust': { // spear: a quick streak along the line
          ctx.save();
          ctx.translate(fx.x, fx.y);
          ctx.rotate(fx.angle);
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.beginPath();
          ctx.moveTo(10, -fx.w * 0.5);
          ctx.lineTo(fx.r * Math.min(1, k * 3), 0);
          ctx.lineTo(10, fx.w * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'magic': {
          ctx.fillStyle = '#b48cff';
          ctx.globalAlpha = (1 - k) * 0.6;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.r * (0.4 + 0.6 * k), 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#f1e6ff';
          ctx.lineWidth = 3;
          ctx.stroke();
          break;
        }
        case 'explosion':
        case 'poof': {
          const big = fx.type === 'explosion';
          ctx.fillStyle = big ? '#ffb02e' : '#ffffff';
          ctx.globalAlpha = (1 - k) * (big ? 0.7 : 0.45);
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.r * (0.4 + 0.6 * k), 0, TAU);
          ctx.fill();
          if (big) {
            ctx.strokeStyle = '#fff3c4';
            ctx.lineWidth = 4;
            ctx.stroke();
          }
          break;
        }
        case 'bolt': {
          ctx.strokeStyle = '#fff59d';
          ctx.shadowColor = '#fff59d';
          ctx.shadowBlur = 16;
          ctx.lineWidth = 5;
          ctx.beginPath();
          let x = fx.x, y = fx.y - 420;
          ctx.moveTo(x, y);
          let s = fx.seed;
          while (y < fx.y) {
            s = (s * 9301 + 49297) % 233280;
            y += 40;
            x = fx.x + ((s / 233280) - 0.5) * 50;
            ctx.lineTo(x, Math.min(y, fx.y));
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, 26 * (1 - k), 0, TAU);
          ctx.fill();
          break;
        }
        case 'levelup': {
          ctx.strokeStyle = '#ffd54f';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(this.player.x, this.player.y, 20 + k * 90, 0, TAU);
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.dur;
      const pop = k < 0.15 ? 1 + (0.15 - k) * 3 : 1;
      ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      ctx.font = `900 ${Math.round(t.size * pop)}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // Arrows at the screen edge pointing at the last few monsters / the boss.
  drawIndicators(ctx, cx, cy, zoom, w, h) {
    const targets = [];
    const few = this.spawned >= this.stage.killGoal && this.aliveMobs() <= 3;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.isStageBoss || (few && e.kind === 'mob')) targets.push(e);
    }
    for (const e of targets) {
      const sx = (e.x - cx) * zoom, sy = (e.y - cy) * zoom;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const mx = w / 2, my = h / 2;
      const a = Math.atan2(sy - my, sx - mx);
      const pad = 46;
      const t = Math.min((w / 2 - pad) / Math.abs(Math.cos(a) || 1e-6), (h / 2 - pad) / Math.abs(Math.sin(a) || 1e-6));
      const ix = mx + Math.cos(a) * t, iy = my + Math.sin(a) * t;
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(a);
      ctx.fillStyle = e.isStageBoss ? '#ff5c6c' : '#ffd54f';
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-8, -12);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      drawSprite(ctx, emojiSprite(e.def.emoji, 22), ix - Math.cos(a) * 26, iy - Math.sin(a) * 26);
    }
  }

  drawBanners(ctx, w, h) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let y = h * 0.3;
    for (const b of this.banners) {
      const k = b.t / b.dur;
      const pop = k < 0.1 ? 0.6 + k * 4 : 1;
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      const size = Math.round(Math.min(b.size, w / 14) * pop);
      ctx.font = `900 ${size}px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(10,10,30,.8)';
      ctx.strokeText(b.text, w / 2, y);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, w / 2, y);
      y += size * 1.3;
    }
    ctx.globalAlpha = 1;
  }
}
