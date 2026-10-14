// Small SVG/HTML chart helpers. No dependencies.
// Colours are CSS custom properties, so light/dark themes swap automatically.

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
export const fix = (d) => (v) => v.toFixed(d);

function tipFor(el) {
  let t = el.querySelector(":scope > .tip");
  if (!t) {
    t = document.createElement("div");
    t.className = "tip";
    t.setAttribute("role", "status");
    el.appendChild(t);
  }
  return t;
}

function placeTip(el, tip, px, py) {
  const w = el.clientWidth;
  const tw = tip.offsetWidth;
  let left = px + 14;
  if (left + tw > w) left = Math.max(0, px - tw - 14);
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(0, py - 10)}px`;
}

// Re-render a chart whenever its container width changes.
const observed = new WeakMap();
const ro = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver((entries) => {
    for (const e of entries) {
      const f = observed.get(e.target);
      const w = Math.round(e.contentRect.width);
      if (f && w !== f.w) { f.w = w; f.draw(); }
    }
  })
  : null;

function mount(el, draw) {
  const prev = observed.get(el);
  if (prev) { prev.draw = draw; } else {
    observed.set(el, { w: el.clientWidth, draw });
    if (ro) ro.observe(el);
  }
  draw();
}

function linear(d0, d1, r0, r1) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  return (v) => r0 + (v - d0) * k;
}

function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

// ---------------------------------------------------------------------------
// Line chart with optional uncertainty bands, hover crosshair and tooltip.
// opts: {x:[], series:[{name,color,values,width,muted}], bands:[{lo,hi,color,opacity}],
//        yMin, yMax, yFmt, height, endLabels, xTickEvery}
export function lineChart(el, opts) {
  mount(el, () => drawLine(el, opts));
}

function drawLine(el, o) {
  const W = Math.max(260, el.clientWidth || 600);
  const H = o.height || 230;
  const endLabels = o.endLabels && W > 420;
  const longest = Math.max(0, ...o.series.filter((s) => s.label !== false).map((s) => (s.short || s.name).length));
  const m = { t: 10, r: endLabels ? Math.round(longest * 6.7 + 22) : 12, b: 26, l: 38 };
  el.querySelectorAll(":scope > svg").forEach((s) => s.remove());
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "" });
  el.prepend(svg);
  const x0 = o.x[0], x1 = o.x[o.x.length - 1];
  const yMin = o.yMin ?? 0, yMax = o.yMax ?? 1;
  const X = linear(x0, x1, m.l, W - m.r);
  const Y = linear(yMin, yMax, H - m.b, m.t);
  const yFmt = o.yFmt || pct;

  const g = svgEl("g", { class: "ticks" }, svg);
  for (const t of (o.yTicks || niceTicks(yMin, yMax, 4))) {
    svgEl("line", { class: t === yMin ? "base" : "grid", x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }, g);
    const tx = svgEl("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end" }, g);
    tx.textContent = yFmt(t);
  }
  const every = o.xTickEvery || (W < 480 ? 6 : 3);
  for (let i = 0; i < o.x.length; i++) {
    const xv = o.x[i];
    if (i !== o.x.length - 1 && ((xv - x0) % every !== 0 || x1 - xv < every * 0.7)) continue;
    const tx = svgEl("text", { x: X(xv), y: H - 6, "text-anchor": "middle" }, g);
    tx.textContent = xv;
  }

  for (const b of (o.bands || [])) {
    let d = "";
    b.hi.forEach((v, i) => { d += `${i ? "L" : "M"}${X(o.x[i]).toFixed(1)},${Y(v).toFixed(1)}`; });
    for (let i = b.lo.length - 1; i >= 0; i--) d += `L${X(o.x[i]).toFixed(1)},${Y(b.lo[i]).toFixed(1)}`;
    svgEl("path", { d: d + "Z", style: `fill:${b.color};opacity:${b.opacity ?? 0.12}` }, svg);
  }
  for (const s of o.series) {
    let d = "";
    s.values.forEach((v, i) => { d += `${i ? "L" : "M"}${X(o.x[i]).toFixed(1)},${Y(v).toFixed(1)}`; });
    svgEl("path", {
      d, fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round",
      style: `stroke:${s.color};stroke-width:${s.width || 2};opacity:${s.muted ? 0.45 : 1}`,
      "stroke-dasharray": s.dash || null,
    }, svg);
  }
  if (endLabels) {
    const ends = o.series.filter((s) => s.label !== false).map((s) => ({ s, y: Y(s.values[s.values.length - 1]) }));
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    for (const e of ends) {
      const yEnd = Y(e.s.values[e.s.values.length - 1]);
      svgEl("circle", { cx: X(x1), cy: yEnd, r: 4, style: `fill:${e.s.color};stroke:var(--surface);stroke-width:2` }, svg);
      if (Math.abs(e.y - yEnd) > 3) {
        svgEl("line", { x1: X(x1) + 5, y1: yEnd, x2: X(x1) + 10, y2: e.y, style: "stroke:var(--rule-strong)" }, svg);
      }
      const t = svgEl("text", { x: X(x1) + 12, y: e.y + 4, class: "lbl" }, svg);
      t.textContent = e.s.short || e.s.name;
    }
  }

  // When end labels don't fit, a legend carries series identity instead.
  let lg = el.querySelector(":scope > .legend.auto");
  if (o.endLabels && !endLabels && o.series.length > 1) {
    if (!lg) { lg = document.createElement("div"); lg.className = "legend auto"; el.appendChild(lg); }
    lg.innerHTML = o.series.filter((s) => s.label !== false).map((s) =>
      `<span><i style="background:${s.color}"></i>${s.short || s.name}</span>`).join("");
  } else if (lg) lg.remove();

  // hover layer
  const tip = tipFor(el);
  const cross = svgEl("line", { y1: m.t, y2: H - m.b, style: "stroke:var(--rule-strong);opacity:0" }, svg);
  const dots = o.series.map((s) => svgEl("circle", { r: 4, style: `fill:${s.color};stroke:var(--surface);stroke-width:2;opacity:0` }, svg));
  const hit = svgEl("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent", tabindex: 0 }, svg);
  const show = (i) => {
    const xv = o.x[i];
    cross.setAttribute("x1", X(xv)); cross.setAttribute("x2", X(xv)); cross.style.opacity = 1;
    o.series.forEach((s, k) => { dots[k].setAttribute("cx", X(xv)); dots[k].setAttribute("cy", Y(s.values[i])); dots[k].style.opacity = 1; });
    tip.innerHTML = `<div class="t-head">${o.tipHead ? o.tipHead(xv) : xv}</div>` + o.series.map((s) =>
      `<div class="row"><i style="background:${s.color}"></i><span>${s.name}</span><b>${(o.tipFmt || yFmt)(s.values[i])}</b></div>`).join("");
    tip.classList.add("on");
    const r = svg.getBoundingClientRect();
    placeTip(el, tip, X(xv) * r.width / W, m.t);
  };
  const hide = () => { tip.classList.remove("on"); cross.style.opacity = 0; dots.forEach((d) => (d.style.opacity = 0)); };
  let kIdx = o.x.length - 1;
  hit.addEventListener("pointermove", (ev) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * W / r.width;
    const xv = x0 + (px - m.l) / (W - m.l - m.r) * (x1 - x0);
    kIdx = Math.max(0, Math.min(o.x.length - 1, Math.round((xv - x0) / ((x1 - x0) / (o.x.length - 1)))));
    show(kIdx);
  });
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("focus", () => show(kIdx));
  hit.addEventListener("blur", hide);
  hit.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") { kIdx = Math.max(0, kIdx - 1); show(kIdx); ev.preventDefault(); }
    if (ev.key === "ArrowRight") { kIdx = Math.min(o.x.length - 1, kIdx + 1); show(kIdx); ev.preventDefault(); }
  });
}

// ---------------------------------------------------------------------------
// 100% stacked area (value composition over time).
export function stackedArea(el, opts) {
  mount(el, () => drawStack(el, opts));
}

function drawStack(el, o) {
  const W = Math.max(260, el.clientWidth || 600);
  const H = o.height || 240;
  const lab = W > 420;
  const longest = Math.max(...o.series.map((s) => (s.short || s.name).length)) + 4;
  const m = { t: 8, r: lab ? Math.round(longest * 6.7 + 16) : 10, b: 26, l: 38 };
  el.querySelectorAll(":scope > svg").forEach((s) => s.remove());
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "" });
  el.prepend(svg);
  const x0 = o.x[0], x1 = o.x[o.x.length - 1];
  const X = linear(x0, x1, m.l, W - m.r);
  const Y = linear(0, 1, H - m.b, m.t);
  const n = o.x.length;
  const cum = new Array(n).fill(0);
  const layers = o.series.map((s) => {
    const lo = cum.slice();
    for (let i = 0; i < n; i++) cum[i] += s.values[i];
    return { s, lo, hi: cum.slice() };
  });
  const GAP = 1; // half of the 2px surface gap, applied to each side
  for (const L of layers) {
    let d = "";
    for (let i = 0; i < n; i++) d += `${i ? "L" : "M"}${X(o.x[i]).toFixed(1)},${(Y(L.hi[i]) + GAP).toFixed(1)}`;
    for (let i = n - 1; i >= 0; i--) d += `L${X(o.x[i]).toFixed(1)},${(Y(L.lo[i]) - GAP).toFixed(1)}`;
    svgEl("path", { d: d + "Z", style: `fill:${L.s.color};opacity:0.85` }, svg);
  }
  const g = svgEl("g", { class: "ticks" }, svg);
  for (const t of [0, 0.5, 1]) {
    const tx = svgEl("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end" }, g);
    tx.textContent = pct(t);
  }
  const every = W < 480 ? 6 : 3;
  for (const xv of o.x) {
    if (xv !== x1 && ((xv - x0) % every !== 0 || x1 - xv < every * 0.7)) continue;
    const tx = svgEl("text", { x: X(xv), y: H - 6, "text-anchor": "middle" }, g);
    tx.textContent = xv;
  }
  if (lab) {
    const ends = layers.map((L) => ({ L, y: Y((L.lo[n - 1] + L.hi[n - 1]) / 2), h: L.hi[n - 1] - L.lo[n - 1] }))
      .filter((e) => e.h > 0.035);
    for (let i = 1; i < ends.length; i++) if (ends[i - 1].y - ends[i].y < 14) ends[i].y = ends[i - 1].y - 14;
    for (const e of ends) {
      const t = svgEl("text", { x: X(x1) + 8, y: e.y + 4, class: "lbl" }, svg);
      t.textContent = `${e.L.s.short || e.L.s.name} ${pct(e.h)}`;
    }
  }
  const tip = tipFor(el);
  const cross = svgEl("line", { y1: m.t, y2: H - m.b, style: "stroke:var(--surface);stroke-width:2;opacity:0" }, svg);
  const hit = svgEl("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent", tabindex: 0 }, svg);
  let kIdx = n - 1;
  const show = (i) => {
    cross.setAttribute("x1", X(o.x[i])); cross.setAttribute("x2", X(o.x[i])); cross.style.opacity = 1;
    tip.innerHTML = `<div class="t-head">${o.x[i]}</div>` + [...o.series].reverse().map((s) =>
      `<div class="row"><i style="background:${s.color};height:10px"></i><span>${s.name}</span><b>${pct(s.values[i])}</b></div>`).join("");
    tip.classList.add("on");
    const r = svg.getBoundingClientRect();
    placeTip(el, tip, X(o.x[i]) * r.width / W, m.t);
  };
  const hide = () => { tip.classList.remove("on"); cross.style.opacity = 0; };
  hit.addEventListener("pointermove", (ev) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * W / r.width;
    kIdx = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (W - m.l - m.r) * (n - 1))));
    show(kIdx);
  });
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("focus", () => show(kIdx));
  hit.addEventListener("blur", hide);
  hit.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") { kIdx = Math.max(0, kIdx - 1); show(kIdx); ev.preventDefault(); }
    if (ev.key === "ArrowRight") { kIdx = Math.min(n - 1, kIdx + 1); show(kIdx); ev.preventDefault(); }
  });
}

// ---------------------------------------------------------------------------
// Probability heatmap on a sequential blue ramp, with an optional marker.
export function heatmap(el, opts) {
  mount(el, () => drawHeat(el, opts));
}

const SEQ = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"];
export function seqColor(v) {
  const i = Math.max(0, Math.min(SEQ.length - 1, Math.round(v * (SEQ.length - 1))));
  return `var(${SEQ[i]})`;
}

function drawHeat(el, o) {
  const W = Math.max(240, el.clientWidth || 400);
  const m = { t: 8, r: 8, b: 40, l: 58 };
  const plotW = W - m.l - m.r;
  const H = o.height || Math.round(Math.min(320, plotW * 0.8) + m.t + m.b);
  el.querySelectorAll(":scope > svg").forEach((s) => s.remove());
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "" });
  el.prepend(svg);
  const nx = o.xs.length, ny = o.ys.length;
  const cw = plotW / nx, ch = (H - m.t - m.b) / ny;
  const tip = tipFor(el);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const v = o.z[iy][ix];
      const r = svgEl("rect", {
        x: m.l + ix * cw, y: H - m.b - (iy + 1) * ch, width: cw + 0.5, height: ch + 0.5,
        style: `fill:${seqColor(v)}`,
      }, svg);
      r.addEventListener("pointerenter", () => {
        tip.innerHTML = `<div class="t-head">${pct(v)} ${o.metricName || ""}</div>` +
          `<div>${o.xLabel}: ${(o.xFmt || fix(2))(o.xs[ix])}</div><div>${o.yLabel}: ${(o.yFmt || fix(2))(o.ys[iy])}</div>`;
        tip.classList.add("on");
        const b = svg.getBoundingClientRect();
        placeTip(el, tip, (m.l + (ix + 1) * cw) * b.width / W, (H - m.b - (iy + 1) * ch) * b.height / H);
      });
    }
  }
  svg.addEventListener("pointerleave", () => tip.classList.remove("on"));
  const X = linear(o.xs[0], o.xs[nx - 1], m.l + cw / 2, m.l + plotW - cw / 2);
  const Y = linear(o.ys[0], o.ys[ny - 1], H - m.b - ch / 2, m.t + ch / 2);
  const g = svgEl("g", { class: "ticks" }, svg);
  for (const t of niceTicks(o.xs[0], o.xs[nx - 1], 4)) {
    const tx = svgEl("text", { x: X(t), y: H - m.b + 15, "text-anchor": "middle" }, g);
    tx.textContent = (o.xFmt || fix(2))(t);
  }
  for (const t of niceTicks(o.ys[0], o.ys[ny - 1], 4)) {
    const tx = svgEl("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end" }, g);
    tx.textContent = (o.yFmt || fix(2))(t);
  }
  const xl = svgEl("text", { x: m.l + plotW / 2, y: H - 4, "text-anchor": "middle", class: "lbl" }, svg);
  xl.textContent = o.xLabel;
  const yl = svgEl("text", { x: 12, y: m.t + (H - m.t - m.b) / 2, "text-anchor": "middle", class: "lbl",
    transform: `rotate(-90 12 ${m.t + (H - m.t - m.b) / 2})` }, svg);
  yl.textContent = o.yLabel;
  if (o.marker) {
    const cx = X(Math.max(o.xs[0], Math.min(o.xs[nx - 1], o.marker.x)));
    const cy = Y(Math.max(o.ys[0], Math.min(o.ys[ny - 1], o.marker.y)));
    svgEl("circle", { cx, cy, r: 7, style: "fill:none;stroke:var(--surface);stroke-width:4" }, svg);
    svgEl("circle", { cx, cy, r: 7, style: "fill:none;stroke:var(--ink);stroke-width:2" }, svg);
  }
}

export function heatLegend(el, label) {
  el.innerHTML = `<div class="legend" style="align-items:center">${label}: 0%
    <span style="display:inline-flex;gap:0">${SEQ.map((v) => `<i class="sw" style="width:16px;border-radius:0;background:var(${v})"></i>`).join("")}</span> 100%</div>`;
}

// ---------------------------------------------------------------------------
// Ranked horizontal bars with interval whiskers (HTML, wraps on narrow screens).
export function rankBars(el, rows, { max, fmt = fix(2), color = "var(--s-1)", altColor = "var(--ink)" } = {}) {
  const top = max ?? Math.max(...rows.map((r) => r.hi ?? r.value), 0.01);
  el.innerHTML = rows.map((r) => {
    const w = Math.max(0, r.value) / top * 100;
    const lo = Math.max(0, r.lo ?? r.value) / top * 100, hi = Math.min(1, (r.hi ?? r.value) / top) * 100;
    return `<div style="display:grid;grid-template-columns:minmax(120px,42%) 1fr;gap:10px;align-items:center;padding:5px 0;font-family:var(--sans);font-size:13.5px">
      <div style="color:var(--ink);line-height:1.25">${r.label}${r.tag ? `<span class="kind-tag">${r.tag}</span>` : ""}</div>
      <div style="position:relative;height:20px" title="${r.label}: ${fmt(r.value)}">
        <div style="position:absolute;left:0;top:4px;height:12px;width:${w}%;background:${r.alt ? altColor : color};border-radius:0 4px 4px 0"></div>
        <div style="position:absolute;top:9px;height:2px;left:${lo}%;width:${Math.max(0, hi - lo)}%;background:var(--ink-2);opacity:.55"></div>
        <span style="position:absolute;left:calc(${Math.min(hi, 86)}% + 6px);top:0;font-variant-numeric:tabular-nums;color:var(--ink-2);font-size:12.5px">${fmt(r.value)}</span>
      </div></div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Outcome distribution: one 100% bar plus a labelled legend that carries values.
export function outcomeStack(el, shares, outcomes, { compact = false } = {}) {
  const segs = outcomes.filter((o) => shares[o.id] > 0.0005);
  el.classList.add("ostack");
  el.classList.toggle("compact", compact);
  el.innerHTML = `<div class="bar" role="img" aria-label="${outcomes.map((o) => `${o.label} ${pct(shares[o.id])}`).join(", ")}">` +
    segs.map((o) => `<span title="${o.label}: ${pct(shares[o.id], 1)}" style="flex:${shares[o.id]} 1 0;background:var(--o-${o.id})"></span>`).join("") +
    `</div><ul>` + outcomes.map((o) =>
      `<li><i style="background:var(--o-${o.id})"></i><span><b>${pct(shares[o.id])}</b>${o.label}</span></li>`).join("") + `</ul>`;
}

export function dataTable(el, headers, rows) {
  el.innerHTML = `<details class="data"><summary>Show data table</summary><div class="tbl-wrap"><table>
    <thead><tr>${headers.map((h, i) => `<th class="${i ? "num" : ""}">${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div></details>`;
}
