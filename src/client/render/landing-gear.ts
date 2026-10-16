import { BoxGeometry, BufferAttribute, type BufferGeometry, Color, CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AircraftVisual } from '../../shared/data/aircraft/types.ts';
import { GEAR_HEIGHT_M } from '../../shared/physics/ground.ts';

/** The wheels touch the runway with the springs carrying the weight (about 12 cm down). */
export const WHEEL_BOTTOM_Y = -(GEAR_HEIGHT_M - 0.12);

/** One gear leg, in the body frame. */
export interface GearLeg {
  /** where the strut hangs from */
  x: number;
  y: number;
  z: number;
  wheelR: number;
  wheelW: number;
  /** two wheels side by side on the axle */
  twin?: boolean;
  /** the axle sits this far aft of the attachment (negative: ahead of it) */
  rake?: number;
  /** how the leg stows: swinging forward or aft about the x axis, or sideways in toward the centreline */
  fold: 'forward' | 'aft' | 'inward';
  /** a door panel beside the strut */
  door?: boolean;
}

/** A nose leg and two main legs placed from the jet's dimensions (for jets without a drawn airframe). */
export function gearFromVisual(v: AircraftVisual): GearLeg[] {
  const R = v.fuselageRadiusM;
  const mainZ = (v.wingPositionFraction - 0.5) * v.lengthM + 0.35 * v.wingRootChordM;
  const track = Math.max(R * 1.1, (v.engineSpacingM ?? 0) / 2) + 0.45;
  return [
    { x: 0, y: -R * 0.65, z: -v.lengthM / 2 + 0.22 * v.lengthM, wheelR: 0.32, wheelW: 0.2, fold: 'forward' },
    { x: -track, y: -R * 0.55, z: mainZ, wheelR: 0.42, wheelW: 0.28, fold: 'inward' },
    { x: track, y: -R * 0.55, z: mainZ, wheelR: 0.42, wheelW: 0.28, fold: 'inward' },
  ];
}

const legMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.45 });
const COLOR: Readonly<Record<string, number>> = { strut: 0xc4c8cc, chrome: 0xe8ebee, tyre: 0x1a1b1c, hub: 0x9da3a8, door: 0x8c9298 };

/** One leg's parts (strut, oleo, torque link, wheels, fork, door) merged into one coloured mesh. */
function legGeometry(l: GearLeg): BufferGeometry {
  const key = JSON.stringify([l.y, l.rake, l.wheelR, l.wheelW, l.twin, l.x === 0 ? 0 : Math.sign(l.x), l.door]);
  const cached = legShapes.get(key);
  if (cached) return cached;
  const parts: [BufferGeometry, string, Matrix4][] = [];
  const drop = l.y - (WHEEL_BOTTOM_Y + l.wheelR);
  const rake = l.rake ?? 0;
  const length = Math.hypot(drop, rake);
  const strut = new Matrix4().makeRotationX(-Math.atan2(rake, drop));
  const at = (x: number, y: number, z: number, rx = 0) => strut.clone().multiply(new Matrix4().makeTranslation(x, y, z)).multiply(new Matrix4().makeRotationX(rx));
  parts.push([new CylinderGeometry(0.075, 0.075, length * 0.62, 10).translate(0, -length * 0.31, 0), 'strut', strut]);
  parts.push([new CylinderGeometry(0.052, 0.052, length * 0.45, 10).translate(0, -length * 0.225, 0), 'chrome', at(0, -length * 0.55, 0)]);
  parts.push([new BoxGeometry(0.05, 0.32, 0.12), 'strut', at(0, -length * 0.66, -0.09, 0.35)]);
  const main = l.x !== 0;
  const outboard = l.x < 0 ? -1 : 1;
  // Twin wheels either side of the strut; a main wheel outboard on its stub axle; a nose wheel in a fork.
  const offsets = l.twin ? [-1, 1].map((s) => s * (l.wheelW / 2 + 0.05)) : main ? [outboard * (l.wheelW / 2 + 0.07)] : [0];
  for (const dx of offsets) {
    parts.push([new TorusGeometry(l.wheelR - l.wheelW / 2, l.wheelW / 2, 10, 24).rotateY(Math.PI / 2), 'tyre', at(dx, -length, 0)]);
    parts.push([new CylinderGeometry(l.wheelR * 0.56, l.wheelR * 0.56, l.wheelW * 0.82, 16).rotateZ(Math.PI / 2), 'hub', at(dx, -length, 0)]);
  }
  if (!l.twin && !main) {
    for (const s of [-1, 1]) parts.push([new BoxGeometry(0.03, l.wheelR * 1.1, 0.1).translate(0, l.wheelR * 0.45, 0), 'strut', at(s * (l.wheelW / 2 + 0.03), -length, 0)]);
  }
  if (l.door) parts.push([new BoxGeometry(0.025, length * 0.6, 0.55).translate(0, -length * 0.3, 0), 'door', at(main ? -outboard * 0.14 : 0.16, 0, 0)]);
  const color = new Color();
  const geometries = parts.map(([g, c, m]) => {
    const out = g.toNonIndexed().applyMatrix4(m);
    out.deleteAttribute('uv');
    color.setHex(COLOR[c]);
    const n = out.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    out.setAttribute('color', new BufferAttribute(colors, 3));
    return out;
  });
  const merged = mergeGeometries(geometries) as BufferGeometry;
  legShapes.set(key, merged);
  return merged;
}

const legShapes = new Map<string, BufferGeometry>();

function leg(l: GearLeg): Group {
  const pivot = new Group();
  pivot.name = 'gear-leg';
  pivot.position.set(l.x, l.y, l.z);
  const axis = l.fold === 'inward' ? 'z' : 'x';
  const sign = l.fold === 'forward' ? 1 : l.fold === 'aft' ? -1 : l.x < 0 ? 1 : -1;
  // Plain data only, so copies of the model (clone() copies userData through JSON) keep it.
  pivot.userData = { axis, sign };
  pivot.add(new Mesh(legGeometry(l), legMaterial));
  return pivot;
}

/**
 * Landing gear for a jet model (M4; drawn per type in revision 31): struts with chromed oleos and torque links,
 * tyres on hubs (twin nose wheels on the Su-30SM and MiG-29), and doors, sized so the wheels meet the runway where
 * the ground model holds the jet. `setGear` folds them away as the gear retracts.
 */
export function landingGear(v: AircraftVisual, legs: readonly GearLeg[] = gearFromVisual(v)): Group {
  const g = new Group();
  g.name = 'landing-gear';
  for (const l of legs) g.add(leg(l));
  g.visible = false;
  return g;
}

/** 1 = down and locked, 0 = stowed (hidden). */
export function setGear(g: Group, gear: number): void {
  g.visible = gear > 0.01;
  if (!g.visible) return;
  const fold = (1 - gear) * (Math.PI / 2);
  for (const pivot of g.children) {
    const { axis, sign } = pivot.userData as { axis: 'x' | 'z'; sign: number };
    if (axis === 'x') pivot.rotation.x = fold * sign;
    else pivot.rotation.z = fold * sign;
  }
}
