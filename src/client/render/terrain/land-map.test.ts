import { describe, expect, it } from 'vitest';
import type { LandCover } from '../../../shared/map/land-cover.ts';
import type { HeightGrid } from './chunk-builder.ts';
import { buildLandMap, LAND_RELIEF_M_PER_STEP, LAND_RELIEF_RADIUS_M } from './land-map.ts';

describe('the land map (revision 48)', () => {
  // 65 samples 100 m apart: a river along x = 0, a town to the north-east, forest to the west, fields elsewhere; one
  // round hill 300 m high in the south-west and a valley along the river.
  const n = 65;
  const sizeM = 6400;
  const heights = new Float32Array(n * n);
  const at = (i: number) => -sizeM / 2 + (i * sizeM) / (n - 1);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = at(i);
      const z = at(j);
      heights[j * n + i] = 100 + 300 * Math.exp(-((x + 1600) ** 2 + (z - 1600) ** 2) / 600 ** 2) - 60 * Math.exp(-(x * x) / 400 ** 2);
    }
  }
  const grid: HeightGrid = { heights, resolution: n, sizeM };
  const cover = (x: number, z: number): LandCover => (Math.abs(x) < 150 ? 'river' : x > 1000 && z < -1000 ? 'urban' : x < -2500 ? 'forest' : 'field');
  const land = buildLandMap(grid, cover);
  const texel = (x: number, z: number) => {
    const i = Math.round(((x + sizeM / 2) / sizeM) * (n - 1));
    const j = Math.round(((z + sizeM / 2) / sizeM) * (n - 1));
    return Array.from(land.data.subarray((j * n + i) * 4, (j * n + i) * 4 + 4));
  };

  it('has a texel for every height sample', () => {
    expect(land.size).toBe(n);
    expect(land.data.length).toBe(n * n * 4);
  });

  it('marks water, towns and forest', () => {
    expect(texel(0, 0).slice(0, 3)).toEqual([255, 0, 0]);
    expect(texel(2000, -2000).slice(0, 3)).toEqual([0, 255, 0]);
    expect(texel(-3000, 0).slice(0, 3)).toEqual([0, 0, 255]);
    expect(texel(1500, 1500).slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('holds the slope of the ground at every sample', () => {
    const slope = (x: number, z: number) => {
      const i = Math.round(((x + sizeM / 2) / sizeM) * (n - 1));
      const j = Math.round(((z + sizeM / 2) / sizeM) * (n - 1));
      return [(land.normals[(j * n + i) * 2] - 127.5) / 127.5, (land.normals[(j * n + i) * 2 + 1] - 127.5) / 127.5];
    };
    expect(land.normals.length).toBe(n * n * 2);
    // Flat far from the hill; on the hill's east flank the ground falls to the east, so the normal leans east (+x).
    for (const v of slope(2500, 2500)) expect(Math.abs(v)).toBeLessThan(0.02);
    const [nx, nz] = slope(-1600 + 500, 1600);
    expect(nx).toBeGreaterThan(0.2);
    expect(Math.abs(nz)).toBeLessThan(0.05);
    // and on its north flank (−z) it leans north.
    expect(slope(-1600, 1600 - 500)[1]).toBeLessThan(-0.2);
  });

  it('lifts ridges and sinks valleys against the ground round them', () => {
    expect(LAND_RELIEF_RADIUS_M).toBeGreaterThan(500);
    const top = texel(-1600, 1600)[3];
    const valley = texel(0, -2500)[3];
    const plain = texel(2500, 2500)[3];
    expect(top).toBeGreaterThan(128 + 150 / LAND_RELIEF_M_PER_STEP);
    expect(valley).toBeLessThan(128 - 15 / LAND_RELIEF_M_PER_STEP);
    expect(Math.abs(plain - 128)).toBeLessThan(25 / LAND_RELIEF_M_PER_STEP);
  });
});
