/**
 * The weapons the jets carry (spec §10). Since revision 30 they are the real weapons of the jets the roster is modelled
 * on, under their real names, carried in the real numbers (the loads are in each aircraft's data file). Calibres, rates
 * of fire, muzzle velocities and the differences between the missiles (seeker, guidance, motor, warhead) follow public
 * figures; ranges are scaled to the game's sky, where radars see 30–60 km, so a missile reaches about a fifth as far
 * as the real one, and every missile keeps its place against the others. Damage stays a game number.
 */

/**
 * Real aircraft guns: the M61 Vulcan (F-15C, F-16C; the lighter M61A2 in the F-22A), the F-35A's GAU-22/A and the
 * Su-27 family's and MiG-29's GSh-30-1.
 */
export type CannonId = 'M61A1' | 'M61A2' | 'GAU-22/A' | 'GSh-30-1';

export interface CannonSpec {
  id: CannonId;
  /** calibre, mm */
  calibreMm: number;
  /** simulated projectiles per second; each one stands for `roundsPerProjectile` rounds */
  projectilesPerS: number;
  roundsPerProjectile: number;
  muzzleSpeedMs: number;
  damagePerProjectile: number;
  /** standard deviation of the aim error, milliradians */
  dispersionMrad: number;
  lifetimeS: number;
  /** drag constant at sea-level density, per meter (see weapons/ballistics.ts) */
  dragPerM: number;
}

export const CANNONS: Readonly<Record<CannonId, CannonSpec>> = {
  // Six barrels, 20 × 102 mm, 6,000 rounds a minute, about 1,030 m/s.
  M61A1: { id: 'M61A1', calibreMm: 20, projectilesPerS: 25, roundsPerProjectile: 4, muzzleSpeedMs: 1030, damagePerProjectile: 10.4, dispersionMrad: 2.5, lifetimeS: 3, dragPerM: 4e-4 },
  // The F-22A's lighter M61: the same rounds at the same rate.
  M61A2: { id: 'M61A2', calibreMm: 20, projectilesPerS: 25, roundsPerProjectile: 4, muzzleSpeedMs: 1030, damagePerProjectile: 10.4, dispersionMrad: 2.5, lifetimeS: 3, dragPerM: 4e-4 },
  // Four barrels, 25 × 137 mm, 3,300 rounds a minute, about 1,040 m/s.
  'GAU-22/A': { id: 'GAU-22/A', calibreMm: 25, projectilesPerS: 55 / 3, roundsPerProjectile: 3, muzzleSpeedMs: 1040, damagePerProjectile: 14, dispersionMrad: 3, lifetimeS: 3, dragPerM: 3.6e-4 },
  // One barrel, 30 × 165 mm, up to 1,800 rounds a minute, about 860 m/s.
  'GSh-30-1': { id: 'GSh-30-1', calibreMm: 30, projectilesPerS: 15, roundsPerProjectile: 2, muzzleSpeedMs: 860, damagePerProjectile: 17.4, dispersionMrad: 3.5, lifetimeS: 3, dragPerM: 3.2e-4 },
};

/** Real air-to-air missiles. */
export type MissileId = 'AIM-9X' | 'AIM-120C' | 'AIM-120D' | 'R-73' | 'R-74M2' | 'R-27R' | 'R-77-1' | 'R-77M' | 'R-37M';
export const MISSILE_IDS: readonly MissileId[] = ['AIM-9X', 'AIM-120C', 'AIM-120D', 'R-73', 'R-74M2', 'R-27R', 'R-77-1', 'R-77M', 'R-37M'];

export interface MissileSpec {
  id: MissileId;
  /** what the HUD calls it */
  name: string;
  /** real size, for the model in flight and on the pylon */
  lengthM: number;
  diameterM: number;
  /** infrared: the missile's own seeker from launch; radar: the launcher's radar guides it until it goes active */
  guidance: 'ir' | 'radar';
  /**
   * Radar missiles guide on their own inside this range, × (1 − 0.5 · target stealth); 0 for infrared. A semi-active
   * radar missile (the R-27R) has 0 too: it homes on the launcher's radar all the way, so the launcher must keep the
   * target on radar until it hits.
   */
  activeRangeM: number;
  /** AI pilots fire it at targets from here (the closest it arms and turns in time) ... */
  minRangeM: number;
  /** ... out to here, where it still arrives with energy */
  maxRangeM: number;
  /** half-angle of the cone around the seeker axis in which the seeker can pick up a target */
  acquisitionConeDeg: number;
  /** how far off the launcher's nose the seeker can look */
  offBoresightDeg: number;
  offBoresightHelmetDeg: number;
  lockTimeS: number;
  /** lock-time multiplier for aircraft with a helmet sight */
  helmetLockTimeFactor: number;
  /** lock-time multiplier for two-seat aircraft (the back-seater runs the radar) */
  twoSeatLockTimeFactor: number;
  /** lock-time multiplier for aircraft with sensor fusion */
  sensorFusionLockTimeFactor: number;
  lockRangeTailM: number;
  lockRangeHeadOnM: number;
  /** lock-range multiplier against a target on afterburner */
  afterburnerRangeFactor: number;
  /** a lock, once made, is kept out to this multiple of the lock range */
  lockKeepRangeFactor: number;
  navigationConstant: number;
  maxAccelG: number;
  /**
   * The turning acceleration follows the guidance command with this first-order lag, so a hard break timed shortly
   * before impact makes the missile miss (spec §10.2).
   */
  responseLagS: number;
  motorAccelMs2: number;
  burnTimeS: number;
  maxFlightTimeS: number;
  /** air drag: deceleration = dragCoef * density * speed² */
  dragCoef: number;
  /** extra deceleration per m/s² of turning acceleration */
  maneuverDragFactor: number;
  /** in flight, the target is lost when it is further than this from the missile's direction of flight */
  gimbalLimitDeg: number;
  /** the fuze and warhead stay safe for this long after launch */
  armTimeS: number;
  fuzeRadiusM: number;
  blastFullDamageRadiusM: number;
  blastMaxRadiusM: number;
  blastDamage: number;
  /** after a launch, no missile of the same guidance leaves for this long */
  minLaunchIntervalS: number;
  /** after the motor burns out, the missile self-destructs below this speed */
  selfDestructSpeedMs: number;
  /** chance that one flare (infrared) or one chaff cartridge (radar) decoys this missile */
  decoyChance: number;
  /** decoy-chance multiplier when the target is on afterburner */
  afterburnerDecoyFactor: number;
  /** decoy-chance multiplier against a stealthy target (stealth ≥ STEALTHY_FROM) */
  stealthyDecoyFactor: number;
}

/** Aircraft at least this stealthy make chaff work better (spec §10.2). */
export const STEALTHY_FROM = 0.5;

/**
 * The R-73 (AA-11 Archer): the Russian jets' short-range infrared missile, with thrust vectoring and a seeker that
 * looks 60° off the nose, 75° slaved to a helmet sight. It is the game's reference infrared missile (the "Dart" until
 * revision 30, with the same numbers).
 */
const R_73: MissileSpec = {
  id: 'R-73',
  name: 'R-73',
  lengthM: 2.9,
  diameterM: 0.17,
  guidance: 'ir',
  activeRangeM: 0,
  minRangeM: 500,
  maxRangeM: 7000,
  acquisitionConeDeg: 10,
  offBoresightDeg: 60,
  offBoresightHelmetDeg: 75,
  lockTimeS: 0.8,
  helmetLockTimeFactor: 0.7,
  twoSeatLockTimeFactor: 1,
  sensorFusionLockTimeFactor: 1,
  lockRangeTailM: 9000,
  lockRangeHeadOnM: 4000,
  afterburnerRangeFactor: 1.3,
  lockKeepRangeFactor: 1.2,
  navigationConstant: 3,
  maxAccelG: 20,
  responseLagS: 0.5,
  motorAccelMs2: 150,
  burnTimeS: 5,
  maxFlightTimeS: 25,
  dragCoef: 1.2e-4,
  maneuverDragFactor: 0.1,
  gimbalLimitDeg: 60,
  armTimeS: 0.3,
  fuzeRadiusM: 9,
  blastFullDamageRadiusM: 4,
  blastMaxRadiusM: 18,
  blastDamage: 130,
  minLaunchIntervalS: 1,
  selfDestructSpeedMs: 250,
  decoyChance: 0.35,
  afterburnerDecoyFactor: 0.5,
  stealthyDecoyFactor: 1,
};

/**
 * The AIM-120C AMRAAM (C-7): the active radar missile the US jets carried before the AIM-120D. The launcher's radar
 * and datalink guide it until its own seeker takes over. It is the game's reference radar missile (the "Lance" until
 * revision 30, with the same numbers), from which the AIM-120D and the R-77 family are made.
 */
const AIM_120C: MissileSpec = {
  id: 'AIM-120C',
  name: 'AIM-120C',
  lengthM: 3.66,
  diameterM: 0.178,
  guidance: 'radar',
  activeRangeM: 10000,
  minRangeM: 6000,
  maxRangeM: 25000,
  acquisitionConeDeg: 0,
  offBoresightDeg: 0,
  offBoresightHelmetDeg: 0,
  lockTimeS: 1.5,
  helmetLockTimeFactor: 1,
  twoSeatLockTimeFactor: 0.7,
  sensorFusionLockTimeFactor: 0.8,
  lockRangeTailM: 0,
  lockRangeHeadOnM: 0,
  afterburnerRangeFactor: 1,
  lockKeepRangeFactor: 1,
  navigationConstant: 3,
  maxAccelG: 20,
  responseLagS: 0.5,
  motorAccelMs2: 110,
  burnTimeS: 8,
  maxFlightTimeS: 60,
  dragCoef: 6e-5,
  maneuverDragFactor: 0.1,
  gimbalLimitDeg: 60,
  armTimeS: 0.5,
  fuzeRadiusM: 9,
  blastFullDamageRadiusM: 4,
  blastMaxRadiusM: 18,
  blastDamage: 130,
  minLaunchIntervalS: 2,
  selfDestructSpeedMs: 250,
  decoyChance: 0.3,
  afterburnerDecoyFactor: 1,
  stealthyDecoyFactor: 1.3,
};

/**
 * The AIM-9X Sidewinder (Block II): an imaging infrared seeker that looks 90° off the nose, so it locks from far off
 * the boresight and is the hardest to decoy with flares; a little longer-ranged than the R-73.
 */
const AIM_9X: MissileSpec = {
  ...R_73,
  id: 'AIM-9X',
  name: 'AIM-9X',
  lengthM: 3.02,
  diameterM: 0.127,
  maxRangeM: 8000,
  offBoresightDeg: 90,
  offBoresightHelmetDeg: 90,
  lockRangeTailM: 10000,
  lockRangeHeadOnM: 4500,
  gimbalLimitDeg: 90,
  decoyChance: 0.15,
};

/** The R-74M2 (izdeliye 760): the Su-57's R-73 for its side bays, with a seeker better against flares, more reach. */
const R_74M2: MissileSpec = {
  ...R_73,
  id: 'R-74M2',
  name: 'R-74M2',
  maxRangeM: 8000,
  lockRangeTailM: 10000,
  lockRangeHeadOnM: 4500,
  burnTimeS: 6,
  decoyChance: 0.2,
};

/**
 * The AIM-120D: today's AMRAAM, carried by the USAF's F-15C, F-16C, F-22A and F-35A. GPS-aided navigation, a two-way
 * datalink and a better seeker give it about half as much reach again as the AIM-120C and more resistance to chaff:
 * the counterpart of the R-77M.
 */
const AIM_120D: MissileSpec = {
  ...AIM_120C,
  id: 'AIM-120D',
  name: 'AIM-120D',
  maxRangeM: 33000,
  burnTimeS: 12,
  maxFlightTimeS: 90,
  decoyChance: 0.2,
};

/** The R-77-1 (RVV-SD): the Russian AMRAAM, with its lattice tail fins; it matches the AIM-120C. */
const R_77_1: MissileSpec = { ...AIM_120C, id: 'R-77-1', name: 'R-77-1', lengthM: 3.71, diameterM: 0.2 };

/**
 * The R-77M (izdeliye 180): the Su-57's main-bay missile. A two-pulse motor (the second pulse lights for the end
 * game) reaches about 1.5 times as far as the R-77-1, and its AESA seeker goes active sooner and resists chaff better.
 */
const R_77M: MissileSpec = {
  ...R_77_1,
  id: 'R-77M',
  name: 'R-77M',
  activeRangeM: 12000,
  maxRangeM: 35000,
  burnTimeS: 13,
  maxFlightTimeS: 95,
  decoyChance: 0.2,
};

/**
 * The R-27R (AA-10 Alamo): a semi-active radar missile, so the launcher's radar must hold the target until impact,
 * and the target hears the lock all the way. Bigger and older: shorter-ranged than the R-77-1, easier to decoy with
 * chaff, with a heavier warhead.
 */
const R_27R: MissileSpec = {
  ...AIM_120C,
  id: 'R-27R',
  name: 'R-27R',
  lengthM: 4.08,
  diameterM: 0.23,
  activeRangeM: 0,
  maxRangeM: 18000,
  burnTimeS: 6,
  maxFlightTimeS: 45,
  dragCoef: 7e-5,
  responseLagS: 0.6,
  blastFullDamageRadiusM: 5,
  blastMaxRadiusM: 20,
  blastDamage: 140,
  decoyChance: 0.4,
};

/**
 * The R-37M (AA-13 Axehead): the very-long-range missile, made for big aircraft such as radar planes. Fast and far
 * (half as far again as the R-77M), with a big seeker and a 60 kg warhead, but it turns at only 12 g, and it is
 * slower to lock and launch.
 */
const R_37M: MissileSpec = {
  ...AIM_120C,
  id: 'R-37M',
  name: 'R-37M',
  lengthM: 4.2,
  diameterM: 0.38,
  activeRangeM: 20000,
  minRangeM: 15000,
  maxRangeM: 45000,
  lockTimeS: 2,
  maxAccelG: 12,
  responseLagS: 0.7,
  motorAccelMs2: 120,
  burnTimeS: 14,
  maxFlightTimeS: 130,
  dragCoef: 4e-5,
  fuzeRadiusM: 12,
  blastFullDamageRadiusM: 6,
  blastMaxRadiusM: 25,
  blastDamage: 200,
  minLaunchIntervalS: 3,
  decoyChance: 0.25,
};

export const MISSILES: Readonly<Record<MissileId, MissileSpec>> = {
  'AIM-9X': AIM_9X,
  'AIM-120C': AIM_120C,
  'AIM-120D': AIM_120D,
  'R-73': R_73,
  'R-74M2': R_74M2,
  'R-27R': R_27R,
  'R-77-1': R_77_1,
  'R-77M': R_77M,
  'R-37M': R_37M,
};

/**
 * The player's missiles (revision 20). The owner found hitting far too hard: in bot duels a Veteran's infrared
 * missile was decoyed by nearly every defence (each flare of the last seconds rolls again). The player's missiles lock
 * sooner, shrug off most countermeasures, turn harder and quicker and burst with a wider blast. AI pilots, wingmen
 * included, keep the plain specs. For the reference R-73 and AIM-120C this gives the revision-20 numbers exactly.
 */
function assisted(spec: MissileSpec): MissileSpec {
  return {
    ...spec,
    acquisitionConeDeg: spec.acquisitionConeDeg * 1.3,
    lockTimeS: spec.lockTimeS * 0.7,
    navigationConstant: spec.navigationConstant + 0.5,
    maxAccelG: spec.maxAccelG * 1.25,
    responseLagS: spec.responseLagS * 0.7,
    gimbalLimitDeg: spec.gimbalLimitDeg + 10,
    fuzeRadiusM: spec.fuzeRadiusM + 2,
    blastFullDamageRadiusM: spec.blastFullDamageRadiusM + 2,
    blastMaxRadiusM: spec.blastMaxRadiusM + 2,
    decoyChance: spec.decoyChance * 0.3,
  };
}

export const PLAYER_MISSILES: Readonly<Record<MissileId, MissileSpec>> = Object.fromEntries(MISSILE_IDS.map((id) => [id, assisted(MISSILES[id])])) as Record<
  MissileId,
  MissileSpec
>;

/** The missiles this pilot fires: the player's assisted ones, or the plain ones for an AI pilot. */
export function missilesFor(pilot: { readonly isBot: boolean }): Readonly<Record<MissileId, MissileSpec>> {
  return pilot.isBot ? MISSILES : PLAYER_MISSILES;
}

/** The player's cannon rounds hit within this many times the target's hit radius (revision 20; 2 at first, 3 since). */
export const PLAYER_GUN_REACH = 3;

/**
 * Flares and chaff (revision 30: counted apart, in the jet's real numbers). One press of the countermeasures key
 * releases one flare and one chaff cartridge, of whichever are left: infrared missiles roll against the flare, radar
 * missiles against the chaff.
 */
export interface CountermeasureSpec {
  /** minimum time between two releases */
  minIntervalS: number;
  flareBurnS: number;
  chaffLastS: number;
}

export const COUNTERMEASURES: CountermeasureSpec = { minIntervalS: 0.4, flareBurnS: 3, chaffLastS: 4 };

/** Throttle above which the engine is on afterburner (spec §5.3). */
export const AFTERBURNER_THROTTLE = 0.9;

export type BombId = 'FAB-500M-62';

export interface BombSpec {
  id: BombId;
  name: string;
  /** real size, for the model */
  lengthM: number;
  diameterM: number;
  minReleaseIntervalS: number;
  /** drag constant at sea-level density, per meter: the bomb decelerates by dragPerM · v² */
  dragPerM: number;
  damage: number;
  fullDamageRadiusM: number;
  maxDamageRadiusM: number;
  /** a bomb still falling after this long disappears */
  maxFallS: number;
}

/**
 * The FAB-500M-62: the Russian 500 kg general-purpose bomb with the low-drag shape for fighters (spec §10.4). Strike
 * attackers carry it, as many as their jet's strike load says (4 or 6 where the abstract bomb before revision 30 came
 * 8 to a jet). It damages ground targets, never aircraft: two within 35 m destroy one, so a two-bomb stick on target
 * does it, and its blast reaches 100 m.
 */
export const FAB_500M_62: BombSpec = {
  id: 'FAB-500M-62',
  name: 'FAB-500M-62',
  lengthM: 2.4,
  diameterM: 0.4,
  minReleaseIntervalS: 0.25,
  dragPerM: 8e-5,
  damage: 62,
  fullDamageRadiusM: 35,
  maxDamageRadiusM: 100,
  maxFallS: 60,
};

export const BOMBS: Readonly<Record<BombId, BombSpec>> = { 'FAB-500M-62': FAB_500M_62 };
