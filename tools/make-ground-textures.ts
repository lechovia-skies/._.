/**
 * Draws the close-up ground materials (spec revision 45): seamless, stylized textures for grass, ploughed soil, forest
 * floor, rock and sand, each with a normal map, so the ground stays sharp when a jet flies low. Everything is made
 * from seeded noise, so the files are the game's own (no download, no licence) and the same on every run.
 *
 * Each texture covers GROUND_TILE_M of ground (see terrain-material.ts) in TEXTURE_PX pixels: about 2 cm a pixel,
 * with tufts, clods, stones and cracks a pilot sees from a few hundred metres. The results in
 * src/client/assets/ground/ are committed, so normal builds never need this script.
 *
 * Run: node tools/make-ground-textures.ts
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export const TEXTURE_PX = 1024;
const N = TEXTURE_PX;
const out = join(process.cwd(), 'src/client/assets/ground');

// ---------- Seeded, periodic noise: every pattern repeats exactly at the texture's edge. ----------

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Gradient noise on a lattice of `period` cells across the texture; x, y in 0..1. Returns about −1..1. */
function gnoise(x: number, y: number, period: number, seed: number): number {
  const px = x * period;
  const py = y * period;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const grad = (i: number, j: number, dx: number, dy: number) => {
    const a = hash(mod(i, period), mod(j, period), seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = smooth(fx);
  const v = smooth(fy);
  return (
    mix(mix(grad(ix, iy, fx, fy), grad(ix + 1, iy, fx - 1, fy), u), mix(grad(ix, iy + 1, fx, fy - 1), grad(ix + 1, iy + 1, fx - 1, fy - 1), u), v) * 1.4
  );
}

/** Fractal noise: `octaves` layers from `period` cells up, each twice as fine and `gain` as strong. About −1..1. */
function fbm(x: number, y: number, period: number, octaves: number, seed: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * gnoise(x, y, period << o, seed + o * 101);
    norm += amp;
    amp *= gain;
  }
  return sum / norm;
}

/** Cellular noise on `period` × `period` jittered points: distance to the nearest (f1) and second (f2), in cells. */
function worley(x: number, y: number, period: number, seed: number): { f1: number; f2: number; id: number } {
  const px = x * period;
  const py = y * period;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = mod(ix + i, period);
      const cy = mod(iy + j, period);
      const ox = ix + i + hash(cx, cy, seed);
      const oy = iy + j + hash(cx, cy, seed + 17);
      const d = Math.hypot(px - ox, py - oy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash(cx, cy, seed + 31);
      } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id };
}

// ---------- Canvas helpers ----------

interface Layer {
  /** sRGB colour, 0..1 */
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  /** relief for the normal map, any scale */
  h: Float32Array;
}

function layer(): Layer {
  return { r: new Float32Array(N * N), g: new Float32Array(N * N), b: new Float32Array(N * N), h: new Float32Array(N * N) };
}

/** Calls fn for every pixel with its 0..1 coordinates. */
function each(fn: (x: number, y: number, i: number) => void): void {
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) fn((px + 0.5) / N, (py + 0.5) / N, py * N + px);
}

/** A soft round dab (radius in pixels) that wraps round the edges: adds height and mixes colour toward `c`. */
function dab(L: Layer, cx: number, cy: number, radius: number, c: readonly number[], alpha: number, height: number): void {
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / radius;
      if (d >= 1) continue;
      const w = (1 - d * d) * alpha;
      const i = mod(Math.round(cy) + dy, N) * N + mod(Math.round(cx) + dx, N);
      L.r[i] = mix(L.r[i], c[0], w);
      L.g[i] = mix(L.g[i], c[1], w);
      L.b[i] = mix(L.b[i], c[2], w);
      L.h[i] += height * (1 - d * d);
    }
  }
}

/** A short stroke from (x, y) along `angle`, tapering, coloured from `root` to `tip`: a blade, needle or twig. */
function stroke(L: Layer, x: number, y: number, angle: number, length: number, width: number, root: readonly number[], tip: readonly number[], height: number): void {
  const steps = Math.ceil(length);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    dab(L, x + Math.cos(angle) * length * t, y + Math.sin(angle) * length * t, Math.max(0.6, width * (1 - 0.7 * t)), [mix(root[0], tip[0], t), mix(root[1], tip[1], t), mix(root[2], tip[2], t)], 0.85, height * (0.4 + 0.6 * t) * 0.25);
  }
}

/** A random number stream for placing strokes and stones. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const hex = (h: string) => [1, 3, 5].map((k) => Number.parseInt(h.slice(k, k + 2), 16) / 255);

// ---------- The materials ----------

/** Lawn and meadow: soft colour patches, darker tufts, thousands of short blades and a few flowers. */
function grass(): Layer {
  const L = layer();
  const deep = hex('#3f7a24');
  const mid = hex('#5e9c2e');
  const light = hex('#8cbf3f');
  each((x, y, i) => {
    const patch = 0.5 + 0.5 * fbm(x, y, 4, 4, 11);
    const fine = 0.5 + 0.5 * fbm(x, y, 32, 3, 12);
    const c = patch < 0.5 ? deep.map((v, k) => mix(v, mid[k], patch * 2)) : mid.map((v, k) => mix(v, light[k], (patch - 0.5) * 2));
    const tuft = worley(x, y, 48, 13);
    const shade = 0.82 + 0.18 * clamp01(tuft.f1 * 1.4) + 0.08 * (fine - 0.5);
    L.r[i] = c[0] * shade;
    L.g[i] = c[1] * shade;
    L.b[i] = c[2] * shade;
    L.h[i] = (1 - clamp01(tuft.f1)) * 1.5 + fine * 0.6;
  });
  const rand = rng(101);
  for (let k = 0; k < 42000; k++) {
    const x = rand() * N;
    const y = rand() * N;
    const g = 0.5 + 0.5 * fbm(x / N, y / N, 4, 2, 11);
    const root = [0.16 + 0.08 * g, 0.33 + 0.12 * g, 0.09];
    const tip = [0.45 + 0.25 * g, 0.7 + 0.12 * g, 0.24 + 0.08 * g];
    stroke(L, x, y, rand() * Math.PI * 2, 5 + rand() * 9, 1.1 + rand() * 0.8, root, tip, 1.2);
  }
  // A scatter of small flowers in the lighter patches.
  const colours = ['#f4e9a3', '#ffffff', '#f2b8d0', '#c9d9ff'].map(hex);
  for (let k = 0; k < 900; k++) {
    const x = rand() * N;
    const y = rand() * N;
    if (fbm(x / N, y / N, 4, 2, 11) < 0.1) continue;
    dab(L, x, y, 1.6 + rand() * 1.4, colours[Math.floor(rand() * colours.length)], 0.95, 0.6);
  }
  return L;
}

/** Ploughed soil: clods in furrow-like bands, straw and a few stones; fields read as fields from low down. */
function soil(): Layer {
  const L = layer();
  const dark = hex('#5b4130');
  const warm = hex('#8a6545');
  const dry = hex('#a98a63');
  each((x, y, i) => {
    const warp = fbm(x, y, 6, 3, 21) * 0.02;
    const furrow = 0.5 + 0.5 * Math.sin((y + warp) * Math.PI * 2 * 26);
    const patch = 0.5 + 0.5 * fbm(x, y, 5, 4, 22);
    const clod = worley(x, y, 96, 23);
    const c = dark.map((v, k) => mix(mix(v, warm[k], furrow * 0.7 + 0.15), dry[k], patch * 0.45));
    const s = 0.78 + 0.3 * clamp01(1 - clod.f1) + 0.08 * fbm(x, y, 64, 2, 24);
    L.r[i] = c[0] * s;
    L.g[i] = c[1] * s;
    L.b[i] = c[2] * s;
    L.h[i] = furrow * 1.6 + (1 - clamp01(clod.f1)) * 1.2;
  });
  const rand = rng(202);
  for (let k = 0; k < 5000; k++) stroke(L, rand() * N, rand() * N, rand() * Math.PI * 2, 4 + rand() * 7, 0.8, hex('#b59a62'), hex('#e0cd8f'), 0.4);
  for (let k = 0; k < 700; k++) dab(L, rand() * N, rand() * N, 1.5 + rand() * 2.5, hex('#a8a39a'), 0.9, 1.5);
  return L;
}

/** Forest floor: moss, fallen needles and leaves, twigs and roots in a mottled shade. */
function forestFloor(): Layer {
  const L = layer();
  const moss = hex('#3d5e22');
  const litter = hex('#6b5235');
  const dark = hex('#2a3018');
  each((x, y, i) => {
    const m = 0.5 + 0.5 * fbm(x, y, 5, 5, 31);
    const shade = 0.5 + 0.5 * fbm(x, y, 3, 3, 32);
    const c = litter.map((v, k) => mix(mix(v, moss[k], clamp01((m - 0.35) * 2.2)), dark[k], (1 - shade) * 0.45));
    L.r[i] = c[0];
    L.g[i] = c[1];
    L.b[i] = c[2];
    L.h[i] = m * 1.2;
  });
  const rand = rng(303);
  const leaves = ['#8a5a2b', '#a8732f', '#6e7a2a', '#5a3d22'].map(hex);
  for (let k = 0; k < 9000; k++) dab(L, rand() * N, rand() * N, 1.6 + rand() * 2.6, leaves[Math.floor(rand() * leaves.length)], 0.8, 0.5);
  for (let k = 0; k < 14000; k++) stroke(L, rand() * N, rand() * N, rand() * Math.PI * 2, 4 + rand() * 6, 0.7, hex('#5c4128'), hex('#9a7a48'), 0.3);
  for (let k = 0; k < 160; k++) stroke(L, rand() * N, rand() * N, rand() * Math.PI * 2, 25 + rand() * 50, 2 + rand() * 2.5, hex('#3e2c1c'), hex('#5e4630'), 2.5);
  return L;
}

/** Rock: big faceted slabs, a few irregular cracks, layered bands and lichen; reads as chunky stylized stone. */
function rock(): Layer {
  const L = layer();
  const base = hex('#85807a');
  const cool = hex('#5f6873');
  const warm = hex('#a39279');
  each((x, y, i) => {
    // Warped coordinates break the cells' straight edges.
    const wx = x + fbm(x, y, 3, 4, 45) * 0.06;
    const wy = y + fbm(x, y, 3, 4, 46) * 0.06;
    const slab = worley(wx, wy, 5, 42);
    const chip = worley(wx, wy, 17, 47);
    // Only some edges crack open, so the stone is not a pavement.
    const open = clamp01((fbm(x, y, 6, 3, 48) + 0.15) * 2.5);
    const crack = 1 - (1 - clamp01((slab.f2 - slab.f1) * 14)) * 0.9 - (1 - clamp01((chip.f2 - chip.f1) * 20)) * 0.35 * open;
    const strata = 0.5 + 0.5 * Math.sin((wy + fbm(x, y, 4, 3, 41) * 0.05) * Math.PI * 2 * 7);
    const grain = 0.5 + 0.5 * fbm(x, y, 64, 3, 43);
    // A facet: each slab leans its own way, lit from one side.
    const facet = 0.5 + 0.5 * Math.sin(slab.id * 40 + (wx - wy) * 6);
    const c = base.map((v, k) => mix(mix(v, cool[k], slab.id * 0.55), warm[k], strata * 0.3));
    const lichen = clamp01((fbm(x, y, 8, 4, 44) - 0.4) * 3);
    const s = clamp01(crack) * (0.8 + 0.2 * facet) * (0.88 + 0.2 * grain);
    L.r[i] = mix(c[0] * s, 0.6, lichen * 0.3);
    L.g[i] = mix(c[1] * s, 0.66, lichen * 0.3);
    L.b[i] = mix(c[2] * s, 0.38, lichen * 0.3);
    L.h[i] = clamp01(crack) * 3 + (1 - slab.f1) * 3 + facet * 1.5 + grain * 0.5 + strata * 0.6;
  });
  return L;
}

/** Sand: warm ripples, darker damp hollows and a sprinkle of shell and grit. */
function sand(): Layer {
  const L = layer();
  const pale = hex('#e8d2a0');
  const warm = hex('#cfae78');
  each((x, y, i) => {
    const w = fbm(x, y, 3, 3, 51) * 0.05;
    const ripple = 0.5 + 0.5 * Math.sin((x * 0.6 + y + w) * Math.PI * 2 * 40);
    const patch = 0.5 + 0.5 * fbm(x, y, 4, 4, 52);
    const grit = hash(Math.floor(x * N), Math.floor(y * N), 53);
    const c = warm.map((v, k) => mix(v, pale[k], patch * 0.8 + ripple * 0.2));
    const s = 0.92 + 0.08 * ripple + (grit > 0.985 ? 0.15 : grit < 0.015 ? -0.15 : 0);
    L.r[i] = c[0] * s;
    L.g[i] = c[1] * s;
    L.b[i] = c[2] * s;
    L.h[i] = ripple * 0.8 + patch * 0.4;
  });
  return L;
}

// ---------- Output ----------

/** The normal map (tangent space: x east, y north) from the relief by central differences, `strength` steep. */
function normals(L: Layer, strength: number): Uint8Array {
  const out = new Uint8Array(N * N * 3);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const h = (i: number, j: number) => L.h[mod(j, N) * N + mod(i, N)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 3;
      out[i] = Math.round((-dx / len) * 127.5 + 127.5);
      out[i + 1] = Math.round((dy / len) * 127.5 + 127.5);
      out[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
    }
  }
  return out;
}

function colours(L: Layer): Uint8Array {
  const out = new Uint8Array(N * N * 3);
  for (let i = 0; i < N * N; i++) {
    out[i * 3] = Math.round(clamp01(L.r[i]) * 255);
    out[i * 3 + 1] = Math.round(clamp01(L.g[i]) * 255);
    out[i * 3 + 2] = Math.round(clamp01(L.b[i]) * 255);
  }
  return out;
}

/** The ground materials in the order of the shader's texture layers (terrain-material.ts GROUND_LAYERS). */
const MATERIALS: [string, () => Layer, number][] = [
  ['grass', grass, 0.8],
  ['soil', soil, 0.5],
  ['forest-floor', forestFloor, 0.6],
  ['rock', rock, 0.5],
  ['sand', sand, 0.3],
];

if (process.argv[1]?.endsWith('make-ground-textures.ts')) {
  mkdirSync(out, { recursive: true });
  for (const [name, make, strength] of MATERIALS) {
    const started = Date.now();
    const L = make();
    const raw = { width: N, height: N, channels: 3 as const };
    await sharp(colours(L), { raw }).jpeg({ quality: 86, mozjpeg: true }).toFile(join(out, `${name}.jpg`));
    await sharp(normals(L, strength), { raw }).jpeg({ quality: 90, mozjpeg: true }).toFile(join(out, `${name}-normal.jpg`));
    console.log(`${name}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
}
