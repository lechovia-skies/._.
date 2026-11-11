import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { snapShadowFocus } from './environment.ts';

describe('the sun shadow box (revision 46)', () => {
  const sun = new Vector3(0.4, 0.7, -0.59).normalize();
  const texel = 0.4;

  it('moves only across the beam, by less than a texel, onto the texel grid', () => {
    const focus = new Vector3(1234.567, 88.8, -9876.54);
    const out = snapShadowFocus(focus, sun, texel, new Vector3());
    const moved = out.clone().sub(focus);
    expect(moved.dot(sun)).toBeCloseTo(0, 9);
    expect(moved.length()).toBeLessThanOrEqual(texel * Math.SQRT1_2 + 1e-9);
    // Two foci a whole number of texels apart across the beam snap to points the same distance apart.
    const across = new Vector3(0, 1, 0).cross(sun).normalize();
    const b = snapShadowFocus(focus.clone().addScaledVector(across, texel * 7), sun, texel, new Vector3());
    expect(b.distanceTo(out)).toBeCloseTo(texel * 7, 6);
  });

  it('holds still while the camera creeps along within a texel', () => {
    const a = snapShadowFocus(new Vector3(500.01, 40, 300), sun, texel, new Vector3());
    const along = sun.clone().multiplyScalar(37);
    const b = snapShadowFocus(new Vector3(500.01, 40, 300).add(along), sun, texel, new Vector3());
    expect(b.clone().sub(along).distanceTo(a)).toBeCloseTo(0, 6);
  });

  it('copes with the sun straight overhead', () => {
    const out = snapShadowFocus(new Vector3(10.1, 0, 20.3), new Vector3(0, 1, 0), 1, new Vector3());
    expect(out.x).toBeCloseTo(10, 9);
    expect(out.z).toBeCloseTo(20, 9);
  });
});
