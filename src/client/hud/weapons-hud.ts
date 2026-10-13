import { MISSILES } from '../../shared/data/weapons.ts';
import type { SeekerMode } from '../../shared/targeting/ir-seeker.ts';
import type { RadarLockMode } from '../../shared/targeting/radar-lock.ts';
import type { AircraftView } from '../session/game-session.ts';

export type Tone = 'normal' | 'amber' | 'red';

export interface WeaponCell {
  text: string;
  /** the selected missile, drawn boxed */
  selected: boolean;
}

/** The weapons readout: stores in a row, and the selected missile's lock state under it. */
export interface WeaponsLine {
  cells: WeaponCell[];
  status: { text: string; tone: Tone };
}

const SEEKER_STATUS: Record<SeekerMode, [string, Tone]> = { off: ['', 'normal'], search: ['SRCH', 'normal'], track: ['TRK', 'amber'], locked: ['LOCK', 'red'] };
const RADAR_STATUS: Record<RadarLockMode, [string, Tone]> = { off: ['', 'normal'], search: ['SRCH', 'normal'], tracking: ['TRK', 'amber'], locked: ['LOCK', 'red'] };

/**
 * The gun and its rounds, each missile type the jet carries with how many are left, flares, chaff (and bombs), by
 * their real names (revision 30): "M61A1 511  AIM-9X 2  AIM-120D 4  FLR 30  CHF 60". The selected missile is boxed,
 * and its seeker or radar-lock state is written under the row.
 */
export function weaponsLine(view: Pick<AircraftView, 'config' | 'stores' | 'loadout' | 'seeker' | 'radarLock'>, weapon: number): WeaponsLine {
  const s = view.stores;
  const missiles = view.loadout.missiles;
  const cells: WeaponCell[] = [{ text: `${view.config.stores.cannon} ${s.cannonRounds}`, selected: false }];
  missiles.forEach((m, i) => cells.push({ text: `${m.missile} ${s.missiles[i] ?? 0}`, selected: i === weapon }));
  cells.push({ text: `FLR ${s.flares}`, selected: false }, { text: `CHF ${s.chaff}`, selected: false });
  if (view.loadout.bomb && view.loadout.bombs > 0) cells.push({ text: `${view.loadout.bomb.name} ${s.bombs}`, selected: false });
  const load = missiles[weapon];
  if (!load) return { cells, status: { text: missiles.length === 0 ? 'NO MISSILES' : '', tone: 'normal' } };
  const name = load.missile;
  if ((s.missiles[weapon] ?? 0) <= 0) return { cells, status: { text: `${name} EMPTY`, tone: 'normal' } };
  const [label, tone] = MISSILES[load.missile].guidance === 'ir' ? SEEKER_STATUS[view.seeker.mode] : RADAR_STATUS[view.radarLock.mode];
  return { cells, status: { text: label ? `${name} ${label}` : name, tone } };
}

/** Half-size of the radar-lock diamond around the target box: it closes in from 3× the box as the lock builds. */
export function lockDiamondPx(boxHalfPx: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return boxHalfPx * (1.4 + 1.6 * (1 - p));
}
