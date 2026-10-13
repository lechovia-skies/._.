import { describe, expect, it } from 'vitest';
import { neutralInput, sanitizeInput } from './controls.ts';

describe('controls', () => {
  it('neutral input centers the stick and keeps throttle', () => {
    const n = neutralInput(0.6);
    expect([n.pitch, n.roll, n.yaw]).toEqual([0, 0, 0]);
    expect(n.throttle).toBe(0.6);
    expect(n.fireCannon || n.fireMissile || n.countermeasures || n.airbrake).toBe(false);
    expect(n.weapon).toBe(0);
  });
  it('sanitizes out-of-range and non-finite values', () => {
    const raw = { ...neutralInput(), pitch: 5, roll: Number.NaN, yaw: -9, throttle: 2, lookYaw: 99, lookPitch: -99 };
    const s = sanitizeInput(raw);
    expect(s.pitch).toBe(1);
    expect(s.roll).toBe(0);
    expect(s.yaw).toBe(-1);
    expect(s.throttle).toBe(1);
    expect(s.lookYaw).toBeCloseTo(Math.PI, 10);
    expect(s.lookPitch).toBeCloseTo(-Math.PI / 2, 10);
  });
  it('coerces an unknown missile slot to the first, and keeps a slot within the eight a jet can have', () => {
    expect(sanitizeInput({ ...neutralInput(), weapon: 'laser' as unknown as number }).weapon).toBe(0);
    expect(sanitizeInput({ ...neutralInput(), weapon: 1.5 }).weapon).toBe(0);
    expect(sanitizeInput({ ...neutralInput(), weapon: 99 }).weapon).toBe(7);
    expect(sanitizeInput({ ...neutralInput(), weapon: 3 }).weapon).toBe(3);
  });
  it('treats dropBomb as a button that is off unless pressed', () => {
    expect(neutralInput().dropBomb).toBe(false);
    expect(sanitizeInput({ ...neutralInput(), dropBomb: true }).dropBomb).toBe(true);
    expect(sanitizeInput({ ...neutralInput(), dropBomb: 'yes' as unknown as boolean }).dropBomb).toBe(false);
  });
});
