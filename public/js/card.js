// Client-side share card (1080x1920 PNG via canvas). Fallback used only when a result has no server id
// (otherwise the Worker renders /og/:id.png?format=story).
// drawCard takes any CanvasRenderingContext2D-like object so it can be unit-tested with a stub.

export const CARD_W = 1080;
export const CARD_H = 1920;
export const SITE = 'unlocked-iq.shubhammathur.in';

const DISPLAY = '"Space Grotesk", "Inter", system-ui, sans-serif';
const BODY = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

// Shorten text with an ellipsis until it fits maxW.
export function fitText(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

export function logoMark(ctx, x, y, size, color, openColor) {
  const gap = size * 0.1;
  const cell = (size - gap * 2) / 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * (cell + gap);
      const cy = y + r * (cell + gap);
      rr(ctx, cx, cy, cell, cell, cell * 0.28);
      if (r === 2 && c === 2) {
        ctx.strokeStyle = openColor || color;
        ctx.lineWidth = Math.max(2, size * 0.055);
        ctx.setLineDash?.([cell * 0.28, cell * 0.2]);
        ctx.stroke();
        ctx.setLineDash?.([]);
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }
}

// data: { name, iq, low, high, percentile (1..99), byCategory {id:{correct,total}}, labels {id:label}, order? }
export function drawCard(ctx, data, W = CARD_W, H = CARD_H) {
  const { name = '', iq, low, high, percentile, byCategory = {}, labels = {} } = data;
  const order = data.order || Object.keys(labels);

  // background
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#2a2a8a');
  g.addColorStop(0.55, '#4338ca');
  g.addColorStop(1, '#6366f1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W * 0.92, H * 0.12, 360, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.04, H * 0.78, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // brand
  logoMark(ctx, 90, 110, 84, '#ffffff', '#fbbf24');
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 54px ${DISPLAY}`;
  ctx.fillText('Unlocked IQ', 200, 172);

  // heading
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = `600 46px ${BODY}`;
  const who = name ? `${name}’s result` : 'My result';
  ctx.fillText(fitText(ctx, who, W - 180), 90, 360);

  // IQ number
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 400px ${DISPLAY}`;
  ctx.fillText(String(iq), 80, 740);
  ctx.fillStyle = '#fcd34d';
  ctx.font = `600 44px ${BODY}`;
  ctx.fillText('ESTIMATED IQ', 96, 810);

  // range + percentile pill
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `500 46px ${BODY}`;
  ctx.fillText(`90% range ${low}–${high}`, 96, 900);

  const pill = percentile >= 50 ? `Higher than ${percentile}% of people` : `Percentile ${percentile}`;
  ctx.font = `600 42px ${BODY}`;
  const pw = ctx.measureText(pill).width + 80;
  rr(ctx, 90, 950, pw, 96, 48);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pill, 130, 1013);

  // bars
  const rows = order.filter((k) => byCategory[k]);
  let y = 1190;
  const trackW = W - 180;
  for (const k of rows) {
    const { correct, total } = byCategory[k];
    const pct = total ? correct / total : 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 40px ${BODY}`;
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, labels[k] || k, trackW - 150), 90, y);
    ctx.textAlign = 'right';
    ctx.font = `700 44px ${DISPLAY}`;
    ctx.fillText(`${Math.round(pct * 100)}%`, 90 + trackW, y);
    ctx.textAlign = 'left';
    rr(ctx, 90, y + 24, trackW, 28, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    if (pct > 0) {
      rr(ctx, 90, y + 24, Math.max(28, trackW * pct), 28, 14);
      ctx.fillStyle = '#fcd34d';
      ctx.fill();
    }
    y += 150;
  }

  // footer
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 40px ${BODY}`;
  ctx.textAlign = 'left';
  ctx.fillText('Free. No email. No paywall.', 90, H - 190);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 46px ${DISPLAY}`;
  ctx.fillText(SITE, 90, H - 120);
}

// -> Promise<Blob|null>
export async function renderCard(data) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    try {
      await Promise.all([
        document.fonts.load(`700 100px "Space Grotesk"`),
        document.fonts.load(`600 40px "Inter"`),
      ]);
    } catch {
      /* fonts are optional */
    }
    drawCard(ctx, data);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } catch {
    return null;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
