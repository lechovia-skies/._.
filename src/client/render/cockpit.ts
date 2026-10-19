import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three';
import type { TeamId } from '../../shared/data/aircraft/types.ts';

/**
 * Where the pilot sits in a jet's model (revision 34), in its body frame (metres, nose toward -z): the eyes, the
 * height of the canopy sill, the cockpit's half width at the sill and how far forward the canopy starts. Kept on the
 * model's `userData.cockpit`, so clones carry it.
 */
export interface CockpitFit {
  eye: readonly [x: number, y: number, z: number];
  sillY: number;
  halfWidth: number;
  frontZ: number;
}

/** The pilot's eyes sit this far ahead of the helmet's centre and this far below it. */
const EYE_AHEAD_M = 0.08;
const EYE_BELOW_M = 0.02;
/** The cockpit tub's top stands this far above the sill (`kit.ts` `canopy`). */
const TUB_ABOVE_SILL_M = 0.16;
/** How far the glare shield reaches forward of the instrument panel. */
const SHIELD_DEPTH_M = 0.34;

/** The fit from an airframe's front helmet and cockpit tub, both already in the body frame. */
export function cockpitFitFrom(helmet: BufferGeometry, tub: BufferGeometry): CockpitFit {
  helmet.computeBoundingBox();
  tub.computeBoundingBox();
  const h = helmet.boundingBox!;
  const t = tub.boundingBox!;
  // The front seat: the helmet nearest the nose (a two-seater's helmets are merged, 0.15 m in radius).
  const headZ = h.min.z + (h.max.y - h.min.y) / 2;
  const headY = (h.min.y + h.max.y) / 2;
  return {
    eye: [0, headY - EYE_BELOW_M, headZ - EYE_AHEAD_M],
    sillY: t.max.y - TUB_ABOVE_SILL_M,
    halfWidth: Math.max(t.max.x, -t.min.x),
    frontZ: t.min.z,
  };
}

/** The fit stored on a model, or null for models without a cockpit (the Sentinels'). */
export function cockpitFitOf(root: Object3D): CockpitFit | null {
  const fit = root.userData.cockpit as CockpitFit | undefined;
  return fit && Array.isArray(fit.eye) ? fit : null;
}

/** The pilot's eyes in the body frame. */
export function cockpitEye(root: Object3D, out = new Vector3()): Vector3 | null {
  const fit = cockpitFitOf(root);
  return fit ? out.set(fit.eye[0], fit.eye[1], fit.eye[2]) : null;
}

type Style = 'western' | 'russian';

/** One canvas per style: the instrument panel's face, and what of it glows. */
interface PanelArt {
  map: Texture;
  glow: Texture;
}

const panelArt = new Map<Style, PanelArt | null>();
let consoleArt: Texture | null | undefined;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const PANEL_W = 1024;
const PANEL_H = 640;

/** A display with its bezel and push buttons round the edge; `draw` fills the screen (on both canvases). */
function display(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): void {
  ctx.fillStyle = '#1b1e21';
  ctx.fillRect(x - 26, y - 26, w + 52, h + 52);
  ctx.fillStyle = '#3a3f44';
  const buttons = 5;
  for (let i = 0; i < buttons; i++) {
    const bx = x + ((i + 0.5) * w) / buttons - 9;
    const by = y + ((i + 0.5) * h) / buttons - 9;
    ctx.fillRect(bx, y - 21, 18, 14);
    ctx.fillRect(bx, y + h + 7, 18, 14);
    ctx.fillRect(x - 21, by, 14, 18);
    ctx.fillRect(x + w + 7, by, 14, 18);
  }
  for (const g of [ctx, glow]) {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = '#020604';
    g.fillRect(x, y, w, h);
    g.translate(x, y);
    draw(g);
    g.restore();
  }
}

/** A round gauge with its scale and a needle. */
function dial(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, x: number, y: number, r: number, needle: number, face = '#0b0d0e'): void {
  ctx.fillStyle = '#2a2e32';
  ctx.beginPath();
  ctx.arc(x, y, r + 8, 0, Math.PI * 2);
  ctx.fill();
  for (const g of [ctx, glow]) {
    g.fillStyle = face;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d8e0d0';
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI * 1.25 + (i / 11) * Math.PI * 1.5;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
      g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
      g.stroke();
    }
    g.strokeStyle = '#f2f2e8';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(needle) * r * 0.75, y + Math.sin(needle) * r * 0.75);
    g.stroke();
  }
}

/** A radar scope: range arcs, a sweep and a few contacts. */
function radarPage(g: CanvasRenderingContext2D, w: number, h: number, ink: string): void {
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = 2;
  g.globalAlpha = 0.85;
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    g.arc(w / 2, h * 0.95, (h * 0.85 * i) / 3, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(w / 2, h * 0.95);
  g.lineTo(w * 0.22, h * 0.15);
  g.moveTo(w / 2, h * 0.95);
  g.lineTo(w * 0.78, h * 0.15);
  g.stroke();
  for (const [cx, cy] of [
    [0.38, 0.42],
    [0.6, 0.3],
    [0.55, 0.62],
  ]) g.fillRect(cx * w - 7, cy * h - 5, 14, 10);
  g.font = 'bold 22px monospace';
  g.fillText('RWS', 14, 30);
  g.fillText('40', w - 46, 30);
  g.globalAlpha = 1;
}

/** A situation display: a compass rose round the jet. */
function situationPage(g: CanvasRenderingContext2D, w: number, h: number, ink: string): void {
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = 2;
  g.globalAlpha = 0.85;
  const r = Math.min(w, h) * 0.38;
  g.beginPath();
  g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const k = i % 9 === 0 ? 0.84 : 0.92;
    g.beginPath();
    g.moveTo(w / 2 + Math.cos(a) * r * k, h / 2 + Math.sin(a) * r * k);
    g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(w / 2, h / 2 - 22);
  g.lineTo(w / 2, h / 2 + 18);
  g.moveTo(w / 2 - 16, h / 2);
  g.lineTo(w / 2 + 16, h / 2);
  g.stroke();
  g.font = 'bold 22px monospace';
  g.fillText('N', w / 2 - 7, h / 2 - r + 30);
  g.fillText('HSD', 14, 30);
  g.globalAlpha = 1;
}

/** The instrument panel's face: two displays (US) or displays among round gauges (Russian), warning lights. */
function drawPanel(style: Style): PanelArt | null {
  const a = canvas(PANEL_W, PANEL_H);
  const b = canvas(PANEL_W, PANEL_H);
  if (!a || !b) return null;
  const [mapCanvas, ctx] = a;
  const [glowCanvas, glow] = b;
  ctx.fillStyle = style === 'russian' ? '#5b7a80' : '#50565c';
  ctx.fillRect(0, 0, PANEL_W, PANEL_H);
  // The panel's own floodlight: a faint glow over all of it, so it reads in shadow and at night.
  glow.fillStyle = style === 'russian' ? '#2a3b3e' : '#26292c';
  glow.fillRect(0, 0, PANEL_W, PANEL_H);
  // Panel seams and screw heads.
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  for (const x of [PANEL_W * 0.33, PANEL_W * 0.67]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, PANEL_H);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 18; i++) ctx.fillRect(20 + ((i * 57) % (PANEL_W - 40)), 12 + (i % 3) * (PANEL_H - 30) * 0.5, 5, 5);
  // A row of caution lights along the top.
  const lights = style === 'russian' ? ['#ffb020', '#40d060', '#ffb020', '#40d060'] : ['#40d060', '#ffb020', '#40d060', '#40d060', '#ffb020', '#40d060'];
  lights.forEach((c, i) => {
    const x = PANEL_W * 0.36 + i * 46;
    for (const g of [ctx, glow]) {
      g.fillStyle = c;
      g.globalAlpha = i % 2 === 0 ? 0.9 : 0.35;
      g.fillRect(x, 24, 34, 18);
      g.globalAlpha = 1;
    }
  });
  const ink = style === 'russian' ? '#63e0ff' : '#5cff8a';
  if (style === 'western') {
    display(ctx, glow, 70, 150, 300, 300, (g) => radarPage(g, 300, 300, ink));
    display(ctx, glow, PANEL_W - 370, 150, 300, 300, (g) => situationPage(g, 300, 300, ink));
    // The up-front control's small screen and keypad between them.
    display(ctx, glow, PANEL_W / 2 - 110, 90, 220, 70, (g) => {
      g.fillStyle = ink;
      g.font = 'bold 26px monospace';
      g.fillText('UHF 243.0', 18, 44);
    });
    ctx.fillStyle = '#3a3f44';
    for (let i = 0; i < 12; i++) ctx.fillRect(PANEL_W / 2 - 84 + (i % 4) * 44, 200 + Math.floor(i / 4) * 44, 34, 34);
    dial(ctx, glow, PANEL_W / 2, 450, 62, -0.4);
  } else {
    display(ctx, glow, 120, 170, 260, 260, (g) => radarPage(g, 260, 260, ink));
    display(ctx, glow, PANEL_W - 380, 170, 260, 260, (g) => situationPage(g, 260, 260, ink));
    dial(ctx, glow, PANEL_W / 2, 200, 66, -1.2, '#121a1c');
    dial(ctx, glow, PANEL_W / 2, 380, 66, -0.2, '#121a1c');
    dial(ctx, glow, PANEL_W / 2 - 150, 520, 50, 0.6, '#121a1c');
    dial(ctx, glow, PANEL_W / 2 + 150, 520, 50, -2.1, '#121a1c');
  }
  return { map: texture(mapCanvas), glow: texture(glowCanvas) };
}

/** The side consoles: rows of switches and knobs. */
function drawConsole(): Texture | null {
  const a = canvas(256, 512);
  if (!a) return null;
  const [c, ctx] = a;
  ctx.fillStyle = '#4c5156';
  ctx.fillRect(0, 0, 256, 512);
  for (let row = 0; row < 7; row++) {
    const y = 20 + row * 70;
    ctx.fillStyle = '#2b2f33';
    ctx.fillRect(14, y, 228, 56);
    ctx.fillStyle = '#c9cdd0';
    for (let k = 0; k < 4; k++) ctx.fillRect(30 + k * 54, y + 18, 10, 22);
    ctx.fillStyle = '#e0e0d8';
    ctx.font = '10px monospace';
    ctx.fillText(['RADIO', 'IFF', 'LIGHTS', 'FUEL', 'ECS', 'NAV', 'ENG'][row], 20, y + 12);
  }
  return texture(c);
}

let materials: ReturnType<typeof makeMaterials> | null = null;

function makeMaterials() {
  return {
    // A faint glow of their own keeps the inside readable in the shade of the canopy rail and at night.
    shell: new MeshStandardMaterial({ color: 0x585d62, emissive: 0x16181a, roughness: 0.9, metalness: 0.05, side: DoubleSide }),
    shield: new MeshStandardMaterial({ color: 0x2a2d31, emissive: 0x0b0c0d, roughness: 0.95, metalness: 0, side: DoubleSide }),
    seat: new MeshStandardMaterial({ color: 0x3d433b, emissive: 0x0f110f, roughness: 0.85, metalness: 0.05 }),
    grip: new MeshStandardMaterial({ color: 0x24272a, roughness: 0.7, metalness: 0.1 }),
    hudFrame: new MeshStandardMaterial({ color: 0x40454a, emissive: 0x101214, roughness: 0.6, metalness: 0.3 }),
    combiner: new MeshBasicMaterial({ color: 0x9fffc8, transparent: true, opacity: 0.12, side: DoubleSide, depthWrite: false }),
  };
}

function panelMaterial(style: Style): MeshStandardMaterial {
  if (!panelArt.has(style)) panelArt.set(style, drawPanel(style));
  const art = panelArt.get(style);
  return new MeshStandardMaterial({
    color: art ? 0xffffff : 0x2c3034,
    map: art?.map ?? null,
    emissive: art ? 0xffffff : 0x000000,
    emissiveMap: art?.glow ?? null,
    emissiveIntensity: 0.9,
    roughness: 0.8,
    metalness: 0.1,
  });
}

function consoleMaterial(): MeshStandardMaterial {
  if (consoleArt === undefined) consoleArt = drawConsole();
  return new MeshStandardMaterial({ color: consoleArt ? 0xffffff : 0x2a2e32, map: consoleArt, roughness: 0.85, metalness: 0.1 });
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, material: MeshStandardMaterial): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

/** A flat panel from (y0, z0) at its top edge to (y1, z1) at its bottom, `w` wide, facing the pilot. */
function face(w: number, top: [number, number], bottom: [number, number], material: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  const [y0, z0] = top;
  const [y1, z1] = bottom;
  const h = Math.hypot(y0 - y1, z0 - z1);
  const m = new Mesh(new PlaneGeometry(w, h), material);
  m.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
  // Tilt it back: the bottom edge further away than the top.
  m.rotation.x = Math.atan2(z0 - z1, y0 - y1);
  return m;
}

/**
 * The inside of the cockpit, seen from the pilot's seat (revision 34), built round the eyes: the glare shield with the
 * HUD and its glass, the instrument panel (displays, gauges, caution lights), the side consoles with the throttle and
 * the stick, the walls and floor of the tub up to the sill, and the seat's headrest behind. US jets get two displays
 * and a side stick on the right; Russian jets their blue-grey panel with round gauges and a centre stick.
 */
export function cockpitInterior(fit: CockpitFit, team: TeamId): Group {
  const style: Style = team === 'russia' ? 'russian' : 'western';
  const mats = (materials ??= makeMaterials());
  const g = new Group();
  g.name = 'cockpit-interior';
  g.position.set(fit.eye[0], fit.eye[1], fit.eye[2]);
  const sill = fit.sillY - fit.eye[1];
  const front = Math.min(-0.75, fit.frontZ - fit.eye[2]);
  const back = 0.55;
  const w = Math.max(0.3, fit.halfWidth);
  const inner = w - 0.04;
  const floor = sill - 0.65;
  const shieldY = sill + 0.26;
  const panelZ = -0.64;
  const length = back - front;
  const mid = (back + front) / 2;

  // The tub: walls up to the sill with the canopy rail along the top, the floor and the bulkhead behind the seat.
  for (const side of [-1, 1]) {
    const wall = new Mesh(new PlaneGeometry(length, sill - floor), mats.shell);
    wall.rotation.y = Math.PI / 2;
    wall.position.set(side * w, (sill + floor) / 2, mid);
    g.add(wall, box(0.05, 0.035, length, side * (w - 0.02), sill, mid, mats.hudFrame));
  }
  const floorMesh = new Mesh(new PlaneGeometry(2 * w, length), mats.shell);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, floor, mid);
  const bulkhead = new Mesh(new PlaneGeometry(2 * w, sill - floor + 0.05), mats.shell);
  bulkhead.position.set(0, (sill + floor) / 2, back);
  g.add(floorMesh, bulkhead);

  // The glare shield, from the panel toward the windscreen, and the panel under it.
  // It slopes down toward the windscreen, and its padded lip overhangs the panel.
  const shieldFront = Math.max(front + 0.1, panelZ - SHIELD_DEPTH_M);
  g.add(face(2 * inner - 0.06, [shieldY - 0.05, shieldFront], [shieldY, panelZ + 0.01], mats.shield));
  g.add(box(2 * inner - 0.04, 0.025, 0.045, 0, shieldY - 0.012, panelZ + 0.012, mats.shield));
  // The panel leans back, square to the pilot's look down at it.
  const panel = face(2 * inner - 0.04, [shieldY - 0.03, panelZ], [floor + 0.18, panelZ + 0.15], panelMaterial(style));
  g.add(panel);
  // The front of the tub under the panel and under the front of the glare shield, so nothing shows through.
  g.add(face(2 * w, [floor + 0.18, panelZ + 0.15], [floor, panelZ + 0.15], mats.shell));
  g.add(face(2 * inner, [shieldY - 0.05, shieldFront], [sill - 0.02, shieldFront - 0.08], mats.shield));

  // The HUD: its housing on the glare shield and the tilted glass above it.
  g.add(box(0.15, 0.05, 0.16, 0, shieldY + 0.045, panelZ - 0.1, mats.hudFrame));
  g.add(face(0.15, [shieldY + 0.2, panelZ - 0.04], [shieldY + 0.08, panelZ - 0.1], mats.combiner));
  for (const side of [-1, 1]) g.add(box(0.006, 0.12, 0.006, side * 0.078, shieldY + 0.14, panelZ - 0.07, mats.hudFrame));
  g.add(box(0.162, 0.006, 0.006, 0, shieldY + 0.2, panelZ - 0.045, mats.hudFrame));

  // Side consoles, the throttle on the left and the stick.
  const consoleTop = sill - 0.1;
  for (const side of [-1, 1]) {
    const c = box(0.18, 0.12, 0.75, side * (inner - 0.09), consoleTop - 0.06, -0.15, consoleMaterial());
    g.add(c);
  }
  g.add(box(0.05, 0.09, 0.07, -(inner - 0.11), consoleTop + 0.04, -0.2, mats.grip));
  const stick = new Mesh(new CylinderGeometry(0.014, 0.018, 0.22, 10), mats.grip);
  if (style === 'western') {
    stick.position.set(inner - 0.1, consoleTop + 0.07, -0.25);
    stick.scale.set(1, 0.5, 1);
  } else {
    stick.position.set(0, floor + 0.32, -0.32);
    stick.rotation.x = -0.15;
  }
  const knob = box(0.045, 0.08, 0.05, stick.position.x, stick.position.y + (style === 'western' ? 0.08 : 0.14), stick.position.z, mats.grip);
  g.add(stick, knob);

  // The seat: its headrest behind the head and its sides by the shoulders.
  g.add(box(0.24, 0.3, 0.09, 0, -0.1, 0.3, mats.seat));
  for (const side of [-1, 1]) g.add(box(0.06, 0.45, 0.14, side * 0.21, sill - 0.08, 0.2, mats.seat));
  return g;
}

const interiors = new WeakMap<Object3D, Group>();

/**
 * Shows or hides the cockpit for the camera at the pilot's eyes (revision 34): the interior goes in on first use; the
 * pilot's own helmet and the dark tub the outside view sees through the glass go out of the way. False when the model
 * has no cockpit.
 */
export function showCockpit(root: Object3D, on: boolean, team: TeamId): boolean {
  const fit = cockpitFitOf(root);
  if (!fit) return false;
  let interior = interiors.get(root);
  if (!interior && on) {
    interior = cockpitInterior(fit, team);
    interiors.set(root, interior);
    root.add(interior);
  }
  if (interior) interior.visible = on;
  for (const name of ['crew', 'cockpit-tub']) {
    const o = root.getObjectByName(name);
    if (o) o.visible = !on;
  }
  return true;
}
