# Topic 4.4 — Validation, retry, and feedback loops

> **Chapter 4 · Prompt Engineering & Structured Output** · 20% of the exam

## Why this matters

Tool-use plus a JSON Schema (Topic 4.3) eliminates one class of failure: malformed JSON. What it cannot eliminate is the harder class — extractions that are well-formed but **wrong**: a field value that contradicts another, a "total" that doesn't match its line items, a piece of information the model invented because it wasn't in the source. Topic 4.4 is the layer that catches these defects after the schema has done its job, and decides what to do about them.

The exam tests three reflexes here. First, what a **useful retry** looks like — the original document, the failed extraction, and the specific validation error, all in one follow-up — versus the cargo-cult "retry three times with no error context." Second, **when retry is structurally hopeless** — the field doesn't exist in the source — so you don't burn turns coaxing data out of nothing. Third, that you design **semantic validation** (cross-field math, contradiction detection, `detected_pattern` for FP analysis) as a first-class part of the prompt. Scenario 6 (Structured Data Extraction) leans on every one of these reflexes.

## Retry-with-error-feedback: original doc + failed extraction + specific errors

The single most important shape on this topic is the retry payload. When the first extraction fails validation, the follow-up is not "try again" — it is a structured re-prompt with **three things**:

1. **The original document** — the issue may be a misread, not a hallucination, so the model needs to re-read the source.
2. **The failed extraction** — so the model can diff its own prior attempt against the source.
3. **The specific validation error** — "Field `invoice_date` failed regex: expected `YYYY-MM-DD`, got `04/15/2026`", not "extraction was invalid".

A worked example: an extraction returns `{ "total": "$1,234.56" }`, but the schema requires `total` to be a number. The retry payload contains the invoice text, the failed JSON, and the error `total: expected number, got string "$1,234.56"`. The model's next attempt strips the `$` and the comma, returning `1234.56`. One retry, one fix.

Without the error the model is guessing what's wrong; without the original document it can't verify against the source. Either it accepts its own prior output (hallucinated values stay hallucinated) or invents something new — both worse than the original failure.

> **Common pitfall** — Retrying with only the error message ("validation failed: total"), or only the document and the prompt, or just bumping temperature and hoping for a different roll of the dice. Each of these omits one of the three required inputs. The model gets faster *only* when it can see the document, its prior output, and the specific delta the validator wants closed.

**Quick recall**
- **Q:** What three inputs must a retry-with-error-feedback payload contain? → The **original document**, the **failed extraction**, and the **specific validation error**(s).
- **Q:** Why include the failed extraction (not just the error)? → So the model can diff its prior attempt against the document and the error message, instead of starting from scratch.

## Limits of retry: ineffective when info is absent from source (vs format errors)

Retries are **not magic**. They fix problems whose root cause is that the model emitted the wrong shape of an answer it actually had — typos, wrong types, wrong nesting, missing optional fields it could have filled. They do **nothing** for problems whose root cause is that the answer **isn't in the source** to begin with.

Concretely: if a vendor invoice doesn't print a purchase-order number anywhere, retrying ten times with sharper error messages will not surface one. The model will either keep returning `null` (correct), or — worse, if you push harder — start **hallucinating** a plausible PO number to satisfy the validator. The retry didn't make the data appear; it pressured the model into making something up.

The right diagnostic is: **"Does the source contain the information?"** If yes → format/structural error → retry-with-error-feedback. If no → information-absent → retry is futile and possibly harmful; surface `null` (or `missing_field: ["po_number"]`) and let the downstream system decide whether to fetch from another source, prompt a human, or accept the gap.

> **Common pitfall** — Treating "validator failed" as a single category and routing every failure into the retry loop. Format errors are recoverable; missing-information errors are a data problem, not a prompt problem. Pushing retries against a missing-info case wastes tokens and elevates hallucination risk because each retry's "stronger" prompt nudges the model toward inventing the field.

**Quick recall**
- **Q:** Field `po_number` is required by your schema, but the invoice text genuinely doesn't include one. What does retrying achieve? → Nothing useful; at worst it pressures the model to hallucinate a plausible PO number. Surface the absence and decide downstream.
- **Q:** Diagnostic to decide if retry is worth attempting? → "Is the information **present** in the source?" Format mismatch → retry; information absent → don't.

## detected_pattern field for systematic FP analysis

`detected_pattern` is a small structural addition with outsized leverage on the **operations** side of an extraction system. The idea: alongside the extracted finding (or flagged issue, or low-confidence value), the model also emits a short, **stable categorical label** that names *why* the model produced this finding — the construct or signal it keyed off.

Concrete example from a code-review extractor: a finding `{ severity: "high", category: "sql_injection" }` carries `detected_pattern: "string_concatenation_in_query_builder"`. When the team triages and dismisses 200 findings over a sprint, you can group by `detected_pattern` and discover 40 of them — 20% — share the same pattern, all in a wrapper module that already escapes inputs. That's a **systematic false-positive class**. Update the prompt (or add a few-shot example) and 40 future FPs vanish in one edit.

Without `detected_pattern` you have a flat list of dismissals and no statistical view of *why*. You'd group by hand — slow, biased, irreproducible. With it, FP analysis becomes a `GROUP BY` over the findings store. The same idea applies to invoice extraction (`detected_pattern: "shipping_listed_as_line_item"`) and any surface where developers triage outputs.

> **Common pitfall** — Adding free-form `notes` or `reason` strings instead of a stable enum-like `detected_pattern` label. Free-form strings vary by run and don't aggregate; the whole point of the field is that **identical patterns produce identical labels** so they group cleanly.

**Quick recall**
- **Q:** What's the purpose of a `detected_pattern` field on extraction outputs? → To capture a stable categorical label for **why** the model produced the finding, enabling systematic false-positive analysis by grouping dismissals across runs.
- **Q:** Why a stable label instead of a free-form `reason` string? → Stable labels aggregate (`GROUP BY pattern`); free-form strings don't, so you can't see "20% of FPs share pattern X."

## Semantic validation: calculated_total vs stated_total, conflict_detected booleans

A schema can check shape; it cannot check **meaning**. If an invoice schema requires `subtotal: number, tax: number, total: number`, the model can return `{ subtotal: 100, tax: 10, total: 999 }` and pass schema validation cleanly — even though the math is wrong. **Semantic validation** is the layer that catches these meaning-level defects.

Two patterns dominate the exam. First, **dual extraction with cross-checking**: extract both `stated_total` (the number printed on the document) and `calculated_total` (the sum of line items the model extracted). The validator compares the two; if they disagree, it flags the discrepancy or kicks off a retry that includes both numbers in the error message. This catches OCR errors, hand-edited invoices, and the model's own arithmetic mistakes — none of which the schema sees.

Second, **explicit conflict booleans**: `conflict_detected: true` plus `conflict_description: "stated subtotal $100 disagrees with line items summing to $105"`. The model is allowed to extract conflicting source data, but the schema forces it to **declare** the conflict instead of silently picking one side. Downstream code routes conflict cases to human review while accepting clean extractions automatically. The same shape generalizes — `start_date < end_date` boolean, `currency_consistent` across line items, etc.: wherever two extracted fields encode the same fact, a semantic check belongs in the validator.

> **Common pitfall** — Trusting any single extracted "total" because the schema accepted it. The schema only checked it was a number. **Semantic correctness is the validator's job, not the schema's**, and dual extraction + cross-check is the cheapest way to get it.

**Quick recall**
- **Q:** Why does extracting both `calculated_total` and `stated_total` add value over extracting just `total`? → It lets the validator detect arithmetic conflicts inside the document (or model misreads) that a single-field schema check can never see.
- **Q:** A document genuinely contains contradictory data. Better design: silently pick one side, or flag `conflict_detected: true`? → **Flag it.** Letting downstream code decide preserves auditability; silently picking hides the conflict and is unrecoverable later.

## Self-correction validation flows

Tying the previous four ideas together: a self-correction flow is a **deterministic outer loop** that runs **extract → validate → if fail, feed validation result back as retry context → re-extract**, and stops when validation passes or a small attempt cap is hit.

The skeleton:
1. **Extract** with the schema-bound tool.
2. **Validate**: schema (free, via tool use) then **semantic** checks (math, conflicts, business rules).
3. **Branch**: pass → return; fail → classify (format/structural → retry; information-absent → surface as missing-field, no retry).
4. **Retry payload** (retry-eligible failures only): original document + failed extraction + specific error(s). Re-extract.
5. **Cap**: typically 1–3 retries. After the cap, surface to a human or downstream queue.

Two notes the exam likes. First, the loop is **deterministic code**, not an inner agentic loop — one focused question per pass, no tool orchestration. Second, the **classification step** is where most production quality lives: it's what prevents missing-info failures from triggering hallucination-pressuring retries.

> **Common pitfall** — Wrapping retries around the *whole* prompt without classifying the failure type, or capping retries based on a token budget rather than a clear "this isn't recoverable" signal. The cap is a circuit-breaker; the **classification** is the actual decision-maker.

**Quick recall**
- **Q:** What are the steps of a self-correction validation flow? → Extract → validate (schema + semantic) → on fail, classify (format vs missing-info) → retry-with-error-feedback only on format → cap and surface after N retries.
- **Q:** Why is the retry decision based on failure **classification**, not just failure presence? → Because retry helps for format errors but is futile (and hallucination-inducing) for missing-information errors; the classification is what prevents the wrong response.

## Anti-patterns

- ❌ **Retrying with only "validation failed, try again."** Strips the model of the diff signal; second attempt has no more information than the first.
- ✅ **Send the original document, the failed extraction, and the specific error in the retry payload.**
- ❌ **Retrying a missing-information failure to "force" the field.** Best case still null; worst case hallucinated value that satisfies the validator and corrupts downstream data.
- ✅ **Classify failures: format → retry; missing-info → surface `null` / `missing_field` and stop.**
- ❌ **Bumping temperature on retry to "get a different answer."** Adds variance instead of addressing the root cause.
- ✅ **Include the validator's specific error so the model knows the exact delta to close.**
- ❌ **Free-form `notes` or `reason` strings for FP analysis.** Don't aggregate; can't drive systematic prompt fixes.
- ✅ **Stable `detected_pattern` enum-like labels so identical patterns group cleanly.**
- ❌ **Trusting a single `total` because the schema accepted it.** Schema only checked the type; the value can still be wrong.
- ✅ **Dual extraction (`stated_total` + `calculated_total`) plus cross-check; flag mismatches with `conflict_detected`.**
- ❌ **Silently picking one side of contradictory source data.** Hides the conflict; downstream consumers can't audit.
- ✅ **Make the model declare contradictions (`conflict_detected: true` + description); route to human review.**
- ❌ **Capping retries at "5" because tokens are cheap.** Mostly burns tokens on cases retry can never fix.
- ✅ **Cap at 1–3 and only after classifying the failure as retry-eligible.**

## Worked example — Scenario S6 (Structured Data Extraction)

A vendor invoice arrives. Schema requires `vendor`, `invoice_date` (YYYY-MM-DD), `subtotal`, `tax`, `total`, `line_items[]`, `po_number?`, plus semantic fields `calculated_total` and `conflict_detected`.

**Pass 1.** Returns `{ ..., invoice_date: "04/15/2026", subtotal: 100, tax: 10, total: 110, calculated_total: 110, po_number: null, conflict_detected: false }`. Schema fails: `invoice_date` doesn't match the regex. **Classification:** format error (date is in the source, just wrong shape). **Retry payload:** original document + Pass-1 extraction + error `"invoice_date: expected YYYY-MM-DD, got '04/15/2026'"`. **Pass 2** returns `"2026-04-15"`; schema passes; `calculated_total === stated_total` ✓; done.

Now the **missing-info variant**: `po_number` is `null` and required. Classification: information-absent — the invoice never printed one. Retrying either keeps returning `null` (good) or eventually hallucinates a plausible number (bad). Right move: surface `missing_field: ["po_number"]` and stop, *not* retry. And the **semantic-conflict variant**: if Pass 1 had returned `total: 110, calculated_total: 105`, the validator flags the discrepancy and the retry payload includes `"calculated_total (105) != stated_total (110)"` so the model re-reads line items and reconciles — or sets `conflict_detected: true` if the source genuinely disagrees.

## Quick recall (full set)

- **Q:** Three required inputs in a retry-with-error-feedback payload? → **Original document**, **failed extraction**, **specific validation error(s)**.
- **Q:** Why include the failed extraction, not just the error? → So the model can diff its own prior attempt against the source and the error, instead of starting cold.
- **Q:** When are retries structurally ineffective? → When the required information is **absent from the source**; retrying can't make it appear and pressures the model toward hallucination.
- **Q:** Diagnostic for "is this retry-eligible?" → "Is the information present in the source?" Yes → format error, retry. No → missing-info, surface and stop.
- **Q:** Why isn't "raise temperature" a valid retry strategy? → It adds variance without addressing the root cause; the validator's specific error is the actual signal the model needs.
- **Q:** Purpose of a `detected_pattern` field? → A stable categorical label for **why** the model produced a finding, enabling systematic FP analysis by grouping dismissals.
- **Q:** Why a stable label instead of free-form `reason`? → Stable labels aggregate (`GROUP BY`); free-form strings don't, so you can't quantify FP classes.
- **Q:** What does semantic validation catch that schema validation can't? → Cross-field math, contradictions, business rules — *right shape, wrong meaning*.
- **Q:** Why extract both `calculated_total` and `stated_total`? → To detect arithmetic conflicts (OCR errors, misreads) that a single-field schema check would silently accept.
- **Q:** Value of `conflict_detected: true` over silently picking a side? → Auditability — downstream consumers see the contradiction; silent picks are unrecoverable later.
- **Q:** Five steps of a self-correction flow? → Extract → validate (schema + semantic) → classify → retry-with-error-feedback (format only) → cap-and-surface.
- **Q:** Why is **classification** the heart of the loop, not the cap? → The cap is a circuit-breaker; classification prevents missing-info failures from triggering hallucination-pressuring retries.
- **Q:** Typical retry cap? → 1–3 attempts; the goal is fixing recoverable format errors, not brute-forcing absent data.
