// The player character, drawn with canvas shapes so gear upgrades change its look.

import { gearTier, ARMOR_COLORS, WEAPON_COLORS } from './data.js';

const TAU = Math.PI * 2;
const OUTLINE = '#1d1b2e';
const SKIN = '#ffd9b8';
const HAIR = '#6b4226';

export const SWING_TIME = 0.16;
export const SPIN_TIME = 0.32;

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

export function swordAngle(p) {
  if (p.spin > 0) return p.faceAngle + (1 - p.spin / SPIN_TIME) * TAU * 1.5;
  if (p.swing > 0) return p.swingAngle - 1.4 + (1 - p.swing / SWING_TIME) * 2.8;
  return p.faceAngle + 0.5;
}

function drawSword(ctx, x, y, angle, tier) {
  const len = 28 + tier * 3;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (tier >= 4) {
    ctx.shadowColor = WEAPON_COLORS[tier];
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(-8, -2.5, 10, 5);
  ctx.fillStyle = '#e0b84a';
  ctx.fillRect(1, -7, 4, 14);
  ctx.fillStyle = WEAPON_COLORS[tier];
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(5, -3.5);
  ctx.lineTo(5 + len, -3.5);
  ctx.lineTo(12 + len, 0);
  ctx.lineTo(5 + len, 3.5);
  ctx.lineTo(5, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(7, -2, len - 4, 1.4);
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
export function drawHero(ctx, p, gear, time) {
  const at = gearTier(gear.armor);
  const wt = gearTier(gear.weapon);
  const x = p.x, y = p.y;
  const fx = p.face.x, fy = p.face.y;
  const back = fy < -0.3;
  const bob = p.moving ? Math.abs(Math.sin(p.walkT * 14)) : 0;
  const step = p.moving ? Math.sin(p.walkT * 14) : 0;

  ctx.save();
  if (p.inv > 0 && !p.dash && Math.floor(time * 18) % 2 === 0) ctx.globalAlpha = 0.45;

  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ellipse(ctx, x, y + 22, 17, 6);

  const ang = swordAngle(p);
  const hx = x + Math.cos(ang) * 14;
  const hy = y + 6 + Math.sin(ang) * 8;
  if (back) drawSword(ctx, hx, hy, ang, wt);
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
  if (at >= 2 && !back) {
    ctx.fillStyle = at >= 5 ? '#ffd54f' : 'rgba(255,255,255,.6)';
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
  if (!back) drawSword(ctx, hx, hy, ang, wt);
  ctx.restore();
}

// Draws the hero standing, scaled to fit a portrait canvas (town, smithy, icon).
export function drawPortrait(canvas, gear, { bg = null } = {}) {
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
  p.faceAngle = -0.6; // hold the sword up and to the right
  drawHero(ctx, p, gear, 0);
}
