// An on-screen keyboard that shows where the game's keys are.

// [code, label, width-in-key-units]; null code = empty spacer
const ROWS = [
  [['Escape', 'Esc'], ...'1234567890'.split('').map(d => ['Digit' + d, d]), ['Minus', '-'], ['Equal', '='], ['Backspace', '⌫', 2]],
  [['Tab', 'Tab', 1.5], ...'QWERTYUIOP'.split('').map(c => ['Key' + c, c]), ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\', 1.5]],
  [['CapsLock', 'Caps', 1.75], ...'ASDFGHJKL'.split('').map(c => ['Key' + c, c]), ['Semicolon', ';'], ['Quote', "'"], ['Enter', 'Enter', 2.25]],
  [['ShiftLeft', 'Shift', 2.25], ...'ZXCVBNM'.split('').map(c => ['Key' + c, c]), ['Comma', ','], ['Period', '.'], ['Slash', '/'], ['ShiftRight', 'Shift', 2.75]],
];

export const GAME_KEY_ROLES = {
  ArrowUp: 'move', ArrowDown: 'move', ArrowLeft: 'move', ArrowRight: 'move',
  Space: 'atk',
  KeyQ: 'skill', KeyW: 'skill', KeyE: 'skill', KeyR: 'skill',
  Escape: 'sys', Enter: 'ok',
};

export const KEY_NAMES = {
  ArrowUp: '위쪽 화살표 ↑', ArrowDown: '아래쪽 화살표 ↓', ArrowLeft: '왼쪽 화살표 ←', ArrowRight: '오른쪽 화살표 →',
  Space: '스페이스바', Enter: '엔터', Escape: 'Esc', Backspace: '백스페이스', Tab: '탭', CapsLock: 'Caps Lock',
  ShiftLeft: '왼쪽 Shift', ShiftRight: '오른쪽 Shift',
};

export function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function keyEl(code, label, units, roles) {
  const k = document.createElement('div');
  k.className = 'kb-key';
  k.style.flexGrow = units;
  k.textContent = label;
  if (roles[code]) k.classList.add('role-' + roles[code]);
  if (label.length > 2) k.classList.add('small');
  return k;
}

export function createKeyboard({ compact = false, roles = GAME_KEY_ROLES, onTap = null } = {}) {
  const el = document.createElement('div');
  el.className = 'kb' + (compact ? ' compact' : '') + (onTap ? ' tappable' : '');
  const keys = new Map();
  const add = (parent, code, label, units = 1) => {
    const k = keyEl(code, label, units, roles);
    if (onTap) {
      k.addEventListener('pointerdown', e => {
        e.preventDefault();
        onTap(code);
      });
    }
    parent.appendChild(k);
    keys.set(code, k);
    return k;
  };

  for (const row of ROWS) {
    const r = document.createElement('div');
    r.className = 'kb-row';
    for (const [code, label, units] of row) add(r, code, label, units);
    el.appendChild(r);
  }

  // bottom row: space bar + inverted-T arrow cluster (Apple keyboard style)
  const last = document.createElement('div');
  last.className = 'kb-row';
  const spacer = units => {
    const s = document.createElement('div');
    s.className = 'kb-spacer';
    s.style.flexGrow = units;
    last.appendChild(s);
  };
  spacer(3.5);
  add(last, 'Space', 'Space', 6);
  spacer(1.5);
  const arrows = document.createElement('div');
  arrows.className = 'kb-arrows';
  arrows.style.flexGrow = 3;
  add(arrows, 'ArrowLeft', '←');
  const mid = document.createElement('div');
  mid.className = 'kb-arrows-mid';
  add(mid, 'ArrowUp', '↑');
  add(mid, 'ArrowDown', '↓');
  arrows.appendChild(mid);
  add(arrows, 'ArrowRight', '→');
  last.appendChild(arrows);
  spacer(1);
  el.appendChild(last);

  return {
    el,
    has: code => keys.has(code),
    flash(code, cls = 'hit') {
      const k = keys.get(code);
      if (!k) return;
      k.classList.remove(cls);
      void k.offsetWidth; // restart the CSS animation
      k.classList.add(cls);
    },
    setTarget(code) {
      for (const k of keys.values()) k.classList.remove('target');
      if (code && keys.has(code)) keys.get(code).classList.add('target');
    },
  };
}
