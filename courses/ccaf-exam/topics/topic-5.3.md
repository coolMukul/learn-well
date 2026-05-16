# Topic 5.3 — Error propagation across multi-agent systems

> **Domain 5 · Context Management & Reliability** · 15% of the exam

## Why this matters

In a single-agent loop, errors are easy: a tool call fails, the model sees the error, decides what to do next. The moment you introduce a coordinator and subagents, you have a **second contract** — what does a subagent return when something goes wrong, and how does the coordinator decide whether the workflow can still produce useful output?

Almost every Domain 5 question in Scenario S3 (Multi-Agent Research System) hinges on this. The exam tests four moves and their inverses: **structured error context** vs generic "unavailable" statuses; **distinguishing access failures from valid empty results** vs conflating them; **local recovery in subagents** vs propagating every transient blip to the top; and **coverage annotations on synthesis** vs silent gaps in the final report.

The connecting thread: a multi-agent workflow is a **partial-credit** system. One subagent failing should never throw away the work of the other three; one source 503-ing should never produce the same output as one source legitimately returning zero matches. Treat each error as data the coordinator can reason about, not as an exception to be caught and discarded.

## Structured error context: failure type, attempted query, partial results, alternatives

When a subagent can't fully complete its task, **what it returns determines what the coordinator can do**. The contract that enables intelligent recovery is a **structured error payload** with at minimum four fields: the **failure type** (timeout, auth, 503, rate limit, parse error, etc.), the **attempted query** (so the coordinator can modify it), any **partial results** that did come back, and **alternative approaches** the subagent recommends (narrower query, cached snapshot, different subagent).

A concrete example: the web-search subagent in Scenario S3 times out researching "GDPR impact on UK fintechs 2024." Instead of returning `{"status": "search unavailable"}`, it returns `{"failure": "timeout_after_retries", "query": "GDPR UK fintech 2024", "partial": [first 3 hits], "suggestions": ["narrow to Q1 2024", "use cached snapshot"]}`. The coordinator now has actionable choices: synthesise with the partial 3 hits and flag the gap, retry with a narrower query, or hand the suggestion to a different subagent. Generic "search unavailable" forces the coordinator to retry blindly or give up.

> **Common pitfall** — treating errors as a single boolean ("did the subagent succeed?") when the coordinator's recovery space is much richer than that. The four-field payload is the minimum that lets the coordinator make real decisions.

**Quick recall**
- **Q:** Four fields a structured error payload should carry? → Failure **type**, **attempted query**, any **partial results**, and **alternatives** the subagent suggests.
- **Q:** Why is "search unavailable" insufficient? → It hides the failure type, the query, partial work, and alternatives — the coordinator can't recover intelligently.

## Access failure vs valid empty result distinction

A subagent that returns "no results" is communicating one of two **fundamentally different** outcomes, and conflating them is one of the most-tested traps in this topic. An **access failure** is a 503, an auth error, a timeout, a rate-limit — the source could not be queried successfully, so the answer is unknown. A **valid empty result** is a successful query that returned zero matches — the answer is known and the answer is "nothing exists."

The recovery is different. For an access failure, the coordinator should retry, fall back to an alternative source, or annotate the synthesis as having a gap ("this topic could not be researched because the source was unreachable"). For a valid empty result, the coordinator should treat the absence as a **finding** ("our search found no peer-reviewed studies on this combination") — that's a real answer worth reporting. If you collapse both into `results: []`, the synthesis agent confidently writes "there is no evidence of X" when the truth is "we couldn't reach the source that would have evidence of X."

The minimal fix is a discriminated tag in the return: `{"outcome": "empty", "results": []}` vs `{"outcome": "access_failure", "failure_type": "503", "results": []}`. The coordinator branches on `outcome`; the synthesis agent treats each path correctly.

> **Common pitfall** — a subagent's `try`/`except` that swallows a timeout and returns `[]` to look "successful." The synthesis agent then claims absence of evidence as evidence of absence.

**Quick recall**
- **Q:** A search returns `[]`. What two distinct situations does that conflate? → A successful query with **zero matches** (real finding) and an **access failure** that returned no rows (unknown answer).
- **Q:** Why is the distinction load-bearing for synthesis? → "We found nothing" and "we couldn't look" warrant different sentences in the report and different downstream actions.

## Anti-patterns: silent error suppression and whole-workflow termination

Two equally bad failure modes sit at opposite extremes, and the exam likes to put both options on the same multiple-choice question.

**Silent suppression**: a subagent catches every exception and returns "success" with empty or fabricated data. The synthesis agent has no idea anything failed, so the final report confidently states things based on missing inputs — a **biased output** with no warning label. This is worse than the original error because the failure is now invisible to anyone downstream, including the human reading the report. The fingerprint: a `try`/`except` that returns `{"status": "ok", "results": []}` when the underlying call raised.

**Whole-workflow termination**: a single subagent's exception bubbles up to a top-level handler that aborts the entire workflow. Three subagents finished successfully, the fourth timed out, and now you throw away the **good work of the other three** instead of producing a partial report. This is the "let it crash" instinct misapplied — in a multi-agent system, individual subagent failures are an expected, recoverable event class, not a process-ending one.

The right shape is **structured propagation with partial preservation**: the failing subagent returns a structured error to the coordinator, the coordinator collects what succeeded, and synthesis produces an annotated output that includes the partial evidence and explicitly flags what's missing.

> **Common pitfall** — picking "raise an exception, let the coordinator deal with it" on an exam question. That phrasing usually means *abandon* the partial work; the desired pattern is preserve-and-annotate, not raise-and-abort.

**Quick recall**
- **Q:** Why is silent error suppression worse than a visible error? → It produces biased output the synthesis agent treats as complete; the failure becomes invisible to downstream consumers.
- **Q:** What's wrong with terminating the whole workflow on one subagent's failure? → It throws away the successful work of the other subagents instead of producing a partial-but-annotated result.

## Local recovery in subagents; propagate only what can't be resolved

Subagents are **specialists**, and the failure modes they understand best are inside their own domain. The web-search subagent knows that a 429 can be retried after backoff and that a timeout on one provider can be retried against a fallback. The document-analysis subagent knows that a malformed PDF can be retried with a different parser. **Push that recovery logic into the subagent**, not the coordinator.

The rule: subagents try in-house alternatives first; only the **unresolvable residue** propagates upward. Two reasons. The coordinator lacks the domain expertise to retry intelligently — it would be guessing at what alternatives even exist for "search timeout." And propagating every transient blip pollutes the coordinator's context, defeating the point of delegation.

A good propagation looks like: "tried primary provider, hit 503, retried twice with backoff, fell back to secondary, hit 429, retried, still failed. Here's the partial data from the first provider and a suggestion to try the cached snapshot." That tells the coordinator exactly what's been done — no wasted retry of work the subagent already did.

> **Common pitfall** — building "thin" subagents that pass every exception straight up. The coordinator now needs a retry matrix per subagent type, which is exactly the encapsulation failure delegation was meant to avoid.

**Quick recall**
- **Q:** Where should retry/backoff for transient subagent failures live? → **Inside the subagent** — it has the domain knowledge for which alternatives are reasonable.
- **Q:** What does the coordinator receive after a subagent has exhausted local recovery? → A **structured error** describing what was tried and what residue remains unresolved, plus any partial results worth using.

## Coverage annotations on synthesis output (well-supported vs gaps)

When the synthesis agent stitches results from multiple subagents into a final report, the consumer needs to know **how confident each claim is**. The mechanism is **coverage annotations** — explicit markers on each finding that indicate the underlying source support.

The minimal annotation tags each claim with something like `support: 3 sources, primary` vs `support: 1 source, secondary` vs `support: 0, source unreachable, gap`. The output is no longer flat narrative — it's narrative with provenance attached. Consumers can then **calibrate**: a well-supported claim can be quoted, a one-source claim hedged, a gap flagged for manual follow-up.

This is the counterpart to the access-failure-vs-empty distinction. An access failure maps to "gap due to unavailable source," not "no evidence." A valid empty maps to "search executed, no results found" — a real but weaker finding. Synthesis that concatenates results into uniform-confidence prose launders upstream uncertainty into false confidence.

A worked annotation: *"GDPR's effect on UK fintechs in 2024 [well-supported: 4 primary sources]. Q4 enforcement statistics [gap: regulator.gov.uk unreachable]. EU-only enforcement trend [partial: 1 secondary source]."* The reader acts on each sentence with the right level of trust.

> **Common pitfall** — synthesising as if every input were equally reliable. Without coverage annotations, a one-source guess looks identical to a four-source consensus on the page.

**Quick recall**
- **Q:** What are coverage annotations? → Per-claim markers on synthesis output indicating how many/what kind of sources support the claim, including explicit "gap" tags for areas where sources were unreachable.
- **Q:** Why are coverage annotations the right destination for upstream access failures? → They surface the gap as a labelled limitation rather than letting it disappear into uniform-confidence prose.

## Anti-patterns

- ❌ **Returning `{"status": "search unavailable"}`** as a generic error status. Hides failure type, attempted query, partial results, and alternatives — coordinator can't recover intelligently.
- ✅ **Return a structured payload**: `{failure_type, attempted_query, partial_results, suggested_alternatives}`.
- ❌ **Catching exceptions in subagents and returning `{"results": [], "status": "ok"}`.** Silent suppression — synthesis treats absence of failure as confirmation of absence of evidence.
- ✅ **Surface the failure with a discriminated outcome**: `outcome: "access_failure"` vs `outcome: "empty"`.
- ❌ **Letting one subagent's exception terminate the whole research workflow.** Throws away other subagents' completed work.
- ✅ **Coordinator catches the structured error, preserves the other agents' results, and synthesis produces an annotated partial report.**
- ❌ **"Raise the exception, let the coordinator handle it"** as the entire propagation strategy. Abandons partial work the subagent already produced.
- ✅ **Preserve-and-annotate**: subagent returns whatever partial data it gathered alongside the structured error.
- ❌ **Conflating an access failure with a valid empty result.** Synthesis writes "no evidence found" when the truth is "couldn't look."
- ✅ **Tag the outcome explicitly so synthesis can phrase it correctly and annotate coverage.**
- ❌ **Thin subagents that propagate every transient 429/timeout straight up.** Forces the coordinator to micro-manage retries it doesn't have domain knowledge for.
- ✅ **Local recovery in the subagent**; propagate only what the subagent couldn't resolve in-house.
- ❌ **Synthesis that produces uniform-confidence prose regardless of upstream coverage.** Launders one-source guesses into the same register as four-source consensus.
- ✅ **Coverage annotations on each finding** — well-supported, partial, gap — so downstream consumers can calibrate.

## Worked example — Scenario S3 (Multi-Agent Research System)

A coordinator dispatches four subagents to research "GDPR's impact on UK fintech compliance costs in 2024": web-search, document-analysis, statistics-extraction, and a regulator-database querier.

The web-search subagent hits a primary-provider 503, retries with backoff in-house, falls back to a secondary provider, hits a 429, retries, still fails. Local recovery is exhausted. It returns a structured error: `{"failure_type": "all_providers_exhausted", "attempted_query": "...", "partial_results": [3 hits before primary failed], "suggested_alternatives": ["narrow to Q1 2024", "use cached snapshot"]}`.

Document-analysis succeeds with four parsed regulator documents. Statistics-extraction queries the FCA's public stats API successfully and returns **zero rows** — the API responded, no 2024 data published yet. It returns `{"outcome": "empty", ...}` — explicitly a *valid empty*. Regulator-database times out and, after local retries, returns a structured access-failure payload.

The coordinator does **not** abort. It dispatches synthesis with all four payloads. The final report tags the four parsed documents as "[well-supported: 4 primary sources]"; the partial web-search hits as "[partial: 3 secondary sources]"; the FCA absence as "[finding: no 2024 enforcement data published]"; and regulator-db as "[gap: source unreachable]" with the suggested follow-up.

Compare to the broken alternative: silent suppression turns the 503 into "no relevant articles found," the timeout into "no enforcement actions on record," and synthesis confidently outputs a clean-looking report that's actually badly wrong.

## Quick recall (full set)

- **Q:** Four fields in a structured subagent error payload? → **Failure type**, **attempted query**, **partial results**, **alternative suggestions**.
- **Q:** Why is "search unavailable" too generic? → It hides everything the coordinator needs to recover intelligently.
- **Q:** Two distinct outcomes that both look like "no results"? → **Access failure** (couldn't query) and **valid empty** (queried successfully, zero matches).
- **Q:** What's the recovery difference between them? → Access failure → retry, fall back, or annotate as gap. Valid empty → report as a real finding.
- **Q:** Why is silent error suppression an anti-pattern even though the workflow keeps running? → Synthesis produces biased output as if everything succeeded; the failure is invisible to downstream consumers.
- **Q:** Why is whole-workflow termination on one subagent failure also wrong? → It throws away the successful work of the other subagents.
- **Q:** What's the correct shape between those two extremes? → **Structured propagation with partial preservation** — surface the failure but keep partial results.
- **Q:** Where should retry/backoff for transient failures live? → Inside the **subagent** — it has the domain knowledge.
- **Q:** What does the coordinator receive after a subagent has exhausted local recovery? → A structured error describing what was tried, the residue, and any partial results.
- **Q:** What are coverage annotations on synthesis output? → Per-claim labels indicating support level (well-supported, partial, gap).
- **Q:** Where do upstream access-failure gaps belong in the synthesis output? → Tagged as **gaps** in the coverage annotations, not collapsed into uniform-confidence prose.
- **Q:** Why is "raise the exception, let the coordinator handle it" usually wrong on the exam? → Phrasing implies abandoning partial work; correct pattern is preserve-and-annotate.
- **Q:** A subagent returns `{"status": "ok", "results": []}` after a timeout. What's the bug class? → **Silent error suppression** — biased output downstream.
- **Q:** A coordinator aborts the workflow because one subagent exception bubbled up. What's the bug class? → **Whole-workflow termination on single failure** — wasted partial work.
- **Q:** A regulator API returns 0 rows on a successful query. How should that be reported in synthesis? → As a **finding** ("search executed, no records published"), distinguished from an access failure.
