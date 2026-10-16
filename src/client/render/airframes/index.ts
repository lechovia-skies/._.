import type { AircraftConfig } from '../../../shared/data/aircraft/types.ts';
import { loadoutFor } from '../../../shared/data/loadout.ts';
import { type AircraftModel, cloneModel } from '../aircraft-model.ts';
import type { GearLeg } from '../landing-gear.ts';
import { airframeGearLegs, type Blueprint, buildAirframe } from './airframe.ts';
import { CONDOR_AIRFRAME } from './condor.ts';
import { SAPSAN_AIRFRAME, YASTREB_AIRFRAME } from './flanker.ts';
import { KESTREL_AIRFRAME } from './kestrel.ts';
import { KOBCHIK_AIRFRAME } from './kobchik.ts';
import { TEMPEST_AIRFRAME } from './tempest.ts';

/** The real-type airframes (revision 31), by aircraft id. */
export const AIRFRAMES: Readonly<Record<string, Blueprint>> = {
  tempest: TEMPEST_AIRFRAME,
  condor: CONDOR_AIRFRAME,
  kestrel: KESTREL_AIRFRAME,
  yastreb: YASTREB_AIRFRAME,
  sapsan: SAPSAN_AIRFRAME,
  kobchik: KOBCHIK_AIRFRAME,
};

const templates = new Map<string, AircraftModel>();

/** A copy of the jet's real-type airframe, or null when it has none; built once per type and cloned. */
export function airframeModel(config: AircraftConfig): AircraftModel | null {
  const bp = AIRFRAMES[config.id];
  if (!bp) return null;
  let template = templates.get(config.id);
  if (!template) {
    template = buildAirframe(bp, { air: loadoutFor(config, false), strike: loadoutFor(config, true) });
    templates.set(config.id, template);
  }
  return cloneModel(template);
}

/** The jet's own gear legs when it has a real-type airframe. */
export function airframeGear(config: AircraftConfig): GearLeg[] | undefined {
  const bp = AIRFRAMES[config.id];
  return bp ? airframeGearLegs(bp) : undefined;
}
