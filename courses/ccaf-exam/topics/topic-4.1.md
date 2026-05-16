# Topic 4.1 — Explicit criteria to reduce false positives

> **Domain 4 · Prompt Engineering & Structured Output** · 20% of the exam

## Why this matters

Code-review agents, security scanners, lint-style checks — anything where Claude flags issues for a human to act on — live or die on **precision**. The single most common failure mode the exam tests in this domain is the team that tries to fix a noisy reviewer with vague meta-instructions ("be conservative", "only flag high-confidence issues") and watches false positives stay flat or climb. The fix is structural, not motivational: **replace vague filters with explicit categorical criteria, define severities by code shape, and disable categories you can't yet make precise**. Get this wrong and the cost compounds — false positives don't just annoy reviewers, they teach reviewers to ignore *every* finding the agent produces, including the genuine bugs. This topic is canonical for **Scenario 5 (Claude Code for CI/CD)** and shows up wherever Claude is filtering candidates for human attention.

## Specific categorical criteria over vague "be conservative"

The first instinct when an agent generates noise is to tell it to be more careful: *"only report findings you are highly confident in"*, *"be conservative in what you flag"*, *"prefer false negatives to false positives"*. These instructions feel right and **do almost nothing** to precision. The reason is that Claude does not have a calibrated confidence dial it can dim — "high confidence" is not a quantity the model measures against a held-out set. The instruction collapses into "produce fewer findings", which the model satisfies by being slightly less verbose, not by being structurally more precise.

The fix is **explicit categorical criteria**: tell the model exactly which code shapes count as the issue, and exactly which superficially similar shapes do not. Compare:

- ❌ *"Flag inaccurate comments."*
- ✅ *"Flag a comment only when its claimed behavior contradicts the actual behavior of the adjacent code (e.g., comment says 'returns null on missing key' but the code throws). Do not flag comments that are merely terse, outdated in tone, or describe a function in different words."*

The second prompt eliminates entire classes of false positive — comments that paraphrase, comments that omit edge cases, comments that an over-eager model would call "imprecise". It also gives the model a **decision boundary** it can actually apply turn after turn, which is what calibration looks like in practice.

> **Common pitfall** — Adding *more* hedging language ("be cautious, only flag if certain, prefer silence to noise") in response to a noisy reviewer. Hedging language reduces volume non-uniformly and leaves the false-positive *rate* untouched.

**Quick recall**
- **Q:** Why does "only report high-confidence findings" fail to improve precision? → Because Claude has no calibrated confidence axis to filter on; the instruction reduces volume but not the false-positive rate.
- **Q:** What's the structural fix? → Explicit categorical criteria that name which code shapes are in scope and which superficially similar shapes are out of scope.

## False-positive contagion: high-FP categories undermine trust in accurate ones

A single noisy category does not stay contained — it **poisons the trust signal for the entire reviewer**. If Claude's "potential null dereference" findings are wrong 60% of the time, developers learn to skim past *all* the agent's output, including the categories where it's accurate (e.g., spot-on SQL injection finds). The contagion is reputational, not technical: humans pattern-match on "this tool wastes my time" and disengage from the whole channel.

Concretely, the symptom in production looks like: aggregate precision metrics across categories look "okay" (say, 70%), the security category in isolation is 92% precise, but pull-request authors are dismissing the bot's comments without reading them. A blameless post-mortem reveals that the **comment-accuracy** category is at 35% precision and accounts for 80% of the volume — every PR has 6–10 wrong comment-accuracy nags, and after a week reviewers click "resolve" on the entire conversation thread without scanning for the security finding buried among them.

The exam-tested mental model: **trust is a per-reviewer property, not a per-category property**. You cannot ship a noisy category alongside a precise one and expect humans to triage cleanly. The fix is at the category level (sharper criteria) or at the *reviewer* level (disable the category entirely until you can sharpen it) — never at the human level ("please read more carefully").

> **Common pitfall** — Treating the dashboard's aggregate precision number as the success metric. A 70% aggregate that hides one 35% category will lose developer trust faster than a 50% reviewer where every category is at 50% — because the latter trains people to triage, while the former trains them to dismiss.

**Quick recall**
- **Q:** Why does one high-FP category degrade trust in accurate categories? → Developers stop trusting the agent's output as a whole; reputational damage is per-reviewer, not per-category.
- **Q:** What's the wrong place to "fix" contagion? → At the human layer (asking reviewers to read more carefully); the cure must happen in the prompt or by disabling the category.

## Severity criteria with concrete code examples per level

Severity rubrics written with **adjectives** ("critical", "major", "minor") never produce consistent classification across runs because the adjectives themselves are ambiguous to the model. Two runs over the same PR will disagree on whether a missing null check is "major" or "minor", and reviewers can't calibrate against a moving target.

The fix is to **anchor each severity level to a concrete code shape**, ideally with a one-line example the model can pattern-match against:

```
P0 (block merge): user-controlled input flowing into shell/SQL/template
                  without sanitisation — e.g., `exec("ls " + req.body.path)`.
P1 (request changes): missing error handling on a network/IO call whose failure
                  would corrupt persistent state — e.g., `await db.write(x)` with
                  no try/catch in a transaction-less function.
P2 (suggest):     dead branch, unused variable, redundant check —
                  e.g., `if (x) { return x; } return x;`.
P3 (skip):        style, naming, comment tone, formatting deltas.
```

This rubric does two things at once: (1) it tells the model how to *bucket* a finding it has already decided to surface, and (2) it tells the model how to *decide whether to surface it at all* — anything that can't fit P0–P2 by example collapses into P3 ("skip"), which becomes the default. The exam pattern is to recognise that an inconsistent classifier almost always has an adjective-driven rubric, and the fix is **examples, not adverbs**.

> **Common pitfall** — Defining severities by impact words ("critical = severe", "major = important"). Severity must be defined by the *shape of the code*, not by a synonym chain.

**Quick recall**
- **Q:** Why do adjective-only severity rubrics produce inconsistent classifications? → Adjectives are ambiguous; the model has no anchor to resolve "major" vs "minor" the same way twice.
- **Q:** What anchors severities consistently? → A concrete code-shape example for each level (e.g., "P0: user input flowing into `exec(...)`").

## Temporarily disabling high-FP categories to restore developer trust

When a category is producing noise faster than you can sharpen its criteria, the right move is to **disable it** in the production prompt — not to re-tune in place while continuing to fire noise at reviewers. Continuing to ship a known-noisy category "because it sometimes catches real bugs" trades a small recall gain for ongoing trust erosion, and the trust loss is much harder to reverse than the recall loss.

The disable-and-iterate workflow looks like: (1) **remove the category** from the active prompt, (2) keep precise categories firing so the reviewer remains useful, (3) iterate offline on the criteria for the disabled category against a labelled sample of PRs, (4) re-enable only when the offline precision clears a threshold (commonly 80–90%). The same workflow applies when a previously-precise category regresses after a prompt change — disable, fix, re-enable.

A subtle point the exam tests: the *disable* move is correct even when the category occasionally produces a finding nobody else would have caught. The cost-benefit is dominated by the trust signal — a reviewer who has stopped reading findings catches **zero** real bugs, regardless of how clever the noisy category is. Trust is the gating resource, not raw recall.

A related anti-fix: turning the temperature down, raising a confidence-score self-report threshold, or asking the reviewer to "be careful" with the noisy category. None of these touch the criteria; all of them keep the noise firing and keep eroding trust.

> **Common pitfall** — "Let's leave the noisy category on at 35% precision because once in a while it catches a real bug." That logic ignores that the *reviewer* has already disengaged, so the rare real find lands in a thread nobody reads.

**Quick recall**
- **Q:** A category is at 35% precision and the team is iterating on its criteria. What do you do in the meantime? → Disable the category in the production prompt; iterate offline; re-enable when offline precision clears the bar.
- **Q:** Why isn't "leave it on, it sometimes catches real bugs" a valid trade-off? → Because reviewers who've disengaged don't read the rare correct finding either, so recall is effectively zero anyway.

## Anti-patterns

- ❌ **"Be conservative" / "only flag high-confidence issues" as the precision fix.** Vague meta-instructions don't reduce false-positive *rate*; they just reduce volume.
- ✅ **Replace vague hedges with explicit categorical criteria** that name in-scope and out-of-scope code shapes.
- ❌ **Leaving a 35%-precision category live "because it sometimes catches a real bug."** Reviewer trust collapses; the rare correct find dies in a thread nobody reads.
- ✅ **Disable the noisy category in production**; iterate offline against a labelled sample; re-enable when precision clears the bar.
- ❌ **Severity rubrics defined by adjectives ("critical", "major", "minor").** The model has no anchor to apply them consistently across runs.
- ✅ **Severity rubrics anchored to concrete code-shape examples** per level, with a default-skip bucket for everything that doesn't match.
- ❌ **Asking reviewers to "be careful" with the noisy category.** Trust loss is per-reviewer; you cannot patch it at the human layer.
- ✅ **Patch at the prompt layer (sharpen criteria) or the deployment layer (disable category)** — never offload the precision problem to humans.
- ❌ **Treating aggregate precision as the success metric.** A 70% aggregate hiding a 35% category will lose trust faster than a uniform 60%.
- ✅ **Track per-category precision** and treat any category that drags trust down as a P0 to disable or rewrite.
- ❌ **Lowering temperature to "increase the model's caution".** Temperature affects sampling diversity, not the criteria the model is applying — noise stays noisy.
- ✅ **Fix the criteria.** Temperature is not a precision dial.

## Worked example — Scenario S5 (Claude Code for CI/CD)

A team rolls out a Claude Code-based PR reviewer with five categories: SQL injection, missing null checks, comment accuracy, dead code, naming. After two weeks, PR authors are auto-resolving the bot's comments without reading them. Per-category audit: SQL injection 91% precise, missing null checks 78%, comment accuracy 32%, dead code 70%, naming 45%. The right move is **not** to add "be conservative" to the system prompt or ask reviewers to triage harder. It is to (1) **disable comment-accuracy and naming** in production immediately, (2) rewrite their criteria with explicit categorical scope ("flag a comment only when claimed behavior contradicts actual behavior", "flag a name only when it directly conflicts with a documented project convention"), (3) re-introduce a severity rubric with concrete code-shape examples per level, and (4) re-enable each category only after offline precision on a labelled sample clears 85%. The visible result a sprint later: fewer findings overall, but the ones that fire get read — and the SQL injection finds, which were always good, finally land.

## Quick recall (full set)

- **Q:** Why do "be conservative" / "only flag high-confidence issues" instructions fail to improve precision? → Claude has no calibrated confidence axis to filter on; volume drops slightly but the FP rate is unchanged.
- **Q:** What does the structural fix look like instead? → Explicit categorical criteria naming in-scope and out-of-scope code shapes for each finding type.
- **Q:** What is false-positive contagion? → A single noisy category teaches developers to dismiss the reviewer's output wholesale, including findings from accurate categories.
- **Q:** Where does false-positive contagion *not* get fixed? → At the human layer ("please read more carefully") — trust loss is per-reviewer and per-channel.
- **Q:** Why are adjective-driven severity rubrics inconsistent? → "Major" and "minor" are ambiguous; the model can't apply them the same way twice without a code-shape anchor.
- **Q:** What anchors a severity level? → A concrete code-shape example per level, with a default-skip bucket for everything else.
- **Q:** A category is at 35% precision and being iterated on. What do you do in production? → Disable it; iterate offline; re-enable only when offline precision clears the bar (commonly 80–90%).
- **Q:** Why isn't "leave it on, it occasionally catches a real bug" a valid trade-off? → Reviewers who've disengaged don't read the rare correct finding either; recall is effectively zero.
- **Q:** Is lowering temperature a valid precision fix? → No — temperature affects sampling diversity, not the criteria; noise stays noisy.
- **Q:** Is asking the reviewer to "be more careful with category X" a valid fix? → No — trust loss is structural; the cure is sharper criteria or disabling the category.
