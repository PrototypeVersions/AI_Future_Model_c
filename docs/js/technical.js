import { heatmap, heatLegend, rankBars, dataTable, pct, fix } from "./charts.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function tex(src, display) {
  if (window.katex) {
    try { return window.katex.renderToString(src, { displayMode: display, throwOnError: false }); } catch (e) { /* fall through */ }
  }
  return display ? `<pre><code>${esc(src)}</code></pre>` : `<code>${esc(src)}</code>`;
}

// ---- a small Markdown renderer for the subset MODEL.md uses ----------------
function inline(s) {
  const math = [];
  s = s.replace(/\$([^$\n]+?)\$/g, (_, m) => { math.push(m); return `\u0000${math.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tex(math[+i], false));
}

function renderMarkdown(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim().startsWith("$$")) {
      let buf = line.trim().slice(2);
      if (buf.endsWith("$$")) { out.push(tex(buf.slice(0, -2), true)); i++; continue; }
      i++;
      while (i < lines.length && !lines[i].trim().endsWith("$$")) buf += "\n" + lines[i++];
      buf += "\n" + (lines[i] || "").trim().slice(0, -2);
      out.push(tex(buf, true)); i++; continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length, text = inline(h[2]);
      out.push(`<h${lvl} id="${slug(h[2])}">${text}</h${lvl}>`); i++; continue;
    }
    if (/^---+$/.test(line.trim())) { out.push("<hr>"); i++; continue; }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<div class="tbl-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`); continue;
    }
    if (/^(\*|-|\d+\.)\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^(\*|-|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^(\*|-|\d+\.)\s+/, ""));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||>|\$\$|(\*|-|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

// ---- page -----------------------------------------------------------------
let spec, results, refs, refIndex, OUTCOMES;
const FACTOR_SHORT = {
  goal_model: "Do AI systems have goals?", interp_regime: "Local or global interpretability?", metaethics: "Is there a moral truth?",
};
const OUTPUT_NAMES = {
  drift: "Whether values drift (D ≥ 0.30)", concealed: "Whether the outcome is concealed misalignment",
  D: "Value drift D in 2045", M: "Concealment M in 2045", HD: "Hidden drift D × M in 2045",
};

function paramTable() {
  const byMod = {};
  for (const p of spec.parameters) (byMod[p.module] ||= []).push(p);
  const fmt = (p, v) => (p.unit === "share" || p.unit === "probability" ? pct(v) : (+v.toFixed(3)).toString());
  let html = `<thead><tr><th>Parameter</th><th class="num">Central</th><th class="num">Range</th><th>Evidence</th><th>Reasoning</th></tr></thead><tbody>`;
  for (const [mod, title] of Object.entries(spec.modules)) {
    if (!byMod[mod]) continue;
    html += `<tr><th colspan="5" style="padding-top:22px;font-size:15px">${title}</th></tr>`;
    for (const p of byMod[mod]) {
      const r = (p.refs || []).map((k) => `<a href="#ref-${k}">[${refIndex[k]}]</a>`).join(" ");
      html += `<tr id="p-${p.id}">
        <td style="min-width:180px"><div style="color:var(--ink);font-weight:600">${p.label}</div>
          <div>${tex(p.symbol, false)} <code style="font-size:12px">${p.id}</code></div>
          ${p.structural ? `<div style="font-size:12px">Active only under the "${p.structural}" assumption</div>` : ""}</td>
        <td class="num">${fmt(p, p.central)}</td>
        <td class="num">${fmt(p, p.low)} to ${fmt(p, p.high)}<div style="font-size:12px">${p.unit}</div></td>
        <td><span class="ev">${p.evidence}</span></td>
        <td style="min-width:260px;line-height:1.45">${esc(p.why)} ${r}</td></tr>`;
    }
  }
  document.getElementById("param-table").innerHTML = html + "</tbody>";
}

function structLabel(s) {
  return Object.entries(s).map(([k, v]) => spec.structural[k].options[v].label).join(" / ");
}

function matrix() {
  const rows = Object.values(results.by_structure).map((r) => ({ ...r, aligned: r.outcomes.aligned_human + r.outcomes.aligned_ai }));
  rows.sort((a, b) => b.aligned - a.aligned);
  document.getElementById("matrix-legend").innerHTML = OUTCOMES.map((o) =>
    `<span><i class="sw" style="background:var(--o-${o.id})"></i>${o.label}</span>`).join("");
  document.getElementById("matrix").innerHTML = rows.map((r) => `<div class="matrix-row">
      <div class="name">${structLabel(r.structure)}</div>
      <div class="bar" role="img" aria-label="${OUTCOMES.map((o) => `${o.label} ${pct(r.outcomes[o.id])}`).join(", ")}">${
        OUTCOMES.filter((o) => r.outcomes[o.id] > 0.001).map((o) =>
          `<span title="${o.label}: ${pct(r.outcomes[o.id], 1)}" style="flex:${r.outcomes[o.id]} 1 0;background:var(--o-${o.id})"></span>`).join("")}</div>
    </div>`).join("");
  dataTable(document.getElementById("matrix-table"), ["Assumptions", ...OUTCOMES.map((o) => o.label), "Median drift", "Median concealment"],
    rows.map((r) => [structLabel(r.structure), ...OUTCOMES.map((o) => pct(r.outcomes[o.id], 1)), r.final.D.q50.toFixed(2), pct(r.final.M.q50)]));
}

function sobol() {
  const s = results.sobol;
  document.getElementById("sobol-intro").innerHTML =
    `Sobol indices from ${s.n_runs.toLocaleString("en-US")} runs (base sample ${s.n_base.toLocaleString("en-US")}). All ${s.factors.length - 3} parameters were drawn uniformly on their ranges, and the three structural forks were included as discrete factors with equal weight per option. The bars show the total-order index <i>S<sub>T</sub></i>: the share of output variance that would vanish if the factor were known, including its interactions. Whiskers are 95% bootstrap intervals. The table also gives first-order indices <i>S</i><sub>1</sub>, the effect of the factor alone.`;
  const pick = document.getElementById("sobol-pick");
  const outs = ["drift", "concealed", "D", "M", "HD"];
  pick.innerHTML = outs.map((o, i) => `<button type="button" data-o="${o}" aria-pressed="${i === 0}">${OUTPUT_NAMES[o].replace(/ in 2045| \(D ≥ 0\.30\)/, "")}</button>`).join("");
  const show = (o) => {
    pick.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.o === o));
    const r = s.outputs[o];
    document.getElementById("sobol-sub").textContent = `${OUTPUT_NAMES[o]}. Mean across runs ${r.mean.toFixed(3)}. Top 15 factors.`;
    const name = (f) => FACTOR_SHORT[f] || spec.parameters.find((p) => p.id === f).label;
    rankBars(document.getElementById("sobol-bars"), r.indices.slice(0, 15).map((x) => ({
      label: name(x.factor), value: Math.max(0, x.ST), lo: Math.max(0, x.ST_ci[0]), hi: x.ST_ci[1],
      tag: x.kind === "structural" ? "assumption" : null, alt: x.kind === "structural",
    })), { max: Math.max(0.6, r.indices[0].ST_ci[1]) });
    dataTable(document.getElementById("sobol-table"), ["Factor", "S_T", "S_T 95% interval", "S_1", "S_1 95% interval"],
      r.indices.map((x) => [name(x.factor), x.ST.toFixed(3), `${x.ST_ci[0].toFixed(2)} to ${x.ST_ci[1].toFixed(2)}`,
        x.S1.toFixed(3), `${x.S1_ci[0].toFixed(2)} to ${x.S1_ci[1].toFixed(2)}`]));
  };
  pick.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => show(b.dataset.o)));
  show("drift");
}

function sweeps() {
  const SHORT = { g: "Capability growth", kappa_h: "Human correction", kappa_ai: "AI-assisted correction",
    voice: "Legitimate voice", r_seem: "Reward for seeming aligned" };
  const lbl = (id) => SHORT[id] || spec.parameters.find((p) => p.id === id).label;
  const items = [["sw-1", "oversight_vs_speed", "of worlds drift"], ["sw-2", "ai_oversight_vs_speed", "of worlds drift"],
    ["sw-3", "voice_vs_seeming", "end concealed"]];
  for (const [el, key, metric] of items) {
    const s = results.sweeps[key];
    heatmap(document.getElementById(el), {
      xs: s.xs, ys: s.ys, z: s.z, xLabel: lbl(s.x), yLabel: lbl(s.y), metricName: metric,
      xFmt: s.x === "voice" ? (v) => pct(v) : fix(2), aria: `${lbl(s.x)} by ${lbl(s.y)}`,
    });
  }
  heatLegend(document.getElementById("sweep-legend"), "Share of worlds");
}

function references() {
  document.getElementById("ref-list").innerHTML = Object.entries(refs).map(([k, r]) =>
    `<li id="ref-${k}" style="margin-bottom:8px">${esc(r.cite)} <a href="${r.url}">${esc(r.url.replace(/^https?:\/\//, ""))}</a></li>`).join("");
}

function toc() {
  const items = [...document.querySelectorAll("#spec h2")].map((h) => `<a href="#${h.id}">${h.textContent}</a>`);
  items.push('<a href="#parameters">Parameters</a>', '<a href="#by-structure">Outcomes by assumption</a>',
    '<a href="#sensitivity">Global sensitivity</a>', '<a href="#sweeps">Threshold sweeps</a>', '<a href="#references">References</a>');
  document.getElementById("toc").innerHTML = items.join("");
}

function setupTheme() {
  const btn = document.getElementById("theme");
  const effective = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const label = () => { btn.textContent = effective() === "dark" ? "Light" : "Dark"; };
  label();
  btn.addEventListener("click", () => {
    const next = effective() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("aifm-theme", next); } catch (e) { /* storage unavailable */ }
    label();
  });
}

async function main() {
  setupTheme();
  let md;
  [spec, results, refs, md] = await Promise.all([
    fetch("data/parameters.json").then((r) => r.json()),
    fetch("data/results.json").then((r) => r.json()),
    fetch("data/references.json").then((r) => r.json()),
    fetch("MODEL.md").then((r) => r.text()),
  ]);
  OUTCOMES = results.meta.outcomes;
  refIndex = Object.fromEntries(Object.keys(refs).map((k, i) => [k, i + 1]));
  document.getElementById("spec").innerHTML = renderMarkdown(md);
  document.getElementById("results-intro").textContent =
    `${results.meta.n_structures} structural combinations × ${results.meta.n_per_structure.toLocaleString("en-US")} worlds each (seed ${results.meta.seed}). Regenerate with python -m aifm.analysis.`;
  paramTable();
  matrix();
  sobol();
  sweeps();
  references();
  toc();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

main().catch((e) => {
  console.error(e);
  document.getElementById("spec").innerHTML = `<p>The specification didn't load. If you opened this file directly from disk, serve the docs folder over HTTP instead (for example: <code>python -m http.server -d docs</code>).</p>`;
});
