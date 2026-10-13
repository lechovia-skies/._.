import { Quaternion, Vector3 } from 'three';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { loadoutFor } from '../../shared/data/loadout.ts';
import { createFlightState } from '../../shared/physics/flight-model.ts';
import { createSeeker } from '../../shared/targeting/ir-seeker.ts';
import { createRadarLock } from '../../shared/targeting/radar-lock.ts';
import type { AircraftView } from '../session/game-session.ts';

/** An aircraft view for client tests: level at 1 km, x = id × 100 m, heading north at 200 m/s. */
export function testView(id: number, over: Partial<AircraftView> = {}): AircraftView {
  const config = over.config ?? kestrel;
  const flight = createFlightState({ position: new Vector3(id * 100, 1000, 0), headingRad: 0, speed: 200, throttle: 0.5 });
  const s = config.stores;
  const loadout = over.loadout ?? loadoutFor(config, false);
  return {
    id,
    callsign: `P${id}`,
    team: config.team,
    config,
    isLocal: false,
    isBot: false,
    alive: true,
    hp: config.damage.hitPoints,
    spawnGen: 1,
    position: flight.pos.clone(),
    quaternion: new Quaternion(),
    flight,
    boundarySecondsLeft: null,
    respawnInS: null,
    gStrain: 0,
    blackedOutS: null,
    supply: null,
    kills: 0,
    deaths: 0,
    firingCannon: false,
    stores: { cannonRounds: s.cannonRounds, missiles: loadout.missiles.map((m) => m.count), flares: s.flares, chaff: s.chaff, bombs: loadout.bombs, fuelKg: config.physics.fuelKg },
    loadout,
    targetId: null,
    contacts: [],
    datalink: [],
    seeker: createSeeker(),
    radarLock: createRadarLock(),
    lockedByRadar: false,
    incoming: null,
    ...over,
  };
}
