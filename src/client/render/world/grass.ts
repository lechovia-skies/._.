import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  type Texture,
  Vector3,
} from 'three';
import type { MapDefinition } from '../../../shared/data/maps/map-definition.ts';
import { airfieldLocal } from '../../../shared/map/features.ts';
import type { LandCover } from '../../../shared/map/land-cover.ts';
import type { GridTerrain } from '../../../shared/map/terrain.ts';
import { RoadIndex } from './buildings/town-plan.ts';
import { airfieldLayout } from './feature-layout.ts';
import { treeHash } from './trees.ts';

/*
 * Grass (spec revision 46): stylized tufts of blades standing on the grassland round the camera when it is low
 * (taking off, landing, a low pass), swaying in the wind. The ground round the camera is cut into small patches;
 * each patch's tufts are placed once from its own seed and kept in a slot of one instanced mesh, so moving only
 * fills the slots of the patches that come into range. Ploughed fields stay bare: the shader reads the same
 * satellite colour the terrain does and leaves the tufts out where the terrain paints soil.
 */

/** How far and how dense (a graphics preset's). */
export interface GrassSettings {
  /** tufts stand within this distance of the camera, metres */
  radiusM: number;
  /** distance between tufts, metres */
  spacingM: number;
}

export const GRASS_PATCH_M = 16;
/** The grass thins out from this height above the ground, and is gone by the next (camera, metres). */
const FADE_FROM_AGL_M = 60;
const GONE_AGL_M = 140;
/** Patches are placed a few each frame, at most this long. */
const BUILD_BUDGET_MS = 2;

/** What the placement needs from the map. */
export interface GrassGround {
  coverAt(x: number, z: number): LandCover;
  cellM: number;
  originM: number;
  /** the height of the ground as drawn */
  heightAt(x: number, z: number): number;
  /** false on roads, runways, taxiways, aprons and hangars */
  free(x: number, z: number): boolean;
}

const COVER_GRASS: Readonly<Record<LandCover, number>> = {
  meadow: 1,
  field: 1,
  airfield: 1,
  marsh: 0.7,
  forest: 0.3,
  urban: 0.2,
  rock: 0.15,
  beach: 0.08,
  snow: 0,
  sea: 0,
  lake: 0,
  river: 0,
};
/** Land the terrain paints as grass or ploughed soil by the photo's colour: the shader decides there. */
const FARMLAND: ReadonlySet<LandCover> = new Set<LandCover>(['meadow', 'field', 'airfield']);

/** One tuft: where, how big, its turn, its shade, and how much it is on farmland (0..1). */
export interface Tuft {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  shade: number;
  farm: number;
}

/** How likely a tuft is at a point and how much of it is farmland, blended between land-cover grid points. */
export function grassAt(g: GrassGround, x: number, z: number): { chance: number; farm: number } {
  const c = g.cellM;
  const fx = (x - g.originM) / c;
  const fz = (z - g.originM) / c;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  let chance = 0;
  let farm = 0;
  for (const [ci, cj, w] of [
    [i, j, (1 - u) * (1 - v)],
    [i + 1, j, u * (1 - v)],
    [i, j + 1, (1 - u) * v],
    [i + 1, j + 1, u * v],
  ] as const) {
    const cover = g.coverAt(g.originM + ci * c, g.originM + cj * c);
    chance += w * COVER_GRASS[cover];
    if (FARMLAND.has(cover)) farm += w;
  }
  return { chance, farm };
}

/** The tufts of patch (pi, pj): a jittered grid `spacingM` apart where the dice and the ground allow. */
export function tuftsInPatch(g: GrassGround, pi: number, pj: number, spacingM: number): Tuft[] {
  const n = Math.max(1, Math.round(GRASS_PATCH_M / spacingM));
  const step = GRASS_PATCH_M / n;
  const out: Tuft[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = pi * n + i;
      const gj = pj * n + j;
      const x = (pi * n + i + 0.1 + 0.8 * treeHash(gi, gj, 21)) * step;
      const z = (pj * n + j + 0.1 + 0.8 * treeHash(gi, gj, 22)) * step;
      const { chance, farm } = grassAt(g, x, z);
      if (treeHash(gi, gj, 23) >= chance || !g.free(x, z)) continue;
      out.push({ x, y: g.heightAt(x, z), z, scale: 0.7 + 0.6 * treeHash(gi, gj, 24), yaw: treeHash(gi, gj, 25) * Math.PI * 2, shade: treeHash(gi, gj, 26), farm });
    }
  }
  return out;
}

/** The map as grass placement sees it. */
export function mapGrassGround(def: MapDefinition, terrain: GridTerrain): GrassGround {
  const roads = new RoadIndex(def.features?.roads ?? []);
  const fields = (def.features?.airfields ?? []).map((a) => ({ a, layout: airfieldLayout(a) }));
  return {
    coverAt: (x, z) => def.landCover(x, z, 0, 0),
    cellM: def.sizeM / (def.resolution - 1),
    originM: -def.sizeM / 2,
    heightAt: (x, z) => terrain.meshHeightAt(x, z),
    free: (x, z) => {
      for (const { a, layout } of fields) {
        const { u, v } = airfieldLocal(a, x, z);
        if (Math.abs(u) > a.lengthM / 2 + 600 || Math.abs(v) > 600) continue;
        for (const p of layout.paved) if (Math.abs(u - p.u) <= p.length / 2 + 2 && Math.abs(v - p.v) <= p.width / 2 + 2) return false;
        for (const h of layout.hangars) if (Math.abs(u - h.u) < 24 && Math.abs(v - h.v) < 26) return false;
        if (Math.abs(u - layout.tower.u) < 10 && Math.abs(v - layout.tower.v) < 10) return false;
      }
      return roads.clear(x, z, 0, 1, 1);
    },
  };
}

/** A tuft about a metre tall: nine blades fanning out from the root, dark at the root and light at the tip. */
function tuftGeometry(): BufferGeometry {
  const blades = 9;
  const pos: number[] = [];
  const col: number[] = [];
  const root = new Color(0x2f5a17);
  const tip = new Color(0x9ccf4a);
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2 + 0.4 * Math.sin(k * 7.3);
    const lean = 0.18 + 0.12 * ((k * 0.618) % 1);
    const h = 0.7 + 0.3 * ((k * 0.382) % 1);
    const r = 0.06 + 0.05 * ((k * 0.5) % 1);
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // A flat blade across its lean: two root corners and a tip leaning outward.
    const px = -cz * 0.045;
    const pz = cx * 0.045;
    pos.push(cx * r + px, 0, cz * r + pz, cx * r - px, 0, cz * r - pz, cx * (r + lean), h, cz * (r + lean));
    col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  // Every blade lit as the ground under it is.
  const nor = new Float32Array(pos.length);
  for (let k = 1; k < nor.length; k += 3) nor[k] = 1;
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  return g;
}

interface Patch {
  slot: number;
  count: number;
}

export class Grass {
  readonly mesh: InstancedMesh;
  settings: GrassSettings | null;
  private readonly ground: GrassGround;
  private readonly patches = new Map<string, Patch>();
  private readonly freeSlots: number[] = [];
  private perPatch = 0;
  /** per tuft: how much of it is on farmland (where the shader may leave it out for soil) */
  private farm = new InstancedBufferAttribute(new Float32Array(1), 1);
  private readonly uniforms = {
    gTime: { value: 0 },
    gCamera: { value: new Vector3() },
    gRadius: { value: 1 },
    gHeight: { value: 1 },
    gFarm: { value: null as Texture | null },
    gGrassMean: { value: new Vector3(0.1, 0.25, 0.05) },
  };

  constructor(ground: GrassGround, settings: GrassSettings | null, farmPhoto: Texture, grassMean: Vector3) {
    this.ground = ground;
    this.settings = null;
    this.uniforms.gFarm.value = farmPhoto;
    this.uniforms.gGrassMean.value.copy(grassMean);
    const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aFarm;
uniform float gTime;
uniform vec3 gCamera;
uniform float gRadius;
uniform float gHeight;
uniform sampler2D gFarm;
uniform vec3 gGrassMean;
varying float vGrassLight;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// The farmland photo as the terrain shader samples it (terrain-material.ts csPhoto and csGrade).
vec3 gPhoto(vec2 p) {
  vec2 uvA = p / 18000.0;
  vec2 q = mat2(0.7986, -0.6018, 0.6018, 0.7986) * p;
  vec2 uvB = q / (18000.0 * 0.73) + vec2(0.37, 0.61);
  float m = smoothstep(0.3, 0.7, gNoise(p / 9000.0));
  vec3 c = mix(textureLod(gFarm, uvA, 0.0).rgb, textureLod(gFarm, uvB, 0.0).rgb, m);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, 1.35), vec3(0.0));
  return pow(c, vec3(0.92)) * 1.08;
}`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vec3 gAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
vec3 gColour = gPhoto(gAt.xz);
// Bare where the terrain paints ploughed soil; thinner toward the edge of the range and as the camera climbs.
float gSoil = smoothstep(-0.015, 0.05, gColour.r - gColour.g) * aFarm;
float gSize = (1.0 - smoothstep(0.3, 0.55, gSoil)) * (1.0 - smoothstep(gRadius * 0.65, gRadius, distance(gAt.xz, gCamera.xz))) * gHeight;
// The wind: tips sway, roots stay.
float gSway = sin(gTime * 1.7 + gAt.x * 0.21 + gAt.z * 0.17) * 0.6 + sin(gTime * 3.1 + gAt.x * 0.53 - gAt.z * 0.31) * 0.3;
transformed.xz += vec2(0.16, 0.1) * gSway * transformed.y * transformed.y;
transformed *= gSize;
// As bright as the ground under it, as the terrain tints its grass.
float gLight = clamp(dot(gColour, vec3(0.2126, 0.7152, 0.0722)) / max(dot(gGrassMean, vec3(0.2126, 0.7152, 0.0722)), 0.01), 0.55, 1.6);
vGrassLight = mix(1.0, gLight, 0.7);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGrassLight;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrassLight;')
        // Both faces of a blade lit like the ground, not one of them from below.
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);\nnonPerturbedNormal = normal;');
    };
    material.customProgramCacheKey = () => 'lechovia-grass-v1';
    const geometry = tuftGeometry();
    this.mesh = new InstancedMesh(geometry, material, 1);
    this.mesh.name = 'grass';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.setSettings(settings);
  }

  /** A graphics preset's grass, or none: the instance buffers are sized for it. */
  setSettings(settings: GrassSettings | null): void {
    this.settings = settings;
    this.patches.clear();
    this.freeSlots.length = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
    if (!settings) return;
    const side = 2 * Math.ceil(settings.radiusM / GRASS_PATCH_M) + 1;
    const n = Math.max(1, Math.round(GRASS_PATCH_M / settings.spacingM));
    this.perPatch = n * n;
    const capacity = side * side * this.perPatch;
    // A new mesh's buffers are the right size; the old ones are dropped.
    const mesh = this.mesh;
    mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(capacity * 16), 16).setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
    this.farm = new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
    mesh.geometry.setAttribute('aFarm', this.farm);
    for (let s = side * side - 1; s >= 0; s--) this.freeSlots.push(s);
    mesh.count = capacity;
    // Empty slots draw nothing: their matrices are all zero.
  }

  update(camera: Vector3, timeS: number, budgetMs = BUILD_BUDGET_MS): void {
    const s = this.settings;
    if (!s) return;
    const agl = camera.y - this.ground.heightAt(camera.x, camera.z);
    const height = 1 - Math.min(1, Math.max(0, (agl - FADE_FROM_AGL_M) / (GONE_AGL_M - FADE_FROM_AGL_M)));
    this.mesh.visible = height > 0;
    if (height <= 0) return;
    this.uniforms.gTime.value = timeS;
    this.uniforms.gCamera.value.copy(camera);
    this.uniforms.gRadius.value = s.radiusM;
    this.uniforms.gHeight.value = height;
    const r = Math.ceil(s.radiusM / GRASS_PATCH_M);
    const ci = Math.floor(camera.x / GRASS_PATCH_M);
    const cj = Math.floor(camera.z / GRASS_PATCH_M);
    // Patches leaving the square round the camera give back their slots.
    for (const [key, p] of this.patches) {
      const [pi, pj] = key.split(',').map(Number);
      if (Math.abs(pi - ci) <= r && Math.abs(pj - cj) <= r) continue;
      this.clearSlot(p.slot);
      this.freeSlots.push(p.slot);
      this.patches.delete(key);
    }
    // New patches, nearest first, as time allows (at least one a frame).
    const start = performance.now();
    let built = 0;
    for (let ring = 0; ring <= r; ring++) {
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          const key = `${ci + di},${cj + dj}`;
          if (this.patches.has(key)) continue;
          if (built > 0 && performance.now() - start > budgetMs) return;
          const slot = this.freeSlots.pop();
          if (slot === undefined) return;
          this.patches.set(key, { slot, count: this.fill(slot, ci + di, cj + dj) });
          built++;
        }
      }
    }
  }

  /** How many tufts stand now (for tests). */
  get count(): number {
    let n = 0;
    for (const p of this.patches.values()) n += p.count;
    return n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }

  private fill(slot: number, pi: number, pj: number): number {
    const tufts = tuftsInPatch(this.ground, pi, pj, (this.settings as GrassSettings).spacingM);
    const base = slot * this.perPatch;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const p = new Vector3();
    const sc = new Vector3();
    const c = new Color();
    const matrices = this.mesh.instanceMatrix.array as Float32Array;
    const colors = this.mesh.instanceColor?.array as Float32Array;
    const farm = this.farm.array as Float32Array;
    for (let k = 0; k < this.perPatch; k++) {
      const t = tufts[k];
      if (!t) {
        matrices.fill(0, (base + k) * 16, (base + k + 1) * 16);
        continue;
      }
      q.setFromAxisAngle(up, t.yaw);
      sc.set(t.scale * 1.1, t.scale, t.scale * 1.1);
      m.compose(p.set(t.x, t.y, t.z), q, sc).toArray(matrices, (base + k) * 16);
      c.setRGB(0.85 + 0.3 * t.shade, 0.9 + 0.2 * t.shade, 0.85 + 0.15 * t.shade).toArray(colors, (base + k) * 3);
      farm[base + k] = t.farm;
    }
    this.mesh.instanceMatrix.addUpdateRange(base * 16, this.perPatch * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor?.addUpdateRange(base * 3, this.perPatch * 3);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.farm.addUpdateRange(base, this.perPatch);
    this.farm.needsUpdate = true;
    return tufts.length;
  }

  private clearSlot(slot: number): void {
    const base = slot * this.perPatch;
    (this.mesh.instanceMatrix.array as Float32Array).fill(0, base * 16, (base + this.perPatch) * 16);
    this.mesh.instanceMatrix.addUpdateRange(base * 16, this.perPatch * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
