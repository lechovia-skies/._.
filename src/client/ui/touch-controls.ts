import { MISSILES } from '../../shared/data/weapons.ts';
import { QUICK_CHAT } from '../../shared/net/protocol.ts';
import { weaponsLine } from '../hud/weapons-hud.ts';
import type { PadAction, PadFrame } from '../input/gamepad.ts';
import type { AircraftView } from '../session/game-session.ts';
import { el } from './choice-group.ts';
import { canFullscreen } from './fullscreen.ts';

/*
 * Touch controls for tablets and phones (revision 39), laid out after the owner's picture: the stick bottom left and
 * the throttle beside it, the weapon buttons bottom right around a big FIRE, the stores along the bottom, pause and the
 * small buttons top left. They act as a gamepad: each frame they make a `PadFrame`, so the game flies a touch pilot
 * exactly as it flies a pad pilot (the stick overrides the mouse-aim autopilot, which holds the heading when let go).
 * A finger dragged anywhere else on the screen turns the pilot's head.
 */

/** Which way the stick climbs: pulled down toward you like a real stick, or pushed up. */
export type TouchClimb = 'pull' | 'push';

/** What FIRE fires: the gun while held, or one missile or bomb per tap. */
export type TouchWeapon = 'gun' | 'missile' | 'bomb';

const STICK_DEAD_ZONE = 0.06;

/**
 * The stick's pitch and roll from the knob's offset (px) in a base of radius `r`: a small dead zone, then a curve that
 * is gentle near the centre for fine aiming and reaches full deflection at the rim.
 */
export function stickAxes(dx: number, dy: number, r: number, climb: TouchClimb): { pitch: number; roll: number } {
  const len = Math.hypot(dx, dy);
  const k = len > r ? r / len : 1;
  const shape = (v: number) => {
    const a = Math.abs(v);
    if (a <= STICK_DEAD_ZONE) return 0;
    const t = (a - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
    return Math.sign(v) * t * (0.35 + 0.65 * t);
  };
  const roll = shape((dx * k) / r);
  const pitch = shape((dy * k) / r) * (climb === 'pull' ? 1 : -1);
  return { pitch: pitch + 0, roll: roll + 0 };
}

/** One store along the bottom: the gun, a missile type, or the bombs. */
export interface StoreCell {
  kind: TouchWeapon;
  /** the missile slot (−1 for the gun and bombs) */
  slot: number;
  name: string;
  count: number;
  /** "180 km", the game's range; '' for the gun */
  range: string;
  selected: boolean;
}

/** The stores of a jet as the bottom panel lists them, the one FIRE fires marked. */
export function storeCells(view: Pick<AircraftView, 'config' | 'stores' | 'loadout'>, slot: number, weapon: TouchWeapon): StoreCell[] {
  const s = view.stores;
  const cells: StoreCell[] = [];
  view.loadout.missiles.forEach((m, i) => {
    const spec = MISSILES[m.missile];
    cells.push({ kind: 'missile', slot: i, name: spec.name, count: s.missiles[i] ?? 0, range: `${Math.round(spec.maxRangeM / 1000)} km`, selected: weapon === 'missile' && i === slot });
  });
  cells.push({ kind: 'gun', slot: -1, name: view.config.stores.cannon, count: s.cannonRounds, range: '', selected: weapon === 'gun' });
  if (view.loadout.bomb && view.loadout.bombs > 0) cells.push({ kind: 'bomb', slot: -1, name: view.loadout.bomb.name, count: s.bombs, range: '', selected: weapon === 'bomb' });
  return cells;
}

/** The touch layer's view of the game, every frame. */
export interface TouchState {
  /** the local jet; null before it exists */
  view: AircraftView | null;
  /** the missile slot selected */
  slot: number;
  /** online: the quick-chat button */
  chat: boolean;
  /** the map screen is open: only the small buttons stay */
  mapOpen: boolean;
  /** waiting to respawn where the jet may be changed: the jet to fly next, else null */
  nextJet: string | null;
}

export interface TouchHandlers {
  /** a missile type picked on the bottom panel or by stepping with the Missile button */
  onSelectMissile(slot: number): void;
  onMap(): void;
  onChat(index: number): void;
}

const ICON = {
  pause: '<path d="M18 12h10v40H18zM36 12h10v40H36z"/>',
  scores: '<path d="M10 14h44v8H10zM10 28h44v8H10zM10 42h44v8H10z"/>',
  map: '<path d="M4 14l18-8 20 8 18-8v44l-18 8-20-8-18 8z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M22 6v44M42 14v44" stroke="currentColor" stroke-width="4"/>',
  view: '<path d="M4 32s10-18 28-18 28 18 28 18-10 18-28 18S4 32 4 32z" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="9"/>',
  chat: '<path d="M8 10h48v32H26l-12 12V42H8z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>',
  lock: '<g fill="none" stroke="currentColor" stroke-width="5"><circle cx="32" cy="32" r="18"/><path d="M32 4v14M32 46v14M4 32h14M46 32h14"/></g><circle cx="32" cy="32" r="4"/>',
  missile: '<path d="M50 6l8 8-30 30-6 2-4 8-4-4 6-6-6-6-6 6-4-4 8-4 2-6z"/>',
  gun: '<path d="M6 24h40l10-6v12H40v6H28l-4 18H14l4-18H6z"/>',
  bomb: '<path d="M32 4c8 0 12 8 12 20v14c0 8-5 14-12 14s-12-6-12-14V24C20 12 24 4 32 4z"/><path d="M24 50l-6 10h28l-6-10z"/>',
  flare: '<circle cx="32" cy="20" r="9"/><path d="M14 58c4-12 10-20 18-24 8 4 14 12 18 24" fill="none" stroke="currentColor" stroke-width="5"/>',
  brake: '<path d="M8 20h48v8H8zM8 36h48v8H8z"/>',
  fire: '<path d="M44 6l10 10-30 30-10 4 4-10z"/><path d="M14 46l4 4-10 8-2-2z"/>',
} as const;

function icon(name: keyof typeof ICON, className: string): HTMLSpanElement {
  const span = el('span', className);
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 64 64" fill="currentColor">${ICON[name]}</svg>`;
  return span;
}

/**
 * The touch layer. `frame()` gives this frame's pad input, `throttleTarget()` the throttle the slider is held at, and
 * `update()` keeps the slider, the counts and the stores in step with the jet.
 */
export class TouchControls {
  readonly element = el('div', 'touch');
  climb: TouchClimb = 'pull';
  private enabled = false;
  private readonly handlers: TouchHandlers;
  private weapon: TouchWeapon = 'missile';
  private state: TouchState = { view: null, slot: 0, chat: false, mapOpen: false, nextJet: null };
  /** buttons held now, and presses since the last frame (a tap between two frames still counts) */
  private readonly held = new Set<PadAction>();
  private readonly taps = new Set<PadAction>();
  private previous = new Set<PadAction>();
  private scoresOn = false;
  private stick = { pitch: 0, roll: 0 };
  private look = { x: 0, y: 0 };
  private throttleHeld: number | null = null;
  private readonly stickBase = el('div', 'touch-stick');
  private readonly knob = el('div', 'touch-knob');
  private readonly throttle = el('div', 'touch-throttle');
  private readonly throttleFill = el('div', 'touch-throttle-fill');
  private readonly throttleThumb = el('div', 'touch-throttle-thumb');
  private readonly throttleText = el('span', 'touch-throttle-text');
  private readonly fuelText = el('span', 'touch-fuel');
  private readonly panel = el('div', 'touch-stores');
  private readonly jetName = el('span', 'touch-jet-name');
  private readonly hpFill = el('span', 'touch-hp-fill');
  private readonly lockText = el('span', 'touch-lock-state');
  private readonly missileCount = el('span', 'touch-badge');
  private readonly gunCount = el('span', 'touch-badge');
  private readonly flareCount = el('span', 'touch-badge');
  private readonly fireLabel = el('span', 'touch-fire-label');
  private readonly buttons: Record<'missile' | 'gun' | 'fire', HTMLButtonElement>;
  private readonly chatButton: HTMLButtonElement;
  private readonly chatMenu = el('div', 'touch-chat-menu');
  private readonly jetPrev = el('button', 'touch-btn touch-jet-arrow', '◀');
  private readonly jetNext = el('button', 'touch-btn touch-jet-arrow', '▶');
  private readonly jetRow = el('div', 'touch-jet-row');
  private readonly nextJetName = el('span', 'touch-label');
  private storesKey = '';

  constructor(root: HTMLElement, handlers: TouchHandlers) {
    this.handlers = handlers;
    const layer = this.element;
    layer.hidden = true;

    // A finger anywhere else turns the head.
    const look = el('div', 'touch-look');
    this.drag(look, (dx, dy) => {
      const span = Math.min(window.innerWidth, window.innerHeight) * 0.3;
      this.look.x = Math.max(-1, Math.min(1, dx / span));
      this.look.y = Math.max(-1, Math.min(1, dy / span));
    }, () => {
      this.look.x = 0;
      this.look.y = 0;
    });

    // Top left: pause, scores, map, view, chat (after the fullscreen button, which moves up there).
    const top = el('div', 'touch-top');
    top.classList.toggle('has-fullscreen', canFullscreen());
    const small = (name: keyof typeof ICON, label: string, action: () => void) => {
      const b = el('button', 'touch-btn touch-small');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.appendChild(icon(name, 'touch-icon'));
      this.press(b, action);
      top.appendChild(b);
      return b;
    };
    small('pause', 'Pause', () => this.taps.add('pause'));
    const scores = small('scores', 'Scores', () => {
      this.scoresOn = !this.scoresOn;
      scores.classList.toggle('is-on', this.scoresOn);
    });
    small('map', 'Map', () => this.handlers.onMap());
    small('view', 'Camera view', () => this.taps.add('camera'));
    this.chatButton = small('chat', 'Quick chat', () => {
      this.chatMenu.hidden = !this.chatMenu.hidden;
    });
    this.chatMenu.hidden = true;
    QUICK_CHAT.forEach((line, i) => {
      const b = el('button', 'touch-chat-line', line);
      b.type = 'button';
      this.press(b, () => {
        this.handlers.onChat(i);
        this.chatMenu.hidden = true;
      });
      this.chatMenu.appendChild(b);
    });
    top.appendChild(this.chatMenu);

    // The stick.
    this.stickBase.appendChild(this.knob);
    this.stickBase.setAttribute('aria-label', 'Flight stick');
    this.drag(this.stickBase, (_dx, _dy, e) => {
      const rect = this.stickBase.getBoundingClientRect();
      const r = rect.width / 2;
      const ox = e.clientX - (rect.left + r);
      const oy = e.clientY - (rect.top + r);
      const len = Math.hypot(ox, oy);
      const k = len > r ? r / len : 1;
      this.knob.style.transform = `translate(${ox * k}px, ${oy * k}px)`;
      this.stick = stickAxes(ox, oy, r, this.climb);
    }, () => {
      this.knob.style.transform = '';
      this.stick = { pitch: 0, roll: 0 };
    });

    // The throttle: drag anywhere on it; AB above 90 %. The brake is held under it.
    const throttleBox = el('div', 'touch-throttle-box');
    this.throttle.append(this.throttleFill, this.throttleThumb);
    this.throttle.setAttribute('aria-label', 'Throttle');
    const setThrottle = (e: PointerEvent) => {
      const rect = this.throttle.getBoundingClientRect();
      this.throttleHeld = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      this.showThrottle(this.throttleHeld);
    };
    this.drag(this.throttle, (_dx, _dy, e) => setThrottle(e), () => (this.throttleHeld = null), setThrottle);
    const brake = el('button', 'touch-btn touch-brake');
    brake.type = 'button';
    brake.setAttribute('aria-label', 'Airbrake');
    brake.append(icon('brake', 'touch-icon'), el('span', 'touch-label', 'Brake'));
    this.hold(brake, 'airbrake');
    throttleBox.append(this.throttleText, this.throttle, this.fuelText, brake);

    // The weapon buttons around FIRE.
    const cluster = el('div', 'touch-weapons');
    const round = (name: keyof typeof ICON, label: string, className: string, badge?: HTMLElement) => {
      const b = el('button', `touch-btn touch-round ${className}`);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.append(icon(name, 'touch-icon'), el('span', 'touch-label', label));
      if (badge) b.appendChild(badge);
      cluster.appendChild(b);
      return b;
    };
    const lock = round('lock', 'Lock', 'touch-lock');
    this.press(lock, () => this.taps.add('nextTarget'));
    const missile = round('missile', 'Missile', 'touch-missile', this.missileCount);
    this.press(missile, () => {
      // Missile again steps to the next missile type.
      const missiles = this.state.view?.loadout.missiles.length ?? 0;
      if (this.weapon === 'missile' && missiles > 1) this.handlers.onSelectMissile((this.state.slot + 1) % missiles);
      this.weapon = 'missile';
      this.refreshWeapon();
    });
    const gun = round('gun', 'Gun', 'touch-gun', this.gunCount);
    this.press(gun, () => {
      this.weapon = 'gun';
      this.refreshWeapon();
    });
    const flare = round('flare', 'Flare', 'touch-flare', this.flareCount);
    this.press(flare, () => this.taps.add('flares'));
    const fire = el('button', 'touch-btn touch-fire');
    fire.type = 'button';
    fire.setAttribute('aria-label', 'Fire');
    fire.append(icon('fire', 'touch-icon'), this.fireLabel);
    cluster.appendChild(fire);
    this.press(
      fire,
      () => {
        if (this.weapon === 'gun') this.held.add('cannon');
        else this.taps.add(this.weapon === 'bomb' ? 'bomb' : 'missile');
      },
      () => this.held.delete('cannon'),
    );
    this.buttons = { missile, gun, fire };

    // The stores along the bottom: the jet and its health, each weapon (tap to choose it), the lock state.
    const jet = el('div', 'touch-jet');
    const hp = el('span', 'touch-hp');
    hp.appendChild(this.hpFill);
    jet.append(this.jetName, hp);
    const storesBox = el('div', 'touch-stores-box');
    storesBox.append(jet, this.panel, this.lockText);

    // While waiting to respawn: the next jet.
    this.jetRow.hidden = true;
    for (const [b, action] of [[this.jetPrev, 'rudderLeft'], [this.jetNext, 'rudderRight']] as const) {
      b.type = 'button';
      this.press(b, () => this.taps.add(action));
    }
    this.jetPrev.setAttribute('aria-label', 'Previous jet');
    this.jetNext.setAttribute('aria-label', 'Next jet');
    this.jetRow.append(this.jetPrev, this.nextJetName, this.jetNext);

    const rotate = el('p', 'touch-rotate', 'Turn your device sideways to fly.');
    layer.append(look, top, this.stickBase, throttleBox, storesBox, cluster, this.jetRow, rotate);
    root.appendChild(layer);
    this.refreshWeapon();
  }

  /** Shows the layer (a touch screen in use) or hides it (a mouse and keyboard, or a gamepad). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.element.hidden = !on;
    // The page's own corner pieces (the fullscreen button, the room's badge) make way.
    document.body.classList.toggle('touch-on', on);
    if (!on) this.release();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Hidden under a menu or results (they are drawn above it anyway); everything held is let go. */
  setSuspended(suspended: boolean): void {
    this.element.classList.toggle('is-suspended', suspended);
    if (suspended) this.release();
  }

  /** This frame's input, as a gamepad would give it. */
  frame(): PadFrame {
    const down = new Set(this.held);
    if (this.scoresOn) down.add('scores');
    const pressed = new Set<PadAction>(this.taps);
    for (const a of down) if (!this.previous.has(a)) pressed.add(a);
    this.previous = down;
    this.taps.clear();
    return { active: this.enabled, pitch: this.stick.pitch, roll: this.stick.roll, yaw: 0, throttle: null, throttleRate: 0, lookX: this.look.x, lookY: this.look.y, down, pressed };
  }

  /** The throttle the slider is held at, or null when no finger is on it. */
  throttleTarget(): number | null {
    return this.throttleHeld;
  }

  /** Keeps the controls in step with the game (cheap: text and styles change only when they differ). */
  update(state: TouchState): void {
    if (!this.enabled) return;
    this.state = state;
    this.element.classList.toggle('is-map', state.mapOpen);
    this.chatButton.hidden = !state.chat;
    if (!state.chat) this.chatMenu.hidden = true;
    const v = state.view;
    const dead = v !== null && !v.alive;
    this.element.classList.toggle('is-dead', dead);
    this.jetRow.hidden = !dead || state.nextJet === null;
    this.text(this.nextJetName, `Next jet · ${state.nextJet ?? ''}`);
    if (!v) return;
    if (this.throttleHeld === null) this.showThrottle(v.flight.throttle);
    const fuel = v.stores.fuelKg / v.config.physics.fuelKg;
    this.text(this.fuelText, `FUEL ${Math.round(fuel * 100)}%`);
    this.fuelText.classList.toggle('is-low', fuel < 0.2);
    this.text(this.jetName, v.config.name);
    const hp = Math.max(0, Math.min(1, v.hp / v.config.damage.hitPoints));
    const width = `${Math.round(hp * 100)}%`;
    if (this.hpFill.style.width !== width) this.hpFill.style.width = width;
    this.hpFill.classList.toggle('is-low', hp < 0.3);
    // No bombs left (or none on this jet): FIRE goes back to a missile.
    if (this.weapon === 'bomb' && !(v.loadout.bomb && v.stores.bombs > 0)) this.weapon = 'missile';
    if (this.weapon === 'missile' && v.loadout.missiles.length === 0) this.weapon = 'gun';
    const cells = storeCells(v, state.slot, this.weapon);
    const key = JSON.stringify(cells);
    if (key !== this.storesKey) {
      this.storesKey = key;
      this.panel.replaceChildren(
        ...cells.map((c) => {
          const b = el('button', `touch-store${c.selected ? ' is-selected' : ''}${c.count <= 0 ? ' is-empty' : ''}`);
          b.type = 'button';
          b.append(el('span', 'touch-store-name', c.name), el('span', 'touch-store-count', String(c.count)));
          if (c.range) b.appendChild(el('span', 'touch-store-range', c.range));
          this.press(b, () => {
            this.weapon = c.kind;
            if (c.kind === 'missile') this.handlers.onSelectMissile(c.slot);
            this.refreshWeapon();
          });
          return b;
        }),
      );
    }
    const selected = v.loadout.missiles[state.slot];
    this.text(this.missileCount, selected ? String(v.stores.missiles[state.slot] ?? 0) : '0');
    this.text(this.gunCount, String(v.stores.cannonRounds));
    this.text(this.flareCount, String(v.stores.flares));
    const line = weaponsLine(v, state.slot);
    this.text(this.lockText, this.weapon === 'missile' ? line.status.text : '');
    this.lockText.dataset.tone = line.status.tone;
    this.refreshWeapon();
  }

  dispose(): void {
    document.body.classList.remove('touch-on');
    this.element.remove();
  }

  private refreshWeapon(): void {
    this.buttons.missile.classList.toggle('is-selected', this.weapon === 'missile');
    this.buttons.gun.classList.toggle('is-selected', this.weapon === 'gun');
    this.text(this.fireLabel, this.weapon === 'gun' ? 'Fire · Gun' : this.weapon === 'bomb' ? 'Fire · Bomb' : 'Fire');
  }

  private showThrottle(t: number): void {
    const pct = `${Math.round(t * 100)}%`;
    if (this.throttleFill.style.height !== pct) {
      this.throttleFill.style.height = pct;
      this.throttleThumb.style.bottom = pct;
    }
    this.text(this.throttleText, t > 0.9 ? 'AB' : `${Math.round((t / 0.9) * 100)}%`);
    this.throttle.classList.toggle('is-ab', t > 0.9);
  }

  private text(e: HTMLElement, value: string): void {
    if (e.textContent !== value) e.textContent = value;
  }

  private release(): void {
    this.held.clear();
    this.stick = { pitch: 0, roll: 0 };
    this.look = { x: 0, y: 0 };
    this.throttleHeld = null;
    this.knob.style.transform = '';
  }

  /**
   * A button pressed by a finger (or a mouse, for testing): `down` on the touch, `up` when it lifts or slides off. The
   * touch still reaches the page (it starts the sound), but no mouse events or zoom come of it.
   */
  private press(b: HTMLElement, down: () => void, up?: () => void): void {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('is-down');
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        // A synthetic or already-ended pointer cannot be captured; the press still counts.
      }
      down();
    });
    const end = () => {
      if (!b.classList.contains('is-down')) return;
      b.classList.remove('is-down');
      up?.();
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('lostpointercapture', end);
  }

  /** A button held: the action stays down while the finger is on it. */
  private hold(b: HTMLElement, action: PadAction): void {
    this.press(b, () => this.held.add(action), () => this.held.delete(action));
  }

  /** A drag with one finger: `move` with the offset from where it started, `end` when it lifts. */
  private drag(target: HTMLElement, move: (dx: number, dy: number, e: PointerEvent) => void, end: () => void, start?: (e: PointerEvent) => void): void {
    let id: number | null = null;
    let x0 = 0;
    let y0 = 0;
    target.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // See press().
      }
      start?.(e);
      move(0, 0, e);
    });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      move(e.clientX - x0, e.clientY - y0, e);
    });
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      end();
    };
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  }
}
