// AI Futures Model: JavaScript port of aifm/model.py and aifm/params.py.
// Same arithmetic, same order. tests/test_parity.py checks agreement to 1e-9.
// Runs one world per call (the Python version is vectorised over many).

export const T0 = 2026, T1 = 2045, DT = 0.1;
export const ATTRACTORS = ["inherit", "generalize", "instrumental", "epistemic", "incoherent"];
const N_ATTR = 5;
const INTENDED = [0.80, 0.10, 0.00, 0.10, 0.00];
const RACE_CAP = 0.5, RACE_DILUTE = 1.0, RACE_KAPPA = 0.5, RACE_SEEM = 1.0;
const W_AUTO = 1.5, W_SA = 1.0, TAU_M = 1.0, BURN_IN_STEPS = 200;

export const SERIES = ["C", "A", "U", "O", "G", "SA", "I", "M", "Det", "D", "K", "HD",
  "w_inherit", "w_generalize", "w_instrumental", "w_epistemic", "w_incoherent"];

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function nSteps() { return Math.round((T1 - T0) / DT); }

function derived(p, t, C, G, M, Itech, w) {
  const R = p.race;
  const O = p.O_inf - (p.O_inf - p.O0) * Math.exp(-p.r_O * (t - T0));
  const A = sigmoid((C - p.c_auto) / W_AUTO);
  const h = p.h0 * Math.exp(-p.delta * (1 + RACE_DILUTE * R) * C);
  const U = A * (1 - h);
  const SA = sigmoid((C - p.c_sa) / W_SA);
  const I = Itech * Math.exp(-p.chi * C) * (1 - p.collusion * M * A);
  const Det = 1 - M * (1 - I);
  const compat = [1, p.gamma_gen, 0, p.gamma_epi, 0.3];
  let s = 0;
  for (let i = 0; i < N_ATTR; i++) s += compat[i] * w[i];
  const D = 1 - s;
  const benefit = p.beta * G * SA * (D + p.p_pat * (1 - D)) * (1 - I) * (1 - p.voice)
    + p.r_seem * (1 + RACE_SEEM * R) * O;
  const cost = p.honesty * (1 - D) + p.c_caught * I;
  const M_star = sigmoid(p.k_m * (benefit - cost));
  const dC = p.g * (1 + RACE_CAP * R) * (1 + p.a_rd * A) / (1 + C / p.C_sat);
  const K = p.kappa_h * (1 - RACE_KAPPA * R) * (1 - U) * Det + p.kappa_ai * U * Det * (1 - D);
  return { O, A, h, U, SA, I, Det, D, M_star, dC, K };
}

function fitness(p, d, G) {
  const f = [
    p.a_inh * (1 - d.U) * d.Det + p.a_pre * (1 - p.psi * d.A),
    p.a_gen * d.SA,
    p.a_ins * d.O * G,
    p.a_epi * d.A,
    p.a_inc * (1 - G),
  ];
  for (let i = 0; i < N_ATTR; i++) f[i] = f[i] + p.r_real_vec[i] * d.SA;
  return f;
}

function valueStep(p, d, G, w) {
  const f = fitness(p, d, G);
  let fbar = 0;
  for (let i = 0; i < N_ATTR; i++) fbar += w[i] * f[i];
  const mu = p.mu0 + p.mu_U * d.U;
  const nw = new Array(N_ATTR);
  let tot = 0;
  for (let i = 0; i < N_ATTR; i++) {
    const sel = w[i] * (f[i] - fbar);
    const mut = mu * (1 / N_ATTR - w[i]);
    const corr = d.K * (INTENDED[i] - w[i]);
    const dw = d.dC * (sel + mut) + corr;
    nw[i] = Math.max(w[i] + DT * dw, 0);
    tot += nw[i];
  }
  for (let i = 0; i < N_ATTR; i++) nw[i] = nw[i] / tot;
  return nw;
}

function initialValues(p, G, M, Itech) {
  let w = new Array(N_ATTR).fill(1 / N_ATTR);
  for (let k = 0; k < BURN_IN_STEPS; k++) {
    const d = derived(p, T0, 0, G, M, Itech, w);
    w = valueStep(p, d, G, w);
  }
  return w;
}

// Run one world. p: resolved parameters (see resolve). every: record every
// k-th step (10 = yearly). Returns {t:[], <series>:[], final:{}}.
export function simulate(p, every = 1) {
  const n = nSteps();
  let C = 0, G = p.G0, M = 0, Itech = p.I0;
  let w = initialValues(p, G, M, Itech);
  const out = { t: [] };
  for (const k of SERIES) out[k] = [];
  let final = null;
  for (let j = 0; j <= n; j++) {
    const t = T0 + DT * j;
    const d = derived(p, t, C, G, M, Itech, w);
    if (j % every === 0) {
      out.t.push(t);
      out.C.push(C); out.A.push(d.A); out.U.push(d.U); out.O.push(d.O); out.G.push(G);
      out.SA.push(d.SA); out.I.push(d.I); out.M.push(M); out.Det.push(d.Det);
      out.D.push(d.D); out.K.push(d.K); out.HD.push(d.D * M);
      for (let i = 0; i < N_ATTR; i++) out["w_" + ATTRACTORS[i]].push(w[i]);
    }
    if (j === n) {
      final = { C, A: d.A, U: d.U, G, SA: d.SA, I: d.I, M, D: d.D, Det: d.Det, HD: d.D * M, w: w.slice() };
      break;
    }
    const dG = p.kG * d.O * d.dC * (1 - G);
    const dM = (d.M_star - M) / TAU_M;
    const dI = p.r_I * (1 + p.a_I * d.A) * (p.I_max - Itech);
    w = valueStep(p, d, G, w);
    C = C + DT * d.dC;
    G = G + DT * dG;
    M = M + DT * dM;
    Itech = Itech + DT * dI;
  }
  out.final = final;
  return out;
}

// ---- parameters -----------------------------------------------------------

export function central(spec) {
  const p = {};
  for (const q of spec.parameters) p[q.id] = q.central;
  return p;
}

export function defaultStructure(spec) {
  const s = {};
  for (const [k, v] of Object.entries(spec.structural)) s[k] = v.default;
  return s;
}

export function resolve(raw, structure) {
  const p = { ...raw };
  if (structure.goal_model === "habits") p.kG = 0;
  else if (structure.goal_model === "already") p.G0 = p.G0_already;
  if (structure.interp_regime === "local") p.chi = 0;
  p.r_real_vec = [0, 0, 0, 0, 0];
  if (structure.metaethics !== "antirealist") {
    const target = structure.metaethics.split("_").slice(1).join("_");
    p.r_real_vec[ATTRACTORS.indexOf(target)] = p.r_real;
  }
  return p;
}

export function triangular(u, low, mode, high) {
  const span = high - low;
  if (span <= 0) return mode;
  const fc = (mode - low) / span;
  return u < fc ? low + Math.sqrt(u * span * (mode - low))
    : high - Math.sqrt((1 - u) * span * (high - mode));
}

// Small seedable PRNG (mulberry32) so the lab's uncertainty bands are stable.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- outcomes (aifm/outcomes.py) -------------------------------------------
export const THRESHOLDS = { D_drift: 0.30, U_steward: 0.5, G_coherent: 0.4, M_conceal: 0.5 };

export function classify(f, th = THRESHOLDS) {
  if (f.D < th.D_drift) return f.U < th.U_steward ? "aligned_human" : "aligned_ai";
  if (f.G < th.G_coherent) return "incoherent";
  return f.M < th.M_conceal ? "visible" : "concealed";
}
