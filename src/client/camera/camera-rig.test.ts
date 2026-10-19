import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WEATHER } from '../../shared/world/weather.ts';
import { CAMERA_VIEWS, CameraRig, type CameraTarget, CHASE_VIEWS, clearanceLift, cloudDeck, decayTrauma, deckShift, nextCameraView, sustainedTrauma } from './camera-rig.ts';

/** A jet at 1000 m pointing north (-z) unless told otherwise. */
const target = (position = new Vector3(0, 1000, 0), quaternion = new Quaternion()): CameraTarget => ({
  position,
  quaternion,
  gLoad: 1,
  mach: 0.6,
  throttle: 0.5,
  lookYaw: 0,
  lookPitch: 0,
});
const tick = (rig: CameraRig, seconds: number, t: CameraTarget, aim: Vector3 | null = null) => {
  for (let i = 0; i < Math.max(1, Math.round(seconds * 60)); i++) rig.update(1 / 60, t, aim);
};
const forward = (cam: PerspectiveCamera) => new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
const up = (cam: PerspectiveCamera) => new Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
const right = (cam: PerspectiveCamera) => new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);

describe('camera shake', () => {
  it('derives trauma from G, the transonic band and afterburner, and decays it', () => {
    expect(sustainedTrauma(1, 0.6, 0.5)).toBe(0);
    expect(sustainedTrauma(9, 0.6, 0.5)).toBeCloseTo(0.5, 6);
    expect(sustainedTrauma(1, 1, 0.5)).toBe(0.25);
    expect(sustainedTrauma(1, 0.6, 1)).toBe(0.08);
    expect(decayTrauma(1, 1)).toBe(0);
    expect(decayTrauma(1, 0.2)).toBeCloseTo(0.7, 6);
  });

  it('never grows on a frame that runs backwards, and never passes 1 (revision 25)', () => {
    // Regression: a negative frame step grew the shake past 1, and the camera swung tens of degrees off the jet.
    expect(decayTrauma(0, -2)).toBe(0);
    expect(decayTrauma(0.5, -2)).toBe(0.5);
    expect(decayTrauma(5, 0)).toBe(1);
  });
});

describe('CameraRig: the chase view', () => {
  it('starts behind and above the jet, looking the way it points', () => {
    const cam = new PerspectiveCamera();
    tick(new CameraRig(cam), 0, target());
    expect(cam.position.z).toBeGreaterThan(20);
    expect(cam.position.y).toBeGreaterThan(1003);
    expect(cam.position.distanceTo(new Vector3(0, 1000, 0))).toBeLessThan(50);
    expect(forward(cam).z).toBeLessThan(-0.95);
  });

  it('follows the mouse-aim direction and keeps the horizon level', () => {
    const cam = new PerspectiveCamera();
    // The jet still points north, but the player aims east (+x).
    tick(new CameraRig(cam), 1, target(), new Vector3(1, 0, 0));
    expect(cam.position.x).toBeLessThan(-20);
    expect(forward(cam).x).toBeGreaterThan(0.95);
    expect(Math.abs(right(cam).y)).toBeLessThan(1e-6);
  });

  it('rolls with the jet in keyboard mode', () => {
    const cam = new PerspectiveCamera();
    // Rolled 90° right: the jet's top now faces east (+x).
    const rolled = new Quaternion().setFromAxisAngle(new Vector3(0, 0, -1), Math.PI / 2);
    tick(new CameraRig(cam), 1, target(new Vector3(0, 1000, 0), rolled));
    expect(cam.position.z).toBeGreaterThan(20);
    expect(cam.position.x).toBeGreaterThan(3);
    expect(up(cam).x).toBeGreaterThan(0.95);
  });

  it('swings around the jet while the player looks around', () => {
    const cam = new PerspectiveCamera();
    const t = target();
    t.lookYaw = Math.PI / 2; // look right (east)
    tick(new CameraRig(cam), 1, t);
    expect(cam.position.x).toBeLessThan(-20);
    expect(forward(cam).x).toBeGreaterThan(0.95);
  });

  it('starts right behind a respawned jet instead of swinging round from the old heading', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    tick(rig, 1, target());
    const south = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    const spawn = target(new Vector3(20000, 2000, 5000), south);
    rig.reset();
    tick(rig, 0, spawn);
    // Behind a south-pointing jet is north of it.
    expect(cam.position.z).toBeLessThan(5000 - 20);
    expect(cam.position.distanceTo(spawn.position)).toBeLessThan(50);
    expect(forward(cam).z).toBeGreaterThan(0.95);
  });
});

describe('the camera keeps the ground out of the way (revision 23)', () => {
  // A slope rising steeply to the south (+z), behind a jet flying north low over it.
  const slope = (_x: number, z: number) => Math.max(0, z);

  it('rises out of the ground and over ground between it and the jet', () => {
    expect(clearanceLift(new Vector3(0, 100, 0), new Vector3(0, 100, -30), slope)).toBe(0);
    // Camera 30 m behind at the jet's height over a slope 30 m higher there: lifted clear.
    const cam = new Vector3(0, 12, 30);
    const jet = new Vector3(0, 12, 0);
    const lift = clearanceLift(cam, jet, slope);
    expect(cam.y + lift).toBeGreaterThanOrEqual(slope(0, 30) + 3 - 1e-9);
    // A ridge between them: lifted until the line passes over it.
    const ridge = (_x: number, z: number) => (Math.abs(z - 10) < 3 ? 40 : 0);
    const over = clearanceLift(new Vector3(0, 20, 30), new Vector3(0, 20, -10), ridge);
    expect(20 + over - (20 + over - 20) * (20 / 40)).toBeGreaterThan(40);
  });

  it('flies the chase camera above a slope behind a low jet, and settles back down when clear', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    rig.ground = slope;
    const t = target(new Vector3(0, 12, 0));
    tick(rig, 1, t);
    expect(cam.position.y).toBeGreaterThan(slope(cam.position.x, cam.position.z) + 2.9);
    // Over flat ground again it comes back down behind the jet, not at once.
    rig.ground = () => 0;
    rig.update(1 / 60, t, null);
    const after = cam.position.y;
    expect(after).toBeGreaterThan(12 + 7 + 1);
    tick(rig, 3, t);
    expect(cam.position.y).toBeLessThan(after);
    expect(cam.position.y).toBeCloseTo(12 + 7, 0);
  });

  it('keeps the kill cam out of the ground too', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    rig.ground = () => 150;
    rig.frame(new Vector3(0, 100, 0), new Vector3(0, 250, -200), 60, 0);
    expect(cam.position.y).toBeGreaterThanOrEqual(153);
  });
});


describe('the camera stays on the jet\'s side of an overcast deck (revision 25)', () => {
  const deck = { baseM: 1100, topM: 2300 };
  /** Nose up by `rad` (keyboard mode: the camera follows the nose and drops behind and below a climbing jet). */
  const noseUp = (rad: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), rad);

  it('reads the deck off the weather', () => {
    expect(cloudDeck(WEATHER.overcast)).toEqual({ baseM: 1100, topM: 2300 });
    expect(cloudDeck(WEATHER.rain)).toEqual({ baseM: 800, topM: 2600 });
    expect(cloudDeck(WEATHER.scattered)).toBeNull();
    expect(cloudDeck(WEATHER.clear)).toBeNull();
  });

  it('says how far to move: up over the top, down under the base, nothing inside', () => {
    expect(deckShift(new Vector3(0, 2296, 0), new Vector3(0, 2302, 0), deck)).toBeCloseTo(8, 9);
    expect(deckShift(new Vector3(0, 2400, 0), new Vector3(0, 2302, 0), deck)).toBe(0);
    expect(deckShift(new Vector3(0, 1104, 0), new Vector3(0, 1097, 0), deck)).toBeCloseTo(-8, 9);
    expect(deckShift(new Vector3(0, 1000, 0), new Vector3(0, 1097, 0), deck)).toBe(0);
    expect(deckShift(new Vector3(0, 2296, 0), new Vector3(0, 2000, 0), deck)).toBe(0);
  });

  it('keeps a camera behind a jet climbing away just above the deck out of the deck', () => {
    // Regression: the camera dipped under the deck's top and the sheet of cloud hid the jet.
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    rig.deck = deck;
    tick(rig, 1, target(new Vector3(0, 2302, 0), noseUp(0.6)));
    expect(cam.position.y).toBeGreaterThanOrEqual(2304 - 1e-9);
    // Well above the deck it settles back to its usual place behind and below the climbing jet.
    const t = target(new Vector3(0, 2600, 0), noseUp(0.6));
    tick(rig, 3, t);
    rig.deck = null;
    const free = new PerspectiveCamera();
    tick(new CameraRig(free), 3, t);
    expect(cam.position.distanceTo(free.position)).toBeLessThan(0.1);
  });

  it('keeps under the base with a jet just under the deck, unless the ground is in the way', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    rig.deck = deck;
    rig.ground = () => 0;
    tick(rig, 1, target(new Vector3(0, 1097, 0)));
    expect(cam.position.y).toBeLessThanOrEqual(1096 + 1e-9);
    // Ground just below: the camera sinks only as far as the ground allows.
    rig.ground = () => 1094;
    tick(rig, 1, target(new Vector3(0, 1097, 0)));
    expect(cam.position.y).toBeGreaterThanOrEqual(1097 - 1e-6);
  });

  it('leaves the camera alone with the jet inside the deck', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    rig.deck = deck;
    tick(rig, 1, target(new Vector3(0, 1700, 0)));
    expect(cam.position.y).toBeCloseTo(1707, 3);
  });
});

describe('camera views (revision 34)', () => {
  const eye = new Vector3(0, 0.9, -4.2);

  it('steps through the cockpit and the three chase distances with V', () => {
    expect(CAMERA_VIEWS).toEqual(['cockpit', 'near', 'chase', 'far']);
    expect(nextCameraView('chase')).toBe('far');
    expect(nextCameraView('far')).toBe('cockpit');
    expect(nextCameraView('cockpit', -1)).toBe('far');
  });

  it('chases closer or further behind the jet', () => {
    const behind = (view: 'near' | 'chase' | 'far') => {
      const cam = new PerspectiveCamera();
      const rig = new CameraRig(cam);
      rig.view = view;
      tick(rig, 0, target());
      return cam.position.distanceTo(new Vector3(0, 1000, 0));
    };
    expect(behind('near')).toBeLessThan(behind('chase'));
    expect(behind('chase')).toBeLessThan(behind('far'));
    expect(behind('far')).toBeCloseTo(Math.hypot(CHASE_VIEWS.far.distance, CHASE_VIEWS.far.height), 3);
  });

  it("sits at the pilot's eyes, looks along the nose and rolls with the jet", () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    rig.view = 'cockpit';
    const rolled = new Quaternion().setFromAxisAngle(new Vector3(0, 0, -1), Math.PI / 2);
    const t = { ...target(new Vector3(0, 1000, 0), rolled), eye };
    tick(rig, 0, t);
    expect(rig.inCockpit).toBe(true);
    expect(cam.position.distanceTo(eye.clone().applyQuaternion(rolled).add(t.position))).toBeLessThan(1e-6);
    expect(forward(cam).z).toBeLessThan(-0.999);
    expect(up(cam).x).toBeGreaterThan(0.999);
    expect(cam.near).toBeLessThan(0.1);
  });

  it('turns the head toward the mouse aim, rolling with the jet, and leans into a look over the shoulder', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    rig.view = 'cockpit';
    const t = { ...target(), eye };
    tick(rig, 0, t, new Vector3(1, 0, -1).normalize());
    expect(forward(cam).x).toBeCloseTo(Math.SQRT1_2, 5);
    t.lookYaw = 2.6;
    tick(rig, 0, t);
    // Looking right and back: the head swings right and back, clear of the headrest.
    expect(cam.position.x).toBeGreaterThan(0.1);
    expect(cam.position.z).toBeGreaterThan(-4.2 + 0.1);
  });

  it('chases instead when there is no cockpit, and the kill cam puts the near plane back', () => {
    const cam = new PerspectiveCamera();
    const rig = new CameraRig(cam);
    rig.view = 'cockpit';
    tick(rig, 0, target());
    expect(rig.inCockpit).toBe(false);
    expect(cam.position.z).toBeGreaterThan(20);
    tick(rig, 0, { ...target(), eye });
    expect(rig.inCockpit).toBe(true);
    rig.frame(new Vector3(0, 1100, 100), new Vector3(0, 1000, 0), 60, 0);
    expect(rig.inCockpit).toBe(false);
    expect(cam.near).toBe(0.5);
  });
});
