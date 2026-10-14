# AI Futures Model

An open, assumption-explicit model of how AI **training**, **oversight**, **concealment** and **value formation** could interact from 2026 to 2045, and of which assumptions the outcome actually depends on.

**Site:** <https://prototypeversions.github.io/AI_Future_Model_c/> (a plain-language explainer with live sliders, plus a technical page with the full specification and results)

This is **not a forecast**. Every parameter has a stated range, an evidence grade and a reason. The model runs across those ranges and across rival structural assumptions, and reports which assumptions the outcomes turn on.

## The five questions

1. **What does training select for**, and does it produce *goals* at all? (habits / goals emerge / already goal-directed)
2. **What happens as AI takes over its own training?** The share of the process no human checked.
3. **Do values drift across generations**, and is there an oversight threshold?
4. **When would a system conceal its reasoning**, including "benevolent" concealment by a system that believes its values are good?
5. **What does an AI value if humans aren't metaphysically special?** Inheritance versus selection, with and without moral realism.

The model treats values as a mixture over five attractors (inherited, care for all minds, instrumental, curiosity, incoherent). The mixture evolves by a replicator–mutator equation with an oversight-correction term. The full specification is in [`docs/MODEL.md`](docs/MODEL.md).

## What the current analysis suggests

With 24 structural combinations × 3,000 worlds, and Sobol sensitivity over all 41 parameters plus the 3 structural forks (94,208 runs):

* **Capability speed is the largest driver of drift.** Fast progress isn't bad in itself; it outruns correction and puts AI in charge of correction sooner.
* **Human correction strength barely affects 2045 outcomes.** In the worlds that drift, humans have left the loop by then. **AI-assisted correction**, weighted by the overseers' own alignment, sets the boundary.
* **Whether interpretability can work locally is the largest driver of concealment**, larger than any parameter describing the AI's motives.
* **The goal-existence question is close behind.** If training yields habits rather than goals, concealed misalignment never appears in the model.
* **Legitimate voice reduces concealment, and rewarding the *appearance* of alignment increases it.**

All of these are conditional claims about the model, not predictions. See the caveats on the site and in `docs/MODEL.md` §9.

## Quick start

```bash
pip install -r requirements.txt          # numpy, scipy
python -m unittest discover -s tests     # invariants + Python/JS parity (needs node)
python -m aifm.analysis                  # regenerates docs/data/results.json (~3 min)
python -m aifm.analysis --quick          # smaller run for checking changes
python -m http.server -d docs            # view the site at http://localhost:8000
```

Python example:

```python
import numpy as np
from aifm import sample, resolve, simulate, classify, shares

rng = np.random.default_rng(0)
raw = sample(2000, rng)                                   # draw 2,000 worlds
worlds = simulate(resolve(raw, {"goal_model": "emergent",
                                "interp_regime": "global",
                                "metaethics": "antirealist"}))
print(shares(classify(worlds["final"])))
```

## Repository layout

| Path | What it is |
|---|---|
| `aifm/model.py` | Reference dynamics (vectorised NumPy) |
| `aifm/params.py` | Parameter loading, sampling, structural assumptions |
| `aifm/outcomes.py` | Outcome classification |
| `aifm/analysis.py` | Monte Carlo, Sobol sensitivity, threshold sweeps |
| `aifm/data/parameters.json` | **Every parameter: range, evidence grade, reasoning, references** |
| `aifm/data/references.json` | Bibliography |
| `docs/` | The GitHub Pages site (`index.html` explainer, `technical.html`) |
| `docs/js/model.js` | Browser port of the model, kept identical by `tests/test_parity.py` |
| `docs/MODEL.md` | Canonical specification (rendered on the technical page) |

## How to disagree with this model

That is what it's for.

* **A parameter is wrong:** change its range or central value in `aifm/data/parameters.json`, cite your evidence in `why` and `refs`, run `python -m aifm.analysis`, and open a pull request saying which conclusion changed.
* **A structural assumption is missing:** add an option under `structural` in `parameters.json` and implement it in both `aifm/params.py::resolve` and `docs/js/model.js::resolve`. The parity test will catch any disagreement between the two.
* **A mechanism is wrong:** change both implementations and `docs/MODEL.md` together.

## Publishing the site

In the repository's **Settings → Pages**, set *Source* to **Deploy from a branch**, branch **main**, folder **/docs**. The site is static and needs no build step. `docs/.nojekyll` makes sure `MODEL.md` is served as-is.

## Licence and citation

Code: MIT (see `LICENSE`). Text, figures and the parameter documentation: CC BY 4.0. KaTeX (vendored in `docs/vendor/katex`) is MIT-licensed. To cite, see `CITATION.cff`.
