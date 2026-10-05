// Touch controls: a floating joystick on the left of the screen and
// tappable Space/Q/W/E/R buttons, fed into the same input system as the keyboard.

import { input } from './input.js';
import { SKILLS, POTIONS } from './data.js';

const JOY_R = 56; // how far the knob can travel, in CSS px

export function initTouchControls(hudRoot, game) {
  const zone = hudRoot.querySelector('.joy-zone');
  const base = hudRoot.querySelector('.joy-base');
  const knob = hudRoot.querySelector('.joy-knob');
  let joyId = null, ox = 0, oy = 0;

  const resetJoy = () => {
    joyId = null;
    input.setAxis(0, 0);
    knob.style.transform = '';
    base.classList.remove('active');
    base.style.left = base.style.top = ''; // back to its resting spot from CSS
  };

  zone.addEventListener('pointerdown', e => {
    if (game.inputMode !== 'touch' || joyId !== null) return;
    e.preventDefault();
    joyId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic events in tests */ }
    ox = e.clientX;
    oy = e.clientY;
    base.style.left = ox + 'px';
    base.style.top = oy + 'px';
    base.classList.add('active');
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.setAxis(dx / JOY_R, dy / JOY_R);
  });
  const endJoy = e => { if (e.pointerId === joyId) resetJoy(); };
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);
  zone.addEventListener('lostpointercapture', endJoy);

  // Skill and potion buttons act like holding the matching key (Space can be held to keep attacking).
  for (const slot of hudRoot.querySelectorAll('.skill, .potion')) {
    const code = slot.dataset.id ? SKILLS[slot.dataset.id].code : POTIONS[slot.dataset.p].code;
    let pid = null;
    slot.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (pid !== null) return;
      pid = e.pointerId;
      try { slot.setPointerCapture(e.pointerId); } catch { /* synthetic events in tests */ }
      slot.classList.add('pressed');
      input.simulateDown(code);
    });
    const up = e => {
      if (e.pointerId !== pid) return;
      pid = null;
      slot.classList.remove('pressed');
      input.simulateUp(code);
    };
    slot.addEventListener('pointerup', up);
    slot.addEventListener('pointercancel', up);
    slot.addEventListener('lostpointercapture', up);
  }

  return { reset: resetJoy };
}
