import { DataArrayTexture, LinearMipmapLinearFilter, MirroredRepeatWrapping, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader, Vector3 } from 'three';
import canopyNormalUrl from '../assets/ground/canopy-normal.jpg';
import canopyUrl from '../assets/ground/canopy.jpg';
import forestFloorNormalUrl from '../assets/ground/forest-floor-normal.jpg';
import forestFloorUrl from '../assets/ground/forest-floor.jpg';
import grassNormalUrl from '../assets/ground/grass-normal.jpg';
import grassUrl from '../assets/ground/grass.jpg';
import rockNormalUrl from '../assets/ground/rock-normal.jpg';
import rockUrl from '../assets/ground/rock.jpg';
import sandNormalUrl from '../assets/ground/sand-normal.jpg';
import sandUrl from '../assets/ground/sand.jpg';
import soilNormalUrl from '../assets/ground/soil-normal.jpg';
import soilUrl from '../assets/ground/soil.jpg';
import farmUrl from '../assets/sat-farmland.jpg';
import forestUrl from '../assets/sat-forest.jpg';
import mountainUrl from '../assets/sat-mountain.jpg';
import waterNormalsUrl from '../assets/waternormals.jpg';
import type { LoadProgress } from './load-progress.ts';

/**
 * The close-up ground materials (spec revision 45), drawn by tools/make-ground-textures.ts, in the order of their
 * layers in the texture arrays (the terrain shader's GROUND_* indices). The last, tree crowns seen from above, is
 * what far forests show (revision 48).
 */
export const GROUND_LAYERS = ['grass', 'soil', 'forest-floor', 'rock', 'sand', 'canopy'] as const;
const GROUND_URLS: Readonly<Record<(typeof GROUND_LAYERS)[number], [string, string]>> = {
  grass: [grassUrl, grassNormalUrl],
  soil: [soilUrl, soilNormalUrl],
  'forest-floor': [forestFloorUrl, forestFloorNormalUrl],
  rock: [rockUrl, rockNormalUrl],
  sand: [sandUrl, sandNormalUrl],
  canopy: [canopyUrl, canopyNormalUrl],
};

/** The ground materials as two texture arrays, colour and normals, one layer a material. */
export interface GroundSet {
  albedo: DataArrayTexture;
  normal: DataArrayTexture;
  /** each layer's average colour (linear), to tint a material toward the satellite photo under it */
  means: Vector3[];
}

/** The textures of the scenery: satellite photos for the land from afar, the ground materials close up. */
export interface SceneryTextures {
  farm: Texture;
  forest: Texture;
  mountain: Texture;
  ground: GroundSet;
  waterNormals: Texture;
}

/** three.js lowers this to what the graphics card supports, so loading needs no renderer. */
const ANISOTROPY = 8;

export async function loadSceneryTextures(progress?: LoadProgress): Promise<SceneryTextures> {
  const loader = new TextureLoader();
  const track = <T>(p: Promise<T>) => (progress ? progress.track(p) : p);
  const load = (url: string) => track(loader.loadAsync(url));
  const [[farm, forest, mountain, waterNormals], ground] = await Promise.all([Promise.all([farmUrl, forestUrl, mountainUrl, waterNormalsUrl].map(load)), track(loadGroundSet())]);
  // Real photos are not seamless: mirrored tiling hides the edges.
  for (const photo of [farm, forest, mountain]) {
    photo.colorSpace = SRGBColorSpace;
    photo.wrapS = MirroredRepeatWrapping;
    photo.wrapT = MirroredRepeatWrapping;
    photo.anisotropy = ANISOTROPY;
  }
  waterNormals.colorSpace = NoColorSpace;
  waterNormals.wrapS = RepeatWrapping;
  waterNormals.wrapT = RepeatWrapping;
  return { farm, forest, mountain, ground, waterNormals };
}

async function decode(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Decodes the ground textures and packs them, a layer each, into an RGBA texture array. */
async function loadGroundSet(): Promise<GroundSet> {
  const images = await Promise.all(GROUND_LAYERS.map((name) => Promise.all(GROUND_URLS[name].map(decode))));
  const size = images[0][0].naturalWidth;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available in this browser');
  const layerBytes = size * size * 4;
  const albedo = new Uint8Array(layerBytes * GROUND_LAYERS.length);
  const normal = new Uint8Array(layerBytes * GROUND_LAYERS.length);
  const means: Vector3[] = [];
  images.forEach(([colour, bump], layer) => {
    ctx.drawImage(colour, 0, 0, size, size);
    const c = ctx.getImageData(0, 0, size, size).data;
    albedo.set(c, layer * layerBytes);
    // The average colour, from every 7th pixel.
    const mean = new Vector3();
    let n = 0;
    for (let i = 0; i < c.length; i += 28) {
      mean.x += srgbToLinear(c[i] / 255);
      mean.y += srgbToLinear(c[i + 1] / 255);
      mean.z += srgbToLinear(c[i + 2] / 255);
      n++;
    }
    means.push(mean.divideScalar(n));
    ctx.drawImage(bump, 0, 0, size, size);
    normal.set(ctx.getImageData(0, 0, size, size).data, layer * layerBytes);
  });
  const array = (data: Uint8Array, colorSpace: string) => {
    const t = new DataArrayTexture(data, size, size, GROUND_LAYERS.length);
    t.colorSpace = colorSpace;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = ANISOTROPY;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: array(albedo, SRGBColorSpace), normal: array(normal, NoColorSpace), means };
}

/** Sharper ground at grazing angles costs texture bandwidth: the graphics preset sets how much. */
export function setSceneryAnisotropy(textures: SceneryTextures, anisotropy: number): void {
  for (const t of [textures.farm, textures.forest, textures.mountain, textures.ground.albedo, textures.ground.normal]) {
    if (t.anisotropy === anisotropy) continue;
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
  }
}
