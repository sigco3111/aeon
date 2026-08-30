// Anthropology — each people develops an emergent CULTURAL IDENTITY (an ethos)
// read from how they actually live: their evolved temperament, how many take up
// arms, how devout they are, how hard they work the land, how learned they are,
// how settled or free they roam. From the dominant ethos flow named customs.
// This is the "sincere simulation of humanity" layer — culture as a consequence
// of behavior, not a script. Computed once per sim-year; cheap (one agent pass).

// Each is a "tribal ethos" the UI surfaces (see ui.js refreshTribeStats). `key`
// is 영문 식별자 (보존), `name`/`custom`는 한글 표시.
export const ETHOS = [
  { key: 'militaristic', name: '무장사회', custom: '전사식 의례' },
  { key: 'communal',     name: '공동체',   custom: '친족 명절과 함께하는 화덕' },
  { key: 'devout',       name: '경건',     custom: '조상숭배와 거룩한 날' },
  { key: 'industrious',  name: '근면',     custom: '길드 도제 제도' },
  { key: 'scholarly',    name: '학예',     custom: '구전 역사와 별의 비밀' },
  { key: 'free',         name: '유랑민',   custom: '계절에 따른 이동' },
];
const ETHOS_BY_KEY = new Map(ETHOS.map((e) => [e.key, e]));

const YEAR = 60;

export class Anthropology {
  constructor() { this._acc = new Map(); } // tribeId -> accumulator (reused)

  initTribe(tribe) {
    tribe.ethos = { militaristic: 0, communal: 0, devout: 0, industrious: 0, scholarly: 0, free: 0 };
    tribe.ethosName = '—';
    tribe.customs = [];
  }

  tick(sim, dt) {
    if (sim.tick % YEAR !== 0) return;
    const acc = this._acc; acc.clear();
    const A = sim.pool.agents;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (!a.alive) continue;
      let r = acc.get(a.tribeId);
      if (!r) { r = { n: 0, agg: 0, fert: 0, fighters: 0, vision: 0 }; acc.set(a.tribeId, r); }
      r.n++; r.agg += a.aggression; r.fert += a.fertility; r.vision += a.vision;
      if (a.role === 1 || a.role === 2) r.fighters++;
    }
    for (const tr of sim.tribes.values()) {
      if (tr.members === 0) continue;
      if (!tr.ethos) this.initTribe(tr);
      const r = acc.get(tr.id) || { n: 1, agg: 0, fert: 0, fighters: 0, vision: 2 };
      const n = r.n || 1;
      const meanAgg = r.agg / n, fighterFrac = r.fighters / n, meanFert = (r.fert / n - 0.3) / 1.4;
      const era = (tr.tech && typeof tr.tech.era === 'number') ? tr.tech.era : 0;
      const settles = (sim.settleSys && sim.settleSys.countOf) ? sim.settleSys.countOf(tr.id) : 0;
      const stock = tr.stock || { wood: 0, stone: 0, ore: 0 };
      const perCap = (stock.wood + stock.stone + stock.ore) / (tr.members * 2 + 1);

      const e = tr.ethos;
      e.militaristic = clamp01(meanAgg * 0.55 + fighterFrac * 0.6 + Math.min(1, tr.kills / 40) * 0.2);
      e.communal     = clamp01((1 - meanAgg) * 0.5 + clamp01(meanFert) * 0.4 + Math.min(1, settles * 0.1) * 0.2);
      e.devout       = clamp01((tr.religion ? Math.min(1, tr.religion.fervor || 0.3) : 0) * 0.8 + Math.min(1, tr.culture / 60) * 0.2);
      e.industrious  = clamp01(Math.min(1, perCap) * 0.7 + Math.min(1, settles * 0.12) * 0.3);
      e.scholarly    = clamp01(Math.min(1, era / 7) * 0.6 + Math.min(1, ((tr.caps && tr.caps.researchMul) || 1) / 2) * 0.4);
      e.free         = clamp01(settles === 0 ? 0.7 : Math.max(0, 0.5 - settles * 0.12) + (r.vision / n - 2) / 5 * 0.3);

      // dominant ethos → identity + a custom (announce when it shifts)
      let bestK = 'communal', bestV = -1;
      for (const k in e) if (e[k] > bestV) { bestV = e[k]; bestK = k; }
      const def = ETHOS_BY_KEY.get(bestK);
      const newName = def ? def.name : '—';
      if (newName !== tr.ethosName && bestV > 0.34) {
        tr.ethosName = newName;
        tr.customs = def ? [def.custom] : [];
        if (sim.emit && tr.foundedYear < sim.year() - 1) {
          sim.emit('culture', `${tr.name}이(가) ${newName} 민족이 되었습니다 — ${def.custom}`, tr.capitalX, tr.capitalY, tr.hue);
        }
      }
    }
  }

  // cultural affinity 0..1 between two peoples (1 = kindred ethos) — used to
  // soften or sharpen diplomacy. Shared ethos & faith draw peoples together.
  affinity(a, b) {
    if (!a.ethos || !b.ethos) return 0.5;
    let dot = 0, na = 0, nb = 0;
    for (const k in a.ethos) { dot += a.ethos[k] * b.ethos[k]; na += a.ethos[k] * a.ethos[k]; nb += b.ethos[k] * b.ethos[k]; }
    const cos = dot / (Math.sqrt(na * nb) + 1e-6);
    const faith = (a.religion && b.religion && a.religion.id === b.religion.id) ? 0.2 : 0;
    return Math.min(1, cos * 0.85 + faith);
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
