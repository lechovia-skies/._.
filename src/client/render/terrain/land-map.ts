import type { LandCover } from '../../../shared/map/land-cover.ts';
import { type LandClassWeights, landClassWeights } from '../land-class.ts';
import type { CoverAt, HeightGrid } from './chunk-builder.ts';

/*
 * The land map (spec revision 48): what the terrain shader needs to tell rivers, towns, forests, ridges and valleys
 * apart at any distance, one texel per height sample. Terrain chunks far from the camera space their vertices up to
 * 32 samples apart, so per-vertex land classes lost rivers, villages and the outlines of towns and forests at range;
 * the shader reads these from this map instead.
 *
 *   R  water (sea, lake, river)
 *   G  town
 *   B  forest (marsh counts 0.4, as on the vertices)
 *   A  ridge or valley: 128 + 0.5 × (height − the mean height within LAND_RELIEF_RADIUS_M), so ±256 m
 */

/** How far round a point its ridge-or-valley value looks, metres. */
export const LAND_RELIEF_RADIUS_M = 1500;
/** Metres of height per step of the alpha channel. */
export const LAND_RELIEF_M_PER_STEP = 2;

export interface LandMap {
  /** RGBA, `size` × `size`, row by row from the north-west (the height grid's order) */
  data: Uint8Array;
  size: number;
}

const byte = (w: number) => Math.round(Math.min(1, Math.max(0, w)) * 255);

export function buildLandMap(grid: HeightGrid, coverAt: CoverAt): LandMap {
  const n = grid.resolution;
  const cell = grid.sizeM / (n - 1);
  const origin = -grid.sizeM / 2;
  const h = grid.heights;
  const data = new Uint8Array(n * n * 4);
  // Summed heights, for the mean over a square round each sample.
  const sums = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j < n; j++) {
    let row = 0;
    for (let i = 0; i < n; i++) {
      row += Math.max(0, h[j * n + i]);
      sums[(j + 1) * (n + 1) + i + 1] = sums[j * (n + 1) + i + 1] + row;
    }
  }
  const r = Math.max(1, Math.round(LAND_RELIEF_RADIUS_M / cell));
  const weights = new Map<LandCover, LandClassWeights>();
  for (let j = 0; j < n; j++) {
    const z = origin + j * cell;
    const j0 = Math.max(0, j - r);
    const j1 = Math.min(n - 1, j + r);
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const y = h[k];
      const dx = (h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)]) / (2 * cell);
      const dz = (h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i]) / (2 * cell);
      const cover = coverAt(origin + i * cell, z, y, 1 - 1 / Math.hypot(dx, 1, dz));
      let w = weights.get(cover);
      if (!w) weights.set(cover, (w = landClassWeights(cover)));
      const i0 = Math.max(0, i - r);
      const i1 = Math.min(n - 1, i + r);
      const total = sums[(j1 + 1) * (n + 1) + i1 + 1] - sums[j0 * (n + 1) + i1 + 1] - sums[(j1 + 1) * (n + 1) + i0] + sums[j0 * (n + 1) + i0];
      const mean = total / ((i1 - i0 + 1) * (j1 - j0 + 1));
      data[k * 4] = byte(w.water);
      data[k * 4 + 1] = byte(w.urban);
      data[k * 4 + 2] = byte(w.forest);
      data[k * 4 + 3] = Math.round(Math.min(255, Math.max(0, 128 + (Math.max(0, y) - mean) / LAND_RELIEF_M_PER_STEP)));
    }
  }
  return { data, size: n };
}
