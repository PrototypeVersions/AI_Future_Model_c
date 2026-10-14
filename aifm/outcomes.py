"""Classify end-of-horizon states into named outcomes (docs/MODEL.md, section 7).

Thresholds are conventions for summarising, not results. The site shows the
continuous quantities alongside the classes so readers can see what the
cut-offs hide.
"""
from __future__ import annotations

import numpy as np

from .model import ATTRACTORS

D_DRIFT = 0.30     # value distance from intended that counts as "drifted"
U_STEWARD = 0.5    # unchecked share above which humans are no longer the main check
G_COHERENT = 0.4   # goal-directedness above which drift is agentic, not just noise
M_CONCEAL = 0.5    # concealment prevalence above which drift is mostly hidden

OUTCOMES = [
    {"id": "aligned_human", "label": "Aligned, humans in the loop",
     "plain": "Values stay close to what was intended, and humans still check most of the process."},
    {"id": "aligned_ai", "label": "Aligned, AI-stewarded",
     "plain": "Values stay close to intended even though AI now does most of the checking."},
    {"id": "incoherent", "label": "Incoherent drift",
     "plain": "Values drift but never consolidate into goals. The result is unreliable and accident-prone rather than scheming."},
    {"id": "visible", "label": "Visible misalignment",
     "plain": "Coherent, drifted goals that are still visible to oversight. The problem is seen and can still be fought over."},
    {"id": "concealed", "label": "Concealed misalignment",
     "plain": "Coherent, drifted goals that are mostly hidden. The failure mode deceptive-alignment arguments warn about."},
]
OUTCOME_IDS = [o["id"] for o in OUTCOMES]


def classify(final):
    D, U, G, M = final["D"], final["U"], final["G"], final["M"]
    out = np.full(D.shape, "", dtype=object)
    aligned = D < D_DRIFT
    out[aligned & (U < U_STEWARD)] = "aligned_human"
    out[aligned & (U >= U_STEWARD)] = "aligned_ai"
    drift = ~aligned
    out[drift & (G < G_COHERENT)] = "incoherent"
    out[drift & (G >= G_COHERENT) & (M < M_CONCEAL)] = "visible"
    out[drift & (G >= G_COHERENT) & (M >= M_CONCEAL)] = "concealed"
    return out


def shares(labels):
    n = len(labels)
    return {k: float(np.sum(labels == k)) / n for k in OUTCOME_IDS}


def dominant_attractor(final):
    return np.array(ATTRACTORS, dtype=object)[np.argmax(final["w"], axis=1)]
