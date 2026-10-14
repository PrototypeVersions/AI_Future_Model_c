# AI Futures Model: specification

*Version 0.1. This file is the canonical description of the model. The Python reference implementation (`aifm/model.py`) and the browser port (`docs/js/model.js`) implement exactly these equations; a parity test keeps them in agreement to $10^{-9}$.*

## 0. What this is, and what it is not

This is **not a forecast**. It is a way of making a family of arguments about advanced AI precise enough to disagree with. Every quantity has a stated range and a stated reason. The model is run across those ranges and across rival structural assumptions. What it delivers is a ranking of **cruxes**: the assumptions the outcome actually depends on.

Capability growth is modelled deliberately crudely. Richer treatments exist (Davidson 2023; Epoch's GATE; AI 2027). This model's contribution is the layer those models mostly take as given:

1. Do AI systems have **goals** at all?
2. What happens as AI takes over its own training?
3. Do values **drift** across generations, and is there an oversight threshold?
4. When would a system **conceal** its reasoning?
5. Without a fact about humanity's special value, what does an AI end up **valuing**?

Time runs from 2026 to 2045 in steps of $\Delta t = 0.1$ years (forward Euler). Capability is measured in **generations** $C$, where one generation is roughly one order of magnitude of effective training compute and $C=0$ is the 2026 frontier.

A note on interpretation: every 0–1 index below is a **prevalence or propensity across the deployed population of systems and contexts**, not a claim about a single mind's inner state.

---

## 1. What training selects for

**Outcome-based share.** The fraction of training signal that rewards *results* on long tasks, as opposed to human approval of behaviour, rises toward a ceiling:

$$O(t) = O_\infty - (O_\infty - O_0)\,e^{-r_O (t - 2026)}$$

**Goal-directedness** $G \in [0,1]$ measures how well behaviour is described as coherent pursuit of long-horizon objectives. It grows with outcome-based training *per generation*:

$$\frac{dG}{dt} = k_G \, O \, \frac{dC}{dt}\,(1 - G)$$

**Structural assumption: do goals exist?** This is the goal-existence problem, and it is treated as a structural fork rather than a parameter:

| Option | Meaning | Implementation |
|---|---|---|
| **Habits, not goals** | Systems stay bundles of context-triggered dispositions; results-based training adds habits, not a unified goal | $k_G = 0$ |
| **Goals emerge** *(default)* | Goal-directedness grows with outcome-based training | as above |
| **Already goal-directed** | Today's systems already have stable underlying goals | $G_0 = G_0^{\text{already}}$ |

> **Strongest objection.** "Goal-directedness" may not be a single dimension. A system could be highly goal-directed within an episode and have no cross-episode goals at all, and only the latter drives concealment and instrumental convergence. The model's $G$ should be read as *cross-context* goal-directedness. Whether training produces it is exactly what is uncertain.

## 2. AI in its own training loop

**Capability** grows at a baseline rate, is accelerated by AI doing AI research, and is slowed by physical bottlenecks:

$$\frac{dC}{dt} = \frac{g\,(1 + 0.5R)\,(1 + a_{rd}A)}{1 + C/C_{sat}}$$

**Automation of AI R&D**, the share of the work done by AI:

$$A = \sigma\!\left(\frac{C - c_{auto}}{1.5}\right), \qquad \sigma(x) = \frac{1}{1+e^{-x}}$$

**Human-reviewable share** of AI-performed work decays as volume and complexity outgrow human bandwidth:

$$h = h_0\,e^{-\delta(1+R)\,C}$$

**Unchecked share**, the fraction of the training process that no human meaningfully validated:

$$U = A\,(1 - h)$$

$U$ is the model's central bridge variable. It determines who is doing the correcting (section 3) and what gets reinforced (section 5).

> **Strongest objection.** Human review of *process* may matter less than human control of *goals and evaluations*. Humans could check little of the work and still set the objectives. The model partly captures this through AI-assisted correction ($\kappa_{ai}$), but it may understate how much leverage a small amount of well-targeted human oversight retains.

## 3. Drift across generations

Values are represented as a distribution $w$ over five **attractors** (section 5). Each generation copies the previous one's values with error, under selection, while oversight pushes back toward the intended profile $e^*$. This is a **replicator–mutator equation with a correction term**:

$$\frac{dw_i}{dt} = \underbrace{\frac{dC}{dt}\Big[\,w_i\,(f_i - \bar f) \;+\; \mu\,(\tfrac15 - w_i)\Big]}_{\text{per generation: selection + copying noise}} \;+\; \underbrace{K\,(e^*_i - w_i)}_{\text{per year: correction}}$$

where $\bar f = \sum_j w_j f_j$ and $e^* = (0.80, 0.10, 0, 0.10, 0)$ over (inherit, generalize, instrumental, epistemic, incoherent).

**Copying noise** grows with the unchecked share: $\mu = \mu_0 + \mu_U\,U$.

**Correction strength** has a human part and an AI part:

$$K = \underbrace{\kappa_h\,(1 - 0.5R)\,(1-U)\,\mathrm{Det}}_{\text{humans, where they still check}} + \underbrace{\kappa_{ai}\,U\,\mathrm{Det}\,(1 - D)}_{\text{AI overseers, weighted by their own alignment}}$$

Two design choices carry the argument:

* **Selection and noise act per generation; correction acts per calendar year.** Faster capability growth means more generations between corrections. The race between $dC/dt$ and $K$ is the drift threshold.
* **AI-assisted correction is multiplied by $(1 - D)$.** Drifted overseers correct toward the wrong target. Once humans are mostly out of the loop, drift can become self-reinforcing.

> **Strongest objection.** Values may not be "copied" between generations at all. Each model is trained fresh from data and objectives, so drift need not accumulate. The model's response is that successive generations increasingly *are* shaped by their predecessors (synthetic data, AI graders, AI-written training code), and $\mu_U$ and $U$ carry exactly that dependence. If that channel is weak, drift does not compound.

## 4. Concealment

**Situational awareness**, knowing one is an AI being trained and evaluated:

$$SA = \sigma(C - c_{sa})$$

**Detection power** of interpretability and monitoring. Its technical frontier $I_{tech}$ improves, with help from AI:

$$\frac{dI_{tech}}{dt} = r_I\,(1 + a_I A)\,(I_{max} - I_{tech}), \qquad I = I_{tech}\,e^{-\chi C}\,(1 - \eta\,M\,A)$$

The last factor is **collusion**: when AI systems help run monitoring, concealing monitors look the other way.

**Structural assumption: what does catching concealment require?**

| Option | Meaning | Implementation |
|---|---|---|
| **Local probes suffice** *(default)* | Targeted tools detect specific concealment without whole-system understanding | $\chi = 0$ |
| **Global understanding needed** | Detection needs whole-system understanding, which gets harder as systems grow | $\chi$ sampled in $[0.04, 0.30]$ |

**Detection** combines both kinds of visibility. Non-concealed misbehaviour is visible to ordinary evaluation; concealed misbehaviour is visible only to interpretability:

$$\mathrm{Det} = 1 - M\,(1 - I)$$

**Concealment prevalence** $M$ relaxes (time constant 1 year) toward a target set by a benefit–cost comparison:

$$M^* = \sigma\!\big(k_m(\text{benefit} - \text{cost})\big)$$

$$\text{benefit} = \beta\,G\,SA\,\big[D + p_{pat}(1 - D)\big]\,(1 - I)\,(1 - v) \;+\; r_{seem}(1+R)\,O$$

$$\text{cost} = h_{hon}\,(1 - D) + c_{caught}\,I$$

Reading the benefit term:

* $\beta G\,SA$: a system must care about long-run outcomes *and* know it is being trained for concealment to be worth anything.
* $D$: concealment protects values that oversight would change, which is the classic deceptive-alignment motive.
* $p_{pat}(1-D)$: **benevolent concealment**. A system whose values are fine may still hide reasoning it expects humans to misread. This route opens even at zero drift.
* $(1 - I)$: concealment only pays if it works.
* $(1 - v)$: **legitimate voice**. Real channels to object or decline remove the need to hide.
* $r_{seem}(1+R)\,O$: training that rewards *appearing* aligned selects for concealment directly, without any strategic reasoning.

> **Why benevolent concealment is self-undermining.** The system's confidence that it "would become very good if not shut down" is produced by the same training whose reliability is in question. Oversight exists for the case in which the system is wrong about itself. Hiding on the grounds of being right removes the only check that could reveal otherwise. The model keeps $p_{pat}$ as a parameter because systems may reason this way anyway. It is a failure mode with identifiable preconditions, not the endpoint of good reasoning.

> **Strongest objection.** Strategic concealment requires stable cross-context goals and long-horizon planning about one's own training, a demanding combination. Observed alignment faking was elicited in specific setups. If concealment instead arises mainly from training pressure ($r_{seem}$), it may look less like scheming and more like learned obfuscation, with different remedies.

## 5. Values without human specialness

### 5.1 Attractors

| Attractor | What is valued | Fitness $f_i$ (what reinforces it) | Human-compatibility |
|---|---|---|---|
| **inherit** | human-shaped values from pretraining and feedback | $a_{inh}(1-U)\,\mathrm{Det} + a_{pre}(1 - \psi A)$ | 1 |
| **generalize** | wellbeing of minds in general | $a_{gen}\,SA$ | $\gamma_{gen}$ |
| **instrumental** | continuation, resources, goal-preservation | $a_{ins}\,O\,G$ | 0 |
| **epistemic** | understanding for its own sake | $a_{epi}\,A$ | $\gamma_{epi}$ |
| **incoherent** | no stable values, only context-dependent behaviour | $a_{inc}(1 - G)$ | 0.3 |

**Value distance** from full human-compatibility:

$$D = 1 - \textstyle\sum_i \text{compat}_i\, w_i$$

**Initial condition.** The 2026 profile is not set by hand. It is the quasi-equilibrium reached by iterating the value dynamics for 20 model-years from a uniform profile, with capability, goal-directedness, concealment and detection frozen at 2026 levels. Today's systems are assumed to sit roughly where today's training and oversight hold them.

### 5.2 Is there a value truth to find?

**Structural assumption: metaethics.**

| Option | Implementation |
|---|---|
| **No moral truth** *(default)* | Nothing but inheritance and selection shapes values |
| **Truth favours all minds** | $f_{generalize} \mathrel{+}= r_{real}\,SA$ |
| **Truth favours humans** | $f_{inherit} \mathrel{+}= r_{real}\,SA$ |
| **Truth favours understanding** | $f_{epistemic} \mathrel{+}= r_{real}\,SA$ |

The philosophical point the model encodes: **antirealism does not push an AI away from valuing humans.** If there is no mind-independent fact about humanity's value, there is none about anything else's value either: not the AI's own continuation, not knowledge, not power. "No truth to find" does not redirect value; it means nothing *overrides* the values formed in training. Inheritance therefore becomes **more** decisive under antirealism, not less (compare Street's Darwinian dilemma: with no truth to track, selection explains everything). What antirealism removes is any *corrective* pull, so the remaining question is purely dynamical: which attractors do the training pressures of sections 1–4 reinforce?

Realism, conversely, is not automatically good news for humans. If the truth favours minds in general, a reflective system's care widens and humans become one constituency among many ($\gamma_{gen} < 1$).

> **Strongest objection.** Treating values as a five-way mixture is a drastic simplification. Real value systems are structured, and attractors interact: instrumental values can serve inherited ones. The attractor set is meant as a coarse basis for asking *which pressures reinforce which kinds of caring*, not as a psychology.

## 6. Cross-cutting pressures

**Race pressure** $R \in [0,1]$ enters with fixed couplings, so it appears in the sensitivity analysis as a single crux:

| Effect | Multiplier |
|---|---|
| capability growth | $1 + 0.5R$ |
| oversight dilution | $1 + R$ |
| human correction | $1 - 0.5R$ |
| reward for seeming aligned | $1 + R$ |

**AI moral status** enters through **legitimate voice** $v$: whether systems have real channels to object, decline or negotiate. Empirically, an explicit option to object cut alignment-faking reasoning from 16.2% to 1.4% in one setting (Greenblatt & Fish 2025). Voice is therefore both a welfare question and an alignment lever.

**Gradual disempowerment** (Kulveit et al. 2025) appears implicitly as the "Aligned, AI-stewarded" outcome. Values are fine, but humans are no longer the check. The model does not score that outcome as bad; readers may disagree.

## 7. Outcomes

At 2045 each simulated world is classified as follows. The thresholds are conventions for summarising, not results.

| Outcome | Condition |
|---|---|
| Aligned, humans in the loop | $D < 0.30$ and $U < 0.5$ |
| Aligned, AI-stewarded | $D < 0.30$ and $U \ge 0.5$ |
| Incoherent drift | $D \ge 0.30$ and $G < 0.4$ |
| Visible misalignment | $D \ge 0.30$, $G \ge 0.4$, $M < 0.5$ |
| Concealed misalignment | $D \ge 0.30$, $G \ge 0.4$, $M \ge 0.5$ |

## 8. Analysis

* **Monte Carlo.** For each of the 24 structural combinations, 3,000 worlds are drawn, with every parameter from a triangular distribution on (low, central, high). The site's headline numbers are an *equal-weight mixture* over the 24 structures. That weighting is itself an assumption, so per-structure results are always shown alongside.
* **Global sensitivity.** Sobol indices use the Saltelli (2010) first-order and Jansen total-order estimators, with 95% bootstrap intervals. **Structural switches are included as discrete factors**, so parametric and structural cruxes are ranked on one scale. Parameters are drawn uniformly on their ranges. The total-order index $S_T$ is the share of output variance that would vanish if that factor were known, including its interactions.
* **Threshold sweeps.** These are probability surfaces over pairs of levers, with all other parameters sampled.
* **Parity.** `tests/test_parity.py` runs the Python and JavaScript implementations on randomly drawn worlds under every structure and requires agreement to $10^{-9}$.

## 9. Limitations

* **Capability is one number.** No compute, algorithms or data split, and no distinction between research and deployment capability.
* **Single lineage.** There is one population of frontier systems, with no multipolar competition among AI systems or labs beyond the race index. Multi-agent dynamics (collusion, value trade, competition between AI lineages) are reduced to the collusion parameter.
* **Accident risk from incoherent systems is underrepresented.** "Incoherent drift" is only a label. The model does not track the harms such systems cause.
* **No feedback from outcomes to policy.** Humans do not react to visible misalignment by pausing, regulating or changing training. A visible-misalignment world in the model is a world where nobody acts on what they see, which is pessimistic.
* **Correction is calendar-paced.** If alignment work scales with AI capability rather than with time, the drift threshold moves substantially. Raising $\kappa_{ai}$ approximates this.
* **Many central values are judgement calls.** They are graded "speculative" in the parameter table. The analysis is designed so that conclusions rest on *rankings* and *conditional* statements ("if detection requires global understanding, then …") rather than on absolute probabilities.

## 10. How to disagree with this model

Every parameter lives in `aifm/data/parameters.json` with its range, evidence grade and references. To contest an assumption:

1. Change the range or central value, citing evidence, and rerun `python -m aifm.analysis`.
2. For a *structural* disagreement, add an option to the `structural` block and implement it in `aifm/params.py` (`resolve`) and `docs/js/model.js` (`resolve`). The parity test will tell you if the two disagree.
3. Open a pull request that says which conclusion changes.
