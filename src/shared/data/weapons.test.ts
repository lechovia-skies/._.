import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { atmosphere } from '../physics/atmosphere.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { isSpent, launchMissile, stepMissile } from '../weapons/missile.ts';
import { listAircraft } from './aircraft/registry.ts';
import {
  BOMBS,
  CANNONS,
  COUNTERMEASURES,
  FAB_500M_62,
  MISSILE_IDS,
  type MissileId,
  MISSILES,
  missilesFor,
  type MissileSpec,
  PLAYER_GUN_REACH,
  PLAYER_MISSILES,
} from './weapons.ts';

/** How far a missile flies straight and level from 250 m/s at 6 km before it is spent. */
function reachM(spec: MissileSpec): number {
  const flight = createFlightState({ position: new Vector3(0, 6000, 0), headingRad: 0, speed: 250, throttle: 1, alphaRad: 0 });
  flight.quat.copy(new Quaternion());
  const m = launchMissile(1, { id: 1, team: 'usa', flight }, 2, spec);
  const density = atmosphere(6000).density;
  const start = m.pos.clone();
  while (!isSpent(m)) stepMissile(m, null, density, 1 / 60);
  return Math.hypot(m.pos.x - start.x, m.pos.z - start.z);
}

describe('weapon data (revision 30: the real weapons)', () => {
  it('has the real guns: calibre, rate of fire and muzzle velocity', () => {
    const rows = Object.values(CANNONS).map((c) => [c.id, c.calibreMm, Math.round(c.projectilesPerS * c.roundsPerProjectile * 60), c.muzzleSpeedMs, c.damagePerProjectile]);
    expect(rows).toEqual([
      ['M61A1', 20, 6000, 1030, 10.4],
      ['M61A2', 20, 6000, 1030, 10.4],
      ['GAU-22/A', 25, 3300, 1040, 14],
      ['GSh-30-1', 30, 1800, 860, 17.4],
    ]);
    for (const c of Object.values(CANNONS)) {
      expect(c.lifetimeS).toBe(3);
      expect(c.dragPerM).toBeGreaterThan(0);
    }
  });

  it('keeps the old Dart in the R-73 and the old Lance in the AIM-120C (spec §10.2)', () => {
    expect(MISSILES['R-73']).toMatchObject({
      guidance: 'ir',
      acquisitionConeDeg: 10,
      offBoresightDeg: 60,
      offBoresightHelmetDeg: 75,
      lockTimeS: 0.8,
      lockRangeTailM: 9000,
      lockRangeHeadOnM: 4000,
      navigationConstant: 3,
      maxAccelG: 20,
      responseLagS: 0.5,
      maneuverDragFactor: 0.1,
      motorAccelMs2: 150,
      burnTimeS: 5,
      maxFlightTimeS: 25,
      fuzeRadiusM: 9,
      blastFullDamageRadiusM: 4,
      blastMaxRadiusM: 18,
      blastDamage: 130,
      decoyChance: 0.35,
    });
    expect(MISSILES['AIM-120C']).toMatchObject({
      guidance: 'radar',
      activeRangeM: 10000,
      lockTimeS: 1.5,
      twoSeatLockTimeFactor: 0.7,
      sensorFusionLockTimeFactor: 0.8,
      navigationConstant: 3,
      maxAccelG: 20,
      responseLagS: 0.5,
      motorAccelMs2: 110,
      burnTimeS: 8,
      maxFlightTimeS: 60,
      fuzeRadiusM: 9,
      blastFullDamageRadiusM: 4,
      blastMaxRadiusM: 18,
      blastDamage: 130,
      minLaunchIntervalS: 2,
      decoyChance: 0.3,
      stealthyDecoyFactor: 1.3,
    });
    expect(COUNTERMEASURES).toEqual({ minIntervalS: 0.4, flareBurnS: 3, chaffLastS: 4 });
  });

  it('gives each missile its real character', () => {
    for (const id of MISSILE_IDS) {
      expect(MISSILES[id].id).toBe(id);
      expect(MISSILES[id].name).toBe(id);
    }
    const ir = MISSILE_IDS.filter((id) => MISSILES[id].guidance === 'ir');
    expect(ir).toEqual(['AIM-9X', 'R-73', 'R-74M2']);
    // The AIM-9X looks furthest off the nose and resists flares best; the R-74M2 resists them better than the R-73.
    expect(MISSILES['AIM-9X'].offBoresightDeg).toBe(90);
    for (const id of ir) expect(MISSILES['AIM-9X'].decoyChance).toBeLessThanOrEqual(MISSILES[id].decoyChance);
    expect(MISSILES['R-74M2'].decoyChance).toBeLessThan(MISSILES['R-73'].decoyChance);
    // The R-27R is semi-active: it never guides itself, so its launcher's radar must hold the target to the end.
    expect(MISSILES['R-27R']).toMatchObject({ guidance: 'radar', activeRangeM: 0 });
    for (const id of ['AIM-120C', 'AIM-120D', 'R-77-1', 'R-77M', 'R-37M'] as const) expect(MISSILES[id].activeRangeM, id).toBeGreaterThan(0);
    // Today's AIM-120D is the R-77M's counterpart: more reach and more resistance to chaff than the AIM-120C.
    expect(MISSILES['AIM-120D'].decoyChance).toBe(MISSILES['R-77M'].decoyChance);
    // The R-77-1 matches the AIM-120C; the R-77M's AESA seeker resists chaff better; the R-37M has the big warhead.
    const { id: _a, name: _b, lengthM: _c, diameterM: _d, ...amraam } = MISSILES['AIM-120C'];
    expect(MISSILES['R-77-1']).toMatchObject(amraam);
    expect(MISSILES['R-77M'].decoyChance).toBeLessThan(MISSILES['R-77-1'].decoyChance);
    expect(MISSILES['R-37M'].blastDamage).toBeGreaterThan(MISSILES['R-27R'].blastDamage);
    expect(MISSILES['R-27R'].blastDamage).toBeGreaterThan(MISSILES['R-77-1'].blastDamage);
    expect(MISSILES['R-37M'].maxAccelG).toBeLessThan(MISSILES['R-77-1'].maxAccelG);
  });

  it('flies each missile as far as its real range ranks it, and bots fire it only within its reach', () => {
    const reach = Object.fromEntries(MISSILE_IDS.map((id) => [id, reachM(MISSILES[id])])) as Record<MissileId, number>;
    // R-37M (about 300 km real) > R-77M (about 190) > R-77-1 = AIM-120C (about 110 and 105) > R-27R (about 75).
    expect(reach['R-37M']).toBeGreaterThan(reach['R-77M']);
    expect(reach['R-77M']).toBeGreaterThan(reach['R-77-1'] * 1.4);
    expect(reach['AIM-120D']).toBeGreaterThan(reach['AIM-120C'] * 1.3);
    expect(reach['AIM-120D']).toBeLessThan(reach['R-77M']);
    expect(reach['R-77-1']).toBeCloseTo(reach['AIM-120C'], -1);
    expect(reach['R-27R']).toBeLessThan(reach['R-77-1'] * 0.85);
    expect(reach['R-74M2']).toBeGreaterThan(reach['R-73']);
    for (const id of MISSILE_IDS) {
      const s = MISSILES[id];
      expect(s.maxRangeM, id).toBeLessThan(reach[id]);
      expect(s.minRangeM, id).toBeLessThan(s.maxRangeM);
    }
  });

  it('has a gun and known missiles for every jet', () => {
    for (const a of listAircraft()) {
      expect(CANNONS[a.stores.cannon].id).toBe(a.stores.cannon);
      for (const m of a.stores.missiles) expect(MISSILES[m.missile].id).toBe(m.missile);
    }
  });

  it('has the FAB-500M-62 for Strike (spec §10.4)', () => {
    expect(FAB_500M_62).toMatchObject({ name: 'FAB-500M-62', minReleaseIntervalS: 0.25, damage: 62, fullDamageRadiusM: 35, maxDamageRadiusM: 100, maxFallS: 60 });
    expect(FAB_500M_62.dragPerM).toBeGreaterThan(0);
    expect(BOMBS['FAB-500M-62']).toBe(FAB_500M_62);
  });

  it("makes the player's missiles easier to hit with than an AI pilot's (revision 20)", () => {
    expect(missilesFor({ isBot: true })).toBe(MISSILES);
    expect(missilesFor({ isBot: false })).toBe(PLAYER_MISSILES);
    for (const id of MISSILE_IDS) {
      const plain = MISSILES[id];
      const player = PLAYER_MISSILES[id];
      expect(player.id).toBe(plain.id);
      expect(player.guidance).toBe(plain.guidance);
      expect(player.decoyChance).toBeCloseTo(plain.decoyChance * 0.3);
      expect(player.lockTimeS).toBeLessThan(plain.lockTimeS);
      expect(player.maxAccelG).toBeGreaterThan(plain.maxAccelG);
      expect(player.responseLagS).toBeLessThan(plain.responseLagS);
      expect(player.fuzeRadiusM).toBeGreaterThan(plain.fuzeRadiusM);
      // Same reach and load: only how well it hits changes.
      expect(player.maxFlightTimeS).toBe(plain.maxFlightTimeS);
      expect(player.blastDamage).toBe(plain.blastDamage);
    }
    // The reference missiles get exactly the revision-20 numbers.
    expect(PLAYER_MISSILES['R-73']).toMatchObject({ navigationConstant: 3.5, maxAccelG: 25, gimbalLimitDeg: 70, fuzeRadiusM: 11, blastFullDamageRadiusM: 6, blastMaxRadiusM: 20 });
    expect(PLAYER_MISSILES['R-73'].responseLagS).toBeCloseTo(0.35);
    expect(PLAYER_GUN_REACH).toBe(3);
  });
});
