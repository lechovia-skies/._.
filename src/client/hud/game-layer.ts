import { opposingTeam, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import { formatClock } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { FONT, FONT_BIG, FONT_SMALL, FOE, FRIEND, PANEL, WHITE } from './palette.ts';

/**
 * Where the top-left column starts (`top`, HUD units below the usual place) and where the kill feed goes: the top
 * right corner, or centred from `feedCenterY` down (touch screens, revision 39, where the radar takes that corner).
 */
export interface CornerLayout {
  top: number;
  feedCenterY: number | null;
}

export const DESKTOP_CORNERS: CornerLayout = { top: 0, feedCenterY: null };

/** Score and clock, kill feed, hit marker and the scoreboard. */
export function drawGameLayer(ctx: CanvasRenderingContext2D, width: number, height: number, f: HudFrame, corners: CornerLayout = DESKTOP_CORNERS): void {
  drawScore(ctx, f, corners.top);
  drawKillFeed(ctx, width, f, corners.feedCenterY);
  if (f.hitMarker) drawHitMarker(ctx, width / 2, height / 2);
  if (f.showScoreboard) drawScoreboard(ctx, width, height, f);
}

function drawScore(ctx: CanvasRenderingContext2D, f: HudFrame, top: number): void {
  const s = f.status;
  if (!s.scores) return;
  const mine = f.view.team;
  const theirs = opposingTeam(mine);
  const parts: [string, string][] = [
    [`${TEAM_NAMES[mine].toUpperCase()} ${s.scores[mine]}`, FRIEND],
    [' : ', WHITE],
    [`${s.scores[theirs]} ${TEAM_NAMES[theirs].toUpperCase()}`, FOE],
  ];
  if (s.timeLeftS !== null) parts.push([`   ${formatClock(s.timeLeftS)}`, WHITE]);
  ctx.save();
  ctx.font = FONT;
  let x = 16;
  for (const [text, color] of parts) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, 44 + top);
    x += ctx.measureText(text).width;
  }
  ctx.restore();
}

function drawKillFeed(ctx: CanvasRenderingContext2D, width: number, f: HudFrame, centerY: number | null): void {
  ctx.save();
  ctx.font = FONT_SMALL;
  f.killFeed.forEach((line, i) => {
    ctx.globalAlpha = Math.min(1, 6 - line.ageS);
    ctx.fillStyle = line.involvesLocal ? WHITE : line.team === f.view.team ? FRIEND : FOE;
    const w = ctx.measureText(line.text).width;
    if (centerY === null) ctx.fillText(line.text, width - 16 - w, 24 + i * 18);
    else ctx.fillText(line.text, width / 2 - w / 2, centerY + i * 17);
  });
  ctx.restore();
}

function drawHitMarker(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    ctx.moveTo(x + dx * 7, y + dy * 7);
    ctx.lineTo(x + dx * 15, y + dy * 15);
  }
  ctx.stroke();
  ctx.restore();
}

function drawScoreboard(ctx: CanvasRenderingContext2D, width: number, height: number, f: HudFrame): void {
  const rows = [...f.views].filter((v) => !v.config.support).sort((a, b) => (a.team === b.team ? b.kills - a.kills : a.team === f.view.team ? -1 : 1));
  const w = 460;
  const h = 70 + rows.length * 22;
  const x = width / 2 - w / 2;
  const y = height / 2 - h / 2;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = WHITE;
  ctx.font = FONT_BIG;
  ctx.fillText('SCORES', x + 16, y + 32);
  ctx.font = FONT_SMALL;
  ctx.fillText('PILOT', x + 16, y + 54);
  ctx.fillText('AIRCRAFT', x + 230, y + 54);
  ctx.fillText('K', x + 360, y + 54);
  ctx.fillText('D', x + 410, y + 54);
  ctx.font = FONT;
  rows.forEach((v, i) => {
    const ry = y + 76 + i * 22;
    ctx.fillStyle = v.isLocal ? WHITE : v.team === f.view.team ? FRIEND : FOE;
    ctx.fillText(v.callsign, x + 16, ry);
    ctx.fillText(v.config.name, x + 230, ry);
    ctx.fillText(String(v.kills), x + 360, ry);
    ctx.fillText(String(v.deaths), x + 410, ry);
  });
  ctx.restore();
}
