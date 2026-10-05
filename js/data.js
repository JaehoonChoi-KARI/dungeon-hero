// Game data tables and progression formulas.

export const VERSION = '1.0.0'; // keep in sync with CACHE in sw.js

export const STAGES_PER_WORLD = 5;
export const MAX_LEVEL = 50;

export const WORLDS = [
  { name: '초록 초원', ground: ['#86c66f', '#7dbd66'], wall: '#3e6b35', deco: ['🌿', '🌼', '🌱', '🌷'], mobs: ['caterpillar', 'rat', 'bee'], boss: 'boar', shot: '#ff5fa2' },
  { name: '어두운 숲', ground: ['#4c8a55', '#457f4e'], wall: '#1f3d24', deco: ['🌲', '🍂', '🌿', '🪵'], mobs: ['wolf', 'shroom', 'spider'], boss: 'bear', shot: '#d29bff' },
  { name: '수정 동굴', ground: ['#5f5c80', '#585575'], wall: '#2a2840', deco: ['💎', '🪨', '🔮'], mobs: ['bat', 'scorpion', 'snake'], boss: 'trex', shot: '#7cf29c' },
  { name: '유령 묘지', ground: ['#565f6e', '#4f5765'], wall: '#262b33', deco: ['🪦', '🕯️', '🥀', '🦴'], mobs: ['ghost', 'skeleton', 'zombie'], boss: 'vampire', shot: '#9fe8ff' },
  { name: '용암 화산', ground: ['#73372a', '#6a3226'], wall: '#2b1210', deco: ['🔥', '🪨', '🌋'], mobs: ['goblin', 'imp', 'salamander'], boss: 'dragon', shot: '#ff3d3d' },
];

export const STAGE_COUNT = WORLDS.length * STAGES_PER_WORLD;

// ai: chase | zigzag | erratic | shoot | boss
export const MONSTERS = {
  caterpillar: { name: '애벌레', emoji: '🐛', hp: 22, dmg: 6, speed: 65, size: 34, xp: 3, gold: 2, ai: 'chase' },
  rat: { name: '들쥐', emoji: '🐀', hp: 15, dmg: 5, speed: 115, size: 32, xp: 3, gold: 2, ai: 'chase' },
  bee: { name: '말벌', emoji: '🐝', hp: 16, dmg: 6, speed: 85, size: 30, xp: 4, gold: 3, ai: 'shoot', range: 320, fireCd: 2.4, shotSpeed: 210 },
  boar: { name: '멧돼지 왕', emoji: '🐗', hp: 420, dmg: 14, speed: 80, size: 96, xp: 50, gold: 80, ai: 'boss' },

  wolf: { name: '늑대', emoji: '🐺', hp: 22, dmg: 7, speed: 135, size: 36, xp: 4, gold: 3, ai: 'chase' },
  shroom: { name: '독버섯', emoji: '🍄', hp: 26, dmg: 6, speed: 45, size: 34, xp: 4, gold: 3, ai: 'shoot', range: 340, fireCd: 2.2, shotSpeed: 190 },
  spider: { name: '거미', emoji: '🕷️', hp: 20, dmg: 7, speed: 100, size: 34, xp: 4, gold: 3, ai: 'zigzag' },
  bear: { name: '숲의 곰왕', emoji: '🐻', hp: 420, dmg: 14, speed: 80, size: 100, xp: 50, gold: 80, ai: 'boss' },

  bat: { name: '박쥐', emoji: '🦇', hp: 16, dmg: 6, speed: 150, size: 32, xp: 4, gold: 3, ai: 'erratic' },
  scorpion: { name: '전갈', emoji: '🦂', hp: 34, dmg: 9, speed: 70, size: 36, xp: 5, gold: 4, ai: 'chase' },
  snake: { name: '독사', emoji: '🐍', hp: 22, dmg: 7, speed: 70, size: 34, xp: 5, gold: 4, ai: 'shoot', range: 330, fireCd: 2.0, shotSpeed: 220 },
  trex: { name: '동굴 티라노', emoji: '🦖', hp: 420, dmg: 14, speed: 85, size: 104, xp: 50, gold: 80, ai: 'boss' },

  ghost: { name: '유령', emoji: '👻', hp: 20, dmg: 7, speed: 120, size: 34, xp: 5, gold: 4, ai: 'erratic' },
  skeleton: { name: '해골 궁수', emoji: '💀', hp: 22, dmg: 8, speed: 60, size: 34, xp: 5, gold: 4, ai: 'shoot', range: 360, fireCd: 1.9, shotSpeed: 240 },
  zombie: { name: '좀비', emoji: '🧟', hp: 40, dmg: 9, speed: 55, size: 38, xp: 5, gold: 4, ai: 'chase' },
  vampire: { name: '뱀파이어 백작', emoji: '🧛', hp: 420, dmg: 14, speed: 90, size: 96, xp: 50, gold: 80, ai: 'boss' },

  goblin: { name: '도깨비', emoji: '👹', hp: 30, dmg: 9, speed: 95, size: 38, xp: 6, gold: 5, ai: 'chase' },
  imp: { name: '꼬마 악마', emoji: '😈', hp: 24, dmg: 8, speed: 75, size: 34, xp: 6, gold: 5, ai: 'shoot', range: 350, fireCd: 1.8, shotSpeed: 240 },
  salamander: { name: '불도마뱀', emoji: '🦎', hp: 22, dmg: 8, speed: 145, size: 34, xp: 6, gold: 5, ai: 'zigzag' },
  dragon: { name: '화염 드래곤', emoji: '🐉', hp: 420, dmg: 14, speed: 90, size: 110, xp: 50, gold: 80, ai: 'boss' },
};

export function stageInfo(i) {
  const world = Math.floor(i / STAGES_PER_WORLD);
  const num = (i % STAGES_PER_WORLD) + 1;
  return {
    index: i,
    world,
    num,
    label: `${world + 1}-${num}`,
    isBossStage: num === STAGES_PER_WORLD,
    killGoal: 14 + i,
    maxAlive: Math.min(12, 5 + Math.floor(i / 3)),
    hpMul: 1 + 0.55 * i + 0.035 * i * i,
    dmgMul: 1 + 0.28 * i + 0.018 * i * i,
    rewardMul: 1 + 0.35 * i + 0.01 * i * i,
    recLevel: 1 + Math.round(i * 1.1),
  };
}

// ---- Skills ---------------------------------------------------------------

export const SKILLS = {
  atk: { label: 'Space', code: 'Space', name: '기본 공격', icon: '⚔️', unlock: 1, max: 5 },
  q: { label: 'Q', code: 'KeyQ', name: '회오리 베기', icon: '🌀', unlock: 2, max: 5 },
  w: { label: 'W', code: 'KeyW', name: '돌진', icon: '💨', unlock: 4, max: 5 },
  e: { label: 'E', code: 'KeyE', name: '화염구', icon: '🔥', unlock: 6, max: 5 },
  r: { label: 'R', code: 'KeyR', name: '천둥 폭풍', icon: '⚡', unlock: 9, max: 5 },
};
export const SKILL_ORDER = ['atk', 'q', 'w', 'e', 'r'];

export const PASSIVES = {
  hp: { name: '체력 단련', icon: '❤️', max: 10, desc: lv => `최대 체력 +${lv * 6}%` },
  str: { name: '힘 단련', icon: '💪', max: 10, desc: lv => `공격력 +${lv * 5}%` },
};
export const PASSIVE_ORDER = ['hp', 'str'];

export function skillParams(id, lv) {
  const n = Math.max(0, lv - 1);
  switch (id) {
    case 'atk': return { mult: 1 + 0.15 * n, cd: 0.36, range: 80, arc: 1.25 };
    case 'q': return { mult: 1.6 + 0.35 * n, cd: 5 - 0.5 * n, radius: 110 + 10 * n };
    case 'w': return { mult: 2 + 0.45 * n, cd: 6 - 0.6 * n, dist: 220 + 15 * n };
    case 'e': return { mult: 2.2 + 0.45 * n, cd: 3.5 - 0.3 * n, count: 1 + Math.floor(n / 2), radius: 80 + 6 * n };
    case 'r': return { mult: 5 + 1.2 * n, cd: 28 - 2.5 * n, range: 640 };
  }
  return null;
}

const pct = m => `${Math.round(m * 100)}%`;
export const fmt1 = x => String(Math.round(x * 10) / 10);

export function skillDesc(id, lv) {
  const p = skillParams(id, Math.max(1, lv));
  switch (id) {
    case 'atk': return `앞쪽을 베어요 · 피해 ${pct(p.mult)}`;
    case 'q': return `주변을 빙글 베어요 · 피해 ${pct(p.mult)} · 재사용 ${fmt1(p.cd)}초`;
    case 'w': return `앞으로 돌진! 돌진 중엔 무적 · 피해 ${pct(p.mult)} · 재사용 ${fmt1(p.cd)}초`;
    case 'e': return `불덩이 ${p.count}개 발사 · 폭발 피해 ${pct(p.mult)} · 재사용 ${fmt1(p.cd)}초`;
    case 'r': return `주변 모든 적에게 번개! · 피해 ${pct(p.mult)} · 재사용 ${fmt1(p.cd)}초`;
  }
  return '';
}

// ---- Gear -----------------------------------------------------------------

export const weaponAtk = n => Math.round(3 * n + 0.12 * n * n);
export const armorHp = n => Math.round(20 * n + n * n);

export const GEAR = {
  weapon: { slot: '무기', icon: '🗡️', max: 30, tiers: ['나무 검', '철 검', '강철 검', '미스릴 검', '용의 검', '전설의 검'], cost: n => Math.round(30 * 1.2 ** n), effect: n => `공격력 +${weaponAtk(n)}` },
  armor: { slot: '갑옷', icon: '🛡️', max: 30, tiers: ['천 옷', '가죽 갑옷', '사슬 갑옷', '강철 갑옷', '미스릴 갑옷', '용비늘 갑옷'], cost: n => Math.round(25 * 1.2 ** n), effect: n => `체력 +${armorHp(n)} · 방어력 +${n * 3}` },
  boots: { slot: '신발', icon: '👟', max: 10, tiers: ['바람의 신발'], cost: n => Math.round(60 * 1.45 ** n), effect: n => `이동 속도 +${n * 4}%` },
  ring: { slot: '반지', icon: '💍', max: 15, tiers: ['행운의 반지'], cost: n => Math.round(50 * 1.35 ** n), effect: n => `치명타 +${n * 2}% · 골드 +${n * 5}%` },
};
export const GEAR_ORDER = ['weapon', 'armor', 'boots', 'ring'];

export const gearTier = n => Math.min(5, Math.floor(n / 5));
export function gearName(id, n) {
  const g = GEAR[id];
  const name = g.tiers[Math.min(g.tiers.length - 1, Math.floor(n / 5))];
  return n > 0 ? `+${n} ${name}` : name;
}
export const WEAPON_COLORS = ['#c9a06a', '#aeb6c2', '#e6ecf5', '#7fe7ff', '#ff6e40', '#ffd54f'];
export const ARMOR_COLORS = ['#e9dcc0', '#a8693a', '#8d99a6', '#cfd8e3', '#5fd4e8', '#d83a3a'];

// ---- Player progression ---------------------------------------------------

export const xpNeed = L => Math.round(12 * L ** 1.55 + 8);

export function computeStats(save) {
  const L = save.level, g = save.gear, sk = save.skills;
  return {
    atk: Math.round((10 + 2 * (L - 1) + weaponAtk(g.weapon)) * (1 + 0.05 * sk.str)),
    maxHp: Math.round((100 + 12 * (L - 1) + armorHp(g.armor)) * (1 + 0.06 * sk.hp)),
    def: 3 * g.armor,
    speed: 230 * (1 + 0.04 * g.boots),
    crit: 0.05 + 0.02 * g.ring,
    goldBonus: 1 + 0.05 * g.ring,
  };
}

export const fmtNum = n => Math.floor(n).toLocaleString('ko-KR');
