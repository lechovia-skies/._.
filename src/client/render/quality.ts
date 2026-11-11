import type { ShadowSettings } from './environment/environment.ts';
import type { GroundDetail } from './terrain-material.ts';
import type { GrassSettings } from './world/grass.ts';
import type { TreeSettings } from './world/trees.ts';

/** Graphics presets (spec §24, M1c). */
export type QualityLevel = 'low' | 'medium' | 'high';
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

export interface QualityPreset {
  /** cap on device pixels per CSS pixel */
  pixelRatio: number;
  antialias: boolean;
  /** share of smoke and fire particles kept */
  particles: number;
  /** texture anisotropy for the ground photos */
  anisotropy: number;
  /** terrain detail: a ground chunk splits when nearer than this many chunk widths (M4) */
  terrainDetail: number;
  /** cumulus clouds are drawn within this range, metres (M4) */
  cloudRangeM: number;
  /** the close-up ground materials: one sampling, or two reaching further (revision 45) */
  groundDetail: GroundDetail;
  /** 3-D trees: how far and how dense (revision 45) */
  trees: TreeSettings;
  /** sun shadows round the camera, or none (revision 46) */
  shadows: ShadowSettings | null;
  /** 3-D grass round the camera when low (revision 46) */
  grass: GrassSettings;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: { pixelRatio: 0.75, antialias: false, particles: 0.5, anisotropy: 2, terrainDetail: 1.1, cloudRangeM: 20000, groundDetail: 1, trees: { rangeM: 1400, spacingM: 24, detailM: 450 }, shadows: null, grass: { radiusM: 32, spacingM: 1.6 } },
  medium: { pixelRatio: 1, antialias: true, particles: 0.75, anisotropy: 8, terrainDetail: 1.4, cloudRangeM: 30000, groundDetail: 2, trees: { rangeM: 2000, spacingM: 19, detailM: 650 }, shadows: { mapSize: 1536, halfM: 280 }, grass: { radiusM: 48, spacingM: 1.2 } },
  high: { pixelRatio: 2, antialias: true, particles: 1, anisotropy: 16, terrainDetail: 1.8, cloudRangeM: 40000, groundDetail: 2, trees: { rangeM: 2600, spacingM: 16, detailM: 900 }, shadows: { mapSize: 2048, halfM: 400 }, grass: { radiusM: 64, spacingM: 1 } },
};

/** Screens larger than this many device pixels start Auto on Medium (a Retina laptop panel stays on High; 4K drops). */
export const LARGE_SCREEN_PX = 6_000_000;

/** Auto's first guess: High, or Medium on very large screens. */
export function initialAutoLevel(cssWidth: number, cssHeight: number, devicePixelRatio: number): QualityLevel {
  const ratio = Math.min(devicePixelRatio, QUALITY_PRESETS.high.pixelRatio);
  return cssWidth * cssHeight * ratio * ratio > LARGE_SCREEN_PX ? 'medium' : 'high';
}

/** The level to use now: the player's choice, or for Auto the level it settled on before (or its first guess). */
export function resolveQuality(
  graphics: 'auto' | QualityLevel,
  autoLevel: QualityLevel | null,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): QualityLevel {
  if (graphics !== 'auto') return graphics;
  return autoLevel ?? initialAutoLevel(cssWidth, cssHeight, devicePixelRatio);
}

export function lowerLevel(level: QualityLevel): QualityLevel {
  return level === 'high' ? 'medium' : 'low';
}

/** Low frame rate that makes Auto step down, and how long it must last. */
export const SLOW_FPS = 45;
export const SLOW_WINDOW_S = 3;
/** The first seconds of a match (shader compiles, first uploads) do not count. */
export const WARMUP_S = 4;

/**
 * Watches frame times in a match and steps Auto down one level after `SLOW_WINDOW_S` of frames slower than
 * `SLOW_FPS` on average. It never steps back up within a session, so the picture does not keep changing.
 */
export class QualityGovernor {
  level: QualityLevel;
  private elapsedS = 0;
  private windowS = 0;
  private windowFrames = 0;

  constructor(level: QualityLevel) {
    this.level = level;
  }

  /** Feed each frame's duration; returns the new level when it changes, otherwise null. */
  frame(dtS: number): QualityLevel | null {
    if (!(dtS > 0) || dtS > 1) return null;
    this.elapsedS += dtS;
    if (this.elapsedS < WARMUP_S || this.level === 'low') return null;
    this.windowS += dtS;
    this.windowFrames++;
    if (this.windowS < SLOW_WINDOW_S) return null;
    const fps = this.windowFrames / this.windowS;
    this.windowS = 0;
    this.windowFrames = 0;
    if (fps >= SLOW_FPS) return null;
    this.level = lowerLevel(this.level);
    // Give the new level its own warm-up before judging it.
    this.elapsedS = 0;
    return this.level;
  }
}
