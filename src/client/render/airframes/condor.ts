import type { AirframeParts, Blueprint } from './airframe.ts';
import { canopy, intake, loft, nozzle, ring, surface, withMirror } from './kit.ts';
import { bothSides } from './paint.ts';

/**
 * The Condor drawn as an F-15C (revision 31): the long pointed radome, the high bubble canopy, big rectangular
 * intakes either side of the cockpit with raked faces, a wide flat body with the shoulder wing on top (45° leading
 * edge, cropped raked tips), twin upright fins and the dogtoothed tailplanes on booms outboard of the engines, and two
 * close-set nozzles. Paint: the darker grey of the reference picture, "LN 331" on the fins (RAF Lakenheath) with
 * the squadron band at the tips.
 */
const L = 19.4;

function parts(): AirframeParts {
  const nose = loft(
    [
      ring(0, 2.5, 0.01, 0.01),
      ring(0.8, 2.52, 0.28, 0.27, 0.27),
      ring(1.8, 2.55, 0.5, 0.5, 0.5),
      ring(2.6, 2.58, 0.6, 0.58, 0.6, 2.1, 2.3),
      ring(3.5, 2.6, 0.66, 0.46, 0.8, 2.3, 3),
      ring(4.6, 2.62, 0.7, 0.46, 0.9, 2.4, 3.3),
      ring(6.0, 2.66, 0.74, 0.52, 0.9, 2.5, 3.4),
      ring(7.5, 2.7, 0.76, 0.55, 0.85, 2.6, 3.4),
      ring(9.5, 2.75, 0.72, 0.52, 0.6, 2.6, 3.2),
      ring(11, 2.75, 0.6, 0.4, 0.4),
    ],
    { around: 36 },
  );
  // The wide body: intake trunks, engine bays and the deck between them.
  const body = loft(
    [
      ring(6.2, 2.62, 1.2, 0.3, 0.55, 4, 4),
      ring(8.0, 2.64, 1.5, 0.42, 0.72, 4.5, 4.5),
      ring(11.5, 2.64, 1.52, 0.42, 0.72, 4.5, 4.5),
      ring(14.5, 2.6, 1.45, 0.38, 0.62, 4, 4),
      ring(16.5, 2.55, 1.35, 0.32, 0.5, 3.6, 3.4),
      ring(17.8, 2.5, 1.22, 0.3, 0.42, 3.2, 3),
    ],
    { around: 40, capEnd: true },
  );
  const inlet = intake({
    rings: [
      ring(4.4, 2.55, 0.47, 0.64, 0.62, 6, 6, 1.08),
      ring(5.6, 2.57, 0.5, 0.64, 0.66, 6, 6, 1.1),
      ring(7.4, 2.6, 0.5, 0.58, 0.7, 5, 5, 1.08),
      ring(8.6, 2.6, 0.4, 0.4, 0.6, 4, 4, 1.0),
    ],
    lip: 0.06,
    depth: 1.6,
    rake: { perWl: -0.28 },
  });
  const engines = ([0.62, -0.62] as const).map((bl) =>
    loft([ring(15.5, 2.42, 0.62, 0.62, 0.62, 2.2, 2.2, bl), ring(17.6, 2.42, 0.62, 0.62, 0.62, 2.1, 2.1, bl), ring(18.05, 2.42, 0.6, 0.6, 0.6, 2, 2, bl)], {
      around: 28,
    }),
  );
  const boom = loft(
    [ring(12.8, 2.66, 0.05, 0.08, 0.05, 2, 2, 1.62), ring(14.2, 2.66, 0.2, 0.28, 0.22, 2.6, 2.4, 1.62), ring(18.6, 2.66, 0.2, 0.26, 0.22, 2.6, 2.4, 1.62), ring(19.35, 2.66, 0.12, 0.12, 0.1, 2, 2, 1.62)],
    { around: 16, capEnd: true },
  );
  const wing = surface(
    [
      { s: 0.4, le: 7.4, te: 14.25, off: 2.98, t: 0.055 },
      { s: 1.55, le: 8.55, te: 14.25, off: 2.98, t: 0.055 },
      { s: 5.95, le: 12.95, te: 15.3, off: 2.9, t: 0.035 },
      { s: 6.52, le: 14.15, te: 15.42, off: 2.89, t: 0.03 },
    ],
    {},
  );
  const tailplane = surface(
    [
      { s: 1.55, le: 15.3, te: 18.55, off: 2.6, t: 0.045 },
      { s: 2.55, le: 16.5, te: 18.82, off: 2.6, t: 0.042 },
      { s: 2.56, le: 16.3, te: 18.82, off: 2.6, t: 0.042 },
      { s: 4.3, le: 18.45, te: 19.4, off: 2.6, t: 0.035 },
    ],
    {},
  );
  const fin = surface(
    [
      { s: 0, le: 14.35, te: 18.1, t: 0.05 },
      { s: 2.45, le: 16.3, te: 17.85, t: 0.04 },
      { s: 2.72, le: 16.55, te: 17.7, t: 0.04 },
    ],
    { placement: { kind: 'fin', bl: 1.64, wl: 2.88, cantDeg: 0 } },
  );
  const cockpit = canopy({
    rings: [
      ring(3.15, 3.06, 0.4, 0.02, 0.07),
      ring(3.6, 3.06, 0.5, 0.46, 0.07, 2.2),
      ring(4.3, 3.06, 0.54, 0.78, 0.07, 2.2),
      ring(5.0, 3.06, 0.54, 0.86, 0.07, 2.2),
      ring(5.8, 3.08, 0.51, 0.76, 0.07, 2.2),
      ring(6.5, 3.12, 0.42, 0.48, 0.07, 2.2),
      ring(7.2, 3.15, 0.22, 0.12, 0.06, 2.2),
    ],
    frames: [3.72],
    seats: [5.05],
  });
  const exits = ([0.62, -0.62] as const).map((bl) => nozzle({ fs0: 17.95, fs1: 19.0, bl, wl: 2.42, r0: 0.6, r1: 0.5, petals: 16 }));
  return {
    skin: [nose, body, ...withMirror(inlet.skin), ...engines, ...withMirror(boom), ...withMirror(wing), ...withMirror(tailplane), ...withMirror(fin)],
    dark: [...withMirror(inlet.dark), cockpit.dark],
    glass: [cockpit.glass],
    trim: cockpit.trim,
    crew: cockpit.crew,
    nozzles: exits,
  };
}

const SKIN = '#7e868d';
const LOW_VIS = '#454b51';

export const CONDOR_AIRFRAME: Blueprint = {
  lengthM: L,
  datumWlM: 2.6,
  parts,
  gear: {
    nose: { fs: 4.7, wl: 1.78, r: 0.29, w: 0.17 },
    main: { fs: 11.7, bl: 1.37, wl: 1.95, r: 0.43, w: 0.25 },
  },
  stores: {
    hardpoints: [
      { fs: 12.0, bl: -3.47, wl: 2.58 },
      { fs: 12.0, bl: 3.47, wl: 2.58 },
      { fs: 12.0, bl: -2.93, wl: 2.58 },
      { fs: 12.0, bl: 2.93, wl: 2.58 },
      { fs: 8.9, bl: -1.38, wl: 1.84 },
      { fs: 8.9, bl: 1.38, wl: 1.84 },
      { fs: 13.3, bl: -1.38, wl: 1.84 },
      { fs: 13.3, bl: 1.38, wl: 1.84 },
      { fs: 12.0, bl: -3.2, wl: 2.92, pylon: true },
      { fs: 12.0, bl: 3.2, wl: 2.92, pylon: true },
    ],
    layout: { 'AIM-9X': [0, 1, 2, 3], 'AIM-120D': [4, 5, 6, 7], 'AIM-120C': [4, 5, 6, 7] },
    pylons: [8, 9],
  },
  canopyTint: 0xa8b8c4,
  helmet: 0x5f6a5a,
  paint: {
    colors: [SKIN, '#6d757c'],
    underside: '#8e959b',
    undersideAmount: 0.5,
    patches: [],
    soft: 0.3,
    warp: 0.3,
    zones: [
      // Bare titanium around the engines, and the squadron band across the fin tips.
      { from: [17.2, -1.4, 1.5], to: [19.5, 1.4, 3.3], color: '#55585a', soft: 0.18, opacity: 0.85 },
      { from: [16, -2, 5.32], to: [18.5, 2, 5.42], color: '#c9a227', soft: 0.01 },
      { from: [16, -2, 5.42], to: [18.5, 2, 5.5], color: '#22262a', soft: 0.01 },
    ],
    markings: [
      ...bothSides({ art: { kind: 'text', text: 'LN', fill: '#1f2327' }, at: [16.75, -1.64, 4.75], size: [1.05, 0.62], from: 'left', depth: 0.3 }),
      ...bothSides({ art: { kind: 'text', text: '331', fill: '#1f2327' }, at: [16.95, -1.64, 4.15], size: [0.85, 0.36], from: 'left', depth: 0.3 }),
      ...bothSides({ art: { kind: 'us-star', color: LOW_VIS }, at: [9.2, -1.6, 2.5], size: [1.25, 0.6], from: 'left', depth: 0.4 }),
      { art: { kind: 'us-star', color: LOW_VIS }, at: [12.6, -4.3, 2.95], size: [1.6, 0.78], from: 'top', depth: 0.3 },
      { art: { kind: 'us-star', color: LOW_VIS }, at: [12.6, 4.3, 2.95], size: [1.6, 0.78], from: 'bottom', depth: 0.3 },
    ],
    panelLines: 0.3,
    roughness: 0.62,
    metalness: 0.12,
  },
};
