// Keyboard input. Uses KeyboardEvent.code so keys keep working when the
// iPad's input language is Korean; falls back to e.key (incl. 두벌식 jamo).

const JAMO = {
  'ㅂ': 'KeyQ', 'ㅃ': 'KeyQ', 'ㅈ': 'KeyW', 'ㅉ': 'KeyW', 'ㄷ': 'KeyE', 'ㄸ': 'KeyE', 'ㄱ': 'KeyR', 'ㄲ': 'KeyR',
  'ㅅ': 'KeyT', 'ㅆ': 'KeyT', 'ㅛ': 'KeyY', 'ㅕ': 'KeyU', 'ㅑ': 'KeyI', 'ㅐ': 'KeyO', 'ㅒ': 'KeyO', 'ㅔ': 'KeyP', 'ㅖ': 'KeyP',
  'ㅁ': 'KeyA', 'ㄴ': 'KeyS', 'ㅇ': 'KeyD', 'ㄹ': 'KeyF', 'ㅎ': 'KeyG', 'ㅗ': 'KeyH', 'ㅓ': 'KeyJ', 'ㅏ': 'KeyK', 'ㅣ': 'KeyL',
  'ㅋ': 'KeyZ', 'ㅌ': 'KeyX', 'ㅊ': 'KeyC', 'ㅍ': 'KeyV', 'ㅠ': 'KeyB', 'ㅜ': 'KeyN', 'ㅡ': 'KeyM',
};
const KEY_ALIASES = {
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  Esc: 'Escape', Spacebar: 'Space', ' ': 'Space',
};

export function codeOf(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  const k = e.key || '';
  if (JAMO[k]) return JAMO[k];
  if (KEY_ALIASES[k]) return KEY_ALIASES[k];
  if (k.length === 1) {
    const u = k.toUpperCase();
    if (u >= 'A' && u <= 'Z') return 'Key' + u;
    if (u >= '0' && u <= '9') return 'Digit' + u;
  }
  return k;
}

const held = new Set();
const pressed = new Set(); // went down since the last endFrame()
const listeners = new Set();
const axis = { x: 0, y: 0 }; // analog direction from the touch joystick, length 0..1

function emit(code, repeat) {
  for (const fn of [...listeners]) fn(code, repeat);
}

export const input = {
  isDown: code => held.has(code),
  wasPressed: code => pressed.has(code),
  endFrame() { pressed.clear(); },
  clear() { held.clear(); pressed.clear(); axis.x = axis.y = 0; },
  onPress(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  axis: () => axis,
  setAxis(x, y) { axis.x = x; axis.y = y; },

  // Virtual key presses: on-screen touch buttons and the automated smoke test.
  simulateDown(code) {
    if (!held.has(code)) { held.add(code); pressed.add(code); emit(code, false); }
  },
  simulateUp(code) { held.delete(code); },
};

export function initInput() {
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave system shortcuts alone
    e.preventDefault();
    const code = codeOf(e);
    if (!e.repeat && !held.has(code)) pressed.add(code);
    held.add(code);
    emit(code, e.repeat);
  });
  window.addEventListener('keyup', e => { held.delete(codeOf(e)); });
  window.addEventListener('blur', () => input.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.clear(); });
}
