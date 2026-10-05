// Menu screens (DOM). Every screen is fully usable with arrow keys + Enter + Esc.

import { sfx } from './audio.js';
import {
  VERSION, WORLDS, MONSTERS, STAGE_COUNT, STAGES_PER_WORLD, SKILLS, SKILL_ORDER, PASSIVES, PASSIVE_ORDER, GEAR, GEAR_ORDER,
  stageInfo, computeStats, skillDesc, gearName, gearTier, xpNeed, MAX_LEVEL, fmtNum,
} from './data.js';
import { drawPortrait } from './hero.js';
import { createKeyboard, keyName, GAME_KEY_ROLES } from './keyboard-view.js';
import { input } from './input.js';
import { listSlots, deleteSlot } from './save.js';

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const kc = (label, cls = '') => `<span class="kc ${cls}">${label}</span>`;
const isBack = code => code === 'Escape' || code === 'Backspace';
const hintbar = parts => `<div class="hintbar">${parts.join('<i>·</i>')}</div>`;
// Tapping it sends Escape to the screen (wired up in game.show).
const backBtn = (label = '← 뒤로') => `<button class="back-btn" type="button">${label}</button>`;

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
function pulse(el, cls = 'flash') {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Arrow-key menu over a list of elements; also clickable/tappable.
// tapSelectsFirst: the first tap only selects (to read its info), a second tap activates.
function menu(items, { cols = 1, start = 0, onSelect, onChange, tapSelectsFirst = false }) {
  let idx = Math.max(0, Math.min(items.length - 1, start));
  const update = () => {
    items.forEach((el, i) => el.classList.toggle('sel', i === idx));
    items[idx]?.scrollIntoView?.({ block: 'nearest' });
    onChange?.(idx);
  };
  items.forEach((el, i) => el.addEventListener('click', () => {
    if (idx !== i) {
      idx = i;
      update();
      if (tapSelectsFirst) { sfx.select(); return; }
    }
    onSelect(i);
  }));
  update();
  return {
    get index() { return idx; },
    refresh: update,
    key(code) {
      let n = idx;
      if (code === 'Enter' || code === 'Space') { onSelect(idx); return true; }
      if (cols === 1) {
        if (code === 'ArrowDown') n = (idx + 1) % items.length;
        else if (code === 'ArrowUp') n = (idx - 1 + items.length) % items.length;
        else return false;
      } else {
        if (code === 'ArrowDown') n = idx + cols;
        else if (code === 'ArrowUp') n = idx - cols;
        else if (code === 'ArrowRight' && idx % cols < cols - 1) n = idx + 1;
        else if (code === 'ArrowLeft' && idx % cols > 0) n = idx - 1;
        else if (!code.startsWith('Arrow')) return false;
        if (n < 0 || n >= items.length) n = idx;
      }
      if (n !== idx) {
        idx = n;
        sfx.select();
        update();
      }
      return true;
    },
  };
}

function message(el, text, bad = false) {
  const m = el.querySelector('.msg');
  if (!m) return;
  m.textContent = text;
  m.classList.toggle('bad', bad);
  pulse(m, 'show');
}

// ---------------------------------------------------------------------------

function titleScreen(game) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  const el = h(`
    <div class="screen title-screen">
      <div class="title-float a">🐉</div><div class="title-float b">👻</div><div class="title-float c">🐺</div>
      <div class="title-box">
        <h1 class="logo"><span class="logo-ico">⚔️</span><span class="logo-text">던전 용사</span></h1>
        <p class="sub">몬스터를 물리치고 레벨업! 장비를 강화해서 더 강해지자!</p>
        <div class="press"><span class="kbd-only">${kc('Enter', 'big')} 를 눌러서 시작</span><span class="touch-only">👆 화면을 터치해서 시작</span></div>
        <p class="note">⌨️ 키보드로도, 👆 터치로도 할 수 있어요</p>
        ${ios && !installed ? '<p class="install">📲 Safari 공유 버튼 → <b>홈 화면에 추가</b> 하면 앱처럼 쓸 수 있어요</p>' : ''}
      </div>
      <button class="version" type="button">v${VERSION} · ↻ 업데이트 확인</button>
    </div>`);
  const start = () => {
    sfx.confirm();
    game.show('slots');
  };
  el.addEventListener('click', start);
  const ver = el.querySelector('.version');
  ver.addEventListener('click', e => {
    e.stopPropagation(); // don't also start the game
    ver.textContent = '확인 중...';
    game.checkForUpdate();
  });
  return { el, onKey(code) { if (code === 'Enter' || code === 'Space') start(); } };
}

// ---------------------------------------------------------------------------

function slotsScreen(game, { start = null, deleted = 0 } = {}) {
  const slots = listSlots();
  const when = t => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const card = (s, i) => {
    if (!s) {
      return `
        <div class="slot empty">
          <div class="slot-no">슬롯 ${i + 1}</div>
          <div class="slot-new">✨</div>
          <div class="slot-title">비어 있어요</div>
          <div class="slot-sub">눌러서 새로 시작</div>
        </div>`;
    }
    const progress = s.cleared >= 0 ? `${stageInfo(s.cleared).label}까지 클리어` : '아직 클리어한 스테이지 없음';
    return `
      <div class="slot">
        <div class="slot-no">슬롯 ${i + 1}</div>
        <canvas class="portrait"></canvas>
        <div class="slot-title">Lv ${s.level}</div>
        <div class="slot-sub">⭐ ${progress}</div>
        <div class="slot-sub">💰 ${fmtNum(s.gold)}</div>
        <div class="slot-time">${when(s.updatedAt)}</div>
        <button class="slot-del" type="button">🗑 지우기</button>
      </div>`;
  };
  const el = h(`
    <div class="screen slots">
      ${backBtn('← 처음으로')}
      <div class="panel slots-panel">
        <h2>💾 어느 슬롯으로 할까요?</h2>
        <div class="slot-row">${slots.map(card).join('')}</div>
        <div class="msg"></div>
      </div>
      ${hintbar([`${kc('←')}${kc('→')} 고르기`, `${kc('Enter')} 시작`, `${kc('X')} 지우기`, `${kc('Esc')} 처음으로`])}
    </div>`);
  const cards = [...el.querySelectorAll('.slot')];
  let confirm = null; // the "really delete?" dialog while it is open

  const askDelete = i => {
    if (!slots[i]) { sfx.denied(); return; }
    sfx.select();
    const dlg = h(`
      <div class="confirm">
        <div class="panel confirm-panel">
          <h2>🗑 슬롯 ${i + 1}을 지울까요?</h2>
          <p>Lv ${slots[i].level} 캐릭터가 사라지고, 되돌릴 수 없어요.</p>
          <div class="list compact">
            <div class="item"><div class="mid"><div class="name">아니요, 그냥 둘래요</div></div></div>
            <div class="item danger"><div class="mid"><div class="name">🗑 네, 지울래요</div></div></div>
          </div>
        </div>
      </div>`);
    el.appendChild(dlg);
    const close = () => { dlg.remove(); confirm = null; };
    const m = menu([...dlg.querySelectorAll('.item')], {
      onSelect: k => {
        close();
        if (k === 1) {
          deleteSlot(i + 1);
          sfx.error();
          game.show('slots', { start: i, deleted: i + 1 });
        } else {
          sfx.select();
        }
      },
    });
    confirm = { key: code => { if (isBack(code)) { close(); sfx.select(); } else m.key(code); } };
  };

  const nav = menu(cards, {
    cols: slots.length,
    start: start ?? Math.min(slots.length - 1, Math.max(0, game.prefs.lastSlot - 1)),
    onSelect: i => { sfx.confirm(); game.openSlot(i + 1); },
  });
  if (deleted) message(el, `슬롯 ${deleted}을 지웠어요`);
  cards.forEach((c, i) => c.querySelector('.slot-del')?.addEventListener('click', e => {
    e.stopPropagation(); // don't also open the slot
    askDelete(i);
  }));
  return {
    el,
    mount() {
      cards.forEach((c, i) => { if (slots[i]) drawPortrait(c.querySelector('.portrait'), slots[i].gear); });
    },
    onKey(code) {
      if (confirm) { confirm.key(code); return; }
      if (isBack(code)) { sfx.select(); game.show('title'); return; }
      if (code === 'KeyX' || code === 'Delete') { askDelete(nav.index); return; }
      nav.key(code);
    },
  };
}

// ---------------------------------------------------------------------------

function heroCard(save) {
  const st = computeStats(save);
  const need = xpNeed(save.level);
  const xpPct = save.level >= MAX_LEVEL ? 100 : (save.xp / need) * 100;
  return `
    <div class="hero-card">
      <canvas class="portrait"></canvas>
      <div class="hero-lv">Lv ${save.level}</div>
      <div class="bar xp"><i style="width:${xpPct.toFixed(1)}%"></i><span>${save.level >= MAX_LEVEL ? 'MAX' : `EXP ${fmtNum(save.xp)} / ${fmtNum(need)}`}</span></div>
      <div class="stats">
        <div>❤️ 체력 <b>${fmtNum(st.maxHp)}</b></div>
        <div>⚔️ 공격력 <b>${fmtNum(st.atk)}</b></div>
        <div>🛡️ 방어력 <b>${st.def}</b></div>
        <div>💥 치명타 <b>${Math.round(st.crit * 100)}%</b></div>
        <div>👟 속도 <b>${Math.round(st.speed / 2.3)}%</b></div>
        <div>💰 골드 <b>${fmtNum(save.gold)}</b></div>
      </div>
      <div class="gear-mini">${GEAR_ORDER.map(id => `<div>${GEAR[id].icon} ${gearName(id, save.gear[id])}</div>`).join('')}</div>
    </div>`;
}

function townScreen(game) {
  const s = game.save;
  const next = Math.min(STAGE_COUNT - 1, s.cleared + 1);
  const items = [
    { icon: '⚔️', name: '모험 떠나기', sub: `다음 스테이지 ${stageInfo(next).label}`, go: () => game.show('stages') },
    { icon: '🔨', name: '대장간', sub: '골드로 장비를 강화해요', go: () => game.show('smithy') },
    { icon: '✨', name: '스킬', sub: s.sp > 0 ? `스킬 포인트 ${s.sp}개를 쓸 수 있어요!` : '스킬을 강하게 만들어요', badge: s.sp, go: () => game.show('skills') },
    { icon: '⌨️', name: '키보드 연습장', sub: '키 위치를 익혀요', go: () => game.show('guide') },
    { icon: game.prefs.sound ? '🔊' : '🔇', name: `소리: ${game.prefs.sound ? '켜짐' : '꺼짐'}`, sub: '눌러서 바꾸기', go: () => { game.setSound(!game.prefs.sound); game.show('town'); } },
    { icon: '🚪', name: '저장하고 나가기', sub: '처음 화면으로 돌아가요', go: () => game.exitToTitle() },
  ];
  const el = h(`
    <div class="screen town">
      <div class="panel town-panel">
        ${heroCard(s)}
        <div class="town-menu">
          <h2>🏰 마을 <small class="slot-tag">슬롯 ${game.slot ?? '-'}</small></h2>
          <div class="list">
            ${items.map(it => `
              <div class="item">
                <div class="ico">${it.icon}</div>
                <div class="mid"><div class="name">${it.name}</div><div class="desc">${it.sub}</div></div>
                ${it.badge ? `<div class="badge">${it.badge}</div>` : ''}
              </div>`).join('')}
          </div>
        </div>
      </div>
      ${hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 결정`])}
    </div>`);
  const nav = menu([...el.querySelectorAll('.item')], {
    start: game.townIndex,
    onChange: i => { game.townIndex = i; },
    onSelect: i => { sfx.confirm(); items[i].go(); },
  });
  return {
    el,
    mount() { drawPortrait(el.querySelector('.portrait'), s.gear); },
    onKey(code) { nav.key(code); },
  };
}

// ---------------------------------------------------------------------------

function stagesScreen(game) {
  const s = game.save;
  const unlockedMax = Math.min(STAGE_COUNT - 1, s.cleared + 1);
  const el = h(`
    <div class="screen stages">
      ${backBtn()}
      <div class="panel stages-panel">
        <h2>⚔️ 모험 떠나기</h2>
        <div class="stage-grid">
          ${WORLDS.map((w, wi) => `
            <div class="world-row">
              <div class="world-name">${wi + 1}. ${w.name}</div>
              ${Array.from({ length: STAGES_PER_WORLD }, (_, k) => {
                const i = wi * STAGES_PER_WORLD + k;
                const info = stageInfo(i);
                const locked = i > unlockedMax;
                const mark = locked ? '🔒' : i <= s.cleared ? '⭐' : '';
                const boss = info.isBossStage ? `<span class="boss-ico">${MONSTERS[w.boss].emoji}</span>` : '';
                return `<div class="tile ${locked ? 'locked' : ''} ${info.isBossStage ? 'boss' : ''}">${boss}<b>${info.label}</b><span class="mark">${mark}</span></div>`;
              }).join('')}
            </div>`).join('')}
        </div>
        <div class="stage-info"></div>
        <div class="msg"></div>
      </div>
      ${hintbar([`${kc('←')}${kc('↑')}${kc('↓')}${kc('→')} 고르기`, `${kc('Enter')} 출발`, `${kc('Esc')} 뒤로`])}
    </div>`);
  const info = el.querySelector('.stage-info');
  const showInfo = i => {
    const st = stageInfo(i), w = WORLDS[st.world];
    const lvClass = s.level >= st.recLevel ? 'ok' : 'low';
    const bossText = st.isBossStage
      ? `👑 보스: ${MONSTERS[w.boss].emoji} ${MONSTERS[w.boss].name}`
      : '⭐ 마지막에 대장 몬스터가 나와요';
    info.innerHTML = i > unlockedMax
      ? `<b>${st.label} ${w.name}</b><span>🔒 앞 스테이지를 깨면 열려요</span>`
      : `<div class="info-text">
           <b>${st.label} ${w.name}</b>
           <span>권장 레벨 <em class="${lvClass}">Lv ${st.recLevel}</em> (지금 Lv ${s.level})</span>
           <span>몬스터 ${w.mobs.map(m => MONSTERS[m].emoji).join(' ')} · ${st.killGoal}마리</span>
           <span>${bossText}</span>
         </div>
         <button class="btn primary go" type="button">▶ 출발!</button>`;
  };
  info.addEventListener('click', e => {
    if (e.target.closest('.go')) nav.key('Enter');
  });
  const nav = menu([...el.querySelectorAll('.tile')], {
    cols: STAGES_PER_WORLD,
    start: unlockedMax,
    tapSelectsFirst: true,
    onChange: showInfo,
    onSelect: i => {
      if (i > unlockedMax) {
        sfx.error();
        message(el, '🔒 아직 잠겨 있어요. 앞 스테이지를 먼저 깨 주세요!', true);
        return;
      }
      sfx.confirm();
      game.startStage(i);
    },
  });
  return {
    el,
    onKey(code) {
      if (isBack(code)) { sfx.select(); game.show('town'); return; }
      nav.key(code);
    },
  };
}

// ---------------------------------------------------------------------------

function smithyScreen(game) {
  const s = game.save;
  const el = h(`
    <div class="screen smithy">
      ${backBtn()}
      <div class="panel shop-panel">
        <div class="shop-head"><h2>🔨 대장간</h2><div class="gold-chip"></div></div>
        <div class="shop-body">
          <div class="portrait-box"><canvas class="portrait"></canvas><p>5단계마다<br>모습이 바뀌어요!</p></div>
          <div class="list">${GEAR_ORDER.map(() => '<div class="item"></div>').join('')}</div>
        </div>
        <div class="msg"></div>
      </div>
      ${hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 강화하기`, `${kc('Esc')} 뒤로`])}
    </div>`);
  const rows = [...el.querySelectorAll('.item')];
  const render = () => {
    el.querySelector('.gold-chip').textContent = `💰 ${fmtNum(s.gold)}`;
    GEAR_ORDER.forEach((id, i) => {
      const g = GEAR[id], n = s.gear[id], max = n >= g.max;
      const cost = g.cost(n);
      rows[i].innerHTML = `
        <div class="ico">${g.icon}</div>
        <div class="mid">
          <div class="name">${gearName(id, n)} <small>${g.slot} ${n}/${g.max}</small></div>
          <div class="desc">${max ? g.effect(n) + ' (최고 단계!)' : `${g.effect(n)} → <b>${g.effect(n + 1)}</b>`}</div>
        </div>
        <div class="cost ${max ? 'max' : s.gold >= cost ? '' : 'poor'}">${max ? 'MAX' : `💰 ${fmtNum(cost)}`}</div>`;
    });
    drawPortrait(el.querySelector('.portrait'), s.gear);
  };
  const nav = menu(rows, {
    onSelect: i => {
      const id = GEAR_ORDER[i], g = GEAR[id], n = s.gear[id];
      if (n >= g.max) { sfx.denied(); message(el, '이미 최고 단계예요!'); return; }
      const cost = g.cost(n);
      if (s.gold < cost) {
        sfx.error();
        shake(rows[i]);
        message(el, `골드가 ${fmtNum(cost - s.gold)} 부족해요. 모험을 떠나서 모아 와요!`, true);
        return;
      }
      s.gold -= cost;
      s.gear[id] = n + 1;
      game.persist();
      sfx.upgrade();
      render();
      pulse(rows[i]);
      const changed = (id === 'weapon' || id === 'armor') && gearTier(n + 1) !== gearTier(n);
      message(el, changed ? `✨ ${gearName(id, n + 1)}(으)로 변신했어요!` : `강화 성공! ${gearName(id, n + 1)}`);
    },
  });
  return {
    el,
    mount: render,
    onKey(code) {
      if (isBack(code)) { sfx.select(); game.show('town'); return; }
      nav.key(code);
    },
  };
}

// ---------------------------------------------------------------------------

function skillsScreen(game) {
  const s = game.save;
  const ids = [...SKILL_ORDER, ...PASSIVE_ORDER];
  const el = h(`
    <div class="screen skills">
      ${backBtn()}
      <div class="panel shop-panel">
        <div class="shop-head"><h2>✨ 스킬</h2><div class="gold-chip sp"></div></div>
        <div class="list">${ids.map(() => '<div class="item"></div>').join('')}</div>
        <p class="tip">레벨업할 때마다 스킬 포인트를 1개 받아요</p>
        <div class="msg"></div>
      </div>
      ${hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 스킬 올리기`, `${kc('Esc')} 뒤로`])}
    </div>`);
  const rows = [...el.querySelectorAll('.item')];
  const render = () => {
    el.querySelector('.gold-chip').textContent = `✨ 스킬 포인트 ${s.sp}`;
    ids.forEach((id, i) => {
      const lv = s.skills[id];
      if (SKILLS[id]) {
        const sk = SKILLS[id];
        const locked = lv <= 0;
        rows[i].classList.toggle('locked', locked);
        rows[i].innerHTML = `
          <div class="ico">${sk.icon}</div>
          <div class="keycol">${kc(sk.label, sk.label === 'Space' ? 'wide' : '')}</div>
          <div class="mid">
            <div class="name">${sk.name} <small>${locked ? `🔒 Lv ${sk.unlock}에 배워요` : `Lv ${lv}/${sk.max}`}</small></div>
            <div class="desc">${skillDesc(id, Math.max(1, lv))}</div>
            ${!locked && lv < sk.max ? `<div class="next">다음 단계: ${skillDesc(id, lv + 1)}</div>` : ''}
          </div>
          <div class="cost ${locked || lv >= sk.max ? 'max' : s.sp > 0 ? '' : 'poor'}">${locked ? '🔒' : lv >= sk.max ? 'MAX' : '✨ 1'}</div>`;
      } else {
        const ps = PASSIVES[id];
        rows[i].innerHTML = `
          <div class="ico">${ps.icon}</div>
          <div class="keycol"></div>
          <div class="mid">
            <div class="name">${ps.name} <small>Lv ${lv}/${ps.max}</small></div>
            <div class="desc">${lv > 0 ? ps.desc(lv) : '아직 안 배웠어요'}${lv < ps.max ? ` → <b>${ps.desc(lv + 1)}</b>` : ''}</div>
          </div>
          <div class="cost ${lv >= ps.max ? 'max' : s.sp > 0 ? '' : 'poor'}">${lv >= ps.max ? 'MAX' : '✨ 1'}</div>`;
      }
    });
  };
  const nav = menu(rows, {
    onSelect: i => {
      const id = ids[i];
      const def = SKILLS[id] || PASSIVES[id];
      const lv = s.skills[id];
      if (SKILLS[id] && lv <= 0) { sfx.error(); shake(rows[i]); message(el, `Lv ${SKILLS[id].unlock}이 되면 자동으로 배워요!`, true); return; }
      if (lv >= def.max) { sfx.denied(); message(el, '이미 최고 단계예요!'); return; }
      if (s.sp <= 0) { sfx.error(); shake(rows[i]); message(el, '스킬 포인트가 없어요. 레벨업하면 생겨요!', true); return; }
      s.sp--;
      s.skills[id] = lv + 1;
      game.persist();
      sfx.upgrade();
      render();
      pulse(rows[i]);
      message(el, `${def.name} Lv ${lv + 1}!`);
    },
  });
  return {
    el,
    mount: render,
    onKey(code) {
      if (isBack(code)) { sfx.select(); game.show('town'); return; }
      nav.key(code);
    },
  };
}

// ---------------------------------------------------------------------------

const PRACTICE_LEVELS = [
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'Digit1', 'Digit2', 'Digit3', 'Digit4'],
  [...'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map(c => 'Key' + c), ...'1234567890'.split('').map(d => 'Digit' + d), 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
];

function guideScreen(game, { first = false } = {}) {
  const s = game.save;
  const el = h(`
    <div class="screen guide">
      ${first ? '' : backBtn('← 마을로')}
      <div class="panel guide-panel">
        <h2>${first ? '⌨️ 먼저 키보드를 알아봐요!' : '⌨️ 키보드 연습장'}</h2>
        <p class="tip touch-only">이 연습은 진짜 키보드를 연결해야 할 수 있어요</p>
        <div class="legend">
          <span class="chip c-move">${kc('←')}${kc('↑')}${kc('↓')}${kc('→')} 이동</span>
          <span class="chip c-atk">${kc('Space', 'wide')} 공격</span>
          <span class="chip c-skill">${kc('Q')}${kc('W')}${kc('E')}${kc('R')} 스킬</span>
          <span class="chip c-sys">${kc('Esc')} 멈춤/뒤로</span>
          <span class="chip c-ok">${kc('Enter')} 결정</span>
        </div>
        <div class="kb-holder"></div>
        <div class="challenge">
          <div class="ask">반짝이는 키를 찾아서 눌러보세요! <b class="target-name"></b></div>
          <div class="score"></div>
        </div>
        <div class="last-key"></div>
        ${first ? '<div class="btn-row"><button class="btn primary start" type="button">▶ 모험 시작!</button></div>' : ''}
      </div>
      ${hintbar(first ? [`${kc('Enter')} 모험 시작!`] : [`${kc('Enter')} 또는 ${kc('Esc')} 마을로`])}
    </div>`);
  const kb = createKeyboard({ roles: GAME_KEY_ROLES });
  el.querySelector('.kb-holder').appendChild(kb.el);
  el.querySelector('.start')?.addEventListener('click', () => leave());
  let score = 0, target = null;
  const stage = () => (score >= 25 ? 2 : score >= 10 ? 1 : 0);
  const newTarget = () => {
    const pool = PRACTICE_LEVELS[stage()].filter(c => c !== target);
    target = pool[Math.floor(Math.random() * pool.length)];
    kb.setTarget(target);
    el.querySelector('.target-name').textContent = keyName(target);
    el.querySelector('.score').innerHTML = `성공 <b>${score}</b> · 최고 ${s.kbBest || 0} · ${stage() + 1}단계`;
  };
  newTarget();
  const leave = () => {
    sfx.confirm();
    if (first) game.startStage(0);
    else game.show('town');
  };
  return {
    el,
    onKey(code, repeat) {
      if (code === 'Enter') { leave(); return; }
      if (isBack(code) && !first) { leave(); return; }
      if (repeat) return;
      kb.flash(code);
      el.querySelector('.last-key').innerHTML = `방금 누른 키: <b>${keyName(code)}</b>`;
      if (code === target) {
        score++;
        if (score > (s.kbBest || 0)) { s.kbBest = score; game.persist(); }
        sfx.coin();
        kb.flash(code, 'good');
        newTarget();
      } else {
        sfx.key();
      }
    },
  };
}

// ---------------------------------------------------------------------------

function resultScreen(game, r) {
  const s = game.save;
  const st = stageInfo(r.stageIndex);
  const hasNext = r.cleared && r.stageIndex + 1 < STAGE_COUNT;
  const lines = [
    `<li>💰 골드 <b>+${fmtNum(r.gold)}</b>${r.clearBonus ? ` <small>(클리어 보너스 ${fmtNum(r.clearBonus)}${r.firstClear ? ', 첫 클리어 2배!' : ''})</small>` : ''}</li>`,
    `<li>⭐ 경험치 <b>+${fmtNum(r.xp)}</b></li>`,
    `<li>👾 물리친 몬스터 <b>${r.kills}</b>마리</li>`,
  ];
  if (r.levels > 0) lines.push(`<li class="lvup">🆙 레벨업 ×${r.levels}! 지금 <b>Lv ${s.level}</b> · 스킬 포인트 +${r.levels}</li>`);
  for (const id of r.unlocked || []) lines.push(`<li class="lvup">✨ 새 스킬: ${kc(SKILLS[id].label)} ${SKILLS[id].name}</li>`);
  const options = hasNext
    ? [{ label: `▶ 다음 스테이지 (${stageInfo(r.stageIndex + 1).label})`, go: () => game.startStage(r.stageIndex + 1) }, { label: '🏰 마을로', go: () => game.show('town') }]
    : [{ label: r.cleared ? '🔁 한 번 더 하기' : '🔁 다시 도전', go: () => game.startStage(r.stageIndex) }, { label: '🏰 마을로', go: () => game.show('town') }];
  const allClear = r.cleared && r.stageIndex === STAGE_COUNT - 1;
  const el = h(`
    <div class="screen result dim">
      <div class="panel result-panel ${r.cleared ? 'win' : 'lose'}">
        <h1>${allClear ? '🏆 모든 스테이지 클리어!' : r.cleared ? '🎉 스테이지 클리어!' : '💫 쓰러졌어요'}</h1>
        <div class="stage-name">${st.label} ${WORLDS[st.world].name}</div>
        <ul class="rewards">${lines.join('')}</ul>
        ${r.cleared ? '' : '<p class="tip">💡 얻은 골드와 경험치는 그대로예요. 대장간에서 장비를 강화하거나 스킬을 올리면 더 강해져요!</p>'}
        ${s.sp > 0 ? `<p class="tip">✨ 스킬 포인트가 ${s.sp}개 있어요. 마을의 [스킬] 메뉴에서 써 보세요!</p>` : ''}
        <div class="list compact">${options.map(o => `<div class="item"><div class="mid"><div class="name">${o.label}</div></div></div>`).join('')}</div>
      </div>
      ${hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 결정`])}
    </div>`);
  const nav = menu([...el.querySelectorAll('.item')], { onSelect: i => { sfx.confirm(); options[i].go(); } });
  return { el, onKey(code) { nav.key(code); } };
}

// ---------------------------------------------------------------------------

function pauseScreen(game) {
  const el = h(`
    <div class="screen pause dim">
      <div class="panel pause-panel">
        <h2>⏸ 잠깐 멈춤</h2>
        <div class="list compact">
          <div class="item"><div class="mid"><div class="name">▶ 계속하기</div></div></div>
          <div class="item"><div class="mid"><div class="name">🏰 마을로 돌아가기</div><div class="desc">지금까지 얻은 골드와 경험치는 그대로 남아요</div></div></div>
        </div>
      </div>
      ${hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 결정`, `${kc('Esc')} 계속하기`])}
    </div>`);
  const nav = menu([...el.querySelectorAll('.item')], {
    onSelect: i => { sfx.confirm(); if (i === 0) game.resume(); else game.quitToTown(); },
  });
  return {
    el,
    onKey(code) {
      if (code === 'Escape' || code === 'KeyP') { game.resume(); return; }
      nav.key(code);
    },
  };
}

// ---------------------------------------------------------------------------

export function skillIntroPopup(game, id) {
  const sk = SKILLS[id];
  const el = h(`
    <div class="popup">
      <div class="panel popup-panel">
        <div class="pop-title">✨ 새 스킬을 배웠어요! ✨</div>
        <div class="pop-skill"><span class="big-ico">${sk.icon}</span>${kc(sk.label, 'big')}<b>${sk.name}</b></div>
        <p class="pop-desc">${skillDesc(id, 1)}</p>
        <div class="kb-holder"></div>
        <p class="pop-ask kbd-only">키보드에서 ${kc(sk.label)} 키를 찾아서 눌러보세요!</p>
        <p class="pop-help hidden kbd-only">못 찾겠으면 ${kc('Enter')} 를 눌러도 돼요</p>
        <p class="pop-ask touch-only">위 그림에서 반짝이는 ${kc(sk.label)} 키를 눌러보세요!</p>
        <p class="pop-help touch-only">싸울 때는 오른쪽 아래 ${kc(sk.label)} 버튼을 누르면 돼요</p>
      </div>
    </div>`);
  // A tapped key behaves like a real key press, so tapping the right one also fires the skill.
  const tap = code => {
    input.simulateDown(code);
    setTimeout(() => input.simulateUp(code), 100);
  };
  const kb = createKeyboard({ compact: true, roles: { [sk.code]: 'skill' }, onTap: tap });
  kb.setTarget(sk.code);
  el.querySelector('.kb-holder').appendChild(kb.el);
  const helpTimer = setTimeout(() => el.querySelector('.pop-help').classList.remove('hidden'), 5000);
  const close = () => {
    clearTimeout(helpTimer);
    game.closePopup();
  };
  return {
    el,
    code: sk.code,
    onKey(code, repeat) {
      if (repeat) return;
      if (code === sk.code) { sfx.confirm(); close(); return; }
      if (code === 'Enter') { close(); return; }
      kb.flash(code, 'wrong');
      sfx.denied();
    },
  };
}

export const SCREENS = {
  title: titleScreen,
  slots: slotsScreen,
  town: townScreen,
  stages: stagesScreen,
  smithy: smithyScreen,
  skills: skillsScreen,
  guide: guideScreen,
  result: resultScreen,
  pause: pauseScreen,
};
