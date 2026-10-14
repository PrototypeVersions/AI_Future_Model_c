"""Core dynamics of the AI Futures Model.

The simulator is vectorised: every parameter is a NumPy array of shape (n,),
so one call runs n independent worlds. The JavaScript port in
docs/js/model.js implements exactly the same arithmetic in the same order;
tests/test_parity.py checks the two agree to 1e-9.

Equations are documented in docs/MODEL.md. Section numbers in comments refer
to that file.
"""
from __future__ import annotations

import numpy as np

T0 = 2026.0
T1 = 2045.0
DT = 0.1

# Value attractors (module 5). Order matters everywhere.
ATTRACTORS = ["inherit", "generalize", "instrumental", "epistemic", "incoherent"]
N_ATTR = len(ATTRACTORS)

# The intended value profile that oversight pushes back toward (section 3.3).
INTENDED = np.array([0.80, 0.10, 0.00, 0.10, 0.00])

# Fixed couplings of race pressure R (section 6). Kept fixed, not sampled,
# so that R itself is the single crux the sensitivity analysis sees.
RACE_CAP = 0.5      # capability growth multiplier: (1 + RACE_CAP * R)
RACE_DILUTE = 1.0   # oversight dilution multiplier: (1 + RACE_DILUTE * R)
RACE_KAPPA = 0.5    # human correction multiplier: (1 - RACE_KAPPA * R)
RACE_SEEM = 1.0     # appear-aligned pressure multiplier: (1 + RACE_SEEM * R)

W_AUTO = 1.5        # width of the R&D automation logistic (generations)
W_SA = 1.0          # width of the situational-awareness logistic
TAU_M = 1.0         # years for concealment prevalence to relax to its target

SERIES = [
    "C", "A", "U", "O", "G", "SA", "I", "M", "Det", "D", "K", "HD",
    "w_inherit", "w_generalize", "w_instrumental", "w_epistemic", "w_incoherent",
]


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def time_grid():
    n_steps = int(round((T1 - T0) / DT))
    return T0 + DT * np.arange(n_steps + 1)


def _derived(p, t, C, G, M, I_tech, w):
    """Algebraic quantities at one instant (sections 1-5)."""
    R = p["race"]
    O = p["O_inf"] - (p["O_inf"] - p["O0"]) * np.exp(-p["r_O"] * (t - T0))
    A = sigmoid((C - p["c_auto"]) / W_AUTO)
    h = p["h0"] * np.exp(-p["delta"] * (1.0 + RACE_DILUTE * R) * C)
    U = A * (1.0 - h)
    SA = sigmoid((C - p["c_sa"]) / W_SA)
    I = I_tech * np.exp(-p["chi"] * C) * (1.0 - p["collusion"] * M * A)
    Det = 1.0 - M * (1.0 - I)
    compat = np.stack([
        np.ones_like(C), p["gamma_gen"], np.zeros_like(C), p["gamma_epi"],
        np.full_like(C, 0.3),
    ], axis=1)
    D = 1.0 - np.sum(compat * w, axis=1)
    benefit = (p["beta"] * G * SA * (D + p["p_pat"] * (1.0 - D))
               * (1.0 - I) * (1.0 - p["voice"])
               + p["r_seem"] * (1.0 + RACE_SEEM * R) * O)
    cost = p["honesty"] * (1.0 - D) + p["c_caught"] * I
    M_star = sigmoid(p["k_m"] * (benefit - cost))
    dC = (p["g"] * (1.0 + RACE_CAP * R) * (1.0 + p["a_rd"] * A)
          / (1.0 + C / p["C_sat"]))
    K = (p["kappa_h"] * (1.0 - RACE_KAPPA * R) * (1.0 - U) * Det
         + p["kappa_ai"] * U * Det * (1.0 - D))
    return dict(O=O, A=A, h=h, U=U, SA=SA, I=I, Det=Det, D=D,
                M_star=M_star, dC=dC, K=K)


def _fitness(p, d, G):
    f = np.stack([
        p["a_inh"] * (1.0 - d["U"]) * d["Det"] + p["a_pre"] * (1.0 - p["psi"] * d["A"]),
        p["a_gen"] * d["SA"],
        p["a_ins"] * d["O"] * G,
        p["a_epi"] * d["A"],
        p["a_inc"] * (1.0 - G),
    ], axis=1)
    # Realist reflective pull toward one attractor (section 5.2); zero under
    # antirealism because r_real_vec is all zeros then.
    f = f + p["r_real_vec"] * d["SA"][:, None]
    return f


def _value_step(p, d, G, w):
    f = _fitness(p, d, G)
    fbar = np.sum(w * f, axis=1)
    mu = p["mu0"] + p["mu_U"] * d["U"]
    sel = w * (f - fbar[:, None])
    mut = mu[:, None] * (1.0 / N_ATTR - w)
    corr = d["K"][:, None] * (INTENDED[None, :] - w)
    dw = d["dC"][:, None] * (sel + mut) + corr
    w = np.clip(w + DT * dw, 0.0, None)
    return w / np.sum(w, axis=1, keepdims=True)


BURN_IN_STEPS = 200  # 20 model-years with 2026 conditions frozen


def initial_values(p, G, M, I_tech):
    """2026 value profile: the quasi-equilibrium of 2026 pressures (section 5.1).

    Starting from a uniform profile, the value dynamics are iterated with
    capability, goal-directedness, concealment and detection frozen at their
    2026 levels. Today's systems are thus assumed to sit roughly where today's
    training and oversight hold them, rather than at an arbitrary hand-set
    profile that would produce a spurious transient.
    """
    n = G.shape[0]
    C = np.zeros(n)
    w = np.full((n, N_ATTR), 1.0 / N_ATTR)
    for _ in range(BURN_IN_STEPS):
        d = _derived(p, T0, C, G, M, I_tech, w)
        w = _value_step(p, d, G, w)
    return w


def simulate(p, record=True):
    """Run the model.

    p: dict of resolved parameter arrays (see aifm.params.resolve).
    Returns dict: series name -> array (n, n_t) if record, plus "final".
    """
    n = p["g"].shape[0]
    ts = time_grid()
    C = np.zeros(n)
    G = p["G0"].copy()
    M = np.zeros(n)
    I_tech = p["I0"].copy()
    w = initial_values(p, G, M, I_tech)

    out = {k: np.empty((n, ts.size)) for k in SERIES} if record else {}

    for j, t in enumerate(ts):
        d = _derived(p, t, C, G, M, I_tech, w)
        if record:
            out["C"][:, j] = C
            out["A"][:, j] = d["A"]
            out["U"][:, j] = d["U"]
            out["O"][:, j] = d["O"]
            out["G"][:, j] = G
            out["SA"][:, j] = d["SA"]
            out["I"][:, j] = d["I"]
            out["M"][:, j] = M
            out["Det"][:, j] = d["Det"]
            out["D"][:, j] = d["D"]
            out["K"][:, j] = d["K"]
            out["HD"][:, j] = d["D"] * M
            for i, name in enumerate(ATTRACTORS):
                out["w_" + name][:, j] = w[:, i]
        if j == ts.size - 1:
            final = d
            break

        dG = p["kG"] * d["O"] * d["dC"] * (1.0 - G)
        dM = (d["M_star"] - M) / TAU_M
        dI = p["r_I"] * (1.0 + p["a_I"] * d["A"]) * (p["I_max"] - I_tech)

        w = _value_step(p, d, G, w)
        C = C + DT * d["dC"]
        G = G + DT * dG
        M = M + DT * dM
        I_tech = I_tech + DT * dI

    out["final"] = {
        "C": C, "A": final["A"], "U": final["U"], "G": G, "SA": final["SA"],
        "I": final["I"], "M": M, "D": final["D"], "Det": final["Det"],
        "HD": final["D"] * M, "w": w,
    }
    out["t"] = ts
    return out
