import { describe, expect, it } from 'vitest';
import { listAircraft } from '../shared/data/aircraft/registry.ts';
import { type Career, emptyCareer } from './career.ts';
import {
  canFly,
  careerFunds,
  develop,
  DEVELOPMENT_COSTS,
  type Hangar,
  jetState,
  matchPay,
  newHangar,
  PAY,
  repair,
  repairCost,
  sanitizeHangar,
  settleMatch,
  starterJets,
  WEAR,
} from './hangar.ts';
import { UNLOCK_LEVELS } from './progression.ts';

const career = (c: Partial<Career>): Career => ({ ...emptyCareer(), ...c });
const hangar = (h: Partial<Hangar>): Hangar => ({ ...newHangar(emptyCareer()), ...h });

describe('hangar (revision 32)', () => {
  it('starts with the two light fighters and the credits the career on record would have paid', () => {
    expect(starterJets().sort()).toEqual(['kestrel', 'kobchik']);
    const c = career({ matches: 3, wins: 2, draws: 1, kills: 5, sentinels: 1 });
    expect(careerFunds(c)).toBe(3 * PAY.match + 2 * PAY.win + PAY.draw + 5 * PAY.kill + PAY.sentinel);
    expect(newHangar(c)).toEqual({ funds: careerFunds(c), owned: starterJets(), wear: {} });
  });

  it('prices every jet that is not a starter, dearer the later it opens', () => {
    const later = listAircraft()
      .filter((a) => (UNLOCK_LEVELS[a.id] ?? 1) > 1)
      .sort((a, b) => UNLOCK_LEVELS[a.id] - UNLOCK_LEVELS[b.id]);
    for (const a of later) expect(DEVELOPMENT_COSTS[a.id], a.id).toBeGreaterThan(0);
    for (let i = 1; i < later.length; i++) expect(DEVELOPMENT_COSTS[later[i].id]).toBeGreaterThan(DEVELOPMENT_COSTS[later[i - 1].id]);
  });

  it('opens a jet for development at its level, and develops it for its price', () => {
    const h = hangar({ funds: 10000 });
    expect(jetState(h, 'yastreb', 1)).toEqual({ kind: 'locked', level: 2 });
    expect(jetState(h, 'yastreb', 2)).toEqual({ kind: 'develop', cost: 8000, affordable: true });
    expect(jetState(h, 'condor', 3)).toEqual({ kind: 'develop', cost: 12000, affordable: false });
    expect(develop(h, 'condor', 3)).toBe(h);
    expect(develop(h, 'yastreb', 1)).toBe(h);
    const after = develop(h, 'yastreb', 2);
    expect(after.funds).toBe(2000);
    expect(canFly(after, 'yastreb')).toBe(true);
    expect(jetState(after, 'yastreb', 2)).toEqual({ kind: 'ready', wear: 0, repair: 0 });
  });

  it('pays for the match, better against better pilots', () => {
    expect(matchPay({ result: 'win', kills: 3, sentinels: 0, skill: 'veteran' })).toBe(PAY.match + PAY.win + 3 * PAY.kill);
    expect(matchPay({ result: 'loss', kills: 0, sentinels: 0, skill: 'veteran' })).toBe(PAY.match);
    expect(matchPay({ result: 'win', kills: 3, sentinels: 0, skill: 'ace' })).toBeGreaterThan(matchPay({ result: 'win', kills: 3, sentinels: 0, skill: 'rookie' }));
  });

  it('damages a jet each time it is shot down and grounds it after three', () => {
    let h = hangar({ funds: 0 });
    const bill = (deaths: number) => ({ result: 'loss' as const, kills: 0, sentinels: 0, skill: 'veteran' as const, jets: { kestrel: { kills: 0, deaths } }, final: null });
    h = settleMatch(h, bill(1)).hangar;
    expect(h.wear.kestrel).toBe(WEAR.shotDown);
    expect(h.funds).toBe(PAY.match);
    const { hangar: after, lines } = settleMatch(h, bill(2));
    expect(after.wear.kestrel).toBe(100);
    expect(canFly(after, 'kestrel')).toBe(false);
    expect(lines.some((l) => l.startsWith('F-16C grounded'))).toBe(true);
    // Damage brought home counts a little; a lent jet takes none; jets not owned take none.
    const home = settleMatch(hangar({}), { ...bill(0), final: { aircraftId: 'kobchik', damage: 0.5 } }).hangar;
    expect(home.wear.kobchik).toBe(WEAR.battleDamage / 2);
    expect(settleMatch(hangar({}), { ...bill(1), lent: 'kestrel' }).hangar.wear.kestrel).toBeUndefined();
    expect(settleMatch(hangar({}), { ...bill(0), jets: { tempest: { kills: 0, deaths: 2 } } }).hangar.wear.tempest).toBeUndefined();
  });

  it('repairs for a share of the jet’s value, as far as the funds go; a starter always gets fixed', () => {
    expect(repairCost('tempest', 100)).toBeGreaterThan(repairCost('kestrel', 100));
    expect(repairCost('kestrel', 0)).toBe(0);
    const owned = ['kestrel', 'kobchik', 'tempest'];
    const full = repair(hangar({ funds: 100000, owned, wear: { tempest: 68 } }), 'tempest');
    expect(full.wear.tempest).toBeUndefined();
    expect(full.funds).toBe(100000 - repairCost('tempest', 68));
    const part = repair(hangar({ funds: 1000, owned, wear: { tempest: 100 } }), 'tempest');
    expect(part.wear.tempest).toBeLessThan(100);
    expect(part.wear.tempest).toBeGreaterThan(0);
    expect(part.funds).toBeGreaterThanOrEqual(0);
    expect(canFly(part, 'tempest')).toBe(true);
    const broke = repair(hangar({ funds: 0, wear: { kestrel: 100 } }), 'kestrel');
    expect(broke.wear.kestrel).toBeUndefined();
    expect(broke.funds).toBe(0);
  });

  it('reads back only what makes sense', () => {
    const h = sanitizeHangar({ funds: -5, owned: ['tempest', 'nonsense', 3], wear: { tempest: 250, kestrel: -3, nonsense: 50 } }, emptyCareer());
    expect(h.funds).toBe(0);
    expect(h.owned.sort()).toEqual(['kestrel', 'kobchik', 'tempest']);
    expect(h.wear).toEqual({ tempest: 100 });
    expect(sanitizeHangar('garbage', career({ kills: 2 })).funds).toBe(2 * PAY.kill);
  });
});
