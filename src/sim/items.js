// ITEMS — the economy's substance. A PURE registry of everything a nation can
// own, make, or strip from a corpse: raw resources, refined materials, and the
// tools / weapons / goods crafted from them. No sim imports, no state, no rng of
// its own — just data + small functions, so any system (settlement production,
// trade pricing, animal drops) can ask "what is this worth?" without a cycle.
//
// THE CONTRACT (shared with settlement.js production, governance.js trade, and
// the integrator in sim.js):
//  - ITEMS        : Item[] — the full registry.
//  - ITEM_BY_ID   : Map<id, Item> — O(1) lookup.
//  - value(id)    : number — economic worth (drives trade prices & loot value).
//  - isResource(id): boolean — true for the raw, gatherable base resources.
//  - rollDrops(kind, rng) : [{id,qty}] — loot from a slain creature/mob kind.
//
// An Item:
//   { id, name, type, tier, value, material?, madeFrom?, madeBy?, tech? }
//     type   : 'resource' | 'material' | 'tool' | 'weapon' | 'good'
//     tier   : 0 raw .. higher = more processed / advanced
//     value  : economic worth (1 = a unit of wood); scarcer/refined = pricier
//     material: the substance a tool/weapon is made of ('stone'|'bronze'|'iron'|'steel')
//     madeFrom: [itemId,...] consumed to craft it (production recipe inputs)
//     madeBy  : which improvement makes it — 'mine'|'quarry'|'lumber'|'farm'|'smithy'|'workshop'
//     tech    : techId that must be known to make it (gates materials/products)
//
// DETERMINISM: rollDrops takes an RNG you pass in (the caller's animal/world rng),
// so loot never touches the agent-evolution stream. No Math.random anywhere here.

// ---------------------------------------------------------------------------
// THE REGISTRY
// ---------------------------------------------------------------------------
// Kept as a flat array of plain objects so it reads like a spreadsheet. Values
// are tuned relative to wood = 1: stone/ore a touch more, hide/herbs niche,
// refined metals expensive (and tech-gated), finished weapons the priciest.
// `id`는 영문 식별자 (보존) — item lookup, recipe, stock key, trade 매핑에 사용.
// `name`만 한글.
export const ITEMS = [
  // ---- 원자재 (tier 0, 채집/수확) ----
  { id: 'wood',  name: '목재',   type: 'resource', tier: 0, value: 1,   madeBy: 'lumber' },
  { id: 'stone', name: '돌',     type: 'resource', tier: 0, value: 1.3, madeBy: 'quarry' },
  { id: 'ore',   name: '광석',   type: 'resource', tier: 0, value: 2.5, madeBy: 'mine' },
  { id: 'food',  name: '식량',   type: 'resource', tier: 0, value: 0.8, madeBy: 'farm' },
  { id: 'hide',  name: '가죽',   type: 'resource', tier: 0, value: 1.6 },   // 사냥감
  { id: 'herbs', name: '약초',   type: 'resource', tier: 0, value: 1.4 },   // 채집/약용

  // ---- 가공재 (tier 1–2, 대장간에서 제련; 테크 잠금) ----------------
  { id: 'bronze', name: '청동', type: 'material', tier: 1, value: 5,  material: 'bronze',
    madeFrom: ['ore'],    madeBy: 'smithy', tech: 'Bronzeworking' },
  { id: 'iron',   name: '철',   type: 'material', tier: 1, value: 7,  material: 'iron',
    madeFrom: ['ore'],    madeBy: 'smithy', tech: 'IronWorking' },
  { id: 'steel',  name: '강철', type: 'material', tier: 2, value: 12, material: 'steel',
    madeFrom: ['iron'],   madeBy: 'smithy', tech: 'Metallurgy' },

  // ---- 도구 (tier 1–2, 작업장/대장간; 수확량 증가) ------------
  { id: 'stone_tool',  name: '돌 도구',     type: 'tool', tier: 1, value: 3,  material: 'stone',
    madeFrom: ['wood', 'stone'], madeBy: 'workshop' },
  { id: 'bronze_tool', name: '청동 도구',   type: 'tool', tier: 2, value: 8,  material: 'bronze',
    madeFrom: ['wood', 'bronze'], madeBy: 'smithy', tech: 'Bronzeworking' },
  { id: 'iron_tool',   name: '철 도구',     type: 'tool', tier: 2, value: 11, material: 'iron',
    madeFrom: ['wood', 'iron'],   madeBy: 'smithy', tech: 'IronWorking' },

  // ---- 무기 (tier 1–3, 대장간; 군대의 전력) ------------------
  { id: 'stone_weapon',  name: '돌 무기',     type: 'weapon', tier: 1, value: 4,  material: 'stone',
    madeFrom: ['wood', 'stone'],  madeBy: 'workshop' },
  { id: 'bronze_weapon', name: '청동 무기',   type: 'weapon', tier: 2, value: 10, material: 'bronze',
    madeFrom: ['wood', 'bronze'], madeBy: 'smithy', tech: 'Bronzeworking' },
  { id: 'iron_weapon',   name: '철 무기',     type: 'weapon', tier: 2, value: 14, material: 'iron',
    madeFrom: ['wood', 'iron'],   madeBy: 'smithy', tech: 'IronWorking' },
  { id: 'steel_weapon',  name: '강철 무기',   type: 'weapon', tier: 3, value: 22, material: 'steel',
    madeFrom: ['wood', 'steel'],  madeBy: 'smithy', tech: 'Metallurgy' },

  // ---- 공예품 (tier 1–2, 교역품) ------------
  { id: 'leather',  name: '가죽 제품', type: 'good', tier: 1, value: 3,
    madeFrom: ['hide'],         madeBy: 'workshop' },
  { id: 'medicine', name: '약재',     type: 'good', tier: 1, value: 4,
    madeFrom: ['herbs'],        madeBy: 'workshop', tech: 'Medicine' },
  { id: 'pottery',  name: '토기',     type: 'good', tier: 1, value: 2.5,
    madeFrom: ['stone'],        madeBy: 'workshop', tech: 'Pottery' },
];

// ---------------------------------------------------------------------------
// LOOKUPS
// ---------------------------------------------------------------------------
export const ITEM_BY_ID = new Map();
for (let i = 0; i < ITEMS.length; i++) ITEM_BY_ID.set(ITEMS[i].id, ITEMS[i]);

// the raw, gatherable base resources (subset of ITEMS with type 'resource').
const RESOURCE_IDS = new Set();
for (let i = 0; i < ITEMS.length; i++) if (ITEMS[i].type === 'resource') RESOURCE_IDS.add(ITEMS[i].id);

/** Economic worth of an item id (0 for unknown ids — safe for trade math). */
export function value(id) {
  const it = ITEM_BY_ID.get(id);
  return it ? it.value : 0;
}

/** True iff `id` is one of the raw, gatherable base resources. */
export function isResource(id) {
  return RESOURCE_IDS.has(id);
}

/** All item ids of a given type ('resource'|'material'|'tool'|'weapon'|'good'). */
export function itemsOfType(type) {
  const out = [];
  for (let i = 0; i < ITEMS.length; i++) if (ITEMS[i].type === type) out.push(ITEMS[i].id);
  return out;
}

// ---------------------------------------------------------------------------
// DROP TABLES — what a slain creature/mob leaves behind
// ---------------------------------------------------------------------------
// Per kind: a list of {id, chance, min, max}. chance is rolled independently per
// entry (so a kill can yield several items, or — rarely — none). Extensible:
// add a 'monster' kind later with rare loot and rollDrops handles it for free.
//
// 'prey'     (deer/etc)  -> hide + meat(food), sometimes herbs grazed up
// 'predator' (wolf/etc)  -> pelt(hide) + fang(ore-proxy "bone") + meat
const DROP_TABLES = {
  prey: [
    { id: 'hide', chance: 0.85, min: 1, max: 2 },
    { id: 'food', chance: 1.00, min: 1, max: 3 },   // meat
    { id: 'herbs', chance: 0.20, min: 1, max: 1 },
  ],
  predator: [
    { id: 'hide', chance: 0.70, min: 1, max: 1 },   // pelt
    { id: 'food', chance: 0.90, min: 1, max: 2 },   // meat
    { id: 'ore', chance: 0.15, min: 1, max: 1 },    // fang/bone — a scrap of hard material
  ],
};

/**
 * Roll the loot a slain creature of `kind` drops, using the caller's `rng`.
 * Returns [{id, qty}] (possibly empty). Unknown kinds drop nothing.
 * `rng` must expose next()->[0,1) and int(min,max) (our core RNG); a bare
 * function returning [0,1) is also accepted for convenience in tests.
 */
export function rollDrops(kind, rng) {
  const table = DROP_TABLES[kind];
  if (!table) return [];
  const rand = (typeof rng === 'function') ? rng : (rng && rng.next ? () => rng.next() : Math.random);
  const out = [];
  for (let i = 0; i < table.length; i++) {
    const e = table[i];
    if (rand() < e.chance) {
      const span = e.max - e.min;
      const qty = e.min + (span > 0 ? Math.floor(rand() * (span + 1)) : 0);
      if (qty > 0) out.push({ id: e.id, qty });
    }
  }
  return out;
}

/** The raw drop-table definition for a kind (read-only view for docs/UI). */
export function dropTable(kind) {
  return DROP_TABLES[kind] || null;
}
