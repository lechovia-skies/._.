import { Euler, Matrix4, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { approach, clamp, DEG } from '../../shared/math/units.ts';
import type { WeatherPreset } from '../../shared/world/weather.ts';

export interface CameraTarget {
  position: Vector3;
  quaternion: Quaternion;
  gLoad: number;
  mach: number;
  throttle: number;
  /** look-around direction relative to the view (C / right mouse) */
  lookYaw: number;
  lookPitch: number;
  /** the pilot's eyes in the jet's body frame, for the cockpit view; without it the cockpit view chases instead */
  eye?: Vector3 | null;
}

/**
 * Where the camera flies (revision 34, at the owner's request): in the cockpit (first person), or behind the jet at
 * three distances (third person). V steps through them.
 */
export type CameraView = 'cockpit' | 'near' | 'chase' | 'far';
export const CAMERA_VIEWS: readonly CameraView[] = ['cockpit', 'near', 'chase', 'far'];
export const CAMERA_VIEW_LABELS: Readonly<Record<CameraView, string>> = { cockpit: 'Cockpit', near: 'Chase · close', chase: 'Chase', far: 'Chase · far' };

/** The third-person views: how far behind and above the jet the camera rides, metres. */
export const CHASE_VIEWS: Readonly<Record<Exclude<CameraView, 'cockpit'>, { distance: number; height: number }>> = {
  near: { distance: 17, height: 4 },
  chase: { distance: 30, height: 7 },
  far: { distance: 56, height: 13 },
};

/** The next view after `view` (V), and the one before. */
export function nextCameraView(view: CameraView, step = 1): CameraView {
  const i = CAMERA_VIEWS.indexOf(view);
  return CAMERA_VIEWS[(i + step + CAMERA_VIEWS.length) % CAMERA_VIEWS.length];
}

const FOV = 70;
/** A little wider in the cockpit, where the frame and the panel take part of the view. */
const COCKPIT_FOV = 76;
/** The near plane: the chase camera's, and the cockpit's, where the panel is under a metre away. */
const NEAR_M = 0.5;
const COCKPIT_NEAR_M = 0.03;
/** The head sinks under positive G and lifts under negative G, by this much per G, up to these limits (metres). */
const HEAD_SAG_PER_G = 0.008;
const HEAD_SAG_MAX = 0.06;
const HEAD_LIFT_MAX = 0.04;
/**
 * Looking round in the cockpit the head turns on the neck, this far behind the eyes, and the pilot leans this far
 * toward the side they look to, so a look over the shoulder clears the seat's headrest.
 */
const NECK_BEHIND_EYES_M = 0.1;
const LEAN_M = 0.14;
const CHASE_LOOK_AHEAD = 60;
const CHASE_TAU = 0.15;
const TRAUMA_DECAY_PER_S = 1.5;
const SHAKE_MAX_ANGLE = 1.2 * DEG;
const SHAKE_MAX_ROLL = 1.5 * DEG;
/** The kill cam eases onto its shot with this time constant. */
const FRAME_TAU_S = 0.35;
/**
 * The ground never comes between the camera and what it looks at (revision 23): the camera stays this high above the
 * ground, the line to its subject this high above it at every sample, and it settles back down this gently. It rises
 * at once, by at most this much.
 */
const GROUND_CLEARANCE_M = 3;
const LINE_CLEARANCE_M = 2;
const LINE_SAMPLES = 8;
const SETTLE_TAU_S = 0.4;
const MAX_LIFT_M = 300;
/** The camera stays this far on the jet's side of an overcast deck (revision 25). */
const DECK_CLEARANCE_M = 4;

/** An overcast deck's base and top: flat sheets of cloud the camera must not end up on the far side of. */
export interface CloudDeck {
  baseM: number;
  topM: number;
}

/** How far to raise a camera at `cam` so it clears the ground and the ground does not hide `subject`; 0 when clear. */
export function clearanceLift(cam: Vector3, subject: Vector3, ground: (x: number, z: number) => number): number {
  let lift = ground(cam.x, cam.z) + GROUND_CLEARANCE_M - cam.y;
  for (let i = 1; i < LINE_SAMPLES; i++) {
    const t = i / LINE_SAMPLES;
    const need = ground(cam.x + (subject.x - cam.x) * t, cam.z + (subject.z - cam.z) * t) + LINE_CLEARANCE_M - (cam.y + (subject.y - cam.y) * t);
    // Raising the camera by L raises the line here by L·(1 − t).
    if (need > 0) lift = Math.max(lift, need / (1 - t));
  }
  return clamp(lift, 0, MAX_LIFT_M);
}

/**
 * How far to move a camera at `cam` (up positive) to keep it on `subject`'s side of an overcast deck (revision 25):
 * above the top when the jet flies above it, below the base when the jet flies under it; 0 when it already is, or the
 * jet is inside the deck. Otherwise a camera trailing a jet that skims the deck dipped through it, and the sheet of
 * cloud hid the jet.
 */
export function deckShift(cam: Vector3, subject: Vector3, deck: CloudDeck): number {
  if (subject.y >= deck.topM) return Math.max(0, deck.topM + DECK_CLEARANCE_M - cam.y);
  if (subject.y <= deck.baseM) return Math.min(0, deck.baseM - DECK_CLEARANCE_M - cam.y);
  return 0;
}

/** The weather's overcast deck, or null when its clouds are cumulus or there are none. */
export function cloudDeck(preset: WeatherPreset): CloudDeck | null {
  return preset.deck && preset.coverage > 0 ? { baseM: preset.cloudBaseM, topM: preset.cloudTopM } : null;
}

const lowered = new Vector3();

/**
 * The lowest lift (metres, negative to lower the camera) at which the camera clears the ground, trying `tryLift`
 * when it is negative: the ground's say in how far the camera may sink below its place to stay under a deck.
 */
export function groundFloor(cam: Vector3, subject: Vector3, ground: (x: number, z: number) => number, tryLift: number): number {
  const need = clearanceLift(cam, subject, ground);
  if (need > 0 || tryLift >= 0) return need;
  return Math.min(0, tryLift + clearanceLift(lowered.set(cam.x, cam.y + tryLift, cam.z), subject, ground));
}

/** Continuous shake sources: high G, the transonic buffet band and afterburner rumble. */
export function sustainedTrauma(gLoad: number, mach: number, throttle: number): number {
  const g = clamp((Math.abs(gLoad) - 6) / 3, 0, 1) * 0.5;
  const transonic = mach > 0.95 && mach < 1.05 ? 0.25 : 0;
  const afterburner = throttle > 0.9 ? 0.08 : 0;
  return Math.max(g, transonic, afterburner);
}

export function decayTrauma(trauma: number, dt: number): number {
  return clamp(trauma - TRAUMA_DECAY_PER_S * Math.max(0, dt), 0, 1);
}

const WORLD_UP = new Vector3(0, 1, 0);

/**
 * The game's camera: behind and above the jet (spec §15.1) at three distances, or in the cockpit (revision 34). The kill
 * cam and spectating always fly third person.
 */
export class CameraRig {
  reduceMotion = false;
  view: CameraView = 'chase';
  /** the ground's height, so the camera stays out of it (revision 23); null where there is no terrain */
  ground: ((x: number, z: number) => number) | null = null;
  /** an overcast deck to keep on the jet's side of (revision 25); null in other weather */
  deck: CloudDeck | null = null;
  private lift = 0;
  private readonly camera: PerspectiveCamera;
  private trauma = 0;
  private time = 0;
  private readonly offset = new Vector3();
  private offsetReady = false;
  /** the kill cam framed the last frame */
  private framing = false;
  /** the last update put the camera in the cockpit */
  private cockpit = false;
  private readonly eyeAt = new Vector3();
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpUp = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly tmpM = new Matrix4();
  private readonly tmpE = new Euler(0, 0, 0, 'YXZ');

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** The next update starts right behind the target (after a respawn) instead of easing over. */
  reset(): void {
    this.offsetReady = false;
  }

  /** True when the last update put the camera in the cockpit. */
  get inCockpit(): boolean {
    return this.cockpit;
  }

  /**
   * `aimDirection`: the mouse-aim direction to look along (horizon level behind the jet; in the cockpit the head turns
   * that way and rolls with the jet); null follows the jet's nose and roll.
   */
  update(dt: number, target: CameraTarget | null, aimDirection: Vector3 | null): void {
    if (!target) return;
    this.framing = false;
    this.time += dt;
    if (this.view === 'cockpit' && target.eye) {
      this.updateCockpit(dt, target, target.eye, aimDirection);
      return;
    }
    this.cockpit = false;
    this.setLens(FOV, NEAR_M);
    const { distance, height } = CHASE_VIEWS[this.view === 'cockpit' ? 'chase' : this.view];
    const dir = this.tmpA;
    if (aimDirection) dir.copy(aimDirection).normalize();
    else dir.set(0, 0, -1).applyQuaternion(target.quaternion);
    const up = aimDirection ? this.tmpUp.copy(WORLD_UP) : this.tmpUp.set(0, 1, 0).applyQuaternion(target.quaternion);
    if (target.lookYaw !== 0 || target.lookPitch !== 0) {
      dir.applyAxisAngle(up, -target.lookYaw);
      const side = this.tmpB.crossVectors(dir, up).normalize();
      dir.applyAxisAngle(side, target.lookPitch);
    }
    const desired = this.tmpB.copy(dir).multiplyScalar(-distance).addScaledVector(up, height);
    if (!this.offsetReady) {
      this.offset.copy(desired);
      this.offsetReady = true;
    } else {
      this.offset.x = approach(this.offset.x, desired.x, dt, CHASE_TAU);
      this.offset.y = approach(this.offset.y, desired.y, dt, CHASE_TAU);
      this.offset.z = approach(this.offset.z, desired.z, dt, CHASE_TAU);
    }
    this.camera.position.copy(target.position).add(this.offset);
    this.keepClear(target.position, dt);
    const lookAt = this.tmpB.copy(target.position).addScaledVector(dir, CHASE_LOOK_AHEAD);
    this.tmpM.lookAt(this.camera.position, lookAt, up);
    this.camera.quaternion.setFromRotationMatrix(this.tmpM);

    this.trauma = Math.max(decayTrauma(this.trauma, dt), sustainedTrauma(target.gLoad, target.mach, target.throttle));
    if (this.trauma > 0) this.applyShake();
  }

  /**
   * The cockpit (revision 34): the camera at the pilot's eyes, fixed to the jet. It looks along the nose, or where the
   * mouse aims (the head turns that way), plus any look-around, and rolls with the jet. The head sags a little under
   * G, and the buffet shakes it as it shakes the chase camera.
   */
  private updateCockpit(dt: number, target: CameraTarget, eye: Vector3, aimDirection: Vector3 | null): void {
    this.cockpit = true;
    // Back to a chase view, the camera starts right behind the jet.
    this.offsetReady = false;
    this.lift = 0;
    this.setLens(COCKPIT_FOV, COCKPIT_NEAR_M);
    const up = this.tmpUp.set(0, 1, 0).applyQuaternion(target.quaternion);
    const dir = this.tmpA;
    if (aimDirection) dir.copy(aimDirection).normalize();
    else dir.set(0, 0, -1).applyQuaternion(target.quaternion);
    if (target.lookYaw !== 0 || target.lookPitch !== 0) {
      dir.applyAxisAngle(up, -target.lookYaw);
      const side = this.tmpB.crossVectors(dir, up);
      if (side.lengthSq() > 1e-8) dir.applyAxisAngle(side.normalize(), target.lookPitch);
    }
    // Where the head turns to, in the jet's frame: it swings on the neck and leans that way.
    const local = this.tmpB.copy(dir).applyQuaternion(this.tmpQ.copy(target.quaternion).invert());
    const yaw = Math.atan2(local.x, -local.z);
    const at = this.eyeAt.copy(eye);
    at.x += Math.sin(yaw) * NECK_BEHIND_EYES_M + Math.sin(clamp(yaw, -Math.PI / 2, Math.PI / 2)) * LEAN_M;
    at.z += NECK_BEHIND_EYES_M * (1 - Math.cos(yaw));
    if (!this.reduceMotion) at.y += clamp(-(target.gLoad - 1) * HEAD_SAG_PER_G, -HEAD_SAG_MAX, HEAD_LIFT_MAX);
    this.camera.position.copy(at.applyQuaternion(target.quaternion)).add(target.position);
    // Looking straight up or down through the canopy: the jet's tail is "up" on screen.
    if (Math.abs(dir.dot(up)) > 0.995) up.set(0, 0, 1).applyQuaternion(target.quaternion);
    const lookAt = this.tmpB.copy(this.camera.position).add(dir);
    this.tmpM.lookAt(this.camera.position, lookAt, up);
    this.camera.quaternion.setFromRotationMatrix(this.tmpM);
    this.trauma = Math.max(decayTrauma(this.trauma, dt), sustainedTrauma(target.gLoad, target.mach, target.throttle));
    if (this.trauma > 0) this.applyShake();
  }

  private setLens(fov: number, near: number): void {
    if (this.camera.fov === fov && this.camera.near === near) return;
    this.camera.fov = fov;
    this.camera.near = near;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Looks at `lookAt` from `position` with a field of view of `fovDeg` (the kill cam, M5), easing over from where the
   * camera was. The next chase update starts fresh behind its target.
   */
  frame(position: Vector3, lookAt: Vector3, fovDeg: number, dt: number): void {
    const cam = this.camera;
    this.cockpit = false;
    if (cam.near !== NEAR_M) {
      cam.near = NEAR_M;
      cam.updateProjectionMatrix();
    }
    const k = dt > 0 ? 1 - Math.exp(-dt / FRAME_TAU_S) : 1;
    cam.position.lerp(position, this.framing ? k : 1);
    this.keepClear(lookAt, dt);
    this.tmpM.lookAt(cam.position, lookAt, WORLD_UP);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    if (this.framing) cam.quaternion.slerp(this.tmpQ, k);
    else cam.quaternion.copy(this.tmpQ);
    const fov = this.framing ? cam.fov + (fovDeg - cam.fov) * k : fovDeg;
    if (Math.abs(fov - cam.fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.framing = true;
    this.offsetReady = false;
  }

  /**
   * Raises the camera out of the ground and over any ground between it and `subject` (revision 23): flying low over
   * hills, the chase camera 30 m behind could sit in a slope, or behind a ridge the jet had just cleared, and the
   * scenery covered the jet. It also keeps the camera on the jet's side of an overcast deck (revision 25). It moves
   * at once when it must and settles back gently; the ground wins over the deck.
   */
  private keepClear(subject: Vector3, dt: number): void {
    if (!this.ground && !this.deck) return;
    const cam = this.camera.position;
    const deck = this.deck ? deckShift(cam, subject, this.deck) : 0;
    // How far the camera may go: up out of the ground, or the deck; down under the deck, as far as the ground allows.
    const floor = this.ground ? groundFloor(cam, subject, this.ground, deck < 0 ? deck : Math.min(0, this.lift)) : -Infinity;
    const lo = Math.max(floor, deck > 0 ? deck : -Infinity);
    const hi = deck < 0 ? Math.max(deck, lo) : Infinity;
    const want = clamp(0, lo, hi);
    this.lift = clamp(dt > 0 ? approach(this.lift, want, dt, SETTLE_TAU_S) : want, lo, hi);
    cam.y += this.lift;
  }

  private applyShake(): void {
    const amp = this.trauma * this.trauma * (this.reduceMotion ? 0.2 : 1);
    const t = this.time;
    const n = (a: number, b: number, seed: number) => 0.6 * Math.sin(t * a + seed) + 0.4 * Math.sin(t * b + seed * 2.3);
    this.tmpE.set(n(23, 37, 1) * SHAKE_MAX_ANGLE * amp, n(29, 41, 2) * SHAKE_MAX_ANGLE * amp, n(31, 43, 3) * SHAKE_MAX_ROLL * amp, 'YXZ');
    this.camera.quaternion.multiply(this.tmpQ.setFromEuler(this.tmpE));
  }
}
