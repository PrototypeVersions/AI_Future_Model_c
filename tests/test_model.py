"""Invariants and structural behaviour of the reference model."""
import unittest

import numpy as np

from aifm import params as P
from aifm.analysis import ALL_STRUCTURES, run_mixed, STRUCT_KEYS, STRUCT_OPTS
from aifm.model import simulate, SERIES
from aifm.outcomes import classify, OUTCOME_IDS


def run(n=400, structure=None, seed=0, dist="uniform"):
    rng = np.random.default_rng(seed)
    return simulate(P.resolve(P.sample(n, rng, dist=dist), structure))


class TestInvariants(unittest.TestCase):
    def test_bounded_and_normalised(self):
        for s in ALL_STRUCTURES[::3]:
            out = run(200, s)
            for k in SERIES:
                if k == "C" or k == "K":
                    self.assertTrue(np.all(out[k] >= 0), k)
                    continue
                self.assertTrue(np.all(out[k] >= -1e-12) and np.all(out[k] <= 1 + 1e-12), k)
            w = np.stack([out["w_" + a] for a in ["inherit", "generalize", "instrumental",
                                                   "epistemic", "incoherent"]])
            self.assertTrue(np.allclose(w.sum(axis=0), 1.0))

    def test_capability_monotone(self):
        out = run(200)
        self.assertTrue(np.all(np.diff(out["C"], axis=1) > 0))

    def test_habits_freeze_goal_directedness(self):
        out = run(100, {"goal_model": "habits"})
        self.assertTrue(np.allclose(out["G"], out["G"][:, :1]))

    def test_local_regime_ignores_chi(self):
        rng = np.random.default_rng(3)
        raw = P.sample(50, rng)
        a = simulate(P.resolve(raw, {"interp_regime": "local"}))["final"]["D"]
        raw2 = dict(raw, chi=raw["chi"] * 0 + 0.3)
        b = simulate(P.resolve(raw2, {"interp_regime": "local"}))["final"]["D"]
        self.assertTrue(np.array_equal(a, b))

    def test_antirealism_ignores_r_real(self):
        rng = np.random.default_rng(4)
        raw = P.sample(50, rng)
        a = simulate(P.resolve(raw, {"metaethics": "antirealist"}))["final"]["D"]
        b = simulate(P.resolve(dict(raw, r_real=raw["r_real"] * 0 + 0.6),
                               {"metaethics": "antirealist"}))["final"]["D"]
        self.assertTrue(np.array_equal(a, b))

    def test_every_sample_classified(self):
        labels = classify(run(500)["final"])
        self.assertTrue(set(labels) <= set(OUTCOME_IDS))

    def test_run_mixed_matches_direct(self):
        rng = np.random.default_rng(5)
        raw = P.sample(60, rng)
        idx = {k: rng.integers(0, len(STRUCT_OPTS[k]), 60) for k in STRUCT_KEYS}
        mixed = run_mixed(raw, idx)["final"]["D"]
        for i in range(0, 60, 7):
            s = {k: STRUCT_OPTS[k][idx[k][i]] for k in STRUCT_KEYS}
            one = simulate(P.resolve({k: v[i:i + 1] for k, v in raw.items()}, s))["final"]["D"][0]
            self.assertAlmostEqual(mixed[i], one, places=12)


class TestDirectionalSanity(unittest.TestCase):
    """Levers should push outcomes in the direction their rationale claims."""

    def _mean(self, key, values, metric, structure=None):
        rng = np.random.default_rng(11)
        raw = P.sample(800, rng)
        res = []
        for v in values:
            r = dict(raw)
            r[key] = np.full(800, v)
            f = simulate(P.resolve(r, structure))["final"]
            res.append(float(np.mean(f[metric])))
        return res

    def test_voice_reduces_concealment(self):
        lo, hi = self._mean("voice", [0.0, 0.7], "M", {"interp_regime": "global"})
        self.assertLess(hi, lo)

    def test_seeming_reward_increases_concealment(self):
        lo, hi = self._mean("r_seem", [0.0, 0.3], "M", {"interp_regime": "global"})
        self.assertGreater(hi, lo)

    def test_ai_oversight_reduces_drift(self):
        lo, hi = self._mean("kappa_ai", [0.05, 0.8], "D")
        self.assertLess(hi, lo)

    def test_instrumental_pressure_increases_drift(self):
        lo, hi = self._mean("a_ins", [0.2, 1.2], "D", {"goal_model": "emergent"})
        self.assertGreater(hi, lo)


if __name__ == "__main__":
    unittest.main()
