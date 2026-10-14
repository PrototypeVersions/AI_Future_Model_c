"""The JavaScript port (docs/js/model.js) must match the Python reference."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

from aifm import params as P
from aifm.analysis import ALL_STRUCTURES
from aifm.model import simulate

ROOT = Path(__file__).resolve().parent.parent
TOL = 1e-9


@unittest.skipIf(shutil.which("node") is None, "node not installed")
class TestParity(unittest.TestCase):
    def test_python_and_js_agree(self):
        rng = np.random.default_rng(7)
        cases = []
        for i, s in enumerate(ALL_STRUCTURES * 3):
            raw = P.sample(1, rng, dist="uniform")
            cases.append({"raw": {k: float(v[0]) for k, v in raw.items()}, "structure": s})
        with tempfile.TemporaryDirectory() as d:
            src, dst = Path(d) / "in.json", Path(d) / "out.json"
            src.write_text(json.dumps(cases))
            subprocess.run(["node", str(ROOT / "tests" / "parity_runner.mjs"), str(src), str(dst)],
                           check=True, cwd=ROOT)
            js = json.loads(dst.read_text())
        worst = 0.0
        for case, res in zip(cases, js):
            raw = {k: np.array([v]) for k, v in case["raw"].items()}
            py = simulate(P.resolve(raw, case["structure"]))
            for k in ["D", "M", "G", "C", "U"]:
                worst = max(worst, float(np.max(np.abs(py[k][0, ::10] - np.array(res[k])))))
            for k in ["D", "M", "G", "C", "U", "I", "HD"]:
                worst = max(worst, abs(float(py["final"][k][0]) - res["final"][k]))
            worst = max(worst, float(np.max(np.abs(py["final"]["w"][0] - np.array(res["final"]["w"])))))
        self.assertLess(worst, TOL, f"max abs difference {worst:.3e}")


if __name__ == "__main__":
    unittest.main()
