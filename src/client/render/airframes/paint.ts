import { CanvasTexture, Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture, Vector3, Vector4 } from 'three';
import { Rng } from '../../../shared/math/rng.ts';
import { drawMarking, type MarkingArt, markingAspect } from './markings.ts';

/**
 * How a real-type airframe is painted (revision 31), drawn by its skin shader from the body-space position of each
 * pixel, so the pattern runs on from the fuselage onto the wings and fins with no seams and no texture coordinates:
 * the camouflage patches, a lighter underside, areas in their own colour (radome, fin caps, bare metal), panel lines,
 * and the markings (national insignia, bort numbers, tail codes) projected onto the skin like decals.
 * Positions are in the type's drawing coordinates (fs aft from the nose tip, bl right, wl up from the ground).
 */

export type Point = readonly [fs: number, bl: number, wl: number];

/** A soft-edged ellipsoid of one camouflage colour; later patches lie over earlier ones. */
export interface Patch {
  at: Point;
  /** half-lengths along fs, bl and wl */
  r: Point;
  /** heading of the long axis in the plan view, degrees from fs toward bl */
  yawDeg: number;
  /** index into the camouflage colours (1–4) */
  color: number;
}

/** A box in drawing coordinates painted in its own colour, with soft edges `soft` metres wide. */
export interface Zone {
  from: Point;
  to: Point;
  color: string;
  soft?: number;
  /** how strongly the zone covers what is under it, 0–1 */
  opacity?: number;
}

/** A marking: its art, where its centre sits, its size on the skin, and the side it is painted on. */
export interface Marking {
  art: MarkingArt;
  at: Point;
  /** width and height on the skin, metres */
  size: readonly [w: number, h: number];
  from: 'left' | 'right' | 'top' | 'bottom';
  /** leans the projection about the fs axis to follow a fin canted outward this many degrees */
  rollDeg?: number;
  /** how far either side of `at` the marking reaches through the skin, metres */
  depth?: number;
}

export interface PaintSpec {
  /** base, then up to four camouflage colours */
  colors: readonly string[];
  underside: string;
  /** how much of the underside takes the underside colour, 0–1 */
  undersideAmount: number;
  patches: readonly Patch[];
  /** width of a patch's soft edge as a fraction of its size (small = hard-edged splinters) */
  soft: number;
  /** how far noise pushes the patch edges about, metres */
  warp: number;
  zones: readonly Zone[];
  markings: readonly Marking[];
  /** darkness of the panel lines, 0–1 */
  panelLines: number;
  roughness: number;
  metalness: number;
}

export interface CamoOptions {
  seed: number;
  count: number;
  /** fs, bl and wl extent the patches are spread over */
  from: Point;
  to: Point;
  /** half-length range along the long axis; the short axis is 0.45–0.8 of it */
  size: readonly [min: number, max: number];
  /** relative share of each camouflage colour (index 1 first) */
  weights: readonly number[];
}

/** Seeded patches spread over the airframe, so every jet of a type wears the same pattern. */
export function camoPatches(o: CamoOptions): Patch[] {
  const rng = new Rng(o.seed);
  const total = o.weights.reduce((a, b) => a + b, 0);
  const out: Patch[] = [];
  for (let i = 0; i < o.count; i++) {
    let pick = rng.next() * total;
    let color = 1;
    for (let k = 0; k < o.weights.length; k++) {
      pick -= o.weights[k];
      if (pick <= 0) {
        color = k + 1;
        break;
      }
    }
    const long = rng.range(o.size[0], o.size[1]);
    const short = long * rng.range(0.45, 0.8);
    out.push({
      at: [rng.range(o.from[0], o.to[0]), rng.range(o.from[1], o.to[1]), rng.range(o.from[2], o.to[2])],
      r: [long, short, Math.max(long, 2.5)],
      yawDeg: rng.range(-60, 60),
      color,
    });
  }
  return out;
}

/** The marking and its mirror image on the other side (a bort number on both sides of the nose). */
export function bothSides(m: Marking): Marking[] {
  const flipSide = { left: 'right', right: 'left', top: 'top', bottom: 'bottom' } as const;
  return [m, { ...m, at: [m.at[0], -m.at[1], m.at[2]], from: flipSide[m.from] }];
}

/** Body frame of the airframe: where drawing coordinates land (nose toward -z). */
export interface BodyFrame {
  lengthM: number;
  datumWlM: number;
}

export const toBody = (f: BodyFrame, [fs, bl, wl]: Point) => new Vector3(bl, wl - f.datumWlM, fs - f.lengthM / 2);

export const MAX_PATCHES = 32;
export const MAX_ZONES = 8;
export const MAX_DECALS = 14;

/** The marking's projector: rows taking a body-space point to (u, v) on the art and depth through the skin. */
export function decalRows(f: BodyFrame, m: Marking): [Vector3, number][] {
  const c = toBody(f, m.at);
  const roll = ((m.rollDeg ?? 0) * Math.PI) / 180;
  let u: Vector3;
  let v: Vector3;
  let d: Vector3;
  // u reads left to right as seen from the marking's side, v up the art, d into the skin.
  switch (m.from) {
    case 'left':
      u = new Vector3(0, 0, 1);
      v = new Vector3(-Math.sin(roll), Math.cos(roll), 0);
      d = new Vector3(Math.cos(roll), Math.sin(roll), 0);
      break;
    case 'right':
      u = new Vector3(0, 0, -1);
      v = new Vector3(Math.sin(roll), Math.cos(roll), 0);
      d = new Vector3(-Math.cos(roll), Math.sin(roll), 0);
      break;
    case 'top':
      u = new Vector3(1, 0, 0);
      v = new Vector3(0, 0, -1);
      d = new Vector3(0, -1, 0);
      break;
    case 'bottom':
      u = new Vector3(-1, 0, 0);
      v = new Vector3(0, 0, -1);
      d = new Vector3(0, 1, 0);
      break;
  }
  const depth = m.depth ?? 0.6;
  const row = (axis: Vector3, scale: number, offset: number): [Vector3, number] => [axis.clone().divideScalar(scale), -axis.dot(c) / scale + offset];
  return [row(u, m.size[0], 0.5), row(v, m.size[1], 0.5), row(d, depth, 0)];
}

interface AtlasCell {
  /** u, v, width, height in the atlas (0–1) */
  rect: [number, number, number, number];
}

const ATLAS_W = 1024;
const CELL_H = 160;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

/** Draws every distinct marking art once into one texture; null without a DOM (tests). */
export function markingAtlas(markings: readonly Marking[]): { texture: Texture; cells: Map<string, AtlasCell> } | null {
  const arts = new Map<string, MarkingArt>();
  for (const m of markings) arts.set(JSON.stringify(m.art), m.art);
  // Lay the cells out in rows.
  const layout: { key: string; x: number; y: number; w: number }[] = [];
  let x = 0;
  let y = 0;
  for (const [key, art] of arts) {
    const w = Math.min(ATLAS_W, Math.ceil(CELL_H * markingAspect(art)));
    if (x + w > ATLAS_W) {
      x = 0;
      y += CELL_H;
    }
    layout.push({ key, x, y, w });
    x += w + 4;
  }
  const height = 2 ** Math.ceil(Math.log2(Math.max(CELL_H, y + CELL_H)));
  const made = canvas(ATLAS_W, height);
  if (!made) return null;
  const [c, ctx] = made;
  const cells = new Map<string, AtlasCell>();
  for (const cell of layout) {
    const art = arts.get(cell.key) as MarkingArt;
    ctx.save();
    ctx.translate(cell.x, cell.y);
    drawMarking(ctx, art, cell.w, CELL_H);
    ctx.restore();
    cells.set(cell.key, { rect: [cell.x / ATLAS_W, cell.y / height, cell.w / ATLAS_W, CELL_H / height] });
  }
  const texture = new CanvasTexture(c);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, cells };
}

let panelTexture: Texture | null | undefined;

/**
 * Panel lines as a tiling texture (3 m square): rows of panels of random lengths, with fastener rows along some
 * seams. Laid onto the skin from three directions and blended by the surface's facing.
 */
export function panelLineTexture(): Texture | null {
  if (panelTexture !== undefined) return panelTexture;
  const made = canvas(512, 512);
  if (!made) return (panelTexture = null);
  const [c, ctx] = made;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);
  const rng = new Rng(0x9a4e1);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  // Rows of panels; seams wrap around the edges so the texture tiles.
  let yPos = 0;
  while (yPos < 512) {
    const h = Math.min(512 - yPos, Math.round(rng.range(60, 150)));
    ctx.moveTo(0, yPos);
    ctx.lineTo(512, yPos);
    let xPos = rng.range(0, 80);
    while (xPos < 512) {
      ctx.moveTo(xPos, yPos);
      ctx.lineTo(xPos, yPos + h);
      xPos += rng.range(70, 210);
    }
    yPos += h;
  }
  ctx.stroke();
  // Fasteners along a few seams.
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 14; i++) {
    const vertical = rng.next() < 0.5;
    const at = rng.range(0, 512);
    const from = rng.range(0, 380);
    for (let s = from; s < from + rng.range(60, 130); s += 7) {
      ctx.beginPath();
      ctx.arc(vertical ? at + 4 : s, vertical ? s : at + 4, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return (panelTexture = t);
}

const linear = (hex: string) => new Color(hex);

/**
 * The skin material for one type: a MeshStandardMaterial whose base colour comes from the paint scheme, worked out
 * per pixel from the body-space position. Shared by every jet of the type.
 */
export function skinMaterial(spec: PaintSpec, frame: BodyFrame): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: spec.roughness, metalness: spec.metalness });
  material.name = 'airframe-skin';
  const colors = [...spec.colors];
  while (colors.length < 5) colors.push(colors[0]);
  const palette = [...colors.slice(0, 5), spec.underside].map(linear);

  const patches = spec.patches.slice(0, MAX_PATCHES);
  const patchData: Vector3[] = [];
  const patchExtra: number[] = [];
  for (const p of patches) {
    patchData.push(toBody(frame, p.at), new Vector3(p.r[1], p.r[2], p.r[0]));
    patchExtra.push(p.color, (p.yawDeg * Math.PI) / 180);
  }
  const patchVec4 = patches.flatMap((_, i) => [
    [patchData[2 * i].x, patchData[2 * i].y, patchData[2 * i].z, patchExtra[2 * i]],
    [patchData[2 * i + 1].x, patchData[2 * i + 1].y, patchData[2 * i + 1].z, patchExtra[2 * i + 1]],
  ]);

  const zones = spec.zones.slice(0, MAX_ZONES).flatMap((z) => {
    const a = toBody(frame, z.from);
    const b = toBody(frame, z.to);
    const col = linear(z.color);
    return [
      [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), z.soft ?? 0.05],
      [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z), z.opacity ?? 1],
      [col.r, col.g, col.b, 0],
    ];
  });

  const atlas = markingAtlas(spec.markings);
  const decals = atlas
    ? spec.markings.slice(0, MAX_DECALS).flatMap((m) => {
        const rows = decalRows(frame, m);
        const rect = (atlas.cells.get(JSON.stringify(m.art)) as AtlasCell).rect;
        return [...rows.map(([v, w]) => [v.x, v.y, v.z, w]), rect];
      })
    : [];

  const pad = (rows: number[][], n: number) => {
    const out = rows.map((r) => r.slice());
    while (out.length < n) out.push([0, 0, 0, 0]);
    return out.map((r) => new Vector4(r[0], r[1], r[2], r[3]));
  };
  const uniforms = {
    afPalette: { value: palette },
    afPatches: { value: pad(patchVec4, MAX_PATCHES * 2) },
    afPatchCount: { value: patches.length },
    afZones: { value: pad(zones, MAX_ZONES * 3) },
    afZoneCount: { value: zones.length / 3 },
    afDecals: { value: pad(decals, MAX_DECALS * 4) },
    afDecalCount: { value: decals.length / 4 },
    afAtlas: { value: atlas?.texture ?? null },
    afPanels: { value: panelLineTexture() },
    afParams: { value: new Vector4(spec.soft, spec.warp, spec.undersideAmount, spec.panelLines) },
  };
  material.userData.airframeUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAfPos;\nvarying vec3 vAfNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAfPos = position;\nvAfNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SKIN_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= afPaint(vAfPos, normalize(vAfNormal));');
  };
  material.customProgramCacheKey = () => 'airframe-skin';
  return material;
}

const SKIN_GLSL = /* glsl */ `
varying vec3 vAfPos;
varying vec3 vAfNormal;
uniform vec3 afPalette[6];
uniform vec4 afPatches[${MAX_PATCHES * 2}];
uniform int afPatchCount;
uniform vec4 afZones[${MAX_ZONES * 3}];
uniform int afZoneCount;
uniform vec4 afDecals[${MAX_DECALS * 4}];
uniform int afDecalCount;
uniform sampler2D afAtlas;
uniform sampler2D afPanels;
uniform vec4 afParams;

float afHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float afNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(afHash(i), afHash(i + vec3(1, 0, 0)), f.x), mix(afHash(i + vec3(0, 1, 0)), afHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(afHash(i + vec3(0, 0, 1)), afHash(i + vec3(1, 0, 1)), f.x), mix(afHash(i + vec3(0, 1, 1)), afHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

vec3 afPaint(vec3 p, vec3 n) {
  // Camouflage: ellipsoid patches with edges pushed about by noise.
  vec3 q = p + afParams.y * (vec3(afNoise(p * 0.55), afNoise(p * 0.55 + 11.3), afNoise(p * 0.55 + 23.7)) - 0.5)
             + 0.35 * afParams.y * (vec3(afNoise(p * 1.9 + 5.1), afNoise(p * 1.9 + 17.9), afNoise(p * 1.9 + 29.3)) - 0.5);
  vec3 col = afPalette[0];
  for (int i = 0; i < ${MAX_PATCHES}; i++) {
    if (i >= afPatchCount) break;
    vec4 c = afPatches[2 * i];
    vec4 r = afPatches[2 * i + 1];
    vec3 d = q - c.xyz;
    float cy = cos(r.w);
    float sy = sin(r.w);
    vec3 e = vec3(cy * d.x - sy * d.z, d.y, sy * d.x + cy * d.z);
    float k = length(e / r.xyz);
    float m = 1.0 - smoothstep(1.0 - afParams.x, 1.0 + afParams.x, k);
    col = mix(col, afPalette[int(c.w)], m);
  }
  // A lighter underside, its edge broken up a little.
  float under = 1.0 - smoothstep(-0.62, -0.28, n.y + 0.12 * (afNoise(p * 1.3) - 0.5));
  col = mix(col, afPalette[5], under * afParams.z);
  // Areas in their own colour.
  for (int i = 0; i < ${MAX_ZONES}; i++) {
    if (i >= afZoneCount) break;
    vec4 a = afZones[3 * i];
    vec4 b = afZones[3 * i + 1];
    vec4 c = afZones[3 * i + 2];
    vec3 inside = smoothstep(a.xyz - a.w, a.xyz + a.w, p) * (1.0 - smoothstep(b.xyz - a.w, b.xyz + a.w, p));
    col = mix(col, c.rgb, inside.x * inside.y * inside.z * b.w);
  }
  // Panel lines from three directions.
  vec3 bw = pow(abs(n), vec3(4.0));
  bw /= bw.x + bw.y + bw.z;
  float s = 1.0 / 3.0;
  float lines = texture2D(afPanels, p.zy * s).r * bw.x + texture2D(afPanels, p.xz * s).r * bw.y + texture2D(afPanels, p.xy * s).r * bw.z;
  col *= 1.0 - afParams.w * lines;
  // Markings.
  vec4 hp = vec4(p, 1.0);
  for (int i = 0; i < ${MAX_DECALS}; i++) {
    if (i >= afDecalCount) break;
    vec4 r0 = afDecals[4 * i];
    vec4 r1 = afDecals[4 * i + 1];
    vec4 r2 = afDecals[4 * i + 2];
    vec3 t = vec3(dot(r0, hp), dot(r1, hp), dot(r2, hp));
    if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0 || abs(t.z) > 1.0 || dot(n, r2.xyz) > -0.05) continue;
    vec4 rect = afDecals[4 * i + 3];
    vec4 art = texture2D(afAtlas, rect.xy + vec2(t.x, 1.0 - t.y) * rect.zw);
    col = mix(col, art.rgb, art.a);
  }
  // Weathering: faded and grimy in places.
  col *= 0.95 + 0.08 * afNoise(p * 0.9 + 3.0) - 0.04 * afNoise(p * 7.0);
  return col;
}
`;
