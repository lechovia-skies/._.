import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';
import { DEG } from '../../../shared/math/units.ts';

/**
 * The kit the real-type airframes are drawn with (revision 31). Parts are laid out in the coordinates of a three-view
 * drawing, in metres: `fs` aft from the nose tip, `bl` right of the centreline, `wl` up from the ground with the jet
 * on its wheels. The airframe builder moves the finished geometry into the body frame (nose toward -z).
 */

/** One cross-section of a lofted part: a superellipse with its own upper and lower halves. */
export interface Ring {
  fs: number;
  /** centre */
  bl: number;
  wl: number;
  /** half-width */
  w: number;
  /** height of the upper half and depth of the lower half */
  up: number;
  down: number;
  /** superellipse exponents: 2 is round, higher is boxier, below 2 pinches toward a chine or keel */
  nUp: number;
  nDown: number;
  /** sideways lean of the section per metre of height (a part whose walls slope, like the F-22's intakes) */
  tilt: number;
}

export function ring(fs: number, wl: number, w: number, up: number, down = up, nUp = 2, nDown = nUp, bl = 0, tilt = 0): Ring {
  return { fs, bl, wl, w, up, down, nUp, nDown, tilt };
}

/** Monotone cubic interpolation (Fritsch–Carlson): smooth, and never overshoots between the given values. */
export function monotoneSpline(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const RING_KEYS = ['bl', 'wl', 'w', 'up', 'down', 'nUp', 'nDown', 'tilt'] as const;

/** A ring anywhere along a lofted part, smoothly between its key rings. */
export function ringSampler(keys: readonly Ring[]): (fs: number) => Ring {
  const xs = keys.map((r) => r.fs);
  const fns = RING_KEYS.map((k) => monotoneSpline(xs, keys.map((r) => r[k])));
  return (fs: number) => {
    const r = { fs } as Ring;
    RING_KEYS.forEach((k, i) => (r[k] = fns[i](fs)));
    return r;
  };
}

/** The key rings plus enough rings between them that no gap exceeds `step` metres. */
export function resample(keys: readonly Ring[], step: number): Ring[] {
  const at = ringSampler(keys);
  const out: Ring[] = [keys[0]];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1].fs;
    const b = keys[i].fs;
    const n = Math.max(1, Math.ceil((b - a) / step));
    for (let k = 1; k < n; k++) out.push(at(a + ((b - a) * k) / n));
    out.push(keys[i]);
  }
  return out;
}

const superPow = (c: number, n: number) => Math.sign(c) * Math.abs(c) ** (2 / n);

/** A point on a ring at angle `a` (0 = right side, π/2 = top), in drawing coordinates. */
export function ringPoint(r: Ring, a: number): [bl: number, wl: number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const upper = s >= 0;
  const n = upper ? r.nUp : r.nDown;
  const dy = (upper ? r.up : r.down) * superPow(s, n);
  return [r.bl + r.w * superPow(c, n) + r.tilt * dy, r.wl + dy];
}

export interface LoftOptions {
  /** points around each ring */
  around?: number;
  /** the longest gap between rings, in metres */
  step?: number;
  /** close the front or back with a flat cap */
  capStart?: boolean;
  capEnd?: boolean;
  /** slants the first ring (an intake lip): fs moves this far aft per metre above and per metre outboard of its centre */
  rake?: { perWl?: number; perBl?: number };
  /** only part of the way around, from and to these angles (radians, 0 = right side, π/2 = top) */
  arc?: [from: number, to: number];
  /** grows every ring by this many metres all round (canopy frames sit just proud of the glass) */
  grow?: number;
}

/** Mirror copy of a part across the centreline, wound so its faces still point outward. */
export function mirrored(g: BufferGeometry): BufferGeometry {
  const m = g.clone();
  const p = m.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const index = m.getIndex();
  if (index) {
    const a = index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
  }
  m.computeVertexNormals();
  return m;
}

/** The part plus its mirror copy. */
export function withMirror(g: BufferGeometry): BufferGeometry[] {
  return [g, mirrored(g)];
}

function finish(pos: number[], index: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Averages the normals of coincident seam vertices, so a closed loft shows no line where it is joined. */
function weldSeam(g: BufferGeometry, rows: number, row: number): void {
  const n = g.getAttribute('normal');
  for (let i = 0; i < rows; i++) {
    const a = i * row;
    const b = a + row - 1;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
}

/**
 * A smooth body through key rings (front to back, fs increasing): fuselages, nacelles, intakes, booms, canopies.
 * Rings are added between the keys so the surface curves smoothly from one to the next.
 */
export function loft(keys: readonly Ring[], opts: LoftOptions = {}): BufferGeometry {
  const around = opts.around ?? 32;
  const rings = resample(keys, opts.step ?? 0.35);
  const [from, to] = opts.arc ?? [-Math.PI / 2, (3 * Math.PI) / 2];
  const closed = !opts.arc;
  const grow = opts.grow ?? 0;
  const pos: number[] = [];
  const index: number[] = [];
  rings.forEach((r0, i) => {
    const r = grow ? { ...r0, w: r0.w + grow, up: r0.up + grow, down: r0.down + grow } : r0;
    for (let j = 0; j <= around; j++) {
      const a = from + ((to - from) * j) / around;
      const [x, y] = ringPoint(r, a);
      let fs = r.fs;
      if (i === 0 && opts.rake) fs += (opts.rake.perWl ?? 0) * (y - r.wl) + (opts.rake.perBl ?? 0) * (x - r.bl);
      pos.push(x, y, fs);
    }
  });
  const row = around + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * row + j;
      const b = a + row;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const caps: [ringIndex: number, front: boolean][] = [];
  if (opts.capStart) caps.push([0, true]);
  if (opts.capEnd) caps.push([rings.length - 1, false]);
  for (const [i, front] of caps) {
    const r = rings[i];
    const centre = pos.length / 3;
    let fs = 0;
    for (let j = 0; j < around; j++) fs += pos[(i * row + j) * 3 + 2];
    pos.push(r.bl, r.wl, fs / around);
    // The cap gets its own copy of the rim so its normals stay flat.
    const rim = pos.length / 3;
    for (let j = 0; j <= around; j++) pos.push(pos[(i * row + j) * 3], pos[(i * row + j) * 3 + 1], pos[(i * row + j) * 3 + 2]);
    for (let j = 0; j < around; j++) {
      if (front) index.push(centre, rim + j, rim + j + 1);
      else index.push(centre, rim + j + 1, rim + j);
    }
  }
  const g = finish(pos, index);
  if (closed) weldSeam(g, rings.length, row);
  return g;
}

/** One span station of a lifting surface. */
export interface Station {
  /** distance along the span from the surface's root line */
  s: number;
  /** leading and trailing edge, as fs */
  le: number;
  te: number;
  /** offset of the chord plane: the wl of a wing station (dihedral, droop), or a fin's sideways offset */
  off?: number;
  /** thickness as a fraction of the chord */
  t?: number;
}

/** Where a surface's span runs: flat like a wing (span = bl), or up a fin from a root point at a cant angle. */
export type SurfacePlacement =
  | { kind: 'wing' }
  /** `cantDeg` leans the fin outward (away from the centreline) from vertical; above 90° it hangs below (ventrals, pylons) */
  | { kind: 'fin'; bl: number; wl: number; cantDeg: number };

export interface SurfaceOptions {
  placement?: SurfacePlacement;
  /** default thickness/chord for stations that give none */
  t?: number;
  capRoot?: boolean;
  /** a blunt, flat-sided section (pylons, launch rails) instead of an airfoil */
  slab?: boolean;
}

const CHORD = [1, 0.85, 0.7, 0.55, 0.4, 0.27, 0.16, 0.08, 0.03, 0.008, 0];
/** Half thickness of a symmetric NACA four-digit section of thickness 1, at chord fraction c. */
const naca = (c: number) => 5 * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1036 * c ** 4);
const slabShape = (c: number) => (c < 0.05 || c > 0.95 ? 0.35 : 0.5);

/**
 * A lifting surface through span stations (root first): rounded leading edge, sharp trailing edge, a closed tip. The
 * planform between stations is straight, as on the real wings; add stations for kinks, LERX curves or raked tips.
 */
export function surface(stations: readonly Station[], opts: SurfaceOptions = {}): BufferGeometry {
  const place = opts.placement ?? { kind: 'wing' };
  const t0 = opts.t ?? 0.05;
  const shape = opts.slab ? slabShape : naca;
  // Each station's ring runs from the upper trailing edge forward to the leading edge and back under to the trailing
  // edge, so the leading edge is shared (smooth) and the trailing edge is doubled (sharp).
  const chordPts = [...CHORD, ...CHORD.slice(0, -1).reverse()];
  const k = chordPts.length;
  const lower = CHORD.length;
  const pos: number[] = [];
  const index: number[] = [];
  let sinC = 0;
  let cosC = 1;
  if (place.kind === 'fin') {
    sinC = Math.sin(place.cantDeg * DEG);
    cosC = Math.cos(place.cantDeg * DEG);
  }
  const put = (s: number, h: number, fs: number) => {
    if (place.kind === 'wing') pos.push(s, h, fs);
    // Span up the fin at the cant; thickness at right angles (toward the centreline for positive h).
    else pos.push(place.bl + s * sinC - h * cosC, place.wl + s * cosC + h * sinC, fs);
  };
  for (const st of stations) {
    const chord = st.te - st.le;
    const t = st.t ?? t0;
    for (let j = 0; j < k; j++) {
      const c = chordPts[j];
      const half = shape(c) * t * chord * (j < lower ? 1 : -1);
      put(st.s, (st.off ?? 0) + half, st.le + c * chord);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < k - 1; j++) {
      const a = i * k + j;
      const b = a + 1;
      const c = a + k;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const cap = (i: number, tip: boolean) => {
    const rim = pos.length / 3;
    for (let j = 0; j < k; j++) pos.push(pos[(i * k + j) * 3], pos[(i * k + j) * 3 + 1], pos[(i * k + j) * 3 + 2]);
    // Fan from the leading edge point; pairs of upper and lower points close the section.
    for (let j = 0; j < lower - 1; j++) {
      const up0 = rim + j;
      const up1 = rim + j + 1;
      const lo0 = rim + (k - 1 - j);
      const lo1 = rim + (k - 2 - j);
      if (tip) index.push(up0, lo0, up1, up1, lo0, lo1);
      else index.push(up0, up1, lo0, up1, lo1, lo0);
    }
  };
  cap(stations.length - 1, true);
  if (opts.capRoot) cap(0, false);
  return finish(pos, index);
}

export interface NozzleSpec {
  /** where the nozzle starts (inside the engine fairing) and its exit */
  fs0: number;
  fs1: number;
  bl: number;
  wl: number;
  r0: number;
  r1: number;
  /** turkey feathers: this many petals around the exit (0 for a smooth shroud) */
  petals?: number;
  /** a two-dimensional nozzle (F-22): half-width and half-height at the start and exit, instead of radii */
  box?: { w0: number; h0: number; w1: number; h1: number };
}

export interface NozzleParts {
  metal: BufferGeometry;
  dark: BufferGeometry;
  /** exit centre in drawing coordinates, and the flame radius */
  exit: [bl: number, wl: number, fs: number];
  radius: number;
}

/** A nozzle: metal shroud (with petals), a lip, and a dark cavity with the burner face deep inside. */
export function nozzle(n: NozzleSpec): NozzleParts {
  const around = n.box ? 24 : Math.max(24, (n.petals ?? 0) * 2);
  const shroud = n.box
    ? [ring(n.fs0, n.wl, n.box.w0, n.box.h0, n.box.h0, 5, 5, n.bl), ring(n.fs1, n.wl, n.box.w1, n.box.h1, n.box.h1, 5, 5, n.bl)]
    : [ring(n.fs0, n.wl, n.r0, n.r0, n.r0, 2, 2, n.bl), ring(n.fs1, n.wl, n.r1, n.r1, n.r1, 2, 2, n.bl)];
  const metal = loft(shroud, { around, step: 0.25 });
  if (n.petals && !n.box) {
    // Notch every other point at the exit so the petals read.
    const p = metal.getAttribute('position');
    const row = around + 1;
    const last = p.count / row - 1;
    for (let j = 0; j <= around; j += 2) {
      const i = last * row + j;
      const x = p.getX(i) - n.bl;
      const y = p.getY(i) - n.wl;
      p.setXYZ(i, n.bl + x * 0.96, n.wl + y * 0.96, p.getZ(i) - 0.04);
    }
    metal.computeVertexNormals();
  }
  const lipIn = 0.93;
  const exitRing = shroud[1];
  const inner = { ...exitRing, w: exitRing.w * lipIn, up: exitRing.up * lipIn, down: exitRing.down * lipIn };
  const lip = loft([{ ...exitRing, fs: n.fs1 }, { ...inner, fs: n.fs1 + 0.001 }], { around, step: 1 });
  const depth = Math.min(1.2, (n.fs1 - n.fs0) * 0.9);
  const cavity = loft(
    [
      { ...inner, fs: n.fs1 - depth, w: inner.w * 0.8, up: inner.up * 0.8, down: inner.down * 0.8 },
      { ...inner, fs: n.fs1 },
    ],
    { around, step: 0.4, capStart: true },
  );
  // The cavity faces inward: flip it.
  flip(cavity);
  return {
    metal: merge([metal, lip]),
    dark: cavity,
    exit: [n.bl, n.wl, n.fs1],
    radius: n.box ? Math.min(n.box.w1, n.box.h1) * 1.1 : n.r1 * 0.92,
  };
}

/** Reverses every triangle (and so the normals). */
export function flip(g: BufferGeometry): BufferGeometry {
  const index = g.getIndex();
  if (index) {
    const a = index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
  }
  g.computeVertexNormals();
  return g;
}

export interface IntakeSpec {
  /** the duct's outer skin, from the lip aft (it can end inside the fuselage) */
  rings: readonly Ring[];
  /** lip thickness, metres */
  lip: number;
  /** how deep the dark duct shows before it ends at the engine face */
  depth: number;
  rake?: LoftOptions['rake'];
  around?: number;
}

/** An open intake: the outer skin, a thin lip and a dark duct going in. */
export function intake(spec: IntakeSpec): { skin: BufferGeometry; dark: BufferGeometry } {
  const around = spec.around ?? 28;
  const outer = loft(spec.rings, { around, rake: spec.rake, step: 0.3 });
  const r0 = spec.rings[0];
  const k = (v: number) => Math.max(0.01, v - spec.lip);
  const inner0 = { ...r0, w: k(r0.w), up: k(r0.up), down: k(r0.down) };
  // Inner edge first, so the lip faces forward; the outer edge gets the same rake.
  const lip = loft([inner0, { ...r0, fs: r0.fs + 0.002 }], { around, rake: spec.rake, step: 1 });
  rakeRing(lip, around, 1, r0, spec.rake);
  const duct = loft([inner0, { ...inner0, fs: r0.fs + spec.depth, w: inner0.w * 0.9, up: inner0.up * 0.9, down: inner0.down * 0.9 }], {
    around,
    rake: spec.rake,
    step: 0.5,
    capEnd: true,
  });
  flip(duct);
  return { skin: merge([outer, lip]), dark: duct };
}

function rakeRing(g: BufferGeometry, around: number, ringIndex: number, r: Ring, rake: LoftOptions['rake']): void {
  if (!rake) return;
  const p = g.getAttribute('position');
  const row = around + 1;
  for (let j = 0; j <= around; j++) {
    const i = ringIndex * row + j;
    p.setZ(i, p.getZ(i) + (rake.perWl ?? 0) * (p.getY(i) - r.wl) + (rake.perBl ?? 0) * (p.getX(i) - r.bl));
  }
  g.computeVertexNormals();
}

export interface CanopySpec {
  /** the glass, front to back, each ring centred on the sill (its `down` tucks under the sill) */
  rings: readonly Ring[];
  /** frame bows across the glass, as fs */
  frames: readonly number[];
  /** helmet centres, as fs, one per seat */
  seats: readonly number[];
  /** helmet height above the sill */
  headUp?: number;
}

/** A canopy: glass, frame bows just proud of it, a dark cockpit below the coaming and a helmet per seat. */
export function canopy(spec: CanopySpec): { glass: BufferGeometry; trim: BufferGeometry[]; dark: BufferGeometry; crew: BufferGeometry[] } {
  const glass = loft(spec.rings, { around: 36, step: 0.2 });
  const at = ringSampler(spec.rings);
  const trim = spec.frames.map((fs) => loft([at(fs - 0.045), at(fs + 0.045)], { around: 36, step: 1, grow: 0.018, arc: [-0.08, Math.PI + 0.08] }));
  const first = spec.rings[0].fs;
  const last = spec.rings[spec.rings.length - 1].fs;
  const tub = loft(
    spec.rings.map((r) => ({ ...r, w: r.w * 0.94, up: Math.min(r.up, 0.16), down: r.down })),
    { around: 24, step: 0.3, capStart: true, capEnd: true },
  );
  const crew = spec.seats.map((fs) => {
    const sill = at(Math.min(last, Math.max(first, fs)));
    return ball(sill.bl, sill.wl + (spec.headUp ?? 0.48), fs, 0.15, 14);
  });
  return { glass, trim, dark: tub, crew };
}

/** A sphere (IRST ball, helmet). */
export function ball(bl: number, wl: number, fs: number, r: number, segments = 16): BufferGeometry {
  const keys: Ring[] = [];
  const rows = segments / 2;
  for (let i = 0; i <= rows; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / rows;
    const rr = Math.max(0.0005, r * Math.cos(a));
    keys.push(ring(fs + r * Math.sin(a), wl, rr, rr, rr, 2, 2, bl));
  }
  return loft(keys, { around: segments, step: 10 });
}

/** A round rod from one point to another along fs (probes, rails, missile bodies), tapering from r0 to r1. */
export function rod(bl: number, wl: number, fs0: number, fs1: number, r0: number, r1 = r0, around = 10): BufferGeometry {
  return loft([ring(fs0, wl, r0, r0, r0, 2, 2, bl), ring(fs1, wl, r1, r1, r1, 2, 2, bl)], { around, step: 100, capStart: true, capEnd: true });
}

/** Joins geometries (all indexed, position and normal only) into one. */
export function merge(parts: readonly BufferGeometry[]): BufferGeometry {
  let count = 0;
  let indices = 0;
  for (const g of parts) {
    count += g.getAttribute('position').count;
    indices += g.getIndex()?.count ?? 0;
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const index = new Uint32Array(indices);
  let v = 0;
  let k = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], (v + i) * 3);
      nor.set([n.getX(i), n.getY(i), n.getZ(i)], (v + i) * 3);
    }
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) index[k++] = ix.getX(i) + v;
    v += p.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  out.setIndex(new BufferAttribute(index, 1));
  return out;
}
