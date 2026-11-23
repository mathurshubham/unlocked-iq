// Charts as SVG strings (pure, importable from node) plus a small DOM tooltip helper.
// Chart rules (SPEC.md): one accent colour, value labels in ink, recessive axes, hover tooltips,
// bars are single-series so there is no legend. Colours come from CSS classes in app.css.

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Standard normal CDF (Abramowitz & Stegun 7.1.26).
export function normCdf(x) {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  return 0.5 * (1 + (x >= 0 ? y : -y));
}

export const iqPercentile = (iq) => Math.min(99, Math.max(1, Math.round(normCdf((iq - 100) / 15) * 100)));

// ---------------- bell curve ----------------
export const BELL = { W: 360, H: 200, L: 14, R: 346, base: 158, top: 56, XMIN: 40, XMAX: 160 };

export function bellGeometry() {
  const { L, R, base, top, XMIN, XMAX } = BELL;
  const X = (v) => L + ((v - XMIN) / (XMAX - XMIN)) * (R - L);
  const Y = (v) => base - Math.exp(-0.5 * ((v - 100) / 15) ** 2) * (base - top);
  return { X, Y };
}

export function bellSvg({ iq, low, high }) {
  const { W, H, L, R, base, top, XMIN, XMAX } = BELL;
  const { X, Y } = bellGeometry();
  const f1 = (n) => n.toFixed(1);
  const pts = (a, b) => {
    const out = [];
    for (let v = a; v <= b + 1e-9; v += 1) out.push(`${f1(X(v))},${f1(Y(v))}`);
    return out;
  };
  const lo = Math.max(XMIN, low);
  const hi = Math.min(XMAX, high);
  const curve = 'M' + pts(XMIN, XMAX).join(' L');
  const area = `M${f1(X(XMIN))},${base} L` + pts(XMIN, XMAX).join(' L') + ` L${f1(X(XMAX))},${base} Z`;
  const band = `M${f1(X(lo))},${base} L` + pts(lo, hi).join(' L') + ` L${f1(X(hi))},${base} Z`;
  const ticks = [55, 70, 85, 100, 115, 130, 145]
    .map(
      (v) =>
        `<line class="ch-axis" x1="${f1(X(v))}" x2="${f1(X(v))}" y1="${base}" y2="${base + 4}"/>` +
        `<text class="ch-t-muted" x="${f1(X(v))}" y="${base + 18}" font-size="11" text-anchor="middle">${v}</text>`,
    )
    .join('');
  const mx = X(iq);
  const lx = Math.min(R - 26, Math.max(L + 26, mx));
  const label = `IQ ${iq}`;
  return `<svg class="chart chart-bell" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(
    `Bell curve with mean 100 and standard deviation 15. The estimate of ${iq} is marked, with a 90 percent range from ${low} to ${high}.`,
  )}">
    <path class="ch-area" d="${area}"/>
    <path class="ch-band" d="${band}"/>
    <path class="ch-curve" pathLength="1" d="${curve}"/>
    <line class="ch-axis" x1="${L}" x2="${R}" y1="${base}" y2="${base}"/>
    ${ticks}
    <g class="ch-mark">
      <line class="ch-marker" x1="${f1(mx)}" x2="${f1(mx)}" y1="${base}" y2="${top - 14}"/>
      <circle class="ch-dot" cx="${f1(mx)}" cy="${f1(Y(iq))}" r="5.5"/>
      <text class="ch-label" x="${f1(lx)}" y="${top - 24}" font-size="15" font-weight="700" text-anchor="middle">${label}</text>
      <text class="ch-t-muted" x="${f1(lx)}" y="${top - 8}" font-size="10.5" text-anchor="middle">${low}&#8211;${high} likely</text>
    </g>
    <rect class="ch-hit" data-bell="${L},${R},${XMIN},${XMAX}" x="${L}" y="0" width="${R - L}" height="${base}"/>
  </svg>`;
}

// ---------------- category bars ----------------
export function barsSvg(byCategory, labels, order = Object.keys(labels)) {
  const rows = order.filter((k) => byCategory[k]);
  const rowH = 56, W = 360, trackW = 304, barH = 14;
  const H = Math.max(rowH, rows.length * rowH);
  const body = rows
    .map((k, i) => {
      const { correct, total } = byCategory[k];
      const pct = total ? (correct / total) * 100 : 0;
      const y = i * rowH;
      const w = pct > 0 ? Math.max(8, (pct / 100) * trackW) : 0;
      const tip = `${labels[k]}: ${correct} of ${total} correct`;
      return `<g class="ch-row" style="--i:${i}" tabindex="0" data-tip="${esc(tip)}" role="img" aria-label="${esc(tip)}">
        <rect class="ch-hit" x="0" y="${y}" width="${W}" height="${rowH}"/>
        <text class="ch-name" x="0" y="${y + 17}" font-size="13" font-weight="600">${esc(labels[k])}</text>
        <rect class="ch-track" x="0" y="${y + 27}" width="${trackW}" height="${barH}" rx="5"/>
        ${w > 0 ? `<rect class="ch-bar" x="0" y="${y + 27}" width="${w.toFixed(1)}" height="${barH}" rx="5"/>` : ''}
        <text class="ch-value" x="${W}" y="${y + 39}" font-size="14" font-weight="700" text-anchor="end">${Math.round(pct)}%</text>
      </g>`;
    })
    .join('');
  return `<svg class="chart chart-bars" viewBox="0 0 ${W} ${H}" role="group" aria-label="Percent correct by category">${body}</svg>`;
}

// ---------------- ring timer ----------------
export const RING = { size: 52, r: 22, stroke: 4 };
export const RING_C = 2 * Math.PI * RING.r;

// Fraction of the ring that is still filled.
export const ringFraction = (left, limit) => (limit > 0 ? Math.min(1, Math.max(0, left / limit)) : 0);
export const ringOffset = (left, limit) => RING_C * (1 - ringFraction(left, limit));

export function ringMarkup(label = 'Time remaining') {
  const { size, r, stroke } = RING;
  const c = size / 2;
  return `<div class="ring" role="timer" aria-label="${esc(label)}">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" focusable="false">
      <circle class="ring-track" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="ring-prog" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0" transform="rotate(-90 ${c} ${c})"/>
    </svg>
    <span class="ring-text">0:00</span>
  </div>`;
}

// ---------------- tooltip (DOM) ----------------
// One shared tooltip element; supports [data-tip] text and the bell-curve hit area ([data-bell]).
export function attachTooltips(root, doc = globalThis.document) {
  if (!doc || !root) return () => {};
  let tip = doc.getElementById('chart-tip');
  if (!tip) {
    tip = doc.createElement('div');
    tip.id = 'chart-tip';
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    doc.body.appendChild(tip);
  }
  const place = (x, y) => {
    const w = tip.offsetWidth;
    const vw = doc.documentElement.clientWidth;
    tip.style.left = `${Math.min(vw - w - 8, Math.max(8, x + 12))}px`;
    tip.style.top = `${Math.max(8, y - tip.offsetHeight - 14)}px`;
  };
  const textFor = (el, e) => {
    if (el.hasAttribute('data-bell')) {
      const [l, r, xmin, xmax] = el.getAttribute('data-bell').split(',').map(Number);
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / (rect.width || 1)));
      const iq = Math.round(xmin + frac * (xmax - xmin));
      void l; void r;
      return `IQ ${iq}: higher than ${iqPercentile(iq)}% of people`;
    }
    return el.getAttribute('data-tip');
  };
  const onOver = (e) => {
    const el = e.target.closest?.('[data-tip],[data-bell]');
    if (!el || !root.contains(el)) return;
    tip.textContent = textFor(el, e);
    tip.hidden = false;
    place(e.clientX, e.clientY);
  };
  const onMove = (e) => {
    if (tip.hidden) return;
    const el = e.target.closest?.('[data-tip],[data-bell]');
    if (!el) return;
    if (el.hasAttribute('data-bell')) tip.textContent = textFor(el, e);
    place(e.clientX, e.clientY);
  };
  const hide = () => {
    tip.hidden = true;
  };
  const onFocus = (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    tip.textContent = el.getAttribute('data-tip');
    tip.hidden = false;
    place(r.left + r.width / 2, r.top);
  };
  root.addEventListener('pointerover', onOver);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-tip],[data-bell]')) hide();
  });
  root.addEventListener('focusin', onFocus);
  root.addEventListener('focusout', hide);
  doc.addEventListener('scroll', hide, { passive: true });
  return hide;
}
