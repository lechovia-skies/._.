import { type DataArrayTexture, MeshStandardMaterial, type Texture, Vector3 } from 'three';

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

/** Ground covered by one repeat of a ground material, metres: about 2 cm a pixel. */
export const GROUND_TILE_M = 20;
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
export function createTerrainMaterial(t: TerrainTextures, detail: GroundDetail = 2): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
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

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 landClass;
attribute vec4 landExtra;
varying vec4 vCsClass;
varying vec4 vCsExtra;
varying vec2 vCsWorldXZ;
varying float vCsViewDist;
varying vec3 vCsNormalW;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 csWorld = modelMatrix * vec4(transformed, 1.0);
vCsWorldXZ = csWorld.xz;
vCsViewDist = distance(csWorld.xyz, cameraPosition);
vCsClass = landClass;
vCsExtra = landExtra;
vCsNormalW = normalize(mat3(modelMatrix) * objectNormal);`,
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
uniform vec3 csMeans[5];
uniform vec3 csFade;
varying vec4 vCsClass;
varying vec4 vCsExtra;
varying vec2 vCsWorldXZ;
varying float vCsViewDist;
varying vec3 vCsNormalW;
vec3 csGroundNormal;
float csGroundShare;

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
        `vec3 csColor = csPhoto(csFarm, vCsWorldXZ, 18000.0) * vCsClass.x
  + csPhoto(csForest, vCsWorldXZ, 12000.0) * vCsClass.y
  + csPhoto(csMountain, vCsWorldXZ, 14000.0) * vCsClass.z
  + vec3(0.62, 0.53, 0.33) * vCsClass.w;
csColor = csGrade(csColor);
// Forests from afar read as the 3-D trees' canopy (revision 45): lumpy green, not the photo's near-black.
float csCanopy = 0.72 + 0.28 * csNoise(vCsWorldXZ / 26.0) + 0.18 * (csNoise(vCsWorldXZ / 310.0) - 0.5);
csColor = mix(csColor, vec3(0.085, 0.22, 0.04) * csCanopy, vCsClass.y * 0.85);
csGroundNormal = normalize(vCsNormalW);
csGroundShare = 0.0;
#if CS_GROUND > 0
// The ground materials near the camera (revision 45), by land class: grass or ploughed soil on farmland (soil where
// the photo is brown), forest floor, rock (also on steep slopes), sand. Each layer is sampled only where it shows;
// the gradients come from outside the branch so the mipmaps stay right.
{
  float near = 1.0 - smoothstep(csFade.x, csFade.y, vCsViewDist);
  float land = (1.0 - vCsExtra.x) * (1.0 - 0.85 * vCsExtra.z) * (1.0 - 0.7 * vCsExtra.y);
  csGroundShare = near * land;
  vec2 uvA = vCsWorldXZ / ${GROUND_TILE_M.toFixed(1)};
  vec2 uvB = mat2(0.8829, -0.4695, 0.4695, 0.8829) * vCsWorldXZ / ${GROUND_TILE_FAR_M.toFixed(1)} + vec2(0.21, 0.67);
  vec2 dAx = dFdx(uvA), dAy = dFdy(uvA), dBx = dFdx(uvB), dBy = dFdy(uvB);
  if (csGroundShare > 0.002) {
    float soilness = smoothstep(-0.015, 0.05, csColor.r - csColor.g) * vCsClass.x;
    float steep = 1.0 - smoothstep(0.78, 0.9, csGroundNormal.y);
    float w[5];
    w[0] = vCsClass.x - soilness * 0.85;
    w[1] = soilness * 0.85;
    w[2] = vCsClass.y;
    w[3] = vCsClass.z;
    w[4] = vCsClass.w;
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
    csColor = mix(csColor, albedo * tint * (1.0 - 0.25 * vCsClass.y), csGroundShare);
    csGroundNormal = normalize(vec3(csGroundNormal.x + bump.x * 1.6 * csGroundShare, csGroundNormal.y, csGroundNormal.z - bump.y * 1.6 * csGroundShare));
  }
}
#endif
// Towns: grey roofs and streets broken up in blocks of about 60 m; marshes: dark, olive, with pools.
float csBlock = csNoise(vCsWorldXZ / 60.0);
vec3 csTown = mix(vec3(0.2, 0.19, 0.18), vec3(0.31, 0.26, 0.22), csBlock) * (0.75 + 0.35 * csNoise(vCsWorldXZ / 17.0));
// Parks and gardens keep some of the ground photo.
float csGreen = smoothstep(0.62, 0.75, csNoise(vCsWorldXZ / 230.0 + 7.0));
csColor = mix(csColor, csTown, vCsExtra.z * 0.75 * (1.0 - csGreen));
float csPools = smoothstep(0.55, 0.7, csNoise(vCsWorldXZ / 140.0)) * vCsExtra.w;
csColor = mix(csColor, csColor * vec3(0.7, 0.78, 0.55), vCsExtra.w * 0.7);
csColor = mix(csColor, vec3(0.02, 0.04, 0.045), csPools);
csColor = mix(csColor, vec3(0.012, 0.03, 0.045), vCsExtra.x);
csColor = mix(csColor, vec3(0.82, 0.85, 0.9), vCsExtra.y * 0.85);
diffuseColor.rgb *= csColor;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#if CS_GROUND > 0
if (csGroundShare > 0.002) normal = normalize((viewMatrix * vec4(csGroundNormal, 0.0)).xyz);
#endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.2, max(vCsExtra.x, csPools));`,
      );
  };
  material.customProgramCacheKey = () => `lechovia-terrain-v3-${detail}`;
  return material;
}

/** The ground detail a graphics preset draws. */
export function setGroundDetail(material: MeshStandardMaterial, detail: GroundDetail): void {
  if (material.defines?.CS_GROUND === detail) return;
  material.defines = { ...material.defines, CS_GROUND: detail };
  const fade = material.userData.csFade as Vector3 | undefined;
  fade?.set(GROUND_FADE_M[detail][0], GROUND_FADE_M[detail][1], 0);
  material.customProgramCacheKey = () => `lechovia-terrain-v3-${detail}`;
  material.needsUpdate = true;
}
