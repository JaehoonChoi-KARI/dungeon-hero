// DOM heads-up display shown during battle.

import { SKILLS, SKILL_ORDER, WEAPON_CATS, POTIONS, POTION_ORDER, BUFFS, BUFF_ORDER, xpNeed, MAX_LEVEL, fmtNum } from './data.js';

export function createHud(root, { onPause }) {
  root.innerHTML = `
    <div class="joy-zone"><div class="joy-base"><div class="joy-knob"></div></div></div>
    <div class="hud-player glass">
      <div class="hud-row"><span class="hud-lv"></span><span class="hud-gold"></span></div>
      <div class="bar hp"><i></i><span></span></div>
      <div class="bar xp"><i></i><span></span></div>
      <div class="bar res"><i></i><span></span></div>
      <div class="hud-buffs"></div>
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
    <div class="hud-potions">
      ${POTION_ORDER.map(id => `
        <div class="potion" data-p="${id}">
          <div class="ico">${POTIONS[id].icon}</div>
          <span class="cnt"></span>
          <div class="ptime"></div>
          <span class="kc">${POTIONS[id].label}</span>
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
    res: $('.bar.res'), resFill: $('.bar.res i'), resText: $('.bar.res span'),
    stageTitle: $('.hud-stage-title'), stage: $('.hud-stage'),
    progFill: $('.bar.prog i'), progText: $('.bar.prog span'),
    hint: $('.hud-hint'), toast: $('.hud-toast'), buffs: $('.hud-buffs'),
    skills: Object.fromEntries(SKILL_ORDER.map(id => {
      const s = root.querySelector(`.skill[data-id="${id}"]`);
      return [id, { root: s, cd: s.querySelector('.cd'), cdt: s.querySelector('.cdt') }];
    })),
    potions: Object.fromEntries(POTION_ORDER.map(id => {
      const p = root.querySelector(`.potion[data-p="${id}"]`);
      return [id, { root: p, cnt: p.querySelector('.cnt'), ptime: p.querySelector('.ptime') }];
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

      const r = b.res; // stamina / arrows / mana
      set('resColor', r.def.color, v => el.res.style.setProperty('--rc', v));
      set('resW', ((r.cur / r.max) * 100).toFixed(1), v => (el.resFill.style.width = v + '%'));
      const count = r.def.count ? ` ${Math.floor(r.cur)} / ${r.max}` : '';
      set('resT', `${r.def.icon} ${r.def.name}${count}${r.empty ? ' · 손을 떼면 채워져요' : ''}`, v => (el.resText.textContent = v));
      set('resEmpty', r.empty, v => el.res.classList.toggle('empty', v));

      let title, prog, progText, bossMode;
      const boss = b.boss && !b.boss.dead ? b.boss : null;
      if (boss) {
        title = `${boss.kind === 'boss' ? '👑' : '⭐'} ${boss.name}`;
        prog = boss.hp / boss.maxHp;
        progText = `${fmtNum(Math.max(0, boss.hp))} / ${fmtNum(boss.maxHp)}`;
        bossMode = true;
      } else {
        title = `${b.stage.fullLabel}  ${b.world.name}`;
        const goal = b.stage.killGoal;
        prog = Math.min(1, b.kills / goal);
        progText = b.state === 'clear' ? '클리어!' : b.kills >= goal ? '대장 몬스터가 와요!' : `몬스터 ${b.kills} / ${goal}`;
        bossMode = false;
      }
      set('title', title, v => (el.stageTitle.textContent = v));
      set('prog', (prog * 100).toFixed(1), v => (el.progFill.style.width = v + '%'));
      set('progT', progText, v => (el.progText.textContent = v));
      set('bossMode', bossMode, v => el.stage.classList.toggle('boss', v));

      set('atkIcon', WEAPON_CATS[b.weapon.cat].icon, v => (el.skills.atk.root.querySelector('.ico').textContent = v));
      for (const id of SKILL_ORDER) {
        const lv = s.skills[id];
        const sk = el.skills[id];
        set('lock' + id, lv <= 0, v => sk.root.classList.toggle('locked', v));
        if (lv <= 0) continue;
        const cd = Math.max(0, p.cds[id]);
        const frac = cd > 0 ? Math.min(1, cd / b.skill(id).cd) : 0;
        set('cd' + id, frac.toFixed(3), v => (sk.cd.style.transform = `scaleY(${v})`));
        set('cdt' + id, id !== 'atk' && cd > 0.05 ? String(Math.ceil(cd)) : '', v => (sk.cdt.textContent = v));
        set('ready' + id, cd <= 0, v => sk.root.classList.toggle('ready', v));
      }

      for (const id of POTION_ORDER) {
        const po = el.potions[id], n = s.potions[id];
        set('pc' + id, String(n), v => (po.cnt.textContent = v));
        set('pe' + id, n <= 0, v => po.root.classList.toggle('empty', v));
      }
      const buffs = BUFF_ORDER.filter(k => b.buffs[k] > 0)
        .map(k => `<span class="buff" style="--bc:${BUFFS[k].color}">${BUFFS[k].icon} ${Math.ceil(b.buffs[k])}</span>`).join('');
      set('buffs', buffs, v => (el.buffs.innerHTML = v));
      set('power', b.powerT > 0 ? String(Math.ceil(b.powerT)) : '', v => {
        el.potions.atk.ptime.textContent = v;
        el.potions.atk.root.classList.toggle('active', !!v);
      });

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
