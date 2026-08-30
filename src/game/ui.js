// HUD / DOM controller: top-bar stats, labelled tool dock (with hover tooltips),
// inspector (live brain visualizer + trait bars + lineage), a functional MENU,
// a NATIONS browser, the nation-control HUD (policies + research + diplomacy +
// destiny + live stats), a first-load onboarding hint, and the event log.
//
// Symmetric-governance UI: every macro decision the human makes here routes
// through the SAME GovernanceAPI an AI nation uses (game.gov.*), falling back to
// the direct game.* methods when statecraft isn't wired yet. The UI never
// puppeteers individuals — it sets a nation's will and lets evolved brains act.
import { N_IN, N_HID, N_OUT, W_IH, SENSE, ACT, GENE, gene } from '../sim/brain.js';
import { hueToCss } from '../sim/tribe.js';
import { TECHS, ERAS } from '../sim/tech.js';
import { TIERS_KO } from '../sim/settlement.js';
import { DESTINIES } from './governance.js';

// 영문 enum → 한글 표시 매핑 (식별자 보존 원칙을 깨지 않으면서 화면만 한글로).
// 인스펙터/배너에서 tribe name/desc/focus, settlement tier, destiny desc 등
// 데이터 enum이 그대로 노출되는 모든 곳을 이 매핑으로 거친다.
const STANCE_KO = { ally: '동맹', neutral: '중립', rival: '적대', war: '전쟁' };
const DESTINY_KO = {};
for (const d of DESTINIES) DESTINY_KO[d.id] = d.name;
const HERITAGE_KO = { hardy: '강인함', fertile: '다산', martial: '무인', scholarly: '학자',
  swift: '날쌘함', verdant: '녹음의 백성', seafaring: '바다의 백성' };
const FOCUS_KO = { growth: '성장', build: '건축', military: '군사', gold: '금화', research: '연구' };
// emit 메시지 안에 박힌 영문 enum (e.g. 'Village') → 한글 ('촌락') 후처리.
// 게임 코드는 영문을 그대로 emit하지만 UI 토스트에서는 한글로 보여준다.
const ENUM_KO = {
  // TIERS
  'Camp': '캠프', 'Village': '촌락', 'Town': '마을', 'City': '도시', 'Settlement': '정착지',
  // 정책 title (POLICIES는 이미 한글 — ui.js에서 정의)
  // 거버먼트 (citizens가 보지 않으므로)
  'Chiefdom': '추장부', 'Confederacy': '동맹', 'Monarchy': '군주국', 'Theocracy': '신정정치',
  'Republic': '공화국', 'Democracy': '민주주의', 'Autocracy': '전제정치',
  // tech
  'Fire': '불', 'StoneTools': '석기', 'Agriculture': '농업', 'AnimalHusbandry': '목축',
  'Pottery': '토기', 'Wheel': '바퀴', 'Writing': '문자', 'Bronzeworking': '청동 제작',
  'Sailing': '항해', 'Mathematics': '수학', 'Currency': '화폐', 'IronWorking': '철 제작',
  'Masonry': '석조', 'Engineering': '공학', 'Medicine': '의술', 'Compass': '나침반',
  'Gunpowder': '화약', 'Printing': '인쇄술', 'ScientificMethod': '과학적 방법',
  'Steam': '증기 기관', 'Electricity': '전기', 'Industrialization': '공업화',
  'Combustion': '내연 기관', 'Plastics': '플라스틱', 'Flight': '유인 비행', 'Computing': '컴퓨팅',
};

function localizeEnum(s) {
  if (!s) return s;
  // whole-word boundary matching (한국어 구간은 변경하지 않음)
  let out = s;
  for (const [en, ko] of Object.entries(ENUM_KO)) {
    if (!en) continue;
    // 영문 단어 단위로 교체 — 이미 한글이 섞인 영역에 영향 없음
    out = out.replace(new RegExp(`(?<![A-Za-z가-힣])${en.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?![A-Za-z가-힣])`, 'g'), ko);
  }
  return out;
}

const $ = (id) => document.getElementById(id);

// Single source of truth for the god tools: icon, label, hotkey, description.
// Drives the dock labels, the hover tooltips, and the menu legend.
// `hotkey`는 영문 키 (대문자 I/R/L/F/S/B/X/P — game.input.js에서 keys.has()로 매칭) → 보존.
// `name`/`desc`는 한글 표시.
const TOOL_INFO = {
  inspect: { icon: '🔍', name: '조사', hotkey: 'I', desc: '생물을 클릭해 그 뇌와 혈통을 보거나, 민족을 클릭해 그 이야기를 읽으세요.' },
  raise:   { icon: '⛰', name: '땅 올리기', hotkey: 'R', desc: '지형을 밀어 올립니다 — 구릉, 산, 육지 다리를 만드세요. 드래그로 조각합니다.' },
  lower:   { icon: '🌊', name: '내리기/물', hotkey: 'L', desc: '지형을 가라앉힙니다 — 호수, 강, 바다를 파세요. 드래그로 범람시키세요.' },
  forest:  { icon: '🌲', name: '숲', hotkey: 'F', desc: '수집인들이 먹고사는 나무와 풀을 자라게 합니다.' },
  spawn:   { icon: '✿', name: '생명 창조', hotkey: 'S', desc: '클릭한 자리에 진화하는 마음을 가진 새 부족을 심으세요.' },
  food:    { icon: '🍒', name: '음식 축복', hotkey: 'B', desc: '고군분투하는 민족을 돕기 위해 식량을 흩뿌리세요.' },
  smite:   { icon: '⚡', name: '내리침', hotkey: 'X', desc: '터지는 범위 안의 모든 것을 내리칩니다 — 가공할 자연 선택.' },
  possess: { icon: '👁', name: '빙의', hotkey: 'P', desc: '한 몸에 내려타서 WASD로 직접 걸어보세요.' },
};

const CONTROLS = [
  ['스크롤', '줌 — 궤도에서 지면까지 하나의 연속된 공간'],
  ['드래그', '세계를 이동'],
  ['Shift+드래그', '3D 뷰에서 카메라 궤도 회전'],
  ['Space', '일시정지 / 재개'],
  ['1 – 5', '시뮬레이션 속도'],
  ['[  ]', '도구 붓 크기 줄이기 / 늘리기'],
  ['Esc', '빙의 해제 · 승천 · 패널 닫기'],
  ['W A S D', '빙의한 몸을 이동'],
];

// Policy sliders: label, slider-end words, hover tip + a LIVE effect readout so
// the player sees cause -> effect. The live text is derived from the value below.
// `key` (영문, governance.js setPolicy/getPolicy에서 사용) → 보존.
// `title`/`lo`/`hi`/`tip`은 한글 표시.
const POLICIES = [
  { key: 'aggression', title: '전쟁', lo: '평화주의', hi: '호전적',
    tip: '<b>전쟁 기조</b> — 호전적으로 갈수록 병사를 더 길러 적을 빨리 치고, 평화주의로 갈수록 싸움을 피하고 평화롭게 번성합니다.' },
  { key: 'expansion', title: '확장', lo: '고수적', hi: '개척적',
    tip: '<b>확장</b> — 개척적은 개척민을 보내 땅을 차지하고 도시를 세우며, 고수적은 백성을 가까이 모은 채 통합을 유지합니다.' },
  { key: 'breed', title: '번식', lo: '절제', hi: '신속한 증가',
    tip: '<b>번식</b> — 신속한 증가는 출산을 늘리지만(먹일 입도 늘어남), 절제는 식량 안에서 살도록 출산을 늦춥니다.' },
  { key: 'research', title: '학문', lo: '전통', hi: '과학',
    tip: '<b>학문 vs 전통</b> — 과학 쪽으로 가면 연구가 빨라지지만 풍속은 옅어지고, 전통은 문화와 신앙을 두텁게 하면서 기술 트리는 더디게 흐릅니다.' },
];

// First-time Survival walkthrough (3–5 short, dismissible coach-marks).
const TUTORIAL = [
  { ico: '⚑', title: '당신이 이 민족을 이끕니다',
    body: '당신은 <b>통치자이자 입법자</b>이지, 꼭두각시 인형술사가 아닙니다. 당신이 정책을 세우고 큰 결정을 내리면, 신경망 시민들이 그 안에서 각자의 삶을 살아갑니다. 손을 떼면 평의회가 당신의 뜻대로 국가를 운영합니다.' },
  { ico: '🖐', title: '세계를 움직여 보세요',
    body: '<b>클릭</b>으로 무엇이든 조사하세요 — 생물을 클릭하면 살아있는 뇌가, 도시나 민족을 클릭하면 그 이야기가 보입니다. <b>드래그</b>로 화면을 옮기고, <b>스크롤</b>로 궤도에서 지면까지 줌하세요. 3D 보기에서는 <b>Shift</b>를 누른 채 드래그해 카메라를 돌립니다.',
    keys: ['탭 = 조사', '드래그 = 이동', '스크롤 = 줌', 'Shift+드래그 = 궤도 회전'] },
  { ico: '🏛', title: '세 가지 핵심 행동',
    body: '<b>도시 세우기</b>는 (금화 10으로) 비옥한 땅을 클릭하면 됩니다 · <b>지휘</b>는 병사들을 드래그로 선택한 뒤 목표를 클릭합니다 · <b>승천</b>은 언제라도 신의 시점으로 돌아갈 수 있습니다.',
    keys: ['🏛 도시 세우기', '⚔ 지휘', '↑ 승천'] },
  { ico: '🎚', title: '나라의 의지를 설정하세요',
    body: '<b>정책</b> 슬라이더가 당신이 다스리는 방식입니다 — 전쟁 기조, 확장, 번식, 학문. 각 슬라이더는 드래그할 때 실시간 효과가 보입니다. <b>연구</b>와 <b>외교</b> 탭도 함께 조종하세요 — 나머지는 백성의 진화한 마음이 결정합니다.' },
  { ico: '✦', title: '승리 — 혹은 멸망',
    body: '국민을 키우고, <b>기술 트리</b>를 오르고, <b>시민 제도</b>를 채택하고, 라이벌보다 오래 살아남으세요. 명확한 목표를 원한다면 <b>숙원</b>을 선택하세요 — 충분한 수의 백성에 도달하거나, 마지막까지 남는 것이 목표입니다. 백성이 0이 되면 끝납니다. 행운을 빕니다.' },
];

// Map a policy value (-1..1) to a short, human-readable effect line.
function policyEffect(key, v) {
  const lvl = (lo, mid, hi) => (v <= -0.33 ? lo : v >= 0.33 ? hi : mid);
  const txt = {
    aggression: lvl('평화 — 전쟁을 피함', '균형 잡힌 입장', '호전적 — 싸움을 서슴지 않음'),
    expansion: lvl('고향에 머묾', '고르게 퍼져감', '빠른 확장 — 바깥으로 세력을 넓힘'),
    breed: lvl('신중한 출산', '자연스러운 성장', '빠른 증가 — 식량을 살피세요'),
    research: lvl('전통 우선', '균형', '과학 우선 — 더 빠른 기술'),
  }[key] || '';
  return `<b>${(v * 100 | 0)}</b> · ${esc(txt)}`;
}

const STANCES = ['ally', 'neutral', 'rival', 'war'];

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), modeBadge: $('mode-badge'),
      year: $('stat-year'), pop: $('stat-pop'), gen: $('stat-gen'),
      nations: $('stat-nations'), fit: $('stat-fit'),
      speed: $('btn-speed'),
      inspector: $('inspector'), inspTitle: $('insp-title'), inspBody: $('insp-body'),
      nationBar: $('nation-bar'), nationName: $('nation-name'), nationFlag: $('nation-flag'),
      nationStats: $('nation-stats'),
      nationPolicies: $('nation-policies'),
      nationResearch: $('nation-research'), nationDiplo: $('nation-diplo'), nationDestiny: $('nation-destiny'),
      eventlog: $('eventlog'), dock: $('dock'),
      menuModal: $('menu-modal'), menuCard: $('menu-card'),
      nationsPanel: $('nations-panel'), nationsList: $('nations-list'),
      btnNations: $('btn-nations'),
    };
    this.game = null;
    this.openAgent = null;
    this.openTribe = null;
    this.nationTab = 'policies';
    this._diploSig = '';
    this._researchSig = '';
    this._natSig = '';
    this._natRows = new Map();
    this._natOpen = false;
    this._menuBuilt = false;
    this._onboardShown = false;

    // ---- inspector + ascend ----
    $('insp-close').onclick = () => this.hideInspector();
    $('nation-leave').onclick = () => this.game && this.game.ascend();
    if ($('nation-army')) $('nation-army').onclick = () => this.game && this.game.musterArmy();
    if ($('nation-found')) $('nation-found').onclick = () => {
      if (!this.game) return;
      this.game.foundCity();
      // mirror game.foundMode into the discoverability banner (cleared by updateStats)
      this.setFoundBanner(!!this.game.foundMode);
    };
    document.querySelectorAll('.civ-banner').forEach((b) => { b.onclick = () => this.setNationTab(b.dataset.tab || 'research'); });

    // ---- god tools: build labels, wire click + hover tooltip ----
    this._buildTooltip();
    document.querySelectorAll('.tool').forEach((btn) => {
      const info = TOOL_INFO[btn.dataset.tool];
      if (info) {
        btn.innerHTML = `<span class="tool-ico">${info.icon}</span><span class="tool-label">${info.name}</span>`;
        btn.removeAttribute('title'); // replaced by the rich tooltip
        btn.addEventListener('mouseenter', () => this._showTip(btn, info));
        btn.addEventListener('mouseleave', () => this._hideTip());
        btn.addEventListener('mousedown', () => this._hideTip());
      }
      btn.onclick = () => this.game && this.game.setTool(btn.dataset.tool);
    });

    // ---- top-bar buttons ----
    $('btn-speed').onclick = () => this.game && this.game.cycleSpeed();
    $('btn-help').onclick = () => $('modal').classList.remove('hidden');
    // the how-to-play / intro modal closes from its own button and on backdrop click
    if ($('modal-start')) $('modal-start').onclick = () => $('modal').classList.add('hidden');
    if ($('modal')) $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').classList.add('hidden'); });
    $('btn-menu').onclick = () => this.toggleMenu();
    if (this.el.btnNations) this.el.btnNations.onclick = () => this.toggleNations();

    // ---- nation HUD tabs ----
    document.querySelectorAll('.ntab').forEach((tb) => {
      tb.onclick = () => this.setNationTab(tb.dataset.ntab);
    });

    // ---- delegated handlers (survive list rebuilds) ----
    if (this.el.nationDiplo) this.el.nationDiplo.addEventListener('click', (e) => this._onDiploClick(e));
    if (this.el.nationsList) this.el.nationsList.addEventListener('click', (e) => this._onNationsClick(e));

    // ---- menu modal ----
    if (this.el.menuModal) {
      this.el.menuModal.addEventListener('click', (e) => { if (e.target === this.el.menuModal) this.closeMenu(); });
    }
    if ($('nations-close')) $('nations-close').onclick = () => this.closeNations();

    this._buildMenu();
  }

  bind(game) { this.game = game; }

  // show/hide the COMMANDING banner + cursor (RTS command-mode discoverability)
  setCommandBanner(on) {
    const b = document.getElementById('command-banner');
    if (b) b.classList.toggle('hidden', !on);
    document.body.classList.toggle('commanding', !!on);
  }

  // ---- governance helpers (the symmetric API; degrade gracefully) ---------
  _gov(method) {
    const g = this.game && this.game.gov;
    return (g && typeof g[method] === 'function') ? g : null;
  }
  _sim() { return this.game ? this.game.sim : null; }

  setSpeed(speed) {
    this.el.speed.textContent = speed === 0 ? '⏸ 일시정지' : `▶ ${speed}×`;
    this.el.speed.classList.toggle('paused', speed === 0);
    this._syncMenu();
  }

  setActiveTool(tool) {
    document.querySelectorAll('.tool').forEach((b) =>
      b.classList.toggle('active', b.dataset.tool === tool));
  }

  setMode(mode, tribe) {
    const b = this.el.modeBadge;
    if (mode === 'nation' && tribe) {
      b.textContent = '민족'; b.className = 'mode-badge nation';
      b.style.background = hueToCss(tribe.hue, 60, 45);
      this._dismissOnboard();
      this._maybeTutorial(); // first time leading a people -> coach-marks
    } else {
      b.textContent = '신'; b.className = 'mode-badge god'; b.style.background = '';
    }
  }

  // ---- top-bar live stats ----
  updateStats(sim) {
    this.el.year.textContent = sim.year().toLocaleString();
    this.el.pop.textContent = sim.population().toLocaleString();
    this.el.gen.textContent = sim.maxGen;
    this.el.nations.textContent = sim.activeTribes();
    this.el.fit.textContent = sim.peakFitness.toFixed(1);
    if (!this._onboardShown) this._showOnboard();
    if (this.openAgent && this.openAgent.alive) this.refreshAgentStats();
    else if (this.openAgent && !this.openAgent.alive) this.markDead();
    if (this.openTribe) this.refreshTribeStats();
    if (this.game && this.game.playerTribe) { this.refreshNationBar(); this._syncFoundState(); }
    if (this._natOpen) this.refreshNationsPanel();
    // Civ-style research/civic banners (shown only while leading a nation)
    const cb = document.getElementById('civ-banners');
    if (cb) {
      if (this.game && this.game.playerTribe) { cb.classList.remove('hidden'); this.updateBanners(this.game.playerTribe); }
      else cb.classList.add('hidden');
    }
  }

  // fill the top-left research + civic banners (current target + progress)
  updateBanners(tr) {
    const sim = this._sim(); if (!sim) return;
    const techs = (sim.tech && sim.tech.available) ? sim.tech.available(tr) : [];
    this._setBanner('research-banner', '연구 선택', techs, tr.tech ? tr.tech.points : 0);
    const civics = (sim.civics && sim.civics.available) ? sim.civics.available(tr) : [];
    this._setBanner('civic-banner', '시민 제도 선택', civics, tr.civics ? tr.civics.points : 0);
  }
  _setBanner(id, prompt, avail, points) {
    const el = document.getElementById(id); if (!el) return;
    const t = el.querySelector('.cb-text'), bar = el.querySelector('.cb-prog > i'), eta = el.querySelector('.cb-eta');
    if (!avail || !avail.length) { t.textContent = prompt; bar.style.width = '0%'; eta.textContent = ''; return; }
    const cur = avail.reduce((a, b) => (b.cost < a.cost ? b : a), avail[0]); // next to complete
    const p = Math.max(0, Math.min(1, points / (cur.cost || 1)));
    t.textContent = cur.name;
    bar.style.width = (p * 100).toFixed(0) + '%';
    eta.textContent = (p * 100 | 0) + '%';
  }

  // ---- inspector --------------------------------------------------------
  showInspector(sel, game) {
    if (!sel) return this.hideInspector();
    this.el.inspector.classList.remove('hidden');
    if (sel.agent) this.renderAgent(sel.agent, sel.tribe, game);
    else if (sel.settlement) this.renderSettlement(sel.settlement, sel.tribe, game);
    else if (sel.tribe) this.renderTribe(sel.tribe, game);
  }

  hideInspector() {
    this.el.inspector.classList.add('hidden');
    this.openAgent = null; this.openTribe = null;
    if (this.game) { this.game.selection = null; this.game.renderer.selection = null; }
  }

  renderAgent(a, tribe, game) {
    this.openAgent = a; this.openTribe = null;
    this.el.inspTitle.textContent = a.name;
    const traits = ['size', 'speed', 'metabolism', 'fertility', 'aggression', 'vision', 'diet', 'resilience'];
    const TRAIT_KO = {
      size: '체구', speed: '속도', metabolism: '신진대사', fertility: '출산력',
      aggression: '공격성', vision: '시각', diet: '식성', resilience: '회복력'
    };
    this.el.inspBody.innerHTML = `
      <div class="insp-sub" style="color:${hueToCss(tribe ? tribe.hue : a.hue)}">
        ${tribe ? esc(tribe.name) : '야생'} · ${a.generation}세대
      </div>
      <div class="brainwrap"><canvas id="brain-cv" width="260" height="150"></canvas>
        <div class="brain-cap">이 생물의 마음 — 파란색은 흥분, 빨간색은 억제</div></div>
      <div id="agent-vitals"></div>
      <div class="trait-head">유전 형질</div>
      <div id="agent-traits">
        ${traits.map((t) => `
          <div class="trait"><span class="trait-name">${TRAIT_KO[t] || t}</span>
          <span class="trait-bar"><i style="width:${(gene(a.genome, t === 'diet' ? 'diet' : t) * 100).toFixed(0)}%;
            background:${traitColor(t)}"></i></span></div>`).join('')}
      </div>
      <div class="insp-actions">
        <button id="act-possess">👁 이 몸에 빙의</button>
        ${tribe ? `<button id="act-playas">⚑ ${esc(tribe.name)} 통치</button>` : ''}
      </div>`;
    this.brainCv = $('brain-cv');
    this.drawBrain(a);
    this.refreshAgentStats();
    $('act-possess').onclick = () => game.possess(a);
    const pa = $('act-playas'); if (pa) pa.onclick = () => game.playAsTribe(tribe);
  }

  refreshAgentStats() {
    const a = this.openAgent;
    const v = $('agent-vitals'); if (!v) return;
    v.innerHTML = `
      <div class="vital"><span>체력</span><span class="vbar"><i style="width:${(a.energy * 83).toFixed(0)}%;background:#e8c84a"></i></span></div>
      <div class="vital"><span>건강</span><span class="vbar"><i style="width:${(a.health * 100).toFixed(0)}%;background:#5ad06a"></i></span></div>
      <div class="vital"><span>나이</span><span class="vbar"><i style="width:${(a.age / a.maxAge * 100).toFixed(0)}%;background:#9aa"></i></span></div>
      <div class="vrow"><span>자손 ${a.offspring}</span><span>적응도 ${a.fitness.toFixed(1)}</span></div>`;
  }

  markDead() {
    if (this.el.inspTitle) this.el.inspTitle.textContent += ' †';
    this.openAgent = null;
  }

  // Brain visualizer: input | hidden | output columns, edges colored by weight.
  drawBrain(a) {
    const cv = this.brainCv; if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const colX = [16, W / 2, W - 16];
    const g = a.genome;
    const yOf = (i, n) => (H - 12) * (i + 0.5) / n + 6;

    ctx.lineWidth = 0.6;
    for (let h = 0; h < N_HID; h++) {
      const base = h * N_IN;
      for (let i = 0; i < N_IN; i++) {
        const w = g[base + i];
        if (Math.abs(w) < 0.25) continue;
        ctx.strokeStyle = edgeColor(w);
        ctx.beginPath();
        ctx.moveTo(colX[0], yOf(i, N_IN));
        ctx.lineTo(colX[1], yOf(h, N_HID));
        ctx.stroke();
      }
    }
    for (let o = 0; o < N_OUT; o++) {
      const base = W_IH + o * N_HID;
      for (let h = 0; h < N_HID; h++) {
        const w = g[base + h];
        if (Math.abs(w) < 0.25) continue;
        ctx.strokeStyle = edgeColor(w);
        ctx.beginPath();
        ctx.moveTo(colX[1], yOf(h, N_HID));
        ctx.lineTo(colX[2], yOf(o, N_OUT));
        ctx.stroke();
      }
    }
    const node = (x, y, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); };
    for (let i = 0; i < N_IN; i++) node(colX[0], yOf(i, N_IN), '#8fd');
    for (let h = 0; h < N_HID; h++) node(colX[1], yOf(h, N_HID), '#ccd');
    for (let o = 0; o < N_OUT; o++) node(colX[2], yOf(o, N_OUT), '#fd8');
    ctx.fillStyle = '#aab'; ctx.font = '7px ui-sans-serif'; ctx.textAlign = 'right';
    for (let o = 0; o < N_OUT; o++) ctx.fillText(ACT[o], colX[2] - 5, yOf(o, N_OUT) + 2);
  }

  // ---- tribe inspector (context-aware: yours = control, foreign = diplomacy) ----
  renderTribe(tr, game) {
    this.openTribe = tr; this.openAgent = null;
    this.el.inspTitle.textContent = tr.name;
    const me = game.playerTribe;
    const isMine = me && me.id === tr.id;
    const foreign = me && !isMine;
    const STANCE_KO = { ally: '동맹', neutral: '중립', rival: '적대', war: '전쟁' };
    let actions;
    if (isMine) {
      actions = `<div class="insp-sub" style="color:${hueToCss(tr.hue)}">★ 당신의 민족</div>
        <div id="tribe-stats"></div>
        <div class="insp-actions"><button id="act-possess2">👁 시민 한 명에게 빙의</button></div>`;
    } else if (foreign) {
      const st = this._stance(me, tr);
      actions = `<div class="insp-sub" style="color:${hueToCss(tr.hue)}">라이벌 민족 — <span class="stance-badge stance-${st}">${STANCE_KO[st] || st}</span></div>
        <div id="tribe-stats"></div>
        <div class="trait-head">외교</div>
        <div class="insp-diplo">
          <button class="dbtn war" data-d="war">⚔ 선전포고</button>
          <button class="dbtn peace" data-d="peace">☮ 강화</button>
          <button class="dbtn ally" data-d="ally">🤝 동맹 제안</button>
        </div>
        <div class="trait-head">교역 (금화 → 그들의 물자)</div>
        <div class="insp-diplo">
          <button class="tbtn" data-buy="wood">🪵 8 · 6g</button>
          <button class="tbtn" data-buy="stone">🪨 8 · 8g</button>
          <button class="tbtn" data-buy="metal">⚒ 6 · 18g</button>
        </div>
        <div class="insp-actions"><button id="act-possess2">👁 시민 한 명에게 빙의</button></div>`;
    } else {
      // no player nation yet (Creative / observing) — offer to take them
      actions = `<div class="insp-sub" style="color:${hueToCss(tr.hue)}">진화하는 마음의 한 민족</div>
        <div id="tribe-stats"></div>
        <div class="insp-actions">
          <button id="act-playas2">⚑ 이 민족을 통치</button>
          <button id="act-possess2">👁 시민 한 명에게 빙의</button>
        </div>`;
    }
    this.el.inspBody.innerHTML = actions;
    this.refreshTribeStats();
    const pa = $('act-playas2'); if (pa) pa.onclick = () => game.playAsTribe(tr);
    const po = $('act-possess2'); if (po) po.onclick = () => this._possessCitizen(tr.id);
    if (foreign) {
      this.el.inspBody.querySelectorAll('.insp-diplo .dbtn').forEach((b) => {
        b.onclick = () => {
          const sim = this._sim(); const d = b.dataset.d;
          if (d === 'war') { const g = this._gov('declareWar'); if (g) g.declareWar(sim, me, tr); }
          else if (d === 'peace') { const g = this._gov('makePeace'); if (g) g.makePeace(sim, me, tr); }
          else if (d === 'ally') { const g = this._gov('proposeAlliance'); if (g) g.proposeAlliance(sim, me, tr); }
          this.renderTribe(tr, game); // refresh stance badge
        };
      });
      const TRADES = { wood: { gold: 6, amt: 8 }, stone: { gold: 8, amt: 8 }, metal: { gold: 18, amt: 6 } };
      const TRADE_NAME = { wood: '목재', stone: '돌', metal: '가공된 금속' };
      this.el.inspBody.querySelectorAll('.tbtn').forEach((b) => {
        b.onclick = () => {
          const g = this._gov('proposeTrade'); if (!g) return;
          const r = b.dataset.buy, deal = TRADES[r];
          const ok = g.proposeTrade(this._sim(), me, tr, { gold: deal.gold }, { [r]: deal.amt });
          this.toast({ type: ok ? 'info' : 'extinct', msg: ok ? `${tr.name}에게서 ${TRADE_NAME[r]} ${deal.amt}을(를) 구매했습니다` : `${tr.name}이(가) 교역을 거절합니다` });
        };
      });
    }
  }

  // ---- settlement inspector ----
  renderSettlement(s, tr, game) {
    this.openTribe = tr || null; this.openAgent = null;
    const tier = (typeof s.tier === 'number') ? s.tier : 0;
    const tierName = ['Camp', 'Village', 'Town', 'City'][tier] || 'Settlement';
    const tierNameKo = ['캠프', '촌락', '마을', '도시'][tier] || '정착지';
    const hue = tr ? tr.hue : 200;
    const me = game.playerTribe;
    const mine = me && tr && me.id === tr.id;
    const blds = (s.buildings || []).reduce((m, b) => { m[b.type] = (m[b.type] || 0) + 1; return m; }, {});
    const bldList = Object.keys(blds).map((k) => `${k}×${blds[k]}`).join(', ') || '빈 터';
    this.el.inspTitle.textContent = (s.name && s.name !== (tr && tr.name)) ? s.name : tierNameKo;
    const FOCUS_KO = { growth: '성장', build: '건축', military: '군사', gold: '금화', research: '연구' };
    const focusKo = FOCUS_KO[s.focus] || s.focus || '성장';
    this.el.inspBody.innerHTML = `
      <div class="insp-sub" style="color:${hueToCss(hue)}">${tierNameKo}${tr ? ' · ' + esc(tr.name) : ''}${mine ? ' ★' : ''}</div>
      <div class="vrow"><span>단계</span><span>${tierNameKo}</span></div>
      <div class="vrow"><span>민족</span><span>${tr ? esc(tr.name) : '—'}</span></div>
      <div class="vrow"><span>시대</span><span>${esc(this._eraName(tr))}</span></div>
      <div class="vrow"><span>인구</span><span>${tr ? tr.members : '—'}</span></div>
      <div class="trait-head">건축물</div>
      <div class="settle-blds">${esc(bldList)}</div>
      ${mine ? `<div class="trait-head">도시 초점 — <b>${esc(focusKo)}</b>${s.defense ? ' · 성벽 ' + (s.defense | 0) : ''}</div>
      <div class="insp-diplo">
        <button class="fbtn" data-f="growth" title="인구 성장">🌱</button>
        <button class="fbtn" data-f="build" title="성벽 / 방어 건설">🏛</button>
        <button class="fbtn" data-f="military" title="병사 훈련">⚔</button>
        <button class="fbtn" data-f="gold" title="금화 생산">🪙</button>
        <button class="fbtn" data-f="research" title="연구에 집중">🔬</button>
      </div>` : ''}
      <div class="insp-actions">
        ${tr ? (mine
          ? `<button id="act-focus">⚑ 통치 패널 열기</button>`
          : (me ? `<button id="act-war2" class="dbtn war">⚔ ${esc(tr.name)}에 선전포고</button>` : `<button id="act-playas3">⚑ ${esc(tr.name)} 통치</button>`)) : ''}
      </div>`;
    const f = $('act-focus'); if (f) f.onclick = () => { game.cam.setTarget(s.x, s.y, Math.max(game.cam.zoom, 9)); this.setNationTab('policies'); };
    this.el.inspBody.querySelectorAll('.fbtn').forEach((b) => {
      b.onclick = () => { s.focus = b.dataset.f; this.renderSettlement(s, tr, game); this.toast({ type: 'info', msg: `${s.name || '도시'}: ${FOCUS_KO[b.dataset.f] || b.dataset.f} 초점` }); };
    });
    const pa = $('act-playas3'); if (pa) pa.onclick = () => game.playAsTribe(tr);
    const w = $('act-war2'); if (w) w.onclick = () => { const g = this._gov('declareWar'); if (g && me && tr) g.declareWar(this._sim(), me, tr); };
  }

  refreshTribeStats() {
    const tr = this.openTribe; const el = $('tribe-stats'); if (!el) return;
    const era = this._eraName(tr);
    const faith = tr.religion ? tr.religion.name : '—';
    const sim = this._sim();
    const land = (sim && sim.territory) ? sim.territory.areaOf(tr.id) : 0;
    const govt = (sim && sim.civics) ? sim.civics.governmentName(tr) : '추장부';
    const ethos = tr.ethosName && tr.ethosName !== '—' ? tr.ethosName : '형성 중';
    const custom = (tr.customs && tr.customs.length) ? tr.customs[0] : '—';
    el.innerHTML = `
      <div class="vrow"><span>시대</span><span>${esc(era)}</span></div>
      <div class="vrow"><span>정치 체제</span><span>${esc(govt)}</span></div>
      <div class="vrow"><span>민족 기풍</span><span>${esc(ethos)}</span></div>
      <div class="vrow"><span>관습</span><span>${esc(custom)}</span></div>
      <div class="vrow"><span>인구</span><span>${tr.members}</span></div>
      <div class="vrow"><span>영토</span><span>${land} 타일</span></div>
      <div class="vrow"><span>최대 인구</span><span>${tr.peakMembers}</span></div>
      <div class="vrow"><span>출생 / 사망</span><span>${tr.births} / ${tr.deaths}</span></div>
      <div class="vrow"><span>전투 승리</span><span>${tr.kills}</span></div>
      <div class="vrow"><span>문화</span><span>${tr.culture.toFixed(1)}</span></div>
      <div class="vrow"><span>신앙</span><span>${esc(faith)}</span></div>
      <div class="vrow"><span>건국</span><span>${tr.foundedYear}년</span></div>`;
  }

  // ---- nation control HUD ----------------------------------------------
  showNationBar(tr, game) {
    this.el.nationBar.classList.remove('hidden');
    this.el.nationName.textContent = tr.name;
    this.el.nationFlag.style.color = hueToCss(tr.hue);
    this._diploSig = ''; this._researchSig = '';
    this.buildPolicies(tr);
    this.buildResearch(tr);
    this.buildDiplo(tr);
    this.buildDestiny(tr);
    this.setNationTab(this.nationTab);
    this.refreshNationBar();
  }

  hideNationBar() { this.el.nationBar.classList.add('hidden'); }

  setNationTab(tab) {
    this.nationTab = tab;
    document.querySelectorAll('.ntab').forEach((b) => b.classList.toggle('active', b.dataset.ntab === tab));
    document.querySelectorAll('.ntab-page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== tab));
  }

  // policy sliders (incl. research focus) — routed through GovernanceAPI.
  // Each carries a plain-language tip + a LIVE effect label so the player
  // learns cause -> effect as they drag.
  buildPolicies(tr) {
    this.el.nationPolicies.innerHTML = POLICIES.map(({ key, lo, hi, title, tip }) => {
      const v = (tr.policy && typeof tr.policy[key] === 'number') ? tr.policy[key] : 0;
      return `<div class="policy" data-tip="${esc(tip)}">
        <div class="policy-labels"><span>${lo}</span><span class="policy-key">${title}</span><span>${hi}</span></div>
        <input type="range" min="-1" max="1" step="0.05" value="${v}" data-key="${key}">
        <div class="policy-effect"><span class="pe-now" data-eff="${key}">${policyEffect(key, v)}</span></div>
      </div>`;
    }).join('');
    this.el.nationPolicies.querySelectorAll('input').forEach((inp) => {
      inp.oninput = () => {
        const k = inp.dataset.key, val = +inp.value;
        this._setPolicy(k, val);
        const eff = this.el.nationPolicies.querySelector(`[data-eff="${k}"]`);
        if (eff) eff.innerHTML = policyEffect(k, val);
      };
    });
  }

  _setPolicy(key, val) {
    const gov = this._gov('setPolicy');
    if (gov) gov.setPolicy(this._sim(), this.game.playerTribe, key, val);
    else this.game.setPolicy(key, val); // fallback for the 3 sim-read levers
  }

  buildResearch(tr) {
    const sim = this._sim();
    const avail = (sim && sim.tech && typeof sim.tech.available === 'function') ? sim.tech.available(tr) : [];
    this._researchSig = avail.map((d) => d.id).join(',');
    const prio = this._priority(tr);
    const opts = [`<option value="">자동 — 가장 싼 가지를 탐구</option>`]
      .concat(avail.map((d) =>
        `<option value="${d.id}"${d.id === prio ? ' selected' : ''}>${esc(d.name)} · ${esc(this._eraNameOf(d.era))}</option>`))
      .join('');
    this.el.nationResearch.innerHTML = `
      <div class="nation-line" id="research-line"></div>
      <label class="pick-label">연구 우선 과제</label>
      <select class="picker" id="tech-pick">${opts}</select>
      <div class="pick-hint">백성이 다음으로 무엇을 연구할지 우선순위를 두세요 — 그래도 인구와 문화라는 조건은 따라옵니다.</div>`;
    const sel = $('tech-pick');
    sel.onchange = () => this._setPriority(sel.value || null);
    this._refreshResearchLine(tr);
  }

  _refreshResearchLine(tr) {
    const line = $('research-line'); if (!line) return;
    const known = (tr.tech && tr.tech.known) ? tr.tech.known.size : 0;
    const pts = (tr.tech && typeof tr.tech.points === 'number') ? Math.floor(tr.tech.points) : 0;
    line.innerHTML = `<span>${esc(this._eraName(tr))}</span><span>${known} / ${TECHS.length} 기술 · ${pts} 점</span>`;
  }

  _priority(tr) {
    const gov = this._gov('getPriority');
    if (gov) { try { return gov.getPriority(this._sim(), tr) || ''; } catch { /* ignore */ } }
    return (tr.tech && tr.tech.priority) ? tr.tech.priority : '';
  }

  _setPriority(techId) {
    const tr = this.game.playerTribe; if (!tr) return;
    const gov = this._gov('prioritizeTech');
    if (gov) gov.prioritizeTech(this._sim(), tr, techId);
    else if (tr.tech) tr.tech.priority = techId; // forward-compatible hint for Tech/Statecraft
  }

  buildDiplo(tr) {
    const sim = this._sim();
    const others = this._otherTribes(tr);
    this._diploSig = others.map((t) => t.id).join(',');
    const govReady = !!this._gov('declareWar') || !!this._gov('setStance');
    const STANCE_KO = { ally: '동맹', neutral: '중립', rival: '적대', war: '전쟁' };
    if (!others.length) {
      this.el.nationDiplo.innerHTML = `<div class="empty-note">세상에 다른 민족이 없습니다 — 당신만 홀로 서 있습니다.</div>`;
      return;
    }
    const rows = others.map((t) => {
      const st = this._stance(tr, t);
      const stKo = STANCE_KO[st] || st;
      return `<div class="diplo-row" data-tid="${t.id}">
        <span class="swatch" style="background:${hueToCss(t.hue)}"></span>
        <span class="diplo-name">${esc(t.name)}</span>
        <span class="stance-badge stance-${st}" data-stance>${stKo}</span>
        <span class="diplo-meta" data-meta></span>
        <span class="diplo-btns">
          <button class="dbtn war" data-act="war" data-tid="${t.id}" title="선전포고">⚔</button>
          <button class="dbtn peace" data-act="peace" data-tid="${t.id}" title="강화">☮</button>
          <button class="dbtn ally" data-act="ally" data-tid="${t.id}" title="동맹 제안">🤝</button>
          <button class="dbtn" data-act="neutral" data-tid="${t.id}" title="중립으로">•</button>
        </span></div>`;
    }).join('');
    this.el.nationDiplo.innerHTML =
      (govReady ? '' : `<div class="empty-note warn">외교 기능은 정치 시스템이 활성화되면 켜집니다 — 현재 자세를 읽기 전용으로 표시합니다.</div>`) +
      rows;
    if (!govReady) this.el.nationDiplo.querySelectorAll('.dbtn').forEach((b) => { b.disabled = true; });
    this._refreshDiplo(tr);
  }

  _refreshDiplo(tr) {
    const sim = this._sim();
    const STANCE_KO = { ally: '동맹', neutral: '중립', rival: '적대', war: '전쟁' };
    this.el.nationDiplo.querySelectorAll('.diplo-row').forEach((row) => {
      const t = sim && sim.tribes ? sim.tribes.get(+row.dataset.tid) : null;
      if (!t) return;
      const st = this._stance(tr, t);
      const badge = row.querySelector('[data-stance]');
      if (badge) { badge.textContent = STANCE_KO[st] || st; badge.className = `stance-badge stance-${st}`; }
      const meta = row.querySelector('[data-meta]');
      if (meta) {
        const wp = this._warPressure(t, tr); // pressure THEY feel toward us
        meta.textContent = (wp != null) ? `위험도 ${wp.toFixed(0)}` : `${t.members}`;
      }
    });
  }

  _onDiploClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const sim = this._sim();
    const me = this.game.playerTribe;
    const other = sim && sim.tribes ? sim.tribes.get(+btn.dataset.tid) : null;
    if (!me || !other) return;
    const act = btn.dataset.act;
    if (act === 'war') { const g = this._gov('declareWar'); if (g) g.declareWar(sim, me, other); }
    else if (act === 'peace') { const g = this._gov('makePeace'); if (g) g.makePeace(sim, me, other); }
    else if (act === 'ally') { const g = this._gov('proposeAlliance'); if (g) g.proposeAlliance(sim, me, other); }
    else if (act === 'neutral') { const g = this._gov('setStance'); if (g) g.setStance(sim, me, other, 'neutral'); }
    this._refreshDiplo(me);
  }

  buildDestiny(tr) {
    const list = this._destinies();
    if (!list.length) {
      this.el.nationDestiny.innerHTML = `<div class="empty-note">숙원(승리 목표 선택)은 정치 시스템이 활성화되면 켜집니다.</div>`;
      return;
    }
    const chosen = this._chosenDestiny(tr);
    const opts = [`<option value="">숙원 없음 — 그냥 살아남기</option>`]
      .concat(list.map((d) => `<option value="${d.id}"${d.id === chosen ? ' selected' : ''}>${esc(d.name)}</option>`))
      .join('');
    this.el.nationDestiny.innerHTML = `
      <label class="pick-label">선택한 숙원</label>
      <select class="picker" id="destiny-pick">${opts}</select>
      <div class="pick-hint" id="destiny-desc"></div>
      <div class="destiny-prog"><span class="destiny-bar"><i id="destiny-bar"></i></span><span id="destiny-pct">—</span></div>`;
    const sel = $('destiny-pick');
    sel.onchange = () => {
      const g = this._gov('setDestiny');
      if (g) g.setDestiny(this._sim(), this.game.playerTribe, sel.value || null);
      this._refreshDestiny(this.game.playerTribe);
    };
    this._refreshDestiny(tr);
  }

  _refreshDestiny(tr) {
    const sel = $('destiny-pick'); if (!sel) return;
    const def = this._destinies().find((d) => d.id === (sel.value || this._chosenDestiny(tr)));
    const desc = $('destiny-desc'), bar = $('destiny-bar'), pct = $('destiny-pct');
    if (!def) {
      if (desc) desc.textContent = '오래 살아남는 것을 목표로 삼거나, 아니면 그냥 버텨내세요.';
      if (bar) bar.style.width = '0%';
      if (pct) pct.textContent = '—';
      return;
    }
    const p = this._destinyProgress(def, tr);
    const done = this._destinyDone(def, tr);
    if (desc) desc.textContent = def.desc || '';
    if (bar) bar.style.width = `${(p * 100).toFixed(0)}%`;
    if (pct) pct.textContent = done ? '✓ 달성' : `${(p * 100).toFixed(0)}%`;
  }

  // live header + stats + tab refresh while leading
  refreshNationBar() {
    const tr = this.game.playerTribe; if (!tr) return;
    this.el.nationName.textContent = `${tr.name} — ${tr.members}명의 백성`;
    // stats line
    const settle = this._settlementCount(tr.id);
    const faith = tr.religion ? tr.religion.name : '없음';
    const st = tr.stock || { wood: 0, stone: 0, ore: 0 };
    const sim = this._sim();
    const govt = (sim && sim.civics) ? sim.civics.governmentName(tr) : '추장부';
    this.el.nationStats.innerHTML = `
      <span class="nstat">${esc(this._eraName(tr))}</span>
      <span class="nstat" title="정치 체제">⚖ ${esc(govt)}</span>
      <span class="nstat">◉ ${tr.members}</span>
      <span class="nstat">⌂ ${settle}</span>
      <span class="nstat" title="목재">🪵 ${st.wood | 0}</span>
      <span class="nstat" title="돌">🪨 ${st.stone | 0}</span>
      <span class="nstat" title="광석">⛏ ${st.ore | 0}</span>
      <span class="nstat" title="가공된 금속">⚒ ${st.metal | 0}</span>
      <span class="nstat">✦ ${faith === '없음' ? '신앙 없음' : esc(faith)}</span>`;
    // rebuild lists only when their membership/availability actually changed
    const others = this._otherTribes(tr);
    const dsig = others.map((t) => t.id).join(',');
    if (dsig !== this._diploSig) this.buildDiplo(tr); else if (this.nationTab === 'diplo') this._refreshDiplo(tr);
    const avail = (sim && sim.tech && typeof sim.tech.available === 'function') ? sim.tech.available(tr) : [];
    const rsig = avail.map((d) => d.id).join(',');
    if (rsig !== this._researchSig) this.buildResearch(tr); else this._refreshResearchLine(tr);
    if (this.nationTab === 'destiny') this._refreshDestiny(tr);
  }

  // ---- nations browser panel -------------------------------------------
  toggleNations() { this._natOpen ? this.closeNations() : this.openNations(); }

  openNations() {
    this._natOpen = true;
    this.el.nationsPanel.classList.remove('hidden');
    if (this.el.btnNations) this.el.btnNations.classList.add('active');
    this._natSig = '';
    this.refreshNationsPanel();
  }

  closeNations() {
    this._natOpen = false;
    this.el.nationsPanel.classList.add('hidden');
    if (this.el.btnNations) this.el.btnNations.classList.remove('active');
  }

  refreshNationsPanel() {
    const sim = this._sim(); if (!sim) return;
    const living = [...sim.tribes.values()].filter((t) => t.members > 0).sort((a, b) => b.members - a.members);
    const sig = living.map((t) => t.id).join(',');
    if (sig !== this._natSig) {
      this._natSig = sig;
      this._natRows.clear();
      if (!living.length) {
        this.el.nationsList.innerHTML = `<div class="empty-note">아직 살아있는 민족이 없습니다. ✿ 생명 창조 도구로 한 민족을 심어보세요.</div>`;
        return;
      }
      this.el.nationsList.innerHTML = living.map((t) => `
        <div class="nat-row" data-tid="${t.id}">
          <button class="nat-main" data-focus="${t.id}">
            <span class="swatch" style="background:${hueToCss(t.hue)}"></span>
            <span class="nat-text"><span class="nat-name">${esc(t.name)}</span>
              <span class="nat-meta" data-meta></span></span>
          </button>
          <div class="nat-acts hidden">
            <button class="nat-act" data-act="playas" data-tid="${t.id}">⚑ 통치</button>
            <button class="nat-act" data-act="watch" data-tid="${t.id}">🎥 관찰</button>
            <button class="nat-act" data-act="possess" data-tid="${t.id}">👁 빙의</button>
          </div>
        </div>`).join('');
      this.el.nationsList.querySelectorAll('.nat-row').forEach((row) =>
        this._natRows.set(+row.dataset.tid, row.querySelector('[data-meta]')));
    }
    // update meta text in place
    for (const [tid, metaEl] of this._natRows) {
      const t = sim.tribes.get(tid);
      if (!t || !metaEl) continue;
      const faith = t.religion ? ' · ' + t.religion.name : '';
      metaEl.textContent = `${this._eraName(t)} · ${t.members}명${faith}`;
    }
  }

  _onNationsClick(e) {
    const main = e.target.closest('button[data-focus]');
    if (main) {
      const tid = +main.dataset.focus;
      const tr = this._sim().tribes.get(tid);
      if (tr) this._focusTribe(tr);
      const row = main.closest('.nat-row');
      const acts = row && row.querySelector('.nat-acts');
      // collapse others, toggle this one
      this.el.nationsList.querySelectorAll('.nat-acts').forEach((a) => { if (a !== acts) a.classList.add('hidden'); });
      if (acts) acts.classList.toggle('hidden');
      return;
    }
    const act = e.target.closest('button[data-act]');
    if (!act) return;
    const tid = +act.dataset.tid;
    const tr = this._sim().tribes.get(tid);
    if (!tr) return;
    if (act.dataset.act === 'playas') this.game.playAsTribe(tr);
    else if (act.dataset.act === 'watch') { this._focusTribe(tr); this.showInspector({ tribe: tr }, this.game); }
    else if (act.dataset.act === 'possess') this._possessCitizen(tid);
  }

  _focusTribe(tr) {
    const cam = this.game.cam;
    cam.setTarget(tr.capitalX, tr.capitalY, Math.max(cam.zoom, 9));
  }

  _possessCitizen(tid) {
    const sim = this._sim();
    const a = sim.pool.agents.find((x) => x.alive && x.tribeId === tid);
    if (a) this.game.possess(a);
    else this.toast({ type: 'info', msg: '그 민족에는 빙의할 살아있는 시민이 없습니다.' });
  }

  // ---- menu ------------------------------------------------------------
  toggleMenu() {
    if (!this.el.menuModal) return;
    this.el.menuModal.classList.contains('hidden') ? this.openMenu() : this.closeMenu();
  }
  openMenu() { this._syncMenu(); this.el.menuModal.classList.remove('hidden'); }
  closeMenu() { this.el.menuModal.classList.add('hidden'); }

  _buildMenu() {
    if (this._menuBuilt || !this.el.menuCard) return;
    this._menuBuilt = true;
    const tools = Object.values(TOOL_INFO).map((t) =>
      `<div class="legend-row"><span class="legend-ico">${t.icon}</span>
        <span class="legend-name">${t.name}</span><span class="legend-key">${t.hotkey}</span>
        <span class="legend-desc">${esc(t.desc)}</span></div>`).join('');
    const controls = CONTROLS.map(([k, d]) =>
      `<div class="legend-row ctl"><span class="legend-key wide">${esc(k)}</span><span class="legend-desc">${esc(d)}</span></div>`).join('');
    this.el.menuCard.innerHTML = `
      <div class="menu-head"><h2>AEON</h2><button class="panel-close" id="menu-close">✕</button></div>
      <p class="menu-about">진화하는 마음들이 사는 살아있는 세계. 당신은 이 세계의 신이며, 어느 한 민족에 내려가 그 지도자가 될 수도 있습니다. 모든 처리가 사용자 컴퓨터 안에서만 돌아갑니다 — 외부로 나가는 데이터는 없습니다.</p>
      <div class="menu-section"><h3>세계</h3>
        <div class="menu-btns">
          <button class="menu-btn" id="menu-restart">🌍 세계 새로 시작 (새 시드)</button>
          <button class="menu-btn" id="menu-pause">⏸ 일시정지</button>
          <button class="menu-btn" id="menu-speed">▶ 속도</button>
          <button class="menu-btn" id="menu-nations">⚑ 민족 선택</button>
        </div>
      </div>
      <div class="menu-section"><h3>민족을 이끌기</h3>
      <p class="menu-tip">상단 바의 <b>⚑ 민족</b>을 열거나 지도 위의 한 민족을 클릭한 뒤 <b>통치</b>를 선택해 백성을 이끄세요. 정책 슬라이더로 의지를 정하고, 연구·외교를 조종하며, 숙원을 골라 한 방향으로 나아가게 합니다. 당신은 길잡이이고, 결정은 각자의 진화한 마음이 내립니다.</p>
        <div class="menu-btns" style="margin-top:9px;">
          <button class="menu-btn" id="menu-howto">❔ 플레이 방법</button>
          <button class="menu-btn" id="menu-tutorial">🎓 둘러보기 다시 재생</button>
        </div>
      </div>
      <div class="menu-section"><h3>조작</h3><div class="legend">${controls}</div></div>
      <div class="menu-section"><h3>신의 손</h3><div class="legend">${tools}</div></div>`;
    $('menu-close').onclick = () => this.closeMenu();
    $('menu-restart').onclick = () => { if (confirm('새 시드로 세계를 새로 시작합니다. 현재 세계는 사라집니다. 계속할까요?')) location.reload(); };
    $('menu-pause').onclick = () => { if (this.game) { this.game.togglePause(); this._syncMenu(); } };
    $('menu-speed').onclick = () => { if (this.game) { this.game.cycleSpeed(); this._syncMenu(); } };
    $('menu-nations').onclick = () => { this.closeMenu(); this.openNations(); };
    if ($('menu-howto')) $('menu-howto').onclick = () => { this.closeMenu(); $('modal').classList.remove('hidden'); };
    if ($('menu-tutorial')) $('menu-tutorial').onclick = () => { this.closeMenu(); this.showTutorial(); };
  }

  _syncMenu() {
    const sp = this.game ? this.game.speed : 1;
    const pb = $('menu-pause'), sb = $('menu-speed');
    if (pb) pb.textContent = sp === 0 ? '▶ 재개' : '⏸ 일시정지';
    if (sb) sb.textContent = sp === 0 ? '▶ 속도' : `▶ 속도 ${sp}×`;
  }

  // ---- onboarding hint -------------------------------------------------
  _showOnboard() {
    if (this._onboardShown) return;
    // wait until the intro modal is dismissed so the hint isn't lost behind it
    const intro = $('modal');
    if (intro && !intro.classList.contains('hidden')) return;
    this._onboardShown = true;
    const d = document.createElement('div');
    d.id = 'onboard';
    d.innerHTML = `<span>이끌 민족을 골라보세요 — 상단의 <b>⚑ 민족</b>을 열거나 지도 위의 한 민족을 클릭하면 됩니다. 신의 시점으로 세계를 조각하는 것도 가능합니다.</span>
      <button id="onboard-x" aria-label="닫기">✕</button>`;
    this.el.hud.appendChild(d);
    requestAnimationFrame(() => d.classList.add('show'));
    $('onboard-x').onclick = () => this._dismissOnboard();
    this._onboardTimer = setTimeout(() => this._dismissOnboard(), 16000);
  }
  _dismissOnboard() {
    const d = $('onboard'); if (!d) return;
    clearTimeout(this._onboardTimer);
    d.classList.remove('show');
    setTimeout(() => d.remove(), 400);
  }

  // ---- first-time Survival tutorial (coach-marks) ----------------------
  _maybeTutorial() {
    if (this._tutorialOpen || document.getElementById('tutorial')) return;
    let seen = false;
    try { seen = localStorage.getItem('aeon_tutorial_seen') === '1'; } catch { /* no storage */ }
    if (seen) return;
    this._startTutorial();
  }

  // public: lets the "?" / menu re-open the walkthrough on demand
  showTutorial() {
    if (document.getElementById('tutorial')) return;
    this._startTutorial();
  }

  _startTutorial() {
    this._tutorialOpen = true;
    this._tutStep = 0;
    const root = document.createElement('div');
    root.id = 'tutorial';
    root.innerHTML = `<div class="tut-card">
        <div class="tut-step-ico"></div>
        <h3></h3>
        <p></p>
        <div class="tut-keys"></div>
        <div class="tut-foot">
          <div class="tut-dots"></div>
          <div class="tut-btns">
            <button class="tut-skip">건너뛰기</button>
            <button class="tut-next">다음</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('.tut-skip').onclick = () => this._endTutorial();
    root.querySelector('.tut-next').onclick = () => this._tutAdvance();
    this._renderTutorial();
  }

  _renderTutorial() {
    const root = document.getElementById('tutorial'); if (!root) return;
    const s = TUTORIAL[this._tutStep];
    root.querySelector('.tut-step-ico').textContent = s.ico;
    root.querySelector('.tut-card h3').textContent = s.title;
    root.querySelector('.tut-card p').innerHTML = safeTip(s.body);
    const keys = root.querySelector('.tut-keys');
    keys.innerHTML = (s.keys || []).map((k) => `<span class="how-key">${esc(k)}</span>`).join('');
    keys.style.display = (s.keys && s.keys.length) ? 'flex' : 'none';
    const dots = root.querySelector('.tut-dots');
    dots.innerHTML = TUTORIAL.map((_, i) => `<span class="tut-dot${i === this._tutStep ? ' on' : ''}"></span>`).join('');
    const next = root.querySelector('.tut-next');
    next.textContent = (this._tutStep >= TUTORIAL.length - 1) ? '시작하기' : '다음';
  }

  _tutAdvance() {
    if (this._tutStep >= TUTORIAL.length - 1) { this._endTutorial(); return; }
    this._tutStep++;
    this._renderTutorial();
  }

  _endTutorial() {
    const root = document.getElementById('tutorial');
    if (root) { root.style.opacity = '0'; setTimeout(() => root.remove(), 250); }
    this._tutorialOpen = false;
    try { localStorage.setItem('aeon_tutorial_seen', '1'); } catch { /* no storage */ }
  }

  // ---- found-mode banner (twin of setCommandBanner, for discoverability) ----
  setFoundBanner(on) {
    const b = document.getElementById('found-banner');
    if (b) b.classList.toggle('hidden', !on);
    const btn = document.getElementById('nation-found');
    if (btn) btn.classList.toggle('lit', !!on);
  }

  // keep Found button + banner legible: clear the banner when found-mode ends,
  // and disable the button with a why-tooltip when you can't afford a city.
  _syncFoundState() {
    const tr = this.game.playerTribe; if (!tr) return;
    const btn = document.getElementById('nation-found');
    if (btn) {
      const gold = Math.floor(tr.gold || 0);
      const broke = gold < 10;
      btn.disabled = broke;
      btn.setAttribute('data-tip', broke
        ? `<b>도시 세우기</b> — <b>금화 10</b>이 필요합니다 (현재 ${gold}개). 도시의 초점을 🪙 금화로 두거나 교역으로 모을 수 있습니다.`
        : '<b>도시 세우기</b> (금화 10) — 비옥하고 비어 있는 땅을 클릭해 도시를 세우세요. 새로운 도시는 백성과 경제를 키웁니다.');
    }
    // game clears foundMode after the click resolves; mirror that to the banner
    if (!this.game.foundMode) this.setFoundBanner(false);
  }

  // ---- tooltip ---------------------------------------------------------
  _buildTooltip() {
    this._tip = document.createElement('div');
    this._tip.id = 'tooltip';
    this._tip.className = 'hidden';
    document.body.appendChild(this._tip);
    // Delegated data-tip system: any element (now or added later) carrying a
    // [data-tip] attribute gets a plain-language tooltip on hover. Replaces the
    // browser's native title=, positioned on-screen and flipped near edges.
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t || t.classList.contains('tool')) return; // .tool uses the rich tip
      this._showDataTip(t);
    });
    document.addEventListener('mouseout', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t && !t.classList.contains('tool')) this._hideTip();
    });
  }
  // rich tip for the god-tool dock (icon + name + hotkey)
  _showTip(btn, info) {
    this._tip.innerHTML = `<div class="tip-head"><b>${info.name}</b><span class="tip-key">${info.hotkey}</span></div>
      <div class="tip-desc">${esc(info.desc)}</div>`;
    this._placeTip(btn, 'right');
  }
  // plain tip from a data-tip attribute (limited HTML: <b> only)
  _showDataTip(el) {
    const html = el.getAttribute('data-tip'); if (!html) return;
    this._tip.innerHTML = `<div class="tip-simple">${safeTip(html)}</div>`;
    this._placeTip(el, 'auto');
  }
  // place the tooltip near an element, flipping to stay on-screen
  _placeTip(el, prefer) {
    const r = el.getBoundingClientRect();
    this._tip.classList.remove('hidden');
    const tw = this._tip.offsetWidth || 220, th = this._tip.offsetHeight || 60;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 9;
    let left, top;
    if (prefer === 'right') {
      // dock tools: prefer to the right, flip to the left if it would clip
      left = (r.right + gap + tw > vw) ? r.left - gap - tw : r.right + gap;
      top = r.top;
    } else {
      // auto: prefer below; flip above near the bottom edge
      top = (r.bottom + gap + th > vh) ? r.top - gap - th : r.bottom + gap;
      left = r.left + r.width / 2 - tw / 2;
    }
    left = Math.max(6, Math.min(left, vw - tw - 6));
    top = Math.max(6, Math.min(top, vh - th - 6));
    this._tip.style.left = `${left}px`;
    this._tip.style.top = `${top}px`;
  }
  _hideTip() { if (this._tip) this._tip.classList.add('hidden'); }

  // ---- shared little reads --------------------------------------------
  _eraName(tr) {
    const sim = this._sim();
    const era = (tr && tr.tech && typeof tr.tech.era === 'number') ? tr.tech.era : 0;
    if (sim && sim.tech && typeof sim.tech.eraName === 'function') return sim.tech.eraName(era);
    return `Era ${era}`;
  }
  _eraNameOf(era) {
    const sim = this._sim();
    if (sim && sim.tech && typeof sim.tech.eraName === 'function') return sim.tech.eraName(era || 0);
    return `Era ${era || 0}`;
  }
  _settlementCount(tid) {
    const sim = this._sim();
    if (sim && sim.settleSys && typeof sim.settleSys.countOf === 'function') return sim.settleSys.countOf(tid);
    return 0;
  }
  _otherTribes(tr) {
    const sim = this._sim();
    if (!sim) return [];
    return [...sim.tribes.values()].filter((t) => t.members > 0 && t.id !== tr.id).sort((a, b) => a.id - b.id);
  }

  // diplomacy reads (defensive across however statecraft exposes state)
  _stance(a, b) {
    const sim = this._sim();
    const g = this.game && this.game.gov;
    try {
      if (g && typeof g.getStance === 'function') { const s = g.getStance(sim, a, b); if (s) return s; }
      if (g && typeof g.stanceOf === 'function') { const s = g.stanceOf(sim, a, b); if (s) return s; }
    } catch { /* ignore */ }
    const d = sim && sim.diplomacy;
    try {
      if (d && typeof d.getStance === 'function') { const s = d.getStance(a, b); if (s) return s; }
      if (d && typeof d.stanceOf === 'function') { const s = d.stanceOf(a, b); if (s) return s; }
    } catch { /* ignore */ }
    if (a && a.stances) { const s = a.stances.get ? a.stances.get(b.id) : a.stances[b.id]; if (s && STANCES.includes(s)) return s; }
    return 'neutral';
  }
  _warPressure(a, b) {
    const sim = this._sim();
    const g = this.game && this.game.gov;
    try { if (g && typeof g.warPressure === 'function') { const v = g.warPressure(sim, a, b); if (typeof v === 'number') return v; } } catch { /* ignore */ }
    const d = sim && sim.diplomacy;
    try { if (d && typeof d.warPressure === 'function') { const v = d.warPressure(a, b); if (typeof v === 'number') return v; } } catch { /* ignore */ }
    return null;
  }

  // destiny reads
  _destinies() {
    const g = this.game && this.game.gov;
    if (g && Array.isArray(g.DESTINIES)) return g.DESTINIES;
    return [];
  }
  _chosenDestiny(tr) {
    const sim = this._sim();
    const g = this.game && this.game.gov;
    try { if (g && typeof g.getDestiny === 'function') { const v = g.getDestiny(sim, tr); return (v && v.id) ? v.id : v; } } catch { /* ignore */ }
    if (tr && tr.destiny != null) return (typeof tr.destiny === 'object') ? tr.destiny.id : tr.destiny;
    if (tr && tr.destinyId != null) return tr.destinyId;
    return null;
  }
  _destinyProgress(def, tr) {
    const sim = this._sim();
    try { if (def && typeof def.progress === 'function') { const v = +def.progress(sim, tr); return v > 1 ? 1 : (v < 0 || Number.isNaN(v) ? 0 : v); } } catch { /* ignore */ }
    return 0;
  }
  _destinyDone(def, tr) {
    const sim = this._sim();
    try { if (def && typeof def.done === 'function') return !!def.done(sim, tr); } catch { /* ignore */ }
    return false;
  }

  setPossession(agent, game) {
    if (agent) this.toast({ type: 'info', msg: `당신은 ${agent.name}입니다. WASD로 이동 · Esc로 빙의 해제.` });
  }

  // ---- event log toasts ----
  // ---- end screen (#8 fail-state / victory) ----------------------------
  // game.js detects defeat (player nation wiped) and victory (player reaches the
  // Information Age) and calls this. It surfaces a real run-summary overlay — the
  // thing that makes AEON winnable AND losable rather than soft-locking at 0 souls.
  showEndScreen(kind, tribe, game) {
    if (document.getElementById('endscreen')) return; // already up
    const win = kind === 'victory';
    const sim = (game && game.sim) || this._sim();
    const yrs = (sim && tribe) ? Math.max(0, sim.year() - (tribe.foundedYear || 0)) : 0;
    const era = (tribe && tribe.tech) ? ERAS[tribe.tech.era] || ERAS[0] : ERAS[0];
    const peak = tribe ? (tribe.peakMembers || 0) : 0;
    const gens = sim ? (sim.maxGen || 0) : 0;
    const cities = (sim && tribe && sim.settleSys) ? sim.settleSys.countOf(tribe.id) : 0;
    const name = tribe ? tribe.name : '당신의 백성';
    const ico = win ? '🏛️' : '🕯️';
    const title = win ? '문명이 살아남았습니다' : '백성이 떠났습니다';
    const blurb = win
      ? `${name}은(는) 단 하나의 진화하는 혈통을 모닥불에서 정보 시대까지 끌고 갔습니다. ${gens}세대의 진짜 마음들이 여기까지 데려왔습니다.`
      : `${name}이(가) 사라졌습니다. 모든 시민은 진짜 신경망이었습니다 — 그들이 배운 것은 사라졌지만, 세계는 그들을 기억합니다.`;
    const stats = [
      ['살아온 해', yrs],
      ['도달한 시대', era],
      ['최대 인구', peak],
      ['진화한 세대', gens],
      ['세운 도시', cities],
    ];
    const root = document.createElement('div');
    root.id = 'endscreen';
    root.className = `endscreen ${win ? 'win' : 'lose'}`;
    root.innerHTML = `<div class="end-card">
        <div class="end-ico">${ico}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(blurb)}</p>
        <div class="end-stats">${stats.map(([k, v]) =>
          `<div class="end-stat"><span class="end-k">${esc(k)}</span><span class="end-v">${esc(v)}</span></div>`).join('')}</div>
        <div class="end-btns">
          <button class="end-watch">계속 관찰</button>
          <button class="end-restart">새 세계</button>
        </div>
      </div>`;
    if (tribe) root.style.setProperty('--end-hue', hueToCss(tribe.hue));
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('show'));
    root.querySelector('.end-restart').onclick = () => location.reload();
    root.querySelector('.end-watch').onclick = () => {
      root.classList.remove('show');
      setTimeout(() => root.remove(), 300);
    };
  }

  toast(e) {
    const div = document.createElement('div');
    div.className = `toast toast-${e.type || 'info'}`;
    if (e.color != null) div.style.borderLeftColor = hueToCss(e.color);
    // 영문 enum (TIERS, tech name 등)을 한글 라벨로 변환 — 게임 코드 식별자는 보존
    div.textContent = localizeEnum(e.msg);
    this.el.eventlog.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, 4200);
    while (this.el.eventlog.children.length > 5) this.el.eventlog.firstChild.remove();
  }
}

function edgeColor(w) {
  const a = Math.min(0.85, Math.abs(w) * 0.5 + 0.12);
  return w > 0 ? `rgba(90,150,255,${a})` : `rgba(255,90,90,${a})`;
}
function traitColor(t) {
  const map = { size: '#c97', speed: '#7cf', metabolism: '#fc6', fertility: '#f9c',
    aggression: '#f66', vision: '#9df', diet: '#f85', resilience: '#7d9' };
  return map[t] || '#9ad';
}
function esc(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
// tooltip text: fully escape, then re-allow only <b>…</b> (our data-tip authoring).
function safeTip(s) {
  return esc(s).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
}
