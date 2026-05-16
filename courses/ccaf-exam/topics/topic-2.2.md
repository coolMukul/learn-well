# Task 2.2 — Structured error responses for MCP tools

> **Domain 2 · Tool Design & MCP Integration** · 18% of the exam
>
> _First study 2026-05-02. Source: `reference/sections/task-2.2.md` plus glossary entries on the MCP `isError` flag._

## Why this matters

Errors are the most common reason an agent loop derails. Tools fail constantly — networks blip, validation rejects malformed input, business rules block an action, the customer simply has no orders matching the query. If every failure reaches the model as the same opaque "Operation failed" string, the agent cannot tell whether to retry, ask a clarifying question, escalate, or report a clean negative result. Structured error responses let the agent **make a recovery decision instead of guessing**.

The exam tests this in two shapes: (a) "the agent retries forever / gives up too soon / surfaces a wrong message — what's the structural fix?" and (b) "subagent X failed; what should the coordinator see?" Both answers come back to a **typed error envelope** with `isError`, an `errorCategory`, an `isRetryable` flag, partial results when available, and a human-readable description.

---

## MCP isError flag pattern

The Model Context Protocol defines a top-level `isError` boolean on tool responses. On failure, a tool returns a normal-shaped response whose `isError` is `true` and whose `content` carries the error payload — it does **not** throw an exception. The model receives the failure as a regular `tool_result` and reasons about it on the next turn. Without `isError`, an "error" is just unstructured text in a content block and the agent has to parse natural language to detect a failure (same anti-pattern Task 1.1 warns about for `stop_reason`).

A minimal MCP tool error response:

```json
{
  "isError": true,
  "content": [{"type": "text", "text": "{\"errorCategory\":\"transient\",\"isRetryable\":true,\"message\":\"Order service timed out after 5s\"}"}]
}
```

The `isError: true` is the **machine-readable signal** that this is a failure; the structured payload inside `content` is what lets the model decide *what to do about it*.

**Common pitfall:** returning a 200-shaped response whose `content` is a string like `"Error: timeout"`. The harness can't tell it's an error, retry middleware is blind, and the model only finds out by reading prose. Always set `isError: true` for failures.

**Quick recall**
- **Q:** What does `isError: true` do? → Signals to the harness and the model that the tool call failed, so the response is delivered as an error `tool_result` rather than a normal one.

## Transient vs validation vs business vs permission errors

The exam treats these as the **four canonical error categories**, mapping directly to four different recovery strategies. Knowing the category is what lets the agent pick the right next move.

- **Transient** — the operation could succeed if retried. Network timeouts, upstream `503`, rate-limit responses, lock contention. Recovery: **retry with backoff**, ideally inside the subagent.
- **Validation** — the input was malformed. Missing required field, wrong type, invalid format, out-of-range value. Recovery: **produce a corrected call**; retrying the same input is guaranteed to fail.
- **Business** — the input is well-formed but the operation is **not allowed by policy**. Refund exceeds cap, order past return window, account suspended. Recovery: **explain / escalate** — retrying is futile.
- **Permission** — the caller (this agent, role, scope) is not authorized to invoke this tool or read this resource. Recovery: **escalate or use a different tool**; do not retry, do not silently fall through.

A `process_refund(order_id='O-991', amount=750)` call could see all four:

| Failure | Category | Right next move |
|---|---|---|
| Refund service returned `503` | Transient | Retry with backoff inside the subagent. |
| `amount` was sent as the string `"$750"` | Validation | Reformat to `750.0` and retry. |
| Refund cap is $500; this is $750 | Business | Hand off to `escalate_to_human` with structured payload. |
| API key lacks `refunds:write` scope | Permission | Stop calling this tool; escalate or report capability gap. |

**Common pitfall:** treating validation errors as transient and burning retry budget on them, or treating business errors as transient and hammering a refund call. Wrong category means wrong recovery.

**Quick recall**
- **Q:** Recovery for a transient error? → Retry with backoff (ideally inside the subagent before propagating).
- **Q:** Recovery for a business error? → Explain to the user / escalate; do not retry — the input is fine, the operation is just not allowed.

## errorCategory + isRetryable structured metadata

The four categories are surfaced through two parallel fields: `errorCategory` (the four-value enum) and `isRetryable` (boolean). The redundancy is **deliberate**:

- `errorCategory` is the **semantic signal** for the model: what kind of failure is this?
- `isRetryable` is the **machine-actionable shortcut** for retry middleware. A wrapper layer (or a `PostToolUse` hook from Task 1.5) reads `isRetryable: true` and re-invokes with backoff **without consulting the model**, collapsing model-in-the-loop overhead for the common transient case.

A canonical envelope:

```json
{ "isError": true, "errorCategory": "transient", "isRetryable": true,
  "message": "Invoice service returned 503", "attempted": "get_invoice(order_id='O-991')",
  "retryAfterMs": 800 }
```

The mapping is consistent: `transient → true`; `validation → true` after reformatting (the *operation* can succeed); `business → false`; `permission → false`. **Business and permission are unambiguously `false`** — retrying a well-formed call against an unchanged policy will fail again.

**Common pitfall:** marking a business-rule rejection `isRetryable: true` because "the network is fine." Middleware loops until budget runs out. `isRetryable` is about the *operation*, not the network.

**Quick recall**
- **Q:** Why have both `errorCategory` and `isRetryable`? → `errorCategory` is the semantic signal for the model; `isRetryable` is the machine-actionable shortcut for retry middleware that wants to skip the model loop on transient failures.

## retriable: false flags + customer-friendly explanations for business rule violations

Business errors carry **two audiences' worth of content**. The agent needs structured metadata to route correctly; the customer needs a human-readable explanation that doesn't leak internals. The pattern is to include both structured fields (`errorCategory: "business"`, `isRetryable: false`, `policyCode: "REFUND_CAP_EXCEEDED"`) **and** a `customerMessage` string the agent lifts verbatim into its reply.

```json
{
  "isError": true, "errorCategory": "business", "isRetryable": false,
  "policyCode": "REFUND_CAP_EXCEEDED",
  "message": "Refund of $750 exceeds the $500 self-service cap.",
  "customerMessage": "This refund needs manager approval because the amount is over our self-service limit. I'll transfer you to a specialist who can help.",
  "recommendedAction": "escalate_to_human"
}
```

The combination of `isRetryable: false` and a `recommendedAction` is what the exam calls a **non-retryable error with a customer-friendly explanation**. Without `isRetryable: false`, retry middleware loops uselessly. Without `customerMessage`, the agent invents a natural-language reply and may leak the cap value, the policy code, or jargon ("REFUND_CAP_EXCEEDED occurred").

**Common pitfall:** returning only the structured fields and trusting the model to author a customer-friendly message. Phrasing drifts — some replies say "self-service cap," others "internal limit," one leaks the policy code. Provide `customerMessage` and the wording stays on-brand.

**Quick recall**
- **Q:** Why include both `policyCode` and `customerMessage`? → The agent uses structured fields to route (e.g., escalate); it lifts `customerMessage` verbatim so customer-facing wording is deterministic and on-brand.

## Local recovery in subagents before propagating to the coordinator

In a coordinator–subagent system (Task 1.2 / 1.3), every error has a choice: **resolve it here** or **bubble it up**. The rule: subagents handle transient errors locally (retry with backoff, try an alternate source, fall back to a cached result) and only propagate what they could not resolve — and when they propagate, they include **partial results** and **what was attempted**.

The reason is context economy. A subagent that hits a 503, retries, and succeeds does not need to mention the 503 — the coordinator's context stays clean. A subagent that bubbles up every transient blip forces the coordinator into the retry-decision business, and synthesis context fills with operational noise instead of findings.

When a subagent does have to propagate, the envelope should be **structured and informative**:

```json
{
  "isError": true, "errorCategory": "transient", "isRetryable": false,
  "subagent": "search_subagent",
  "attempted": ["news_search('AI regulation EU 2025')", "industry_db.lookup(...) — 503 after 3 retries"],
  "partialResults": [{"source": "news_search", "items": 4, "summary": "..."}],
  "alternatives": ["archive.fetch with broader date range", "skip and annotate coverage gap"]
}
```

The coordinator now has enough to decide: take the partial results and annotate the gap (Task 5.3 / 5.6), retry through a different subagent, or ask the user. It is **not** stuck choosing between "fail the whole report" and "silently lose the missing source."

**Common pitfall:** subagents propagating every error verbatim, forcing the coordinator into the retry-decision business. Local recovery first; propagate only the residual — and always with `partialResults` and `attempted`.

**Quick recall**
- **Q:** When should a subagent propagate to the coordinator? → Only when local recovery (retry, alt source, fallback) didn't work — and the envelope must include `partialResults` and what was `attempted`.

## Distinguishing access failures from valid empty results

This is the exam's favourite 2.2 trap. Two situations look identical to a sloppy tool:

- **Access failure:** the query couldn't run — auth was denied, the upstream was down. The "no results" the agent sees is a *blind spot*, not a finding.
- **Valid empty result:** the query ran successfully and the answer really is "nothing matched." The customer has no orders. The search had no hits.

A tool that returns `[]` for both destroys the agent's ability to reason. Treat every `[]` as "no orders" and a customer with three unreadable orders gets told they have none. Treat every `[]` as an access failure and you retry pointlessly on customers who really have no orders.

The fix is a **typed empty-vs-error distinction**:

```json
// Valid empty — the query ran, the answer is empty.
{ "isError": false, "results": [], "queryExecuted": true, "matchCount": 0 }

// Access failure — the query did NOT run.
{ "isError": true, "errorCategory": "transient", "isRetryable": true,
  "message": "Order index returned 503", "queryExecuted": false }
```

The `isError: false` + `queryExecuted: true` + `matchCount: 0` triple is the canonical "valid empty" signal. `isError: true` + `queryExecuted: false` is the canonical "I don't know — retry or escalate." The agent reads these and behaves correctly: report `"You have no orders matching that description"` in one case, retry / escalate / annotate gap in the other. The distinction also propagates to **synthesis** (Task 5.6) — a research subagent returning `[]` undifferentiated leads to a confidently-wrong report claiming nothing was published on the topic.

**Common pitfall:** the tool author writes `try: return backend.query() except: return []`. The bare `except` silently collapses every failure into a valid-empty result. Always re-raise as a structured error envelope; never let `[]` represent both "no matches" and "the query blew up."

**Quick recall**
- **Q:** Why is `[]` for both "no matches" and "query failed" dangerous? → The agent cannot distinguish a real negative ("no orders") from a blind spot ("lookup failed"); both lead to confidently-wrong replies and may suppress correct escalations.
- **Q:** Signals that make "valid empty" unambiguous? → `isError: false`, `queryExecuted: true`, `matchCount: 0`, versus `isError: true` + `queryExecuted: false` for an access failure.

---

## Anti-patterns

- ❌ **Generic "Operation failed" responses.** All four categories collapsed to one string. The agent cannot pick a recovery and usually retries blindly or escalates indiscriminately.
- ✅ **Return a typed envelope with `errorCategory`, `isRetryable`, and a specific `message`.**
- ❌ **Missing `isError` flag.** Error inside a normal-shaped response. The harness sees a success, retry middleware doesn't fire, metrics undercount failures.
- ✅ **Always set `isError: true` on failures so the harness and model can detect them structurally.**
- ❌ **`isRetryable: true` on business errors.** Middleware loops on a call whose policy will not change; budget burns, user waits.
- ✅ **Mark business and permission errors `isRetryable: false` — only transient (and reformatted-validation) is retryable.**
- ❌ **Bare `[]` for both "no matches" and "lookup failed."** Causes confidently-wrong replies in one direction and pointless retries in the other.
- ✅ **Distinguish with `isError: false` + `queryExecuted: true` vs `isError: true` + `queryExecuted: false`.**
- ❌ **Silently swallowing exceptions: `try: ... except: return []`.** The error becomes invisible to the agent and to monitoring.
- ✅ **Re-raise as a structured error envelope with category, retryability, and message.**
- ❌ **Subagent bubbles every error to the coordinator.** Coordinator context fills with retry chatter and becomes the retry coordinator instead of the synthesis coordinator.
- ✅ **Handle transient errors locally (retry, alt source, fallback); propagate only the residual.**
- ❌ **Propagating an error string with no `partialResults` or `attempted`.** Coordinator must choose between failing the whole workflow and pretending the gap doesn't exist.
- ✅ **Always include `partialResults` and `attempted` in propagated error envelopes.**
- ❌ **Authoring customer wording on the fly per error.** Phrasing drifts; replies leak internal codes ("REFUND_CAP_EXCEEDED occurred").
- ✅ **Provide a `customerMessage` field the agent lifts verbatim into its reply.**
- ❌ **Validation errors with no field detail.** Forces the model to re-derive the entire call.
- ✅ **Name the offending field and the expected shape so the model can reformat and retry.**

---

## Worked example — Scenario 1 (Customer Support Resolution Agent)

A customer says: "Refund my last order — the totals don't add up." The agent calls `lookup_order(customer_id='C-48201', recent=True)` and could hit three failures:

1. **Upstream index briefly down.** Tool returns `{ isError: true, errorCategory: "transient", isRetryable: true, queryExecuted: false }`. The order subagent retries with backoff, succeeds on the second attempt, returns the order. The coordinator never sees the 503. *(Local recovery in the subagent.)*
2. **Customer genuinely has no recent orders.** Tool returns `{ isError: false, results: [], queryExecuted: true, matchCount: 0 }`. The agent says "I don't see any recent orders — could you share an order number?" rather than "lookup failed, please retry." *(Valid empty distinction.)*
3. **Refund attempted at $750, cap is $500.** `process_refund` returns `{ isError: true, errorCategory: "business", isRetryable: false, policyCode: "REFUND_CAP_EXCEEDED", customerMessage: "...", recommendedAction: "escalate_to_human" }`. The agent reads `recommendedAction`, calls `escalate_to_human` with a structured handoff payload (Task 1.4), and lifts the verbatim `customerMessage` into its reply. *(Business error with `isRetryable: false` + `customerMessage`.)*

The wrong-answer set the exam offers typically combines: (a) "wrap all errors in a single retry loop" (kills business errors), (b) "have the agent author a polite explanation" (leaks codes), and (c) "let the subagent return `[]`" (loses the access-vs-empty distinction). All lose to the structured-envelope answer.

---

## Quick recall (full set)

- **Q:** What does the MCP `isError` flag do? → Signals failure to the harness and the model; without it, errors are unstructured text and the agent must parse natural language to detect failure.
- **Q:** Four canonical error categories? → Transient, validation, business, permission.
- **Q:** Recovery move for each? → Transient: retry with backoff. Validation: reformat and retry. Business: explain / escalate; do not retry. Permission: escalate or use a different tool; do not retry.
- **Q:** Why pair `errorCategory` with `isRetryable`? → `errorCategory` is the semantic signal for the model; `isRetryable` is the machine-actionable shortcut so retry middleware can act without invoking the model.
- **Q:** Two fields a business-error envelope needs that a transient one doesn't? → `policyCode` (stable identifier) and `customerMessage` (deterministic on-brand wording the agent lifts verbatim).
- **Q:** When should a subagent propagate to the coordinator? → Only when local recovery (retry, alt source, fallback) didn't work — and the envelope must include `partialResults` and `attempted`.
- **Q:** Signals that distinguish valid empty from access failure? → Valid empty: `isError: false`, `queryExecuted: true`, `matchCount: 0`. Access failure: `isError: true`, `queryExecuted: false`, plus `errorCategory` and `isRetryable`.
- **Q:** Why is `try: ... except: return []` a 2.2 anti-pattern? → It silently collapses every failure into a valid-empty result, so the agent can't tell "no matches" from "lookup blew up."
- **Q:** Why is `isRetryable: true` on a business error harmful? → Middleware loops on a call whose policy will not change; budget burns, user waits, eventual response is the same denial.
