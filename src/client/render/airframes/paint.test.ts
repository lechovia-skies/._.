import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { markingAspect } from './markings.ts';
import { bothSides, camoPatches, decalRows, type Marking, MAX_PATCHES, skinMaterial, toBody } from './paint.ts';

const frame = { lengthM: 20, datumWlM: 2 };
const project = (m: Marking, p: Vector3) => decalRows(frame, m).map(([axis, w]) => axis.dot(p) + w);

describe('airframe paint (revision 31)', () => {
  it('projects a marking so its centre is the middle of the art and it reads the right way round', () => {
    const left: Marking = { art: { kind: 'text', text: '07' }, at: [4, -0.7, 2.6], size: [1, 0.7], from: 'left' };
    const c = toBody(frame, left.at);
    expect(project(left, c).map((v) => +v.toFixed(6))).toEqual([0.5, 0.5, 0]);
    // Seen from the left, text runs toward the tail; from the right, toward the nose.
    expect(project(left, c.clone().add(new Vector3(0, 0, 0.4)))[0]).toBeCloseTo(0.9);
    const right = bothSides(left)[1];
    expect(right.from).toBe('right');
    expect(right.at).toEqual([4, 0.7, 2.6]);
    const rc = toBody(frame, right.at);
    expect(project(right, rc.clone().add(new Vector3(0, 0, -0.4)))[0]).toBeCloseTo(0.9);
    // Up the art is up the airframe; depth runs into the skin.
    expect(project(left, c.clone().add(new Vector3(0, 0.35, 0)))[1]).toBeCloseTo(1);
    expect(project(left, c.clone().add(new Vector3(0.3, 0, 0)))[2]).toBeGreaterThan(0);
  });

  it('leans a fin marking with the fin', () => {
    const m: Marking = { art: { kind: 'text', text: 'FF' }, at: [15, -2.4, 3.9], size: [1, 0.5], from: 'left', rollDeg: 28 };
    const c = toBody(frame, m.at);
    // Up the canted left fin: up and outward (to -x).
    const up = new Vector3(-Math.sin((28 * Math.PI) / 180), Math.cos((28 * Math.PI) / 180), 0).multiplyScalar(0.25);
    expect(project(m, c.clone().add(up))[1]).toBeCloseTo(1);
    expect(project(m, c.clone().add(up))[0]).toBeCloseTo(0.5);
  });

  it('spreads the same seeded camouflage over every jet of a type', () => {
    const o = { seed: 7, count: 20, from: [0, -5, 1] as const, to: [20, 5, 5] as const, size: [1, 3] as const, weights: [0.5, 0.5] };
    expect(camoPatches(o)).toEqual(camoPatches(o));
    expect(camoPatches({ ...o, seed: 8 })).not.toEqual(camoPatches(o));
    for (const p of camoPatches(o)) {
      expect([1, 2]).toContain(p.color);
      expect(p.at[0]).toBeGreaterThanOrEqual(0);
      expect(p.at[0]).toBeLessThanOrEqual(20);
    }
  });

  it('makes one shader program for every skin, with no textures needed in tests', () => {
    const spec = {
      colors: ['#a9bccb', '#7d9dbd'],
      underside: '#bccbd6',
      undersideAmount: 0.9,
      patches: camoPatches({ seed: 1, count: 40, from: [0, -5, 1], to: [20, 5, 5], size: [1, 3], weights: [1] }),
      soft: 0.1,
      warp: 0.5,
      zones: [{ from: [0, -1, 1] as const, to: [3, 1, 4] as const, color: '#d3d7da' }],
      markings: [{ art: { kind: 'red-star' }, at: [18, -2, 4], size: [1, 1], from: 'left' } as Marking],
      panelLines: 0.3,
      roughness: 0.6,
      metalness: 0.1,
    };
    const a = skinMaterial(spec, frame);
    const u = a.userData.airframeUniforms;
    expect(u.afPatchCount.value).toBe(MAX_PATCHES);
    expect(u.afZoneCount.value).toBe(1);
    expect(u.afDecalCount.value).toBe(0);
    expect(a.customProgramCacheKey()).toBe(skinMaterial({ ...spec, zones: [] }, frame).customProgramCacheKey());
  });

  it('sizes each marking cell to its art', () => {
    expect(markingAspect({ kind: 'red-star' })).toBe(1);
    expect(markingAspect({ kind: 'us-star', color: '#444' })).toBeGreaterThan(2);
    expect(markingAspect({ kind: 'text', text: '331' })).toBeGreaterThan(markingAspect({ kind: 'text', text: 'LN' }));
  });
});
