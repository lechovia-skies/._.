import { describe, expect, it } from 'vitest';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import { loadoutFor } from '../../shared/data/loadout.ts';
import { testView } from '../testing/views.ts';
import { stickAxes, storeCells } from './touch-controls.ts';

describe('touch stick (revision 39)', () => {
  it('ignores a small wobble at the centre and reaches full deflection at the rim', () => {
    expect(stickAxes(2, -3, 60, 'pull')).toEqual({ pitch: 0, roll: 0 });
    expect(stickAxes(60, 0, 60, 'pull').roll).toBeCloseTo(1, 6);
    // Dragged past the rim: still full, the direction kept.
    const out = stickAxes(0, 300, 60, 'pull');
    expect(out.pitch).toBeCloseTo(1, 6);
    expect(out.roll).toBe(0);
  });

  it('is gentle near the centre, for fine aiming', () => {
    const half = stickAxes(30, 0, 60, 'pull').roll;
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.4);
  });

  it('climbs pulled down like a real stick, or pushed up', () => {
    expect(stickAxes(0, 45, 60, 'pull').pitch).toBeGreaterThan(0.5);
    expect(stickAxes(0, 45, 60, 'push').pitch).toBeLessThan(-0.5);
    expect(stickAxes(0, -45, 60, 'push').pitch).toBeGreaterThan(0.5);
    expect(stickAxes(-45, 0, 60, 'push').roll).toBeLessThan(-0.5);
  });
});

describe('touch stores panel (revision 39)', () => {
  it("lists each missile type with its count and range, then the gun, and marks what FIRE fires", () => {
    const v = testView(1);
    const cells = storeCells(v, 1, 'missile');
    expect(cells.map((c) => `${c.name} ${c.count} ${c.range}`.trim())).toEqual(['AIM-9X 2 8 km', 'AIM-120D 4 33 km', 'M61A1 511']);
    expect(cells.filter((c) => c.selected).map((c) => c.name)).toEqual(['AIM-120D']);
    expect(cells.map((c) => c.slot)).toEqual([0, 1, -1]);
    expect(storeCells(v, 1, 'gun').filter((c) => c.selected).map((c) => c.kind)).toEqual(['gun']);
  });

  it('adds the bombs of a Strike sortie', () => {
    const yastreb = getAircraft('yastreb');
    const v = testView(1, { config: yastreb, loadout: loadoutFor(yastreb, true) });
    const cells = storeCells(v, 0, 'bomb');
    expect(cells.map((c) => c.kind)).toEqual(['missile', 'missile', 'gun', 'bomb']);
    expect(cells[3]).toMatchObject({ name: 'FAB-500M-62', count: 6, selected: true });
  });
});
