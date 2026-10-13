import { describe, expect, it } from 'vitest';
import { kestrel } from './kestrel.ts';
import type { AircraftConfig } from './types.ts';
import { assertValidAircraftConfig, validateAircraftConfig } from './validate.ts';

const clone = (c: AircraftConfig): AircraftConfig => structuredClone(c);

describe('validateAircraftConfig', () => {
  it('accepts Kestrel', () => {
    expect(validateAircraftConfig(kestrel)).toEqual([]);
  });
  it('rejects afterburner thrust below military thrust', () => {
    const c = clone(kestrel);
    c.physics.thrustAbN = 50000;
    expect(validateAircraftConfig(c).join()).toContain('physics.thrustAbN');
  });
  it('rejects an AoA limiter below alpha max', () => {
    const c = clone(kestrel);
    c.physics.aoaLimiterDeg = 20;
    expect(validateAircraftConfig(c).join()).toContain('physics.aoaLimiterDeg');
  });
  it('rejects out-of-range stealth, bad colors, bad ids and inverted performance ranges', () => {
    const c = clone(kestrel);
    c.sensors.stealth = 1.5;
    c.visual.colors.primary = 'grey';
    c.id = 'Bad Id';
    c.performance = { ...c.performance, stallSpeedMs: [80, 60] };
    const problems = validateAircraftConfig(c).join('\n');
    expect(problems).toContain('sensors.stealth');
    expect(problems).toContain('visual.colors.primary');
    expect(problems).toContain('id');
    expect(problems).toContain('performance.stallSpeedMs');
  });
  it('rejects unknown or repeated missiles, radar before infrared, and bad flare, chaff and strike loads', () => {
    const problems = (stores: AircraftConfig['stores']) => validateAircraftConfig({ ...kestrel, stores }).join('\n');
    const s = kestrel.stores;
    expect(problems({ ...s, missiles: [{ missile: 'AIM-9Z' as 'AIM-9X', count: 2 }] })).toContain('stores.missiles');
    expect(problems({ ...s, missiles: [{ missile: 'AIM-9X', count: 2 }, { missile: 'AIM-9X', count: 2 }] })).toContain('stores.missiles');
    expect(problems({ ...s, missiles: [{ missile: 'AIM-120C', count: 4 }, { missile: 'AIM-9X', count: 2 }] })).toContain('stores.missiles');
    expect(problems({ ...s, missiles: [{ missile: 'AIM-9X', count: 0 }] })).toContain('stores.missiles');
    expect(problems({ ...s, flares: -1 })).toContain('stores.flares');
    expect(problems({ ...s, chaff: 1.5 })).toContain('stores.chaff');
    expect(problems({ ...s, strike: { bomb: 'FAB-500M-62', bombs: 0, missiles: [] } })).toContain('stores.strike');
    expect(problems({ ...s, strike: { bomb: 'FAB-500M-62', bombs: 4, missiles: [{ missile: 'R-73', count: 2 }] } })).toBe('');
  });
  it('assert throws with the aircraft id', () => {
    const c = clone(kestrel);
    c.physics.massKg = -1;
    expect(() => assertValidAircraftConfig(c)).toThrow(/kestrel.*physics\.massKg/s);
  });
});
