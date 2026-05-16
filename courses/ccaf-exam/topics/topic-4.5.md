# Topic 4.5 — Batch processing strategies

> **Domain 4 · Prompt Engineering & Structured Output** · 20% of the exam

## Why this matters

Batch processing is one of the few Domain 4 topics where the wrong choice immediately costs either money or a deadline. The Message Batches API is **~50%** cheaper than sync, but bundled with two exam-tested characteristics: **no latency SLA**, and a processing window **up to 24 hours**. Pick the right workload and you bank the discount. Pick the wrong workload — a pre-merge check where a developer is staring at a PR — and the build hangs.

The trade-off has four moving parts the exam quizzes on: is the workload **blocking or non-blocking**, does any request need **multi-turn tool calling**, how do you correlate responses to inputs (`custom_id`), and how often must you submit to honour an SLA? Scenarios 5 (CI/CD) and 6 (Structured Data Extraction) both exercise these.

---

## Message Batches API: 50% cost, ≤24h processing window, no SLA

The **Message Batches API** submits many independent requests in one job and returns results asynchronously. Headline numbers: **~50% cost savings** versus the sync API, processing window **up to 24 hours**, **no guaranteed latency SLA**. Most batches finish faster, but Anthropic does not commit to any specific delivery time, and you must design as if the 24-hour upper bound is what you'll get.

The mental model: 24h is an **upper bound, not a guarantee, not an expected time**. A batch that finished in 90 minutes yesterday can take 23 hours tomorrow. Any plan that depends on "batches usually finish in N minutes" will eventually break.

**Concrete example.** A team migrates a nightly classification job (1M docs) expecting "a few hours" — dev runs were fast. One night the batch lands at hour 23 and the morning dashboard misses. Fix: submit earlier so the **24h worst case still lands before deadline**, or move the deadline to "by mid-morning."

**Common pitfall** — Treating the 24-hour window as the **expected** delivery time and scheduling jobs that just barely fit. Real plans use it as an upper bound and add buffer.

**Quick recall** — Cost: ~50% vs sync. Window: up to 24h, **no SLA** — upper bound, not guarantee.

## Appropriate for non-blocking workloads (overnight reports, weekly audits)

Batch is the right tool when **nothing is waiting** on any individual response. Canonical fits: **overnight reports**, **weekly audits**, nightly **eval runs**, periodic **technical-debt scans**, bulk **document classification**, offline **dataset labeling**. The shared property: the consumer is a dashboard the next morning or a scheduled downstream job, not a synchronous caller blocked at a UI spinner.

A useful triage question: **if every response arrived 23 hours late, would anyone notice?** If honestly no, batch is appropriate. If honestly yes — a developer, an end user, an SLA timer — it's a sync workload.

**Concrete example.** A finance team runs a weekly compliance audit over 50k transactions for Tuesday's 10am meeting. Submitting Monday morning gives a full day of slack vs the 24h worst case, costs half as much as sync, and nobody cares whether the result landed Monday or Tuesday — only that it's ready.

**Common pitfall** — Reaching for batch when volume is large. The criterion is **latency tolerance**, not volume.

**Quick recall** — Fits: non-blocking, latency-tolerant work (overnight reports, weekly audits, eval runs). Triage: "If every response arrived 23h late, would anyone notice?" No → batch.

## Inappropriate for blocking workflows (pre-merge checks)

Batch is **wrong** any time a human or downstream system is **blocked waiting** on a specific response. The textbook bad fit is a **pre-merge check** — a developer has a PR open, the CI hook needs go/no-go in seconds-to-minutes, and substituting batch turns "merge in 30 seconds" into "maybe by tomorrow." Same logic kills batch for **interactive chat**, **live customer support**, **synchronous API gateways** under HTTP timeouts, and **first-contact resolution** flows where a user is on the line.

The trap that catches candidates is **mixing**: "we'll switch both — overnight report and pre-merge check — for 50% savings on both." The right answer switches **only** the non-blocking workload. The pre-merge check stays sync; savings come from the half of traffic that genuinely doesn't care about latency.

**Concrete example.** A platform team proposes routing every Claude call through batches "for cost savings." The PR-review path flags security issues in 30 seconds and gates merging. Migrating it makes the merge gate "up to 24 hours, no SLA" — developers disable it or wait, and savings get eaten by lost engineering time. Decision: keep PR review sync; migrate the **nightly tech-debt scan** to batches.

**Common pitfall** — Adding a "timeout fallback to sync if the batch runs long." Adds complexity, double-charges (you paid for the abandoned slot), and still doesn't beat plain sync's worst case.

**Quick recall** — Pre-merge checks block a developer; "up to 24h, no SLA" is incompatible with merge-gate latency. Mixed-workload trap: batch the report only; keep the PR check sync.

## Does NOT support multi-turn tool calling within a single request

A subtle but heavily tested limit: the Batches API **does not support multi-turn tool calling within a single request**. You cannot have a batched request that calls a tool, gets a result, calls another tool, and produces a final answer — the orchestration loop driving that requires the **sync API**, where your code runs between turns and feeds `tool_result` blocks back.

You can include `tools` in a batched request and have the model emit `tool_use` blocks once, but **you can't execute those tools and feed results back inside the same batched job**. So if your workload is "ask Claude to search the web, then synthesise the result" — that's a multi-turn loop, and it belongs on sync.

**Concrete example.** A team thinks: "Our nightly research uses tools — let's batch for 50% savings." The workflow is a loop: Claude calls `web_search`, you run it, append, Claude calls `fetch_page`, you run it, Claude synthesises. **Batch can't execute tools mid-request**, so the loop never advances past turn one. Right move: keep the loop on sync, or **decompose** — pre-fetch all the data with deterministic code, then **batch the final single-turn synthesis** that doesn't need tools.

**Common pitfall** — Assuming "supports tools" means "supports tool-use loops." Batched requests can include tool definitions, but no orchestration happens inside the batch.

**Quick recall** — Multi-turn tool-use in one batched request: **no**, loops need sync. To still batch a tool-using overnight workflow: deterministic pre-fetch + single-turn batched synthesis.

## `custom_id` for request/response correlation

Batches return results **asynchronously and unordered**, so every request carries a `custom_id` you set, and Anthropic echoes it back on the matching response. **Without `custom_id` you can't reliably correlate which response belongs to which input** — there's no guaranteed input-order preservation in the response file, so positional matching is unsafe.

Common choices: a database row ID, a document hash, a UUID — anything stable and unique. The other major use is **failure-mode resubmission**: if 3 of 50,000 requests fail, the response file tells you exactly which `custom_id`s failed. You **chunk and resubmit only those three** — not the entire batch.

**Concrete example.** A nightly extraction batches 100k invoices with `custom_id: "invoice-{db_id}"`. The morning sees 99,997 successes and 3 failures (oversized PDFs). The pipeline identifies the failed `db_id`s, **chunks the 3 oversized inputs**, resubmits as a tiny follow-up with new `custom_id`s like `"invoice-{db_id}-chunk-1"`, and merges. No need to re-run the 99,997 successes.

**Common pitfall** — Relying on response order matching submission order. The API doesn't guarantee this; positional matching produces silently misaligned results.

**Quick recall** — `custom_id`: caller-supplied identifier echoed back so you can correlate response to input. Failure flow: resubmit only the failed `custom_id`s (often chunked), never the whole batch.

## Submission cadence math for SLAs (e.g., 4-hour windows for 30-hour SLA)

When a customer-facing SLA is in play (e.g., "results within 30 hours of submission"), you cannot submit one giant batch and hope. If a batch takes the full 24h, every request submitted at hour zero gets its result at hour 24 — and any request that arrived **at hour 6** but rode the same batch waits **30 hours total**. To honour a 30h SLA with up-to-24h batches, you submit in **rolling windows** small enough that the oldest queued item never exceeds `SLA − batch_worst_case`.

**The math.** Worst-case end-to-end = queue wait (until next submission) + processing (24h worst case). For a 30h SLA: `30h − 24h = 6h` of slack, so submit no less often than every **~4–6 hours**. The reference excerpt names **4-hour windows** as the canonical answer for a 30-hour SLA — a small buffer below the worst case.

**Concrete example.** A vendor promises "results within 30 hours of upload." Submitting every **4 hours**: an upload arriving 1 minute after a submission waits 4h queued + 24h = 28h, inside 30h. A daily batch instead: an upload arriving just after submission waits 24h + 24h = 48h, **blowing the SLA by 18h**.

**Common pitfall** — Sizing cadence by traffic volume rather than SLA arithmetic. Right cadence keeps `queue_wait + batch_worst_case ≤ SLA`, regardless of volume.

**Quick recall** — SLA 30h, batch worst case 24h: max interval ~6h; canonical 4h with buffer. Daily batch under a 30h SLA: an item arriving just after submission waits 24h queued + 24h processing = 48h.

## Pre-batch prompt refinement on samples to maximize first-pass success

Because a failed batch can cost a 24-hour cycle, you do **not** debug prompts at full batch scale. The disciplined pattern is **pre-batch refinement**: pull a representative **sample** (often 10–100 items), iterate the prompt synchronously until first-pass success is high, then submit the full batch. Prompt iteration is cheap; **24-hour cycles are not**.

What "first-pass success" means depends on the workload: schema-valid JSON for extraction, correct categories for classification, no false refusals for content review. Whatever the metric, you measure it on the sample, fix the issues (clearer instructions, better examples, schema tightening), and only then commit.

**Concrete example.** A team batches 200k documents through a JSON-extraction prompt without sampling. **18% fail schema validation** because "include the issue date" is ambiguous when documents have multiple dates. Fixing and re-running costs another 24-hour cycle. Right sequence: sample 50 documents sync, observe the date ambiguity, refine to "the *publication* date as printed on the cover page," re-sample to confirm 95%+, **then** batch the 200k.

**Common pitfall** — "I'll just batch it and see." Burns a 24-hour cycle on errors a 10-minute sample run would have surfaced.

**Quick recall** — A bug found post-batch costs another 24-hour cycle; sampling catches it in minutes. Typical sample: 10–100 items, sync speed.

---

## Anti-patterns

- ❌ **Treating "up to 24h" as expected delivery.** Plans that just barely fit the upper bound break when worst case happens.
- ✅ **Treat 24h as a worst-case bound; add buffer.**
- ❌ **Switching a blocking pre-merge check to batches for cost savings.** The 50% discount is moot when developers can't merge.
- ✅ **Keep blocking workflows on sync; batch only the non-blocking siblings.**
- ❌ **Wrapping a multi-turn tool-use loop in a batched request.** Batch can't run tools mid-request.
- ✅ **Keep tool-use loops on sync; or decompose into deterministic pre-fetch + single-turn batched synthesis.**
- ❌ **Relying on response order matching submission order.** Silently misaligns results.
- ✅ **Always set a unique `custom_id`; correlate by it.**
- ❌ **Resubmitting an entire batch when only a handful failed.**
- ✅ **Resubmit only the failed `custom_id`s, chunked or fixed.**
- ❌ **Sizing cadence by traffic volume.**
- ✅ **Submit so `queue_wait + 24h ≤ SLA` — typically every 4–6h for a 30h SLA.**
- ❌ **"I'll batch it and debug after."** A bug at full scale costs a 24-hour cycle to retry.
- ✅ **Refine on a small sync sample first; batch only after first-pass success is high.**
- ❌ **"Timeout fallback to sync" when batches run long.** Doubles cost; no worst-case improvement.
- ✅ **Choose sync or batch by the workload's blocking nature; don't fall back across modes.**

---

## Worked example — Scenario S6 (Structured Data Extraction)

A vendor extracts JSON from uploaded PDFs and promises "results within 30 hours of upload." Volume averages 200k uploads/day. A naive design submits one daily batch at 02:00 UTC. Three failures cascade:

1. **SLA breach.** An upload arriving at 02:01 UTC sits 24h queued, then up to 24h processing — 48h end-to-end, blowing the 30h SLA by 18h.
2. **Prompt bug discovered late.** A prompt change ships without sampling; the morning's batch surfaces 12% schema failures, triggering a full resubmission and another 24h wait.
3. **Tool-use mistake.** Someone proposes "batch the requests but call a `lookup_schema` tool inside each one." That's multi-turn tool-use, which **batch doesn't support** — the loop never advances.

Disciplined design:

- **Cadence by math.** Submit every **4 hours** so worst case is 4h queued + 24h processing = 28h, inside the 30h SLA.
- **Pre-batch refinement.** Any prompt change ships through a 50-document sync sample; only after first-pass success ≥95% does it go to a real batch.
- **`custom_id` for everything.** Each request carries `custom_id: "upload-{upload_id}"`. Failures are isolated by `custom_id`, **chunked**, and resubmitted as a small follow-up.
- **No tool loops in batch.** Schema lookups are pre-fetched by deterministic code; the batched request is single-turn synthesis only.
- **Pre-merge checks stay sync.** A CI workflow that lints customer integrations uses sync — developers can't wait 28 hours to merge a config change.

Result: ~50% savings on the bulk extraction, full SLA compliance, and sync only where it has to be.

---

## Quick recall (full set)

- **Q:** Cost / window? → ~50% cheaper / up to 24h, **no SLA**.
- **Q:** Workloads that fit? → Overnight reports, weekly audits, eval runs.
- **Q:** Workload that does **not** fit? → Pre-merge checks (any blocking sync flow).
- **Q:** Triage question? → "If every response arrived 23h late, would anyone notice?" No → batch.
- **Q:** Multi-turn tool-use in one batched request? → **No.** Loops require sync.
- **Q:** Batch a tool-using overnight workload? → Pre-fetch outside, single-turn batched synthesis.
- **Q:** Purpose of `custom_id`? → Caller-supplied identifier echoed back to correlate response to input.
- **Q:** 3 of 50k requests fail — what do you resubmit? → Only the failed `custom_id`s, often chunked.
- **Q:** SLA 30h, batch worst case 24h — max cadence? → ~6h; canonical 4h with buffer.
- **Q:** Daily batch under 30h SLA — why fail? → 24h queued + 24h processing = 48h.
- **Q:** Plan to "expected" batch latency? → No — plan to the 24h upper bound.
- **Q:** Refine prompts on a sample first — why? → Post-batch bug costs another 24h cycle.
- **Q:** Overnight report + blocking PR check, 50% savings everywhere — right call? → Batch the report; keep the PR check sync.
- **Q:** "Batch with sync fallback" — good design? → No — pay for the abandoned slot; no worst-case improvement vs sync.
- **Q:** Response file preserves submission order? → No. Correlate by `custom_id`.
