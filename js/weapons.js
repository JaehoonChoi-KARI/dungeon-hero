// Main weapon items. Space attacks with the equipped one; its type decides how (see WEAPON_CATS).
// Like gems they roll a grade, a random attack value and bonus effects, and carry 3 gem sockets.
// Enhancement (up) is per weapon: a new weapon starts again from +0.

import { WEAPON_CATS, WEAPON_ORDER, weaponUpCost, TRANSCEND_FROM } from './data.js';
import { GEM_GRADES, GRADE_COMMON, rollGrade, rollEffects } from './gems.js';

// attack at item level 1 by grade; later stages drop stronger weapons (weaponLevelMul)
const ATK_RANGES = [[4, 7], [7, 11], [11, 16], [16, 22], [22, 30]];
const SELL = [30, 90, 220, 600, 1500];
export const ELITE_WEAPON_CHANCE = 0.35; // world bosses always drop one

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const weaponLevelMul = lv => 1 + 0.12 * (lv - 1);

// 일반 = attack only; higher grades add bonus effects by the same rules as gems.
export function makeWeapon(id, cat, grade, lv) {
  const atk = Math.round(randInt(...ATK_RANGES[grade]) * weaponLevelMul(lv));
  const fx = grade === GRADE_COMMON ? [] : rollEffects(grade);
  return { id, cat, g: grade, lv, atk, up: 0, fx, sockets: [0, 0, 0] };
}

export const starterWeapon = id => ({ id, cat: 'sword', g: GRADE_COMMON, lv: 1, atk: 5, up: 0, fx: [], sockets: [0, 0, 0] });

export function rollWeapon(save, stageIndex, worldBoss) {
  const world = Math.floor(stageIndex / 5);
  return makeWeapon(save.nextWeaponId++, pick(WEAPON_ORDER), rollGrade(world, worldBoss), stageIndex + 1);
}

export const weaponName = w => `${GEM_GRADES[w.g].name} ${WEAPON_CATS[w.cat].name}`;
export const weaponUpText = w => (w.up > TRANSCEND_FROM ? ` ✦+${w.up}` : w.up > 0 ? ` +${w.up}` : '');
export const weaponSellPrice = w => Math.round(SELL[w.g] * weaponLevelMul(w.lv));
export const nextUpCost = w => weaponUpCost(w.up);
