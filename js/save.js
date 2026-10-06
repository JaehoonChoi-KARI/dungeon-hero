// Save data lives in this device's localStorage: three fixed save slots plus
// device-wide preferences (sound, keyboard/touch layout, last used slot).

import { WEAPON_CATS, UP_LIMIT } from './data.js';
import { starterWeapon, starterArmor, WEAPON_ROLLS } from './items.js';

export const SLOT_COUNT = 3;
const LEGACY_KEY = 'dungeonHero.save.v1'; // the single save used by v1.0.0
let prefix = 'dungeonHero.';
const slotKey = n => `${prefix}slot.${n}`;
const prefsKey = () => `${prefix}prefs`;

// The smoke test uses separate keys so it never touches real saves.
export function useTestStorage() { prefix = 'dungeonHero.test.'; }

export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    level: 1,
    xp: 0,
    gold: 0,
    sp: 0,
    skills: { atk: 1, q: 0, w: 0, e: 0, r: 0, hp: 0, str: 0 },
    gear: { boots: 0, ring: 0 },
    cleared: [-1, -1, -1], // highest cleared stage index per difficulty tier
    kills: 0,
    tutorialDone: false,
    kbBest: 0, // best streak in the keyboard practice screen
    gems: [], // { id, g: grade 0-4, fx: [{ s: stat, v: percent }] }
    sockets: { q: [0, 0, 0], w: [0, 0, 0], e: [0, 0, 0], r: [0, 0, 0] }, // gem ids, 0 = empty (Space's are on the weapon)
    nextGemId: 1,
    gemSeenId: 0, // gems with a higher id show as "new" in town
    weapons: [starterWeapon(1)], // see items.js
    weaponId: 1, // equipped
    nextWeaponId: 2,
    weaponSeenId: 1,
    armors: [starterArmor(1)],
    armorId: 1,
    nextArmorId: 2,
    armorSeenId: 1,
    potions: { hp: 0, atk: 0 },
    seenBuff: false, // first buff circle shows a one-time hint
    seenTired: false, // first time the Space resource runs out shows a one-time hint
    refund: 0, // gold given back when old over-enhanced gear was capped; shown once in town
    updatedAt: 0, // last time this slot was saved (ms)
  };
}

const cleanSockets = (arr, valid, used) => [0, 1, 2].map(i => {
  const id = Array.isArray(arr) ? arr[i] : 0;
  if (!valid.has(id) || used.has(id)) return 0;
  used.add(id);
  return id;
});

const okGrade = g => Number.isInteger(g) && g >= 0 && g <= 4;
const upOf = it => (Number.isInteger(it.up) ? Math.max(0, Math.min(UP_LIMIT, it.up)) : 0);

// Drop broken gems/items and socket entries that point at missing (or doubly used) gems.
function sanitize(save) {
  save.gems = save.gems.filter(g => g && Number.isInteger(g.id) && okGrade(g.g) && Array.isArray(g.fx));
  save.weapons = save.weapons
    .filter(w => w && Number.isInteger(w.id) && WEAPON_CATS[w.cat] && okGrade(w.g) && typeof w.roll === 'number' && Array.isArray(w.fx))
    .map(w => ({ ...w, lv: Math.max(1, w.lv | 0), up: upOf(w) }));
  if (!save.weapons.length) save.weapons.push(starterWeapon(save.nextWeaponId++));
  if (!save.weapons.some(w => w.id === save.weaponId)) save.weaponId = save.weapons[0].id;
  save.armors = save.armors
    .filter(a => a && Number.isInteger(a.id) && okGrade(a.g) && typeof a.hpRoll === 'number' && typeof a.defRoll === 'number')
    .map(a => ({ ...a, lv: Math.max(1, a.lv | 0), up: upOf(a), fx: Array.isArray(a.fx) ? a.fx : [], sockets: Array.isArray(a.sockets) ? a.sockets : [0, 0, 0] }));
  if (!save.armors.length) save.armors.push(starterArmor(save.nextArmorId++));
  if (!save.armors.some(a => a.id === save.armorId)) save.armorId = save.armors[0].id;
  if (!Array.isArray(save.cleared) || save.cleared.length !== 3) save.cleared = [-1, -1, -1];
  const valid = new Set(save.gems.map(g => g.id));
  const used = new Set();
  for (const k of Object.keys(save.sockets)) save.sockets[k] = cleanSockets(save.sockets[k], valid, used);
  for (const w of save.weapons) w.sockets = cleanSockets(w.sockets, valid, used);
  for (const a of save.armors) a.sockets = cleanSockets(a.sockets, valid, used);
  return save;
}

// ---- Upgrading saves from older versions -----------------------------------

// What enhancement used to cost (v1.2/1.3: weapon 30·1.2^n, armor 25·1.2^n, 10% steps past 30).
const oldUpCost = (base, n) => Math.round(n < 30 ? base * 1.2 ** n : base * 1.2 ** 29 * 1.1 ** (n - 29));
const refundAbove = (base, from, to) => {
  let gold = 0;
  for (let n = from; n < to; n++) gold += oldUpCost(base, n);
  return gold;
};
const OLD_WEAPON_ROLLS = [[4, 7], [7, 11], [11, 16], [16, 22], [22, 30]];

// v1 weapon (fixed attack + up to +99) → v2 weapon (grade roll + at most +5).
// Keeps where its attack sat inside the grade's range; enhancement past +5 is paid back.
function upgradeWeapon(w) {
  const [lo, hi] = OLD_WEAPON_ROLLS[w.g] || OLD_WEAPON_ROLLS[0];
  const base = (w.atk || lo) / (1 + 0.12 * ((w.lv || 1) - 1));
  const q = Math.max(0, Math.min(1, (base - lo) / (hi - lo)));
  const [nlo, nhi] = WEAPON_ROLLS[w.g] || WEAPON_ROLLS[0];
  const oldUp = Number.isInteger(w.up) ? w.up : 0;
  const { atk, ...rest } = w;
  return { weapon: { ...rest, roll: Math.round(nlo + q * (nhi - nlo)), up: Math.min(UP_LIMIT, oldUp) }, refund: refundAbove(30, UP_LIMIT, oldUp) };
}

// v1 town armor level n → an armor item of about the same strength (+5 at most, the rest paid back).
function armorFromLevel(id, n) {
  const g = n >= 20 ? 2 : n >= 10 ? 1 : 0;
  const a = starterArmor(id);
  return { armor: { ...a, g, lv: Math.max(1, Math.min(25, n)), up: Math.min(UP_LIMIT, n), hpRoll: [70, 107, 145][g], defRoll: [18, 22, 26][g] }, refund: refundAbove(25, 30, n) };
}

function upgradeOldSave(save, raw) {
  if ((raw.v | 0) >= SAVE_VERSION) return save;
  let refund = 0;
  if (typeof raw.cleared === 'number') save.cleared = [raw.cleared, -1, -1];
  if (Array.isArray(raw.weapons)) {
    // v1.2–1.3: weapon items with a fixed attack value
    save.weapons = raw.weapons.map(w => {
      const r = upgradeWeapon(w);
      refund += r.refund;
      return r.weapon;
    });
  } else {
    // before v1.2: one sword, town weapon level, Space gem sockets
    const sword = save.weapons[0];
    const oldUp = Number.isInteger(raw.gear?.weapon) ? raw.gear.weapon : 0;
    sword.sockets = Array.isArray(raw.sockets?.atk) ? raw.sockets.atk.slice(0, 3) : [0, 0, 0];
    sword.up = Math.min(UP_LIMIT, oldUp);
    refund += refundAbove(30, UP_LIMIT, oldUp);
  }
  const n = Number.isInteger(raw.gear?.armor) ? raw.gear.armor : 0;
  if (n > 0) {
    const r = armorFromLevel(1, n);
    save.armors = [r.armor];
    refund += r.refund;
  }
  save.gold += refund;
  save.refund = refund;
  save.v = SAVE_VERSION;
  return save;
}

export function defaultPrefs() {
  return { sound: true, inputMode: 'keyboard', lastSlot: 1 };
}

function merge(base, data) {
  for (const k of Object.keys(base)) {
    if (!(k in data)) continue;
    const b = base[k], d = data[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      if (d && typeof d === 'object') merge(b, d);
    } else if (typeof d === typeof b) {
      base[k] = d;
    }
  }
  return base;
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* blocked */ }
}

// null = empty slot
export function loadSlot(n) {
  const d = read(slotKey(n));
  return d ? sanitize(upgradeOldSave(merge(defaultSave(), d), d)) : null;
}

export function writeSlot(n, save) {
  save.updatedAt = Date.now();
  write(slotKey(n), save);
}

export function deleteSlot(n) { remove(slotKey(n)); }

export function listSlots() {
  return Array.from({ length: SLOT_COUNT }, (_, i) => loadSlot(i + 1));
}

export function loadPrefs() {
  const d = read(prefsKey());
  return d ? merge(defaultPrefs(), d) : defaultPrefs();
}

export function writePrefs(prefs) { write(prefsKey(), prefs); }

// v1.0.0 kept one save under a single key: move it into the first empty slot, once.
export function migrateLegacySave() {
  const old = read(LEGACY_KEY);
  if (!old) return;
  const prefs = loadPrefs();
  if (typeof old.sound === 'boolean') prefs.sound = old.sound;
  if (old.inputMode === 'keyboard' || old.inputMode === 'touch') prefs.inputMode = old.inputMode;
  const free = listSlots().findIndex(s => !s);
  if (free < 0) return; // every slot is taken; keep the old save rather than lose it
  writeSlot(free + 1, sanitize(upgradeOldSave(merge(defaultSave(), old), old)));
  prefs.lastSlot = free + 1;
  writePrefs(prefs);
  remove(LEGACY_KEY);
}
