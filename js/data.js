// Game data tables and progression formulas.

export const VERSION = '2.0.0'; // keep in sync with CACHE in sw.js

export const STAGES_PER_WORLD = 5;
export const MAX_LEVEL = 80;

// Difficulty tiers replay the same 25 stages with stronger monsters and higher-level loot.
// "Effective stage" e = tier * 25 + stage index (0..74) drives every number.
export const TIERS = [
  { name: '보통', color: '#7dffa0' },
  { name: '어려움', color: '#ffb36b' },
  { name: '지옥', color: '#ff5c6c' },
];

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

// Monster strength by effective stage. Up to 5-5 on 보통 it's the v1.2.0 curve times hpAll/dmgAll;
// 어려움 starts a notch stronger (jump) and then grows by a fixed factor per stage to keep pace
// with item levels. Target (v2.0): the difficulty right after the Space resource went in, kept
// after armor effects/gems were added. Tuned with tools/balance.html.
const LAST_NORMAL = 24;
// bossHp: extra HP for stage-end bosses (대장 and world bosses) on every difficulty.
export const SCALE = { hpAll: 1.02, dmgAll: 1.31, hpJump: 1.64, hpGrowth: 1.0824, dmgJump: 1.6, dmgGrowth: 1.107, bossHp: 1.05 };
const hpCurve = e => (1 + 0.55 * e + 0.035 * e * e) * (1.4 + 0.024 * e);
const dmgCurve = e => 1 + 0.28 * e + 0.018 * e * e;
export const rewardAt = e => 1 + 0.35 * e + 0.01 * e * e;

export function stageInfo(i, tier = 0) {
  const world = Math.floor(i / STAGES_PER_WORLD);
  const num = (i % STAGES_PER_WORLD) + 1;
  const e = tier * STAGE_COUNT + i;
  const past = Math.max(0, e - LAST_NORMAL);
  return {
    index: i,
    tier,
    e,
    world,
    num,
    label: `${world + 1}-${num}`,
    fullLabel: tier > 0 ? `${TIERS[tier].name} ${world + 1}-${num}` : `${world + 1}-${num}`,
    isBossStage: num === STAGES_PER_WORLD,
    killGoal: 14 + i,
    maxAlive: Math.min(12, 5 + Math.floor(e / 3)),
    hpMul: hpCurve(Math.min(e, LAST_NORMAL)) * SCALE.hpAll * (past ? SCALE.hpJump * SCALE.hpGrowth ** past : 1),
    dmgMul: dmgCurve(Math.min(e, LAST_NORMAL)) * SCALE.dmgAll * (past ? SCALE.dmgJump * SCALE.dmgGrowth ** past : 1),
    rewardMul: rewardAt(e),
    recLevel: Math.min(MAX_LEVEL, 1 + Math.round(e * 1.1)),
    itemLevel: e + 1, // level of weapons/armor dropped here
    lootWorld: tier * WORLDS.length + world, // later tiers roll better grades
  };
}

// ---- Skills ---------------------------------------------------------------

export const SKILLS = {
  atk: { label: 'Space', code: 'Space', name: '무기 공격', icon: '⚔️', unlock: 1, max: 5 }, // depends on the equipped weapon
  q: { label: 'Q', code: 'KeyQ', name: '회오리 베기', icon: '🌀', unlock: 2, max: 5 },
  w: { label: 'W', code: 'KeyW', name: '돌진', icon: '💨', unlock: 4, max: 5 },
  e: { label: 'E', code: 'KeyE', name: '화염구', icon: '🔥', unlock: 6, max: 5 },
  r: { label: 'R', code: 'KeyR', name: '천둥 폭풍', icon: '⚡', unlock: 9, max: 5 },
};
export const SKILL_ORDER = ['atk', 'q', 'w', 'e', 'r'];

export const PASSIVES = {
  hp: { name: '체력 단련', icon: '❤️', max: 20, desc: lv => `최대 체력 +${lv * 6}%` },
  str: { name: '힘 단련', icon: '💪', max: 20, desc: lv => `공격력 +${lv * 5}%` },
};
export const PASSIVE_ORDER = ['hp', 'str'];

// ---- Main weapons (Space) ---------------------------------------------------
// Roughly equal damage per second; they differ in reach, area and speed.
// kind: melee = arc in front, smash = circle hit in front, thrust = straight line,
//       arrow = projectile that hits one enemy, orb = projectile that explodes.
export const WEAPON_CATS = {
  dagger: { name: '단검', icon: '🗡️', res: 'stamina', desc: '아주 빠르게 찔러요 · 치명타 +10%', attack: { kind: 'melee', mult: 0.62, cd: 0.22, range: 62, arc: 0.9, critBonus: 0.1, kb: 120 } },
  sword: { name: '장검', icon: '⚔️', res: 'stamina', desc: '앞쪽을 넓게 베어요', attack: { kind: 'melee', mult: 1, cd: 0.36, range: 80, arc: 1.25, kb: 240 } },
  hammer: { name: '해머', icon: '🔨', res: 'stamina', desc: '느리지만 앞쪽 땅을 쾅! 주변을 한꺼번에 때리고 밀쳐요', attack: { kind: 'smash', mult: 2, cd: 0.75, reach: 55, radius: 60, kb: 340 } },
  spear: { name: '창', icon: '🔱', res: 'stamina', desc: '멀리까지 일직선으로 찔러서 줄 선 적을 모두 꿰뚫어요', attack: { kind: 'thrust', mult: 1.05, cd: 0.4, range: 135, width: 24, kb: 200 } },
  // Ranged weapons aim for you (aim: half-angle of the cone they look in) and steer toward the
  // target a little (turn: radians/s). They hit a bit softer than melee: safety from range is their edge.
  bow: { name: '활', icon: '🏹', res: 'arrows', desc: '앞쪽의 적을 알아서 노려 화살을 쏴요 · 한 발이 2마리까지 꿰뚫어요', attack: { kind: 'arrow', mult: 0.95, cd: 0.38, range: 520, speed: 900, kb: 120, aim: 1.05, turn: 6, pierce: 1 } },
  staff: { name: '마법지팡이', icon: '🪄', res: 'mana', desc: '앞쪽의 적을 알아서 노려 마법 구슬을 쏴요 · 맞은 곳 주변이 펑! 터져요', attack: { kind: 'orb', mult: 1.25, cd: 0.55, range: 420, speed: 560, radius: 60, kb: 160, aim: 1.05, turn: 5 } },
};
export const AIM_NEAR = 220; // with nobody in the cone, ranged attacks still find an enemy this close
export const WEAPON_ORDER = ['dagger', 'sword', 'hammer', 'spear', 'bow', 'staff'];

// ---- Space resource: every weapon attack uses one unit ------------------------
// Holding Space empties it in about RES_SUSTAIN seconds whatever the weapon (faster weapons
// get more units). It only refills while Space is up; once empty, Space is locked until full.
export const RESOURCES = {
  // obj/subj: the Korean particles that follow the name (을/를, 이/가)
  stamina: { name: '스태미나', obj: '를', subj: '가', icon: '🏃', color: '#ffd54f', empty: '헉헉! 숨 좀 쉬고…' },
  arrows: { name: '화살', obj: '을', subj: '이', icon: '🏹', color: '#e8c48f', empty: '화살 재장전!', count: true },
  mana: { name: '마나', obj: '를', subj: '가', icon: '💧', color: '#5cb8ff', empty: '마나가 바닥났어요!' },
};
export const RES_SUSTAIN = 4; // seconds of non-stop attacking from full to empty
export const RES_REFILL = 1.6; // seconds from empty to full once Space is released
export const RES_DELAY = 0.25; // pause after letting go before it starts refilling
export const resourceMax = cat => Math.max(3, Math.round(RES_SUSTAIN / WEAPON_CATS[cat].attack.cd));
export const resourceOf = cat => RESOURCES[WEAPON_CATS[cat].res];
export const resourceText = cat => {
  const r = resourceOf(cat), n = resourceMax(cat);
  return `${r.icon} ${r.name} ${n}${r.count ? '발' : '칸'} · 다 쓰면 다 찰 때까지 쉬어야 해요`;
};

export const NO_MODS = { dmg: 0, area: 0, cdr: 0, dur: 0, crit: 0 };

// dur = how long the skill's lasting effect runs: atk slows, q keeps spinning,
// w speeds you up after the dash, e leaves fire on the ground, r keeps striking.
// mods = socketed gem totals for this skill (see gems.js); cat = equipped weapon type for 'atk'.
export function skillParams(id, lv, mods = NO_MODS, cat = 'sword') {
  const n = Math.max(0, lv - 1);
  let p;
  switch (id) {
    case 'atk': {
      const a = (WEAPON_CATS[cat] || WEAPON_CATS.sword).attack;
      p = { ...a, mult: a.mult * (1 + 0.15 * n), dur: 0.6 };
      break;
    }
    case 'q': p = { mult: 1.6 + 0.35 * n, cd: 5 - 0.5 * n, radius: 110 + 10 * n, dur: 0.5 }; break;
    case 'w': p = { mult: 2 + 0.45 * n, cd: 6 - 0.6 * n, dist: 220 + 15 * n, dur: 1 }; break;
    case 'e': p = { mult: 2.2 + 0.45 * n, cd: 3.5 - 0.3 * n, count: 1 + Math.floor(n / 2), radius: 80 + 6 * n, dur: 1.5 }; break;
    case 'r': p = { mult: 5 + 1.2 * n, cd: 28 - 2.5 * n, range: 640, dur: 1.2 }; break;
    default: return null;
  }
  const area = 1 + mods.area;
  p.mult *= 1 + mods.dmg;
  p.cd *= 1 - mods.cdr;
  p.dur *= 1 + mods.dur;
  p.crit = mods.crit + (p.critBonus || 0);
  if (p.range) p.range *= area;
  if (p.radius) p.radius *= area;
  if (p.dist) p.dist *= area;
  if (p.width) p.width *= area;
  return p;
}

const pct = m => `${Math.round(m * 100)}%`;
export const fmt1 = x => String(Math.round(x * 10) / 10);

export function skillDesc(id, lv, mods = NO_MODS, cat = 'sword') {
  const p = skillParams(id, Math.max(1, lv), mods, cat);
  switch (id) {
    case 'atk': {
      const r = RESOURCES[WEAPON_CATS[cat].res];
      return `${WEAPON_CATS[cat].name}: ${WEAPON_CATS[cat].desc} · 맞은 적은 ${fmt1(p.dur)}초 동안 느려져요 · 피해 ${pct(p.mult)} · 한 번에 ${r.icon} ${r.name} 1 사용`;
    }
    case 'q': return `${fmt1(p.dur)}초 동안 빙글빙글 여러 번 베어요 · 피해 ${pct(p.mult)} · 재사용 ${fmt1(p.cd)}초`;
    case 'w': return `앞으로 돌진(무적)! 그 뒤 ${fmt1(p.dur)}초 동안 빨라져요 · 피해 ${pct(p.mult)} · 재사용 ${fmt1(p.cd)}초`;
    case 'e': return `불덩이 ${p.count}개 발사, 터진 자리에 ${fmt1(p.dur)}초 동안 불 · 피해 ${pct(p.mult)} · 재사용 ${fmt1(p.cd)}초`;
    case 'r': return `주변 모든 적에게 번개, ${fmt1(p.dur)}초 동안 더 떨어져요 · 피해 ${pct(p.mult)} · 재사용 ${fmt1(p.cd)}초`;
  }
  return '';
}

// ---- Weapon and armor items ---------------------------------------------------
// Both drop with the stage's item level and can be enhanced at most UP_LIMIT times, each
// step raising the item's level by one. Power grows LEVEL_GROWTH per level, so even a 신화
// is overtaken by gear found a few levels later — that's the item's "use-by date".

export const ITEM_MAX_LEVEL = TIERS.length * STAGE_COUNT + 5; // 80
export const UP_LIMIT = 5;
// per-level growth: weapons +8%, armor HP +9% (keeps 보통 close to the old town-upgrade curve)
export const WEAPON_GROWTH = 1.08;
export const ARMOR_GROWTH = 1.09;
export const itemLevel = it => Math.min(ITEM_MAX_LEVEL, it.lv + it.up);
export const levelMul = (L, growth = WEAPON_GROWTH) => growth ** (L - 1);
export const canUpgrade = it => it.up < UP_LIMIT && itemLevel(it) < ITEM_MAX_LEVEL;
// gold for the next step: grows with level like stage rewards, and with each step taken
export const upCost = it => Math.round(60 * rewardAt(itemLevel(it) - 1) * (1 + 0.3 * it.up));

export const weaponPower = w => (w ? Math.round(w.roll * levelMul(itemLevel(w))) : 0);
export const armorHp = a => (a ? Math.round(a.hpRoll * levelMul(itemLevel(a), ARMOR_GROWTH)) : 0);
export const armorDef = a => (a ? Math.round((a.defRoll / 10) * itemLevel(a)) : 0); // linear: damage cut can't run away

// armor name and look change with its level band
const ARMOR_NAMES = ['천 옷', '가죽 갑옷', '사슬 갑옷', '강철 갑옷', '미스릴 갑옷', '용비늘 갑옷'];
export const armorBand = L => Math.min(5, Math.floor((L - 1) / 14));
export const armorBaseName = a => ARMOR_NAMES[armorBand(itemLevel(a))];

// Boots and ring stay town upgrades with a fixed cap.
export const GEAR = {
  boots: { slot: '신발', icon: '👟', max: 10, tiers: ['바람의 신발'], cost: n => Math.round(60 * 1.45 ** n), effect: n => `이동 속도 +${n * 4}%` },
  ring: { slot: '반지', icon: '💍', max: 15, tiers: ['행운의 반지'], cost: n => Math.round(50 * 1.35 ** n), effect: n => `치명타 +${n * 2}% · 골드 +${n * 5}%` },
};
export const GEAR_ORDER = ['boots', 'ring'];

export function gearName(id, n) {
  const name = GEAR[id].tiers[0];
  return n > 0 ? `+${n} ${name}` : name;
}

// ---- Regular monster drops: one of gold / heart / buff circle ---------------
// Gold comes 20% less often, so it pays 1/0.8 = 1.25x when it does: average gold is unchanged.

export const DROP_GOLD = 0.8;
export const DROP_HEART = 0.08; // the remaining 0.12 is a buff circle
export const GOLD_DROP_BONUS = 1 / DROP_GOLD;
export const HEART_HEAL = 0.1; // small; potions are the big heal

export const BUFF_TIME = 7; // seconds a buff lasts once picked up
export const BUFF_ZONE_TIME = 10; // seconds a circle stays on the ground
export const BUFF_RADIUS = 90; // about five heroes across
export const BUFFS = {
  atk: { name: '공격력', icon: '⚔️', color: '#ff8a3d', text: '공격력 +10%' },
  def: { name: '방어력', icon: '🛡️', color: '#4fb4ff', text: '받는 피해 -10%' },
  spd: { name: '이동 속도', icon: '👟', color: '#5be37d', text: '이동 속도 +10%' },
};
export const BUFF_ORDER = ['atk', 'def', 'spd'];
export const BUFF_ATK = 1.1, BUFF_DEF = 0.9, BUFF_SPD = 1.1;

// ---- Potions (shop in town, numbers 1 and 2 in battle) ---------------------

export const POTION_MAX = 10;
export const POTIONS = {
  hp: { name: '체력 물약', icon: '🧪', code: 'Digit1', label: '1', desc: '체력을 40% 채워요', price: L => 20 + 8 * L },
  atk: { name: '힘의 물약', icon: '💪', code: 'Digit2', label: '2', desc: '12초 동안 피해 +30%', price: L => 30 + 12 * L },
};
export const POTION_ORDER = ['hp', 'atk'];
export const POTION_HEAL = 0.4;
export const POWER_TIME = 12;
export const POWER_MULT = 1.3;
export const ARMOR_COLORS = ['#e9dcc0', '#a8693a', '#8d99a6', '#cfd8e3', '#5fd4e8', '#d83a3a'];

// ---- Player progression ---------------------------------------------------

export const xpNeed = L => Math.round(12 * L ** 1.55 + 8);

export const equippedWeapon = save => save.weapons.find(w => w.id === save.weaponId) || save.weapons[0] || null;
export const equippedArmor = save => save.armors.find(a => a.id === save.armorId) || save.armors[0] || null;

// The equipped armor's bonus effects as fractions: dr (damage taken), hp, spd, regen, potion.
export function armorMods(armor) {
  const m = { dr: 0, hp: 0, spd: 0, regen: 0, potion: 0 };
  for (const f of (armor && armor.fx) || []) if (f.s in m) m[f.s] += f.v / 100;
  return m;
}

export function computeStats(save) {
  const L = save.level, g = save.gear, sk = save.skills;
  const armor = equippedArmor(save);
  const am = armorMods(armor);
  return {
    atk: Math.round((10 + 2 * (L - 1) + weaponPower(equippedWeapon(save))) * (1 + 0.05 * sk.str)),
    maxHp: Math.round((100 + 12 * (L - 1) + armorHp(armor)) * (1 + 0.06 * sk.hp) * (1 + am.hp)),
    def: armorDef(armor),
    damageTaken: 1 - Math.min(0.5, am.dr), // armor effect "받는 피해 -x%"
    regen: 1 + am.regen, // stamina/arrows/mana refill speed
    potion: 1 + am.potion, // potion heal and power duration
    speed: 230 * (1 + 0.04 * g.boots) * (1 + am.spd),
    crit: 0.05 + 0.02 * g.ring,
    goldBonus: 1 + 0.05 * g.ring,
  };
}

export const fmtNum = n => Math.floor(n).toLocaleString('ko-KR');
