import { describe, expect, it } from 'vitest';
import { missileTone, seekerTone } from '../audio/sound-mix.ts';
import { WARNING_CAPTIONS } from './captions.ts';
import { seekerLabel } from './combat-layer.ts';
import { createRadarLock } from '../../shared/targeting/radar-lock.ts';
import { testView } from '../testing/views.ts';
import { weaponsLine } from './weapons-hud.ts';

describe('warning captions', () => {
  it('shows the seeker tone as the weapons-status text the HUD draws', () => {
    for (const mode of ['track', 'locked'] as const) {
      const tone = seekerTone(mode);
      if (tone === 'none') throw new Error(`${mode} should sound`);
      expect(WARNING_CAPTIONS[tone]).toBe(`IR ${seekerLabel(mode)}`);
    }
  });

  it('shows the radar-lock tone with the state the weapons status draws after the radar missile', () => {
    const radarLock = createRadarLock();
    const v = testView(1, { radarLock });
    for (const mode of ['tracking', 'locked'] as const) {
      radarLock.mode = mode;
      const tone = missileTone('off', mode);
      if (tone === 'none') throw new Error(`${mode} should sound`);
      // The Kestrel's AIM-120D is its slot 1: "AIM-120D TRK" against the caption "RDR TRK".
      expect(WARNING_CAPTIONS[tone]).toBe(weaponsLine(v, 1).status.text.replace('AIM-120D', 'RDR'));
    }
  });

  it('has text for every warning sound', () => {
    for (const text of Object.values(WARNING_CAPTIONS)) expect(text.length).toBeGreaterThan(0);
    expect(Object.keys(WARNING_CAPTIONS).sort()).toEqual(['growl', 'hit-taken', 'lock', 'missile-warning', 'radar-lock', 'radar-track', 'rwr-lock']);
  });
});
