import { describe, expect, it } from 'vitest';
import { Rng } from '../../math/rng.ts';
import { fullName, getAircraft, listAircraft, opposingTeam, randomAircraft, sentinelFor } from './registry.ts';
import { validateAircraftConfig } from './validate.ts';

describe('aircraft registry', () => {
  it('returns the jets by id, under their real names (revision 38)', () => {
    expect(getAircraft('kestrel').name).toBe('F-16C');
    expect(getAircraft('kobchik').name).toBe('MiG-29');
    expect(fullName(getAircraft('kestrel'))).toBe('F-16C Fighting Falcon');
    expect(listAircraft().map(fullName)).toEqual(['F-35A Lightning II', 'F-22A Raptor', 'F-16C Fighting Falcon', 'F-15C Eagle', 'Su-57 Felon', 'Su-35S Flanker-E', 'Su-30SM Flanker-H', 'MiG-29 Fulcrum']);
    expect(getAircraft('sentinel-usa').name).toBe('E-3G');
  });
  it('throws for unknown ids', () => {
    expect(() => getAircraft('nope')).toThrow('Unknown aircraft: nope');
  });
  it('lists by team, with at least one aircraft per team', () => {
    expect(listAircraft('usa').map((a) => a.id)).toContain('kestrel');
    expect(listAircraft('russia').map((a) => a.id)).toContain('kobchik');
    expect(listAircraft('russia').every((a) => a.team === 'russia')).toBe(true);
  });
  it('contains only valid configs with unique ids', () => {
    const all = listAircraft();
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
    for (const a of all) expect(validateAircraftConfig(a)).toEqual([]);
  });
  it('has the eight jets of the roster, four per team, in the spec order', () => {
    expect(listAircraft('usa').map((a) => a.id)).toEqual(['shade', 'tempest', 'kestrel', 'condor']);
    expect(listAircraft('russia').map((a) => a.id)).toEqual(['prizrak', 'yastreb', 'sapsan', 'kobchik']);
  });

  it('matches the roster table in the spec (§9.3, with the balance changes of revisions 10 and 30)', () => {
    // id: mass, wing area, thrust mil/AB kN, roll, HP, radar km/cone, stealth, TV
    const table: Record<string, [number, number, number, number, number, number, number, number, number, number]> = {
      shade: [21000, 43, 120, 195, 130, 100, 60, 60, 0.85, 0],
      tempest: [27000, 78, 225, 315, 155, 85, 50, 60, 0.8, 0.5],
      kestrel: [12000, 28, 76, 130, 180, 90, 35, 60, 0.15, 0],
      condor: [20500, 56, 128, 212, 135, 105, 55, 60, 0, 0],
      prizrak: [26000, 78, 185, 300, 160, 95, 50, 75, 0.6, 1],
      yastreb: [25000, 62, 170, 285, 140, 100, 55, 60, 0.05, 1],
      sapsan: [26500, 62, 150, 243, 120, 100, 60, 60, 0, 0],
      kobchik: [15000, 38, 100, 165, 160, 90, 30, 60, 0.15, 0],
    };
    for (const [id, row] of Object.entries(table)) {
      const c = getAircraft(id);
      const p = c.physics;
      const s = c.sensors;
      expect([p.massKg, p.wingAreaM2, p.thrustMilN / 1000, p.thrustAbN / 1000, p.maxRollRateDegS, c.damage.hitPoints, s.radarRangeKm, s.radarConeDeg, s.stealth, p.thrustVectoring], id).toEqual(row);
    }
    expect(getAircraft('shade').sensors.sensorFusion).toBe(true);
    expect(getAircraft('sapsan').sensors.twoSeat).toBe(true);
    expect(getAircraft('kobchik').sensors.helmetSight).toBe(true);
  });

  it("carries the real jet's gun, missiles, flares and chaff (§9.3, revision 30)", () => {
    const loads = (id: string) => {
      const st = getAircraft(id).stores;
      const strike = st.strike ? `${st.strike.bombs} ${st.strike.bomb} + ${st.strike.missiles.map((m) => `${m.count} ${m.missile}`).join(', ')}` : null;
      return [st.cannon, st.cannonRounds, st.missiles.map((m) => `${m.count} ${m.missile}`).join(', '), st.flares, st.chaff, strike];
    };
    expect(loads('shade')).toEqual(['GAU-22/A', 182, '4 AIM-120D', 32, 32, null]);
    expect(loads('tempest')).toEqual(['M61A2', 480, '2 AIM-9X, 6 AIM-120D', 24, 24, null]);
    expect(loads('kestrel')).toEqual(['M61A1', 511, '2 AIM-9X, 4 AIM-120D', 30, 60, null]);
    expect(loads('condor')).toEqual(['M61A1', 940, '4 AIM-9X, 4 AIM-120D', 60, 120, null]);
    expect(loads('prizrak')).toEqual(['GSh-30-1', 150, '2 R-74M2, 4 R-77M', 21, 21, '4 FAB-500M-62 + 2 R-74M2']);
    expect(loads('yastreb')).toEqual(['GSh-30-1', 150, '2 R-73, 2 R-77-1, 2 R-37M', 48, 48, '6 FAB-500M-62 + 2 R-73, 2 R-77-1']);
    expect(loads('sapsan')).toEqual(['GSh-30-1', 150, '4 R-73, 4 R-27R', 48, 48, '6 FAB-500M-62 + 2 R-73, 2 R-27R']);
    expect(loads('kobchik')).toEqual(['GSh-30-1', 150, '4 R-73, 2 R-27R', 30, 30, '4 FAB-500M-62 + 2 R-73']);
    // Russia attacks in Strike, so every Russian jet has a strike load.
    for (const c of listAircraft('russia')) expect(c.stores.strike, c.id).toBeDefined();
  });

  it('knows the Sentinels (M5) by id but never offers them to pilots or bots', () => {
    for (const team of ['usa', 'russia'] as const) {
      const s = sentinelFor(team);
      expect(s.team).toBe(team);
      expect(s.support).toBe(true);
      expect(getAircraft(s.id)).toBe(s);
      expect(validateAircraftConfig(s)).toEqual([]);
      expect(listAircraft().some((a) => a.support)).toBe(false);
    }
    expect(sentinelFor('usa').damage.hitPoints).toBe(400);
  });

  it('picks random jets of one team from a seeded generator', () => {
    const rng = new Rng(5);
    const picks = Array.from({ length: 200 }, () => randomAircraft('russia', rng).id);
    expect(new Set(picks)).toEqual(new Set(['prizrak', 'yastreb', 'sapsan', 'kobchik']));
    const again = new Rng(5);
    expect(Array.from({ length: 200 }, () => randomAircraft('russia', again).id)).toEqual(picks);
  });

  it('names the opposing team', () => {
    expect(opposingTeam('usa')).toBe('russia');
    expect(opposingTeam('russia')).toBe('usa');
  });
});
