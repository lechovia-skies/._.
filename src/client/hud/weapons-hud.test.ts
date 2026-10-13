import { describe, expect, it } from 'vitest';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import { loadoutFor } from '../../shared/data/loadout.ts';
import { createSeeker } from '../../shared/targeting/ir-seeker.ts';
import { createRadarLock } from '../../shared/targeting/radar-lock.ts';
import { testView } from '../testing/views.ts';
import { lockDiamondPx, weaponsLine } from './weapons-hud.ts';

describe('weapons readout (revision 30: the real names)', () => {
  it("lists the gun, each missile type, flares and chaff by their real names, and boxes the selected missile", () => {
    const v = testView(1);
    const line = weaponsLine(v, 1);
    expect(line.cells.map((c) => c.text)).toEqual(['M61A1 511', 'AIM-9X 2', 'AIM-120D 4', 'FLR 30', 'CHF 60']);
    expect(line.cells.filter((c) => c.selected).map((c) => c.text)).toEqual(['AIM-120D 4']);
  });

  it('shows a Su-35-like jet with three missile types, and a Strike sortie with its bombs', () => {
    const yastreb = getAircraft('yastreb');
    const v = testView(1, { config: yastreb });
    expect(weaponsLine(v, 2).cells.map((c) => c.text)).toEqual(['GSh-30-1 150', 'R-73 2', 'R-77-1 2', 'R-37M 2', 'FLR 48', 'CHF 48']);
    const strike = testView(1, { config: yastreb, loadout: loadoutFor(yastreb, true) });
    expect(weaponsLine(strike, 0).cells.map((c) => c.text)).toEqual(['GSh-30-1 150', 'R-73 2', 'R-77-1 2', 'FLR 48', 'CHF 48', 'FAB-500M-62 6']);
  });

  it('shows the seeker for an infrared missile and the radar lock for a radar missile', () => {
    const seeker = createSeeker();
    const radarLock = createRadarLock();
    const v = testView(1, { seeker, radarLock });
    seeker.mode = 'track';
    expect(weaponsLine(v, 0).status).toEqual({ text: 'AIM-9X TRK', tone: 'amber' });
    radarLock.mode = 'locked';
    expect(weaponsLine(v, 1).status).toEqual({ text: 'AIM-120D LOCK', tone: 'red' });
    radarLock.mode = 'off';
    expect(weaponsLine(v, 1).status.text).toBe('AIM-120D');
    expect(weaponsLine({ ...v, stores: { ...v.stores, missiles: [2, 0] } }, 1).status.text).toBe('AIM-120D EMPTY');
  });

  it('says so when the jet carries no missiles at all', () => {
    const v = testView(1, { loadout: { missiles: [], bomb: null, bombs: 0 } });
    expect(weaponsLine(v, 0).status.text).toBe('NO MISSILES');
  });

  it('closes the lock diamond onto the target box as the lock builds', () => {
    expect(lockDiamondPx(13, 0)).toBeCloseTo(39, 6);
    expect(lockDiamondPx(13, 1)).toBeCloseTo(18.2, 6);
    expect(lockDiamondPx(13, 0.5)).toBeLessThan(lockDiamondPx(13, 0.2));
  });
});
