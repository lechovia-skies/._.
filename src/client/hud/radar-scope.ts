import { DEG } from '../../shared/math/units.ts';
import { headingRad } from '../../shared/physics/flight-model.ts';
import { rangeLabel, rangeValue } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { COMPASS_POINTS, scopeAngle, scopePoint, scopeRim, scopeScale } from './hud-geometry.ts';
import { FOE, FONT_SMALL, FRIEND, PRIMARY, RED, WHITE } from './palette.ts';

const pos = { x: 0, y: 0 };
const rim = { x: 0, y: 0 };
/** half the length of an aircraft's mark on the scope */
const JET_PX = 7.5;
const DOME_FILL = 'rgba(4, 10, 8, 0.85)';
/** A jet from above, nose up, one unit from the middle to the nose; the left half mirrors it. */
const JET_OUTLINE: readonly (readonly [number, number])[] = [
  [0, -1],
  [0.14, -0.62],
  [0.15, -0.18],
  [0.95, 0.32],
  [0.95, 0.48],
  [0.15, 0.3],
  [0.13, 0.66],
  [0.48, 0.9],
  [0.48, 1],
  [0, 0.9],
];

/** A jet mark (revision 42) at (x, y), turned `angle` clockwise from pointing up; filled or outlined. */
function drawJet(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, filled: boolean): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const point = (px: number, py: number) => [x + (px * c - py * s) * size, y + (px * s + py * c) * size] as const;
  ctx.beginPath();
  JET_OUTLINE.forEach(([px, py], i) => {
    const [sx, sy] = point(px, py);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  for (let i = JET_OUTLINE.length - 2; i > 0; i--) {
    const [sx, sy] = point(-JET_OUTLINE[i][0], JET_OUTLINE[i][1]);
    ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  if (filled) ctx.fill();
  else ctx.stroke();
}

/** Heading-up radar display (spec §15.2): radar and visual contacts, team-mates and missiles in flight. */
export function drawRadarScope(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, f: HudFrame): void {
  const me = f.view;
  if (!me.alive) return;
  const heading = headingRad(me.flight);
  const target = f.target;
  const scale = scopeScale(target ? me.flight.pos.distanceTo(target.flight.pos) : null);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(cx, cy, radius / 2, 0, Math.PI * 2);
  const cone = me.config.sensors.radarConeDeg * DEG;
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * Math.sin(cone), cy - radius * Math.cos(cone));
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - radius * Math.sin(cone), cy - radius * Math.cos(cone));
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = FONT_SMALL;
  ctx.fillText(`${Math.round(rangeValue(scale, me.config.hudUnits))} ${rangeLabel(me.config.hudUnits)}`, cx - radius, cy + radius + 16);

  // The compass (revision 42): the four points just outside the rim (no contact covers them), turning as the jet turns;
  // north in the HUD colour, a tick every 30°.
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (let deg = 0; deg < 360; deg += 30) {
    const a = scopeAngle(deg * DEG, heading);
    const len = deg % 90 === 0 ? 7 : 4;
    scopeRim(a, radius, rim);
    ctx.moveTo(cx + rim.x, cy + rim.y);
    scopeRim(a, radius - len, rim);
    ctx.lineTo(cx + rim.x, cy + rim.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, bearing] of COMPASS_POINTS) {
    scopeRim(scopeAngle(bearing, heading), radius + 10, rim);
    ctx.fillStyle = label === 'N' ? PRIMARY : WHITE;
    ctx.globalAlpha = label === 'N' ? 1 : 0.75;
    ctx.fillText(label, cx + rim.x, cy + rim.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PRIMARY;

  // Own aircraft: a jet pointing up (the scope turns with it).
  drawJet(ctx, cx, cy, 0, JET_PX + 1, false);

  // Every aircraft a jet pointing the way it flies (revision 42). Friend and foe differ in more than colour (spec §24):
  // friends are outlined, enemies solid; an enemy seen only by a teammate's radar (datalink) is solid but faint; the
  // designated target is boxed; Sentinels are bigger and carry their radar dome.
  const known = new Set(me.contacts.map((c) => c.id));
  const linked = new Set(me.datalink);
  for (const v of f.views) {
    if (v.isLocal || !v.alive) continue;
    const friendly = v.team === me.team;
    if (!friendly && !known.has(v.id) && !linked.has(v.id)) continue;
    if (!scopePoint(v.position.x - me.position.x, v.position.z - me.position.z, heading, scale, radius, pos)) continue;
    ctx.strokeStyle = friendly ? FRIEND : FOE;
    ctx.fillStyle = friendly ? FRIEND : FOE;
    const x = cx + pos.x;
    const y = cy + pos.y;
    const angle = scopeAngle(headingRad(v.flight), heading);
    const support = Boolean(v.config.support);
    ctx.globalAlpha = !friendly && !known.has(v.id) ? 0.5 : 1;
    drawJet(ctx, x, y, angle, support ? JET_PX * 1.4 : JET_PX, !friendly);
    if (support) {
      // The dome: dark inside so it shows on a solid mark too.
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = DOME_FILL;
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (target && v.id === target.id) ctx.strokeRect(x - JET_PX - 3, y - JET_PX - 3, 2 * JET_PX + 6, 2 * JET_PX + 6);
  }
  for (const m of f.missiles) {
    if (!scopePoint(m.position.x - me.position.x, m.position.z - me.position.z, heading, scale, radius, pos)) continue;
    ctx.fillStyle = m.team === me.team ? PRIMARY : RED;
    ctx.beginPath();
    ctx.arc(cx + pos.x, cy + pos.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
