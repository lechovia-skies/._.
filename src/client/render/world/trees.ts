import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDefinition } from '../../../shared/data/maps/map-definition.ts';
import { AIRFIELD_GROUND_HALF_WIDTH_M, airfieldLocal } from '../../../shared/map/features.ts';
import type { LandCover } from '../../../shared/map/land-cover.ts';
import type { Terrain } from '../../../shared/map/terrain.ts';
import { RoadIndex } from './buildings/town-plan.ts';

/*
 * Trees (spec revision 45): stylized 3D conifers and broadleaf trees standing in the forests, in copses and alone in
 * the fields, around the camera. The land is cut into square blocks; each block's trees are placed once, from its
 * own seed, so a forest is the same every time it is flown over. Near blocks draw the full trees, farther ones a
 * simpler shape, and trees shrink away toward the edge of the range instead of popping.
 */

/** How many trees, and how far (a graphics preset's). */
export interface TreeSettings {
  /** trees stand within this distance of the camera (3-D, so they go when flying high), metres */
  rangeM: number;
  /** distance between trees in a full forest, metres */
  spacingM: number;
  /** blocks nearer than this draw the full trees, metres */
  detailM: number;
}

export type TreeKind = 'conifer' | 'broadleaf';

/** One tree as placed: position (y at the ground), size, turn and a shade. */
export interface TreeSpot {
  kind: TreeKind;
  x: number;
  y: number;
  z: number;
  /** height in metres */
  height: number;
  /** turn about the trunk, radians */
  yaw: number;
  /** 0..1: lighter or darker green */
  shade: number;
}

export const TREE_BLOCK_M = 800;

/** An integer hash to 0..1 (stable across runs and devices). */
export function treeHash(i: number, j: number, salt: number): number {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth noise (0..1) on a grid of `cell` metres, for groves and conifer stands. */
function patchNoise(x: number, z: number, cell: number, salt: number): number {
  const fx = x / cell;
  const fz = z / cell;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const a = treeHash(i, j, salt);
  const b = treeHash(i + 1, j, salt);
  const c = treeHash(i, j + 1, salt);
  const d = treeHash(i + 1, j + 1, salt);
  return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
}

/** What the placement needs from the map. */
export interface TreeGround {
  /** the land cover at a point (the map's grid cell) */
  coverAt(x: number, z: number): LandCover;
  /** the grid spacing of the land cover, metres, and where the grid starts (its first point, on both axes) */
  cellM: number;
  originM: number;
  heightAt(x: number, z: number): number;
  /** false where a tree must not stand (roads, runways) */
  free(x: number, z: number): boolean;
}

/**
 * How likely a tree is at a point, 0..1. Land cover is blended between the four grid points around it, as the
 * terrain blends its colours, so the trees follow the forest's soft edge. Forests are full; marshes have a few;
 * fields and meadows have lone trees and small copses.
 */
export function treeChance(g: TreeGround, x: number, z: number): number {
  const c = g.cellM;
  const fx = (x - g.originM) / c;
  const fz = (z - g.originM) / c;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  let chance = 0;
  const corners: [number, number, number][] = [
    [i, j, (1 - u) * (1 - v)],
    [i + 1, j, u * (1 - v)],
    [i, j + 1, (1 - u) * v],
    [i + 1, j + 1, u * v],
  ];
  for (const [ci, cj, w] of corners) {
    const cover = g.coverAt(g.originM + ci * c, g.originM + cj * c);
    chance += w * COVER_CHANCE[cover];
  }
  if (chance >= 0.9) return chance;
  // Copses: now and then a clump of trees in open country.
  const open = chance;
  const grove = patchNoise(x, z, 160, 7);
  return Math.max(open, open > 0 ? Math.min(0.85, open + Math.max(0, grove - 0.8) * 4) : 0);
}

const COVER_CHANCE: Readonly<Record<LandCover, number>> = {
  forest: 0.95,
  marsh: 0.07,
  meadow: 0.02,
  field: 0.012,
  urban: 0,
  airfield: 0,
  beach: 0,
  rock: 0.01,
  snow: 0,
  sea: 0,
  lake: 0,
  river: 0,
};

/** The trees of block (bi, bj): a jittered grid `spacingM` apart, kept where the dice say and the ground is free. */
export function treesInBlock(g: TreeGround, bi: number, bj: number, spacingM: number): TreeSpot[] {
  const out: TreeSpot[] = [];
  const n = Math.round(TREE_BLOCK_M / spacingM);
  const step = TREE_BLOCK_M / n;
  const x0 = bi * TREE_BLOCK_M;
  const z0 = bj * TREE_BLOCK_M;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Global grid indices, so neighbouring blocks never repeat each other.
      const gi = bi * n + i;
      const gj = bj * n + j;
      const x = x0 + (i + 0.04 + 0.92 * treeHash(gi, gj, 1)) * step;
      const z = z0 + (j + 0.04 + 0.92 * treeHash(gi, gj, 2)) * step;
      if (treeHash(gi, gj, 3) >= treeChance(g, x, z)) continue;
      if (!g.free(x, z)) continue;
      // Stands of conifers and of broadleaf trees, mixed at their edges; lone trees are mostly broadleaf.
      const conifer = patchNoise(x, z, 900, 11) * 0.9 + treeHash(gi, gj, 4) * 0.3;
      const kind: TreeKind = conifer > 0.56 ? 'conifer' : 'broadleaf';
      // Older and younger stands, and some spread within each.
      const r = 0.55 * treeHash(gi, gj, 5) + 0.45 * patchNoise(x, z, 220, 13);
      const height = kind === 'conifer' ? 11 + r * 17 : 7 + r * 12;
      out.push({ kind, x, y: g.heightAt(x, z) - 0.6, z, height, yaw: treeHash(gi, gj, 6) * Math.PI * 2, shade: treeHash(gi, gj, 7) });
    }
  }
  return out;
}

/** The map as tree placement sees it: land cover, heights, roads and airfields kept clear. */
export function mapTreeGround(def: MapDefinition, terrain: Terrain): TreeGround {
  const roads = new RoadIndex(def.features?.roads ?? []);
  const airfields = def.features?.airfields ?? [];
  const towns = def.features?.settlements ?? [];
  return {
    coverAt: (x, z) => def.landCover(x, z, 0, 0),
    cellM: def.sizeM / (def.resolution - 1),
    originM: -def.sizeM / 2,
    heightAt: (x, z) => terrain.surfaceAt(x, z),
    free: (x, z) => {
      // The runway, its flattened ground and the approaches stay open.
      for (const a of airfields) {
        const { u, v } = airfieldLocal(a, x, z);
        if (Math.abs(u) <= a.lengthM / 2 + 1500 && Math.abs(v) <= AIRFIELD_GROUND_HALF_WIDTH_M + 150) return false;
      }
      // Towns and villages keep their streets and gardens to themselves.
      for (const t of towns) if ((x - t.x) ** 2 + (z - t.z) ** 2 < t.radiusM * t.radiusM) return false;
      return roads.clear(x, z, 0, 5, 5);
    },
  };
}

// ---------- Shapes ----------

/** Paints a geometry one colour, darker underneath and toward its middle (baked shade), lighter on top. */
function paint(shape: BufferGeometry, base: Color, top: Color, yMin: number, yMax: number): BufferGeometry {
  // Separate vertices per face, so merged parts keep their own colours.
  const geo = shape.index ? shape.toNonIndexed() : shape;
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let k = 0; k < pos.count; k++) {
    const t = Math.min(1, Math.max(0, (pos.getY(k) - yMin) / (yMax - yMin)));
    c.copy(base).lerp(top, t * t);
    colors.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}

/** Normals pointing out from a centre: a crown of lumps shades as one soft ball (the stylized look). */
function roundNormals(geo: BufferGeometry, center: Vector3, keep: number): BufferGeometry {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const v = new Vector3();
  const n = new Vector3();
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k).sub(center).normalize();
    n.fromBufferAttribute(nor, k).multiplyScalar(keep).add(v.multiplyScalar(1 - keep)).normalize();
    nor.setXYZ(k, n.x, n.y, n.z);
  }
  return geo;
}

const BARK = new Color(0x6b4a2f);
const BARK_DARK = new Color(0x3d2a1b);

/** A conifer one metre tall: a short trunk and three stacked cones, dark at the base of each tier. */
function coniferGeometry(detail: boolean): BufferGeometry {
  const deep = new Color(0x1f5a2e);
  const tip = new Color(0x5b9a3c);
  if (!detail) {
    const cone = new ConeGeometry(0.26, 0.9, 6, 1);
    cone.translate(0, 0.55, 0);
    return paint(cone, deep, tip, 0.1, 1);
  }
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.025, 0.035, 0.25, 6, 1, true);
  trunk.translate(0, 0.125, 0);
  parts.push(paint(trunk, BARK_DARK, BARK, 0, 0.25));
  const tiers: [number, number, number][] = [
    [0.28, 0.5, 0.15],
    [0.22, 0.42, 0.4],
    [0.15, 0.34, 0.66],
  ];
  for (const [radius, height, base] of tiers) {
    const cone = new ConeGeometry(radius, height, 8, 1);
    cone.translate(0, base + height / 2, 0);
    // Each tier darker at its skirt, lighter toward its point.
    parts.push(paint(cone, deep, tip, base, base + height));
  }
  return mergeGeometries(parts);
}

/** A broadleaf tree one metre tall: a trunk and a crown of three lumps, shaded as one ball. */
function broadleafGeometry(detail: boolean): BufferGeometry {
  const under = new Color(0x2c5a1b);
  const top = new Color(0x8cc63f);
  const crown = new Vector3(0, 0.62, 0);
  if (!detail) {
    const ball = new IcosahedronGeometry(0.34, 0);
    ball.scale(1, 0.85, 1);
    ball.translate(crown.x, crown.y, crown.z);
    return paint(roundNormals(ball, crown, 0.2), under, top, 0.3, 0.95);
  }
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.03, 0.05, 0.42, 6, 1, true);
  trunk.translate(0, 0.21, 0);
  parts.push(paint(trunk, BARK_DARK, BARK, 0, 0.42));
  // One round main lump and two plainer ones: shaded as one ball, the facets hardly show (about 130 triangles).
  const lumps: [number, number, number, number, number][] = [
    [0, 0.63, 0, 0.31, 1],
    [0.17, 0.56, 0.09, 0.22, 0],
    [-0.14, 0.6, -0.11, 0.23, 0],
  ];
  for (const [x, y, z, r, detail] of lumps) {
    const ball = new IcosahedronGeometry(r, detail);
    ball.translate(x, y, z);
    parts.push(paint(roundNormals(ball, crown, 0.35), under, top, 0.32, 0.98));
  }
  return mergeGeometries(parts);
}

// ---------- The trees around the camera ----------

/** One kind's trees in a block: every tree's matrix and shade, split each time into the near and the far mesh. */
interface Stand {
  kind: TreeKind;
  /** instance matrices relative to the block, 16 floats a tree */
  matrices: Float32Array;
  /** instance shades, 3 floats a tree */
  colors: Float32Array;
  /** world x, z a tree */
  xz: Float32Array;
  far: InstancedMesh;
  near: InstancedMesh;
}

interface Block {
  key: string;
  center: Vector3;
  group: Group;
  stands: Stand[];
  /** where the camera was when the trees were last split near/far; NaN: never */
  splitX: number;
  splitY: number;
  splitZ: number;
  /** some tree is drawn in full */
  hasNear: boolean;
}

const KINDS: readonly TreeKind[] = ['conifer', 'broadleaf'];
/** Blocks are placed and split a few each frame, at most this long, so flying low never stutters. */
const BUILD_BUDGET_MS = 3;
/** A block's trees are split near/far again once the camera has moved this far. */
const RESPLIT_M = 60;

export class Trees {
  readonly group = new Group();
  settings: TreeSettings | null;
  private readonly ground: TreeGround;
  private readonly blocks = new Map<string, Block>();
  private readonly geometry: Record<TreeKind, { near: BufferGeometry; far: BufferGeometry }>;
  private readonly material: MeshStandardMaterial;
  /** the camera's position, for the shrink toward the edge of the range */
  private readonly fade = { value: new Vector3() };
  private readonly range = { value: 1 };

  constructor(ground: TreeGround, settings: TreeSettings | null) {
    this.ground = ground;
    this.settings = settings;
    this.group.name = 'trees';
    this.geometry = {
      conifer: { near: coniferGeometry(true), far: coniferGeometry(false) },
      broadleaf: { near: broadleafGeometry(true), far: broadleafGeometry(false) },
    };
    this.material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.treeCamera = this.fade;
      shader.uniforms.treeRange = this.range;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 treeCamera;\nuniform float treeRange;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
// Trees shrink into the ground over the last fifth of the range instead of popping out.
vec3 treeAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
transformed *= 1.0 - smoothstep(treeRange * 0.8, treeRange, distance(treeAt, treeCamera));`,
        );
    };
    this.material.customProgramCacheKey = () => 'lechovia-trees-v1';
  }

  /** A graphics preset's trees, or none. Blocks already placed are placed again. */
  setSettings(settings: TreeSettings | null): void {
    this.settings = settings;
    for (const b of this.blocks.values()) this.free(b);
    this.blocks.clear();
  }

  /** Places every block in range at once (before the first frame of a match). */
  prepare(camera: Vector3): void {
    this.update(camera, Infinity);
  }

  update(camera: Vector3, budgetMs = BUILD_BUDGET_MS): void {
    const s = this.settings;
    this.group.visible = s !== null;
    if (!s) return;
    this.fade.value.copy(camera);
    this.range.value = s.rangeM;
    const agl = Math.max(0, camera.y - this.ground.heightAt(camera.x, camera.z));
    // Blocks wanted: within range in 3-D (none when flying high), nearest first.
    const wanted: { bi: number; bj: number; d: number }[] = [];
    if (agl < s.rangeM) {
      const reach = s.rangeM;
      for (let bj = Math.floor((camera.z - reach) / TREE_BLOCK_M); bj <= Math.floor((camera.z + reach) / TREE_BLOCK_M); bj++) {
        for (let bi = Math.floor((camera.x - reach) / TREE_BLOCK_M); bi <= Math.floor((camera.x + reach) / TREE_BLOCK_M); bi++) {
          const d = this.nearest(bi, bj, camera);
          if (Math.hypot(d, agl) <= s.rangeM) wanted.push({ bi, bj, d });
        }
      }
    }
    const keep = new Set(wanted.map((w) => `${w.bi},${w.bj}`));
    for (const [key, b] of this.blocks) {
      if (keep.has(key)) continue;
      this.free(b);
      this.blocks.delete(key);
    }
    wanted.sort((a, b) => a.d - b.d);
    const start = performance.now();
    for (const w of wanted) {
      const key = `${w.bi},${w.bj}`;
      let b = this.blocks.get(key);
      if (!b) {
        if (performance.now() - start > budgetMs) continue;
        b = this.build(w.bi, w.bj, key);
        this.blocks.set(key, b);
      }
      // Trees nearer than detailM are drawn in full: split again as the camera moves (only blocks that reach there).
      const reachesNear = Math.hypot(w.d, agl) < s.detailM;
      if (!reachesNear && !b.hasNear && !Number.isNaN(b.splitX)) continue;
      if (Math.hypot(camera.x - b.splitX, camera.y - b.splitY, camera.z - b.splitZ) < RESPLIT_M) continue;
      if (performance.now() - start > budgetMs && !Number.isNaN(b.splitX)) continue;
      this.split(b, camera, reachesNear ? s.detailM : -1);
    }
  }

  /** How many trees stand now, and how many are drawn in full (for tests and the debug readout). */
  get count(): { trees: number; near: number } {
    let trees = 0;
    let near = 0;
    for (const b of this.blocks.values()) {
      for (const st of b.stands) {
        trees += st.far.count + st.near.count;
        near += st.near.count;
      }
    }
    return { trees, near };
  }

  dispose(): void {
    for (const b of this.blocks.values()) this.free(b);
    this.blocks.clear();
    for (const k of KINDS) {
      this.geometry[k].near.dispose();
      this.geometry[k].far.dispose();
    }
    this.material.dispose();
    this.group.removeFromParent();
  }

  /** Horizontal distance from the camera to the nearest point of block (bi, bj). */
  private nearest(bi: number, bj: number, camera: Vector3): number {
    const nx = Math.max(bi * TREE_BLOCK_M, Math.min(camera.x, (bi + 1) * TREE_BLOCK_M)) - camera.x;
    const nz = Math.max(bj * TREE_BLOCK_M, Math.min(camera.z, (bj + 1) * TREE_BLOCK_M)) - camera.z;
    return Math.hypot(nx, nz);
  }

  /** Puts each tree in the near mesh (within `detailM` of the camera, 3-D) or the far one. */
  private split(b: Block, camera: Vector3, detailM: number): void {
    b.splitX = camera.x;
    b.splitY = camera.y;
    b.splitZ = camera.z;
    b.hasNear = false;
    for (const st of b.stands) {
      const n = st.xz.length / 2;
      const farM = st.far.instanceMatrix.array as Float32Array;
      const nearM = st.near.instanceMatrix.array as Float32Array;
      const farC = st.far.instanceColor?.array as Float32Array;
      const nearC = st.near.instanceColor?.array as Float32Array;
      let f = 0;
      let k = 0;
      if (detailM < 0) {
        farM.set(st.matrices);
        farC.set(st.colors);
        f = n;
      } else {
        const r2 = detailM * detailM;
        const dy = camera.y - b.center.y;
        for (let t = 0; t < n; t++) {
          const dx = st.xz[t * 2] - camera.x;
          const dz = st.xz[t * 2 + 1] - camera.z;
          const near = dx * dx + dz * dz + dy * dy < r2;
          const m = near ? nearM : farM;
          const c = near ? nearC : farC;
          const slot = near ? k++ : f++;
          m.set(st.matrices.subarray(t * 16, t * 16 + 16), slot * 16);
          c.set(st.colors.subarray(t * 3, t * 3 + 3), slot * 3);
        }
      }
      st.far.count = f;
      st.near.count = k;
      st.far.visible = f > 0;
      st.near.visible = k > 0;
      st.far.instanceMatrix.needsUpdate = true;
      st.near.instanceMatrix.needsUpdate = true;
      if (st.far.instanceColor) st.far.instanceColor.needsUpdate = true;
      if (st.near.instanceColor) st.near.instanceColor.needsUpdate = true;
      if (k > 0) b.hasNear = true;
    }
  }

  private build(bi: number, bj: number, key: string): Block {
    const s = this.settings as TreeSettings;
    const spots = treesInBlock(this.ground, bi, bj, s.spacingM);
    const center = new Vector3((bi + 0.5) * TREE_BLOCK_M, 0, (bj + 0.5) * TREE_BLOCK_M);
    center.y = this.ground.heightAt(center.x, center.z);
    const group = new Group();
    group.position.copy(center);
    const stands: Stand[] = [];
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const p = new Vector3();
    const scale = new Vector3();
    const tint = new Color();
    for (const kind of KINDS) {
      const mine = spots.filter((t) => t.kind === kind);
      if (mine.length === 0) continue;
      const matrices = new Float32Array(mine.length * 16);
      const colors = new Float32Array(mine.length * 3);
      const xz = new Float32Array(mine.length * 2);
      mine.forEach((t, k) => {
        p.set(t.x - center.x, t.y - center.y, t.z - center.z);
        q.setFromAxisAngle(up, t.yaw);
        // A little wider or slimmer, tree by tree; broadleaf crowns spread to close the canopy.
        const w = t.height * ((kind === 'broadleaf' ? 1.05 : 0.85) + 0.3 * ((t.shade * 7.13) % 1));
        scale.set(w, t.height, w);
        m.compose(p, q, scale).toArray(matrices, k * 16);
        tint.setScalar(0.82 + 0.36 * t.shade);
        if (kind === 'broadleaf') tint.g *= 0.94 + 0.12 * ((t.shade * 3.7) % 1);
        tint.toArray(colors, k * 3);
        xz[k * 2] = t.x;
        xz[k * 2 + 1] = t.z;
      });
      const far = new InstancedMesh(this.geometry[kind].far, this.material, mine.length);
      const near = new InstancedMesh(this.geometry[kind].near, this.material, mine.length);
      for (const mesh of [far, near]) {
        mesh.instanceMatrix.array.set(matrices);
        mesh.setColorAt(0, tint);
        (mesh.instanceColor?.array as Float32Array).set(colors);
      }
      // Culling against the whole stand, whichever trees each mesh draws.
      far.computeBoundingSphere();
      near.boundingSphere = far.boundingSphere?.clone() ?? null;
      near.count = 0;
      near.visible = false;
      group.add(far, near);
      stands.push({ kind, matrices, colors, xz, far, near });
    }
    this.group.add(group);
    return { key, center, group, stands, splitX: Number.NaN, splitY: Number.NaN, splitZ: Number.NaN, hasNear: false };
  }

  private free(b: Block): void {
    for (const st of b.stands) {
      st.far.dispose();
      st.near.dispose();
    }
    b.group.removeFromParent();
  }
}
