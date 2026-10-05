// Save data lives in this device's localStorage.

const KEY = 'dungeonHero.save.v1';

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
    sound: true,
    tutorialDone: false,
    kbBest: 0, // best streak in the keyboard practice screen
    inputMode: 'keyboard', // 'keyboard' | 'touch' — whichever was used last
  };
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

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(defaultSave(), JSON.parse(raw));
  } catch { /* fall through to a fresh save */ }
  return defaultSave();
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ }
}
