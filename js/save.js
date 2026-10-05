// Save data lives in this device's localStorage: three fixed save slots plus
// device-wide preferences (sound, keyboard/touch layout, last used slot).

import { WEAPON_CATS } from './data.js';
import { starterWeapon } from './weapons.js';

export const SLOT_COUNT = 3;
const LEGACY_KEY = 'dungeonHero.save.v1'; // the single save used by v1.0.0
let prefix = 'dungeonHero.';
const slotKey = n => `${prefix}slot.${n}`;
const prefsKey = () => `${prefix}prefs`;

// The smoke test uses separate keys so it never touches real saves.
export function useTestStorage() { prefix = 'dungeonHero.test.'; }

export function defaultSave() {
  return {
    v: 1,
    level: 1,
    xp: 0,
    gold: 0,
    sp: 0,
    skills: { atk: 1, q: 0, w: 0, e: 0, r: 0, hp: 0, str: 0 },
    gear: { armor: 0, boots: 0, ring: 0 },
    cleared: -1, // highest cleared stage index
    kills: 0,
    tutorialDone: false,
    kbBest: 0, // best streak in the keyboard practice screen
    gems: [], // { id, g: grade 0-4, fx: [{ s: stat, v: percent }] }
    sockets: { q: [0, 0, 0], w: [0, 0, 0], e: [0, 0, 0], r: [0, 0, 0] }, // gem ids, 0 = empty (Space's are on the weapon)
    nextGemId: 1,
    gemSeenId: 0, // gems with a higher id show as "new" in town
    weapons: [starterWeapon(1)], // see weapons.js
    weaponId: 1, // equipped
    nextWeaponId: 2,
    weaponSeenId: 1,
    potions: { hp: 0, atk: 0 },
    updatedAt: 0, // last time this slot was saved (ms)
  };
}

const cleanSockets = (arr, valid, used) => [0, 1, 2].map(i => {
  const id = Array.isArray(arr) ? arr[i] : 0;
  if (!valid.has(id) || used.has(id)) return 0;
  used.add(id);
  return id;
});

// Drop broken gems/weapons and socket entries that point at missing (or doubly used) gems.
function sanitize(save) {
  save.gems = save.gems.filter(g => g && Number.isInteger(g.id) && g.g >= 0 && g.g <= 4 && Array.isArray(g.fx));
  save.weapons = save.weapons.filter(w => w && Number.isInteger(w.id) && WEAPON_CATS[w.cat] && w.g >= 0 && w.g <= 4 && Array.isArray(w.fx))
    .map(w => ({ ...w, up: Number.isInteger(w.up) ? w.up : 0 }));
  if (!save.weapons.length) save.weapons.push(starterWeapon(save.nextWeaponId++));
  if (!save.weapons.some(w => w.id === save.weaponId)) save.weaponId = save.weapons[0].id;
  const valid = new Set(save.gems.map(g => g.id));
  const used = new Set();
  for (const k of Object.keys(save.sockets)) save.sockets[k] = cleanSockets(save.sockets[k], valid, used);
  for (const w of save.weapons) w.sockets = cleanSockets(w.sockets, valid, used);
  return save;
}

// Saves from before weapon items: the old Space sockets and weapon enhancement move onto the starter sword.
function upgradeOldSave(save, raw) {
  if (Array.isArray(raw.weapons)) return save;
  const sword = save.weapons[0];
  sword.sockets = Array.isArray(raw.sockets?.atk) ? raw.sockets.atk.slice(0, 3) : [0, 0, 0];
  sword.up = Number.isInteger(raw.gear?.weapon) ? raw.gear.weapon : 0;
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
