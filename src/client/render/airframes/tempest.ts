import type { AirframeParts, Blueprint } from './airframe.ts';
import { canopy, intake, loft, nozzle, ring, surface, withMirror } from './kit.ts';
import { bothSides, camoPatches } from './paint.ts';

/**
 * The Tempest drawn as an F-22A (revision 31): the chined nose, the long frameless gold canopy, caret intakes with
 * swept lips either side of the cockpit, a wide flat body, the 42° diamond wing with its forward-swept trailing edge,
 * big tailplanes, fins canted out 28°, and the two flat thrust-vectoring nozzles. Paint: the light grey with darker
 * mottling of the reference picture and "FF" on the fins (Langley, the 1st Fighter Wing).
 */
const L = 18.9;
const WING_WL = 2.3;

function parts(): AirframeParts {
  const nose = loft(
    [
      ring(0, 2.22, 0.01, 0.01, 0.01),
      ring(0.8, 2.22, 0.32, 0.22, 0.2, 2.1, 1.5),
      ring(1.8, 2.26, 0.6, 0.4, 0.38, 2.2, 1.55),
      ring(3.0, 2.32, 0.8, 0.52, 0.55, 2.3, 1.7),
      ring(4.3, 2.36, 0.86, 0.54, 0.7, 2.5, 2.1),
      ring(5.6, 2.36, 0.86, 0.52, 0.82, 2.8, 2.6),
      ring(7.0, 2.34, 0.86, 0.48, 0.88, 3, 3),
      ring(8.5, 2.32, 0.86, 0.46, 0.86, 3, 3),
    ],
    { around: 40 },
  );
  const body = loft(
    [
      ring(6.9, 2.3, 1.2, 0.4, 0.7, 3, 3),
      ring(8.3, 2.3, 1.9, 0.47, 0.88, 3.4, 3.6),
      ring(10, 2.3, 1.98, 0.48, 0.86, 3.4, 3.6),
      ring(12.5, 2.3, 1.94, 0.45, 0.78, 3.4, 3.6),
      ring(14.8, 2.3, 1.78, 0.4, 0.62, 3.4, 3.4),
      ring(16.6, 2.3, 1.48, 0.34, 0.5, 3.2, 3.2),
      ring(17.6, 2.3, 1.28, 0.3, 0.42, 3, 3),
    ],
    { around: 44, capEnd: true },
  );
  // The dorsal ridge between the intakes, behind the canopy.
  const spine = loft(
    [ring(6.6, 2.75, 0.3, 0.05, 0.05), ring(7.6, 2.72, 0.62, 0.22, 0.1, 2.4, 2), ring(11, 2.72, 0.66, 0.2, 0.1, 2.4, 2), ring(15, 2.68, 0.5, 0.06, 0.06)],
    { around: 20 },
  );
  const inlet = intake({
    rings: [
      ring(5.2, 1.96, 0.42, 0.62, 0.6, 8, 8, 1.26, -0.28),
      ring(6.4, 1.98, 0.48, 0.66, 0.64, 7, 7, 1.3, -0.26),
      ring(8.4, 2.04, 0.5, 0.6, 0.66, 5, 5, 1.3, -0.2),
      ring(10, 2.12, 0.35, 0.36, 0.45, 3, 3, 1.1),
    ],
    lip: 0.05,
    depth: 1.5,
    rake: { perWl: -0.35, perBl: 0.55 },
  });
  const wing = surface(
    [
      { s: 0.8, le: 6.2, te: 14.7, off: WING_WL, t: 0.045 },
      { s: 1.9, le: 7.2, te: 14.7, off: WING_WL, t: 0.045 },
      { s: 6.8, le: 11.6, te: 13.2, off: WING_WL - 0.17, t: 0.03 },
    ],
    {},
  );
  const tailplane = surface(
    [
      { s: 1.3, le: 14.7, te: 18.9, off: 2.18, t: 0.035 },
      { s: 4.42, le: 17.5, te: 17.95, off: 2.18, t: 0.03 },
    ],
    {},
  );
  const fin = surface(
    [
      { s: 0, le: 13.3, te: 17.15, t: 0.045 },
      { s: 2.95, le: 15.25, te: 16.6, t: 0.035 },
    ],
    { placement: { kind: 'fin', bl: 1.72, wl: 2.6, cantDeg: 28 } },
  );
  const boom = loft(
    [ring(13.5, 2.22, 0.05, 0.08, 0.05, 2, 2, 1.55), ring(14.8, 2.22, 0.22, 0.22, 0.2, 3, 3, 1.55), ring(17.9, 2.22, 0.2, 0.18, 0.18, 3, 3, 1.55), ring(18.4, 2.22, 0.1, 0.08, 0.08, 2, 2, 1.55)],
    { around: 16, capEnd: true },
  );
  const cockpit = canopy({
    rings: [
      ring(3.0, 2.84, 0.36, 0.02, 0.08),
      ring(3.6, 2.84, 0.5, 0.36, 0.08, 2.2),
      ring(4.5, 2.84, 0.56, 0.64, 0.08, 2.2),
      ring(5.4, 2.84, 0.56, 0.7, 0.08, 2.2),
      ring(6.3, 2.84, 0.52, 0.6, 0.08, 2.2),
      ring(7.1, 2.84, 0.4, 0.34, 0.08, 2.2),
      ring(7.8, 2.84, 0.22, 0.1, 0.06, 2.2),
    ],
    frames: [],
    seats: [5.3],
  });
  const exits = ([0.66, -0.66] as const).map((bl) =>
    nozzle({ fs0: 17.2, fs1: 18.2, bl, wl: 2.22, r0: 0.5, r1: 0.4, box: { w0: 0.6, h0: 0.46, w1: 0.56, h1: 0.3 } }),
  );
  return {
    skin: [nose, body, spine, ...withMirror(inlet.skin), ...withMirror(wing), ...withMirror(tailplane), ...withMirror(fin), ...withMirror(boom)],
    dark: [...withMirror(inlet.dark)],
    tub: [cockpit.dark],
    glass: [cockpit.glass],
    trim: cockpit.trim,
    crew: cockpit.crew,
    nozzles: exits,
  };
}

const LOW_VIS = '#5c6269';

export const TEMPEST_AIRFRAME: Blueprint = {
  lengthM: L,
  datumWlM: WING_WL,
  parts,
  gear: {
    nose: { fs: 4.9, wl: 1.5, r: 0.3, w: 0.17 },
    main: { fs: 11.4, bl: 1.62, wl: 1.5, r: 0.47, w: 0.29 },
  },
  canopyTint: 0xc9a54e,
  helmet: 0x5f6a5a,
  paint: {
    colors: ['#8e949a', '#737a81', '#80878d'],
    underside: '#8b9096',
    undersideAmount: 0.3,
    patches: camoPatches({ seed: 0x22a, count: 22, from: [2, -6.5, 1.2], to: [19, 6.5, 4.8], size: [1.4, 3.2], weights: [0.6, 0.4] }),
    soft: 0.3,
    warp: 0.6,
    zones: [],
    markings: [
      ...bothSides({ art: { kind: 'text', text: 'FF', fill: '#3d4248' }, at: [15.55, -2.45, 3.9], size: [0.95, 0.55], from: 'left', rollDeg: 28, depth: 0.35 }),
      ...bothSides({ art: { kind: 'text', text: 'AF 05', fill: '#4a5056' }, at: [15.75, -2.2, 3.4], size: [0.75, 0.22], from: 'left', rollDeg: 28, depth: 0.35 }),
      ...bothSides({ art: { kind: 'us-star', color: LOW_VIS }, at: [15.2, -1.75, 2.1], size: [0.8, 0.39], from: 'left', depth: 0.4 }),
      { art: { kind: 'us-star', color: LOW_VIS }, at: [11.6, -4.6, WING_WL], size: [1.3, 0.63], from: 'top', depth: 0.3 },
      { art: { kind: 'us-star', color: LOW_VIS }, at: [11.6, 4.6, WING_WL], size: [1.3, 0.63], from: 'bottom', depth: 0.3 },
    ],
    panelLines: 0.2,
    roughness: 0.42,
    metalness: 0.35,
  },
};
