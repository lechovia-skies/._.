import type { AirframeParts, Blueprint } from './airframe.ts';
import { ball, canopy, intake, loft, nozzle, type Ring, ring, rod, surface, withMirror } from './kit.ts';
import { bothSides, camoPatches, type Marking, type PaintSpec } from './paint.ts';
import type { Hardpoint, StoreLayout, StoresPlan } from './stores.ts';

/**
 * The Flanker family (revision 31): the Yastreb drawn as an Su-35S and the Sapsan as an Su-30SM. Both have the big
 * drooped radome with its probe, the IRST ball ahead of the windscreen, the ogival LERX running into a 42° wing with
 * launch rails at the tips, a flat centre body between widely spaced engine nacelles (rectangular intakes under the
 * LERX, lower lips forward), the long tail stinger between the nozzles, and upright fins and tailplanes on booms
 * outboard of the engines, with ventral fins below. The Su-30SM adds the second seat, canards and taller fins.
 */
interface FlankerOptions {
  twoSeat: boolean;
  canards: boolean;
  /** height of the fin tips above the ground */
  finTopWl: number;
  /** half the span to the launch rails */
  semiSpan: number;
}

const L = 21.9;
const WING_WL = 2.52;

function flankerParts(o: FlankerOptions): AirframeParts {
  const forward = loft(
    [
      ring(0.95, 2.55, 0.01, 0.01),
      ring(1.6, 2.6, 0.33, 0.33, 0.32),
      ring(2.6, 2.68, 0.58, 0.57, 0.55),
      ring(3.7, 2.78, 0.72, 0.7, 0.68, 2.1, 2.2),
      ring(4.7, 2.88, 0.78, 0.62, 0.8, 2.2, 2.7),
      ring(5.8, 2.92, 0.82, 0.58, 0.86, 2.3, 3),
      ring(7.2, 2.94, 0.88, 0.6, 0.82, 2.4, 3.2),
      ring(8.8, 2.92, 0.9, 0.5, 0.6, 2.6, 3.2),
      ring(10.5, 2.82, 0.8, 0.36, 0.36, 2.6, 2.6),
    ],
    { around: 40 },
  );
  // The hump behind the canopy (with the airbrake) falling to the stinger.
  const spineEnd = o.twoSeat ? 9.4 : 7.6;
  const spine = loft(
    [
      ring(spineEnd - 1.2, 2.96, 0.52, 0.52, 0.3, 2.3, 2),
      ring(spineEnd + 0.6, 2.95, 0.6, 0.6, 0.3, 2.4, 2),
      ring(12, 2.9, 0.64, 0.46, 0.3, 2.4, 2),
      ring(15, 2.78, 0.55, 0.28, 0.3, 2.4, 2),
      ring(17.5, 2.6, 0.44, 0.24, 0.3, 2.2, 2),
      ring(19.6, 2.45, 0.38, 0.3, 0.3),
      ring(21.2, 2.4, 0.3, 0.27, 0.27),
      ring(21.9, 2.4, 0.14, 0.13, 0.13),
    ],
    { around: 28, capEnd: true },
  );
  const centre = loft(
    [
      ring(8.2, 2.62, 0.9, 0.3, 0.28, 4, 4),
      ring(10, 2.6, 1.55, 0.3, 0.32, 4, 4),
      ring(14, 2.56, 1.78, 0.28, 0.32, 4, 4),
      ring(17, 2.5, 1.7, 0.24, 0.3, 4, 4),
      ring(19.4, 2.45, 1.35, 0.2, 0.26, 3.6, 3.6),
    ],
    { around: 40, capEnd: true },
  );
  const nacelleRings: Ring[] = [
    ring(8.45, 1.76, 0.5, 0.58, 0.58, 6, 6, 1.26),
    ring(10, 1.8, 0.55, 0.6, 0.6, 5, 5, 1.26),
    ring(13, 1.86, 0.6, 0.6, 0.62, 3.6, 3.6, 1.25),
    ring(16.5, 1.95, 0.63, 0.63, 0.63, 2.5, 2.5, 1.25),
    ring(19.65, 2.0, 0.62, 0.62, 0.62, 2.1, 2.1, 1.25),
  ];
  const nacelle = intake({ rings: nacelleRings, lip: 0.06, depth: 1.8, rake: { perWl: 0.32 } });
  const boom = loft(
    [ring(14.6, 2.32, 0.04, 0.05, 0.04, 2, 2, 2.08), ring(15.8, 2.32, 0.17, 0.3, 0.24, 2.6, 2.4, 2.08), ring(20.4, 2.32, 0.17, 0.28, 0.24, 2.6, 2.4, 2.08), ring(21.1, 2.32, 0.08, 0.1, 0.08, 2, 2, 2.08)],
    { around: 16, capEnd: true },
  );
  const tip = o.semiSpan - 0.12;
  const wing = surface(
    [
      { s: 0.3, le: 5.4, te: 15.4, off: WING_WL + 0.06, t: 0.03 },
      { s: 0.62, le: 5.6, te: 15.4, off: WING_WL + 0.06, t: 0.03 },
      { s: 0.82, le: 6.65, te: 15.4, off: WING_WL + 0.05, t: 0.032 },
      { s: 1.12, le: 7.75, te: 15.4, off: WING_WL + 0.04, t: 0.034 },
      { s: 1.52, le: 8.85, te: 15.45, off: WING_WL + 0.02, t: 0.036 },
      { s: 1.96, le: 9.8, te: 15.5, off: WING_WL, t: 0.038 },
      { s: 2.32, le: 10.45, te: 15.55, off: WING_WL, t: 0.04 },
      { s: tip, le: 10.45 + (tip - 2.32) * 0.9, te: 15.55 + (tip - 2.32) * 0.2, off: WING_WL - (tip - 2.32) * 0.035, t: 0.035 },
    ],
    {},
  );
  const tipWl = WING_WL - (tip - 2.32) * 0.035;
  const tipLe = 10.45 + (tip - 2.32) * 0.9;
  const rail = rod(o.semiSpan, tipWl, tipLe - 0.9, tipLe + 1.5, 0.07, 0.07, 8);
  const tailplane = surface(
    [
      { s: 1.95, le: 17.9, te: 21.2, off: 2.3, t: 0.04 },
      { s: 4.95, le: 20.85, te: 21.85, off: 2.3, t: 0.035 },
    ],
    {},
  );
  const finH = o.finTopWl - 2.58;
  const fin = surface(
    [
      { s: 0, le: 15.9, te: 19.95, t: 0.045 },
      { s: finH * 0.9, le: 15.9 + finH * 0.9 * 0.84, te: 19.95 + finH * 0.9 * 0.04, t: 0.035 },
      { s: finH, le: 15.9 + finH * 0.9 * 0.84 + 0.45, te: 19.95 + finH * 0.04, t: 0.035 },
    ],
    { placement: { kind: 'fin', bl: 2.08, wl: 2.58, cantDeg: 0 } },
  );
  const ventral = surface(
    [
      { s: 0, le: 16.4, te: 18.1, t: 0.05 },
      { s: 0.85, le: 17.35, te: 18.1, t: 0.05 },
    ],
    { placement: { kind: 'fin', bl: 2.08, wl: 2.1, cantDeg: 168 } },
  );
  const canards = o.canards
    ? withMirror(
        surface(
          [
            { s: 0.6, le: 7.0, te: 8.7, off: 2.82, t: 0.04 },
            { s: 3.2, le: 8.95, te: 9.6, off: 2.82, t: 0.035 },
          ],
          {},
        ),
      )
    : [];
  const windscreen = 4.62;
  const cockpit = canopy(
    o.twoSeat
      ? {
          rings: [
            ring(windscreen, 3.46, 0.42, 0.02, 0.08),
            ring(5.1, 3.46, 0.52, 0.46, 0.08, 2.2),
            ring(5.9, 3.46, 0.55, 0.68, 0.08, 2.2),
            ring(7.0, 3.48, 0.55, 0.72, 0.08, 2.2),
            ring(8.1, 3.5, 0.54, 0.7, 0.08, 2.2),
            ring(9.0, 3.5, 0.48, 0.5, 0.08, 2.2),
            ring(9.9, 3.48, 0.3, 0.18, 0.08, 2.2),
          ],
          frames: [5.02, 7.15],
          seats: [6.2, 7.95],
          headUp: 0.52,
        }
      : {
          rings: [
            ring(windscreen, 3.46, 0.42, 0.02, 0.08),
            ring(5.1, 3.46, 0.52, 0.46, 0.08, 2.2),
            ring(5.9, 3.46, 0.55, 0.68, 0.08, 2.2),
            ring(6.7, 3.48, 0.54, 0.66, 0.08, 2.2),
            ring(7.5, 3.5, 0.45, 0.44, 0.08, 2.2),
            ring(8.2, 3.48, 0.28, 0.14, 0.08, 2.2),
          ],
          frames: [5.02],
          seats: [6.3],
          headUp: 0.52,
        },
  );
  const irst = ball(0.22, 3.52, 4.32, 0.17, 14);
  const irstBase = loft([ring(4.0, 3.46, 0.02, 0.02, 0.02, 2, 2, 0.22), ring(4.3, 3.46, 0.2, 0.08, 0.05, 2, 2, 0.22), ring(4.6, 3.46, 0.2, 0.06, 0.05, 2, 2, 0.22)], {
    around: 12,
    capEnd: true,
  });
  const probe = rod(0, 2.55, 0, 1.0, 0.012, 0.035, 8);
  const exits = ([1.25, -1.25] as const).map((bl) => nozzle({ fs0: 19.5, fs1: 20.75, bl, wl: 2.0, r0: 0.62, r1: 0.54, petals: 18 }));
  return {
    skin: [forward, spine, centre, ...withMirror(nacelle.skin), ...withMirror(boom), ...withMirror(wing), ...withMirror(tailplane), ...withMirror(fin), ...withMirror(ventral), ...canards, irstBase],
    dark: [...withMirror(nacelle.dark)],
    tub: [cockpit.dark],
    glass: [cockpit.glass, irst],
    trim: [...withMirror(rail), probe, ...cockpit.trim],
    crew: cockpit.crew,
    nozzles: exits,
  };
}

function flankerPaint(seed: number, bort: string, finTopWl: number, colors: readonly string[], underside: string): PaintSpec {
  const number: Marking = {
    art: { kind: 'text', text: bort, stroke: '#c23a3e', strokeW: 0.12, inner: '#f2f2f0' },
    at: [3.95, -0.7, 2.62],
    size: [0.95, 0.72],
    from: 'left',
    depth: 0.6,
  };
  const starWl = finTopWl - 1.05;
  return {
    colors,
    underside,
    undersideAmount: 0.9,
    patches: camoPatches({ seed, count: 30, from: [1, -7.5, 1.4], to: [22, 7.5, 5.5], size: [1.6, 3.6], weights: [0.36, 0.3, 0.34] }),
    soft: 0.16,
    warp: 0.7,
    zones: [
      { from: [-1, -1, 1], to: [3.62, 1, 4], color: '#d3d7da', soft: 0.025 },
      // Light dielectric fin caps; heat-darkened metal at the back of the nacelles.
      { from: [17, -3, finTopWl - 0.32], to: [21, 3, finTopWl + 0.2], color: '#d6dadc', soft: 0.02 },
      { from: [19.3, -2, 1.2], to: [21, 2, 2.8], color: '#4d5154', soft: 0.25, opacity: 0.8 },
    ],
    markings: [
      ...bothSides(number),
      ...bothSides({ art: { kind: 'red-star' }, at: [18.85, -2.08, starWl], size: [0.95, 0.95], from: 'left', depth: 0.3 }),
      ...bothSides({ art: { kind: 'text', text: bort, fill: '#27406b' }, at: [19.25, -2.08, starWl - 0.85], size: [0.52, 0.42], from: 'left', depth: 0.3 }),
      { art: { kind: 'red-star' }, at: [13.6, -5.2, WING_WL], size: [1.5, 1.5], from: 'bottom', depth: 0.3 },
      { art: { kind: 'red-star' }, at: [13.6, 5.2, WING_WL], size: [1.5, 1.5], from: 'bottom', depth: 0.3 },
    ],
    panelLines: 0.26,
    roughness: 0.66,
    metalness: 0.08,
  };
}

/** Twelve hardpoints: wingtip rails, three pylons under each wing, one under each nacelle and two in tandem between. */
function flankerHardpoints(semiSpan: number): Hardpoint[] {
  const wingWl = (bl: number) => WING_WL - Math.max(0, bl - 2.32) * 0.035 - 0.05;
  const pair = (fs: number, bl: number, wl: number, pylon = true): Hardpoint[] => [
    { fs, bl: -bl, wl, pylon },
    { fs, bl, wl, pylon },
  ];
  return [
    ...pair(15.5, semiSpan + 0.02, wingWl(semiSpan) - 0.05, false),
    ...pair(13.9, 5.75, wingWl(5.75)),
    ...pair(13.2, 4.5, wingWl(4.5)),
    ...pair(12.6, 3.25, wingWl(3.25)),
    ...pair(11.2, 1.25, 1.23),
    { fs: 10.6, bl: 0, wl: 2.24, pylon: true },
    { fs: 14.6, bl: 0, wl: 2.24, pylon: true },
  ];
}

function flankerStores(semiSpan: number, layout: StoreLayout): StoresPlan {
  return { hardpoints: flankerHardpoints(semiSpan), layout };
}

const FLANKER_BLUES = ['#a9bccb', '#7d9dbd', '#5c7fa3', '#c3d2de'];

export const YASTREB_AIRFRAME: Blueprint = {
  lengthM: L,
  datumWlM: 2.45,
  parts: () => flankerParts({ twoSeat: false, canards: false, finTopWl: 5.9, semiSpan: 7.65 }),
  canopyTint: 0xa7b4bd,
  helmet: 0xd9dcd8,
  stores: flankerStores(7.65, { 'R-73': [0, 1, 2, 3], 'R-77-1': [4, 5, 2, 3], 'R-37M': [8, 9, 10, 11], 'FAB-500M-62': [6, 7, 10, 11, 8, 9] }),
  gear: {
    nose: { fs: 5.6, wl: 2.05, r: 0.34, w: 0.26 },
    main: { fs: 12.9, bl: 2.17, wl: 1.95, r: 0.62, w: 0.33, rake: -0.45, fold: 'forward' },
  },
  paint: flankerPaint(0x35a, '07', 5.9, FLANKER_BLUES, '#bccbd6'),
};

export const SAPSAN_AIRFRAME: Blueprint = {
  lengthM: L,
  datumWlM: 2.45,
  parts: () => flankerParts({ twoSeat: true, canards: true, finTopWl: 6.36, semiSpan: 7.35 }),
  canopyTint: 0xa7b4bd,
  helmet: 0xd9dcd8,
  stores: flankerStores(7.35, { 'R-73': [0, 1, 2, 3], 'R-27R': [6, 7, 8, 9, 10, 11, 4, 5], 'FAB-500M-62': [10, 11, 8, 9, 4, 5] }),
  gear: {
    nose: { fs: 5.6, wl: 2.05, r: 0.31, w: 0.18, twin: true },
    main: { fs: 12.9, bl: 2.17, wl: 1.95, r: 0.62, w: 0.33, rake: -0.45, fold: 'forward' },
  },
  paint: flankerPaint(0x30b, '02', 6.36, ['#a5b9c9', '#7698ba', '#56799f', '#bfcfdc'], '#b8c9d5'),
};
