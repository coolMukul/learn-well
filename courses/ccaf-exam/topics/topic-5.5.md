# Topic 5.5 — Human review workflows and confidence calibration

> **Domain 5 · Context Management & Reliability** · 15% of the exam

## Why this matters

This is the topic that turns an extraction prototype into a production system you can actually trust. Almost every team building structured-data extraction with Claude reaches the same milestone: aggregate accuracy looks great (97%, 98%, sometimes 99%), so they switch off human review. Three weeks later something breaks loudly, and the post-mortem reveals the same shape every time: the aggregate was fine, but one document type, or one field, was running at 60% accuracy and nobody had been looking at it.

The exam tests this as a tightly coupled cluster: aggregate metrics hide segment failure, **stratified random sampling** keeps eyes on every segment, **field-level confidence scores** must be **calibrated** before you trust them, you validate **by document type and field segment** before automating, and you route **low-confidence or contradictory** extractions to humans. Skip any one — most commonly, shipping on uncalibrated confidence with uniform sampling — and you've rebuilt the production failure this topic exists to prevent. Scenario 6 (Structured Data Extraction) is the canonical setting.

---

## Aggregate accuracy metrics may mask poor performance on specific document types/fields

A single headline number — "97% accuracy on the validation set" — is the most dangerous metric in a production extraction pipeline. It's an **average across a non-uniform population**, and averages mathematically *hide* the worst-performing slice when that slice is small. If 95% of incoming documents are clean PDF invoices at 99%, and 5% are scanned faxes at 60%, your aggregate is `0.95 × 0.99 + 0.05 × 0.60 ≈ 96.95%` — rounding up to "97% accuracy" while one in twenty real documents is wrong almost half the time.

The same dynamic applies at the **field level**: aggregate field accuracy is dominated by easy fields (sender name, doc date) and dilutes hard ones (line-item totals, tax codes, party addresses on amendments). Concrete example: a contracts pipeline reports 98% accuracy in production. A targeted review by document type reveals NDAs at 99.4%, MSAs at 98.1%, and **amendment-to-MSA at 71%** — a tiny segment by volume, but every amendment that auto-ships wrong is a contractual integrity bug.

> **Common pitfall** — treating aggregate accuracy as a sufficient signal to automate. The aggregate tells you the *average* customer experience; the **worst segment** tells you your worst-case failure rate, and that's what production risk is actually about.

**Quick recall**
- **Q:** Why can a 97% aggregate accuracy still be unsafe to automate on? → It's an average; a small, hard segment can run at 60% while the headline number stays high because the easy majority dominates.
- **Q:** What slices must you break the aggregate down by? → Document type **and** field — the union is what reveals segment failure.

---

## Stratified random sampling for ongoing error rate measurement

Once a pipeline is in production, you can't review everything — but you also can't stop reviewing, because the population shifts: a new template arrives, a vendor changes layout, an upstream OCR step degrades. **Stratified random sampling** keeps continuous, statistically credible eyes on every segment without paying full-review cost.

The mechanic: partition incoming extractions into **strata** along the dimensions you care about — typically `document_type × field` — and **sample randomly within each stratum** so every stratum gets coverage proportional to your *risk budget*, not its volume share. The crucial inversion vs uniform sampling: **rare, high-risk segments get over-sampled**, because uniform sampling almost never lands enough cases in a 2%-volume stratum to detect a regression.

Concrete example: 10,000 daily extractions, of which 200 are amendment-to-MSA. Uniform 1% sampling reviews 100 documents, of which only 2 are amendments — far too few to catch a 71% accuracy run. A stratified plan that allocates 30 of the 100-review budget to amendments gives you enough power to detect a real regression and surface **novel error patterns** specific to that doc type.

> **Common pitfall** — using uniform random sampling and concluding "we measured error rate." You measured the *aggregate* error rate; you almost certainly under-sampled the rare segments where errors actually concentrate.

**Quick recall**
- **Q:** What's the strata you partition on? → `document_type × field` (and often × confidence bucket).
- **Q:** Why is uniform random sampling insufficient? → It under-samples rare segments — exactly the segments most likely to be regressing — and produces no statistical power to detect their error rate.

---

## Field-level confidence scores calibrated using labeled validation sets

Asking the model "how confident are you in this field?" and getting back `0.95` is a **starting point**, not an answer. The number out of the model is just a self-reported probability, and self-reported confidence from LLMs is famously **uncalibrated** — the model claims 0.95 on cases it's actually right 70% of the time, and 0.99 on cases where it's mid-hallucination. Until you've **calibrated** it against ground truth, the score is decorative.

**Calibration** means: take a **labelled validation set**, bucket the model's confidence outputs (e.g. `[0.5–0.7, 0.7–0.9, 0.9–0.95, 0.95–0.99, 0.99+]`), and compute actual accuracy in each bucket. A well-calibrated score has 0.95-confidence cases right ~95% of the time. If the curve is off — 0.95 → 70% real accuracy is the most common pattern — you build a **calibration map** from raw to calibrated probability and **route on the calibrated number**, not the raw one.

Critically, calibration must be done **per document type and per field**. Example: in a contracts pipeline, raw 0.97 confidence on NDA effective dates corresponded to 96% real accuracy; the same raw 0.97 on amendment effective dates corresponded to 64% — same model, same prompt, different segment, completely different meaning of "0.97."

> **Common pitfall** — using raw self-reported confidence as a routing threshold. Without a labelled validation set behind the score, "high confidence" means the model is confidently asserting something — not that it's likely correct.

**Quick recall**
- **Q:** What does it mean for a confidence score to be calibrated? → Cases at confidence X are actually correct ~X% of the time, verified against labelled ground truth.
- **Q:** What artifact do you build calibration on? → A labelled validation set, bucketed by confidence; calibration is computed per `document_type × field`, not globally.

---

## Validate accuracy by document type and field segment before automating

The decision to **reduce or eliminate human review** is the riskiest step in the pipeline lifecycle — it's where aggregate metrics get weaponised. The exam-tested rule: **don't automate on the aggregate** — validate every `(document_type, field)` segment first, and only automate segments that pass the bar **on their own**.

Operationally: compute accuracy in every `(document_type, field)` cell on the labelled validation set and apply a **per-cell** threshold (e.g. 99% for high-stakes fields, 95% for low-stakes). Any cell below threshold stays in human review regardless of the aggregate. The pipeline runs in mixed mode — auto-ship for cells that meet the bar, human review for cells that don't.

Concrete example: aggregate validation accuracy is 98%. A cell-level breakdown shows 14 cells at ≥99%, 2 cells at 92–94%, and 1 cell (`amendment × effective_date`) at 71%. Automating on the aggregate ships that 71% cell. The right move is to automate the 14 strong cells, leave the 3 weaker cells in human review, and report **per-cell** accuracy in the rollout doc.

> **Common pitfall** — "the aggregate hit our 95% bar so we shipped." That sentence is the canonical exam wrong answer; the right move is segment-level validation before any automation decision.

**Quick recall**
- **Q:** What's the validation unit before automating? → Each `(document_type, field)` cell, against its own threshold — never the aggregate.
- **Q:** What do you do with cells that fail their threshold? → Leave them in human review; automate only the cells that pass on their own.

---

## Routing low-confidence or contradictory extractions to human review

Human reviewers are scarce and expensive — the design goal is to **point them at exactly the cases that need them** and let the rest auto-ship. The two routing signals that matter, together, are **calibrated confidence** (per field) and **internal contradiction** (within the document or across fields).

**Low calibrated confidence** is the obvious one: if the calibrated probability that `line_item_total` is correct is 0.78 and the auto-ship bar is 0.97, route to human. **Contradictions** are subtler: line items sum to $1,200 but the extracted footer says $1,250 — fields **disagree among themselves**. That's a strong signal something is wrong even when each individual field came back high-confidence — high confidence on a wrong reading is exactly what calibration alone doesn't catch.

The combined production rule: **route to human if** (calibrated confidence < threshold) **OR** (any pairwise contradiction between fields that should reconcile). Auto-ship only when **both** are clean. Reviewers' time concentrates on cases where the model *or* the document is genuinely ambiguous — the Pareto-optimal use of the human budget.

> **Common pitfall** — routing only on confidence. A model can be confidently wrong on each individual field of a self-contradictory document; without a contradiction check, those slip through with no review.

**Quick recall**
- **Q:** What two signals determine the human-review queue? → Calibrated confidence below threshold, **OR** internal contradiction between fields that should reconcile.
- **Q:** When does an extraction auto-ship? → When **both** are clean: confidence above threshold **and** no contradictions.

---

## Anti-patterns

- ❌ **Automating on aggregate accuracy.** "We hit 97% on validation, switch off human review." Aggregate hides the 60%-accurate rare segment.
- ✅ **Validate every `(document_type, field)` cell against its own threshold; only automate cells that pass on their own.**
- ❌ **Uniform random sampling for ongoing error measurement.** Under-samples rare segments — exactly where errors hide.
- ✅ **Stratified random sampling by `document_type × field`, with rare/high-risk strata over-sampled relative to volume.**
- ❌ **Routing on raw self-reported model confidence.** Uncalibrated 0.95 may correspond to 70% real accuracy.
- ✅ **Calibrate confidence on a labelled validation set, per doc type and per field; route on the calibrated number.**
- ❌ **One global confidence threshold across all fields and document types.** Calibration is segment-specific; one threshold mis-routes everywhere.
- ✅ **Per-`(document_type, field)` thresholds derived from segment-level calibration.**
- ❌ **Routing only on confidence, ignoring internal contradictions.** A document that disagrees with itself can yield high-confidence-but-wrong fields.
- ✅ **Route on `low_confidence OR contradiction`; auto-ship only when both are clean.**
- ❌ **Treating "the model said 95% confidence" as evidence of 95% accuracy.** It's a self-report; without calibration it's noise.
- ✅ **Treat raw confidence as input to a calibration map; report and route on the calibrated probability.**
- ❌ **Stopping human review entirely once aggregate is high.** Production drift (new templates, OCR changes) regresses segments silently.
- ✅ **Keep an ongoing stratified sample reviewed even after automation; that's how you detect drift early.**

---

## Worked example — Scenario S6 (Structured Data Extraction)

A team runs an extraction pipeline over commercial contracts: NDAs, MSAs, SOWs, amendments, and order forms. They report 98.2% aggregate field accuracy on a 5,000-document labelled validation set and propose auto-shipping all extractions above raw model confidence 0.9.

A reviewer asks for the **per-cell breakdown**. Across the 5 doc types × 22 fields = 110 cells, the picture is uneven: NDAs and order forms are at 99.3%+ across all fields; MSAs are 98–99% on most fields but 92% on `governing_law`; amendments are 99% on header fields but **71% on `effective_date`** and **78% on `amended_section_reference`**. The 98.2% aggregate is real — it's just dominated by NDAs (45% of volume) and order forms (30% of volume), with the amendment failures washed out. A calibration check on the raw 0.9 threshold shows NDA cells at 0.9-raw correspond to ~98% real accuracy; **amendment `effective_date` at 0.9-raw corresponds to 64%** — same model, completely different meaning of "confident."

The corrected rollout: auto-ship cells that meet a per-cell bar on calibrated confidence ≥ the cell-specific threshold; leave amendment fields and MSA `governing_law` in human review. Add a contradiction check — if extracted parties don't match the signature block, or amendment dates predate the underlying MSA, route to human regardless of confidence. Set up a stratified sample (heavy on amendments and MSA `governing_law`) for ongoing error-rate measurement. The headline drops from "98.2% — ship it" to "automation covers 84% of cells; 16% stay reviewed; we measure stratified error rates weekly" — the actually-shippable answer.

---

## Quick recall (full set)

- **Q:** Why is "97% aggregate accuracy" not a sufficient automation criterion? → It's an average; a small, hard segment can run at 60% while the aggregate stays high.
- **Q:** What's the validation unit you must check before automating? → Every `(document_type, field)` cell against its own per-cell threshold.
- **Q:** What sampling scheme keeps eyes on rare segments in production? → Stratified random sampling by `document_type × field`, with rare/high-risk strata over-sampled.
- **Q:** Why is uniform random sampling insufficient? → It under-samples rare segments — exactly the strata where errors concentrate — and gives no power to detect their regressions.
- **Q:** What does it mean for a confidence score to be "calibrated"? → Cases at confidence X are correct ~X% of the time, verified on a labelled validation set.
- **Q:** Where is calibration computed? → Per `(document_type, field)` cell, not globally — the same raw 0.95 means different things in different cells.
- **Q:** Why is raw model self-reported confidence unsafe to route on? → It's uncalibrated: 0.95 can correspond to 70% real accuracy on a hard segment.
- **Q:** Two signals that determine the human-review queue? → Calibrated confidence below threshold **OR** internal contradiction between fields that should reconcile.
- **Q:** When does an extraction auto-ship? → Both signals clean: high calibrated confidence **and** no contradictions.
- **Q:** A 5-doc-type × 22-field pipeline reports 98% aggregate. What's the next question to ask before automating? → "Show me per-cell accuracy" — surface the worst cells regardless of what the aggregate looks like.
- **Q:** What's the role of a labelled validation set? → It's the ground truth you calibrate confidence against and validate per-cell accuracy on; without it, "calibration" is just relabelling self-reports.
- **Q:** A field comes back at calibrated confidence 0.99 but the document contains an internal contradiction. Route how? → To human review — contradictions override confidence.
- **Q:** Why is one global confidence threshold across all fields wrong? → Calibration differs per cell; one threshold mis-routes some cells (over-shipping risky ones, over-reviewing safe ones).
- **Q:** What's the canonical exam-wrong-answer phrasing? → "The aggregate hit our bar so we automated."
- **Q:** What's the right post-rollout monitoring loop? → Ongoing stratified sample reviewed by humans, stratified by `document_type × field`, watching per-cell error rates over time.
