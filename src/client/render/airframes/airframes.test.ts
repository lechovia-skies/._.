import { Box3, BufferGeometry, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getAircraft } from '../../../shared/data/aircraft/registry.ts';
import { loadoutFor } from '../../../shared/data/loadout.ts';
import { landingGear, WHEEL_BOTTOM_Y } from '../landing-gear.ts';
import { airframeGear, airframeModel, AIRFRAMES } from './index.ts';
import { assign, showStores, type StoreMeshData } from './stores.ts';

/** Height of each real type from the ground to the fin tips, metres. */
const REAL_HEIGHT_M: Readonly<Record<string, number>> = { tempest: 5.08, condor: 5.63, kestrel: 4.88, yastreb: 5.9, sapsan: 6.36, kobchik: 4.73 };

const ids = Object.keys(AIRFRAMES);

/** The airframe with its probe, rails and nozzles (not its stores, wheels or flames). */
function airframeBox(id: string): Box3 {
  const model = airframeModel(getAircraft(id));
  if (!model) throw new Error(id);
  const box = new Box3();
  for (const name of ['airframe', 'airframe-trim', 'nozzle']) {
    const mesh = model.root.getObjectByName(name) as Mesh | undefined;
    if (!mesh) continue;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox as Box3);
  }
  return box;
}

describe('real-type airframes (revision 31)', () => {
  it('draws the six jets without imported models, and no others', () => {
    expect(ids.sort()).toEqual(['condor', 'kestrel', 'kobchik', 'sapsan', 'tempest', 'yastreb']);
    expect(airframeModel(getAircraft('shade'))).toBeNull();
    expect(airframeModel(getAircraft('prizrak'))).toBeNull();
  });

  it.each(ids)('builds %s at its real length, span and height, nose forward and level', (id) => {
    const c = getAircraft(id);
    const bp = AIRFRAMES[id];
    const box = airframeBox(id);
    const size = box.getSize(new Vector3());
    expect(size.z).toBeGreaterThan(c.visual.lengthM * 0.96);
    expect(size.z).toBeLessThan(c.visual.lengthM * 1.02);
    expect(box.min.z).toBeLessThan(-c.visual.lengthM * 0.47);
    // Wings (with tip rails) reach the jet's span; the airframe is symmetric.
    expect(size.x).toBeGreaterThan(c.visual.spanM * 0.93);
    expect(size.x).toBeLessThan(c.visual.spanM * 1.06);
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(0.05);
    // Fin tips stand as high above the ground as the real jet's.
    expect(box.max.y + bp.datumWlM).toBeGreaterThan(REAL_HEIGHT_M[id] * 0.95);
    expect(box.max.y + bp.datumWlM).toBeLessThan(REAL_HEIGHT_M[id] * 1.05);
  });

  it.each(ids)('gives %s a nozzle and a flame per engine, and only finite vertices', (id) => {
    const c = getAircraft(id);
    const model = airframeModel(c);
    if (!model) throw new Error(id);
    expect(model.nozzles).toHaveLength(c.visual.engines);
    expect(model.afterburners).toHaveLength(c.visual.engines);
    for (const n of model.nozzles) expect(n.position.z).toBeGreaterThan(c.visual.lengthM * 0.35);
    model.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const p = (o.geometry as BufferGeometry).getAttribute('position');
      for (let i = 0; i < p.count * 3; i++) expect(Number.isFinite(p.array[i])).toBe(true);
    });
    for (const name of ['airframe', 'canopy', 'nozzle']) expect(model.root.getObjectByName(name), name).toBeDefined();
  });

  it.each(ids)('puts the wheels of %s on the runway', (id) => {
    const gear = landingGear(getAircraft(id).visual, airframeGear(getAircraft(id)));
    gear.visible = true;
    gear.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gear);
    expect(box.min.y).toBeCloseTo(WHEEL_BOTTOM_Y, 1);
    expect(gear.children).toHaveLength(3);
  });

  it('shares geometry between copies of a type, but each copy draws its own rounds left', () => {
    const a = airframeModel(getAircraft('yastreb'));
    const b = airframeModel(getAircraft('yastreb'));
    if (!a || !b) throw new Error('yastreb');
    expect((a.root.getObjectByName('airframe') as Mesh).geometry).toBe((b.root.getObjectByName('airframe') as Mesh).geometry);
    const ma = a.root.getObjectByName('missiles-0') as Mesh;
    const mb = b.root.getObjectByName('missiles-0') as Mesh;
    expect(ma.geometry).not.toBe(mb.geometry);
    expect(ma.geometry.getAttribute('position')).toBe(mb.geometry.getAttribute('position'));
  });
});

describe('stores on the airframes (revision 31)', () => {
  it.each(ids)('finds a hardpoint for every missile and bomb %s carries, never two on one', (id) => {
    const c = getAircraft(id);
    const plan = AIRFRAMES[id].stores;
    for (const strike of [false, true]) {
      const load = loadoutFor(c, strike);
      if (!plan) {
        // Carried inside: nothing shows.
        expect(c.id).toBe('tempest');
        continue;
      }
      const placed = assign(plan, load);
      const used = placed.flatMap((p) => p.hardpoints);
      expect(new Set(used).size).toBe(used.length);
      for (const p of placed) {
        const want = p.slot < 0 ? load.bombs : load.missiles[p.slot].count;
        expect(p.hardpoints, `${id} ${p.kind}`).toHaveLength(want);
      }
    }
  });

  it('shows the load the jet flies with and hides rounds as they are fired', () => {
    const c = getAircraft('sapsan');
    const model = airframeModel(c);
    if (!model) throw new Error('sapsan');
    const air = loadoutFor(c, false);
    const strike = loadoutFor(c, true);
    const meshes = (set: 'air' | 'strike') =>
      model.root.children.filter((o): o is Mesh => o instanceof Mesh && (o.userData.store as StoreMeshData | undefined)?.set === set);
    showStores(model.root, { loadout: air, stores: { missiles: [4, 1], bombs: 0 }, isLocal: true });
    expect(meshes('strike').every((m) => !m.visible)).toBe(true);
    const [r73, r27] = meshes('air');
    expect(r73.visible && r27.visible).toBe(true);
    const ranges = (m: Mesh) => (m.userData.store as StoreMeshData).ranges;
    expect(r73.geometry.drawRange.count).toBe(ranges(r73)[4]);
    expect(r27.geometry.drawRange.count).toBe(ranges(r27)[1]);
    showStores(model.root, { loadout: air, stores: { missiles: [0, 0], bombs: 0 }, isLocal: true });
    expect(r73.visible || r27.visible).toBe(false);
    // Another player's counts never reach a guest online: their load shows full.
    showStores(model.root, { loadout: air, stores: { missiles: [], bombs: 0 }, isLocal: false });
    expect(r27.visible).toBe(true);
    expect(r27.geometry.drawRange.count).toBe(ranges(r27)[4]);
    // A Strike attacker: the bombs and the strike missiles.
    showStores(model.root, { loadout: strike, stores: { missiles: [2, 2], bombs: 6 }, isLocal: true });
    expect(meshes('air').every((m) => !m.visible)).toBe(true);
    expect(meshes('strike').map((m) => m.name)).toEqual(['missiles-0', 'missiles-1', 'bombs']);
    expect(meshes('strike').every((m) => m.visible)).toBe(true);
  });
});
