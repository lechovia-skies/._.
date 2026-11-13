import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from 'three';
import type { LoadedMap } from './map-loader.ts';

/** The land map (revision 48) on the graphics card, and where it lies on the map. */
export interface LandTexture {
  texture: DataTexture;
  sizeM: number;
  resolution: number;
}

const made = new WeakMap<LoadedMap, LandTexture>();

/** The land map of a loaded map as a texture, made once and shared by the match and the title screen. */
export function landTexture(map: LoadedMap): LandTexture {
  let t = made.get(map);
  if (!t) {
    const { data, size } = map.land;
    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    texture.colorSpace = NoColorSpace;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    // Rivers and town edges stay sharp at shallow angles (three.js lowers this to what the card allows).
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    t = { texture, sizeM: map.def.sizeM, resolution: size };
    made.set(map, t);
  }
  return t;
}
