// Tech progression — the headline mechanic: a gated tech tree with eras a civ
// must "build up to." Water travel needs Sailing, air travel needs Flight,
// metals need Iron Working, science needs the Scientific Method, and so on.
//
// This is LAYER-2 in the DESIGN two-layer mind: techs are data tokens a tribe
// accrues from its population + culture (which itself emerges from the evolved
// brains' `speak` acts). Tech does NOT touch a creature's neural net — it raises
// tribe-wide CAPS (multipliers + ability flags) that the sim reads in its hot
// paths. So "every person has a real brain" stays literally true; civilization
// is the legible memetic layer on top.
//
// Pure data + functions. No imports from sim internals — the sim passes in the
// tribe and its own deterministic rng. `accrue` runs once per tribe per sim-year
// (not per tick), so it is not a hot path; the hot-path cost is just property
// reads of tribe.caps in sim.step().

// Era names, indexed by tech.era (0..8).
export const ERAS = [
  '석기 시대',     // 0 - Stone Age
  '청동기 시대',    // 1 - Bronze Age
  '철기 시대',      // 2 - Iron Age
  '고전 시대',      // 3 - Classical Era
  '중세 시대',      // 4 - Medieval Era
  '르네상스',       // 5 - Renaissance
  '산업 시대',      // 6 - Industrial Age
  '근대 시대',      // 7 - Modern Era
  '정보 시대',      // 8 - Information Age
];

// The tree. Ordered roughly by era then dependency. Each def:
//   id      stable string key (referenced by prereqs / tribe.tech.known)  ← 영문 식별자 (보존)
//   name    human-readable label (for toasts / the tech panel)             ← 한글 표시
//   era     index into ERAS — also drives the tribe's current era
//   prereqs array of tech ids that must be known first ([] = root tech)    ← 영문 식별자 (보존)
//   cost    research points to unlock
//   desc    one-line flavor for the UI                                     ← 한글 표시
//   effect  caps it contributes (see recompute for how they combine):
//             foodYield, moveMul, combat, researchMul, healthRegen, storage
//               -> multiplicative (default 1)
//             seafaring, flight -> boolean OR (default false)
export const TECHS = [
  // --- 석기 시대 (0) ------------------------------------------------------
  { id: 'Fire', name: '불', era: 0, prereqs: [], cost: 8,
    desc: '불을 다루다 — 온기와 요리와 보호.',
    effect: { foodYield: 1.1, healthRegen: 1.1 } },
  { id: 'StoneTools', name: '석기', era: 0, prereqs: [], cost: 10,
    desc: '간 돌로 만든 — 더 날카로운 도구와 무기.',
    effect: { combat: 1.12, foodYield: 1.08 } },
  { id: 'Agriculture', name: '농업', era: 0, prereqs: ['Fire', 'StoneTools'], cost: 30,
    desc: '채집 대신 땅을 일구다.',
    effect: { foodYield: 1.5 } },
  { id: 'AnimalHusbandry', name: '목축', era: 0, prereqs: ['Agriculture'], cost: 38,
    desc: '말과 가축을 길들여 — 타고 나르다.',
    effect: { moveMul: 1.25, foodYield: 1.15 } },
  { id: 'Pottery', name: '토기', era: 0, prereqs: ['Agriculture'], cost: 34,
    desc: '구운 흙그릇 — 흉년을 대비해 식량과 물을 저장.',
    effect: { storage: 1.4 } },

  // --- 청동기 시대 (1) -----------------------------------------------------
  { id: 'Wheel', name: '바퀴', era: 1, prereqs: ['AnimalHusbandry'], cost: 50,
    desc: '바퀴와 수레 — 사람과 물자를 옮기다.',
    effect: { moveMul: 1.2 } },
  { id: 'Writing', name: '문자', era: 1, prereqs: ['Pottery'], cost: 52,
    desc: '지식을 기록 — 생각이 만든 자가 죽어도 남는다.',
    effect: { researchMul: 1.3 } },
  { id: 'Bronzeworking', name: '청동 제작', era: 1, prereqs: ['Pottery', 'StoneTools'], cost: 58,
    desc: '구리와 주석의 합금 — 최초의 금속 시대.',
    effect: { combat: 1.25, storage: 1.05 } },
  { id: 'Sailing', name: '항해', era: 1, prereqs: ['Pottery', 'Writing'], cost: 64,
    desc: '배와 돛 — 물을 건너다.',
    effect: { seafaring: true, moveMul: 1.05 } },

  // --- 철기 시대 (2) -------------------------------------------------------
  { id: 'Mathematics', name: '수학', era: 2, prereqs: ['Writing'], cost: 80,
    desc: '수와 증명 — 과학의 언어.',
    effect: { researchMul: 1.25 } },
  { id: 'Currency', name: '화폐', era: 2, prereqs: ['Writing', 'Bronzeworking'], cost: 78,
    desc: '주조된 돈 — 교역과 잉여와 직업의 분화.',
    effect: { researchMul: 1.15, foodYield: 1.1 } },
  { id: 'IronWorking', name: '철 제작', era: 2, prereqs: ['Bronzeworking'], cost: 92,
    desc: '철을 제련하다 — 더 단단한 도구, 더 무서운 병기.',
    effect: { combat: 1.4 } },
  { id: 'Masonry', name: '석조', era: 2, prereqs: ['Bronzeworking'], cost: 84,
    desc: '다듬은 돌 — 성벽, 곡창, 기념물.',
    effect: { storage: 1.3, combat: 1.1 } },

  // --- 고전 시대 (3) --------------------------------------------------
  { id: 'Engineering', name: '공학', era: 3, prereqs: ['Mathematics', 'Masonry', 'Wheel'], cost: 120,
    desc: '도로, 수로, 그리고 전쟁의 기계들.',
    effect: { moveMul: 1.12, storage: 1.2, combat: 1.1 } },
  { id: 'Medicine', name: '의술', era: 3, prereqs: ['Mathematics'], cost: 115,
    desc: '약초와 외과 — 병든 자를 고치다.',
    effect: { healthRegen: 1.4 } },

  // --- 중세 시대 (4) ---------------------------------------------------
  { id: 'Compass', name: '나침반', era: 4, prereqs: ['Sailing', 'Mathematics'], cost: 150,
    desc: '바다 위를 자신 있게 항해하다.',
    effect: { seafaring: true, moveMul: 1.08 } },
  { id: 'Gunpowder', name: '화약', era: 4, prereqs: ['IronWorking', 'Engineering'], cost: 165,
    desc: '검은 가루 — 대포와 총.',
    effect: { combat: 1.5 } },

  // --- 르네상스 (5) ----------------------------------------------------
  { id: 'Printing', name: '인쇄술', era: 5, prereqs: ['Writing', 'Engineering'], cost: 210,
    desc: '인쇄기 — 지식이 모두에게 퍼지다.',
    effect: { researchMul: 1.4 } },
  { id: 'ScientificMethod', name: '과학적 방법', era: 5, prereqs: ['Printing', 'Mathematics'], cost: 260,
    desc: '가설과 실험 — 과학 그 자체.',
    effect: { researchMul: 2.0, healthRegen: 1.1 } },

  // --- 산업 시대 (6) -------------------------------------------------
  { id: 'Steam', name: '증기 기관', era: 6, prereqs: ['ScientificMethod', 'IronWorking'], cost: 330,
    desc: '증기 기관 — 쉬지 않는 기계의 힘.',
    effect: { moveMul: 1.3, foodYield: 1.2, combat: 1.1 } },
  { id: 'Electricity', name: '전기', era: 6, prereqs: ['ScientificMethod'], cost: 350,
    desc: '전류를 다루다 — 불빛, 모터, 전신.',
    effect: { researchMul: 1.3, healthRegen: 1.2 } },
  { id: 'Industrialization', name: '공업화', era: 6, prereqs: ['Steam'], cost: 400,
    desc: '공장 — 대규모 생산.',
    effect: { foodYield: 1.4, storage: 1.5, combat: 1.2 } },

  // --- 근대 시대 (7) -----------------------------------------------------
  { id: 'Combustion', name: '내연 기관', era: 7, prereqs: ['Industrialization', 'Electricity'], cost: 470,
    desc: '엔진 — 자동차와 장갑차.',
    effect: { moveMul: 1.5, combat: 1.2 } },
  { id: 'Plastics', name: '플라스틱', era: 7, prereqs: ['Industrialization', 'Electricity'], cost: 490,
    desc: '합성 재료 — 무엇이든 오래 보존하다.',
    effect: { storage: 1.6, foodYield: 1.3 } },
  { id: 'Flight', name: '유인 비행', era: 7, prereqs: ['Combustion'], cost: 540,
    desc: '동력 비행 — 공중으로 어디든.',
    effect: { flight: true, moveMul: 1.6 } },

  // --- 정보 시대 (8) -------------------------------------------------
  { id: 'Computing', name: '컴퓨팅', era: 8, prereqs: ['Plastics', 'Electricity', 'ScientificMethod'], cost: 660,
    desc: '컴퓨터 — 사유 그 자체를 자동화하다.',
    effect: { researchMul: 1.6, storage: 1.2 } },
];

// Fast id -> def lookup (UI toasts, prereq checks, event rendering).
export const TECH_BY_ID = new Map();
for (let i = 0; i < TECHS.length; i++) TECH_BY_ID.set(TECHS[i].id, TECHS[i]);

// Default caps for a tribe with zero techs. Cloned per-tribe so each owns its own.
function freshCaps() {
  return {
    foodYield: 1,
    moveMul: 1,
    combat: 1,
    researchMul: 1,
    seafaring: false,
    flight: false,
    healthRegen: 1,
    storage: 1,
  };
}

export class TechSystem {
  constructor() {
    // reusable scratch so the per-year unlock loop allocates nothing
    this._cand = new Array(TECHS.length);     // candidate defs this pass
    this._w = new Float64Array(TECHS.length); // their pick-weights
  }

  // Ensure a tribe carries the contract shape, then derive its caps.
  // Safe to call repeatedly; only (re)inits when the shape is missing/legacy.
  initTribe(tribe) {
    const t = tribe.tech;
    if (!t || typeof t !== 'object' || !(t.known instanceof Set)) {
      tribe.tech = { points: 0, known: new Set(), era: 0 };
    } else {
      if (typeof t.points !== 'number') t.points = 0;
      if (typeof t.era !== 'number') t.era = 0;
    }
    if (!tribe.caps) tribe.caps = freshCaps();
    this.recompute(tribe);
    return tribe;
  }

  // Rebuild tribe.caps from tribe.tech.known by combining each known tech's
  // effect: multipliers multiply, ability flags OR together.
  recompute(tribe) {
    if (!tribe.tech || !(tribe.tech.known instanceof Set)) this.initTribe(tribe);
    const caps = tribe.caps || (tribe.caps = freshCaps());
    caps.foodYield = 1;
    caps.moveMul = 1;
    caps.combat = 1;
    caps.researchMul = 1;
    caps.healthRegen = 1;
    caps.storage = 1;
    caps.seafaring = false;
    caps.flight = false;
    let era = 0;
    for (const id of tribe.tech.known) {
      const def = TECH_BY_ID.get(id);
      if (!def) continue;
      if (def.era > era) era = def.era;
      const e = def.effect;
      if (!e) continue;
      if (e.foodYield) caps.foodYield *= e.foodYield;
      if (e.moveMul) caps.moveMul *= e.moveMul;
      if (e.combat) caps.combat *= e.combat;
      if (e.researchMul) caps.researchMul *= e.researchMul;
      if (e.healthRegen) caps.healthRegen *= e.healthRegen;
      if (e.storage) caps.storage *= e.storage;
      if (e.seafaring) caps.seafaring = true;
      if (e.flight) caps.flight = true;
    }
    tribe.tech.era = era;
    return caps;
  }

  // Accrue research and unlock whatever the tribe can now afford. Call once per
  // sim-year per living tribe with dt = years elapsed (normally 1) and the sim's
  // deterministic rng. Returns the array of newly-unlocked tech defs so the
  // caller can emit discovery events.
  accrue(tribe, dt, rng) {
    if (!tribe.tech || !(tribe.tech.known instanceof Set)) this.initTribe(tribe);
    if (!tribe.caps) this.recompute(tribe);

    // research income: population does the work; culture (emergent from `speak`)
    // and any settlement bonus add to it; writing/printing/science multiply it.
    const pop = tribe.members > 0 ? tribe.members : 0;
    const culture = tribe.culture > 0 ? tribe.culture : 0;
    const settle = (tribe.tech.settleBonus > 0) ? tribe.tech.settleBonus : 0;
    // Sublinear in population so a huge tribe doesn't blitz the tree — progression
    // should feel like "building up to it" over many generations (drlor 2026-06-07).
    let gain = (Math.sqrt(pop) * 0.11 + Math.log2(1 + culture) * 0.3 + settle) * tribe.caps.researchMul * dt;
    if (gain > 0) tribe.tech.points += gain;

    const unlocked = [];
    const known = tribe.tech.known;
    const cand = this._cand;
    // unlock as many as are affordable this pass; guard bounds the loop to the
    // tree size so it always terminates even on a huge points windfall.
    let guard = 0;
    while (guard++ < TECHS.length) {
      const pts = tribe.tech.points;
      let n = 0;
      for (let i = 0; i < TECHS.length; i++) {
        const d = TECHS[i];
        if (d.cost > pts) continue;
        if (known.has(d.id)) continue;
        if (!this._prereqMet(known, d)) continue;
        cand[n++] = d;
      }
      if (n === 0) break;
      const chosen = this._pick(cand, n, rng);
      known.add(chosen.id);
      tribe.tech.points -= chosen.cost;
      if (chosen.era > tribe.tech.era) tribe.tech.era = chosen.era;
      unlocked.push(chosen);
    }
    if (unlocked.length) this.recompute(tribe);
    return unlocked;
  }

  // Techs the tribe could research next (prereqs met, not yet known) — for UI.
  available(tribe) {
    const out = [];
    if (!tribe.tech || !(tribe.tech.known instanceof Set)) return out;
    const known = tribe.tech.known;
    for (let i = 0; i < TECHS.length; i++) {
      const d = TECHS[i];
      if (known.has(d.id)) continue;
      if (this._prereqMet(known, d)) out.push(d);
    }
    return out;
  }

  eraName(era) {
    const i = era < 0 ? 0 : (era >= ERAS.length ? ERAS.length - 1 : era | 0);
    return ERAS[i];
  }

  // --- internals ----------------------------------------------------------
  _prereqMet(known, def) {
    const p = def.prereqs;
    for (let i = 0; i < p.length; i++) {
      if (!known.has(p[i])) return false;
    }
    return true;
  }

  // Weighted pick over cand[0..n): biased toward lower-era / cheaper techs so a
  // civ climbs the tree in a believable order rather than skipping ahead.
  _pick(cand, n, rng) {
    if (n === 1) return cand[0];
    const w = this._w;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = cand[i];
      const weight = 1 / (d.cost * (1 + d.era));
      w[i] = weight;
      total += weight;
    }
    let r = rng.float(0, total);
    for (let i = 0; i < n; i++) {
      r -= w[i];
      if (r <= 0) return cand[i];
    }
    return cand[n - 1];
  }
}
