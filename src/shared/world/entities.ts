import type { Vector3 } from 'three';
import type { AircraftConfig, TeamId } from '../data/aircraft/types.ts';
import { EMPTY_LOADOUT, type Loadout, loadoutFor } from '../data/loadout.ts';
import { clearCredit, type CreditRecord } from '../damage/damage.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import type { FlightState } from '../physics/flight-model.ts';
import { createSeeker, resetSeeker, type SeekerState } from '../targeting/ir-seeker.ts';
import { createRadarLock, type RadarLockState, resetRadarLock } from '../targeting/radar-lock.ts';
import type { Contact } from '../targeting/sensors.ts';
import { TRIGGER_AT_REST } from '../weapons/cannon.ts';
import type { SupportSpec } from '../modes/mode.ts';
import { MotionHistory } from './history.ts';
import type { SpawnStart } from './spawns.ts';
import type { SupplyKind } from './supply.ts';

export interface StoresState {
  cannonRounds: number;
  /** missiles left of each type of the loadout, in its order (revision 30) */
  missiles: number[];
  flares: number;
  chaff: number;
  bombs: number;
  /** internal fuel left (revision 16) */
  fuelKg: number;
}

/** Long ago: "never fired" for launch and countermeasure intervals. */
export const NEVER = -1e9;

export interface AircraftEntity extends CreditRecord {
  readonly id: number;
  /** a pilot who joins a match online takes over an AI pilot's jet, name and all (revision 36) */
  callsign: string;
  team: TeamId;
  config: AircraftConfig;
  isBot: boolean;
  flight: FlightState;
  /** position at the start of the current tick, for swept hit tests */
  readonly prevPos: Vector3;
  /** last applied (sanitized) input */
  input: ControlInput;
  alive: boolean;
  hp: number;
  /** increments on every spawn; clients use it to avoid interpolating across a respawn */
  spawnGen: number;
  /** tick at which a destroyed aircraft respawns, -1 while alive */
  respawnAtTick: number;
  outOfBoundsTicks: number;
  kills: number;
  deaths: number;
  spawnSlot: number;
  readonly stores: StoresState;
  cannonAccumulator: number;
  firingCannon: boolean;
  /** last infrared missile launch */
  lastMissileTick: number;
  /** last radar missile launch */
  lastMrmTick: number;
  lastCountermeasureTick: number;
  lastBombTick: number;
  /** this aircraft flies Strike sorties: every new jet carries its strike load (bombs) instead of its usual one */
  readonly strike: boolean;
  /** what the jet carries this life, set at each spawn from its config (revision 30) */
  loadout: Loadout;
  /** enemies this aircraft currently sees or has on radar */
  readonly contacts: Contact[];
  /** designated target */
  targetId: number | null;
  readonly seeker: SeekerState;
  /** radar lock for the selected radar missile (spec §10.3) */
  readonly radarLock: RadarLockState;
  /** RWR: an enemy radar lock, or a radar missile its launcher still guides, is on this aircraft (spec §10.3) */
  lockedByRadar: boolean;
  /** recent motion, for the bots' reaction delay and online lag compensation */
  readonly history: MotionHistory;
  /** online (revision 28): how many ticks behind this pilot sees the others; their gunfire is judged that far back */
  viewDelayTicks: number;
  /** where this aircraft starts after each death: in the air or on the runway (M4) */
  start: SpawnStart;
  /** a mode-flown support aircraft (a Sentinel, M5); null for fighters */
  readonly support: SupportSpec | null;
  /** enemies a teammate has on radar that this aircraft does not see itself (datalink, M5) */
  readonly datalink: number[];
  /** the jet this pilot flies after the next respawn, when they chose another (M5) */
  nextAircraftId: string | null;
  /** the pilot's G strain, 0 clear … 1 blacked out (revision 21) */
  gStrain: number;
  /** tick at which the pilot blacked out (G-LOC), -1 while conscious */
  blackoutTick: number;
  /** how the jet is taking on supplies at a friendly airfield now, and for how many ticks (revision 22) */
  supplyKind: SupplyKind | null;
  supplyTicks: number;
}

export interface NewAircraft {
  id: number;
  callsign: string;
  team: TeamId;
  config: AircraftConfig;
  isBot: boolean;
  flight: FlightState;
  spawnSlot: number;
  /** see AircraftEntity.strike; false when left out */
  strike?: boolean;
  start?: SpawnStart;
  support?: SupportSpec;
}

export function createAircraftEntity(n: NewAircraft): AircraftEntity {
  const entity: AircraftEntity = {
    id: n.id,
    callsign: n.callsign,
    team: n.team,
    config: n.config,
    isBot: n.isBot,
    flight: n.flight,
    prevPos: n.flight.pos.clone(),
    input: neutralInput(0.8),
    alive: true,
    hp: n.config.damage.hitPoints,
    spawnGen: 1,
    respawnAtTick: -1,
    outOfBoundsTicks: 0,
    kills: 0,
    deaths: 0,
    spawnSlot: n.spawnSlot,
    stores: { cannonRounds: 0, missiles: [], flares: 0, chaff: 0, bombs: 0, fuelKg: 0 },
    cannonAccumulator: TRIGGER_AT_REST,
    firingCannon: false,
    lastMissileTick: NEVER,
    lastMrmTick: NEVER,
    lastCountermeasureTick: NEVER,
    lastBombTick: NEVER,
    strike: n.strike ?? false,
    loadout: EMPTY_LOADOUT,
    contacts: [],
    targetId: null,
    seeker: createSeeker(),
    radarLock: createRadarLock(),
    lockedByRadar: false,
    history: new MotionHistory(),
    viewDelayTicks: 0,
    lastDamagedBy: null,
    lastDamagedTick: -1,
    lastLockedBy: null,
    lastLockedTick: -1,
    start: n.start ?? 'air',
    support: n.support ?? null,
    datalink: [],
    nextAircraftId: null,
    gStrain: 0,
    blackoutTick: -1,
    supplyKind: null,
    supplyTicks: 0,
  };
  resetForSpawn(entity);
  return entity;
}

/** Full hit points, stores and tanks, a clear-headed pilot, cleared targeting and credit: a freshly spawned aircraft. */
export function resetForSpawn(a: AircraftEntity): void {
  a.hp = a.config.damage.hitPoints;
  a.gStrain = 0;
  a.blackoutTick = -1;
  a.supplyKind = null;
  a.supplyTicks = 0;
  a.loadout = loadoutFor(a.config, a.strike);
  fillStores(a, true);
  a.cannonAccumulator = TRIGGER_AT_REST;
  a.firingCannon = false;
  a.lastMissileTick = NEVER;
  a.lastMrmTick = NEVER;
  a.lastCountermeasureTick = NEVER;
  a.lastBombTick = NEVER;
  a.contacts.length = 0;
  a.datalink.length = 0;
  a.targetId = null;
  resetSeeker(a.seeker, 'off');
  resetRadarLock(a.radarLock, 'off');
  a.lockedByRadar = false;
  a.history.reset();
  a.prevPos.copy(a.flight.pos);
  clearCredit(a);
}

/**
 * The jet's gun rounds, missiles, flares, chaff and fuel back to full (on spawn, and at a friendly airfield). Bombs
 * belong to a Strike sortie: they are loaded only with `bombs` (on spawn).
 */
export function fillStores(a: AircraftEntity, bombs: boolean): void {
  const s = a.config.stores;
  const st = a.stores;
  st.cannonRounds = s.cannonRounds;
  st.missiles.length = a.loadout.missiles.length;
  for (let i = 0; i < st.missiles.length; i++) st.missiles[i] = a.loadout.missiles[i].count;
  st.flares = s.flares;
  st.chaff = s.chaff;
  if (bombs) st.bombs = a.loadout.bombs;
  st.fuelKg = a.config.physics.fuelKg;
}

/** Missiles left of every type. */
export function missilesLeft(stores: Pick<StoresState, 'missiles'>): number {
  let n = 0;
  for (const c of stores.missiles) n += c;
  return n;
}
