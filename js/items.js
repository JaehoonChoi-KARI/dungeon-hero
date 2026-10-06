// Weapon and armor items: they drop from stage-end bosses with the stage's item level,
// roll a grade and random stats like gems do, and can be enhanced up to +5 levels.
// Power formulas (weaponPower, armorHp, armorDef, upCost) live in data.js.

import { WEAPON_CATS, WEAPON_ORDER, itemLevel, armorBaseName, rewardAt } from './data.js';
import { GEM_GRADES, GRADE_COMMON, rollGrade, rollEffects, rollArmorEffects } from './gems.js';

// stat rolls by grade (일반 … 신화), multiplied by levelMul(item level)
export const WEAPON_ROLLS = [[10, 16], [16, 24], [24, 34], [34, 46], [46, 60]];
export const ARMOR_HP_ROLLS = [[60, 90], [90, 125], [125, 165], [165, 210], [210, 260]];
export const ARMOR_DEF_ROLLS = [[16, 20], [20, 24], [24, 28], [28, 32], [32, 36]]; // tenths per level
const SELL = [30, 90, 220, 600, 1500];
export const ELITE_EQUIP_CHANCE = 0.5; // a 대장 drops a weapon or armor this often; world bosses drop both

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// 일반 = stats only; higher grades add bonus effects by the same rules as gems:
// attack effects on weapons, defensive ones (ARMOR_STATS) on armor. Both have 3 gem sockets.
export function makeWeapon(id, cat, grade, lv) {
  return { id, cat, g: grade, lv, up: 0, roll: randInt(...WEAPON_ROLLS[grade]), fx: grade === GRADE_COMMON ? [] : rollEffects(grade), sockets: [0, 0, 0] };
}

export function makeArmor(id, grade, lv) {
  return {
    id, g: grade, lv, up: 0, hpRoll: randInt(...ARMOR_HP_ROLLS[grade]), defRoll: randInt(...ARMOR_DEF_ROLLS[grade]),
    fx: grade === GRADE_COMMON ? [] : rollArmorEffects(grade), sockets: [0, 0, 0],
  };
}

export const starterWeapon = id => ({ id, cat: 'sword', g: GRADE_COMMON, lv: 1, up: 0, roll: 12, fx: [], sockets: [0, 0, 0] });
export const starterArmor = id => ({ id, g: GRADE_COMMON, lv: 1, up: 0, hpRoll: 70, defRoll: 18, fx: [], sockets: [0, 0, 0] });

export function rollWeapon(save, stage, worldBoss) {
  return makeWeapon(save.nextWeaponId++, pick(WEAPON_ORDER), rollGrade(stage.lootWorld, worldBoss), stage.itemLevel);
}

export function rollArmor(save, stage, worldBoss) {
  return makeArmor(save.nextArmorId++, rollGrade(stage.lootWorld, worldBoss), stage.itemLevel);
}

// What a stage-end boss leaves: world bosses one of each, 대장 monsters sometimes one of them.
export function rollEquipment(save, stage, worldBoss) {
  if (worldBoss) return [rollWeapon(save, stage, true), rollArmor(save, stage, true)];
  if (Math.random() >= ELITE_EQUIP_CHANCE) return [];
  return [Math.random() < 0.5 ? rollWeapon(save, stage, false) : rollArmor(save, stage, false)];
}

export const isWeapon = it => 'cat' in it;
export const itemIcon = it => (isWeapon(it) ? WEAPON_CATS[it.cat].icon : '🛡️');
export const itemName = it => `${GEM_GRADES[it.g].name} ${isWeapon(it) ? WEAPON_CATS[it.cat].name : armorBaseName(it)}`;
export const upText = it => (it.up > 0 ? ` +${it.up}` : '');
export const levelText = it => `Lv ${itemLevel(it)}`;
export const sellPrice = it => Math.round(SELL[it.g] * rewardAt(it.lv - 1) / 3);
