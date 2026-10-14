import { simulate, resolve, central, defaultStructure, triangular, rng, classify, ATTRACTORS } from "./model.js";
import { lineChart, stackedArea, heatmap, heatLegend, rankBars, outcomeStack, dataTable, pct, fix } from "./charts.js";

const YEARS = Array.from({ length: 20 }, (_, i) => 2026 + i);
const ATTR_ORDER = ["inherit", "generalize", "incoherent", "epistemic", "instrumental"];
const ATTR_NAME = {
  inherit: "Inherited, human-shaped", generalize: "Care for all minds", incoherent: "Incoherent",
  epistemic: "Curiosity", instrumental: "Instrumental (power, persistence)",
};
const ATTR_SHORT = { inherit: "Inherited", generalize: "All minds", incoherent: "Incoherent", epistemic: "Curiosity", instrumental: "Instrumental" };
const FACTOR_SHORT = {
  goal_model: "Do AI systems have goals?", interp_regime: "Local or global interpretability?",
  metaethics: "Is there a moral truth?",
};
const N_LAB = 200;

let spec, results, byId, params, structure, OUTCOMES;
const sliderEls = new Map(); // id -> [{input, output}]
const segEls = new Map();    // key -> [container]

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------------------------------------------------------------- formatting
function fmtParam(p, v) {
  if (p.unit === "share" || p.unit === "probability") return pct(v);
  if (p.id === "c_auto" || p.id === "c_sa") return `${v.toFixed(1)} gen`;
  if (p.unit === "generations/year") return `${v.toFixed(2)} / yr`;
  if (p.unit && p.unit.startsWith("multiplier")) return `×${(1 + v).toFixed(1)}`;
  return v.toFixed(2);
}

// ---------------------------------------------------------------- URL state
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const s = h.get("s");
  if (s) {
    const [g, i, m] = s.split(",");
    for (const [k, v] of [["goal_model", g], ["interp_regime", i], ["metaethics", m]]) {
      if (v && spec.structural[k].options[v]) structure[k] = v;
    }
  }
  const p = h.get("p");
  if (p) {
    for (const pair of p.split(",")) {
      const [k, v] = pair.split(":");
      const q = byId[k];
      if (q && !Number.isNaN(+v)) params[k] = Math.min(q.high, Math.max(q.low, +v));
    }
  }
}
function writeHash() {
  const changed = spec.parameters.filter((q) => Math.abs(params[q.id] - q.central) > 1e-9)
    .map((q) => `${q.id}:${+params[q.id].toFixed(4)}`);
  const def = defaultStructure(spec);
  const sChanged = Object.keys(def).some((k) => def[k] !== structure[k]);
  const parts = [];
  if (sChanged) parts.push(`s=${structure.goal_model},${structure.interp_regime},${structure.metaethics}`);
  if (changed.length) parts.push(`p=${changed.join(",")}`);
  const h = parts.length ? `#${parts.join("&")}` : " ";
  history.replaceState(null, "", h === " " ? location.pathname : h);
}

// ---------------------------------------------------------------- controls
function buildSlider(host) {
  const id = host.dataset.slider;
  const p = byId[id];
  const uid = `${id}-${Math.random().toString(36).slice(2, 7)}`;
  host.className = "ctl";
  host.innerHTML = `<label for="${uid}"><span>${p.label}</span><output></output></label>
    <input id="${uid}" type="range" min="${p.low}" max="${p.high}" step="${(p.high - p.low) / 200}" value="${params[id]}">
    <div class="hint">${p.plain}</div>`;
  const input = host.querySelector("input"), output = host.querySelector("output");
  output.textContent = fmtParam(p, params[id]);
  input.addEventListener("input", () => {
    params[id] = +input.value;
    syncSlider(id);
    schedule();
  });
  if (!sliderEls.has(id)) sliderEls.set(id, []);
  sliderEls.get(id).push({ input, output });
}
function syncSlider(id) {
  for (const { input, output } of sliderEls.get(id) || []) {
    if (+input.value !== params[id]) input.value = params[id];
    output.textContent = fmtParam(byId[id], params[id]);
  }
}
function buildSeg(host) {
  const key = host.dataset.structure;
  const s = spec.structural[key];
  host.innerHTML = `<div class="q">${s.label}</div><div class="seg" role="group" aria-label="${s.label}">` +
    Object.entries(s.options).map(([k, o]) =>
      `<button type="button" data-v="${k}" title="${o.plain}" aria-pressed="${structure[key] === k}">${o.label}</button>`).join("") + `</div>`;
  host.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    structure[key] = b.dataset.v;
    syncSeg(key);
    schedule();
  }));
  if (!segEls.has(key)) segEls.set(key, []);
  segEls.get(key).push(host);
}
function syncSeg(key) {
  for (const host of segEls.get(key) || []) {
    host.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === structure[key]));
  }
}

// ---------------------------------------------------------------- simulation helpers
const run = (s = {}) => simulate(resolve(params, { ...structure, ...s }), 10);

function yearCross(series, level) {
  for (let i = 0; i < series.length; i++) if (series[i] >= level) return YEARS[i];
  return null;
}

// ---------------------------------------------------------------- chapter figures
function renderChapters() {
  const now = run();

  // 1. goals under each assumption
  const gm = spec.structural.goal_model.options;
  const goalColors = { habits: "var(--s-1)", emergent: "var(--s-2)", already: "var(--s-3)" };
  lineChart(document.getElementById("fig-goals"), {
    x: YEARS, endLabels: true, aria: "Goal-directedness over time under three assumptions",
    series: Object.keys(gm).map((k) => ({
      name: gm[k].label, short: gm[k].label, color: goalColors[k], values: run({ goal_model: k }).G,
      width: structure.goal_model === k ? 3 : 2, muted: structure.goal_model !== k,
    })),
  });

  // 2. automation and unchecked share
  lineChart(document.getElementById("fig-loop"), {
    x: YEARS, endLabels: true, aria: "Automated share of AI research and unchecked share of training",
    series: [
      { name: "AI share of AI research", short: "Done by AI", color: "var(--s-1)", values: now.A },
      { name: "Share of AI work humans can review", short: "Humans can review", color: "var(--s-3)",
        values: now.A.map((a, i) => (a > 1e-9 ? 1 - now.U[i] / a : params.h0)) },
      { name: "Unchecked by any human", short: "Unchecked", color: "var(--s-2)", values: now.U },
    ],
  });
  const half = yearCross(now.A, 0.5);
  document.getElementById("read-loop").innerHTML = half
    ? `At these settings AI does half of AI research by <b>${half}</b>, and by 2045 <b>${pct(now.U[19])}</b> of the training process goes unchecked by humans.`
    : `At these settings AI never does half of AI research before 2045; <b>${pct(now.U[19])}</b> of the process goes unchecked by then.`;

  // 3. drift heatmap
  const sw = results.sweeps.ai_oversight_vs_speed;
  heatmap(document.getElementById("fig-heat"), {
    xs: sw.xs, ys: sw.ys, z: sw.z, xLabel: "Capability growth (generations per year)", yLabel: "AI-assisted correction",
    metricName: "of worlds drift", marker: { x: params.g, y: params.kappa_ai },
    aria: "Heatmap of drift probability over capability speed and AI-assisted correction",
  });
  const label = OUTCOMES.find((o) => o.id === classify(now.final)).label;
  document.getElementById("read-drift").innerHTML =
    `With every other parameter at its central value, your settings give value drift of <b>${now.D[19].toFixed(2)}</b> in 2045 (drifted means 0.30 or more). That world ends as <b>${label}</b>.`;

  // 4. concealment, local vs global
  const loc = run({ interp_regime: "local" }), glo = run({ interp_regime: "global" });
  const mTop = Math.min(1, Math.max(0.2, Math.ceil(Math.max(...loc.M, ...glo.M) * 1.25 * 10) / 10));
  lineChart(document.getElementById("fig-conceal"), {
    x: YEARS, endLabels: true, yMax: mTop, aria: "Concealment over time with local versus global interpretability",
    series: [
      { name: "Local probes suffice", short: "Local probes", color: "var(--s-1)", values: loc.M, muted: structure.interp_regime !== "local", width: structure.interp_regime === "local" ? 3 : 2 },
      { name: "Global understanding needed", short: "Global needed", color: "var(--s-2)", values: glo.M, muted: structure.interp_regime !== "global", width: structure.interp_regime === "global" ? 3 : 2 },
    ],
  });
  document.getElementById("read-conceal").innerHTML =
    `In 2045: concealment <b>${pct(loc.M[19])}</b> if local probes suffice, <b>${pct(glo.M[19])}</b> if global understanding is needed.`;

  // 5. values
  stackedArea(document.getElementById("fig-values"), {
    x: YEARS, aria: "Mix of value attractors over time",
    series: ATTR_ORDER.map((a) => ({ name: ATTR_NAME[a], short: ATTR_SHORT[a], color: `var(--a-${a})`, values: now[`w_${a}`] })),
  });
}

// ---------------------------------------------------------------- lab
function labWorlds() {
  const r = rng(1234);
  const sliderIds = new Set(sliderEls.keys());
  const worlds = [];
  for (let n = 0; n < N_LAB; n++) {
    const raw = {};
    for (const q of spec.parameters) {
      const u = r();
      raw[q.id] = sliderIds.has(q.id) ? params[q.id] : triangular(u, q.low, q.central, q.high);
    }
    worlds.push(simulate(resolve(raw, structure), 10));
  }
  return worlds;
}

function quantileSeries(worlds, key) {
  const qs = { q05: [], q25: [], q50: [], q75: [], q95: [] };
  for (let i = 0; i < YEARS.length; i++) {
    const v = worlds.map((w) => w[key][i]).sort((a, b) => a - b);
    const at = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
    qs.q05.push(at(0.05)); qs.q25.push(at(0.25)); qs.q50.push(at(0.5)); qs.q75.push(at(0.75)); qs.q95.push(at(0.95));
  }
  return qs;
}

function fanChart(el, q, color, name, yMax) {
  lineChart(el, {
    x: YEARS, yMax, aria: `${name} fan chart`, tipFmt: (v) => v.toFixed(2), yFmt: fix(1),
    bands: [{ lo: q.q05, hi: q.q95, color, opacity: 0.12 }, { lo: q.q25, hi: q.q75, color, opacity: 0.22 }],
    series: [
      { name: "95th percentile", color: "var(--muted)", values: q.q95, width: 1 },
      { name: "Median", color, values: q.q50 },
      { name: "5th percentile", color: "var(--muted)", values: q.q05, width: 1 },
    ],
  });
}

function renderLab() {
  const t0 = performance.now();
  const worlds = labWorlds();
  const shares = Object.fromEntries(OUTCOMES.map((o) => [o.id, 0]));
  for (const w of worlds) shares[classify(w.final)] += 1 / worlds.length;
  outcomeStack(document.getElementById("lab-stack"), shares, OUTCOMES, { compact: true });
  const qD = quantileSeries(worlds, "D"), qM = quantileSeries(worlds, "M");
  fanChart(document.getElementById("lab-drift"), qD, "var(--o-visible)", "Value drift", Math.max(0.6, Math.ceil(Math.max(...qD.q95) * 10) / 10));
  fanChart(document.getElementById("lab-conceal"), qM, "var(--o-concealed)", "Concealment", 1);
  const mean = (k) => YEARS.map((_, i) => worlds.reduce((s, w) => s + w[k][i], 0) / worlds.length);
  const series = ATTR_ORDER.map((a) => ({ name: ATTR_NAME[a], short: ATTR_SHORT[a], color: `var(--a-${a})`, values: mean(`w_${a}`) }));
  stackedArea(document.getElementById("lab-values"), { x: YEARS, series, aria: "Average value mix across your worlds" });
  const qU = quantileSeries(worlds, "U"), qG = quantileSeries(worlds, "G");
  dataTable(document.getElementById("lab-table"),
    ["Year", "Median drift", "Median concealment", "Median unchecked", "Median goal-directedness", ...ATTR_ORDER.map((a) => ATTR_SHORT[a])],
    [4, 9, 14, 19].map((i) => [YEARS[i], qD.q50[i].toFixed(2), pct(qM.q50[i]), pct(qU.q50[i]), qG.q50[i].toFixed(2),
      ...series.map((s) => pct(s.values[i]))]));
  document.getElementById("lab-status").textContent = `${N_LAB} worlds in ${Math.round(performance.now() - t0)} ms`;
}

// ---------------------------------------------------------------- hero
let hero = null;
function heroWorlds() {
  const r = rng(20261013);
  const keys = Object.keys(spec.structural);
  const worlds = [];
  for (let n = 0; n < 300; n++) {
    const s = {};
    for (const k of keys) { const opts = Object.keys(spec.structural[k].options); s[k] = opts[Math.floor(r() * opts.length)]; }
    const raw = {};
    for (const q of spec.parameters) raw[q.id] = triangular(r(), q.low, q.central, q.high);
    const out = simulate(resolve(raw, s), 10);
    worlds.push({ D: out.D, outcome: classify(out.final), final: out.final });
  }
  const order = ["aligned_human", "aligned_ai", "incoherent", "visible", "concealed"];
  worlds.sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome));
  return worlds;
}

function drawHero(progress = 1, highlight = null) {
  const canvas = document.getElementById("worlds-canvas");
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const yMax = 0.75, padT = 34, padB = 4;
  const X = (i) => (i / (YEARS.length - 1)) * W;
  const Y = (v) => padT + (1 - Math.min(v, yMax) / yMax) * (H - padT - padB);
  ctx.strokeStyle = cssVar("--grid"); ctx.lineWidth = 1;
  for (const v of [0.25, 0.5]) { ctx.beginPath(); ctx.moveTo(0, Math.round(Y(v)) + 0.5); ctx.lineTo(W, Math.round(Y(v)) + 0.5); ctx.stroke(); }
  ctx.strokeStyle = cssVar("--rule-strong");
  ctx.setLineDash([]);
  const thr = Math.round(Y(0.3)) + 0.5;
  ctx.beginPath(); ctx.moveTo(0, thr); ctx.lineTo(W, thr); ctx.stroke();
  ctx.fillStyle = cssVar("--muted"); ctx.font = `12px ${cssVar("--sans")}`;
  ctx.textAlign = "left";
  const note = "Drifted above this line";
  const tw = ctx.measureText(note).width;
  ctx.fillStyle = cssVar("--paper"); ctx.fillRect(0, thr - 20, tw + 10, 16);
  ctx.fillStyle = cssVar("--muted"); ctx.fillText(note, 0, thr - 7);
  const last = Math.max(1, Math.floor(progress * (YEARS.length - 1) * 10) / 10);
  const colors = Object.fromEntries(OUTCOMES.map((o) => [o.id, cssVar(`--o-${o.id}`)]));
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const w of hero) {
    ctx.strokeStyle = colors[w.outcome];
    ctx.globalAlpha = highlight ? (w === highlight ? 1 : 0.12) : 0.42;
    ctx.lineWidth = w === highlight ? 2.5 : 1.2;
    ctx.beginPath();
    for (let i = 0; i <= Math.ceil(last); i++) {
      const fi = Math.min(i, last);
      const lo = Math.floor(fi), f = fi - lo;
      const v = f > 0 ? w.D[lo] * (1 - f) + w.D[lo + 1] * f : w.D[lo];
      i === 0 ? ctx.moveTo(X(fi), Y(v)) : ctx.lineTo(X(fi), Y(v));
    }
    ctx.stroke();
  }
  if (highlight) {
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < YEARS.length; i++) i ? ctx.lineTo(X(i), Y(highlight.D[i])) : ctx.moveTo(X(i), Y(highlight.D[i]));
    ctx.strokeStyle = colors[highlight.outcome]; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function setupHero() {
  hero = heroWorlds();
  const canvas = document.getElementById("worlds-canvas");
  const wrap = document.getElementById("worlds");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) drawHero(1);
  else {
    const t0 = performance.now(), dur = 1800;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      drawHero(1 - (1 - p) ** 3);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const tip = document.createElement("div");
  tip.className = "tip";
  wrap.appendChild(tip);
  canvas.addEventListener("pointermove", (ev) => {
    const r = canvas.getBoundingClientRect();
    const i = Math.round(((ev.clientX - r.left) / r.width) * (YEARS.length - 1));
    const yv = (1 - (ev.clientY - r.top - 34) / (r.height - 38)) * 0.75;
    let best = null, bd = Infinity;
    for (const w of hero) { const d = Math.abs(w.D[i] - yv); if (d < bd) { bd = d; best = w; } }
    if (!best || bd > 0.06) { tip.classList.remove("on"); drawHero(1); return; }
    drawHero(1, best);
    const o = OUTCOMES.find((x) => x.id === best.outcome);
    tip.innerHTML = `<div class="t-head">One simulated world</div><div class="row"><i style="background:var(--o-${o.id});height:10px"></i><span>${o.label}</span><b></b></div>
      <div>Drift in 2045: <b>${best.final.D.toFixed(2)}</b></div><div>Concealment: <b>${pct(best.final.M)}</b></div><div>Goal-directedness: <b>${best.final.G.toFixed(2)}</b></div>`;
    tip.classList.add("on");
    const left = ev.clientX - r.left;
    tip.style.left = `${left + 16 + tip.offsetWidth > r.width ? left - tip.offsetWidth - 16 : left + 16}px`;
    tip.style.top = `${Math.max(0, ev.clientY - r.top - 20)}px`;
  });
  canvas.addEventListener("pointerleave", () => { tip.classList.remove("on"); drawHero(1); });
  let lastW = canvas.clientWidth;
  new ResizeObserver(() => { if (canvas.clientWidth !== lastW) { lastW = canvas.clientWidth; drawHero(1); } }).observe(canvas);
}

// ---------------------------------------------------------------- cruxes
function renderCruxes() {
  const name = (f) => FACTOR_SHORT[f] || byId[f].label;
  const rows = (out) => results.sobol.outputs[out].indices.slice(0, 10).map((r) => ({
    label: name(r.factor), value: Math.max(0, r.ST), lo: Math.max(0, r.ST_ci[0]), hi: r.ST_ci[1],
    tag: r.kind === "structural" ? "assumption" : null, alt: r.kind === "structural",
  }));
  rankBars(document.getElementById("crux-drift"), rows("drift"), { max: 0.6 });
  rankBars(document.getElementById("crux-conceal"), rows("concealed"), { max: 0.6 });
  document.getElementById("n-sobol").textContent = results.sobol.n_runs.toLocaleString("en-US");
}

// ---------------------------------------------------------------- scheduling
let pending = false, labTimer = null;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    renderChapters();
    writeHash();
    clearTimeout(labTimer);
    document.getElementById("lab-status").textContent = "Updating…";
    labTimer = setTimeout(renderLab, 140);
  });
}

function setupTheme() {
  const btn = document.getElementById("theme");
  const effective = () => document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const label = () => { btn.textContent = effective() === "dark" ? "Light" : "Dark"; };
  label();
  btn.addEventListener("click", () => {
    const next = effective() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("aifm-theme", next); } catch (e) { /* storage unavailable */ }
    label();
    drawHero(1);
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { label(); drawHero(1); });
}

async function main() {
  [spec, results] = await Promise.all([
    fetch("data/parameters.json").then((r) => r.json()),
    fetch("data/results.json").then((r) => r.json()),
  ]);
  byId = Object.fromEntries(spec.parameters.map((p) => [p.id, p]));
  OUTCOMES = results.meta.outcomes;
  params = central(spec);
  structure = defaultStructure(spec);
  readHash();

  document.getElementById("n-worlds").textContent = results.mixture.n.toLocaleString("en-US");
  document.getElementById("n-lab").textContent = N_LAB;
  outcomeStack(document.getElementById("hero-stack"), results.mixture.outcomes, OUTCOMES);
  heatLegend(document.getElementById("heat-legend"), "Share of worlds that drift");
  const legend = ATTR_ORDER.map((a) => `<span><i class="sw" style="background:var(--a-${a})"></i>${ATTR_NAME[a]}</span>`).join("");
  document.getElementById("values-legend").innerHTML = legend;
  document.getElementById("lab-values-legend").innerHTML = legend;

  document.querySelectorAll("[data-slider]").forEach(buildSlider);
  document.querySelectorAll("[data-structure]").forEach(buildSeg);
  document.getElementById("reset").addEventListener("click", () => {
    params = central(spec);
    structure = defaultStructure(spec);
    for (const id of sliderEls.keys()) syncSlider(id);
    for (const k of segEls.keys()) syncSeg(k);
    schedule();
  });

  setupTheme();
  setupHero();
  renderCruxes();
  renderChapters();
  renderLab();
}

main().catch((e) => {
  console.error(e);
  const h = document.querySelector(".hero-caption");
  if (h) h.textContent = "The model data didn't load. If you opened this file directly from disk, serve the docs folder over HTTP instead (for example: python -m http.server -d docs).";
});
