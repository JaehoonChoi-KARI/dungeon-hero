// Save data lives in this device's localStorage: three fixed save slots plus
// device-wide preferences (sound, keyboard/touch layout, last used slot).

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
    gear: { weapon: 0, armor: 0, boots: 0, ring: 0 },
    cleared: -1, // highest cleared stage index
    kills: 0,
    tutorialDone: false,
    kbBest: 0, // best streak in the keyboard practice screen
    updatedAt: 0, // last time this slot was saved (ms)
  };
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
  return d ? merge(defaultSave(), d) : null;
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
  writeSlot(free + 1, merge(defaultSave(), old));
  prefs.lastSlot = free + 1;
  writePrefs(prefs);
  remove(LEGACY_KEY);
}
