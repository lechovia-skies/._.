import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GridTerrain } from './terrain.ts';

const plane = (x: number, z: number) => 0.01 * x + 0.02 * z + 5;

describe('GridTerrain', () => {
  const t = GridTerrain.fromFunction(65, 6400, plane);

  it('samples a plane exactly with bilinear interpolation', () => {
    for (const [x, z] of [[0, 0], [123.4, -987.6], [-3000, 2999], [1111, 55.5]]) {
      expect(t.heightAt(x, z)).toBeCloseTo(plane(x, z), 6);
    }
  });
  it('clamps to the edge outside the grid', () => {
    expect(t.heightAt(99999, 0)).toBeCloseTo(plane(3200, 0), 6);
  });
  it('reports the sea surface at 0 over negative heights', () => {
    const sea = GridTerrain.fromFunction(9, 800, () => -40);
    expect(sea.heightAt(0, 0)).toBe(-40);
    expect(sea.surfaceAt(0, 0)).toBe(0);
  });
  it('computes normals', () => {
    const n = t.normalAt(0, 0);
    const expected = new Vector3(-0.01, 1, -0.02).normalize();
    expect(n.distanceTo(expected)).toBeLessThan(1e-6);
  });
  it('tests line of sight over a ridge', () => {
    const ridge = GridTerrain.fromFunction(101, 20000, (x) => (Math.abs(x) < 600 ? 1000 : 0));
    expect(ridge.lineOfSight(new Vector3(-5000, 100, 0), new Vector3(5000, 100, 0))).toBe(false);
    expect(ridge.lineOfSight(new Vector3(-5000, 2000, 0), new Vector3(5000, 2000, 0))).toBe(true);
  });
  it('rejects a wrongly sized height array', () => {
    expect(() => new GridTerrain(4, 100, new Float32Array(10))).toThrow(/16/);
  });

  it('follows the drawn triangles exactly (revision 46)', () => {
    // One raised corner: the triangles and the bilinear surface differ inside the cell, agree at the corners.
    const t = new GridTerrain(3, 200, new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 40]));
    expect(t.meshHeightAt(0, 0)).toBeCloseTo(0, 9);
    expect(t.meshHeightAt(100, 100)).toBeCloseTo(40, 9);
    // On the far triangle of the raised cell: flat facets, not the bilinear bulge.
    expect(t.meshHeightAt(75, 75)).toBeCloseTo(20, 9);
    expect(t.heightAt(75, 75)).toBeCloseTo(22.5, 9);
    // On the near triangle the raised corner does not count.
    expect(t.meshHeightAt(20, 20)).toBeCloseTo(0, 9);
  });
});
