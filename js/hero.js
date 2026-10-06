// The player character, drawn with canvas shapes so gear upgrades change its look.

import { ARMOR_COLORS, armorBand, itemLevel } from './data.js';
import { GEM_GRADES } from './gems.js';

const TAU = Math.PI * 2;
const OUTLINE = '#1d1b2e';
const SKIN = '#ffd9b8';
const HAIR = '#6b4226';

export const SWING_TIME = 0.16;

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SWINGS = new Set(['dagger', 'sword', 'hammer']); // these swing; spear thrusts; bow/staff aim

export function weaponAngle(p, cat) {
  if (p.spin > 0) return p.faceAngle + (p.spinT || 0) * TAU * 3; // Q: 1.5 turns every 0.5s
  if (p.swing > 0 && SWINGS.has(cat)) return p.swingAngle - 1.4 + (1 - p.swing / SWING_TIME) * 2.8;
  if (SWINGS.has(cat)) return p.faceAngle + 0.5;
  return p.faceAngle;
}

const WOOD = '#7a4b25';
const STEEL = '#cfd6e0';

function blade(ctx, from, len, half, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(from, -half);
  ctx.lineTo(from + len, -half);
  ctx.lineTo(from + len + half * 2, 0);
  ctx.lineTo(from + len, half);
  ctx.lineTo(from, half);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Drawn pointing along +x from the hand. Grade sets the accent color; 전설 and 신화 glow.
function drawWeapon(ctx, x, y, angle, weapon, extend = 0) {
  const cat = weapon ? weapon.cat : 'sword';
  const color = GEM_GRADES[weapon ? weapon.g : 0].color;
  const glow = weapon && weapon.g >= 3;
  ctx.save();
  ctx.translate(x + Math.cos(angle) * extend, y + Math.sin(angle) * extend);
  ctx.rotate(angle);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }
  switch (cat) {
    case 'dagger':
      ctx.fillStyle = '#5b3a1e';
      ctx.fillRect(-6, -2.5, 8, 5);
      ctx.fillStyle = color;
      ctx.fillRect(1, -5, 3, 10);
      blade(ctx, 4, 12, 3, STEEL);
      break;
    case 'hammer':
      ctx.fillStyle = WOOD;
      ctx.fillRect(-8, -2.5, 36, 5);
      ctx.fillStyle = '#9aa4ae';
      ctx.fillRect(24, -11, 14, 22);
      ctx.strokeRect(24, -11, 14, 22);
      ctx.fillStyle = color;
      ctx.fillRect(28, -11, 5, 22);
      break;
    case 'spear':
      ctx.fillStyle = WOOD;
      ctx.fillRect(-14, -2, 54, 4);
      ctx.fillStyle = color;
      ctx.fillRect(36, -4, 4, 8);
      blade(ctx, 40, 8, 4.5, STEEL);
      break;
    case 'bow':
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(-6, 0, 20, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6 + 20 * Math.cos(-1.1), 20 * Math.sin(-1.1));
      ctx.lineTo(-6 + 20 * Math.cos(1.1), 20 * Math.sin(1.1));
      ctx.stroke();
      break;
    case 'staff':
      ctx.fillStyle = WOOD;
      ctx.fillRect(-12, -2, 42, 4);
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(33, 0, 6.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      break;
    default: // sword
      ctx.fillStyle = '#5b3a1e';
      ctx.fillRect(-8, -2.5, 10, 5);
      ctx.fillStyle = color;
      ctx.fillRect(1, -7, 4, 14);
      blade(ctx, 5, 30, 3.5, STEEL);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(7, -2, 26, 1.4);
  }
  ctx.restore();
}

function drawCape(ctx, x, y, fx, tier) {
  ctx.fillStyle = tier >= 5 ? '#ffca28' : '#c62828';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 12, y - 6);
  ctx.lineTo(x + 12, y - 6);
  ctx.lineTo(x + 16 - fx * 5, y + 20);
  ctx.lineTo(x - 16 - fx * 5, y + 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// p: { x, y, face:{x,y}, faceAngle, moving, walkT, inv, swing, swingAngle, spin, dash }
// armor / weapon: the equipped items (armor level band and grades change how the hero looks)
export function drawHero(ctx, p, armor, time, weapon) {
  const at = armor ? armorBand(itemLevel(armor)) : 0;
  const emblem = armor ? GEM_GRADES[armor.g].color : null;
  const cat = weapon ? weapon.cat : 'sword';
  const x = p.x, y = p.y;
  const fx = p.face.x, fy = p.face.y;
  const back = fy < -0.3;
  const bob = p.moving ? Math.abs(Math.sin(p.walkT * 14)) : 0;
  const step = p.moving ? Math.sin(p.walkT * 14) : 0;

  ctx.save();
  if (p.inv > 0 && !p.dash && Math.floor(time * 18) % 2 === 0) ctx.globalAlpha = 0.45;

  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ellipse(ctx, x, y + 22, 17, 6);

  const ang = weaponAngle(p, cat);
  const hx = x + Math.cos(ang) * 14;
  const hy = y + 6 + Math.sin(ang) * 8;
  // spear pokes forward and back while attacking
  const thrust = cat === 'spear' && p.swing > 0 ? Math.sin((1 - p.swing / SWING_TIME) * Math.PI) * 18 : 0;
  if (back) drawWeapon(ctx, hx, hy, ang, weapon, thrust);
  if (at >= 3 && !back) drawCape(ctx, x, y + bob, fx, at);

  // feet
  ctx.fillStyle = '#3b2f2f';
  ellipse(ctx, x - 7, y + 18 + step * 2, 5.5, 4);
  ellipse(ctx, x + 7, y + 18 - step * 2, 5.5, 4);

  // body
  const by = y - 8 + bob;
  ctx.fillStyle = ARMOR_COLORS[at];
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  roundRect(ctx, x - 14, by, 28, 26, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(x - 13, by + 16, 26, 4);
  if (emblem && !back) { // chest gem in the armor's grade color
    ctx.fillStyle = emblem;
    ctx.beginPath();
    ctx.arc(x, by + 9, 3.5, 0, TAU);
    ctx.fill();
  }

  // head
  const hy0 = y - 20 + bob * 0.6;
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, hy0, 14, 0, TAU);
  ctx.fill();
  ctx.stroke();

  const helmet = at >= 2;
  const capColor = helmet ? (at >= 4 ? ARMOR_COLORS[at] : '#9aa4ae') : HAIR;
  ctx.fillStyle = capColor;
  ctx.beginPath();
  if (back) {
    ctx.arc(x, hy0, 14, 0, TAU);
  } else {
    ctx.arc(x, hy0 - (helmet ? 1 : 2), helmet ? 15 : 14, Math.PI, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (helmet && !back) {
    ctx.fillRect(x - 16, hy0 - 3, 32, 4);
    ctx.strokeRect(x - 16, hy0 - 3, 32, 4);
  }
  if (at >= 3) { // plume
    ctx.fillStyle = at >= 5 ? '#ffd54f' : '#e53935';
    ctx.beginPath();
    ctx.ellipse(x, hy0 - 17, 4, 7, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  if (!back) {
    const ex = fx * 5, ey = fy * 2.5 + 3;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x - 5 + ex, hy0 + ey, 2.3, 0, TAU);
    ctx.arc(x + 5 + ex, hy0 + ey, 2.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,120,120,.35)';
    ctx.beginPath();
    ctx.arc(x - 8 + ex, hy0 + ey + 4, 2.6, 0, TAU);
    ctx.arc(x + 8 + ex, hy0 + ey + 4, 2.6, 0, TAU);
    ctx.fill();
  }

  if (at >= 3 && back) drawCape(ctx, x, y + bob, fx, at);
  if (!back) drawWeapon(ctx, hx, hy, ang, weapon, thrust);
  ctx.restore();
}

// Draws the hero standing, scaled to fit a portrait canvas (town, smithy, icon).
export function drawPortrait(canvas, armor, weapon, { bg = null } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const s = (Math.min(w, h) / 90) * dpr;
  ctx.setTransform(s, 0, 0, s, (canvas.width - 0) / 2, canvas.height / 2 + 4 * s);
  const p = { x: 0, y: 0, face: { x: 0, y: 1 }, faceAngle: Math.PI / 2, moving: false, walkT: 0, inv: 0, swing: 0, swingAngle: 0, spin: 0, dash: null };
  p.faceAngle = -0.6; // hold the weapon up and to the right
  drawHero(ctx, p, armor, 0, weapon);
}
