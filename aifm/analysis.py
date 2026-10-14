"""Monte Carlo, structural comparison, global sensitivity and threshold sweeps.

Run:  python -m aifm.analysis            (writes docs/data/results.json)
      python -m aifm.analysis --quick    (smaller samples, for CI)
"""
from __future__ import annotations

import argparse
import itertools
import json
import time
from pathlib import Path

import numpy as np
from scipy.stats import qmc

from .model import simulate, ATTRACTORS, SERIES, time_grid
from .outcomes import (OUTCOMES, OUTCOME_IDS, classify, shares, D_DRIFT,
                       U_STEWARD, G_COHERENT, M_CONCEAL)
from . import params as P

ROOT = Path(__file__).resolve().parent.parent
STRUCT_KEYS = list(P.STRUCTURAL.keys())
STRUCT_OPTS = {k: list(v["options"].keys()) for k, v in P.STRUCTURAL.items()}
ALL_STRUCTURES = [dict(zip(STRUCT_KEYS, combo))
                  for combo in itertools.product(*[STRUCT_OPTS[k] for k in STRUCT_KEYS])]
YEARS = np.arange(2026, 2046)
QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95]


def structure_key(s):
    return "|".join(s[k] for k in STRUCT_KEYS)


def run_mixed(raw, struct_idx, record=False):
    """Run samples whose structural assumptions differ per sample.

    struct_idx: dict key -> int array (n,) of option indices.
    Returns the same dict layout as simulate(), reassembled in sample order.
    """
    n = raw["g"].shape[0]
    combos = np.stack([struct_idx[k] for k in STRUCT_KEYS], axis=1)
    finals = None
    series = None
    for combo in np.unique(combos, axis=0):
        mask = np.all(combos == combo, axis=1)
        s = {k: STRUCT_OPTS[k][combo[i]] for i, k in enumerate(STRUCT_KEYS)}
        sub = {k: v[mask] for k, v in raw.items()}
        out = simulate(P.resolve(sub, s), record=record)
        if finals is None:
            finals = {k: np.empty((n,) + v.shape[1:]) for k, v in out["final"].items()}
            if record:
                series = {k: np.empty((n, out[k].shape[1])) for k in SERIES}
        for k, v in out["final"].items():
            finals[k][mask] = v
        if record:
            for k in SERIES:
                series[k][mask] = out[k]
    res = {"final": finals}
    if record:
        res.update(series)
    return res


def yearly(series_arr):
    ts = time_grid()
    idx = [int(round((y - ts[0]) / (ts[1] - ts[0]))) for y in YEARS]
    return series_arr[:, idx]


def fan(arr):
    q = np.quantile(arr, QUANTILES, axis=0)
    return {f"q{int(100 * p):02d}": np.round(row, 4).tolist() for p, row in zip(QUANTILES, q)}


# --------------------------------------------------------------------------
# 1. Monte Carlo by structure, plus the equal-weight mixture
# --------------------------------------------------------------------------
def monte_carlo(n_per, rng):
    by_structure = {}
    pooled = {k: [] for k in SERIES}
    pooled_labels = []
    for s in ALL_STRUCTURES:
        raw = P.sample(n_per, rng)
        out = simulate(P.resolve(raw, s), record=True)
        labels = classify(out["final"])
        f = out["final"]
        by_structure[structure_key(s)] = {
            "structure": s,
            "outcomes": shares(labels),
            "final": {k: {f"q{int(100 * p):02d}": float(np.quantile(f[k], p)) for p in QUANTILES}
                      for k in ["D", "M", "G", "U", "HD", "C"]},
            "dominant_values": {a: float(np.mean(np.argmax(f["w"], axis=1) == i))
                                for i, a in enumerate(ATTRACTORS)},
            "mean_values_2045": {a: float(np.mean(f["w"][:, i])) for i, a in enumerate(ATTRACTORS)},
        }
        for k in SERIES:
            pooled[k].append(yearly(out[k]))
        pooled_labels.append(labels)
    pooled = {k: np.concatenate(v) for k, v in pooled.items()}
    labels = np.concatenate(pooled_labels)
    mixture = {
        "n": int(labels.size),
        "outcomes": shares(labels),
        "fans": {k: fan(pooled[k]) for k in SERIES},
    }
    # Marginal outcome shares for each option of each structural switch.
    marginals = {}
    for key in STRUCT_KEYS:
        marginals[key] = {}
        for opt in STRUCT_OPTS[key]:
            rows = [v["outcomes"] for v in by_structure.values() if v["structure"][key] == opt]
            marginals[key][opt] = {o: float(np.mean([r[o] for r in rows])) for o in OUTCOME_IDS}
    return by_structure, mixture, marginals


# --------------------------------------------------------------------------
# 2. Global sensitivity: Sobol indices over parameters AND structural switches
# --------------------------------------------------------------------------
def sobol(n_base, rng, n_boot=200):
    ids = list(P.IDS)
    factors = ids + STRUCT_KEYS
    k = len(factors)
    sampler = qmc.Sobol(d=2 * k, scramble=True, seed=rng)
    base = sampler.random(n_base)
    A, B = base[:, :k], base[:, k:]

    def evaluate(X):
        raw = P.from_unit(X[:, :len(ids)], ids)
        sidx = {key: np.minimum((X[:, len(ids) + j] * len(STRUCT_OPTS[key])).astype(int),
                                len(STRUCT_OPTS[key]) - 1)
                for j, key in enumerate(STRUCT_KEYS)}
        f = run_mixed(raw, sidx)["final"]
        labels = classify(f)
        return {
            "D": f["D"],
            "M": f["M"],
            "HD": f["HD"],
            "drift": (f["D"] >= D_DRIFT).astype(float),
            "concealed": (labels == "concealed").astype(float),
        }

    fA, fB = evaluate(A), evaluate(B)
    fAB = []
    for i in range(k):
        X = A.copy()
        X[:, i] = B[:, i]
        fAB.append(evaluate(X))

    results = {}
    for out in fA:
        a, b = fA[out], fB[out]
        var = np.var(np.concatenate([a, b]))
        rows = []
        for i, name in enumerate(factors):
            ab = fAB[i][out]
            s1 = np.mean(b * (ab - a)) / var if var > 0 else 0.0           # Saltelli 2010
            st = 0.5 * np.mean((a - ab) ** 2) / var if var > 0 else 0.0     # Jansen 1999
            boot_st, boot_s1 = [], []
            for _ in range(n_boot):
                j = rng.integers(0, n_base, n_base)
                v = np.var(np.concatenate([a[j], b[j]]))
                if v > 0:
                    boot_s1.append(np.mean(b[j] * (ab[j] - a[j])) / v)
                    boot_st.append(0.5 * np.mean((a[j] - ab[j]) ** 2) / v)
            rows.append({
                "factor": name,
                "kind": "structural" if name in STRUCT_KEYS else "parameter",
                "S1": float(s1), "ST": float(st),
                "S1_ci": [float(np.quantile(boot_s1, 0.025)), float(np.quantile(boot_s1, 0.975))] if boot_s1 else [0, 0],
                "ST_ci": [float(np.quantile(boot_st, 0.025)), float(np.quantile(boot_st, 0.975))] if boot_st else [0, 0],
            })
        rows.sort(key=lambda r: -r["ST"])
        results[out] = {"variance": float(var), "mean": float(np.mean(np.concatenate([a, b]))),
                        "indices": rows}
    return {"n_base": n_base, "n_runs": int(n_base * (k + 2)), "factors": factors,
            "outputs": results}


# --------------------------------------------------------------------------
# 3. Threshold sweeps: probability surfaces over two levers
# --------------------------------------------------------------------------
def sweep(xk, yk, n_grid, n_per, rng, structure, metric):
    xs = np.linspace(*P.bounds(xk), n_grid)
    ys = np.linspace(*P.bounds(yk), n_grid)
    grid = np.zeros((n_grid, n_grid))
    for iy, yv in enumerate(ys):
        raw = P.sample(n_per * n_grid, rng)
        raw[xk] = np.repeat(xs, n_per)
        raw[yk] = np.full(n_per * n_grid, yv)
        f = simulate(P.resolve(raw, structure), record=False)["final"]
        labels = classify(f)
        if metric == "drift":
            hit = f["D"] >= D_DRIFT
        else:
            hit = labels == "concealed"
        grid[iy] = hit.reshape(n_grid, n_per).mean(axis=1)
    return {"x": xk, "y": yk, "xs": np.round(xs, 4).tolist(), "ys": np.round(ys, 4).tolist(),
            "z": np.round(grid, 4).tolist(), "metric": metric, "structure": structure,
            "n_per_cell": n_per}


def central_runs():
    out = {}
    for s in ALL_STRUCTURES:
        r = simulate(P.resolve(P.central(1), s), record=True)
        out[structure_key(s)] = {k: np.round(yearly(r[k])[0], 4).tolist() for k in SERIES}
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--seed", type=int, default=20261013)
    ap.add_argument("--out", default=str(ROOT / "docs" / "data" / "results.json"))
    a = ap.parse_args(argv)
    rng = np.random.default_rng(a.seed)
    n_mc, n_sobol, grid, per = (300, 128, 8, 40) if a.quick else (3000, 2048, 21, 300)

    t = time.time()
    by_structure, mixture, marginals = monte_carlo(n_mc, rng)
    print(f"monte carlo: {time.time() - t:.1f}s")
    t = time.time()
    sens = sobol(n_sobol, rng)
    print(f"sobol ({sens['n_runs']} runs): {time.time() - t:.1f}s")
    t = time.time()
    emergent_local = {"goal_model": "emergent", "interp_regime": "local", "metaethics": "antirealist"}
    emergent_global = {"goal_model": "emergent", "interp_regime": "global", "metaethics": "antirealist"}
    sweeps = {
        "oversight_vs_speed": sweep("g", "kappa_h", grid, per, rng, emergent_local, "drift"),
        "ai_oversight_vs_speed": sweep("g", "kappa_ai", grid, per, rng, emergent_local, "drift"),
        "voice_vs_seeming": sweep("voice", "r_seem", grid, per, rng, emergent_global, "concealed"),
    }
    print(f"sweeps: {time.time() - t:.1f}s")

    result = {
        "meta": {
            "version": __import__("aifm").__version__,
            "seed": a.seed, "quick": a.quick, "years": YEARS.tolist(),
            "n_per_structure": n_mc, "n_structures": len(ALL_STRUCTURES),
            "thresholds": {"D_drift": D_DRIFT, "U_steward": U_STEWARD,
                           "G_coherent": G_COHERENT, "M_conceal": M_CONCEAL},
            "outcomes": OUTCOMES, "attractors": ATTRACTORS,
        },
        "mixture": mixture,
        "by_structure": by_structure,
        "marginals": marginals,
        "sobol": sens,
        "sweeps": sweeps,
        "central": central_runs(),
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    # The site reads the parameter spec and references from docs/data too.
    for name in ["parameters.json", "references.json"]:
        (Path(a.out).parent / name).write_text((P.DATA / name).read_text())
    with open(a.out, "w") as f:
        json.dump(result, f, separators=(",", ":"))
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
