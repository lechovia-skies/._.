import { type Mesh, type PlaneGeometry, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CloudField, WEATHER } from '../../../shared/world/weather.ts';
import { CloudLayer, DECK_SEGMENTS, PUFF_BUMPS, puffTexel } from './cloud-layer.ts';

describe('the overcast deck', () => {
  it('is drawn in tiles of a few kilometres, not as one quad 400 km across (revision 25)', () => {
    // Regression: from just under the deck, its two huge triangles failed to hide what lay beyond.
    const scene = new Scene();
    const layer = new CloudLayer(scene, new CloudField(WEATHER.overcast, 7), 30000);
    for (const name of ['cloud-deck-top', 'cloud-deck-base']) {
      const mesh = scene.getObjectByName(name) as Mesh<PlaneGeometry>;
      expect(mesh.geometry.parameters.widthSegments).toBe(DECK_SEGMENTS);
      expect(mesh.geometry.parameters.width / DECK_SEGMENTS).toBeLessThanOrEqual(8000);
    }
    layer.dispose();
  });
});

describe('the cumulus puff (revision 46)', () => {
  it('is lit on top, shaded underneath, and has a crisp outline and a soft flat base', () => {
    const [topLight, topAlpha] = puffTexel(0.5, 0.33);
    const [baseLight, baseAlpha] = puffTexel(0.5, 0.74);
    expect(topAlpha).toBe(1);
    expect(baseAlpha).toBeGreaterThan(0.3);
    expect(topLight).toBeGreaterThan(baseLight + 0.2);
    // Off the puff, and under its flat base: nothing.
    expect(puffTexel(0.02, 0.02)).toEqual([0, 0]);
    expect(puffTexel(0.5, 0.86)[1]).toBe(0);
    // The fringe is narrow: just inside the main dome's edge it is already mostly opaque.
    const [b] = PUFF_BUMPS;
    expect(puffTexel(b[0] + b[2] * 0.85, b[1] + 0.05)[1]).toBeGreaterThan(0.9);
  });
});
