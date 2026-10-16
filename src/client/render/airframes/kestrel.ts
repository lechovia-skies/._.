import type { AirframeParts, Blueprint } from './airframe.ts';
import { canopy, intake, loft, nozzle, ring, rod, surface, withMirror } from './kit.ts';
import { bothSides } from './paint.ts';

/**
 * The Kestrel drawn as an F-16C Block 50 (revision 31): ogive radome with a short probe, the one-piece bubble
 * canopy, the chin intake under the cockpit, the blended strakes running into a cropped-delta wing (40° leading
 * edge, straight trailing edge), one fin, all-moving tailplanes with 10° anhedral, two ventral fins, and the F110
 * nozzle. Paint: the two-tone grey of the reference picture with a darker spine, "SW 547" on the fin (Shaw AFB).
 */
const L = 15;

function parts(): AirframeParts {
  const fuselage = loft(
    [
      ring(0.45, 2.06, 0.01, 0.01),
      ring(0.95, 2.08, 0.2, 0.2, 0.2),
      ring(1.6, 2.1, 0.36, 0.37, 0.35),
      ring(2.3, 2.12, 0.47, 0.47, 0.44, 2.1, 2.3),
      ring(3.1, 2.14, 0.55, 0.53, 0.5, 2.2, 2.5),
      ring(4.1, 2.12, 0.6, 0.55, 0.76, 2.3, 3),
      ring(5.2, 2.06, 0.66, 0.58, 1.0, 2.5, 3),
      ring(6.6, 2.02, 0.8, 0.62, 1.0, 2.6, 3),
      ring(8.2, 2.0, 0.86, 0.62, 0.98, 2.6, 3),
      ring(10, 2.0, 0.82, 0.62, 0.9, 2.5, 2.9),
      ring(11.6, 2.02, 0.7, 0.6, 0.7, 2.3, 2.6),
      ring(13.1, 2.03, 0.6, 0.55, 0.55, 2.1, 2.2),
      ring(14.5, 2.04, 0.53, 0.53, 0.53),
    ],
    { around: 36, capEnd: true },
  );
  // The chin intake and the duct that forms the belly back to the engine.
  const duct = intake({
    rings: [
      ring(3.95, 1.22, 0.52, 0.3, 0.3, 4, 2.4),
      ring(4.8, 1.28, 0.6, 0.4, 0.32, 4, 2.6),
      ring(5.8, 1.4, 0.62, 0.45, 0.36, 3.6, 2.8),
      ring(6.8, 1.5, 0.5, 0.35, 0.3, 3, 2.6),
    ],
    lip: 0.05,
    depth: 1.4,
    rake: { perWl: 0.35 },
  });
  // Strakes curving out of the fuselage into the wing; 40° leading edge, straight trailing edge.
  const wing = surface(
    [
      { s: 0, le: 3.5, te: 11.45, off: 2.02, t: 0.03 },
      { s: 0.5, le: 3.75, te: 11.45, off: 2.02, t: 0.03 },
      { s: 0.62, le: 4.6, te: 11.45, off: 2.02, t: 0.032 },
      { s: 0.78, le: 5.6, te: 11.45, off: 2.02, t: 0.035 },
      { s: 0.98, le: 6.5, te: 11.45, off: 2.02, t: 0.038 },
      { s: 1.2, le: 7.15, te: 11.45, off: 2.02, t: 0.04 },
      { s: 1.42, le: 7.6, te: 11.45, off: 2.02, t: 0.04 },
      { s: 4.62, le: 10.22, te: 11.47, off: 2.02, t: 0.04 },
    ],
    {},
  );
  const tailplane = surface(
    [
      { s: 0.35, le: 12.15, te: 14.62, off: 1.97, t: 0.045 },
      { s: 2.79, le: 14.1, te: 15.0, off: 1.97 - 2.44 * Math.tan((10 * Math.PI) / 180), t: 0.04 },
    ],
    {},
  );
  const fin = surface(
    [
      { s: 0, le: 10.55, te: 14.3, t: 0.05 },
      { s: 0.25, le: 10.85, te: 14.28, t: 0.05 },
      { s: 2.3, le: 13.15, te: 14.36, t: 0.045 },
    ],
    { placement: { kind: 'fin', bl: 0, wl: 2.55, cantDeg: 0 } },
  );
  // The fin root fairing (drag-chute housing on the Block 50s), and the ventral fins.
  const finRoot = loft(
    [ring(11.2, 2.62, 0.02, 0.02), ring(12.4, 2.68, 0.16, 0.14, 0.1), ring(14.2, 2.72, 0.2, 0.18, 0.14), ring(14.75, 2.72, 0.17, 0.15, 0.12)],
    { around: 16, capEnd: true },
  );
  const ventral = surface(
    [
      { s: 0, le: 11.2, te: 12.25, t: 0.06 },
      { s: 0.5, le: 11.6, te: 12.25, t: 0.06 },
    ],
    { placement: { kind: 'fin', bl: 0.42, wl: 1.5, cantDeg: 165 } },
  );
  const tipRails = rod(4.72, 2.02, 9.55, 11.5, 0.05, 0.05, 8);
  const probe = rod(0, 2.06, 0, 0.5, 0.012, 0.03, 8);
  const cockpit = canopy({
    rings: [
      ring(2.62, 2.64, 0.3, 0.02, 0.06),
      ring(3.0, 2.64, 0.39, 0.36, 0.06, 2.1),
      ring(3.5, 2.64, 0.43, 0.6, 0.06, 2.2),
      ring(4.05, 2.64, 0.43, 0.69, 0.06, 2.2),
      ring(4.7, 2.62, 0.41, 0.64, 0.06, 2.2),
      ring(5.2, 2.6, 0.36, 0.5, 0.06, 2.2),
      ring(5.7, 2.6, 0.25, 0.26, 0.06, 2.2),
      ring(6.3, 2.6, 0.1, 0.04, 0.05, 2.2),
    ],
    frames: [4.8],
    seats: [4.25],
  });
  const engine = nozzle({ fs0: 14.35, fs1: 15.0, bl: 0, wl: 2.04, r0: 0.53, r1: 0.47, petals: 16 });
  return {
    skin: [fuselage, duct.skin, ...withMirror(wing), ...withMirror(tailplane), fin, finRoot, ...withMirror(ventral)],
    dark: [duct.dark, cockpit.dark],
    glass: [cockpit.glass],
    trim: [...withMirror(tipRails), probe, ...cockpit.trim],
    crew: cockpit.crew,
    nozzles: [engine],
  };
}

const SKIN = '#878f96';
const SPINE = '#677078';
const LOW_VIS = '#4a5056';

export const KESTREL_AIRFRAME: Blueprint = {
  lengthM: L,
  datumWlM: 2.15,
  parts,
  gear: {
    nose: { fs: 4.85, wl: 1.05, r: 0.24, w: 0.15, rake: 0.05 },
    main: { fs: 8.4, bl: 1.18, wl: 1.15, r: 0.35, w: 0.22 },
  },
  stores: {
    hardpoints: [
      { fs: 10.55, bl: -4.86, wl: 2.02 },
      { fs: 10.55, bl: 4.86, wl: 2.02 },
      { fs: 9.85, bl: -3.95, wl: 1.97, pylon: true },
      { fs: 9.85, bl: 3.95, wl: 1.97, pylon: true },
      { fs: 9.35, bl: -3.0, wl: 1.97, pylon: true },
      { fs: 9.35, bl: 3.0, wl: 1.97, pylon: true },
      { fs: 8.7, bl: -2.0, wl: 1.97, pylon: true },
      { fs: 8.7, bl: 2.0, wl: 1.97, pylon: true },
    ],
    layout: { 'AIM-120D': [0, 1, 4, 5], 'AIM-120C': [0, 1, 4, 5], 'AIM-9X': [2, 3, 0, 1] },
    tanks: [6, 7],
  },
  canopyTint: 0xa8b8c4,
  helmet: 0x5f6a5a,
  paint: {
    colors: [SKIN, SPINE],
    underside: '#a9afb4',
    undersideAmount: 0.8,
    patches: [],
    soft: 0.3,
    warp: 0.3,
    zones: [
      // The darker grey along the top of the fuselage, and the radome.
      { from: [0.4, -0.5, 2.5], to: [14.8, 0.5, 3.6], color: SPINE, soft: 0.22 },
      { from: [-1, -1, 1], to: [2.15, 1, 3], color: '#4e555b', soft: 0.03 },
    ],
    markings: [
      ...bothSides({ art: { kind: 'text', text: 'SW', fill: '#3c4248' }, at: [13.35, 0, 3.75], size: [0.95, 0.55], from: 'left', depth: 0.3 }),
      ...bothSides({ art: { kind: 'text', text: '547', fill: '#3c4248' }, at: [13.55, 0, 3.27], size: [0.7, 0.3], from: 'left', depth: 0.3 }),
      ...bothSides({ art: { kind: 'us-star', color: LOW_VIS }, at: [6.3, -0.6, 1.45], size: [0.95, 0.46], from: 'left', depth: 0.5 }),
      { art: { kind: 'us-star', color: LOW_VIS }, at: [9.9, -3.1, 2.02], size: [1.3, 0.63], from: 'top', depth: 0.3 },
      { art: { kind: 'us-star', color: LOW_VIS }, at: [9.9, 3.1, 2.02], size: [1.3, 0.63], from: 'bottom', depth: 0.3 },
    ],
    panelLines: 0.32,
    roughness: 0.6,
    metalness: 0.12,
  },
};
