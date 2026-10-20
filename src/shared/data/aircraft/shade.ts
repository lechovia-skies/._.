import type { AircraftConfig } from './types.ts';

/** The F-35A Lightning II: stealth multirole fighter. Its flight model and numbers are the game's own, tuned for play (spec §9). */
export const shade: AircraftConfig = {
  id: 'shade',
  // Real names since revision 38 (at the owner's request); the game called it the Shade before.
  name: 'F-35A',
  nickname: 'Lightning II',
  team: 'usa',
  role: 'Stealth multirole fighter',
  description:
    'Stealthy multirole jet with the longest-range sensors. Enemy radars see it late and its sensor fusion locks fast, but it accelerates slowly and carries only its four AIM-120D inside, no heat-seekers.',
  physics: {
    massKg: 21000,
    wingAreaM2: 43,
    thrustMilN: 120000,
    thrustAbN: 195000,
    cd0: 0.025,
    k: 0.14,
    clAlpha: 4.0,
    alphaMaxDeg: 28,
    aoaLimiterDeg: 32,
    gMax: 9,
    gMin: -3,
    maxPitchRateDegS: 30,
    maxRollRateDegS: 130,
    maxYawRateDegS: 20,
    thrustVectoring: 0,
    fuelKg: 7500,
    departureResistance: 0.7,
  },
  sensors: {
    radarRangeKm: 60,
    radarConeDeg: 60,
    stealth: 0.85,
    irSignature: 0.9,
    helmetSight: false,
    twoSeat: false,
    sensorFusion: true,
  },
  // F-35A in its stealth air-to-air load: four AIM-120D in the two bays (the inner stations take only air-to-air
  // missiles); its AIM-9X would ride outside and give the stealth away. GAU-22/A with 182 rounds over the left intake.
  // Flare and chaff loads are not published: the game's earlier 32 salvos, as 32 of each.
  stores: { cannon: 'GAU-22/A', cannonRounds: 182, missiles: [{ missile: 'AIM-120D', count: 4 }], flares: 32, chaff: 32 },
  damage: { hitPoints: 100, hitRadiusM: 5 },
  visual: {
    lengthM: 15.7,
    spanM: 10.7,
    fuselageRadiusM: 0.95,
    noseLengthFraction: 0.22,
    wingSweepDeg: 35,
    wingRootChordM: 6.0,
    wingTipChordM: 1.9,
    wingPositionFraction: 0.42,
    tail: 'twin-canted',
    tailHeightM: 2.4,
    canards: false,
    engines: 1,
    colors: { primary: '#7d858c', secondary: '#666e75', accent: '#2c3238' },
    intakes: 'caret',
    wingShape: 'diamond',
    tailSweepDeg: 35,
  },
  hudUnits: 'imperial',
  performance: {
    topSpeedMach11km: [1.6, 1.9],
    topSpeedMachSeaLevel: [0.95, 1.2],
    instantTurnDegS170: [17, 23],
    stallSpeedMs: [55, 75],
  },
};
