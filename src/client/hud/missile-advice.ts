/** A break about this long before impact beats the missile (spec §10.2); a human needs a moment to react. */
const TURN_NOW_S = 2;

export interface MissileAdvice {
  text: string;
  /** flash it big: the moment to act is now */
  urgent: boolean;
}

/**
 * What the HUD tells the pilot to do about the missile that will arrive first: flares against an infrared missile,
 * chaff against a radar missile (revision 30: counted apart; X releases one of each).
 */
export function missileAdvice(timeToImpactS: number, guidance: 'ir' | 'radar' = 'ir'): MissileAdvice {
  if (timeToImpactS <= TURN_NOW_S) return { text: 'TURN HARD NOW', urgent: true };
  return { text: `X  ${guidance === 'ir' ? 'FLARES' : 'CHAFF'}  ·  BREAK WHEN IT IS CLOSE`, urgent: false };
}
