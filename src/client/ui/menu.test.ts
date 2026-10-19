import { afterEach, describe, expect, it, vi } from 'vitest';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { kobchik } from '../../shared/data/aircraft/kobchik.ts';
import { STRIKE_DEFAULTS } from '../../shared/modes/strike.ts';
import { DEFAULT_BINDINGS, rebind } from '../input/bindings.ts';
import { controlsHelp } from './controls-help.ts';
import { aircraftSummary, effectiveWorld, environmentOf, hangarLine, jetBadge, loadWorldChoice, pickValid, strikeRole, type WorldChoice } from './menu.ts';
import { loadOnlineName, nameIsSet, roomWorld, saveOnlineName, soloCallsign, suggestedName } from './online-sheet.ts';

describe('start menu helpers', () => {
  it('falls back when a saved choice is no longer offered', () => {
    expect(pickValid('kobchik', ['kestrel', 'kobchik'], 'kestrel')).toBe('kobchik');
    expect(pickValid('f-16', ['kestrel', 'kobchik'], 'kestrel')).toBe('kestrel');
    expect(pickValid('', ['rookie', 'ace'], 'rookie')).toBe('rookie');
  });

  it('sums an aircraft up in the first sentence of its description', () => {
    expect(aircraftSummary({ ...kestrel, description: 'Rolls faster than anything. Lightly built.' })).toBe('Light multirole fighter · Rolls faster than anything.');
    expect(aircraftSummary({ ...kestrel, description: 'A test jet' })).toBe('Light multirole fighter · A test jet');
  });
});

describe('controls help', () => {
  const keys = (rows: ReturnType<typeof controlsHelp>) => rows.map(([k]) => k);

  it('leads with the mouse in mouse-aim mode and with the stick keys in keyboard mode', () => {
    expect(controlsHelp('mouse-aim')[0][0]).toBe('Mouse');
    expect(keys(controlsHelp('direct')).slice(0, 3)).toEqual(['W / S', 'A / D', 'Q / E']);
    expect(keys(controlsHelp('direct'))).not.toContain('Mouse');
  });

  it('lists the weapons and pause in both modes', () => {
    for (const mode of ['mouse-aim', 'direct'] as const) {
      const actions = controlsHelp(mode).map(([, a]) => a);
      for (const needed of ['Cannon', 'Flares and chaff', 'Pause']) expect(actions).toContain(needed);
      expect(actions.some((a) => a.startsWith('Missile'))).toBe(true);
      expect(actions.some((a) => a.startsWith('Bomb'))).toBe(true);
    }
  });
});

describe('strike role', () => {
  it('tells each jet what it does in a Strike match', () => {
    expect(strikeRole(kestrel)).toBe('Kestrel · USA: hold all three targets for 9 minutes');
    expect(strikeRole(kobchik)).toBe('Kobchik · Russia: destroy two of the three targets');
    // the words above are written out, so they must follow the rules
    expect([STRIKE_DEFAULTS.timeLimitS, STRIKE_DEFAULTS.targetsToWin]).toEqual([540, 2]);
  });
});

describe('controls list with rebound keys', () => {
  it('shows the keys the player chose', () => {
    const rows = controlsHelp('direct', rebind(DEFAULT_BINDINGS, 'flares', 'KeyV'));
    expect(rows.find(([, a]) => a === 'Flares and chaff')?.[0]).toBe('V');
  });
});

describe('world choice (M4)', () => {
  const choice: WorldChoice = { map: 'lechovia', start: 'runway', time: 'dusk', clock: false, weather: 'rain' };

  it('keeps the chosen map and runway start for a dogfight or free flight', () => {
    expect(effectiveWorld(choice, 'team-deathmatch')).toEqual(choice);
    expect(effectiveWorld(choice, 'free-flight')).toEqual(choice);
  });

  it('flies Strike and Training on the Test Range from the air', () => {
    for (const m of ['strike', 'training'] as const) expect(effectiveWorld(choice, m)).toMatchObject({ map: 'test-range', start: 'air' });
    expect(effectiveWorld({ ...choice, map: 'test-range' }, 'team-deathmatch').start).toBe('air');
  });

  it('turns the choice into the weather and clock of the match', () => {
    expect(environmentOf(choice)).toEqual({ weather: 'rain', startHour: 17.5, clockRunning: false });
  });
});

describe('world choice (revision 19)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the map, start and time of day, but flies scattered cloud with the clock still', () => {
    const stored: Record<string, string> = {
      'contested-skies:map': '"lechovia"',
      'contested-skies:start': '"runway"',
      'contested-skies:timeOfDay': '"dusk"',
      'contested-skies:weather': '"rain"',
      'contested-skies:clock': 'true',
    };
    vi.stubGlobal('localStorage', { getItem: (k: string) => stored[k] ?? null, setItem: () => undefined, removeItem: () => undefined });
    expect(loadWorldChoice()).toEqual({ map: 'lechovia', start: 'runway', time: 'dusk', clock: false, weather: 'scattered' });
  });
});

describe('the hangar on the title screen (revision 32)', () => {
  const h = { funds: 9000, owned: ['kestrel', 'kobchik'], wear: { kobchik: 100, kestrel: 34 } };
  it('tags each jet with its state', () => {
    expect(jetBadge(h, 'tempest', 1)).toMatchObject({ badge: '🔒 Lv 5', disabled: true });
    expect(jetBadge(h, 'yastreb', 2)).toMatchObject({ badge: 'CR 8,000', disabled: false });
    expect(jetBadge(h, 'kobchik', 1)).toMatchObject({ badge: 'Grounded', disabled: false });
    expect(jetBadge(h, 'kestrel', 1)).toMatchObject({ badge: '66%', disabled: false });
    expect(jetBadge({ ...h, wear: {} }, 'kestrel', 1)).toEqual({ disabled: false });
  });
  it('offers to develop or repair the chosen jet', () => {
    expect(hangarLine(h, 'yastreb', 2).action).toEqual({ label: 'Develop · CR 8,000', enabled: true });
    expect(hangarLine(h, 'condor', 3).action).toEqual({ label: 'Develop · CR 12,000', enabled: false });
    expect(hangarLine(h, 'kobchik', 1).text).toMatch(/^Grounded/);
    expect(hangarLine(h, 'kobchik', 1).action?.label).toMatch(/^Repair · CR /);
    expect(hangarLine({ ...h, wear: {} }, 'kestrel', 1)).toEqual({ text: 'Condition 100% · ready to fly.' });
  });
});

describe('the Online sheet (revisions 32 and 33)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a name until the pilot has one other than the default, five letters at most', () => {
    expect(nameIsSet('Pilot')).toBe(false);
    expect(nameIsSet('  ')).toBe(false);
    expect(nameIsSet('Hiro')).toBe(true);
    expect(nameIsSet('ヒロト')).toBe(true);
    expect(nameIsSet('Hiroto')).toBe(false);
  });

  it('keeps the name from the first time online; flying alone needs none', () => {
    const data = new Map<string, string>([['contested-skies:callsign', JSON.stringify('Hiroto')]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
    expect(loadOnlineName()).toBe('');
    expect(soloCallsign()).toBe('Pilot');
    // The old title-screen callsign, cut to five letters, is offered the first time.
    expect(suggestedName()).toBe('Hirot');
    expect(saveOnlineName('Pilot')).toBe(false);
    expect(saveOnlineName('!!')).toBe(false);
    expect(loadOnlineName()).toBe('');
    expect(saveOnlineName(' Hiroto ')).toBe(true);
    expect(loadOnlineName()).toBe('Hirot');
    expect(soloCallsign()).toBe('Hirot');
  });
  it('keeps Strike on the Test Range and runway starts on Lechovia', () => {
    expect(roomWorld({ map: 'lechovia', start: 'runway', time: 'dusk' }, 'strike')).toEqual({ map: 'test-range', start: 'air', time: 'dusk' });
    expect(roomWorld({ map: 'test-range', start: 'runway', time: 'day' }, 'team-deathmatch')).toEqual({ map: 'test-range', start: 'air', time: 'day' });
    expect(roomWorld({ map: 'lechovia', start: 'runway', time: 'night' }, 'air-superiority')).toEqual({ map: 'lechovia', start: 'runway', time: 'night' });
  });
});
