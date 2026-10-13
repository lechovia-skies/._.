import type { AircraftConfig, MissileLoad } from './aircraft/types.ts';
import { BOMBS, type BombSpec, MISSILES, type MissileSpec } from './weapons.ts';

/** A jet carries at most this many types of missile (the input sends the selected one in 3 bits). */
export const MAX_MISSILE_SLOTS = 8;

/**
 * What an aircraft carries this life (revision 30): its jet's air-to-air load, or the jet's strike load when it
 * attacks in a Strike match. Each missile type is one slot; the pilot selects a slot (keys 1 and 2) and fires from it.
 */
export interface Loadout {
  readonly missiles: readonly MissileLoad[];
  readonly bomb: BombSpec | null;
  readonly bombs: number;
}

export const EMPTY_LOADOUT: Loadout = { missiles: [], bomb: null, bombs: 0 };

const cache = new WeakMap<AircraftConfig, { air: Loadout; strike: Loadout }>();

/** The load of `config`, for a Strike attacker when `strike` (a jet with no strike load then carries its usual one). */
export function loadoutFor(config: AircraftConfig, strike: boolean): Loadout {
  let both = cache.get(config);
  if (!both) {
    const s = config.stores;
    const air: Loadout = { missiles: s.missiles, bomb: null, bombs: 0 };
    const bombing: Loadout = s.strike ? { missiles: s.strike.missiles, bomb: BOMBS[s.strike.bomb], bombs: s.strike.bombs } : air;
    both = { air, strike: bombing };
    cache.set(config, both);
  }
  return strike ? both.strike : both.air;
}

/** The missile in a slot, or null for an empty or unknown slot. */
export function slotMissile(loadout: Loadout, slot: number, specs: Readonly<Record<string, MissileSpec>> = MISSILES): MissileSpec | null {
  const load = loadout.missiles[slot];
  return load ? (specs[load.missile] ?? null) : null;
}

/**
 * The slot a press of the infrared (1) or radar (2) key selects: the next slot of that guidance after `current`, so
 * pressing again steps through the types; the current one when it is the only one; -1 when the jet carries none.
 */
export function nextMissileSlot(loadout: Loadout, current: number, guidance: 'ir' | 'radar'): number {
  const n = loadout.missiles.length;
  for (let i = 1; i <= n; i++) {
    const slot = (((current + i) % n) + n) % n;
    if (MISSILES[loadout.missiles[slot].missile].guidance === guidance) return slot;
  }
  return -1;
}

/** The slot selected in a new jet: its first infrared missile, or its first missile of any kind. */
export function defaultMissileSlot(loadout: Loadout): number {
  const ir = loadout.missiles.findIndex((l) => MISSILES[l.missile].guidance === 'ir');
  return ir >= 0 ? ir : 0;
}
