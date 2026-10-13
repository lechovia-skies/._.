/*
 * Fullscreen (revision 26, at the owner's request): a button in the pause menu puts the whole page in fullscreen and
 * back. Esc (the browser's own way out) also leaves it, and pauses the game as before. Revision 29 (the owner found it
 * hard to find): a button in the bottom-right corner of every screen does it at a click.
 */

/** The parts of `document` fullscreen needs, so tests can stand in for it; Safari before 16.4 has the webkit names. */
export interface FullscreenDocument {
  readonly fullscreenElement?: Element | null;
  readonly webkitFullscreenElement?: Element | null;
  readonly fullscreenEnabled?: boolean;
  readonly webkitFullscreenEnabled?: boolean;
  readonly documentElement: {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

const doc = (): FullscreenDocument | null => (typeof document === 'undefined' ? null : (document as unknown as FullscreenDocument));

/** Whether this browser can put the page in fullscreen (iPhone Safari cannot). */
export function canFullscreen(d: FullscreenDocument | null = doc()): boolean {
  if (!d) return false;
  const el = d.documentElement;
  return (d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false) && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function');
}

export function isFullscreen(d: FullscreenDocument | null = doc()): boolean {
  return !!d && (d.fullscreenElement ?? d.webkitFullscreenElement ?? null) !== null;
}

/** Into fullscreen, or out of it. A browser that refuses (no user gesture, a policy) leaves things as they are. */
export async function toggleFullscreen(d: FullscreenDocument | null = doc()): Promise<void> {
  if (!d) return;
  try {
    if (isFullscreen(d)) {
      if (d.exitFullscreen) await d.exitFullscreen();
      else d.webkitExitFullscreen?.();
    } else {
      const el = d.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else el.webkitRequestFullscreen?.();
    }
  } catch {
    // Refused: nothing to undo.
  }
}

export function fullscreenLabel(on: boolean): string {
  return on ? 'Exit fullscreen' : 'Fullscreen';
}

/**
 * A button that toggles fullscreen and names what it will do; hidden where fullscreen is not available. Call the
 * returned function to stop it following fullscreen changes.
 */
export function fullscreenButton(className: string): { button: HTMLButtonElement; dispose: () => void } {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  const d = doc();
  const update = (): void => {
    button.textContent = fullscreenLabel(isFullscreen(d));
  };
  update();
  button.hidden = !canFullscreen(d);
  button.addEventListener('click', () => void toggleFullscreen(d));
  d?.addEventListener('fullscreenchange', update);
  d?.addEventListener('webkitfullscreenchange', update);
  return {
    button,
    dispose: () => {
      d?.removeEventListener('fullscreenchange', update);
      d?.removeEventListener('webkitfullscreenchange', update);
    },
  };
}

/** The corner button shows wherever the mouse is free: not while it steers the jet (pointer lock). */
export function cornerButtonVisible(available: boolean, pointerLocked: boolean): boolean {
  return available && !pointerLocked;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Four corner brackets pointing out (into fullscreen) or in (out of it). */
const ICON_PATHS: Record<'enter' | 'exit', string> = {
  enter: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  exit: 'M9 3v6H3M21 9h-6V3M15 21v-6h6M3 15h6v6',
};

/**
 * The corner button (revision 29): always in the bottom-right corner of the page, over the title screen, the flight
 * and every overlay, one click into fullscreen or out; hidden while the mouse steers the jet, and where fullscreen is
 * not available. Returns a function that removes it.
 */
export function fullscreenCorner(root: HTMLElement): () => void {
  const d = doc();
  const available = canFullscreen(d);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fullscreen-corner';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  svg.appendChild(path);
  button.appendChild(svg);
  const update = (): void => {
    const on = isFullscreen(d);
    path.setAttribute('d', ICON_PATHS[on ? 'exit' : 'enter']);
    const label = fullscreenLabel(on);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.hidden = !cornerButtonVisible(available, document.pointerLockElement !== null);
  };
  update();
  button.addEventListener('click', (e) => {
    // The click belongs to the button alone: it must not also capture the mouse for the game.
    e.stopPropagation();
    void toggleFullscreen(d);
  });
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  d?.addEventListener('fullscreenchange', update);
  d?.addEventListener('webkitfullscreenchange', update);
  document.addEventListener('pointerlockchange', update);
  root.appendChild(button);
  return () => {
    d?.removeEventListener('fullscreenchange', update);
    d?.removeEventListener('webkitfullscreenchange', update);
    document.removeEventListener('pointerlockchange', update);
    button.remove();
  };
}
