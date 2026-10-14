"""Parameter loading, sampling and structural resolution."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .model import ATTRACTORS, N_ATTR

DATA = Path(__file__).parent / "data"


def load_spec():
    with open(DATA / "parameters.json") as f:
        return json.load(f)


SPEC = load_spec()
PARAMS = SPEC["parameters"]
IDS = [p["id"] for p in PARAMS]
BY_ID = {p["id"]: p for p in PARAMS}
STRUCTURAL = SPEC["structural"]
DEFAULT_STRUCTURE = {k: v["default"] for k, v in STRUCTURAL.items()}

# Parameters that only matter under a particular structural assumption.
# They are excluded from sensitivity analysis under other assumptions.
CONDITIONAL = {p["id"]: p["structural"] for p in PARAMS if "structural" in p}


def central(n=1):
    return {k: np.full(n, BY_ID[k]["central"], dtype=float) for k in IDS}


def bounds(k):
    p = BY_ID[k]
    return p["low"], p["high"]


def triangular(u, low, mode, high):
    """Inverse CDF of the triangular distribution, vectorised over u."""
    u = np.asarray(u, dtype=float)
    span = high - low
    if span <= 0:
        return np.full_like(u, mode)
    fc = (mode - low) / span
    left = low + np.sqrt(u * span * (mode - low))
    right = high - np.sqrt((1.0 - u) * span * (high - mode))
    return np.where(u < fc, left, right)


def sample(n, rng, dist="triangular", ids=None):
    """Draw n parameter sets. ids restricts which are sampled (others central)."""
    ids = IDS if ids is None else ids
    out = central(n)
    for k in ids:
        p = BY_ID[k]
        u = rng.random(n)
        if dist == "triangular":
            out[k] = triangular(u, p["low"], p["central"], p["high"])
        else:
            out[k] = p["low"] + u * (p["high"] - p["low"])
    return out


def from_unit(U, ids):
    """Map a (n, len(ids)) unit-cube design to uniform parameter values."""
    n = U.shape[0]
    out = central(n)
    for j, k in enumerate(ids):
        lo, hi = bounds(k)
        out[k] = lo + U[:, j] * (hi - lo)
    return out


def resolve(raw, structure=None):
    """Apply structural assumptions and build the arrays the simulator needs.

    raw: dict id -> array (n,). structure: dict like DEFAULT_STRUCTURE.
    Returns a new dict; raw is not modified.
    """
    s = dict(DEFAULT_STRUCTURE)
    if structure:
        s.update(structure)
    p = {k: np.asarray(v, dtype=float).copy() for k, v in raw.items()}
    n = p["g"].shape[0]

    if s["goal_model"] == "habits":
        p["kG"] = np.zeros(n)
    elif s["goal_model"] == "already":
        p["G0"] = p["G0_already"].copy()

    if s["interp_regime"] == "local":
        p["chi"] = np.zeros(n)

    r_real_vec = np.zeros((n, N_ATTR))
    if s["metaethics"] != "antirealist":
        target = s["metaethics"].split("_", 1)[1]
        r_real_vec[:, ATTRACTORS.index(target)] = p["r_real"]
    p["r_real_vec"] = r_real_vec

    p["_structure"] = s
    return p


def active_ids(structure):
    """Parameter ids that can affect output under a given structure."""
    s = dict(DEFAULT_STRUCTURE)
    s.update(structure or {})
    ids = []
    for k in IDS:
        cond = CONDITIONAL.get(k)
        if cond == "global" and s["interp_regime"] != "global":
            continue
        if cond == "realist" and s["metaethics"] == "antirealist":
            continue
        if k == "G0_already" and s["goal_model"] != "already":
            continue
        if k == "G0" and s["goal_model"] == "already":
            continue
        if k == "kG" and s["goal_model"] == "habits":
            continue
        ids.append(k)
    return ids
