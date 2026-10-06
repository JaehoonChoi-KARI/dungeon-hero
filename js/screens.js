// Menu screens (DOM). Every screen is fully usable with arrow keys + Enter + Esc.

import { sfx } from './audio.js';
import {
  VERSION, WORLDS, MONSTERS, STAGE_COUNT, STAGES_PER_WORLD, SKILLS, SKILL_ORDER, PASSIVES, PASSIVE_ORDER, GEAR, GEAR_ORDER,
  TIERS, POTIONS, POTION_ORDER, POTION_MAX, WEAPON_CATS, UP_LIMIT, weaponPower, armorHp, armorDef, armorBand, armorBaseName,
  itemLevel, canUpgrade, upCost, equippedWeapon, equippedArmor, resourceText,
  stageInfo, computeStats, skillDesc, gearName, xpNeed, MAX_LEVEL, fmtNum,
} from './data.js';
import { drawPortrait } from './hero.js';
import { createKeyboard, keyName, GAME_KEY_ROLES } from './keyboard-view.js';
import { input } from './input.js';
import { listSlots, deleteSlot } from './save.js';
import {
  GEM_GRADES, FUSE_COUNT, FUSE_COST, findGem, freeGems, gemMods, gemText, effectText, modsText, fuseCandidates, fuse, socketsOf,
  SOCKET_GROUPS, groupMods, groupScope,
} from './gems.js';
import { isWeapon, itemIcon, itemName, upText, sellPrice } from './items.js';

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const kc = (label, cls = '') => `<span class="kc ${cls}">${label}</span>`;
const isBack = code => code === 'Escape' || code === 'Backspace';
const hintbar = parts => `<div class="hintbar">${parts.join('<i>·</i>')}</div>`;
// Space shows the equipped weapon instead of a fixed skill.
const catOf = (save, id) => (id === 'atk' ? equippedWeapon(save).cat : undefined);
// gem-socket rows also include 'armor' (the equipped armor)
const skillIcon = (save, id) => (id === 'atk' ? WEAPON_CATS[equippedWeapon(save).cat].icon : id === 'armor' ? '🛡️' : SKILLS[id].icon);
const skillTitle = (save, id) => {
  if (id === 'atk' || id === 'armor') {
    const it = id === 'atk' ? equippedWeapon(save) : equippedArmor(save);
    return `${itemName(it)}${upText(it)}`;
  }
  return SKILLS[id].name;
};

// ---- difficulty tiers ---------------------------------------------------------
const tierOpen = (save, t) => t === 0 || save.cleared[t - 1] >= STAGE_COUNT - 1;
const topTier = save => [2, 1, 0].find(t => tierOpen(save, t));
// the stage to play next: first uncleared stage of the highest open tier
function nextStage(save) {
  const tier = topTier(save);
  return { tier, i: Math.min(STAGE_COUNT - 1, save.cleared[tier] + 1) };
}
function progressText(save) {
  const t = [2, 1, 0].find(k => save.cleared[k] >= 0);
  return t === undefined ? '아직 클리어한 스테이지 없음' : `${stageInfo(save.cleared[t], t).fullLabel}까지 클리어`;
}

// "공격력 140" for a weapon, "체력 820 · 방어력 31" for armor (optionally at another +level)
const itemStat = (it, up = it.up) => {
  const at = { ...it, up };
  return isWeapon(it) ? `공격력 ${weaponPower(at)}` : `체력 ${armorHp(at)} · 방어력 ${armorDef(at)}`;
};

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

// "Are you sure?" box on top of a screen. "No" starts selected; Esc also cancels.
// Returns { key } for the screen to forward key presses to while it is open.
function confirmDialog(parent, { title, text, no, yes, onYes, onClose }) {
  const dlg = h(`
    <div class="confirm">
      <div class="panel confirm-panel">
        <h2>${title}</h2>
        <p>${text}</p>
        <div class="list compact">
          <div class="item"><div class="mid"><div class="name">${no}</div></div></div>
          <div class="item danger"><div class="mid"><div class="name">${yes}</div></div></div>
        </div>
      </div>
    </div>`);
  parent.appendChild(dlg);
  const close = () => { dlg.remove(); onClose(); };
  const m = menu([...dlg.querySelectorAll('.item')], {
    onSelect: k => {
      close();
      if (k === 1) onYes();
      else sfx.select();
    },
  });
  return {
    key(code) {
      if (isBack(code)) { close(); sfx.select(); }
      else m.key(code);
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
    const progress = progressText(s);
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
    confirm = confirmDialog(el, {
      title: `🗑 슬롯 ${i + 1}을 지울까요?`,
      text: `Lv ${slots[i].level} 캐릭터가 사라지고, 되돌릴 수 없어요.`,
      no: '아니요, 그냥 둘래요',
      yes: '🗑 네, 지울래요',
      onYes: () => {
        deleteSlot(i + 1);
        sfx.error();
        game.show('slots', { start: i, deleted: i + 1 });
      },
      onClose: () => { confirm = null; },
    });
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
      cards.forEach((c, i) => { if (slots[i]) drawPortrait(c.querySelector('.portrait'), equippedArmor(slots[i]), equippedWeapon(slots[i])); });
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
      <div class="gear-mini">
        <div>${itemLine(equippedWeapon(save))}</div>
        <div>${itemLine(equippedArmor(save))}</div>
        ${GEAR_ORDER.map(id => `<div>${GEAR[id].icon} ${gearName(id, save.gear[id])}</div>`).join('')}
      </div>
    </div>`;
}

const itemLine = it => `${itemIcon(it)} <b class="grade" style="color:${GEM_GRADES[it.g].color}">${itemName(it)}</b>${upText(it)} <small>Lv ${itemLevel(it)}</small>`;

function townScreen(game) {
  const s = game.save;
  const next = nextStage(s);
  const newGems = s.gems.filter(g => g.id > s.gemSeenId).length;
  const newGear = s.weapons.filter(w => w.id > s.weaponSeenId).length + s.armors.filter(a => a.id > s.armorSeenId).length;
  const items = [
    { icon: '⚔️', name: '모험 떠나기', sub: `다음 스테이지 ${stageInfo(next.i, next.tier).fullLabel}`, go: () => game.show('stages') },
    { icon: '🎒', name: '장비', sub: newGear ? `새 장비 ${newGear}개!` : `무기 ${s.weapons.length}개 · 갑옷 ${s.armors.length}개`, badge: newGear, go: () => game.show('equip') },
    { icon: '🔨', name: '대장간', sub: '무기·갑옷은 +5까지, 신발·반지도 강화해요', go: () => game.show('smithy') },
    { icon: '🧪', name: '물약 상점', sub: `체력 물약 ${s.potions.hp}개 · 힘의 물약 ${s.potions.atk}개`, go: () => game.show('potions') },
    { icon: '✨', name: '스킬', sub: s.sp > 0 ? `스킬 포인트 ${s.sp}개를 쓸 수 있어요!` : '스킬을 강하게 만들어요', badge: s.sp, go: () => game.show('skills') },
    { icon: '💎', name: '보석', sub: newGems ? `새 보석 ${newGems}개!` : `보석 ${s.gems.length}개 · 무기와 스킬에 끼워요`, badge: newGems, go: () => game.show('gems') },
    { icon: '⌨️', name: '키보드 연습장', sub: '키 위치를 익혀요', go: () => game.show('guide') },
    { icon: '🚪', name: '저장하고 나가기', sub: '처음 화면으로 돌아가요', go: () => game.exitToTitle() },
  ];
  const toggleSound = () => { game.setSound(!game.prefs.sound); game.show('town'); };
  const el = h(`
    <div class="screen town">
      <div class="panel town-panel">
        ${heroCard(s)}
        <div class="town-menu">
          <h2>🏰 마을 <small class="slot-tag">슬롯 ${game.slot ?? '-'}</small>
            <button class="sound-btn" type="button">${game.prefs.sound ? '🔊 소리 켜짐' : '🔇 소리 꺼짐'}<span class="kbd-only"> (M)</span></button></h2>
          <div class="list">
            ${items.map(it => `
              <div class="item">
                <div class="ico">${it.icon}</div>
                <div class="mid"><div class="name">${it.name}</div><div class="desc">${it.sub}</div></div>
                ${it.badge ? `<div class="badge">${it.badge}</div>` : ''}
              </div>`).join('')}
          </div>
          <div class="msg"></div>
        </div>
      </div>
      ${hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 결정`, `${kc('M')} 소리`])}
    </div>`);
  const nav = menu([...el.querySelectorAll('.item')], {
    start: game.townIndex,
    onChange: i => { game.townIndex = i; },
    onSelect: i => { sfx.confirm(); items[i].go(); },
  });
  el.querySelector('.sound-btn').addEventListener('click', toggleSound);
  return {
    el,
    mount() {
      drawPortrait(el.querySelector('.portrait'), equippedArmor(s), equippedWeapon(s));
      if (s.refund > 0) { // one-time note after the v2.0 gear change
        message(el, `업데이트: +5를 넘은 강화는 +5로 맞추고 💰${fmtNum(s.refund)}골드를 돌려드렸어요!`);
        s.refund = 0;
        game.persist();
      }
    },
    onKey(code) {
      if (code === 'KeyM') { toggleSound(); return; }
      nav.key(code);
    },
  };
}

// ---------------------------------------------------------------------------

function stagesScreen(game) {
  const s = game.save;
  let tier = game.stageTier ?? topTier(s);
  if (!tierOpen(s, tier)) tier = 0;
  const cleared = s.cleared[tier];
  const unlockedMax = Math.min(STAGE_COUNT - 1, cleared + 1);
  const el = h(`
    <div class="screen stages">
      ${backBtn()}
      <div class="panel stages-panel">
        <div class="shop-head">
          <h2>⚔️ 모험 떠나기</h2>
          <div class="tier-tabs">
            ${TIERS.map((t, k) => `<button class="tier-tab${k === tier ? ' on' : ''}${tierOpen(s, k) ? '' : ' locked'}" type="button" data-t="${k}" style="--tc:${t.color}">${tierOpen(s, k) ? '' : '🔒 '}${t.name}</button>`).join('')}
          </div>
        </div>
        <div class="stage-grid">
          ${WORLDS.map((w, wi) => `
            <div class="world-row">
              <div class="world-name">${wi + 1}. ${w.name}</div>
              ${Array.from({ length: STAGES_PER_WORLD }, (_, k) => {
                const i = wi * STAGES_PER_WORLD + k;
                const info = stageInfo(i, tier);
                const locked = i > unlockedMax;
                const mark = locked ? '🔒' : i <= cleared ? '⭐' : '';
                const boss = info.isBossStage ? `<span class="boss-ico">${MONSTERS[w.boss].emoji}</span>` : '';
                return `<div class="tile ${locked ? 'locked' : ''} ${info.isBossStage ? 'boss' : ''}">${boss}<b>${info.label}</b><span class="mark">${mark}</span></div>`;
              }).join('')}
            </div>`).join('')}
        </div>
        <div class="stage-info"></div>
        <div class="msg"></div>
      </div>
      ${hintbar([`${kc('←')}${kc('↑')}${kc('↓')}${kc('→')} 고르기`, `${kc('Enter')} 출발`, `${kc('Tab')} 난이도`, `${kc('Esc')} 뒤로`])}
    </div>`);
  const info = el.querySelector('.stage-info');
  const showInfo = i => {
    const st = stageInfo(i, tier), w = WORLDS[st.world];
    const lvClass = s.level >= st.recLevel ? 'ok' : 'low';
    const bossText = st.isBossStage
      ? `👑 보스: ${MONSTERS[w.boss].emoji} ${MONSTERS[w.boss].name}`
      : '⭐ 마지막에 대장 몬스터가 나와요';
    info.innerHTML = i > unlockedMax
      ? `<b>${st.fullLabel} ${w.name}</b><span>🔒 앞 스테이지를 깨면 열려요</span>`
      : `<div class="info-text">
           <b>${st.fullLabel} ${w.name}</b>
           <span>권장 레벨 <em class="${lvClass}">Lv ${st.recLevel}</em> (지금 Lv ${s.level})</span>
           <span>몬스터 ${w.mobs.map(m => MONSTERS[m].emoji).join(' ')} · ${st.killGoal}마리</span>
           <span>${bossText}</span>
           <span>🎒 장비 Lv ${st.itemLevel}</span>
         </div>
         <button class="btn primary go" type="button">▶ 출발!</button>`;
  };
  const switchTier = t => {
    if (t === tier) return;
    if (!tierOpen(s, t)) {
      sfx.error();
      message(el, `🔒 ${TIERS[t - 1].name} 5-5를 깨면 '${TIERS[t].name}'이 열려요`, true);
      return;
    }
    sfx.select();
    game.stageTier = t;
    game.show('stages');
  };
  info.addEventListener('click', e => {
    if (e.target.closest('.go')) nav.key('Enter');
  });
  el.querySelector('.tier-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tier-tab');
    if (tab) switchTier(+tab.dataset.t);
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
      game.startStage(i, tier);
    },
  });
  return {
    el,
    onKey(code) {
      if (isBack(code)) { sfx.select(); game.show('town'); return; }
      if (code === 'Tab') { // next open difficulty, wrapping around
        const open = [0, 1, 2].filter(t => tierOpen(s, t));
        if (open.length < 2) { switchTier(Math.min(2, tier + 1)); return; }
        switchTier(open[(open.indexOf(tier) + 1) % open.length]);
        return;
      }
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
          <div class="portrait-box"><canvas class="portrait"></canvas><p>갑옷 레벨이 오르면<br>모습이 바뀌어요!</p></div>
          <div class="list">${['weapon', 'armor', ...GEAR_ORDER].map(() => '<div class="item"></div>').join('')}</div>
        </div>
        <p class="tip">무기·갑옷은 얻은 레벨에서 +${UP_LIMIT}까지만 강화돼요. 더 세지려면 더 높은 레벨 장비를 찾아요!</p>
        <div class="msg"></div>
      </div>
      ${hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 강화하기`, `${kc('Esc')} 뒤로`])}
    </div>`);
  const rows = [...el.querySelectorAll('.item')];
  // The equipped weapon and armor (each step = +1 item level, +5 at most), then boots and ring.
  const itemEntry = (it, slot) => ({
    icon: itemIcon(it), label: `${itemName(it)}${upText(it)} <small>Lv ${itemLevel(it)}</small>`, slot,
    n: it.up, max: UP_LIMIT, maxed: !canUpgrade(it), cost: upCost(it),
    effect: n => itemStat(it, n), raise: () => { it.up++; }, item: it,
  });
  const entries = () => [
    itemEntry(equippedWeapon(s), '장착한 무기'),
    itemEntry(equippedArmor(s), '장착한 갑옷'),
    ...GEAR_ORDER.map(id => ({
      icon: GEAR[id].icon, label: gearName(id, s.gear[id]), slot: GEAR[id].slot, n: s.gear[id], max: GEAR[id].max,
      maxed: s.gear[id] >= GEAR[id].max, cost: GEAR[id].cost(s.gear[id]), effect: GEAR[id].effect,
      raise: () => { s.gear[id]++; },
    })),
  ];
  const render = () => {
    el.querySelector('.gold-chip').textContent = `💰 ${fmtNum(s.gold)}`;
    entries().forEach((it, i) => {
      rows[i].innerHTML = `
        <div class="ico">${it.icon}</div>
        <div class="mid">
          <div class="name">${it.label} <small>${it.slot} 강화 ${it.n}/${it.max}</small></div>
          <div class="desc">${it.maxed ? `${it.effect(it.n)} (${it.item ? '강화 끝! 더 높은 레벨 장비를 찾아보세요' : '최고 단계!'})` : `${it.effect(it.n)} → <b>${it.effect(it.n + 1)}</b>`}</div>
        </div>
        <div class="cost ${it.maxed ? 'max' : s.gold >= it.cost ? '' : 'poor'}">${it.maxed ? 'MAX' : `💰 ${fmtNum(it.cost)}`}</div>`;
    });
    drawPortrait(el.querySelector('.portrait'), equippedArmor(s), equippedWeapon(s));
  };
  const nav = menu(rows, {
    onSelect: i => {
      const it = entries()[i];
      if (it.maxed) {
        sfx.denied();
        message(el, it.item ? `+${UP_LIMIT}까지 다 강화했어요. 더 높은 레벨 장비를 찾아보세요!` : '이미 최고 단계예요!');
        return;
      }
      if (s.gold < it.cost) {
        sfx.error();
        shake(rows[i]);
        message(el, `골드가 ${fmtNum(it.cost - s.gold)} 부족해요. 모험을 떠나서 모아 와요!`, true);
        return;
      }
      const band = it.item && !isWeapon(it.item) ? armorBand(itemLevel(it.item)) : -1;
      s.gold -= it.cost;
      it.raise();
      game.persist();
      sfx.upgrade();
      render();
      pulse(rows[i]);
      const changed = band >= 0 && armorBand(itemLevel(it.item)) !== band;
      message(el, changed ? `✨ ${armorBaseName(it.item)}(으)로 바뀌었어요!` : '강화 성공!');
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
  const mods = gemMods(s);
  const gemBonus = Object.fromEntries(SKILL_ORDER.map(id => [id, modsText(mods[id])]));
  const render = () => {
    el.querySelector('.gold-chip').textContent = `✨ 스킬 포인트 ${s.sp}`;
    ids.forEach((id, i) => {
      const lv = s.skills[id];
      if (SKILLS[id]) {
        const sk = SKILLS[id];
        const locked = lv <= 0;
        rows[i].classList.toggle('locked', locked);
        rows[i].innerHTML = `
          <div class="ico">${skillIcon(s, id)}</div>
          <div class="keycol">${kc(sk.label, sk.label === 'Space' ? 'wide' : '')}</div>
          <div class="mid">
            <div class="name">${sk.name} <small>${locked ? `🔒 Lv ${sk.unlock}에 배워요` : `Lv ${lv}/${sk.max}`}</small></div>
            <div class="desc">${skillDesc(id, Math.max(1, lv), undefined, catOf(s, id))}</div>
            ${!locked && lv < sk.max ? `<div class="next">다음 단계: ${skillDesc(id, lv + 1, undefined, catOf(s, id))}</div>` : ''}
            ${!locked && gemBonus[id] ? `<div class="next gem-bonus">💎 보석·장비 효과 합계: ${gemBonus[id]}</div>` : ''}
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

// Equipment bag: 무기 / 갑옷 tabs (← →). Left: items of that kind, equipped first.
// Right: the selected one, compared with what's equipped, with equip / sell.
const EQUIP_KINDS = {
  weapon: { title: '🗡️ 무기', items: s => s.weapons, eq: s => equippedWeapon(s), set: (s, id) => { s.weaponId = id; }, power: weaponPower },
  armor: { title: '🛡️ 갑옷', items: s => s.armors, eq: s => equippedArmor(s), set: (s, id) => { s.armorId = id; }, power: armorHp },
};

function equipScreen(game, { tab = 'weapon' } = {}) {
  const s = game.save;
  const seen = { weapon: s.weaponSeenId, armor: s.armorSeenId };
  s.weaponSeenId = s.nextWeaponId - 1; // clears the "new gear" badge in town
  s.armorSeenId = s.nextArmorId - 1;
  game.persist();
  const K = EQUIP_KINDS[tab];
  const el = h(`
    <div class="screen weapons">
      ${backBtn()}
      <div class="panel gems-panel">
        <div class="shop-head">
          <h2>🎒 장비</h2>
          <div class="tier-tabs">
            ${Object.entries(EQUIP_KINDS).map(([k, v]) => `<button class="tier-tab${k === tab ? ' on' : ''}" type="button" data-k="${k}" style="--tc:var(--gold)">${v.title}</button>`).join('')}
          </div>
          <div class="gold-chip"></div>
        </div>
        <div class="gems-body">
          <div class="pick-list weapon-list"></div>
          <div class="gem-side"></div>
        </div>
        <div class="msg"></div>
      </div>
      ${hintbar([`${kc('←')}${kc('→')} 무기/갑옷`, `${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 장착하기`, `${kc('X')} 팔기`, `${kc('Esc')} 뒤로`])}
    </div>`);
  const listEl = el.querySelector('.weapon-list');
  const side = el.querySelector('.gem-side');
  let selId = K.eq(s).id, confirm = null;

  const sorted = () => [...K.items(s)].sort((a, b) =>
    (b === K.eq(s)) - (a === K.eq(s)) || K.power(b) - K.power(a) || b.g - a.g || b.id - a.id);
  const selected = () => K.items(s).find(it => it.id === selId) || K.eq(s);
  const socketIcons = w => w.sockets.map(gid => {
    const gem = findGem(s, gid);
    return gem ? gemIcon(gem, 'mini') : '<span class="gem-empty"></span>';
  }).join('');
  const compare = (it, cur) => {
    if (isWeapon(it)) {
      const d = weaponPower(it) - weaponPower(cur);
      return `<div class="side-sub ${d >= 0 ? 'up' : 'down'}">지금 무기보다 공격력 ${d >= 0 ? '+' : ''}${d}</div>`;
    }
    const dh = armorHp(it) - armorHp(cur), dd = armorDef(it) - armorDef(cur);
    return `<div class="side-sub ${dh >= 0 ? 'up' : 'down'}">지금 갑옷보다 체력 ${dh >= 0 ? '+' : ''}${dh} · 방어력 ${dd >= 0 ? '+' : ''}${dd}</div>`;
  };

  function render() {
    el.querySelector('.gold-chip').textContent = `💰 ${fmtNum(s.gold)}`;
    const cur = K.eq(s);
    listEl.innerHTML = sorted().map(it => `
      <div class="pick-row weapon-row${it.id === selId ? ' sel' : ''}" data-id="${it.id}">
        <span class="w-ico">${itemIcon(it)}</span>
        <div class="pick-mid">
          <div>${gradeTag(it)} ${itemName(it).split(' ').slice(1).join(' ')}${upText(it)} <small>Lv ${itemLevel(it)}</small>
            ${it === cur ? '<span class="tag on">장착 중</span>' : ''}${it.id > seen[tab] ? '<span class="tag new">NEW</span>' : ''}</div>
          <div class="w-sub">${itemStat(it)}${it.fx.length ? ` · ${gemText(it)}` : ''}</div>
        </div>
        <div class="w-sockets">${socketIcons(it)}</div>
      </div>`).join('');
    const it = selected();
    const equipped = it === cur;
    side.innerHTML = `
      <div class="weapon-card" style="--gc:${GEM_GRADES[it.g].color}">
        <span class="w-big">${itemIcon(it)}</span>
        <div>
          <div class="side-title">${gradeTag(it)} ${itemName(it).split(' ').slice(1).join(' ')}${upText(it)}</div>
          <div class="side-sub">Lv <b>${itemLevel(it)}</b> (얻은 레벨 ${it.lv} · 강화 ${it.up}/${UP_LIMIT}) · ${itemStat(it)}</div>
          ${equipped ? `<div class="side-sub on">지금 ${isWeapon(it) ? '들고' : '입고'} 있어요</div>` : compare(it, cur)}
        </div>
      </div>
      ${isWeapon(it) ? `
        <p class="tip">${kc('Space')} ${WEAPON_CATS[it.cat].desc}</p>
        <div class="side-sub">${resourceText(it.cat)}</div>
        <div class="side-sub">추가 효과: ${it.fx.length ? it.fx.map(effectText).join(' · ') : '없음'}</div>
        <div class="side-sub">보석 칸 (Space 공격에): ${socketIcons(it)}</div>`
        : `
        <div class="side-sub">추가 효과: ${it.fx.length ? it.fx.map(effectText).join(' · ') : '없음'}</div>
        <div class="side-sub">보석 칸 (모든 공격에 절반): ${socketIcons(it)}</div>
        <p class="tip">갑옷 레벨이 오르면 이름과 모습이 바뀌어요</p>`}
      <p class="tip">강화는 얻은 레벨에서 +${UP_LIMIT}까지 (대장간)</p>
      ${equipped ? '' : `
        <div class="btn-row">
          <button class="btn primary equip" type="button">${isWeapon(it) ? '⚔️ 장착하기' : '🛡️ 입기'}</button>
          <button class="btn sell-w" type="button">💰 ${fmtNum(sellPrice(it))}에 팔기</button>
        </div>`}`;
    listEl.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }

  function equip() {
    const it = selected();
    if (it === K.eq(s)) { sfx.denied(); message(el, '이미 장착하고 있어요'); return; }
    K.set(s, it.id);
    game.persist();
    sfx.upgrade();
    message(el, `${itemName(it)}을(를) ${isWeapon(it) ? '들었어요' : '입었어요'}!`);
    render();
  }

  function askSell() {
    const it = selected();
    if (it === K.eq(s)) { sfx.denied(); message(el, '장착한 장비는 팔 수 없어요', true); return; }
    const price = sellPrice(it);
    const gemsIn = it.sockets.filter(Boolean).length;
    sfx.select();
    confirm = confirmDialog(el, {
      title: `💰 ${itemName(it)}을(를) 팔까요?`,
      text: [
        `Lv ${itemLevel(it)} · ${itemStat(it)} · 💰 ${fmtNum(price)}골드를 받아요`,
        it.up ? `강화 +${it.up}도 함께 사라져요` : '',
        gemsIn ? `끼워 둔 보석 ${gemsIn}개는 가방으로 돌아와요` : '',
      ].filter(Boolean).join('<br>'),
      no: '아니요, 가지고 있을래요',
      yes: `💰 ${fmtNum(price)}골드에 팔기`,
      onYes: () => {
        if (isWeapon(it)) s.weapons = s.weapons.filter(x => x !== it); // its sockets go with it, so the gems become free
        else s.armors = s.armors.filter(x => x !== it);
        s.gold += price;
        selId = K.eq(s).id;
        game.persist();
        sfx.coin();
        message(el, `💰 ${fmtNum(price)}골드를 받았어요`);
        render();
      },
      onClose: () => { confirm = null; },
    });
  }

  const switchTab = k => {
    if (k === tab) return;
    sfx.select();
    game.show('equip', { tab: k });
  };
  el.querySelector('.tier-tabs').addEventListener('click', e => {
    const t = e.target.closest('.tier-tab');
    if (t) switchTab(t.dataset.k);
  });
  listEl.addEventListener('click', e => {
    const row = e.target.closest('.weapon-row');
    if (!row) return;
    const id = +row.dataset.id;
    if (id === selId && game.inputMode !== 'touch') { equip(); return; }
    selId = id;
    sfx.select();
    render();
  });
  side.addEventListener('click', e => {
    if (e.target.closest('.equip')) equip();
    else if (e.target.closest('.sell-w')) askSell();
  });

  return {
    el,
    mount: render,
    onKey(code) {
      if (confirm) { confirm.key(code); return; }
      if (isBack(code)) { sfx.select(); game.show('town'); return; }
      if (code === 'ArrowLeft' || code === 'ArrowRight') { switchTab(code === 'ArrowLeft' ? 'weapon' : 'armor'); return; }
      const list = sorted();
      const i = list.findIndex(it => it.id === selId);
      if (code === 'ArrowDown' || code === 'ArrowUp') {
        selId = list[(i + (code === 'ArrowDown' ? 1 : list.length - 1)) % list.length].id;
        sfx.select();
        render();
      } else if (code === 'Enter' || code === 'Space') equip();
      else if (code === 'KeyX' || code === 'Delete') askSell();
    },
  };
}

function potionsScreen(game) {
  const s = game.save;
  const el = h(`
    <div class="screen potions">
      ${backBtn()}
      <div class="panel shop-panel">
        <div class="shop-head"><h2>🧪 물약 상점</h2><div class="gold-chip"></div></div>
        <div class="list">${POTION_ORDER.map(() => '<div class="item"></div>').join('')}</div>
        <div class="kb-holder"></div>
        <p class="tip kbd-only">싸우는 중에 숫자 ${kc('1')} ${kc('2')} 키를 누르면 마셔요</p>
        <p class="tip touch-only">싸우는 중에 화면 오른쪽 위 물약 버튼을 누르면 마셔요</p>
        <div class="msg"></div>
      </div>
      ${hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 1개 사기`, `${kc('Esc')} 뒤로`])}
    </div>`);
  const rows = [...el.querySelectorAll('.item')];
  const kb = createKeyboard({ compact: true, roles: { Digit1: 'item', Digit2: 'item' } });
  el.querySelector('.kb-holder').appendChild(kb.el);
  const render = () => {
    el.querySelector('.gold-chip').textContent = `💰 ${fmtNum(s.gold)}`;
    POTION_ORDER.forEach((id, i) => {
      const p = POTIONS[id], have = s.potions[id], price = p.price(s.level), full = have >= POTION_MAX;
      rows[i].innerHTML = `
        <div class="ico">${p.icon}</div>
        <div class="keycol">${kc(p.label)}</div>
        <div class="mid"><div class="name">${p.name} <small>${have} / ${POTION_MAX}개</small></div><div class="desc">${p.desc}</div></div>
        ${full ? '' : `<button class="fill" type="button" data-i="${i}">가득 채우기</button>`}
        <div class="cost ${full ? 'max' : s.gold >= price ? '' : 'poor'}">${full ? '가득!' : `💰 ${fmtNum(price)}`}</div>`;
    });
  };
  const buy = (i, n) => {
    const id = POTION_ORDER[i], p = POTIONS[id], price = p.price(s.level);
    const room = POTION_MAX - s.potions[id];
    if (room <= 0) { sfx.denied(); message(el, `더는 들 수 없어요 (최대 ${POTION_MAX}개)`); return; }
    const count = Math.min(n, room, Math.floor(s.gold / price));
    if (count <= 0) { sfx.error(); shake(rows[i]); message(el, `골드가 ${fmtNum(price - s.gold)} 부족해요`, true); return; }
    s.gold -= count * price;
    s.potions[id] += count;
    game.persist();
    sfx.coin();
    render();
    pulse(rows[i]);
    message(el, `${p.name} ${count}개를 샀어요`);
  };
  const nav = menu(rows, { onSelect: i => buy(i, 1) });
  // "fill up" sits inside a row; catch it before the row's own "buy one" click
  el.addEventListener('click', e => {
    const fill = e.target.closest('.fill');
    if (!fill) return;
    e.stopPropagation();
    buy(+fill.dataset.i, POTION_MAX);
  }, true);
  return {
    el,
    mount: render,
    onKey(code) {
      if (isBack(code)) { sfx.select(); game.show('town'); return; }
      nav.key(code);
    },
  };
}

const gemIconG = (grade, cls = '') => `<span class="gem-ico ${cls}" style="--gc:${GEM_GRADES[grade].color}"></span>`;
const gemIcon = (gem, cls = '') => gemIconG(gem.g, cls);
const gradeTag = gem => `<b class="grade" style="color:${GEM_GRADES[gem.g].color}">${GEM_GRADES[gem.g].name}</b>`;
const gemCard = gem => `
  <div class="gem-card" style="--gc:${GEM_GRADES[gem.g].color}">
    ${gemIcon(gem, 'big')}
    <div><div>${gradeTag(gem)} 보석</div>${gem.fx.map(f => `<div class="fx">${effectText(f)}</div>`).join('')}</div>
  </div>`;

// Left: every skill with its 3 sockets. Right: the selected socket, or (after Enter/tap)
// the list of free gems to put in it, where gems can also be sold.
function gemsScreen(game) {
  const s = game.save;
  s.gemSeenId = s.nextGemId - 1; // clears the "new gems" badge in town
  game.persist();
  const el = h(`
    <div class="screen gems">
      ${backBtn()}
      <div class="panel gems-panel">
        <div class="shop-head">
          <h2>💎 보석</h2>
          <div class="head-right"><button class="fuse-btn" type="button">⚗️ 보석 합성<span class="kbd-only"> (F)</span></button><div class="gold-chip"></div></div>
        </div>
        <div class="gems-body">
          <div class="socket-list"></div>
          <div class="gem-side"></div>
        </div>
        <div class="msg"></div>
      </div>
      <div class="hint-slot"></div>
    </div>`);
  const list = el.querySelector('.socket-list');
  const side = el.querySelector('.gem-side');
  let row = 0, col = 0, mode = 'sockets', pickIdx = 0, confirm = null; // mode: sockets | pick | fuse
  let fuseIdx = 0, lastFused = null;

  const skillId = () => SOCKET_GROUPS[row];
  const fuseBlocker = g => {
    const have = freeGems(s).filter(x => x.g === g).length;
    if (have < FUSE_COUNT) return `${GEM_GRADES[g].name} 보석이 ${FUSE_COUNT - have}개 더 필요해요`;
    if (s.gold < FUSE_COST[g]) return `골드가 ${fmtNum(FUSE_COST[g] - s.gold)} 부족해요`;
    return '';
  };

  function fuseHtml() {
    const rows = [0, 1, 2, 3].map(g => {
      const have = freeGems(s).filter(x => x.g === g).length;
      const why = fuseBlocker(g);
      return `
        <div class="pick-row fuse-row${g === fuseIdx ? ' sel' : ''}${why ? ' off' : ''}" data-g="${g}">
          <div class="pick-mid">
            <div>${gemIconG(g)}<b class="grade" style="color:${GEM_GRADES[g].color}">${GEM_GRADES[g].name}</b> ×${FUSE_COUNT}
              → ${gemIconG(g + 1)}<b class="grade" style="color:${GEM_GRADES[g + 1].color}">${GEM_GRADES[g + 1].name}</b>
              <small>(${have}개 있음)</small></div>
            ${why ? `<div class="fuse-why">${why}</div>` : ''}
          </div>
          <div class="fuse-cost">💰 ${fmtNum(FUSE_COST[g])}</div>
        </div>`;
    }).join('');
    return `
      <div class="side-title">⚗️ 보석 합성</div>
      <p class="tip">같은 등급 보석 3개를 합쳐서 한 등급 위 보석을 만들어요. 수치가 낮은 보석부터 쓰고, 스킬에 끼워 둔 보석은 쓰지 않아요.</p>
      ${lastFused ? `<div class="side-sub">✨ 새로 만든 보석</div>${gemCard(lastFused)}` : ''}
      <div class="pick-list">${rows}</div>`;
  }

  function askFuse(g) {
    const why = fuseBlocker(g);
    if (why) { sfx.error(); message(el, why, true); return; }
    const used = fuseCandidates(s, g);
    sfx.select();
    confirm = confirmDialog(el, {
      title: `⚗️ ${GEM_GRADES[g + 1].name} 보석을 만들까요?`,
      text: `이 보석 3개와 💰${fmtNum(FUSE_COST[g])}골드를 써요<br>${used.map(x => `${gradeTag(x)} ${gemText(x)}`).join('<br>')}`,
      no: '아니요',
      yes: '⚗️ 합성하기',
      onYes: () => {
        const gem = fuse(s, g);
        if (!gem) return;
        lastFused = gem;
        game.persist();
        sfx.levelUp();
        message(el, `${GEM_GRADES[gem.g].name} 보석이 생겼어요!`);
        render();
      },
      onClose: () => { confirm = null; },
    });
  }

  const setMode = m => {
    mode = m;
    if (m === 'fuse') lastFused = null;
    sfx.select();
    render();
  };
  const learned = id => id === 'armor' || s.skills[id] > 0;
  // picker rows: "take it out" first when the socket is filled, then every free gem
  const choices = () => {
    const cur = socketsOf(s, skillId())[col];
    return [...(cur ? [{ remove: true }] : []), ...freeGems(s).map(gem => ({ gem }))];
  };
  // "피해 +18% (이 스킬에)" — what this row's gems add, and where
  const rowBonus = id => {
    const t = modsText(groupMods(s, id));
    return t ? `${t} <small>(${groupScope(id)})</small>` : '';
  };

  function detailHtml() {
    const id = skillId(), sk = SKILLS[id];
    const gem = findGem(s, socketsOf(s, id)[col]);
    const tip = !learned(id)
      ? `Lv ${sk.unlock}에 스킬을 배우면 보석을 끼울 수 있어요`
      : freeGems(s).length || gem
        ? `${kc('Enter')}를 누르거나 칸을 터치하면 보석을 끼우거나 바꿀 수 있어요`
        : '끼울 보석이 없어요. 대장 몬스터와 보스를 잡으면 보석이 나와요!';
    const now = id === 'armor'
      ? `<div class="side-sub">갑옷 칸의 보석은 모든 공격·스킬에 절반만큼 더해져요${rowBonus(id) ? ` · 지금: ${rowBonus(id)}` : ''}</div>`
      : learned(id) ? `<div class="side-sub">지금 ${id === 'atk' ? 'Space 공격' : '스킬'}: ${skillDesc(id, s.skills[id], gemMods(s)[id], catOf(s, id))}</div>` : '';
    return `
      <div class="side-title">${skillIcon(s, id)} ${skillTitle(s, id)} · ${col + 1}번 칸 <small>(${groupScope(id)})</small></div>
      ${gem ? gemCard(gem) : '<div class="empty-socket">빈 칸</div>'}
      <p class="tip">${tip}</p>
      ${now}`;
  }

  function pickerHtml() {
    const rows = choices();
    return `
      <div class="side-title">${skillTitle(s, skillId())} ${col + 1}번 칸에 끼울 보석</div>
      <div class="pick-list">
        ${rows.map((o, i) => o.remove
          ? `<div class="pick-row${i === pickIdx ? ' sel' : ''}" data-i="${i}"><div class="pick-mid">↩ 보석 빼기</div></div>`
          : `<div class="pick-row${i === pickIdx ? ' sel' : ''}" data-i="${i}">
               ${gemIcon(o.gem)}
               <div class="pick-mid">${gradeTag(o.gem)} ${gemText(o.gem)}</div>
               <button class="sell" type="button" data-i="${i}">팔기 💰${GEM_GRADES[o.gem.g].sell}</button>
             </div>`).join('')}
      </div>`;
  }

  function render() {
    el.querySelector('.gold-chip').textContent = `💎 ${s.gems.length}개 · 💰 ${fmtNum(s.gold)}`;
    list.innerHTML = SOCKET_GROUPS.map((id, r) => {
      const sk = SKILLS[id];
      const sockets = socketsOf(s, id).map((gid, c) => {
        const gem = findGem(s, gid);
        const sel = r === row && c === col ? ' sel' : '';
        return `<div class="socket${sel}${gem ? ' filled' : ''}" data-r="${r}" data-c="${c}">${gem ? gemIcon(gem) : '+'}</div>`;
      }).join('');
      const bonus = rowBonus(id);
      return `
        <div class="srow${learned(id) ? '' : ' locked'}${r === row ? ' cur' : ''}">
          <div class="sk">
            <div class="sk-name"><span class="ico">${skillIcon(s, id)}</span>${sk ? kc(sk.label, sk.label === 'Space' ? 'wide' : '') : ''}${skillTitle(s, id)}</div>
            <div class="sk-bonus${learned(id) && bonus ? '' : ' none'}">${learned(id) ? bonus || (id === 'armor' ? '보석 없음 · 끼우면 모든 공격에 절반' : '보석 없음') : `🔒 Lv ${sk.unlock}에 배워요`}</div>
          </div>
          <div class="sockets">${sockets}</div>
        </div>`;
    }).join('');
    side.innerHTML = mode === 'pick' ? pickerHtml() : mode === 'fuse' ? fuseHtml() : detailHtml();
    side.querySelector('.pick-row.sel')?.scrollIntoView({ block: 'nearest' });
    el.querySelector('.fuse-btn').classList.toggle('on', mode === 'fuse');
    el.querySelector('.hint-slot').innerHTML = mode === 'pick'
      ? hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 끼우기`, `${kc('X')} 팔기`, `${kc('Esc')} 취소`])
      : mode === 'fuse'
        ? hintbar([`${kc('↑')}${kc('↓')} 고르기`, `${kc('Enter')} 합성하기`, `${kc('Esc')} 돌아가기`])
        : hintbar([`${kc('←')}${kc('↑')}${kc('↓')}${kc('→')} 칸 고르기`, `${kc('Enter')} 보석 끼우기`, `${kc('F')} 합성`, `${kc('Esc')} 뒤로`]);
  }

  function openPicker() {
    const id = skillId();
    if (!learned(id)) { sfx.error(); message(el, `Lv ${SKILLS[id].unlock}에 스킬을 배우면 쓸 수 있어요`, true); return; }
    if (!choices().length) { sfx.denied(); message(el, '끼울 보석이 없어요. 대장 몬스터와 보스를 잡으면 보석이 나와요!', true); return; }
    sfx.select();
    mode = 'pick';
    pickIdx = 0;
    render();
  }

  function choose(i) {
    const o = choices()[i];
    if (!o) return;
    if (o.remove) {
      socketsOf(s, skillId())[col] = 0;
      sfx.select();
      message(el, '보석을 뺐어요');
    } else {
      socketsOf(s, skillId())[col] = o.gem.id;
      sfx.upgrade();
      message(el, `${GEM_GRADES[o.gem.g].name} 보석을 끼웠어요!`);
    }
    game.persist();
    mode = 'sockets';
    render();
  }

  function askSell(i) {
    const o = choices()[i];
    if (!o || o.remove) { sfx.denied(); return; }
    const gem = o.gem, price = GEM_GRADES[gem.g].sell;
    sfx.select();
    confirm = confirmDialog(el, {
      title: '💰 이 보석을 팔까요?',
      text: `${GEM_GRADES[gem.g].name} 보석 · ${gemText(gem)}`,
      no: '아니요, 가지고 있을래요',
      yes: `💰 ${price}골드에 팔기`,
      onYes: () => {
        s.gems = s.gems.filter(g => g !== gem);
        s.gold += price;
        game.persist();
        sfx.coin();
        message(el, `💰 ${price}골드를 받았어요`);
        if (!choices().length) mode = 'sockets';
        pickIdx = Math.max(0, Math.min(pickIdx, choices().length - 1));
        render();
      },
      onClose: () => { confirm = null; },
    });
  }

  list.addEventListener('click', e => {
    const sock = e.target.closest('.socket');
    if (!sock) return;
    const r = +sock.dataset.r, c = +sock.dataset.c;
    const again = mode === 'sockets' && r === row && c === col;
    row = r;
    col = c;
    mode = 'sockets';
    if (again || game.inputMode === 'touch') openPicker();
    else { sfx.select(); render(); }
  });
  side.addEventListener('click', e => {
    const fuseRow = e.target.closest('.fuse-row');
    if (fuseRow) { fuseIdx = +fuseRow.dataset.g; askFuse(fuseIdx); return; }
    const sell = e.target.closest('.sell');
    if (sell) { askSell(+sell.dataset.i); return; }
    const r = e.target.closest('.pick-row');
    if (r) choose(+r.dataset.i);
  });
  el.querySelector('.fuse-btn').addEventListener('click', () => setMode(mode === 'fuse' ? 'sockets' : 'fuse'));

  return {
    el,
    mount: render,
    onKey(code) {
      if (confirm) { confirm.key(code); return; }
      if (mode === 'fuse') {
        if (isBack(code) || code === 'KeyF') setMode('sockets');
        else if (code === 'ArrowDown') { fuseIdx = (fuseIdx + 1) % 4; sfx.select(); render(); }
        else if (code === 'ArrowUp') { fuseIdx = (fuseIdx + 3) % 4; sfx.select(); render(); }
        else if (code === 'Enter' || code === 'Space') askFuse(fuseIdx);
        return;
      }
      if (mode === 'pick') {
        const n = choices().length;
        if (isBack(code)) { mode = 'sockets'; sfx.select(); render(); }
        else if (code === 'ArrowDown') { pickIdx = (pickIdx + 1) % n; sfx.select(); render(); }
        else if (code === 'ArrowUp') { pickIdx = (pickIdx - 1 + n) % n; sfx.select(); render(); }
        else if (code === 'Enter' || code === 'Space') choose(pickIdx);
        else if (code === 'KeyX' || code === 'Delete') askSell(pickIdx);
        return;
      }
      if (isBack(code)) { sfx.select(); game.show('town'); return; }
      if (code === 'KeyF') { setMode('fuse'); return; }
      if (code === 'Enter' || code === 'Space') { openPicker(); return; }
      if (code === 'ArrowDown') row = (row + 1) % SOCKET_GROUPS.length;
      else if (code === 'ArrowUp') row = (row - 1 + SOCKET_GROUPS.length) % SOCKET_GROUPS.length;
      else if (code === 'ArrowRight') col = Math.min(2, col + 1);
      else if (code === 'ArrowLeft') col = Math.max(0, col - 1);
      else return;
      sfx.select();
      render();
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
          <span class="chip c-item">${kc('1')}${kc('2')} 물약</span>
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
  const tier = r.tier || 0;
  const st = stageInfo(r.stageIndex, tier);
  // after 5-5 the next stage is 1-1 of the next difficulty (just unlocked by this clear)
  const next = r.stageIndex + 1 < STAGE_COUNT ? { i: r.stageIndex + 1, tier } : tier + 1 < TIERS.length ? { i: 0, tier: tier + 1 } : null;
  const hasNext = r.cleared && next && tierOpen(s, next.tier);
  const newTier = hasNext && next.tier !== tier;
  const lines = [
    `<li>💰 골드 <b>+${fmtNum(r.gold)}</b>${r.clearBonus ? ` <small>(클리어 보너스 ${fmtNum(r.clearBonus)}${r.firstClear ? ', 첫 클리어 2배!' : ''})</small>` : ''}</li>`,
    `<li>⭐ 경험치 <b>+${fmtNum(r.xp)}</b></li>`,
    `<li>👾 물리친 몬스터 <b>${r.kills}</b>마리</li>`,
  ];
  if (r.levels > 0) lines.push(`<li class="lvup">🆙 레벨업 ×${r.levels}! 지금 <b>Lv ${s.level}</b> · 스킬 포인트 +${r.levels}</li>`);
  for (const id of r.unlocked || []) lines.push(`<li class="lvup">✨ 새 스킬: ${kc(SKILLS[id].label)} ${SKILLS[id].name}</li>`);
  for (const gem of r.gems || []) lines.push(`<li class="gem-line" style="--gc:${GEM_GRADES[gem.g].color}">${gemIcon(gem)} ${gradeTag(gem)} 보석 · ${gemText(gem)}</li>`);
  for (const it of r.items || []) {
    lines.push(`<li class="gem-line" style="--gc:${GEM_GRADES[it.g].color}">${itemIcon(it)} ${gradeTag(it)} ${itemName(it).split(' ').slice(1).join(' ')} Lv ${it.lv} · ${itemStat(it)}${it.fx.length ? ` · ${gemText(it)}` : ''}</li>`);
  }
  if (newTier) lines.push(`<li class="lvup">🔓 새 난이도 '${TIERS[next.tier].name}'이 열렸어요! 장비 레벨이 더 높아요</li>`);
  const options = hasNext
    ? [{ label: `▶ 다음 스테이지 (${stageInfo(next.i, next.tier).fullLabel})`, go: () => game.startStage(next.i, next.tier) }, { label: '🏰 마을로', go: () => game.show('town') }]
    : [{ label: r.cleared ? '🔁 한 번 더 하기' : '🔁 다시 도전', go: () => game.startStage(r.stageIndex, tier) }, { label: '🏰 마을로', go: () => game.show('town') }];
  const allClear = r.cleared && !next;
  const el = h(`
    <div class="screen result dim">
      <div class="panel result-panel ${r.cleared ? 'win' : 'lose'}">
        <h1>${allClear ? '🏆 지옥까지 모두 클리어!' : r.cleared ? '🎉 스테이지 클리어!' : '💫 쓰러졌어요'}</h1>
        <div class="stage-name">${st.fullLabel} ${WORLDS[st.world].name}</div>
        <ul class="rewards">${lines.join('')}</ul>
        ${r.cleared ? '' : '<p class="tip">💡 얻은 골드와 경험치는 그대로예요. 대장간에서 장비를 강화하거나 스킬을 올리면 더 강해져요!</p>'}
        ${s.sp > 0 ? `<p class="tip">✨ 스킬 포인트가 ${s.sp}개 있어요. 마을의 [스킬] 메뉴에서 써 보세요!</p>` : ''}
        ${r.gems?.length ? '<p class="tip">💎 마을의 [보석] 메뉴에서 무기와 스킬에 끼워 보세요!</p>' : ''}
        ${r.items?.length ? '<p class="tip">🎒 마을의 [장비] 메뉴에서 새 장비를 써 보세요!</p>' : ''}
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
  gems: gemsScreen,
  equip: equipScreen,
  potions: potionsScreen,
  guide: guideScreen,
  result: resultScreen,
  pause: pauseScreen,
};
