// Skill gems: bosses drop them, each skill has 3 sockets to put them in.

import { SKILL_ORDER, equippedWeapon } from './data.js';

export const SOCKETS_PER_SKILL = 3;

export const GEM_GRADES = [
  { name: '일반', color: '#d4d8ea', sell: 20 },
  { name: '희귀', color: '#4fb4ff', sell: 60 },
  { name: '영웅', color: '#b77cff', sell: 150 },
  { name: '전설', color: '#ffb02e', sell: 400 },
  { name: '신화', color: '#ff4d6d', sell: 1000 },
];
export const GRADE_COMMON = 0, GRADE_RARE = 1, GRADE_EPIC = 2, GRADE_LEGEND = 3, GRADE_MYTH = 4;

// Value ranges (in %) per grade, lowest grade first.
export const GEM_STATS = {
  dmg: { name: '피해', sign: '+', ranges: [[5, 10], [10, 16], [16, 24], [24, 34], [34, 46]] },
  area: { name: '범위', sign: '+', ranges: [[5, 10], [10, 15], [15, 22], [22, 30], [30, 40]] },
  cdr: { name: '쿨타임', sign: '-', ranges: [[3, 6], [6, 9], [9, 13], [13, 18], [18, 24]] },
  dur: { name: '지속시간', sign: '+', ranges: [[10, 20], [20, 32], [32, 46], [46, 62], [62, 80]] },
  crit: { name: '치명타', sign: '+', ranges: [[2, 4], [4, 6], [6, 9], [9, 12], [12, 16]] },
};
const STAT_IDS = Object.keys(GEM_STATS);
export const MAX_CDR = 0.6; // cooldown can't drop below 40%

// Drop odds by grade: stage-end "대장" monsters vs. world bosses; later worlds lean higher.
const ELITE_WEIGHTS = [52, 28, 13, 5.5, 1.5];
const BOSS_WEIGHTS = [30, 32, 22, 11, 5];

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function rollGrade(world, worldBoss) {
  const weights = (worldBoss ? BOSS_WEIGHTS : ELITE_WEIGHTS).map((w, g) => w * (1 + 0.1 * world * g));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let g = 0; g < weights.length; g++) {
    r -= weights[g];
    if (r < 0) return g;
  }
  return 0;
}

const rollValue = (stat, grade) => randInt(...GEM_STATS[stat].ranges[grade]);

// 신화: 신화 value + a 영웅-range second effect; 전설: 전설 value + a 희귀-range second effect;
// lower grades: one effect. Shared by gems and weapons.
export function rollEffects(grade) {
  const main = pick(STAT_IDS);
  const fx = [{ s: main, v: rollValue(main, grade) }];
  if (grade >= GRADE_LEGEND) {
    const second = pick(STAT_IDS.filter(s => s !== main));
    fx.push({ s: second, v: rollValue(second, grade === GRADE_MYTH ? GRADE_EPIC : GRADE_RARE) });
  }
  return fx;
}

export function makeGem(id, grade) {
  return { id, g: grade, fx: rollEffects(grade) };
}

export function rollGem(save, world, worldBoss) {
  return makeGem(save.nextGemId++, rollGrade(world, worldBoss));
}

export const effectText = ({ s, v }) => `${GEM_STATS[s].name} ${GEM_STATS[s].sign}${v}%`;
export const gemText = gem => gem.fx.map(effectText).join(' · ');

export const findGem = (save, id) => (id ? save.gems.find(g => g.id === id) || null : null);

// Space's sockets are on the equipped weapon; Q/W/E/R have their own.
export const socketsOf = (save, skillId) => (skillId === 'atk' ? equippedWeapon(save).sockets : save.sockets[skillId]);

// Gems in any socket, including weapons that aren't equipped right now.
export function socketedIds(save) {
  const ids = new Set();
  for (const id of ['q', 'w', 'e', 'r']) for (const gid of save.sockets[id]) if (gid) ids.add(gid);
  for (const w of save.weapons) for (const gid of w.sockets) if (gid) ids.add(gid);
  return ids;
}

export const freeGems = save => {
  const used = socketedIds(save);
  return save.gems.filter(g => !used.has(g.id)).sort((a, b) => b.g - a.g || b.id - a.id);
};

// Per-skill totals as fractions, e.g. { dmg: 0.18, area: 0, cdr: 0.09, dur: 0, crit: 0.06 }.
// Space also gets the equipped weapon's own bonus effects.
export function gemMods(save) {
  const out = {};
  for (const id of SKILL_ORDER) {
    const m = { dmg: 0, area: 0, cdr: 0, dur: 0, crit: 0 };
    const fxs = socketsOf(save, id).map(gid => findGem(save, gid)).filter(Boolean).flatMap(g => g.fx);
    if (id === 'atk') fxs.push(...equippedWeapon(save).fx);
    for (const f of fxs) m[f.s] += f.v / 100;
    m.cdr = Math.min(MAX_CDR, m.cdr);
    out[id] = m;
  }
  return out;
}

// ---- Fusion: 3 free gems of one grade + gold → 1 gem of the next grade -----

export const FUSE_COUNT = 3;
export const FUSE_COST = [100, 300, 1000, 3000]; // by the grade being fused (신화 can't go higher)

// 0..1: how high a gem rolled within its grade (main effect only)
function quality(gem) {
  const { s, v } = gem.fx[0];
  const [lo, hi] = GEM_STATS[s].ranges[gem.g];
  return hi > lo ? (v - lo) / (hi - lo) : 0;
}

// The gems a fusion would use up: the weakest free gems of that grade.
export function fuseCandidates(save, grade) {
  return freeGems(save).filter(g => g.g === grade).sort((a, b) => quality(a) - quality(b) || a.id - b.id).slice(0, FUSE_COUNT);
}

export function canFuse(save, grade) {
  return grade < GRADE_MYTH && fuseCandidates(save, grade).length === FUSE_COUNT && save.gold >= FUSE_COST[grade];
}

export function fuse(save, grade) {
  if (!canFuse(save, grade)) return null;
  const used = new Set(fuseCandidates(save, grade));
  save.gems = save.gems.filter(g => !used.has(g));
  save.gold -= FUSE_COST[grade];
  const gem = makeGem(save.nextGemId++, grade + 1);
  save.gems.push(gem);
  return gem;
}

// "피해 +18% · 쿨타임 -9%" for one skill's sockets, or '' when empty.
export function modsText(mods) {
  return STAT_IDS.filter(s => mods[s] > 0)
    .map(s => effectText({ s, v: Math.round(mods[s] * 100) }))
    .join(' · ');
}
