import type { Airfield, MapFeatures, River, Road, Settlement } from '../../../map/features.ts';
import { AIRFIELD_GROUND_HALF_WIDTH_M, AIRFIELD_GROUND_OVERRUN_M, airfieldLocal, airfieldWorld } from '../../../map/features.ts';
import { COVER_CODE } from '../../../map/land-cover.ts';
import { createNoise2D, fbm2D, type Noise2D } from '../../../math/noise.ts';
import { Rng } from '../../../math/rng.ts';
import { clamp, DEG, lerp, smoothstep } from '../../../math/units.ts';
import { CITY_NAMES, villageName } from './names.ts';
import { RoadRouter } from './roads.ts';

export const LECHOVIA_SIZE_M = 200000;
export const LECHOVIA_RESOLUTION = 2049;
const N = LECHOVIA_RESOLUTION;
const CELL = LECHOVIA_SIZE_M / (N - 1);
const ORIGIN = -LECHOVIA_SIZE_M / 2;
const KM = 1000;

/** Everything the generator makes; plain data, so a Web Worker can hand it to the page. */
export interface LechoviaData {
  seed: number;
  heights: Float32Array;
  /** land cover per grid sample, as COVER_CODE bytes */
  cover: Uint8Array;
  features: MapFeatures;
}

const UNSET = 255;
const C = COVER_CODE;

// ---------------------------------------------------------------- layout (km, x east, z south; north is -z)

/** The coast runs east–west about 80 km north of the centre. */
const COAST_Z = -80;
/** A lagoon behind a sand spit in the north-east, with one inlet. */
const LAGOON = { x0: 18, x1: 62, depthKm: 7, spitKm: 0.6, inletX: 53 };
/** The great river from the southern mountains through the capital to the sea, and the western river. */
const RIVER_COURSES: readonly { name: string; halfWidth: [number, number]; points: [number, number][] }[] = [
  {
    name: 'Lechna',
    halfWidth: [120, 230],
    points: [[12, 90], [18, 70], [22, 52], [12, 34], [2, 18], [-4, 4], [-2, -14], [6, -30], [14, -46], [10, -62], [12, -74], [12, -88]],
  },
  {
    name: 'Odrawa',
    halfWidth: [90, 160],
    points: [[-72, 92], [-78, 70], [-70, 50], [-82, 28], [-86, 5], [-78, -20], [-72, -42], [-66, -62], [-64, -88]],
  },
];
const CITIES: readonly { name: (typeof CITY_NAMES)[number]; x: number; z: number; r: number; capital?: boolean }[] = [
  { name: 'Lechów', x: -3, z: 5, r: 5.5, capital: true },
  { name: 'Morzysko', x: 4, z: -75.5, r: 3.5 },
  { name: 'Odrzyn', x: -82, z: 15, r: 3.5 },
  { name: 'Skalnik', x: 16, z: 61, r: 3 },
  { name: 'Pojezierz', x: 56, z: -44, r: 3 },
];
const AIRFIELDS: readonly Omit<Airfield, 'elevationM'>[] = [
  { id: 'wilkowo', name: 'Wilkowo Air Base', team: 'usa', x: -58000, z: -4000, headingRad: 90 * DEG, lengthM: 3000, widthM: 45 },
  { id: 'sokolica', name: 'Sokolica Air Base', team: 'russia', x: 58000, z: 6000, headingRad: 270 * DEG, lengthM: 3000, widthM: 45 },
  { id: 'morzysko', name: 'Morzysko Airfield', team: null, x: -30000, z: -62000, headingRad: 110 * DEG, lengthM: 2600, widthM: 45 },
  { id: 'skalnik', name: 'Skalnik Airfield', team: null, x: 34000, z: 42000, headingRad: 160 * DEG, lengthM: 2500, widthM: 45 },
];
const VILLAGE_COUNT = 60;
/** River valleys fall to the water over this distance from the channel. */
const RIVER_BANK_M = 1500;
const LAKE_DISTRICT = { x0: 24, x1: 92, z0: -70, z1: -20, lakes: 40 };
const OTHER_LAKES = { x0: -70, x1: -20, z0: -50, z1: 30, lakes: 6 };
/** Highways between cities (indices into CITIES). */
const HIGHWAYS: readonly [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 4],
  [2, 3],
];

const idx = (i: number, j: number) => j * N + i;
const gx = (i: number) => ORIGIN + i * CELL;
const gi = (x: number) => Math.round((x - ORIGIN) / CELL);

/** Region masks and the shoreline, shared by the height and land-cover passes. */
function geography(seed: number) {
  const n = createNoise2D(seed * 31 + 1);
  const coastZ = (X: number) => COAST_Z + 2.5 * n(X / 40, 0.5) + 0.8 * n(X / 9, 3.3);
  const lagoonW = (X: number) => smoothstep(LAGOON.x0, LAGOON.x0 + 6, X) * (1 - smoothstep(LAGOON.x1 - 6, LAGOON.x1, X));
  /** the mainland shore behind the lagoon, or the open coast */
  const shoreZ = (X: number) => coastZ(X) + (LAGOON.spitKm + LAGOON.depthKm) * lagoonW(X);
  const lakeDistrict = (X: number, Z: number) =>
    smoothstep(15, 30, X) * (1 - smoothstep(92, 100, X)) * smoothstep(-76, -66, Z) * (1 - smoothstep(-24, -12, Z));
  const eastLowland = (X: number, Z: number) => smoothstep(52, 72, X) * smoothstep(-22, -8, Z) * (1 - smoothstep(38, 52, Z));
  return { n, coastZ, lagoonW, shoreZ, lakeDistrict, eastLowland };
}
type Geography = ReturnType<typeof geography>;

/** The coastline values of one grid column (they depend on x only). */
interface Column {
  X: number;
  coast: number;
  lagoon: number;
  shore: number;
}

/**
 * How far hills may rise here (revision 47): 0 on a city's or an airfield's ground, 1 well away. Cities stand on the
 * plain; round an airfield the calm reaches about 11 km to the sides and twice as far along the runway, so the
 * approaches stay clear.
 */
function calmness(X: number, Z: number): number {
  let calm = 1;
  for (const c of CITIES) {
    const reach = c.r + 8;
    if (Math.abs(X - c.x) > reach || Math.abs(Z - c.z) > reach) continue;
    const d = Math.hypot(X - c.x, Z - c.z);
    if (d < reach) calm = Math.min(calm, smoothstep(c.r + 1.5, reach, d));
  }
  for (const a of AIRFIELDS) {
    const dx = X - a.x / KM;
    const dz = Z - a.z / KM;
    if (Math.abs(dx) > 28 || Math.abs(dz) > 28) continue;
    const sx = Math.sin(a.headingRad);
    const sz = -Math.cos(a.headingRad);
    const u = Math.abs(dx * sx + dz * sz) - a.lengthM / 2 / KM;
    const v = Math.abs(-dx * sz + dz * sx);
    const d = Math.hypot(Math.max(0, u) * 0.45, v);
    if (d < 11) calm = Math.min(calm, smoothstep(2.5, 11, d));
  }
  return calm;
}

/**
 * Hills (revision 47), metres to add to the plain: rolling ground everywhere, swells of a few tens of metres a few
 * kilometres apart; and hill country over broad uplands (about half the land) and all the foothills, hills of
 * 150–600 m with ridges and winding valleys some 8 km apart. Less in the lake district, the eastern lowland and the
 * high mountains (which have their own), and little round the cities and airfields (`calm`).
 */
function relief(n: Noise2D, X: number, Z: number, south: number, mountains: number, lakes: number, lowland: number, calm: number): number {
  const roll = 55 * fbm2D(n, X / 3, Z / 3, 3) + 10 * n(X / 0.8 + 11, Z / 0.8 + 11);
  const upland = Math.max(smoothstep(-0.2, 0.2, fbm2D(n, X / 55 + 50, Z / 55 + 50, 2)), south) * (1 - 0.8 * lakes) * (1 - lowland) * (1 - 0.85 * mountains);
  let hills = 0;
  if (upland > 0.001) {
    // Lightly warped so the hills wind rather than line up; squared so tops are rounded and valleys wide and low.
    const wx = X + 1.2 * n(X / 7 + 5, Z / 7 + 5);
    const wz = Z + 1.2 * n(X / 7 + 9, Z / 7 + 9);
    hills = upland * 820 * Math.pow(clamp(0.5 + 0.5 * fbm2D(n, wx / 8 + 80, wz / 8 + 80, 5), 0, 1), 2.2);
  }
  return (0.35 + 0.65 * calm) * (1 - 0.75 * lowland) * roll + calm * hills;
}

/** The southern foothills' share: 0 north of 15 km south of the centre, 1 from 62 km. */
const southShare = (Z: number) => (Z > 12 ? smoothstep(15, 62, Z) : 0);
/** The high mountains' share. */
const mountainShare = (nHigh: Noise2D, X: number, Z: number) => (Z > 48 ? smoothstep(56 + 5 * nHigh(X / 25, 3.3), 88, Z) : 0);

/**
 * The hills on every other grid sample, read back bilinearly: the finest swell is 900 m across, which samples 196 m
 * apart still hold, at a quarter of the cost.
 */
function reliefGrid(geo: Geography, nHigh: Noise2D, nRelief: Noise2D): (i: number, j: number) => number {
  const M = (N + 1) / 2;
  const r = new Float32Array(M * M);
  for (let b = 0; b < M; b++) {
    const Z = gx(b * 2) / KM;
    const south = southShare(Z);
    for (let a = 0; a < M; a++) {
      const X = gx(a * 2) / KM;
      r[b * M + a] = relief(nRelief, X, Z, south, mountainShare(nHigh, X, Z), geo.lakeDistrict(X, Z), geo.eastLowland(X, Z), calmness(X, Z));
    }
  }
  return (i, j) => {
    const a = i >> 1;
    const b = j >> 1;
    const a1 = Math.min(M - 1, a + (i & 1));
    const b1 = Math.min(M - 1, b + (j & 1));
    return (r[b * M + a] + r[b * M + a1] + r[b1 * M + a] + r[b1 * M + a1]) / 4;
  };
}

/** Height before rivers, lakes and airfields (metres); `hills` from `relief`. */
function baseHeight(geo: Geography, nPlain: Noise2D, nHigh: Noise2D, hills: number, col: Column, Z: number): number {
  const X = col.X;
  const out = Z - col.coast;
  if (out < 0) return Math.max(-60, -2 + 9 * out);
  const w = col.lagoon;
  if (w > 0.02) {
    const spit = LAGOON.spitKm;
    const inlet = Math.abs(X - LAGOON.inletX) < 0.6;
    if (out < spit && w > 0.15) {
      if (inlet) return -3;
      // Dunes on the spit.
      return 2 + 14 * Math.sin((out / spit) * Math.PI) * (0.6 + 0.4 * nPlain(X / 1.5, 7.1));
    }
    if (Z < col.shore) return -3 * smoothstep(0, 0.4, Math.min(out - spit, col.shore - Z)) - 0.2;
  }
  const inland = Z - col.shore;
  let h = 100 + 45 * fbm2D(nPlain, X / 45, Z / 45, 2) + 15 * fbm2D(nPlain, X / 7 + 20, Z / 7 + 20, 3);
  if (Z > 12) {
    const south = southShare(Z);
    h += south * (170 + 150 * fbm2D(nHigh, X / 14 + 40, Z / 14 + 40, 3));
    const m = mountainShare(nHigh, X, Z);
    if (m > 0) h += m * (280 + 2050 * Math.pow(ridged(nHigh, X, Z), 1.6));
  }
  h += hills;
  const ld = geo.lakeDistrict(X, Z);
  const e = geo.eastLowland(X, Z);
  if (ld > 0) h += ld * (45 + 30 * fbm2D(nPlain, X / 2.2, Z / 2.2, 3) + 20 * nPlain(X / 6 + 3, Z / 6 + 3));
  if (e > 0) h -= e * 45;
  // Inland the swells never dip below the sea (revision 47).
  h = Math.max(h, 6);
  // The coastal plain falls to a few metres at the shore, with a dune line along the open sea.
  if (inland < 6) {
    h = lerp(2.5 + 1.5 * nPlain(X / 3, Z / 3), h, smoothstep(0, 6, inland));
    if (w < 0.5 && inland < 1) h += (1 - 2 * w) * 9 * Math.sin(clamp(inland / 0.9, 0, 1) * Math.PI);
  }
  return h;
}

/**
 * Ridged multifractal for the southern range, stretched east–west and domain-warped so the ridges branch instead of
 * forming a maze. About 0…1.
 */
function ridged(n: ReturnType<typeof createNoise2D>, X: number, Z: number): number {
  const wx = X + 6 * n(X / 30 + 70, Z / 30 + 70);
  const wz = Z + 4 * n(X / 30 + 90, Z / 30 + 90);
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let weight = 1;
  for (let o = 0; o < 4; o++) {
    let r = 1 - Math.abs(n((wx / 22) * freq + o * 13, (wz / 11) * freq + o * 7));
    r *= r * weight;
    weight = clamp(r * 2, 0, 1);
    sum += r * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / 0.9375;
}

/** Catmull-Rom through the control points, sampled about every `stepKm`. */
function spline(points: readonly [number, number][], stepKm: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const p0 = points[Math.max(0, k - 1)];
    const p1 = points[k];
    const p2 = points[k + 1];
    const p3 = points[Math.min(points.length - 1, k + 2)];
    const steps = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / stepKm));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** A river course with meanders (km), source first. */
function riverCourse(course: (typeof RIVER_COURSES)[number], noise: ReturnType<typeof createNoise2D>, k: number): [number, number][] {
  const base = spline(course.points, 0.1);
  let s = 0;
  const total = base.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - base[i - 1][0], p[1] - base[i - 1][1])), 0);
  return base.map((p, i) => {
    if (i > 0) s += Math.hypot(p[0] - base[i - 1][0], p[1] - base[i - 1][1]);
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(base.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const nz = (b[0] - a[0]) / len;
    const taper = smoothstep(0, 3, s) * smoothstep(0, 3, total - s);
    const off = taper * (1.1 * noise(s / 7, k * 10) + 0.35 * noise(s / 2, k * 10 + 5));
    return [p[0] + nx * off, p[1] + nz * off];
  });
}

interface Lake {
  x: number;
  z: number;
  a: number;
  b: number;
  angle: number;
  level: number;
}

/** Generates Lechovia (spec §12.3). Deterministic per seed; takes a few seconds. */
export function generateLechovia(seed: number): LechoviaData {
  const geo = geography(seed);
  const nPlain = createNoise2D(seed * 31 + 2);
  const nHigh = createNoise2D(seed * 31 + 3);
  const nCover = createNoise2D(seed * 31 + 4);
  const nRelief = createNoise2D(seed * 31 + 5);
  const rng = new Rng(seed * 7919 + 17);
  const heights = new Float32Array(N * N);
  const cover = new Uint8Array(N * N).fill(UNSET);

  // 1. Base terrain, sea and lagoon.
  const columns: Column[] = Array.from({ length: N }, (_, i) => {
    const X = gx(i) / KM;
    return { X, coast: geo.coastZ(X), lagoon: geo.lagoonW(X), shore: geo.shoreZ(X) };
  });
  const hillsAt = reliefGrid(geo, nHigh, nRelief);
  for (let j = 0; j < N; j++) {
    const Z = gx(j) / KM;
    for (let i = 0; i < N; i++) {
      const h = baseHeight(geo, nPlain, nHigh, hillsAt(i, j), columns[i], Z);
      heights[idx(i, j)] = h;
      if (h < 0) cover[idx(i, j)] = C.sea;
    }
  }

  // 2. Rivers: a level that only falls toward the sea and stays below the banks; the channel and a floodplain valley.
  const riverDist = new Float32Array(N * N).fill(Infinity);
  /** the water level of the nearest point of the nearest river */
  const riverLevel = new Float32Array(N * N);
  const rivers: River[] = [];
  RIVER_COURSES.forEach((course, k) => {
    const pts = riverCourse(course, geo.n, k).map(([X, Z]) => [X * KM, Z * KM] as [number, number]);
    const total = pts.length - 1;
    const levels: number[] = [];
    let level = Infinity;
    for (const [x, z] of pts) {
      let low = Infinity;
      const reach = Math.ceil((course.halfWidth[1] + 500) / CELL);
      const ci = gi(x);
      const cj = gi(z);
      for (let dj = -reach; dj <= reach; dj += 2) {
        for (let di = -reach; di <= reach; di += 2) {
          const ii = ci + di;
          const jj = cj + dj;
          if (ii >= 0 && jj >= 0 && ii < N && jj < N) low = Math.min(low, heights[idx(ii, jj)]);
        }
      }
      level = Math.min(level - 0.0005 * 100, low - 2);
      levels.push(Math.max(level, 0.3));
    }
    rivers.push({ name: course.name, points: pts.filter((_, i) => i % 10 === 0 || i === total).flatMap(([x, z]) => [Math.round(x), Math.round(z)]) });
    const bank = RIVER_BANK_M;
    for (let s = 0; s < total; s++) {
      const [ax, az] = pts[s];
      const [bx, bz] = pts[s + 1];
      const hw = lerp(course.halfWidth[0], course.halfWidth[1], s / total);
      const reach = hw + bank;
      const i0 = Math.max(0, gi(Math.min(ax, bx) - reach));
      const i1 = Math.min(N - 1, gi(Math.max(ax, bx) + reach));
      const j0 = Math.max(0, gi(Math.min(az, bz) - reach));
      const j1 = Math.min(N - 1, gi(Math.max(az, bz) + reach));
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const px = gx(i) - ax;
          const pz = gx(j) - az;
          const t = clamp((px * dx + pz * dz) / len2, 0, 1);
          const d = Math.hypot(px - t * dx, pz - t * dz) - hw;
          const k2 = idx(i, j);
          if (d >= riverDist[k2]) continue;
          riverDist[k2] = d;
          const lv = lerp(levels[s], levels[s + 1], t);
          riverLevel[k2] = lv;
          if (cover[k2] === C.sea) continue;
          if (d < 0) {
            heights[k2] = Math.min(heights[k2], lv);
            cover[k2] = heights[k2] < 0 ? C.sea : C.river;
          }
        }
      }
    }
  });
  // Banks: a valley falling to the river over 1.5 km, from the level of the nearest river point.
  for (let k2 = 0; k2 < N * N; k2++) {
    const d = riverDist[k2];
    if (!(d >= 0 && d < RIVER_BANK_M) || cover[k2] !== UNSET) continue;
    heights[k2] = Math.min(heights[k2], lerp(riverLevel[k2] + 1.5, heights[k2], smoothstep(0, RIVER_BANK_M, d)));
  }

  // 3. Cities fixed, then lakes kept clear of rivers, cities and airfields.
  const settlements: Settlement[] = CITIES.map((c) => ({ name: c.name, kind: 'city' as const, x: c.x * KM, z: c.z * KM, radiusM: c.r * KM, ...(c.capital ? { capital: true } : {}) }));
  const lakes: Lake[] = [];
  const nearRiver = (x: number, z: number, m: number) => {
    const k2 = idx(clamp(gi(x), 0, N - 1), clamp(gi(z), 0, N - 1));
    return riverDist[k2] < m;
  };
  const placeLakes = (area: typeof LAKE_DISTRICT, sizeScale: number) => {
    let placed = 0;
    for (let attempt = 0; attempt < area.lakes * 40 && placed < area.lakes; attempt++) {
      const x = rng.range(area.x0, area.x1) * KM;
      const z = rng.range(area.z0, area.z1) * KM;
      const a = rng.range(0.6, 2.8) * KM * sizeScale;
      const b = a * rng.range(0.3, 0.7);
      const angle = rng.range(-40, 40) * DEG;
      if (nearRiver(x, z, a + 2500)) continue;
      if (z - geo.shoreZ(x / KM) * KM < a + 4000) continue;
      if (settlements.some((s) => Math.hypot(s.x - x, s.z - z) < s.radiusM + a + 2000)) continue;
      if (AIRFIELDS.some((f) => Math.hypot(f.x - x, f.z - z) < f.lengthM / 2 + a + 3000)) continue;
      if (lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.a + a + 1000)) continue;
      // In a hollow of gentle ground, not cut into a hillside (revision 47).
      if (spanWithin(heights, x, z, a * 1.5) > 70) continue;
      lakes.push({ x, z, a, b, angle, level: 0 });
      placed++;
    }
  };
  placeLakes(LAKE_DISTRICT, 1);
  placeLakes(OTHER_LAKES, 0.7);
  for (const [li, lake] of lakes.entries()) {
    const ca = Math.cos(lake.angle);
    const sa = Math.sin(lake.angle);
    const q = (x: number, z: number) => {
      const dx = x - lake.x;
      const dz = z - lake.z;
      const u = (dx * ca + dz * sa) / lake.a;
      const v = (-dx * sa + dz * ca) / lake.b;
      const phi = Math.atan2(v, u);
      return Math.hypot(u, v) / (1 + 0.18 * geo.n(Math.cos(phi) * 1.5 + li * 3.7, Math.sin(phi) * 1.5 + 50));
    };
    const reach = lake.a * 1.7;
    const i0 = Math.max(0, gi(lake.x - reach));
    const i1 = Math.min(N - 1, gi(lake.x + reach));
    const j0 = Math.max(0, gi(lake.z - reach));
    const j1 = Math.min(N - 1, gi(lake.z + reach));
    let low = Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (q(gx(i), gx(j)) < 1.6) low = Math.min(low, heights[idx(i, j)]);
    lake.level = low - 2.5;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const qq = q(gx(i), gx(j));
        const k2 = idx(i, j);
        if (qq < 1) {
          heights[k2] = lake.level;
          cover[k2] = C.lake;
        } else if (qq < 1.5) {
          heights[k2] = Math.min(heights[k2], lerp(lake.level + 1.2, heights[k2], smoothstep(1, 1.5, qq)));
        }
      }
    }
  }

  // 4. Airfields: flat ground at the mean height of the runway area, blended over 1.5 km.
  const airfields: Airfield[] = AIRFIELDS.map((spec) => {
    const a: Airfield = { ...spec, elevationM: 0 };
    // Flat a cell diagonal beyond the ground area, so bilinear heights and nearest-cell covers inside it are exact.
    const halfL = a.lengthM / 2 + AIRFIELD_GROUND_OVERRUN_M + 150;
    const halfW = AIRFIELD_GROUND_HALF_WIDTH_M + 150;
    const blend = 1500;
    const reach = halfL + blend;
    const i0 = Math.max(0, gi(a.x - reach));
    const i1 = Math.min(N - 1, gi(a.x + reach));
    const j0 = Math.max(0, gi(a.z - reach));
    const j1 = Math.min(N - 1, gi(a.z + reach));
    let sum = 0;
    let count = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const { u, v } = airfieldLocal(a, gx(i), gx(j));
        if (Math.abs(u) <= halfL && Math.abs(v) <= halfW) {
          sum += heights[idx(i, j)];
          count++;
        }
      }
    }
    a.elevationM = Math.round((sum / Math.max(1, count)) * 10) / 10;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const { u, v } = airfieldLocal(a, gx(i), gx(j));
        const out = Math.hypot(Math.max(0, Math.abs(u) - halfL), Math.max(0, Math.abs(v) - halfW));
        const k2 = idx(i, j);
        if (out === 0) {
          heights[k2] = a.elevationM;
          cover[k2] = C.airfield;
        } else if (out < blend) {
          heights[k2] = lerp(a.elevationM, heights[k2], smoothstep(0, blend, out));
        }
      }
    }
    return a;
  });

  // 5. Villages on dry, gentle ground away from towns, airfields and each other.
  const taken = new Set<string>(CITY_NAMES.map((c) => c.toLowerCase()));
  const dry = (x: number, z: number, radius: number) => {
    const r = Math.ceil(radius / CELL);
    const ci = gi(x);
    const cj = gi(z);
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const ii = ci + di;
        const jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) return false;
        const c = cover[idx(ii, jj)];
        if (c === C.sea || c === C.lake || c === C.river || c === C.airfield) return false;
      }
    }
    return true;
  };
  const villageRng = new Rng(seed * 104729 + 3);
  for (let attempt = 0; attempt < 4000 && settlements.length < CITIES.length + VILLAGE_COUNT; attempt++) {
    const x = villageRng.range(-92, 92) * KM;
    const z = villageRng.range(-90, 80) * KM;
    const radiusM = Math.round(villageRng.range(450, 850));
    const k2 = idx(gi(x), gi(z));
    if (heights[k2] < 4 || heights[k2] > 900) continue;
    if (slopeAt(heights, gi(x), gi(z)) > 0.06) continue;
    // On gentle ground: a lowland village on the level, a hill or mountain village on a gentler slope (revision 47).
    if (spanWithin(heights, x, z, radiusM) > (heights[k2] < 280 ? 50 : 120)) continue;
    if (!dry(x, z, radiusM + 300)) continue;
    if (settlements.some((s) => Math.hypot(s.x - x, s.z - z) < (s.kind === 'city' ? s.radiusM + 4000 : 5000))) continue;
    if (airfields.some((a) => Math.hypot(a.x - x, a.z - z) < a.lengthM / 2 + 3000)) continue;
    settlements.push({ name: villageName(villageRng, taken), kind: 'village', x: Math.round(x), z: Math.round(z), radiusM });
  }

  // 6. Land cover for every cell still unset.
  for (let j = 0; j < N; j++) {
    const z = gx(j);
    const Z = z / KM;
    for (let i = 0; i < N; i++) {
      const k2 = idx(i, j);
      if (cover[k2] !== UNSET) continue;
      const h = heights[k2];
      cover[k2] = landCoverAt(geo, nCover, columns[i], Z, h, slopeAt(heights, i, j), riverDist[k2]);
    }
  }
  for (const s of settlements) paintSettlement(cover, s, nCover);

  // 7. Roads: highways between the cities, then a local road from every village and airfield to the network.
  const router = new RoadRouter({ heights, cover, resolution: N, sizeM: LECHOVIA_SIZE_M });
  const roads: Road[] = [];
  const cityNodes = settlements.filter((s) => s.kind === 'city').map((s) => router.nodeNear(s.x, s.z));
  for (const [a, b] of HIGHWAYS) {
    const path = router.route(cityNodes[a], cityNodes[b]);
    if (!path) continue;
    router.addToNetwork(path);
    roads.push(router.toRoad(path, 'highway'));
  }
  const capital = settlements[0];
  const spurs: { x: number; z: number }[] = [
    ...settlements.filter((s) => s.kind === 'village'),
    // The access road starts behind the apron, to the right of the runway centre.
    ...airfields.map((a) => airfieldWorld(a, 0, AIRFIELD_GROUND_HALF_WIDTH_M + 250)),
  ].sort((p, q) => Math.hypot(p.x - capital.x, p.z - capital.z) - Math.hypot(q.x - capital.x, q.z - capital.z));
  for (const s of spurs) {
    const start = router.nodeNear(s.x, s.z);
    const path = router.route(start, -1, 60000) ?? router.route(start, cityNodes[0]);
    if (!path || path.length < 2) continue;
    router.addToNetwork(path);
    roads.push(router.toRoad(path, 'local'));
  }

  return { seed, heights, cover, features: { settlements, roads, rivers, airfields } };
}

/** Highest minus lowest ground within `radius` of a point, from every other grid sample (revision 47). */
function spanWithin(heights: Float32Array, x: number, z: number, radius: number): number {
  const r = Math.ceil(radius / CELL);
  const ci = gi(x);
  const cj = gi(z);
  let lo = Infinity;
  let hi = -Infinity;
  for (let dj = -r; dj <= r; dj += 2) {
    for (let di = -r; di <= r; di += 2) {
      if (di * di + dj * dj > r * r) continue;
      const h = heights[idx(clamp(ci + di, 0, N - 1), clamp(cj + dj, 0, N - 1))];
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  return hi - lo;
}

/** 1 − normal.y of the grid at a sample. */
function slopeAt(heights: Float32Array, i: number, j: number): number {
  const l = heights[idx(Math.max(0, i - 1), j)];
  const r = heights[idx(Math.min(N - 1, i + 1), j)];
  const u = heights[idx(i, Math.max(0, j - 1))];
  const d = heights[idx(i, Math.min(N - 1, j + 1))];
  const sx = (r - l) / (2 * CELL);
  const sz = (d - u) / (2 * CELL);
  return 1 - 1 / Math.sqrt(1 + sx * sx + sz * sz);
}

function landCoverAt(geo: Geography, n: ReturnType<typeof createNoise2D>, col: Column, Z: number, h: number, slope: number, riverDistM: number): number {
  const X = col.X;
  const inland = Z - col.shore;
  if (inland < 0 && col.lagoon > 0.15) return C.beach;
  if (inland < 0.5 && h < 12) return C.beach;
  if (h > 1850 + 120 * n(X / 4, Z / 4)) return slope > 0.45 ? C.rock : C.snow;
  if (slope > 0.22 || (h > 1500 && slope > 0.12)) return C.rock;
  const mountainForest = smoothstep(450, 650, h) * (1 - smoothstep(1450, 1650, h));
  const east = smoothstep(45, 70, X);
  const plains = Math.abs(X) < 50 && Z > -40 && Z < 40 ? 1 : 0;
  const f =
    0.65 * fbm2D(n, X / 16, Z / 16, 2) +
    0.25 * n(X / 3 + 9, Z / 3 + 9) +
    0.1 * n(X / 0.9 + 4, Z / 0.9 + 4) -
    0.12 +
    0.45 * east +
    0.3 * geo.lakeDistrict(X, Z) +
    0.5 * mountainForest +
    (inland < 8 ? 0.15 : 0) -
    0.12 * plains;
  if (f < 0.45 && geo.eastLowland(X, Z) > 0.4 && n(X / 3 + 30, Z / 3 + 30) > 0.25) return C.marsh;
  if (f > 0.2) return C.forest;
  if (riverDistM < 1200 || h > 900 || n(X / 3 + 60, Z / 3 + 60) > 0.38) return C.meadow;
  return C.field;
}

/** Urban ground under a settlement: a ragged disc for cities, a round one for villages. Never over water. */
function paintSettlement(cover: Uint8Array, s: Settlement, n: ReturnType<typeof createNoise2D>): void {
  const reach = s.radiusM * 1.15;
  const i0 = Math.max(0, gi(s.x - reach));
  const i1 = Math.min(N - 1, gi(s.x + reach));
  const j0 = Math.max(0, gi(s.z - reach));
  const j1 = Math.min(N - 1, gi(s.z + reach));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k2 = idx(i, j);
      const c = cover[k2];
      if (c === C.sea || c === C.lake || c === C.river || c === C.airfield) continue;
      const d = Math.hypot(gx(i) - s.x, gx(j) - s.z);
      const edge = s.kind === 'city' ? s.radiusM * (0.8 + 0.3 * n(gx(i) / 1500, gx(j) / 1500)) : s.radiusM;
      if (d < edge) cover[k2] = C.urban;
    }
  }
}
