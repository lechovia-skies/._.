import { type BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { addEngines, type AircraftModel } from '../aircraft-model.ts';
import type { GearLeg } from '../landing-gear.ts';
import type { Loadout } from '../../../shared/data/loadout.ts';
import { cockpitFitFrom } from '../cockpit.ts';
import { merge, type NozzleParts, type PilotParts } from './kit.ts';
import { type BodyFrame, type PaintSpec, skinMaterial } from './paint.ts';
import { planPylons, type StoresPlan, storeMeshes, tankGeometry } from './stores.ts';

/** The pieces of an airframe in drawing coordinates, grouped by what they are made of. */
export interface AirframeParts {
  /** painted skin */
  skin: BufferGeometry[];
  /** intake ducts, gaps */
  dark: BufferGeometry[];
  /** the dark cockpit under the canopy, seen through the glass (hidden from the cockpit view, revision 34) */
  tub?: BufferGeometry[];
  /** canopy glass and sensor windows */
  glass: BufferGeometry[];
  /** canopy frames, launch rails, antennas */
  trim: BufferGeometry[];
  /** helmets */
  crew: BufferGeometry[];
  /** the pilot's suit, headrest and visor round the helmets (revision 49; hidden from the cockpit view) */
  pilot?: PilotParts;
  nozzles: NozzleParts[];
}

/** A nose or main gear leg in drawing coordinates (the main leg is mirrored to the other side). */
export interface DrawnLeg {
  fs: number;
  bl?: number;
  /** where the strut hangs from */
  wl: number;
  /** wheel radius and width */
  r: number;
  w: number;
  twin?: boolean;
  /** axle this far aft of the attachment (negative: ahead) */
  rake?: number;
  fold?: 'forward' | 'aft' | 'inward';
}

/** One real type's airframe (revision 31): its parts, the height its body origin sits at, and its paint. */
export interface Blueprint {
  /** height of the body origin above the ground on its wheels (the wing plane), metres */
  datumWlM: number;
  /** length of the drawing from the nose tip to the tail, metres (the jet's length) */
  lengthM: number;
  parts(): AirframeParts;
  paint: PaintSpec;
  /** canopy tint: clear or the stealth jets' gold */
  canopyTint: number;
  /** helmet colour */
  helmet: number;
  gear: { nose: DrawnLeg; main: DrawnLeg };
  /** hardpoints and where each store goes; none for jets that carry everything inside */
  stores?: StoresPlan;
}

/** The type's gear legs in the body frame. */
export function airframeGearLegs(bp: Blueprint): GearLeg[] {
  const at = (l: DrawnLeg, side: number) => ({ x: side * (l.bl ?? 0), y: l.wl - bp.datumWlM, z: l.fs - bp.lengthM / 2 });
  const { nose, main } = bp.gear;
  return [
    { ...at(nose, 1), wheelR: nose.r, wheelW: nose.w, twin: nose.twin, rake: nose.rake, fold: nose.fold ?? 'forward' },
    ...[-1, 1].map((side) => ({ ...at(main, side), wheelR: main.r, wheelW: main.w, twin: main.twin, rake: main.rake, fold: main.fold ?? 'inward', door: true })),
  ];
}

const darkMaterial = new MeshStandardMaterial({ color: 0x15181b, roughness: 0.92, metalness: 0.05, side: DoubleSide });
// Both sides: the canopy bows are seen from inside too (revision 34).
const trimMaterial = new MeshStandardMaterial({ color: 0x2b3035, roughness: 0.55, metalness: 0.4, side: DoubleSide });
const metalMaterial = new MeshStandardMaterial({ color: 0x5a5c5e, roughness: 0.38, metalness: 0.85 });
const cavityMaterial = new MeshStandardMaterial({ color: 0x232120, roughness: 0.8, metalness: 0.3, side: DoubleSide });
// The pilot (revision 49): an olive flight suit and a dark, glossy visor that mirrors the sky.
const suitMaterial = new MeshStandardMaterial({ color: 0x3b4033, roughness: 0.85, metalness: 0 });
const visorMaterial = new MeshPhysicalMaterial({ color: 0x0c0e12, roughness: 0.06, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 });

/**
 * Builds the airframe in the body frame (nose toward -z), with afterburner flames at the nozzle exits and the stores
 * of the jet's loads (`air`, and `strike` when it has a separate strike load).
 */
export function buildAirframe(bp: Blueprint, loads: { air: Loadout; strike?: Loadout } = { air: { missiles: [], bomb: null, bombs: 0 } }): AircraftModel {
  const frame: BodyFrame = { lengthM: bp.lengthM, datumWlM: bp.datumWlM };
  const toBody = new Matrix4().makeTranslation(0, -bp.datumWlM, -bp.lengthM / 2);
  const parts = bp.parts();
  const root = new Group();
  const add = (geometries: BufferGeometry[], material: MeshStandardMaterial, name: string) => {
    if (geometries.length === 0) return null;
    const g = merge(geometries).applyMatrix4(toBody);
    g.computeBoundingSphere();
    const mesh = new Mesh(g, material);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };
  const sets = loads.strike && loads.strike !== loads.air ? [loads.air, loads.strike] : [loads.air];
  const skin = [...parts.skin];
  if (bp.stores) skin.push(...planPylons(bp.stores, sets));
  const tanks = bp.stores ? tankGeometry(bp.stores, new Matrix4()) : null;
  if (tanks) skin.push(tanks);
  add(skin, skinMaterial(bp.paint, frame), 'airframe');
  if (bp.stores) {
    for (const m of storeMeshes(bp.stores, loads.air, 'air', toBody)) root.add(m);
    if (sets.length > 1 && loads.strike) for (const m of storeMeshes(bp.stores, loads.strike, 'strike', toBody)) root.add(m);
  }
  add(parts.dark, darkMaterial, 'airframe-dark');
  add(parts.tub ?? [], darkMaterial, 'cockpit-tub');
  // Where the pilot sits, for the cockpit view (revision 34).
  if (parts.crew.length > 0 && parts.tub?.length) {
    root.userData.cockpit = cockpitFitFrom(parts.crew[0].clone().applyMatrix4(toBody), merge(parts.tub).applyMatrix4(toBody));
  }
  add(parts.trim, trimMaterial, 'airframe-trim');
  add(
    parts.nozzles.map((n) => n.metal),
    metalMaterial,
    'nozzle',
  );
  add(
    parts.nozzles.map((n) => n.dark),
    cavityMaterial,
    'nozzle-cavity',
  );
  const canopy = new Group();
  canopy.name = 'canopy';
  const glass = new MeshPhysicalMaterial({
    color: bp.canopyTint,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 2.4,
    depthWrite: false,
  });
  const glassMesh = add(parts.glass, glass, 'canopy-glass');
  const crewMesh = add(parts.crew, new MeshPhysicalMaterial({ color: bp.helmet, roughness: 0.4, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2 }), 'crew');
  const suitMesh = add(parts.pilot?.suit ?? [], suitMaterial, 'crew-suit');
  const visorMesh = add(parts.pilot?.visor ?? [], visorMaterial, 'crew-visor');
  for (const m of [glassMesh, crewMesh, suitMesh, visorMesh]) if (m) canopy.add(m);
  root.add(canopy);
  const exits = parts.nozzles.map((n) => new Vector3(...n.exit).applyMatrix4(toBody).add(new Vector3(0, 0, 0.05)));
  const radius = parts.nozzles[0]?.radius ?? 0.5;
  return { root, ...addEngines(root, exits, radius) };
}
