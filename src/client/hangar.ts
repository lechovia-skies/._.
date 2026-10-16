import type { DifficultyId } from '../shared/ai/difficulty.ts';
import { getAircraft, listAircraft } from '../shared/data/aircraft/registry.ts';
import type { Career, MatchOutcome } from './career.ts';
import { unlockLevel } from './progression.ts';
import { loadSetting, saveSetting } from './ui/storage.ts';

/*
 * The hangar (revision 32, at the owner's request): money, development and wear, kept in this browser like the
 * career records.
 * - Shooting down enemies, Sentinels and winning pay credits (CR), more against better AI pilots.
 * - A jet that is shot down takes damage; enough of it and the jet is grounded until it is repaired, for a share of
 *   its value. Damage the jet brings home counts a little too.
 * - Levels make jets available to develop; developing one costs its development price. The two light fighters are
 *   the pilot's from the start, and they can always be repaired: for whatever the pilot can pay, even nothing.
 */

export const CURRENCY = 'CR';

/** What it costs to develop each jet once its level is reached; the starting jets are free. */
export const DEVELOPMENT_COSTS: Readonly<Record<string, number>> = {
  yastreb: 8000,
  condor: 12000,
  sapsan: 16000,
  tempest: 26000,
  prizrak: 28000,
  shade: 32000,
};

/** A starting jet's value, for its repairs. */
export const STARTER_VALUE = 6000;

/** Credits per finished match, per win or draw on top, per kill and per Sentinel (before the skill factor). */
export const PAY = { match: 400, win: 2000, draw: 800, kill: 1000, sentinel: 2500 } as const;

/** Better opponents pay better. Online matches pay at the veteran rate. */
export const SKILL_PAY: Readonly<Record<DifficultyId, number>> = { rookie: 0.75, veteran: 1, ace: 1.4 };

/** Damage per shoot-down, and the most a jet's battle damage at the end of a match adds, in percent. */
export const WEAR = { shotDown: 34, battleDamage: 20 } as const;

/** A full repair (100% damage) costs this share of the jet's value. */
export const REPAIR_SHARE = 0.25;

export interface Hangar {
  funds: number;
  /** jets developed, the starting ones included */
  owned: string[];
  /** damage per jet, 0–100%; at 100% the jet is grounded */
  wear: Record<string, number>;
}

const STORAGE_KEY = 'hangar';

/** The jets the pilot has from the start: those open at level 1. */
export function starterJets(): string[] {
  return listAircraft()
    .filter((a) => !a.support && unlockLevel(a.id) <= 1)
    .map((a) => a.id);
}

export const isStarter = (id: string) => unlockLevel(id) <= 1;

export function developmentCost(id: string): number {
  return isStarter(id) ? 0 : (DEVELOPMENT_COSTS[id] ?? 20000);
}

export function jetValue(id: string): number {
  return isStarter(id) ? STARTER_VALUE : developmentCost(id);
}

/** What the credits on record would have paid (the hangar starts with them, so matches before it count). */
export function careerFunds(c: Career): number {
  return PAY.match * c.matches + PAY.win * c.wins + PAY.draw * c.draws + PAY.kill * c.kills + PAY.sentinel * c.sentinels;
}

export function newHangar(career: Career): Hangar {
  return { funds: careerFunds(career), owned: starterJets(), wear: {} };
}

const knownJet = (id: unknown): id is string => typeof id === 'string' && listAircraft().some((a) => a.id === id && !a.support);

/** Whatever storage held as a valid hangar: known jets only, the starting jets always owned, wear 0–100. */
export function sanitizeHangar(raw: unknown, career: Career): Hangar {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return newHangar(career);
  const r = raw as Record<string, unknown>;
  const funds = typeof r.funds === 'number' && Number.isFinite(r.funds) ? Math.max(0, Math.floor(r.funds)) : 0;
  const owned = new Set(starterJets());
  if (Array.isArray(r.owned)) for (const id of r.owned) if (knownJet(id)) owned.add(id);
  const wear: Record<string, number> = {};
  if (typeof r.wear === 'object' && r.wear !== null) {
    for (const [id, w] of Object.entries(r.wear as Record<string, unknown>)) {
      if (owned.has(id) && typeof w === 'number' && Number.isFinite(w) && w > 0) wear[id] = Math.min(100, Math.round(w));
    }
  }
  return { funds, owned: [...owned], wear };
}

export function loadHangar(career: Career): Hangar {
  const saved = loadSetting<unknown>(STORAGE_KEY, null);
  const h = saved === null ? newHangar(career) : sanitizeHangar(saved, career);
  if (saved === null) saveHangar(h);
  return h;
}

export function saveHangar(h: Hangar): void {
  saveSetting(STORAGE_KEY, h);
}

export const wearOf = (h: Hangar, id: string) => h.wear[id] ?? 0;
export const owns = (h: Hangar, id: string) => h.owned.includes(id);
export const grounded = (h: Hangar, id: string) => wearOf(h, id) >= 100;
/** Can this jet fly a match? */
export const canFly = (h: Hangar, id: string) => owns(h, id) && !grounded(h, id);

export type JetState =
  | { kind: 'locked'; level: number }
  | { kind: 'develop'; cost: number; affordable: boolean }
  | { kind: 'ready'; wear: number; repair: number }
  | { kind: 'grounded'; repair: number };

export function jetState(h: Hangar, id: string, level: number): JetState {
  if (!owns(h, id)) {
    if (unlockLevel(id) > level) return { kind: 'locked', level: unlockLevel(id) };
    const cost = developmentCost(id);
    return { kind: 'develop', cost, affordable: h.funds >= cost };
  }
  const wear = wearOf(h, id);
  const repair = repairCost(id, wear);
  return wear >= 100 ? { kind: 'grounded', repair } : { kind: 'ready', wear, repair };
}

/** Credits for one percent of repair on this jet. */
const perPercent = (id: string) => (jetValue(id) * REPAIR_SHARE) / 100;

/** What repairing `wear` percent of damage costs, to the nearest 10 credits up. */
export function repairCost(id: string, wear: number): number {
  return wear <= 0 ? 0 : Math.ceil((perPercent(id) * wear) / 10) * 10;
}

/** Develops a jet whose level is reached, if the funds cover it; otherwise the hangar as it was. */
export function develop(h: Hangar, id: string, level: number): Hangar {
  const s = jetState(h, id, level);
  if (s.kind !== 'develop' || !s.affordable) return h;
  return { ...h, funds: h.funds - s.cost, owned: [...h.owned, id] };
}

/**
 * Repairs a jet as far as the funds go (all of it when they cover the bill). A starting jet is always repaired in
 * full, for whatever the pilot can pay, so nobody is left with nothing to fly.
 */
export function repair(h: Hangar, id: string): Hangar {
  const wear = wearOf(h, id);
  if (!owns(h, id) || wear <= 0) return h;
  const cost = repairCost(id, wear);
  const wearAfter = (w: number) => {
    const next = { ...h.wear };
    if (w <= 0) delete next[id];
    else next[id] = w;
    return next;
  };
  if (h.funds >= cost) return { ...h, funds: h.funds - cost, wear: wearAfter(0) };
  if (isStarter(id)) return { ...h, funds: 0, wear: wearAfter(0) };
  const fixed = Math.floor(h.funds / perPercent(id));
  if (fixed <= 0) return h;
  const paid = Math.min(h.funds, Math.ceil((fixed * perPercent(id)) / 10) * 10);
  return { ...h, funds: h.funds - paid, wear: wearAfter(wear - fixed) };
}

/** One finished match, for the hangar. */
export interface MatchBill {
  result: MatchOutcome;
  kills: number;
  sentinels: number;
  /** the AI pilots' skill offline; online matches pay at the veteran rate */
  skill: DifficultyId;
  /** kills and losses by the jet flown at the time */
  jets: Readonly<Record<string, { kills: number; deaths: number }>>;
  /** the jet flown at the end and the share of its hit points it lost, if it was still flying */
  final: { aircraftId: string; damage: number } | null;
  /** a jet lent for the match (a campaign mission's): it takes no damage here */
  lent?: string;
}

/** What a match pays, before it is added to the funds. */
export function matchPay(b: Pick<MatchBill, 'result' | 'kills' | 'sentinels' | 'skill'>): number {
  const base = PAY.match + (b.result === 'win' ? PAY.win : b.result === 'draw' ? PAY.draw : 0) + PAY.kill * b.kills + PAY.sentinel * b.sentinels;
  return Math.round((base * SKILL_PAY[b.skill]) / 10) * 10;
}

const money = (n: number) => `${CURRENCY} ${Math.round(n).toLocaleString('en-US')}`;
export const formatCredits = money;

/**
 * The hangar after a match: the pay added and the damage taken by each jet flown, and the end screen's lines about
 * them (what the match paid, a jet's condition after it, a jet grounded).
 */
export function settleMatch(h: Hangar, b: MatchBill): { hangar: Hangar; lines: string[] } {
  const pay = matchPay(b);
  const wear = { ...h.wear };
  const lines: string[] = [];
  const parts = [b.kills > 0 ? `${b.kills} kill${b.kills === 1 ? '' : 's'}` : null, b.sentinels > 0 ? `${b.sentinels} Sentinel${b.sentinels === 1 ? '' : 's'}` : null, b.result === 'loss' ? null : b.result];
  lines.push(`+${money(pay)} · ${parts.filter(Boolean).join(', ') || 'match flown'} · Funds ${money(h.funds + pay)}`);
  const damaged = new Map<string, number>();
  for (const [id, j] of Object.entries(b.jets)) if (j.deaths > 0) damaged.set(id, (damaged.get(id) ?? 0) + j.deaths * WEAR.shotDown);
  if (b.final && b.final.damage > 0) damaged.set(b.final.aircraftId, (damaged.get(b.final.aircraftId) ?? 0) + Math.round(Math.min(1, b.final.damage) * WEAR.battleDamage));
  for (const [id, add] of damaged) {
    if (id === b.lent || !h.owned.includes(id) || add <= 0) continue;
    const after = Math.min(100, (wear[id] ?? 0) + add);
    wear[id] = after;
    const name = getAircraft(id).name;
    lines.push(
      after >= 100
        ? `${name} grounded: too badly damaged to fly · repair it on the title screen (${money(repairCost(id, after))})`
        : `${name} damaged · condition ${100 - after}% · repair ${money(repairCost(id, after))}`,
    );
  }
  return { hangar: { ...h, funds: h.funds + pay, wear }, lines };
}
