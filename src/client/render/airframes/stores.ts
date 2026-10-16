import { BufferGeometry, Matrix4, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { Loadout } from '../../../shared/data/loadout.ts';
import { BOMBS, type BombId, MISSILES, type MissileId } from '../../../shared/data/weapons.ts';
import { loft, merge, ring, surface } from './kit.ts';

/**
 * The stores a real-type airframe carries where its real type does (revision 31): each missile and bomb of the
 * jet's load on its own rail or pylon, drawn to its real length and diameter with its own fins (the AIM-120's mid
 * wings, the R-73's canards, the R-27R's butterfly wings, the R-77's lattice tails). As a jet fires, the rounds go
 * from the airframe; the pylons stay. A stealthy jet carries its missiles inside and shows none.
 */

/** A hardpoint in drawing coordinates. */
export interface Hardpoint {
  fs: number;
  bl: number;
  /** the store's axis for a wingtip rail or a fuselage station; for a pylon, the wing underside it hangs from */
  wl: number;
  pylon?: boolean;
}

/** Which hardpoints each kind of store goes on, in the order they fill (and empty from the end). */
export type StoreLayout = Partial<Record<MissileId | BombId, readonly number[]>>;

export interface StoresPlan {
  hardpoints: readonly Hardpoint[];
  layout: StoreLayout;
  /** stores carried on every sortie whatever the load (the F-16's wing tanks): hardpoint indices */
  tanks?: readonly number[];
  /** pylons always fitted, carrying launchers either side rather than a store of their own (the F-15's wing pylons) */
  pylons?: readonly number[];
}

/** How deep a pylon and its launcher hang below the wing before the store. */
const PYLON_DROP_M = 0.24;

interface Fin {
  /** leading edge from the nose, root and tip chords, height above the body */
  at: number;
  root: number;
  tip: number;
  span: number;
  /** how far aft the tip's leading edge sits from the root's */
  sweep: number;
}

interface StoreShape {
  length: number;
  radius: number;
  /** length of the ogive nose */
  nose: number;
  fins: readonly Fin[];
  /** lattice tails (R-77) instead of plain tail fins */
  lattice?: boolean;
  /** a flat-ended tail cone fraction (bombs and tanks) */
  tail?: number;
}

function shapeOf(kind: MissileId | BombId | 'tank'): StoreShape {
  if (kind === 'tank') return { length: 4.6, radius: 0.36, nose: 1.4, tail: 0.3, fins: [{ at: 3.95, root: 0.55, tip: 0.3, span: 0.22, sweep: 0.2 }] };
  if (kind in BOMBS) {
    const b = BOMBS[kind as BombId];
    const r = b.diameterM / 2;
    return { length: b.lengthM, radius: r, nose: b.lengthM * 0.28, tail: 0.25, fins: [{ at: b.lengthM * 0.78, root: b.lengthM * 0.22, tip: b.lengthM * 0.16, span: r * 0.7, sweep: 0.05 }] };
  }
  const m = MISSILES[kind as MissileId];
  const L = m.lengthM;
  const r = m.diameterM / 2;
  switch (kind) {
    case 'AIM-9X':
      return { length: L, radius: r, nose: 0.2, fins: [{ at: 0.95, root: 0.3, tip: 0.18, span: 0.05, sweep: 0.1 }, { at: L - 0.24, root: 0.22, tip: 0.12, span: 0.09, sweep: 0.08 }] };
    case 'AIM-120C':
    case 'AIM-120D':
      return { length: L, radius: r, nose: 0.42, fins: [{ at: 1.5, root: 0.48, tip: 0.1, span: 0.16, sweep: 0.36 }, { at: L - 0.42, root: 0.38, tip: 0.18, span: 0.16, sweep: 0.2 }] };
    case 'R-73':
    case 'R-74M2':
      return { length: L, radius: r, nose: 0.3, fins: [{ at: 0.42, root: 0.18, tip: 0.08, span: 0.1, sweep: 0.08 }, { at: L - 0.46, root: 0.42, tip: 0.2, span: 0.2, sweep: 0.2 }] };
    case 'R-27R':
      return { length: L, radius: r, nose: 0.55, fins: [{ at: 1.3, root: 0.85, tip: 0.35, span: 0.3, sweep: 0.1 }, { at: L - 0.55, root: 0.5, tip: 0.3, span: 0.24, sweep: 0.2 }] };
    case 'R-77-1':
    case 'R-77M':
      return { length: L, radius: r, nose: 0.45, lattice: true, fins: [{ at: 1.45, root: 0.6, tip: 0.5, span: 0.05, sweep: 0.05 }] };
    case 'R-37M':
      return { length: L, radius: r, nose: 0.7, fins: [{ at: 1.6, root: 1.1, tip: 0.9, span: 0.06, sweep: 0.15 }, { at: L - 0.6, root: 0.55, tip: 0.3, span: 0.22, sweep: 0.25 }] };
  }
  return { length: L, radius: r, nose: L * 0.12, fins: [] };
}

/**
 * A store's body and fins with its nose at fs = 0 on the axis (bl = wl = 0), in drawing coordinates. Cross fins
 * stand at 45° like the real missiles' on their launchers.
 */
export function storeGeometry(kind: MissileId | BombId | 'tank'): BufferGeometry {
  const s = shapeOf(kind);
  const r = s.radius;
  const tailFrom = s.length * (1 - (s.tail ?? 0.04));
  const keys = [ring(0, 0, 0.004, 0.004), ring(s.nose * 0.25, 0, r * 0.55, r * 0.55), ring(s.nose * 0.6, 0, r * 0.88, r * 0.88), ring(s.nose, 0, r, r), ring(tailFrom, 0, r, r), ring(s.length, 0, r * (s.tail ? 0.45 : 0.9), r * (s.tail ? 0.45 : 0.9))];
  const parts = [loft(keys, { around: 14, step: 0.6, capEnd: true })];
  for (const f of s.fins) {
    for (const cant of [45, 135, 225, 315]) {
      parts.push(
        surface(
          [
            { s: 0, le: f.at, te: f.at + f.root },
            { s: r, le: f.at, te: f.at + f.root },
            { s: r + f.span, le: f.at + f.sweep, te: f.at + f.sweep + f.tip },
          ],
          { placement: { kind: 'fin', bl: 0, wl: 0, cantDeg: cant }, slab: true, t: 0.04 },
        ),
      );
    }
  }
  if (s.lattice) {
    // Four lattice tails, folded flat across the airflow: thin frames standing out from the tail.
    for (const cant of [45, 135, 225, 315]) {
      parts.push(
        surface(
          [
            { s: r * 0.6, le: s.length - 0.12, te: s.length - 0.02 },
            { s: r + 0.26, le: s.length - 0.12, te: s.length - 0.02 },
          ],
          { placement: { kind: 'fin', bl: 0, wl: 0, cantDeg: cant }, slab: true, t: 1.4, capRoot: true },
        ),
      );
    }
  }
  return merge(parts);
}

const flying = new Map<string, BufferGeometry>();

/** A round's shape for flight: centred, nose toward -z (shared; never dispose it). */
export function flyingShape(kind: MissileId | BombId): BufferGeometry {
  let g = flying.get(kind);
  if (!g) {
    g = storeGeometry(kind).translate(0, 0, -shapeOf(kind).length / 2);
    g.computeBoundingSphere();
    flying.set(kind, g);
  }
  return g;
}

const storeMaterial = new MeshStandardMaterial({ color: 0xcdd1d5, roughness: 0.5, metalness: 0.2 });
const bombMaterial = new MeshStandardMaterial({ color: 0x4f5546, roughness: 0.7, metalness: 0.1 });

export interface StoreMeshData {
  /** the load it belongs to: the jet's air-to-air load or its strike load */
  set: 'air' | 'strike';
  /** a missile slot of the load, or -1 for its bombs */
  slot: number;
  /** index count drawn with 0, 1, 2 … rounds left */
  ranges: number[];
}

function radiusOf(kind: MissileId | BombId | 'tank'): number {
  return shapeOf(kind).radius;
}

/** Places a store's geometry on a hardpoint: on the tip rail, or hanging below its pylon. */
function onHardpoint(kind: MissileId | BombId | 'tank', h: Hardpoint): BufferGeometry {
  const g = storeGeometry(kind);
  const length = shapeOf(kind).length;
  const axis = h.pylon ? h.wl - PYLON_DROP_M - radiusOf(kind) : h.wl;
  return g.applyMatrix4(new Matrix4().makeTranslation(h.bl, axis, h.fs - length / 2));
}

/** The pylon under a hardpoint, painted with the skin: a blade from the wing to the launcher. */
export function pylonGeometry(h: Hardpoint): BufferGeometry {
  const blade = surface(
    [
      { s: 0, le: h.fs - 0.75, te: h.fs + 0.65 },
      { s: PYLON_DROP_M + 0.06, le: h.fs - 0.55, te: h.fs + 0.6 },
    ],
    { placement: { kind: 'fin', bl: h.bl, wl: h.wl + 0.06, cantDeg: 180 }, slab: true, t: 0.06, capRoot: true },
  );
  return blade;
}

/** The pylons a plan uses for either load. */
export function planPylons(plan: StoresPlan, loads: readonly Loadout[]): BufferGeometry[] {
  const used = new Set<number>([...(plan.tanks ?? []), ...(plan.pylons ?? [])]);
  for (const load of loads) for (const a of assign(plan, load)) for (const i of a.hardpoints) used.add(i);
  return [...used].filter((i) => plan.hardpoints[i].pylon).map((i) => pylonGeometry(plan.hardpoints[i]));
}

interface Assignment {
  kind: MissileId | BombId;
  slot: number;
  hardpoints: number[];
}

/** Puts each missile slot's rounds, then the bombs, on their hardpoints, never two stores on one. */
export function assign(plan: StoresPlan, load: Loadout): Assignment[] {
  const taken = new Set<number>(plan.tanks ?? []);
  const out: Assignment[] = [];
  const take = (kind: MissileId | BombId, count: number, slot: number) => {
    const free = (plan.layout[kind] ?? []).filter((i) => !taken.has(i)).slice(0, count);
    for (const i of free) taken.add(i);
    out.push({ kind, slot, hardpoints: free });
  };
  load.missiles.forEach((m, slot) => take(m.missile, m.count, slot));
  if (load.bomb && load.bombs > 0) take(load.bomb.id, load.bombs, -1);
  return out;
}

/** One mesh per missile slot (and one for the bombs) for a load, each drawing only the rounds still carried. */
export function storeMeshes(plan: StoresPlan, load: Loadout, set: 'air' | 'strike', toBody: Matrix4): Mesh[] {
  const meshes: Mesh[] = [];
  for (const a of assign(plan, load)) {
    if (a.hardpoints.length === 0) continue;
    const rounds = a.hardpoints.map((i) => onHardpoint(a.kind, plan.hardpoints[i]));
    const g = merge(rounds).applyMatrix4(toBody);
    g.computeBoundingSphere();
    const ranges = [0];
    for (const r of rounds) ranges.push(ranges[ranges.length - 1] + (r.getIndex()?.count ?? 0));
    const mesh = new Mesh(g, a.slot < 0 ? bombMaterial : storeMaterial);
    mesh.name = a.slot < 0 ? 'bombs' : `missiles-${a.slot}`;
    const data: StoreMeshData = { set, slot: a.slot, ranges };
    mesh.userData.store = data;
    meshes.push(mesh);
  }
  return meshes;
}

/** The tanks a plan always carries, merged, in the body frame. */
export function tankGeometry(plan: StoresPlan, toBody: Matrix4): BufferGeometry | null {
  if (!plan.tanks?.length) return null;
  return merge(plan.tanks.map((i) => onHardpoint('tank', plan.hardpoints[i]))).applyMatrix4(toBody);
}

/** Gives each copy of a model its own draw ranges for its stores (the buffers stay shared). */
export function unshareStores(root: Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh) || !o.userData.store) return;
    const src = o.geometry as BufferGeometry;
    const g = new BufferGeometry();
    g.setIndex(src.getIndex());
    for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
    g.boundingSphere = src.boundingSphere;
    o.geometry = g;
  });
}

/** What a jet has left to show: its load, and its rounds per slot and bombs (unknown for other players online). */
export interface StoresShown {
  loadout: Loadout;
  stores: { readonly missiles: readonly number[]; readonly bombs: number };
  isLocal: boolean;
}

/** Shows the load the jet carries this life and only the rounds it has left. */
export function showStores(root: Object3D, v: StoresShown): void {
  const set = v.loadout.bomb ? 'strike' : 'air';
  // Another player's counts do not reach a guest online: show their load full.
  const known = v.isLocal || v.stores.missiles.length >= v.loadout.missiles.length;
  for (const o of root.children) {
    const data = o.userData.store as StoreMeshData | undefined;
    if (!data || !(o instanceof Mesh)) continue;
    o.visible = data.set === set;
    if (!o.visible) continue;
    const full = data.ranges.length - 1;
    const left = known ? Math.min(full, data.slot < 0 ? v.stores.bombs : (v.stores.missiles[data.slot] ?? 0)) : full;
    o.geometry.setDrawRange(0, data.ranges[left]);
    o.visible = left > 0;
  }
}
