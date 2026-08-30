// Heritage traits — the few "leader/people" choices at Create-Your-People (Civ
// leader-ability flavor). Each expresses onto the founding genome (so the whole
// starting people inherits it) and may lean a starting policy or homeland.
// Shared by the sim (to apply) and the UI (to display the picker).
import { nudgeGene } from './brain.js';

// Heritage traits — Civ-style leader/people traits at Create-Your-People.
// Each expresses onto the founding genome (so the whole starting people inherits
// it) and may lean a starting policy or homeland.
// `id` is 영문 식별자 (보존) — applied genome nudge, policy 슬라이더 initial에 사용.
// `name`/`desc`는 한글 표시.
export const HERITAGE = [
  { id: 'hardy', name: '강인함', icon: '🛡',
    desc: '추위와 질병에 강하고 오래 산다.',
    apply(g) { nudgeGene(g, 'resilience', 1.3); nudgeGene(g, 'lifespan', 0.8); } },
  { id: 'fertile', name: '다산', icon: '🌱',
    desc: '백성이 빠르게 번식하고 자라난다.',
    apply(g) { nudgeGene(g, 'fertility', 1.4); } },
  { id: 'martial', name: '무인', icon: '⚔️',
    desc: '타고난 전사 — 더 강하고 대담하게 싸운다.',
    apply(g) { nudgeGene(g, 'aggression', 1.1); nudgeGene(g, 'size', 0.4); },
    policy: { aggression: 0.3 } },
  { id: 'scholarly', name: '학자', icon: '📜',
    desc: '총명하고 호기심이 많아 연구가 빠르게 진행된다.',
    apply(g) { nudgeGene(g, 'vision', 0.9); },
    policy: { research: 0.4 } },
  { id: 'swift', name: '날쌘함', icon: '🐎',
    desc: '발이 빠르다 — 백성이 빠르게 움직인다.',
    apply(g) { nudgeGene(g, 'speed', 1.1); } },
  { id: 'verdant', name: '녹음의 백성', icon: '🌾',
    desc: '땅과 함께 산다 — 효율적이고 평화를 사랑하는 채집인.',
    apply(g) { nudgeGene(g, 'metabolism', -0.6); nudgeGene(g, 'diet', -0.4); } },
  { id: 'seafaring', name: '바다의 백성', icon: '🌊',
    desc: '해안가에서 일어났고, 물가를 향해 끌린다.',
    apply(g) { nudgeGene(g, 'diet', 0.3); }, coastal: true },
];

export const HERITAGE_BY_ID = new Map(HERITAGE.map((h) => [h.id, h]));
