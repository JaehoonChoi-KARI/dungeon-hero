// DOM heads-up display shown during battle.

import { SKILLS, SKILL_ORDER, skillParams, xpNeed, MAX_LEVEL, fmtNum } from './data.js';

export function createHud(root, { onPause }) {
  root.innerHTML = `
    <div class="joy-zone"><div class="joy-base"><div class="joy-knob"></div></div></div>
    <div class="hud-player glass">
      <div class="hud-row"><span class="hud-lv"></span><span class="hud-gold"></span></div>
      <div class="bar hp"><i></i><span></span></div>
      <div class="bar xp"><i></i><span></span></div>
    </div>
    <div class="hud-stage glass">
      <div class="hud-stage-title"></div>
      <div class="bar prog"><i></i><span></span></div>
    </div>
    <div class="hud-hint hidden"></div>
    <div class="hud-toast hidden"></div>
    <div class="hud-skills">
      ${SKILL_ORDER.map(id => `
        <div class="skill ${id === 'atk' ? 'wide' : ''}" data-id="${id}">
          <div class="ico">${SKILLS[id].icon}</div>
          <div class="cd"></div>
          <div class="cdt"></div>
          <div class="lock">🔒 Lv ${SKILLS[id].unlock}</div>
          <span class="kc">${SKILLS[id].label}</span>
        </div>`).join('')}
    </div>
    <div class="hud-help"><span class="kc">Esc</span> 또는 <span class="kc">P</span> 일시정지</div>
    <button class="hud-pause" type="button" aria-label="일시정지">⏸</button>`;

  const $ = sel => root.querySelector(sel);
  $('.hud-pause').addEventListener('click', () => onPause());
  const el = {
    lv: $('.hud-lv'), gold: $('.hud-gold'),
    hpFill: $('.bar.hp i'), hpText: $('.bar.hp span'),
    xpFill: $('.bar.xp i'), xpText: $('.bar.xp span'),
    stageTitle: $('.hud-stage-title'), stage: $('.hud-stage'),
    progFill: $('.bar.prog i'), progText: $('.bar.prog span'),
    hint: $('.hud-hint'), toast: $('.hud-toast'),
    skills: Object.fromEntries(SKILL_ORDER.map(id => {
      const s = root.querySelector(`.skill[data-id="${id}"]`);
      return [id, { root: s, cd: s.querySelector('.cd'), cdt: s.querySelector('.cdt') }];
    })),
  };
  const last = {};
  const set = (key, value, apply) => {
    if (last[key] === value) return;
    last[key] = value;
    apply(value);
  };

  return {
    show() { root.classList.remove('hidden'); },
    hide() { root.classList.add('hidden'); },
    update(b) {
      const s = b.save, p = b.player;
      set('lv', `Lv ${s.level}`, v => (el.lv.textContent = v));
      set('gold', `💰 ${fmtNum(s.gold)}`, v => (el.gold.textContent = v));
      const hpPct = Math.max(0, p.hp / b.stats.maxHp) * 100;
      set('hpW', hpPct.toFixed(1), v => (el.hpFill.style.width = v + '%'));
      set('hpT', `${Math.ceil(Math.max(0, p.hp))} / ${b.stats.maxHp}`, v => (el.hpText.textContent = v));
      const need = xpNeed(s.level);
      const max = s.level >= MAX_LEVEL;
      set('xpW', max ? '100' : ((s.xp / need) * 100).toFixed(1), v => (el.xpFill.style.width = v + '%'));
      set('xpT', max ? 'MAX' : `EXP ${fmtNum(s.xp)} / ${fmtNum(need)}`, v => (el.xpText.textContent = v));

      let title, prog, progText, bossMode;
      const boss = b.boss && !b.boss.dead ? b.boss : null;
      if (boss) {
        title = `${boss.kind === 'boss' ? '👑' : '⭐'} ${boss.name}`;
        prog = boss.hp / boss.maxHp;
        progText = `${fmtNum(Math.max(0, boss.hp))} / ${fmtNum(boss.maxHp)}`;
        bossMode = true;
      } else {
        title = `${b.stage.label}  ${b.world.name}`;
        const goal = b.stage.killGoal;
        prog = Math.min(1, b.kills / goal);
        progText = b.state === 'clear' ? '클리어!' : b.kills >= goal ? '대장 몬스터가 와요!' : `몬스터 ${b.kills} / ${goal}`;
        bossMode = false;
      }
      set('title', title, v => (el.stageTitle.textContent = v));
      set('prog', (prog * 100).toFixed(1), v => (el.progFill.style.width = v + '%'));
      set('progT', progText, v => (el.progText.textContent = v));
      set('bossMode', bossMode, v => el.stage.classList.toggle('boss', v));

      for (const id of SKILL_ORDER) {
        const lv = s.skills[id];
        const sk = el.skills[id];
        set('lock' + id, lv <= 0, v => sk.root.classList.toggle('locked', v));
        if (lv <= 0) continue;
        const cd = Math.max(0, p.cds[id]);
        const frac = cd > 0 ? Math.min(1, cd / skillParams(id, lv).cd) : 0;
        set('cd' + id, frac.toFixed(3), v => (sk.cd.style.transform = `scaleY(${v})`));
        set('cdt' + id, id !== 'atk' && cd > 0.05 ? String(Math.ceil(cd)) : '', v => (sk.cdt.textContent = v));
        set('ready' + id, cd <= 0, v => sk.root.classList.toggle('ready', v));
      }

      const hint = b.tutorialHint();
      const hintHtml = hint ? `${hint.keys.map(k => `<span class="kc">${k}</span>`).join('')} <b>${hint.text}</b>` : '';
      set('hint', hintHtml, v => {
        el.hint.innerHTML = v;
        el.hint.classList.toggle('hidden', !v);
      });
      set('toast', b.toast ? b.toast.text : '', v => {
        el.toast.textContent = v;
        el.toast.classList.toggle('hidden', !v);
      });
    },
  };
}
