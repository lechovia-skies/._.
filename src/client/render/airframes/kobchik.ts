import type { AirframeParts, Blueprint } from './airframe.ts';
import { ball, canopy, intake, loft, nozzle, ring, rod, surface, withMirror } from './kit.ts';
import { bothSides, camoPatches } from './paint.ts';

/**
 * The Kobchik drawn as a MiG-29 9.12 (revision 31): the dark pointed radome with its probe, the IRST ball, the
 * framed bubble canopy, the broad LERX reaching forward almost to the windscreen, wedge intakes under the LERX with
 * their lower lips forward, engine nacelles spaced apart under a flat centre body, a 42° wing, fins canted out 6° on
 * booms with ventral fins below, and tailplanes on the booms. Paint: the hard-edged two-tone grey of the reference
 * picture, the bort number "29" in dark blue edged white on the intakes, red stars on the fins.
 */
const L = 17.3;
const WING_WL = 1.98;

function parts(): AirframeParts {
  const forward = loft(
    [
      ring(1.0, 1.98, 0.01, 0.01),
      ring(1.6, 2.02, 0.28, 0.28, 0.27),
      ring(2.6, 2.08, 0.48, 0.48, 0.45),
      ring(3.6, 2.14, 0.62, 0.56, 0.62, 2.2, 2.5),
      ring(4.8, 2.16, 0.66, 0.56, 0.7, 2.3, 3),
      ring(6.1, 2.18, 0.7, 0.54, 0.64, 2.4, 3),
      ring(7.6, 2.18, 0.64, 0.44, 0.46, 2.4, 3),
      ring(9, 2.15, 0.5, 0.3, 0.3),
    ],
    { around: 36 },
  );
  const spine = loft(
    [
      ring(5.8, 2.2, 0.42, 0.42, 0.3, 2.2, 2),
      ring(7.4, 2.2, 0.46, 0.46, 0.3, 2.3, 2),
      ring(10.5, 2.2, 0.44, 0.36, 0.3, 2.3, 2),
      ring(13.5, 2.15, 0.36, 0.26, 0.3, 2.2, 2),
      ring(15.8, 2.05, 0.3, 0.24, 0.26),
      ring(16.6, 2.0, 0.22, 0.2, 0.2),
    ],
    { around: 24, capEnd: true },
  );
  const centre = loft(
    [
      ring(6.4, 2.06, 0.7, 0.24, 0.22, 4, 4),
      ring(8.2, 2.02, 1.25, 0.26, 0.26, 4, 4),
      ring(11.5, 1.98, 1.42, 0.26, 0.28, 4, 4),
      ring(14, 1.95, 1.38, 0.24, 0.26, 4, 4),
      ring(15.6, 1.92, 1.15, 0.2, 0.24, 3.6, 3.6),
    ],
    { around: 40, capEnd: true },
  );
  const nacelle = intake({
    rings: [
      ring(5.55, 1.44, 0.4, 0.46, 0.44, 6, 6, 1.0),
      ring(6.8, 1.5, 0.46, 0.5, 0.48, 5, 5, 1.0),
      ring(9.5, 1.6, 0.52, 0.52, 0.52, 3.6, 3.6, 1.0),
      ring(13, 1.7, 0.53, 0.53, 0.53, 2.6, 2.6, 1.0),
      ring(15.7, 1.76, 0.5, 0.5, 0.5, 2.1, 2.1, 1.0),
    ],
    lip: 0.05,
    depth: 1.4,
    rake: { perWl: 0.55 },
  });
  const boom = loft(
    [ring(11.6, 1.98, 0.04, 0.05, 0.04, 2, 2, 1.52), ring(12.6, 1.98, 0.15, 0.24, 0.2, 2.6, 2.4, 1.52), ring(16.2, 1.98, 0.15, 0.22, 0.2, 2.6, 2.4, 1.52), ring(16.9, 1.98, 0.07, 0.08, 0.07, 2, 2, 1.52)],
    { around: 16, capEnd: true },
  );
  const wing = surface(
    [
      { s: 0.3, le: 3.3, te: 12.05, off: WING_WL + 0.1, t: 0.028 },
      { s: 0.5, le: 3.4, te: 12.05, off: WING_WL + 0.1, t: 0.028 },
      { s: 0.64, le: 3.95, te: 12.05, off: WING_WL + 0.09, t: 0.03 },
      { s: 0.82, le: 4.95, te: 12.05, off: WING_WL + 0.08, t: 0.032 },
      { s: 1.06, le: 5.95, te: 12.05, off: WING_WL + 0.06, t: 0.034 },
      { s: 1.36, le: 6.85, te: 12.05, off: WING_WL + 0.04, t: 0.036 },
      { s: 1.66, le: 7.62, te: 12.05, off: WING_WL + 0.02, t: 0.04 },
      { s: 1.96, le: 8.2, te: 12.08, off: WING_WL, t: 0.045 },
      { s: 5.7, le: 11.55, te: 12.8, off: WING_WL - 0.1, t: 0.035 },
    ],
    {},
  );
  const tailplane = surface(
    [
      { s: 1.45, le: 13.35, te: 16.0, off: 1.92, t: 0.04 },
      { s: 3.89, le: 16.25, te: 17.1, off: 1.92, t: 0.035 },
    ],
    {},
  );
  const fin = surface(
    [
      { s: 0, le: 12.2, te: 15.25, t: 0.045 },
      { s: 2.45, le: 14.85, te: 15.95, t: 0.035 },
      { s: 2.62, le: 15.1, te: 15.95, t: 0.035 },
    ],
    { placement: { kind: 'fin', bl: 1.52, wl: 2.12, cantDeg: 6 } },
  );
  const ventral = surface(
    [
      { s: 0, le: 13.6, te: 15.1, t: 0.05 },
      { s: 0.65, le: 14.5, te: 15.1, t: 0.05 },
    ],
    { placement: { kind: 'fin', bl: 1.52, wl: 1.82, cantDeg: 168 } },
  );
  const cockpit = canopy({
    rings: [
      ring(3.6, 2.7, 0.38, 0.02, 0.07),
      ring(4.0, 2.7, 0.46, 0.42, 0.07, 2.2),
      ring(4.7, 2.7, 0.49, 0.62, 0.07, 2.2),
      ring(5.4, 2.7, 0.48, 0.62, 0.07, 2.2),
      ring(6.1, 2.7, 0.42, 0.46, 0.07, 2.2),
      ring(6.8, 2.68, 0.27, 0.16, 0.06, 2.2),
    ],
    frames: [4.05],
    seats: [5.05],
    headUp: 0.44,
  });
  const irst = ball(0.17, 2.68, 3.38, 0.14, 12);
  const probe = rod(0, 1.98, 0, 1.05, 0.012, 0.03, 8);
  const exits = ([1.0, -1.0] as const).map((bl) => nozzle({ fs0: 15.5, fs1: 16.6, bl, wl: 1.76, r0: 0.5, r1: 0.44, petals: 16 }));
  return {
    skin: [forward, spine, centre, ...withMirror(nacelle.skin), ...withMirror(boom), ...withMirror(wing), ...withMirror(tailplane), ...withMirror(fin), ...withMirror(ventral)],
    dark: [...withMirror(nacelle.dark)],
    tub: [cockpit.dark],
    glass: [cockpit.glass, irst],
    trim: [probe, ...cockpit.trim],
    crew: cockpit.crew,
    nozzles: exits,
  };
}

export const KOBCHIK_AIRFRAME: Blueprint = {
  lengthM: L,
  datumWlM: 2.12,
  parts,
  gear: {
    nose: { fs: 5.2, wl: 1.45, r: 0.285, w: 0.14, twin: true },
    main: { fs: 10.2, bl: 1.55, wl: 1.3, r: 0.42, w: 0.29, rake: -0.2, fold: 'forward' },
  },
  stores: {
    hardpoints: [
      { fs: 11.1, bl: -4.4, wl: 1.91, pylon: true },
      { fs: 11.1, bl: 4.4, wl: 1.91, pylon: true },
      { fs: 10.6, bl: -3.5, wl: 1.93, pylon: true },
      { fs: 10.6, bl: 3.5, wl: 1.93, pylon: true },
      { fs: 10.1, bl: -2.6, wl: 1.95, pylon: true },
      { fs: 10.1, bl: 2.6, wl: 1.95, pylon: true },
    ],
    layout: { 'R-73': [0, 1, 2, 3], 'R-27R': [4, 5], 'FAB-500M-62': [4, 5, 2, 3] },
  },
  canopyTint: 0xa7b4bd,
  helmet: 0xd9dcd8,
  paint: {
    colors: ['#959ba1', '#5f676f', '#7d848b'],
    underside: '#aab0b5',
    undersideAmount: 0.85,
    patches: camoPatches({ seed: 0x29, count: 30, from: [2, -5.8, 1.0], to: [17, 5.8, 4.6], size: [1.3, 3.0], weights: [0.66, 0.34] }),
    soft: 0.05,
    warp: 0.55,
    zones: [
      { from: [-1, -1, 1], to: [2.75, 1, 3], color: '#3d4349', soft: 0.02 },
      { from: [14, -2.2, 4.42], to: [16.5, 2.2, 5], color: '#40464c', soft: 0.02 },
      { from: [15.4, -1.6, 1.1], to: [17, 1.6, 2.5], color: '#4d5154', soft: 0.2, opacity: 0.8 },
    ],
    markings: [
      ...bothSides({ art: { kind: 'text', text: '29', fill: '#1f3354', stroke: '#eef0f0', strokeW: 0.12 }, at: [7.3, -1.45, 1.42], size: [0.85, 0.58], from: 'left', depth: 0.5 }),
      ...bothSides({ art: { kind: 'red-star' }, at: [14.55, -1.68, 3.72], size: [0.8, 0.8], from: 'left', rollDeg: 6, depth: 0.3 }),
      { art: { kind: 'red-star' }, at: [11.0, -3.9, WING_WL], size: [1.25, 1.25], from: 'bottom', depth: 0.3 },
      { art: { kind: 'red-star' }, at: [11.0, 3.9, WING_WL], size: [1.25, 1.25], from: 'bottom', depth: 0.3 },
    ],
    panelLines: 0.26,
    roughness: 0.64,
    metalness: 0.1,
  },
};
