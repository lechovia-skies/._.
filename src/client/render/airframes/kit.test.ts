import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { intake, loft, mirrored, monotoneSpline, nozzle, ring, ringPoint, surface } from './kit.ts';

const normalAt = (g: ReturnType<typeof loft>, test: (p: Vector3) => boolean): Vector3[] => {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const out: Vector3[] = [];
  for (let i = 0; i < p.count; i++) if (test(new Vector3(p.getX(i), p.getY(i), p.getZ(i)))) out.push(new Vector3(n.getX(i), n.getY(i), n.getZ(i)));
  return out;
};

describe('airframe kit (revision 31)', () => {
  it('interpolates smoothly through the keys without overshooting them', () => {
    const f = monotoneSpline([0, 1, 2, 3], [0, 1, 1, 3]);
    expect(f(1)).toBe(1);
    expect(f(3)).toBe(3);
    for (let x = 1; x <= 2; x += 0.1) expect(f(x)).toBeCloseTo(1, 6);
    for (let x = 0; x <= 3; x += 0.05) expect(f(x)).toBeLessThanOrEqual(3);
  });

  it('shapes rings as superellipses with their own upper and lower halves', () => {
    const r = ring(0, 2, 1, 0.5, 0.8, 2, 4);
    expect(ringPoint(r, 0)).toEqual([1, 2]);
    const [, top] = ringPoint(r, Math.PI / 2);
    const [, bottom] = ringPoint(r, -Math.PI / 2);
    expect(top).toBeCloseTo(2.5);
    expect(bottom).toBeCloseTo(1.2);
    // A boxier lower half stays wider further down.
    const lowerSide = ringPoint(r, -Math.PI / 4);
    const upperSide = ringPoint(r, Math.PI / 4);
    expect(lowerSide[0]).toBeGreaterThan(upperSide[0]);
  });

  it('lofts a body whose faces point outward, mirrored copies included', () => {
    const body = loft([ring(0, 0, 0.01, 0.01), ring(2, 0, 1, 1), ring(6, 0, 1, 1)], { capEnd: true });
    for (const n of normalAt(body, (p) => p.x > 0.99 && p.z > 3 && p.z < 5)) expect(n.x).toBeGreaterThan(0.9);
    for (const n of normalAt(body, (p) => p.y > 0.99 && p.z > 3 && p.z < 5)) expect(n.y).toBeGreaterThan(0.9);
    const side = loft([ring(0, 0, 0.3, 0.3, 0.3, 2, 2, 2), ring(3, 0, 0.3, 0.3, 0.3, 2, 2, 2)]);
    for (const n of normalAt(mirrored(side), (p) => p.x < -2.29 && p.z > 1 && p.z < 2)) expect(n.x).toBeLessThan(-0.9);
  });

  it('builds lifting surfaces with the upper skin facing up, and fins standing at their cant', () => {
    const wing = surface([
      { s: 0, le: 0, te: 4, off: 1 },
      { s: 5, le: 3, te: 4.5, off: 1 },
    ]);
    const p = wing.getAttribute('position');
    let maxX = 0;
    for (let i = 0; i < p.count; i++) maxX = Math.max(maxX, p.getX(i));
    expect(maxX).toBeCloseTo(5);
    for (const n of normalAt(wing, (q) => q.y > 1.05 && q.x > 1 && q.x < 2)) expect(n.y).toBeGreaterThan(0.8);
    const fin = surface(
      [
        { s: 0, le: 0, te: 3 },
        { s: 2, le: 1.5, te: 3 },
      ],
      { placement: { kind: 'fin', bl: 1, wl: 2, cantDeg: 30 } },
    );
    const f = fin.getAttribute('position');
    let top = new Vector3();
    for (let i = 0; i < f.count; i++) if (f.getY(i) > top.y) top = new Vector3(f.getX(i), f.getY(i), f.getZ(i));
    // Leaning outward: the tip sits further from the centreline than the root.
    expect(top.y).toBeCloseTo(2 + 2 * Math.cos(Math.PI / 6), 1);
    expect(top.x).toBeGreaterThan(1.9);
  });

  it('opens nozzles and intakes onto dark insides', () => {
    const n = nozzle({ fs0: 10, fs1: 11, bl: 1, wl: 2, r0: 0.5, r1: 0.45, petals: 16 });
    expect(n.exit).toEqual([1, 2, 11]);
    expect(n.radius).toBeGreaterThan(0.35);
    expect(n.dark.getAttribute('position').count).toBeGreaterThan(0);
    const flat = nozzle({ fs0: 10, fs1: 11, bl: 0.6, wl: 2, r0: 0.5, r1: 0.4, box: { w0: 0.6, h0: 0.45, w1: 0.55, h1: 0.3 } });
    expect(flat.radius).toBeCloseTo(0.33);
    const inlet = intake({ rings: [ring(4, 1.5, 0.5, 0.6, 0.6, 6, 6, 1), ring(7, 1.6, 0.5, 0.6, 0.6, 4, 4, 1)], lip: 0.05, depth: 1.5, rake: { perWl: -0.3 } });
    const lip = inlet.skin.getAttribute('position');
    // The raked lip: the top edge is ahead of the bottom edge.
    let topFs = 0;
    let bottomFs = 0;
    for (let i = 0; i < lip.count; i++) {
      if (Math.abs(lip.getY(i) - 2.1) < 0.01 && lip.getZ(i) < 4.5) topFs = lip.getZ(i);
      if (Math.abs(lip.getY(i) - 0.9) < 0.01 && lip.getZ(i) < 4.5) bottomFs = lip.getZ(i);
    }
    expect(topFs).toBeLessThan(bottomFs);
  });
});
