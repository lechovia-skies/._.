import { describe, expect, it } from 'vitest';
import { hintLines } from './hud.ts';

describe('the hint on a touch screen (revision 39)', () => {
  const measure = (t: string) => t.length * 10;

  it('breaks at the dots to fit, never inside a part', () => {
    expect(hintLines('TAKE-OFF · throttle up to AB · above 170 KT raise the nose', 300, measure)).toEqual(['TAKE-OFF · throttle up to AB', 'above 170 KT raise the nose']);
    expect(hintLines('A · B · C', 1000, measure)).toEqual(['A · B · C']);
    expect(hintLines('a part far too long for the line', 50, measure)).toEqual(['a part far too long for the line']);
  });

  it('has no lines for no hint', () => {
    expect(hintLines('', 300, measure)).toEqual([]);
  });
});
