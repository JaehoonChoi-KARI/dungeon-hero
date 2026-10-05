// Boot, main loop and screen/battle switching.

import { initInput, input } from './input.js';
import { unlockAudio, setSoundEnabled } from './audio.js';
import { defaultSave, loadSlot, writeSlot, loadPrefs, writePrefs, defaultPrefs, migrateLegacySave, useTestStorage } from './save.js';
import { Battle } from './battle.js';
import { createHud } from './hud.js';
import { initTouchControls } from './touch.js';
import { SCREENS, skillIntroPopup } from './screens.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const uiRoot = document.getElementById('ui');
const overlayRoot = document.getElementById('overlay');
const hudRoot = document.getElementById('hud');
const hud = createHud(hudRoot, { onPause: () => game.pause() });

const params = new URLSearchParams(location.search);
const testMode = params.has('autotest') || params.has('shot');
if (testMode) useTestStorage();
else migrateLegacySave();

const view = { w: 0, h: 0, zoom: 1, dpr: 1 };
function resize() {
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  // iPad and up: ~720 world units tall. Phones zoom in a bit more so monsters aren't tiny.
  view.zoom = Math.max(Math.min(view.h / 720, view.w / 960), Math.min(view.h / 560, view.w / 1100));
}

const game = {
  prefs: testMode ? defaultPrefs() : loadPrefs(),
  slot: null, // 1..3 once a save slot is chosen
  save: defaultSave(),
  battle: null,
  paused: false,
  screen: null,
  screenName: '',
  popup: null,
  popupQueue: [],
  townIndex: 0,
  testGod: false,
  inputMode: 'keyboard',

  persist() {
    if (!testMode && this.slot) writeSlot(this.slot, this.save);
  },

  savePrefs() {
    if (!testMode) writePrefs(this.prefs);
  },

  // Continue the slot's save, or start a new game if the slot is empty.
  openSlot(n) {
    const existing = loadSlot(n);
    this.slot = n;
    this.save = existing || defaultSave();
    this.townIndex = 0;
    this.prefs.lastSlot = n;
    this.savePrefs();
    this.persist();
    const firstTime = !this.save.tutorialDone && this.save.cleared < 0;
    if (!firstTime) this.show('town');
    else if (this.inputMode === 'touch') this.startStage(0); // the in-battle hints explain touch controls
    else this.show('guide', { first: true });
  },

  // Save and go back to the title (the closest thing a web app has to quitting).
  exitToTitle() {
    this.persist();
    this.slot = null;
    this.save = defaultSave();
    this.show('title');
  },

  // Switches between keyboard and touch layouts; called on every real key press / screen touch.
  setInputMode(mode) {
    if (this.inputMode === mode) return;
    this.inputMode = mode;
    document.body.classList.toggle('touch-mode', mode === 'touch');
    this.prefs.inputMode = mode;
    this.savePrefs();
  },

  show(name, arg) {
    this.hideScreen();
    const scr = SCREENS[name](this, arg);
    this.screen = scr;
    this.screenName = name;
    uiRoot.appendChild(scr.el);
    scr.el.querySelector('.back-btn')?.addEventListener('click', () => scr.onKey('Escape', false));
    scr.mount?.();
  },

  hideScreen() {
    if (this.screen) this.screen.el.remove();
    this.screen = null;
    this.screenName = '';
  },

  startStage(i) {
    this.hideScreen();
    this.clearPopups();
    this.battle = new Battle(this, i);
    this.paused = false;
    input.clear();
    hud.show();
  },

  pause() {
    if (!this.battle || this.battle.state !== 'play' || this.paused) return;
    this.paused = true;
    this.persist();
    this.show('pause');
  },

  resume() {
    this.hideScreen();
    this.paused = false;
    input.clear();
  },

  endBattle() {
    this.battle = null;
    this.paused = false;
    hud.hide();
    this.clearPopups();
    this.persist();
  },

  quitToTown() {
    this.endBattle();
    this.show('town');
  },

  onBattleEnd(result) {
    this.endBattle();
    this.show('result', result);
  },

  showSkillIntro(id) {
    this.popupQueue.push(id);
    if (!this.popup) this.nextPopup();
  },

  nextPopup() {
    overlayRoot.innerHTML = '';
    this.popup = null;
    const id = this.popupQueue.shift();
    if (!id) return;
    this.popup = skillIntroPopup(this, id);
    overlayRoot.appendChild(this.popup.el);
  },

  closePopup() { this.nextPopup(); },

  clearPopups() {
    this.popupQueue = [];
    this.popup = null;
    overlayRoot.innerHTML = '';
  },

  setSound(on) {
    this.prefs.sound = on;
    setSoundEnabled(on);
    this.savePrefs();
  },
};

input.onPress((code, repeat) => {
  unlockAudio();
  if (game.popup) {
    game.popup.onKey(code, repeat);
    return;
  }
  if (game.battle && !game.paused) {
    if (!repeat && (code === 'Escape' || code === 'KeyP' || code === 'Backspace')) game.pause();
    return;
  }
  game.screen?.onKey?.(code, repeat);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const b = game.battle;
  if (b) {
    if (!game.paused && !game.popup) b.update(dt);
    if (game.battle === b) {
      b.render(ctx, view);
      hud.update(b);
    }
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

function boot() {
  resize();
  window.addEventListener('resize', resize);
  initInput();
  initTouchControls(hudRoot, game);
  const startMode = params.has('touch') ? 'touch' : game.prefs.inputMode;
  game.inputMode = startMode;
  document.body.classList.toggle('touch-mode', startMode === 'touch');
  window.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') game.setInputMode('touch');
  }, true);
  window.addEventListener('keydown', e => {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) game.setInputMode('keyboard');
  }, true);
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('touchend', unlockAudio, { passive: true });
  window.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.pause();
      game.persist();
    }
  });
  setSoundEnabled(game.prefs.sound);

  if (testMode) {
    import('./autotest.js').then(m => m.run({ game, input, view, ctx, hud, params }));
  } else {
    game.show('title');
    try { navigator.storage?.persist?.(); } catch { /* best effort */ }
    const secure = location.protocol === 'https:' || location.hostname === 'localhost';
    if ('serviceWorker' in navigator && secure) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  requestAnimationFrame(frame);
}

boot();
