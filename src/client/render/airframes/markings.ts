/**
 * The markings painted on the real-type airframes (revision 31), drawn on a canvas: the Russian red star (red, white
 * border, thin red edge), the USAF star-and-bar in subdued grey, bort numbers (outlined, as the owner's reference
 * pictures show them), tail codes and serials, and fin bands.
 */
export type MarkingArt =
  | { kind: 'red-star' }
  /** the low-visibility star-and-bar: solid in one colour, with the star and the bars' stripes left unpainted */
  | { kind: 'us-star'; color: string }
  | {
      kind: 'text';
      text: string;
      /** fill colour, or none for hollow numerals */
      fill?: string;
      /** outline colour and width (fraction of the height) */
      stroke?: string;
      strokeW?: number;
      /** a thin line of this colour along the middle of the outline */
      inner?: string;
    }
  /** horizontal bands, top to bottom */
  | { kind: 'bands'; colors: readonly string[]; aspect: number };

/** Width over height of the art's cell. */
export function markingAspect(art: MarkingArt): number {
  switch (art.kind) {
    case 'red-star':
      return 1;
    case 'us-star':
      return 2.05;
    case 'text':
      return Math.max(0.7, art.text.length * 0.62);
    case 'bands':
      return art.aspect;
  }
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const inner = r * 0.382;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : inner;
    if (i === 0) ctx.moveTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    else ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  ctx.closePath();
}

/** Draws the art filling a w × h cell (canvas units) at the current origin. */
export function drawMarking(ctx: CanvasRenderingContext2D, art: MarkingArt, w: number, h: number): void {
  switch (art.kind) {
    case 'red-star': {
      const r = Math.min(w, h) * 0.5;
      const cx = w / 2;
      const cy = h / 2 + r * 0.06;
      starPath(ctx, cx, cy, r * 0.98);
      ctx.fillStyle = '#b3242c';
      ctx.fill();
      starPath(ctx, cx, cy, r * 0.9);
      ctx.fillStyle = '#eef0ee';
      ctx.fill();
      starPath(ctx, cx, cy, r * 0.74);
      ctx.fillStyle = '#c8282f';
      ctx.fill();
      break;
    }
    case 'us-star': {
      const R = h * 0.49;
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = art.color;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // Bars: one radius long each side, half a radius high, their top in line with the star's upper arms.
      const top = cy - R * Math.sin((18 * Math.PI) / 180);
      ctx.fillRect(cx - 2 * R, top, 4 * R, R * 0.5);
      ctx.globalCompositeOperation = 'destination-out';
      starPath(ctx, cx, cy, R * 0.97);
      ctx.fill();
      const stripe = R / 6;
      ctx.fillRect(cx - 1.9 * R, top + R * 0.25 - stripe / 2, 0.85 * R, stripe);
      ctx.fillRect(cx + 1.05 * R, top + R * 0.25 - stripe / 2, 0.85 * R, stripe);
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'text': {
      ctx.font = `bold ${Math.round(h * 0.86)}px "Arial Narrow", "Liberation Sans Narrow", "Roboto Condensed", Arial, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      const measured = ctx.measureText(art.text).width || 1;
      const outline = (art.strokeW ?? 0) * h;
      const sx = Math.min(1, (w - outline - 4) / measured);
      ctx.save();
      ctx.translate(w / 2, h / 2 + h * 0.03);
      ctx.scale(sx, 1);
      if (art.stroke && outline > 0) {
        ctx.strokeStyle = art.stroke;
        ctx.lineWidth = outline / sx;
        ctx.strokeText(art.text, 0, 0);
      }
      if (art.inner) {
        ctx.strokeStyle = art.inner;
        ctx.lineWidth = (outline * 0.32) / sx;
        ctx.strokeText(art.text, 0, 0);
      }
      if (art.fill) {
        ctx.fillStyle = art.fill;
        ctx.fillText(art.text, 0, 0);
      }
      ctx.restore();
      break;
    }
    case 'bands': {
      const bh = h / art.colors.length;
      art.colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, i * bh, w, bh + 0.5);
      });
      break;
    }
  }
}
