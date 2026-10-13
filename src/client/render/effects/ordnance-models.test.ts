import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BOMB_LOOK, MISSILE_LOOKS, OrdnanceModels } from './ordnance-models.ts';

const item = () => ({ id: 1, position: new Vector3(0, 1000, 0), velocity: new Vector3(0, 0, -800) });

describe('OrdnanceModels', () => {
  it('draws a distant missile larger so it stays visible, and a near one at its real size', () => {
    const scene = new Scene();
    const models = new OrdnanceModels(scene, MISSILE_LOOKS['R-73']);
    models.update([item()], new Vector3(0, 1000, 100));
    const mesh = scene.children.find((o) => o.name === 'R-73');
    expect(mesh?.scale.x).toBe(1);
    // 3 km away the 2.9 m missile is drawn about 7 times larger (spec §15.4: at least 0.4°).
    models.update([item()], new Vector3(0, 1000, 3000));
    expect(mesh?.scale.x).toBeCloseTo((3000 * Math.tan((0.4 * Math.PI) / 180)) / 2.9, 3);
  });

  it('draws bombs with their own look and removes them once they are gone', () => {
    const scene = new Scene();
    const models = new OrdnanceModels(scene, BOMB_LOOK);
    models.update([item()], new Vector3(0, 1000, 3000));
    // The FAB-500M-62 is 2.4 m long.
    expect(scene.children.find((o) => o.name === 'bomb')?.scale.x).toBeCloseTo((3000 * Math.tan((0.3 * Math.PI) / 180)) / 2.4, 3);
    models.update([], new Vector3());
    expect(models.count).toBe(0);
  });
});

describe('missile looks (revision 30)', () => {
  it('gives each missile its real length and diameter', () => {
    expect([MISSILE_LOOKS['AIM-9X'].lengthM, MISSILE_LOOKS['AIM-9X'].radiusM * 2]).toEqual([3.02, 0.127]);
    expect([MISSILE_LOOKS['R-37M'].lengthM, MISSILE_LOOKS['R-37M'].radiusM * 2]).toEqual([4.2, 0.38]);
    expect(MISSILE_LOOKS['R-27R'].radiusM).toBeGreaterThan(MISSILE_LOOKS['AIM-120C'].radiusM);
  });
});
