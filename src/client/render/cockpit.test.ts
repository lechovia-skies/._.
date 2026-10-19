import { Box3, Group, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import { buildImportedModel, IMPORTED_MODELS } from './aircraft-meshes.ts';
import { airframeModel, AIRFRAMES } from './airframes/index.ts';
import { cockpitEye, cockpitFitOf, cockpitInterior, showCockpit } from './cockpit.ts';

describe('cockpits (revision 34)', () => {
  it("puts every real-type airframe's eyes in its canopy, above the sill and inside the tub", () => {
    for (const id of Object.keys(AIRFRAMES)) {
      const config = getAircraft(id);
      const model = airframeModel(config)!;
      const fit = cockpitFitOf(model.root);
      expect(fit, id).not.toBeNull();
      const [x, y, z] = fit!.eye;
      expect(x, id).toBe(0);
      // The eyes ride 0.3–0.6 m above the sill, ahead of the middle of the jet and behind the canopy's front.
      expect(y - fit!.sillY, id).toBeGreaterThan(0.3);
      expect(y - fit!.sillY, id).toBeLessThan(0.6);
      expect(z, id).toBeLessThan(0);
      expect(z, id).toBeGreaterThan(fit!.frontZ + 0.8);
      expect(fit!.halfWidth, id).toBeGreaterThan(0.3);
      expect(fit!.halfWidth, id).toBeLessThan(0.7);
      // Under the canopy: the glass is above the eyes there.
      const glass = new Box3().setFromObject(model.root.getObjectByName('canopy-glass')!);
      expect(glass.max.y, id).toBeGreaterThan(y + 0.1);
    }
  });

  it('carries the fit to copies, and the imported models have one too', () => {
    const a = airframeModel(getAircraft('kestrel'))!;
    const b = airframeModel(getAircraft('kestrel'))!;
    expect(cockpitFitOf(b.root)).toEqual(cockpitFitOf(a.root));
    for (const [id, fit] of Object.entries(IMPORTED_MODELS)) {
      const model = buildImportedModel(new Group(), fit, getAircraft(id).visual.lengthM);
      const eye = cockpitEye(model.root);
      expect(eye, id).not.toBeNull();
      expect(eye!.y, id).toBeGreaterThan(0.5);
      expect(eye!.z, id).toBeLessThan(-3);
    }
  });

  it('builds the inside round the eyes and swaps it for the helmet and the tub', () => {
    const model = airframeModel(getAircraft('condor'))!;
    const root = model.root;
    expect(root.getObjectByName('cockpit-interior')).toBeUndefined();
    expect(showCockpit(root, true, 'usa')).toBe(true);
    const interior = root.getObjectByName('cockpit-interior')!;
    expect(interior.visible).toBe(true);
    expect(root.getObjectByName('crew')!.visible).toBe(false);
    expect(root.getObjectByName('cockpit-tub')!.visible).toBe(false);
    expect(interior.position.toArray()).toEqual([...cockpitFitOf(root)!.eye]);
    showCockpit(root, false, 'usa');
    expect(interior.visible).toBe(false);
    expect(root.getObjectByName('crew')!.visible).toBe(true);
    // Once only.
    showCockpit(root, true, 'usa');
    expect(root.children.filter((c) => c.name === 'cockpit-interior')).toHaveLength(1);
  });

  it('keeps the inside within the canopy and the tub', () => {
    const fit = cockpitFitOf(airframeModel(getAircraft('kobchik'))!.root)!;
    const interior = cockpitInterior(fit, 'russia');
    const box = new Box3();
    interior.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      box.setFromObject(o);
      // Nothing further forward than the canopy's front or wider than the tub.
      expect(box.min.z).toBeGreaterThan(fit.frontZ - 0.05);
      expect(Math.max(-box.min.x, box.max.x) - interior.position.x).toBeLessThan(fit.halfWidth + 0.06);
    });
    expect(showCockpit(new Group(), true, 'usa')).toBe(false);
  });
});
