import { describe, expect, it } from 'vitest';
import type { LandCover } from '../../../shared/map/land-cover.ts';
import { Vector3 } from 'three';
import { TREE_BLOCK_M, treeChance, type TreeGround, Trees, treesInBlock } from './trees.ts';

/** A test land: forest west of x = 0, `east` to the east, flat at 100 m, everything free unless told. */
const land = (east: LandCover, free: (x: number, z: number) => boolean = () => true): TreeGround => ({
  coverAt: (x) => (x < 0 ? 'forest' : east),
  cellM: 100,
  originM: -50000,
  heightAt: () => 100,
  free,
});

describe('trees (revision 45)', () => {
  it('fills a forest, leaves water bare and dots fields with a few', () => {
    const forest = treesInBlock(land('lake'), -2, 0, 14).length;
    const lake = treesInBlock(land('lake'), 1, 0, 14).length;
    const field = treesInBlock(land('field'), 1, 0, 14).length;
    const cells = Math.round(TREE_BLOCK_M / 14) ** 2;
    expect(forest).toBeGreaterThan(cells * 0.85);
    expect(lake).toBe(0);
    expect(field).toBeGreaterThan(0);
    expect(field).toBeLessThan(cells * 0.25);
  });

  it('places the same trees every time, standing on the ground, sized by kind', () => {
    const a = treesInBlock(land('field'), -1, 3, 17);
    const b = treesInBlock(land('field'), -1, 3, 17);
    expect(b).toEqual(a);
    for (const t of a) {
      expect(t.x).toBeGreaterThanOrEqual(-TREE_BLOCK_M);
      expect(t.x).toBeLessThan(0);
      expect(t.y).toBeCloseTo(99.4, 6);
      expect(t.height).toBeGreaterThanOrEqual(t.kind === 'conifer' ? 11 : 7);
      expect(t.height).toBeLessThanOrEqual(t.kind === 'conifer' ? 28 : 19);
    }
    expect(new Set(a.map((t) => t.kind)).size).toBeGreaterThan(0);
  });

  it('keeps roads and runways clear', () => {
    const road = (_x: number, z: number) => Math.abs(z - 400) > 20;
    const trees = treesInBlock(land('lake', road), -1, 0, 14);
    expect(trees.length).toBeGreaterThan(1000);
    expect(trees.every((t) => Math.abs(t.z - 400) > 20)).toBe(true);
  });

  it('thins out across the forest edge as the terrain blends its colours', () => {
    const g = land('meadow');
    expect(treeChance(g, -500, 0)).toBeGreaterThan(0.9);
    const edge = treeChance(g, -50, 0);
    expect(edge).toBeGreaterThan(0.2);
    expect(edge).toBeLessThan(0.9);
    expect(treeChance(g, 500, 0)).toBeLessThan(0.9);
  });
});

describe('the trees around the camera (revision 45)', () => {
  const forest: TreeGround = { coverAt: () => 'forest', cellM: 100, originM: -50000, heightAt: () => 0, free: () => true };

  it('stands trees within range, draws only the nearest in full, and none when flying high', () => {
    const trees = new Trees(forest, { rangeM: 1200, spacingM: 30, detailM: 300 });
    trees.prepare(new Vector3(0, 150, 0));
    const low = trees.count;
    expect(low.trees).toBeGreaterThan(1000);
    expect(low.near).toBeGreaterThan(50);
    expect(low.near).toBeLessThan(low.trees / 5);
    // Up high every block is out of range.
    trees.update(new Vector3(0, 5000, 0), Infinity);
    expect(trees.count.trees).toBe(0);
    trees.dispose();
  });

  it('moves the full trees along with the camera', () => {
    const trees = new Trees(forest, { rangeM: 1200, spacingM: 30, detailM: 300 });
    trees.prepare(new Vector3(0, 100, 0));
    trees.update(new Vector3(2500, 100, 0), Infinity);
    const after = trees.count;
    expect(after.trees).toBeGreaterThan(1000);
    expect(after.near).toBeGreaterThan(50);
    trees.setSettings(null);
    trees.update(new Vector3(2500, 100, 0), Infinity);
    expect(trees.count.trees).toBe(0);
    expect(trees.group.visible).toBe(false);
    trees.dispose();
  });
});
