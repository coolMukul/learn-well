# Topic 4.6 — Multi-instance and multi-pass review architectures

> **Domain 4 · Prompt Engineering & Structured Output** · 20% of the exam

## Why this matters

Review is one of the highest-leverage uses of Claude — code review, structured-output validation, audit of an extracted record — but it is also the place teams most often *think* they are getting independent verification when they are not. The mistake almost always looks the same: a developer asks the same model, same conversation, to "double-check the answer it just produced." The output reads confidently. The errors persist.

The exam tests whether you understand the architecture that actually catches mistakes: a **second, independent instance** with no memory of the original generation, **multi-pass splits** that prevent attention dilution on large reviews, and **calibrated confidence reporting** so a downstream router knows which findings to trust. Scenarios 5 (CI) and 6 (Structured Data Extraction) both lean on this — getting it wrong gives you a reviewer that is loud but blind.

---

## Self-review limitations: model retains generation reasoning context

When you ask the same Claude session to review the output it just produced, you are not getting a second opinion — you are getting the **same reasoning, re-stated more confidently**. The model retains the chain of decisions that produced the answer: the implicit assumptions, the trade-offs it silently resolved, the paths it ruled out turns ago. Asked to "verify" that work, it tends to **confirm** it. The hard cases — where the original generation made a wrong call that *felt* right at the time — are exactly the ones self-review papers over, because the same prior is still active.

This is not fixed by adding "and double-check carefully" to the review prompt, by toggling extended thinking on the second turn, or by phrasing the review as "find anything wrong with the answer above." All of those still occur **inside the generation context**. The model's working state already contains the rationale; whatever it now says about that rationale is filtered through it.

A concrete example: Claude generates a SQL query that joins on `user_id` instead of `account_id` because earlier in the conversation it inferred — incorrectly — that `user_id` was the foreign key. Asked in the same session "is this query correct?", it cites that earlier inference as justification. The bug is invisible *to that session*; a fresh instance given only the schema and the requirement picks the right column on the first read.

> **Common pitfall** — Treating "ask the same model to verify" as a meaningful safety net. It is mostly **false reassurance**: perceived risk drops without the real error rate dropping, and confident-sounding self-review then suppresses later human scrutiny ("the model already checked it").

**Quick recall**
- **Q:** Why does same-session self-review under-detect errors? → The model retains the generation reasoning context and tends to **confirm** its own prior decisions rather than question them.
- **Q:** Does extended thinking on the self-review turn fix this? → No — the prior context is still in the conversation; thinking more inside that context does not produce independence.

## Independent review instances catch subtle issues that self-review misses

The fix is **architectural**, not prompting: spin up a **second Claude instance with a fresh context window** — no prior conversation, no generation history, no record of the assumptions the first instance made — and feed it only (a) the artifact under review and (b) the criteria it should evaluate against. Because the reviewer has never seen the rationale, it cannot anchor on it; it reads the artifact like a stranger would, against the spec.

In practice this means a **separate API call** (not a new turn) with its own review-framed system prompt, the deliverable as user input, and ideally the *requirements / contract / schema / test plan* the deliverable was supposed to satisfy. The reviewer can now flag mismatches the generator was structurally unable to flag: a wrong column join, a missing edge case, an off-by-one in pagination, a silently relaxed invariant.

Worth saying clearly: **independence is the value, not the count**. Two truly independent reviewers add a lot over one. Three add a little. Five fresh instances asked the same question add cost without much extra signal — they re-discover the same issues, and once you ensemble and "majority-vote," you risk *suppressing* a correct minority finding only one instance noticed. The exam-favoured posture is one strong independent pass, optionally a second for high-stakes artifacts, and stop there.

> **Common pitfall** — Believing "more reviewers = better." Past two independent passes, you hit diminishing returns; majority-vote schemes can actively **hide** real bugs that only one reviewer spotted.

**Quick recall**
- **Q:** What makes a review instance "independent"? → Fresh context — no conversation history with the generator, called as a separate request, given only the artifact and the criteria.
- **Q:** Should you run five independent reviewers and majority-vote? → No — the value is **independence**, not count; past two you get diminishing returns and majority-voting can suppress real findings.

## Multi-pass: per-file local analysis + cross-file integration to avoid attention dilution

Stuffing 14 files of a PR into one review prompt and asking for "all issues, file-level and cross-file" is the most common cause of **attention dilution**: detailed feedback on some files, superficial on others, obvious bugs missed, contradictory findings (a pattern flagged in `auth.ts` but approved in `session.ts` though the code is identical). Inside one big pass the model's attention is spread thin and inconsistent across files, and it cannot simultaneously hold "deep local correctness" and "wide cross-file relationships" in focus.

The exam-correct restructuring is a **two-tier multi-pass review**:

1. **Per-file local pass** — one focused pass *per file*, scoped to that file only. The reviewer reads carefully, evaluates against local correctness criteria (style, null-handling, error paths, function-level logic), and returns findings tagged to that file. Depth is consistent because the surface area is bounded.
2. **Cross-file integration pass** — a separate pass, given the *interfaces* and *call relationships* across the changed files (sometimes via a summary of each file's exports/contracts, plus the diff). This pass evaluates data flow, contract compatibility, transaction boundaries, and shared invariants — the things no single file can reveal in isolation.

Splitting this way fixes *both* failure modes at once: depth becomes uniform (each local pass is small) and integration issues stop being missed (they have a dedicated pass instead of competing with line-level checks). It also lets each pass use a tighter prompt — local doesn't need cross-file context, integration doesn't need style nits — keeping tokens cheap.

Wrong "fixes" the exam dangles: forcing developers to split PRs into 3–4 file submissions (shifts burden, doesn't fix architecture), upgrading the model for more context (size ≠ attention quality), running three identical passes and majority-voting (suppresses real bugs the lone reviewer caught).

> **Common pitfall** — Reaching for "bigger context window" as the fix for inconsistent multi-file review. Context size is not the bottleneck; **attention quality across that context** is, and the only reliable lever is **splitting the work into smaller, scoped passes**.

**Quick recall**
- **Q:** Why does single-pass review of a 14-file PR produce inconsistent depth and missed bugs? → **Attention dilution** — one prompt cannot simultaneously hold deep local correctness and cross-file integration in focus.
- **Q:** What is the multi-pass split? → **Per-file local pass** for line-level issues + **cross-file integration pass** for data flow, contracts, and shared invariants.

## Calibrated confidence reporting per finding

When a reviewer returns "this function double-frees the connection," the next decision — auto-block, comment for human review, ignore — depends on how much you trust *that specific finding*. Asking the model for a free-form confidence label ("high / medium / low") is cheap to add and **almost always uncalibrated**: the model says "high" on findings right 60% of the time *and* on findings right 95% of the time, and downstream you cannot tell which.

Calibration is the property that **the stated probability matches the empirical hit rate**. A "high confidence" finding from a calibrated reviewer should be right ~90%+ of the time *over many cases*; "low" maybe ~50–60%. You don't get this for free. You get it by:

1. Defining the buckets concretely in the prompt ("high = you would stake a paid alert on it; medium = worth a human glance; low = pattern-match only, may be a false positive").
2. **Validating** against a labeled set: take a sample of past reviews, score them, and check whether each bucket's empirical accuracy matches its label. If "high" is right only 70% of the time, the reviewer is over-confident — re-prompt or re-bucket until the numbers line up.
3. Using the calibrated label to **route**: high-confidence findings can auto-comment or auto-block; medium routes to a human; low gets logged but doesn't surface unless reinforced.

Without that validation step, the confidence numbers are decorative. The exam-tested intuition: a self-reported confidence score from an LLM is **not calibrated by default** — treating it as if it were is a Domain 4 anti-pattern (Q2 from the sample question bank pins this exact trap on a self-reported confidence routing scheme).

> **Common pitfall** — Wiring auto-block thresholds to a raw model-reported confidence score without first measuring calibration on labeled data. The thresholds will fire on uncalibrated noise; you'll either spam alerts or silently miss real issues.

**Quick recall**
- **Q:** What does "calibrated" confidence mean? → The stated probability **matches the empirical hit rate** — a "high confidence" finding is actually right ~90%+ of the time across many cases.
- **Q:** Is LLM self-reported confidence calibrated by default? → **No.** It must be validated against labeled data and re-bucketed until the empirical rates match the labels.

---

## Anti-patterns

- ❌ **Self-review in the same session.** Same reasoning context — mostly confirms itself.
- ✅ **Independent instance, fresh context, given only the artifact + criteria.**
- ❌ **"Add 'double-check carefully'" or extended thinking on the verify turn.** Both still operate inside the generation context.
- ✅ **Separate API call, no prior history — independence is architectural, not prompted.**
- ❌ **One big review pass over a 14-file PR.** Inconsistent depth, missed bugs, contradictory findings — attention dilution.
- ✅ **Per-file local pass + separate cross-file integration pass.**
- ❌ **"Switch to a larger-context model" to fix inconsistent multi-file review.** Context size doesn't solve attention quality.
- ✅ **Split the work into smaller scoped passes.**
- ❌ **Three identical runs, majority-vote.** Suppresses real bugs only one reviewer caught; redundant cost.
- ✅ **One (or for high stakes, two) truly independent passes — independence, not count.**
- ❌ **Wiring auto-block thresholds to raw self-reported confidence.** Uncalibrated scores → spam or silent misses.
- ✅ **Validate confidence labels on labeled data, re-bucket until empirical rates match, then route.**
- ❌ **Forcing developers to split PRs to "help the reviewer."** Shifts burden upstream; doesn't fix the review architecture.
- ✅ **Restructure the *review* into per-file + integration passes; leave PR shape alone.**

---

## Worked example — Scenario 5 (Continuous Integration)

A team's CI pipeline runs Claude as the automated PR reviewer. The failing pattern:

- A single prompt with all changed files concatenated; the bot then asks Claude (same session) "are you sure?" before posting; auto-block fires on any "high" confidence finding.

Three things were wrong, one per subtopic:

1. **Self-review in-session** — the "are you sure?" turn never disagreed because the original reasoning was still in context. They had a confirmation step, not a verification step.
2. **Single-pass over many files** — the 14-file review showed textbook attention-dilution: detailed feedback on `auth.ts`, three-line skim of `session.ts`, a duplicate pattern flagged in one file and approved in another.
3. **Uncalibrated auto-block** — sampling showed "high" was right only ~62% of the time, so ~four in ten auto-blocks were false positives and developers learned to ignore the bot.

The restructuring: replace same-session "are you sure?" with a **second independent instance** (fresh context, only the diff + checklist); replace the one big pass with **N per-file local passes** plus **one cross-file integration pass** with interface summaries; **validate** the confidence buckets against a labeled sample and re-prompt until "high" hits ~90%, then route high → block, medium → comment, low → log. Cost rises modestly; false-positive rate falls hard; developer trust recovers.

---

## Quick recall (full set)

- **Q:** Why does same-session self-review under-detect errors? → The model retains the generation reasoning context and confirms its prior decisions.
- **Q:** Does adding "double-check carefully" or turning on extended thinking fix self-review? → No — both still occur inside the generation context; independence has to be architectural.
- **Q:** What makes a review instance "independent"? → A separate API call, fresh context, given only the artifact and the review criteria.
- **Q:** Two reviewers vs five? → The value is **independence**, not count. Past two, diminishing returns and majority-vote can suppress real findings.
- **Q:** What is "attention dilution"? → The failure where one big multi-file pass produces inconsistent depth, missed bugs, and contradictory findings.
- **Q:** Multi-pass restructure for a 14-file PR? → **Per-file local pass** for line-level issues + **cross-file integration pass** for data flow / contracts / invariants.
- **Q:** Why isn't "switch to a larger-context model" the fix for inconsistent multi-file review? → Context size isn't the bottleneck; attention quality is. The fix is splitting the work.
- **Q:** Why isn't "three identical passes, majority-vote" the fix? → Majority-voting suppresses real bugs only one reviewer caught; identical passes aren't truly independent.
- **Q:** Why isn't "force PRs to be 3–4 files" the fix? → Shifts burden to developers; doesn't fix the review architecture.
- **Q:** What does "calibrated confidence" mean? → The stated label matches the empirical hit rate (e.g., "high" right ~90%+).
- **Q:** Is LLM self-reported confidence calibrated by default? → No. Validate on labeled data and re-bucket.
- **Q:** First step before wiring auto-block to "high confidence"? → Validate calibration on a labeled sample.
- **Q:** Why is "ask the same model to verify" a Domain 4 anti-pattern? → False reassurance — the verifier confirms rather than catches, then suppresses later human scrutiny.
- **Q:** What does the cross-file integration pass examine? → Data flow, interface/contract compatibility, transaction/invariant boundaries — what no single-file pass can reveal.
- **Q:** Multi-instance vs multi-pass? → **Multi-instance** = independence (fresh reviewer, separate from generator). **Multi-pass** = decomposition (split big review into scoped passes). Usually used together.
