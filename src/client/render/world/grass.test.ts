import { Texture, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { LandCover } from '../../../shared/map/land-cover.ts';
import { Grass, GRASS_PATCH_M, type GrassGround, grassAt, tuftsInPatch } from './grass.ts';

/** A test land: `west` west of x = 0, `east` to the east, flat at 50 m, everything free unless told. */
const land = (west: LandCover, east: LandCover, free: (x: number, z: number) => boolean = () => true): GrassGround => ({
  coverAt: (x) => (x < 0 ? west : east),
  cellM: 100,
  originM: -50000,
  heightAt: () => 50,
  free,
});

describe('grass (revision 46)', () => {
  it('grows on meadows and fields, not on water, and blends across the edge', () => {
    const g = land('meadow', 'lake');
    expect(grassAt(g, -500, 0)).toEqual({ chance: 1, farm: 1 });
    expect(grassAt(g, 500, 0)).toEqual({ chance: 0, farm: 0 });
    const edge = grassAt(g, -50, 0);
    expect(edge.chance).toBeGreaterThan(0.2);
    expect(edge.chance).toBeLessThan(1);
    // Forest floor is grassy in places but is never farmland.
    expect(grassAt(land('forest', 'forest'), 0, 0)).toEqual({ chance: 0.3, farm: 0 });
  });

  it('fills a meadow patch the same way every time, standing on the ground', () => {
    const g = land('meadow', 'meadow');
    const a = tuftsInPatch(g, -3, 5, 1.25);
    expect(a).toEqual(tuftsInPatch(g, -3, 5, 1.25));
    expect(a.length).toBe(Math.round(GRASS_PATCH_M / 1.25) ** 2);
    for (const t of a) {
      expect(t.x).toBeGreaterThanOrEqual(-3 * GRASS_PATCH_M);
      expect(t.x).toBeLessThan(-2 * GRASS_PATCH_M);
      expect(t.z).toBeGreaterThanOrEqual(5 * GRASS_PATCH_M);
      expect(t.z).toBeLessThan(6 * GRASS_PATCH_M);
      expect(t.y).toBe(50);
      expect(t.farm).toBe(1);
    }
    expect(tuftsInPatch(land('lake', 'lake'), 0, 0, 1.25)).toEqual([]);
  });

  it('keeps roads and runways bare', () => {
    const road = (_x: number, z: number) => Math.abs(z - 8) > 3;
    const tufts = tuftsInPatch(land('meadow', 'meadow', road), 0, 0, 1);
    expect(tufts.length).toBeGreaterThan(150);
    expect(tufts.every((t) => Math.abs(t.z - 8) > 3)).toBe(true);
  });
});

describe('the grass round the camera (revision 46)', () => {
  const meadow = land('meadow', 'meadow');

  it('stands within range when low and is gone when flying high', () => {
    const grass = new Grass(meadow, { radiusM: 40, spacingM: 2 }, new Texture(), new Vector3(0.1, 0.2, 0.05));
    grass.update(new Vector3(0, 52, 0), 0, Infinity);
    expect(grass.mesh.visible).toBe(true);
    // 7 × 7 patches of 8 × 8 tufts, every one on a meadow.
    expect(grass.count).toBe(49 * 64);
    expect(grass.mesh.count).toBe(49 * 64);
    grass.update(new Vector3(0, 50 + 500, 0), 0, Infinity);
    expect(grass.mesh.visible).toBe(false);
    grass.dispose();
  });

  it('moves along with the camera, reusing the slots it leaves behind', () => {
    const grass = new Grass(meadow, { radiusM: 40, spacingM: 2 }, new Texture(), new Vector3(0.1, 0.2, 0.05));
    grass.update(new Vector3(0, 55, 0), 0, Infinity);
    grass.update(new Vector3(1000, 55, 300), 1, Infinity);
    expect(grass.count).toBe(49 * 64);
    // A partly built ring keeps the nearest patches first.
    grass.update(new Vector3(-2000, 55, 0), 2, 0);
    expect(grass.count).toBe(64);
    grass.setSettings(null);
    grass.update(new Vector3(0, 52, 0), 3, Infinity);
    expect(grass.count).toBe(0);
    expect(grass.mesh.visible).toBe(false);
    grass.dispose();
  });
});
