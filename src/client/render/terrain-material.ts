import { type DataArrayTexture, MeshStandardMaterial, type Texture, Vector2, Vector3 } from 'three';
import { LAND_RELIEF_M_PER_STEP } from './terrain/land-map.ts';
import type { LandTexture } from './terrain/land-texture.ts';

export interface TerrainTextures {
  farm: Texture;
  forest: Texture;
  mountain: Texture;
  ground: { albedo: DataArrayTexture; normal: DataArrayTexture; means: Vector3[] };
}

/**
 * How much close-up ground the terrain draws (spec revision 45): none (the satellite photos only), one scale of the
 * ground materials, or two (a second, coarser sampling breaks up the repeat and carries the detail further out).
 */
export type GroundDetail = 0 | 1 | 2;

/** How much of the sky's light the terrain takes (1 elsewhere): the sun shapes the hills more (revision 48). */
export const TERRAIN_SKY_LIGHT = 0.8;

/** Ground covered by one repeat of a ground material, metres: about 2 cm a pixel. */
export const GROUND_TILE_M = 20;
/** One repeat of the tree-crown layer far forests show (revision 48), metres: crowns 2.5–5 m across. */
export const CANOPY_TILE_M = 48;
/** The canopy layer's index in the ground texture arrays (assets.ts GROUND_LAYERS). */
const CANOPY_LAYER = 5;

/** The coarser second sampling, metres (rotated, so the two never line up). */
export const GROUND_TILE_FAR_M = 97;

/** Where the ground materials give way to the photos, by detail level: [full until, gone at], metres. */
export const GROUND_FADE_M: Readonly<Record<GroundDetail, readonly [number, number]>> = {
  0: [0, 1],
  1: [700, 3200],
  2: [1400, 6500],
};

/**
 * Terrain material that paints real satellite photos by land class (see TerrainMesh's `landClass`/`landExtra`
 * attributes) and, near the camera, the game's own ground materials (grass, ploughed soil, forest floor, rock, sand)
 * with their relief. It extends MeshStandardMaterial so sun, image-based lighting and fog work as usual.
 *
 * Each photo is sampled twice (true scale, and rotated/rescaled) and mixed by low-frequency noise so the tiling
 * doesn't repeat visibly. The ground materials follow the photo's colour, so fields keep their patchwork and nothing
 * pops where they fade out. Revision 45 also grades the photos a little brighter and more vivid.
 */
export function createTerrainMaterial(t: TerrainTextures, land: LandTexture, detail: GroundDetail = 2): MeshStandardMaterial {
  // Less light from the whole sky than other things get, so the sun shapes the hills more (revision 48).
  const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: TERRAIN_SKY_LIGHT });
  // The land map's texel centres sit on the height samples.
  const n = land.resolution;
  const landUv = new Vector2((n - 1) / (n * land.sizeM), 0.5);
  // Where far forests change from 3-D trees to tree crowns painted on the ground (setTreeRange).
  const trees = new Vector2(0, 1);
  material.userData.csTrees = trees;
  const fade = new Vector3(GROUND_FADE_M[detail][0], GROUND_FADE_M[detail][1], 0);
  material.defines = { CS_GROUND: detail };
  material.userData.csFade = fade;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.csFarm = { value: t.farm };
    shader.uniforms.csForest = { value: t.forest };
    shader.uniforms.csMountain = { value: t.mountain };
    shader.uniforms.csGround = { value: t.ground.albedo };
    shader.uniforms.csGroundN = { value: t.ground.normal };
    shader.uniforms.csMeans = { value: t.ground.means };
    shader.uniforms.csFade = { value: fade };
    shader.uniforms.csLand = { value: land.texture };
    shader.uniforms.csLandUv = { value: landUv };
    shader.uniforms.csLandN = { value: land.normals };
    shader.uniforms.csTrees = { value: trees };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 landClass;
attribute vec4 landExtra;
varying vec4 vCsClass;
varying vec4 vCsExtra;
varying vec2 vCsWorldXZ;
varying float vCsViewDist;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 csWorld = modelMatrix * vec4(transformed, 1.0);
vCsWorldXZ = csWorld.xz;
vCsViewDist = distance(csWorld.xyz, cameraPosition);
vCsClass = landClass;
vCsExtra = landExtra;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D csFarm;
uniform sampler2D csForest;
uniform sampler2D csMountain;
uniform highp sampler2DArray csGround;
uniform highp sampler2DArray csGroundN;
uniform vec3 csMeans[6];
uniform vec3 csFade;
uniform sampler2D csLand;
uniform sampler2D csLandN;
uniform vec2 csLandUv;
uniform vec2 csTrees;
varying vec4 vCsClass;
varying vec4 vCsExtra;
varying vec2 vCsWorldXZ;
varying float vCsViewDist;
vec3 csGroundNormal;
float csGroundShare;
// Land weights (revision 48): farm, forest, mountain, sand; and water, snow, town, marsh. Forest, water and towns come
// from the land map, the rest from the vertices.
vec4 csW;
vec4 csX;

float csHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float csNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(csHash(i), csHash(i + vec2(1.0, 0.0)), u.x), mix(csHash(i + vec2(0.0, 1.0)), csHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// tileM: ground size of the photo in meters (true scale for the first sample).
vec3 csPhoto(sampler2D tex, vec2 p, float tileM) {
  vec2 uvA = p / tileM;
  vec2 q = mat2(0.7986, -0.6018, 0.6018, 0.7986) * p; // rotated 37 degrees
  vec2 uvB = q / (tileM * 0.73) + vec2(0.37, 0.61);
  float m = smoothstep(0.3, 0.7, csNoise(p / 9000.0));
  return mix(texture2D(tex, uvA).rgb, texture2D(tex, uvB).rgb, m);
}
// A brighter, more vivid grade of the satellite colours (revision 45): the stylized look.
vec3 csGrade(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, 1.35), vec3(0.0));
  return pow(c, vec3(0.92)) * 1.08;
}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 csLandXY = vCsWorldXZ * csLandUv.x + csLandUv.y;
vec4 csLandAt = texture2D(csLand, csLandXY);
// The ground's slope at every pixel (revision 48): far chunks' own normals smooth the hills away.
vec2 csSlope = texture2D(csLandN, csLandXY).rg * 2.0 - 1.0;
csW = vec4(0.0, csLandAt.b, vCsClass.z, vCsClass.w);
// Far chunks' vertices can disagree with the map: keep the shares adding up to one.
float csRest = csW.z + csW.w;
if (csRest > 1.0 - csW.y) csW.zw *= (1.0 - csW.y) / csRest;
csW.x = max(0.0, 1.0 - csW.y - csW.z - csW.w);
csX = vec4(csLandAt.r, vCsExtra.y, csLandAt.g, vCsExtra.w);
// Ridge (+1) or valley (−1): height against the mean round it.
float csRelief = clamp((csLandAt.a * 255.0 - 128.0) * ${LAND_RELIEF_M_PER_STEP.toFixed(1)} / 140.0, -1.0, 1.0);
vec3 csColor = csPhoto(csFarm, vCsWorldXZ, 18000.0) * csW.x
  + csPhoto(csForest, vCsWorldXZ, 12000.0) * csW.y
  + csPhoto(csMountain, vCsWorldXZ, 14000.0) * csW.z
  + vec3(0.62, 0.53, 0.33) * csW.w;
csColor = csGrade(csColor);
// Forests from afar read as the 3-D trees' canopy (revision 45): lumpy green, not the photo's near-black.
float csCanopy = 0.72 + 0.28 * csNoise(vCsWorldXZ / 26.0) + 0.18 * (csNoise(vCsWorldXZ / 310.0) - 0.5);
csColor = mix(csColor, vec3(0.085, 0.22, 0.04) * csCanopy, csW.y * 0.85);
csGroundNormal = normalize(vec3(csSlope.x, sqrt(max(0.0, 1.0 - dot(csSlope, csSlope))), csSlope.y));
csGroundShare = 0.0;
#if CS_GROUND > 0
// The ground materials near the camera (revision 45), by land class: grass or ploughed soil on farmland (soil where
// the photo is brown), forest floor, rock (also on steep slopes), sand. Each layer is sampled only where it shows;
// the gradients come from outside the branch so the mipmaps stay right.
{
  float near = 1.0 - smoothstep(csFade.x, csFade.y, vCsViewDist);
  float land = (1.0 - csX.x) * (1.0 - 0.85 * csX.z) * (1.0 - 0.7 * csX.y);
  csGroundShare = near * land;
  vec2 uvA = vCsWorldXZ / ${GROUND_TILE_M.toFixed(1)};
  vec2 uvB = mat2(0.8829, -0.4695, 0.4695, 0.8829) * vCsWorldXZ / ${GROUND_TILE_FAR_M.toFixed(1)} + vec2(0.21, 0.67);
  vec2 dAx = dFdx(uvA), dAy = dFdy(uvA), dBx = dFdx(uvB), dBy = dFdy(uvB);
  if (csGroundShare > 0.002) {
    float soilness = smoothstep(-0.015, 0.05, csColor.r - csColor.g) * csW.x;
    float steep = 1.0 - smoothstep(0.78, 0.9, csGroundNormal.y);
    float w[5];
    w[0] = csW.x - soilness * 0.85;
    w[1] = soilness * 0.85;
    w[2] = csW.y;
    w[3] = csW.z;
    w[4] = csW.w;
    for (int i = 0; i < 5; i++) w[i] *= 1.0 - steep;
    w[3] += steep;
    // Ragged borders: each layer's share rises and falls with its own noise, then the strongest wins.
    float total = 0.0;
    for (int i = 0; i < 5; i++) {
      float n = csNoise(vCsWorldXZ / 9.0 + float(i) * 17.3) * 0.7 + csNoise(vCsWorldXZ / 2.3 + float(i) * 5.1) * 0.3;
      w[i] = w[i] > 0.0 ? pow(w[i], 2.0) * (0.35 + 1.3 * n) : 0.0;
      total += w[i];
    }
    vec3 albedo = vec3(0.0);
    vec3 mean = vec3(0.0);
    vec2 bump = vec2(0.0);
    for (int i = 0; i < 5; i++) {
      float wi = w[i] / max(total, 1e-4);
      if (wi < 0.02) continue;
      vec3 a = textureGrad(csGround, vec3(uvA, float(i)), dAx, dAy).rgb;
#if CS_GROUND > 1
      vec3 b = textureGrad(csGround, vec3(uvB, float(i)), dBx, dBy).rgb;
      a *= 0.7 + 0.6 * dot(b, vec3(0.2126, 0.7152, 0.0722)) / max(dot(csMeans[i], vec3(0.2126, 0.7152, 0.0722)), 0.02);
#endif
      albedo += a * wi;
      mean += csMeans[i] * wi;
      bump += (textureGrad(csGroundN, vec3(uvA, float(i)), dAx, dAy).xy * 2.0 - 1.0) * wi;
    }
    // Follow the photo underneath, its brightness more than its hue, so fields keep their patchwork, nothing pops
    // and no field turns red.
    float lumPhoto = dot(csColor, vec3(0.2126, 0.7152, 0.0722));
    float lumMean = max(dot(mean, vec3(0.2126, 0.7152, 0.0722)), 0.01);
    float light = clamp(lumPhoto / lumMean, 0.55, 1.6);
    vec3 hue = clamp((csColor / max(mean, vec3(0.01))) / light, vec3(0.75), vec3(1.3));
    vec3 tint = mix(1.0, light, 0.7) * mix(vec3(1.0), hue, 0.3);
    // Under the trees the forest floor lies in their shade.
    csColor = mix(csColor, albedo * tint * (1.0 - 0.25 * csW.y), csGroundShare);
    csGroundNormal = normalize(vec3(csGroundNormal.x + bump.x * 1.6 * csGroundShare, csGroundNormal.y, csGroundNormal.z - bump.y * 1.6 * csGroundShare));
  }
}
#endif
// Far forests (revision 48): beyond the 3-D trees, tree crowns seen from above, lit by their own relief; further out
// a coarser sampling keeps a texture of clumps of trees. Tinted to the canopy green forests show from afar.
{
  float far = smoothstep(csTrees.x, csTrees.y, vCsViewDist) * csW.y;
  vec2 uvC = vCsWorldXZ / ${CANOPY_TILE_M.toFixed(1)};
  // The coarser sampling turned 37° so the two repeats never line up (its relief is turned back below).
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  vec2 uvD = turn * vCsWorldXZ / ${(CANOPY_TILE_M * 2.7).toFixed(1)} + vec2(0.31, 0.77);
  vec2 cx = dFdx(uvC), cy = dFdy(uvC), dx = dFdx(uvD), dy = dFdy(uvD);
  if (far > 0.01) {
    float coarse = smoothstep(2500.0, 7000.0, vCsViewDist);
    vec3 crowns = mix(textureGrad(csGround, vec3(uvC, ${CANOPY_LAYER}.0), cx, cy).rgb, textureGrad(csGround, vec3(uvD, ${CANOPY_LAYER}.0), dx, dy).rgb, coarse);
    // Each sampling's relief as a lean east (x) and south (z).
    vec2 bA = textureGrad(csGroundN, vec3(uvC, ${CANOPY_LAYER}.0), cx, cy).xy * 2.0 - 1.0;
    vec2 bD = textureGrad(csGroundN, vec3(uvD, ${CANOPY_LAYER}.0), dx, dy).xy * 2.0 - 1.0;
    vec2 lean = mix(vec2(bA.x, -bA.y), transpose(turn) * vec2(bD.x, -bD.y), coarse);
    // Darker than the fields, as woods are from the air.
    vec3 tint = vec3(0.06, 0.155, 0.03) * csCanopy / max(csMeans[${CANOPY_LAYER}], vec3(0.01));
    csColor = mix(csColor, crowns * tint, far);
    csGroundNormal = normalize(vec3(csGroundNormal.x + lean.x * 1.3 * far, csGroundNormal.y, csGroundNormal.z + lean.y * 1.3 * far));
  }
}
// Towns (revision 48: lighter, with red-brown roofs, so they read from afar): concrete and tiled roofs in blocks of
// about 60 m; marshes: dark, olive, with pools.
float csBlock = csNoise(vCsWorldXZ / 60.0);
float csTiles = smoothstep(0.35, 0.65, csNoise(vCsWorldXZ / 23.0 + 3.1));
vec3 csTown = mix(vec3(0.34, 0.33, 0.31), vec3(0.36, 0.16, 0.1), csTiles) * mix(0.7, 1.15, csBlock);
// Parks and gardens keep some of the ground photo.
float csGreen = smoothstep(0.62, 0.75, csNoise(vCsWorldXZ / 230.0 + 7.0));
csColor = mix(csColor, csTown, csX.z * 0.88 * (1.0 - csGreen));
float csPools = smoothstep(0.55, 0.7, csNoise(vCsWorldXZ / 140.0)) * csX.w;
csColor = mix(csColor, csColor * vec3(0.7, 0.78, 0.55), csX.w * 0.7);
csColor = mix(csColor, vec3(0.02, 0.04, 0.045), csPools);
// Water: a deep blue that mirrors the sky at a slant (revision 48: rivers and lakes stand out from afar).
csColor = mix(csColor, vec3(0.02, 0.055, 0.08), csX.x);
csColor = mix(csColor, vec3(0.82, 0.85, 0.9), csX.y * 0.85);
// Ridges a little lighter and valleys a little darker, so hills read from afar (revision 48).
csColor *= 1.0 + 0.2 * csRelief * (1.0 - csX.x);
diffuseColor.rgb *= csColor;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
// The slope from the land map, the ground materials' and the crowns' relief (revision 48: on every pixel).
normal = normalize((viewMatrix * vec4(csGroundNormal, 0.0)).xyz);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.12, max(csX.x, csPools));`,
      );
  };
  material.customProgramCacheKey = () => `lechovia-terrain-v5-${detail}`;
  return material;
}

/** The ground detail a graphics preset draws. */
export function setGroundDetail(material: MeshStandardMaterial, detail: GroundDetail): void {
  if (material.defines?.CS_GROUND === detail) return;
  material.defines = { ...material.defines, CS_GROUND: detail };
  const fade = material.userData.csFade as Vector3 | undefined;
  fade?.set(GROUND_FADE_M[detail][0], GROUND_FADE_M[detail][1], 0);
  material.customProgramCacheKey = () => `lechovia-terrain-v5-${detail}`;
  material.needsUpdate = true;
}

/**
 * Where far forests change from the 3-D trees to crowns painted on the ground (revision 48): the crowns come in over
 * the last quarter of the trees' range, or everywhere when a preset draws no trees.
 */
export function setTreeRange(material: MeshStandardMaterial, rangeM: number | null): void {
  const trees = material.userData.csTrees as Vector2 | undefined;
  if (!trees) return;
  if (rangeM === null) trees.set(0, 1);
  else trees.set(rangeM * 0.7, rangeM * 0.95);
}
