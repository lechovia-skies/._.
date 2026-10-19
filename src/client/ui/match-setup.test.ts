import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_TEAM_SIZE } from '../../shared/net/protocol.ts';
import { fixedWorld, flies, loadSetup, type MatchSetup, missionLine, pilotsIn, PLAY_MISSIONS, saveSetup, SEATS } from './match-setup.ts';

const setup = (over: Partial<MatchSetup> = {}): MatchSetup => ({ mission: 'team-deathmatch', time: 'day', skill: 'veteran', seats: '2', map: 'lechovia', start: 'runway', ...over });

function stubStorage(seed: Record<string, unknown> = {}): Map<string, string> {
  const data = new Map<string, string>(Object.entries(seed).map(([k, v]) => [`contested-skies:${k}`, JSON.stringify(v)]));
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
  return data;
}

describe('match setup (revision 34)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers the same five missions alone and online, each with a line on what it asks', () => {
    expect(PLAY_MISSIONS).toEqual(['team-deathmatch', 'air-superiority', 'team-objective', 'strike', 'free-flight']);
    for (const m of PLAY_MISSIONS) expect(missionLine(m).length).toBeGreaterThan(20);
    expect(flies('free-flight')).toBe(false);
    expect(flies('strike')).toBe(true);
  });

  it('offers 2 to 10 pilots, half on each side (revision 35)', () => {
    expect(SEATS.map(pilotsIn)).toEqual([2, 4, 6, 8, 10]);
    expect(Number(SEATS.at(-1))).toBe(MAX_TEAM_SIZE);
  });

  it('keeps Strike on the Test Range from the air, and runway starts on Lechovia', () => {
    expect(fixedWorld(setup())).toEqual({ map: 'lechovia', start: 'runway' });
    expect(fixedWorld(setup({ mission: 'strike' }))).toEqual({ map: 'test-range', start: 'air' });
    expect(fixedWorld(setup({ map: 'test-range' }))).toEqual({ map: 'test-range', start: 'air' });
  });

  it("reads the title screen's old choices for a solo match, and keeps solo and online apart", () => {
    stubStorage({ mission: 'air-superiority', timeOfDay: 'dusk', difficulty: 'ace', teamSize: '4', map: 'lechovia', start: 'runway' });
    expect(loadSetup('solo')).toEqual({ mission: 'air-superiority', time: 'dusk', skill: 'ace', seats: '4', map: 'lechovia', start: 'runway' });
    // Online starts from the solo world until it has its own.
    const online = loadSetup('online');
    expect(online).toEqual({ mission: 'team-deathmatch', time: 'dusk', skill: 'veteran', seats: '2', map: 'lechovia', start: 'runway' });
    saveSetup('online', { ...online, mission: 'strike', time: 'night' });
    expect(loadSetup('online').mission).toBe('strike');
    expect(loadSetup('online').time).toBe('night');
    expect(loadSetup('solo').time).toBe('dusk');
    saveSetup('solo', { ...loadSetup('solo'), seats: '5' });
    expect(loadSetup('solo').seats).toBe('5');
  });

  it('falls back on anything stored that no longer makes sense', () => {
    stubStorage({ mission: 'training', timeOfDay: 'noonish', difficulty: 'god', teamSize: 9, map: 'mars', start: 'catapult' });
    expect(loadSetup('solo')).toEqual({ mission: 'team-deathmatch', time: 'day', skill: 'rookie', seats: '1', map: 'lechovia', start: 'air' });
  });
});
