import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RGFormat, UnsignedByteType } from 'three';
import type { LoadedMap } from './map-loader.ts';

/** The land map (revision 48) on the graphics card, and where it lies on the map. */
export interface LandTexture {
  texture: DataTexture;
  /** the ground's slope per sample (RG: normal x and z) */
  normals: DataTexture;
  sizeM: number;
  resolution: number;
}

const made = new WeakMap<LoadedMap, LandTexture>();

/** The land map of a loaded map as a texture, made once and shared by the match and the title screen. */
export function landTexture(map: LoadedMap): LandTexture {
  let t = made.get(map);
  if (!t) {
    const { data, normals, size } = map.land;
    const make = (pixels: Uint8Array, format: typeof RGBAFormat | typeof RGFormat) => {
      const texture = new DataTexture(pixels, size, size, format, UnsignedByteType);
      texture.colorSpace = NoColorSpace;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      // Rivers, town edges and hillsides stay sharp at shallow angles (three.js lowers this to what the card allows).
      texture.anisotropy = 8;
      // Rows of two bytes are not 4-byte aligned.
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      return texture;
    };
    t = { texture: make(data, RGBAFormat), normals: make(normals, RGFormat), sizeM: map.def.sizeM, resolution: size };
    made.set(map, t);
  }
  return t;
}
