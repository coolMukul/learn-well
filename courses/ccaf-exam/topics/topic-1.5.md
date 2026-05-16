# Task 1.5 — Agent SDK hooks for interception and normalization

> **Domain 1 · Agentic Architecture & Orchestration** · 27% of the exam
>
> _First study 2026-04-29; revisit 2026-05-02 (rev 2): post-test refreshed with 10 fresh questions on new angles — verbose-output trimming, `PreToolUse` input modification (allow/deny/transform), the full hook lifecycle ordering, where the deny `reason` is surfaced to the model, harness-side hook enforcement vs in-tool errors, hooks for style is over-engineering, why `PostToolUse` cannot block side effects, shared-hook-with-branching vs N parallel hooks, and PII redaction at the `PostToolUse` boundary._

## Why this matters

Task 1.5 is the SDK-mechanics layer under Task 1.4. Where 1.4 told you "use programmatic enforcement when the failure rate must be zero," 1.5 tells you **which hook**, **at which point in the tool lifecycle**, and **what shape the hook returns** to make that enforcement actually happen. The exam tests this with two recurring patterns:

1. A scenario where multiple MCP tools return data in different shapes (Unix epoch from one, ISO 8601 from another, numeric status codes from a third) and the agent struggles to reason consistently. The right answer is a `PostToolUse` hook that **normalizes** results before the model sees them.
2. A scenario where the agent occasionally tries to issue a refund above a policy cap, or perform some other policy-violating action. The right answer is an outgoing-call interception hook (`PreToolUse`) that **blocks** the action and redirects to an alternative workflow (e.g., human escalation).

The two recurring wrong answers are: (a) "tighten the system prompt," which gives probabilistic compliance; (b) "ask the model to format its output more carefully," which doesn't address tool-side heterogeneity at all. Both lose to a hook every time the question is about a *guaranteed* outcome.

Hooks are also the **deterministic** half of the orchestration story for Domain 1: Task 1.4's prerequisite gates and Task 1.5's interception/normalization hooks together let you build agents that comply with policy regardless of model behaviour. If you can articulate the lifecycle (pre-call → tool execution → post-result → next model turn) and where each hook fires, you can answer most 1.5 questions cold.

---

## PostToolUse hooks for transforming tool results before the model sees them

A `PostToolUse` hook fires **after** a tool has executed and **before** its `tool_result` is appended to the conversation. The hook receives the tool input, the tool response, and session context; it can transform the response — rewriting fields, normalizing formats, trimming verbose output (Task 5.1), adding annotations — and return the transformed result. The model never sees the raw response; it sees the post-hook version.

This is the most-tested 1.5 pattern. Why? Because it solves a problem that prompts cannot solve: the **shape of the data is wrong**. No amount of "please interpret timestamps as UTC ISO 8601" in the system prompt makes a tool that returns Unix epochs change its return value. The agent ends up doing per-call format gymnastics, and consistency drops as the conversation grows.

The canonical Scenario 1 / Scenario 3 example: three MCP tools return order-related data in three different timestamp formats — `lookup_order` returns ISO 8601, `get_invoice` returns Unix epoch seconds, `get_shipment_status` returns Unix epoch milliseconds. A `PostToolUse` hook on each tool (or one shared hook that branches by tool name) normalizes everything to ISO 8601 before the model sees it. From the model's perspective, every timestamp is now in the same shape; comparisons, sorting, and arithmetic become reliable.

A simplified shape:

```python
@hook("PostToolUse", match="get_invoice")
def normalize_invoice_dates(tool_call, tool_response, session):
    if "issued_at" in tool_response:
        tool_response["issued_at"] = epoch_to_iso8601(tool_response["issued_at"])
    if "due_at" in tool_response:
        tool_response["due_at"] = epoch_to_iso8601(tool_response["due_at"])
    return {"updatedResponse": tool_response}
```

Two extras the exam likes to surface:

- **Status-code mapping.** One MCP tool returns `status: "OK"`, another returns `status_code: 200`, a third returns `status: 0` (where 0 means success). A `PostToolUse` hook collapses these into a single `status: "success" | "failure" | "partial"` enum so the model reasons over one vocabulary.
- **Trimming verbose tool output** (relates to Task 5.1). A search tool returns 40 fields; the agent only needs 5 (`title`, `url`, `snippet`, `published_at`, `id`). A `PostToolUse` hook drops the other 35 fields before they hit context. Reduces context bloat and improves attention to the relevant ones.

**Common pitfall:** trying to fix tool-output heterogeneity by prompting the model to interpret formats. The model can do it, but inconsistently — and every fresh tool call rolls the dice again. A `PostToolUse` hook makes the heterogeneity invisible to the model, which is the deterministic fix.

**Quick recall**
- **Q:** When does a `PostToolUse` hook fire? → After a tool has executed, before its result is added to the conversation. The hook can transform the result; the model only ever sees the post-hook version.
- **Q:** Canonical use cases? → Normalizing heterogeneous formats (Unix → ISO 8601, status code mapping), trimming verbose tool output, adding annotations, redacting sensitive fields.

## Outgoing tool-call interception for compliance enforcement

A `PreToolUse` hook fires **before** a tool call executes and **can deny or transform the call** based on whatever logic the hook implements. From the SDK's perspective, the model has emitted a `tool_use` block; the runtime is about to dispatch it; the hook intercepts and decides whether to allow, deny (with a reason the model sees), or modify the input.

This is the deterministic-compliance lever. Anywhere policy says "tool X must not be called when condition Y holds," a `PreToolUse` hook is the right answer. The hook is the **enforcement boundary**; the model's prompt can describe the policy in plain language but cannot guarantee compliance.

Two policy patterns dominate the exam:

- **Threshold blocks.** "Refunds above $500 require manager approval." The hook on `process_refund` checks `amount > 500` and returns a deny with a reason: "Refund amount exceeds the $500 self-service cap. Use `escalate_to_human` for review." The model reads the deny, picks up the redirect, and hands off correctly.
- **Prerequisite gates** (covered in Task 1.4 too). The hook on `process_refund` checks `session.verified_customer_id`; denies if absent with a reason that nudges the model to call `get_customer` first.

A simplified shape:

```python
@hook("PreToolUse", match="process_refund")
def cap_self_service_refunds(tool_call, session):
    amount = tool_call.input.get("amount", 0)
    if amount > 500:
        return {
            "permissionDecision": "deny",
            "reason": "Refunds over $500 require manager approval. "
                      "Call escalate_to_human with a structured handoff payload."
        }
    if not session.get("verified_customer_id"):
        return {
            "permissionDecision": "deny",
            "reason": "process_refund requires a verified customer ID. Call get_customer first."
        }
    return {"permissionDecision": "allow"}
```

Two crucial properties of the deny path:
- The **reason is shown to the model** (it appears in the next turn as a tool error / hook result), so the model can correct its course on the next turn.
- The **deny is observable** in production traces — a denied call shows up in logs, which is how you'd tune cap thresholds or detect adversarial patterns. Compare to silent prompt failures, which are invisible.

**Common pitfall:** assuming the deny reason has to be terse like an HTTP status. The reason is a hint to the model — phrase it like a corrective instruction, naming the alternative workflow. "Refund denied: amount > $500" tells the model nothing useful; "Refund over $500 requires escalate_to_human with structured handoff" tells the model exactly what to do next.

**Quick recall**
- **Q:** When does a `PreToolUse` hook fire? → Before a tool call executes; it can allow, deny (with a reason returned to the model), or modify the input.
- **Q:** What should the deny `reason` look like? → A corrective instruction that names the alternative workflow (e.g., "Use escalate_to_human"), not a terse error code. The model reads the reason on its next turn and adjusts.

## Deterministic guarantees vs probabilistic prompt compliance

This is the central exam intuition for Task 1.5 (and a callback to Task 1.4): **prompts give probabilistic compliance; hooks give deterministic guarantees.** When a question asks "which approach gives a guarantee," the answer is a hook; when a question asks "which approach is most flexible," the answer might be a prompt — but flexibility usually isn't the load-bearing requirement when the topic involves policy or compliance.

The way to read a 1.5 question is to look for the *guarantee* signal. Phrases like "must not", "in all cases", "policy requires", "above the cap", "no exceptions", "compliance audit" all point to a hook. Phrases like "should generally", "prefer", "encourage", "style" point to a prompt.

A worked decision matrix:

| Requirement | Mechanism |
|---|---|
| "Refund must not exceed $500 without manager approval." | `PreToolUse` hook on `process_refund` (deterministic). |
| "Always normalize dates to ISO 8601 in agent output." | Could be either, but if downstream systems depend on it: `PostToolUse` normalization hook (deterministic). |
| "Prefer concise, customer-friendly tone." | System prompt (probabilistic — style is fine probabilistic). |
| "Never call `process_refund` without prior `get_customer`." | `PreToolUse` gate (deterministic). |
| "Trim search results to the top 5 fields before reasoning." | `PostToolUse` hook (deterministic; saves context). |
| "Cite sources by ID when available." | System prompt + structured input format (probabilistic; not a compliance issue). |

The trap the exam sets: it offers a stronger system prompt as one of four options and a hook as another. Both will reduce the failure rate; only the hook drives it to zero. If the question stem mentions guarantees, audits, or compliance, the hook wins.

**Common pitfall:** thinking of hooks as "complicated" and prompts as "simple," and defaulting to prompts. Hooks are a small, focused unit of code per concern; they're often *less* complex than the gnarly prompt language people write to compensate for their absence. The deterministic property is worth the small upfront cost.

**Quick recall**
- **Q:** Which signal in a question points toward a hook over a prompt? → Words like "must", "must not", "guaranteed", "policy", "above the cap", "no exceptions", "compliance audit". They imply a zero failure rate, which only deterministic enforcement provides.
- **Q:** When is a prompt sufficient even though a hook would also work? → For *style* and *preference* concerns where probabilistic compliance is acceptable: tone, citation style, response length.

## Data normalization examples: Unix → ISO 8601, status code mappings

Two specific normalization patterns recur on the exam:

**1. Timestamp normalization.** MCP servers in the wild return timestamps in any of a half-dozen formats: ISO 8601 strings (`"2025-09-14T10:23:00Z"`), Unix epoch seconds (`1726309380`), Unix epoch milliseconds (`1726309380000`), human-readable strings (`"Sept 14 2025 10:23 AM"`), or relative ("2 days ago"). When a coordinator agent reasons across multiple tools, inconsistent timestamps cause subtle bugs — sorting goes wrong, "this is older" comparisons fail, the agent computes "due date" arithmetic incorrectly.

The fix is a `PostToolUse` hook that detects the format and converts to a canonical one (typically ISO 8601 UTC). A shared hook can branch by tool name (`get_invoice` vs `get_shipment_status`) or by field heuristics (numeric < 10^10 → epoch seconds; numeric < 10^13 → epoch ms; string with `T` and `Z` → ISO 8601 already).

```python
def to_iso8601(v):
    if isinstance(v, (int, float)):
        if v < 10**10: return datetime.utcfromtimestamp(v).isoformat() + "Z"
        return datetime.utcfromtimestamp(v / 1000).isoformat() + "Z"
    return v  # assume string is already ISO 8601 or pass through
```

**2. Status-code mapping.** Tools return success/failure signals in different shapes:
- HTTP-style numeric (`status_code: 200` / `404` / `500`)
- String enum (`status: "OK"` / `"NOT_FOUND"` / `"ERROR"`)
- Posix-style integer (`status: 0` for success, non-zero for failure)
- Boolean (`success: true/false`)

A `PostToolUse` hook collapses all of these to a single canonical enum (e.g., `status: "success" | "not_found" | "error" | "permission_denied"`) plus an optional `error_message` field. The model now reasons over one vocabulary and downstream synthesis (or a coordinator's gap-detection logic from Task 1.2) becomes straightforward.

The exam often mixes both into a single Scenario 3 question: "the research synthesis subagent is producing inconsistent dates and confusing 'no results' with 'access denied' (Task 5.3 callback). What's the structural fix?" Answer: a `PostToolUse` normalization layer across the search-side tools, with shared canonical timestamp and status conventions.

**Common pitfall:** trying to normalize at the synthesis stage (the agent reasoning over outputs). By the time data reaches synthesis, heterogeneity has already polluted multiple turns of context. Normalize at the source — at the `PostToolUse` boundary — so the model never sees raw heterogeneous data in the first place.

**Quick recall**
- **Q:** Two canonical normalization targets? → Timestamps to ISO 8601 UTC, and status signals to a single canonical enum (`success` / `not_found` / `error` / `permission_denied`).
- **Q:** Where in the lifecycle should normalization happen? → At the `PostToolUse` boundary, before the result is appended to the conversation. Synthesis-stage normalization is too late — heterogeneity has already entered context.

## Blocking policy violations and redirecting to alternative workflows

`PreToolUse` denies aren't just "no" — they are **redirects**. The deny `reason` is the model's next-turn input; well-written reasons name the alternative workflow that satisfies both the user's intent and the policy. This is what turns a blunt block into a productive course-correction.

A worked Scenario 1 example:

- Customer asks for a $750 refund.
- Agent attempts `process_refund({order_id: "O-991", amount: 750.00})`.
- `PreToolUse` hook fires; `750 > 500` cap. Hook returns:
  ```json
  {
    "permissionDecision": "deny",
    "reason": "Refunds over $500 require manager approval and cannot be self-served. Use escalate_to_human with a structured handoff payload (customer_id, root_cause='refund $750 exceeds self-service cap', refund_amount=750.00, recommended_action='manager review and approval')."
  }
  ```
- Model's next turn: emits `escalate_to_human(...)` with exactly the structured payload the reason described.
- Customer is told "I've routed this to a manager" rather than "your refund failed for unspecified reasons" or — worst — receiving a self-served refund that violates policy.

The redirect is what makes this pattern user-experience-coherent. Without it, the deny just looks like an internal failure to the customer. With it, the agent gracefully transfers to a human queue with all the structured context the human queue needs (Task 1.4 handoff payload).

A second redirect pattern: blocking a tool call that's about to read or expose sensitive data (e.g., a `read_pii` tool the agent shouldn't be calling for a particular role). The deny reason redirects to a sanitized alternative (`read_anonymized_summary`).

**Common pitfall:** treating blocks as terminal. The exam frames blocked tool calls as "the agent failed to help the customer" — wrong; the *agent* didn't fail, the *self-service path* failed and was correctly redirected. The block is the safety boundary; the redirect is the customer-facing recovery.

**Quick recall**
- **Q:** What makes a deny *productive* rather than just blocking? → A redirect: the deny reason names the alternative workflow (e.g., "Use escalate_to_human with a structured payload"), so the model can satisfy the user's intent through a different, allowed path.
- **Q:** Why is "the customer's refund just failed" a misframing of a successful policy block? → The self-service path failed by design; the agent must redirect to escalation, and the customer experiences a graceful handoff rather than a policy violation.

---

## Anti-patterns

- ❌ **Prompt-only enforcement of a policy that requires guarantees.** "Don't issue refunds over $500" in the system prompt with no `PreToolUse` cap. Model usually obeys; the one time it doesn't is a compliance incident.
- ✅ **Use a `PreToolUse` hook for any policy where the failure rate must be zero.**
- ❌ **Synthesis-stage normalization.** Letting heterogeneous timestamps and status codes flow through context until synthesis tries to reconcile them.
- ✅ **Normalize at the `PostToolUse` boundary so the model never reasons over inconsistent shapes.**
- ❌ **Terse deny reasons.** `{"permissionDecision": "deny", "reason": "policy"}` — model has no signal for what to do next.
- ✅ **Make the deny `reason` a corrective instruction naming the alternative workflow.**
- ❌ **Missing `PostToolUse` trim on verbose MCP tools.** Tool returns 40 fields; agent processes all 40; context bloats and attention dilutes.
- ✅ **Add a `PostToolUse` hook that trims to the 5–8 fields the model actually needs.**
- ❌ **Hooks for stylistic concerns.** Adding a `PostToolUse` hook to enforce response tone is over-engineering.
- ✅ **Use the system prompt for style/preference; reserve hooks for compliance-grade requirements.**
- ❌ **Block without redirect.** A deny that just says "no" leaves the model stuck and the customer sees an unexplained failure.
- ✅ **Pair every block with a redirect to an alternative path the model can take next turn.**
- ❌ **PostToolUse for what should be PreToolUse (and vice versa).** "Blocking" a refund in `PostToolUse` after it's executed — too late, the side effect happened.
- ✅ **Block side effects in `PreToolUse`; transform/redact results in `PostToolUse`.**
- ❌ **Identical normalization logic copy-pasted across tools.** Drift between tools, harder to audit.
- ✅ **Use one shared `PostToolUse` hook that branches by tool name — single canonical format definition.**

---

## Worked example — Scenario 1 (Customer Support) + Scenario 3 (Research)

**Scenario 1 — refund cap with redirect.**

Customer requests a $750 refund on order `O-991`. Agent has already verified identity (`session.verified_customer_id = "C-48201"` set by an earlier `PostToolUse` hook on `get_customer`). Agent emits `process_refund({order_id: "O-991", amount: 750.00})`. The `PreToolUse` hook on `process_refund` checks two preconditions:

1. `verified_customer_id` is set → ✓
2. Amount ≤ $500 cap → ✗ (750 > 500)

Hook returns deny with reason: `"Refunds over $500 require manager approval. Use escalate_to_human with a structured handoff (customer_id='C-48201', root_cause='refund amount exceeds $500 self-service cap', refund_amount=750.00, recommended_action='manager review and approval')."` Model's next turn emits exactly that escalation payload. Customer receives a graceful handoff message; manager queue receives a structured record.

The bug to watch for: a system without the cap hook would self-serve the refund. The wrong-answer set on the exam typically includes "tighten the system prompt" (probabilistic) and "add a few-shot example" (still probabilistic) — both miss the deterministic-guarantee requirement.

**Scenario 3 — normalization across heterogeneous MCP tools.**

A research coordinator (Task 1.2) has search and document subagents that call multiple MCP tools. `news_search` returns `published_at` as ISO 8601; `industry_db.lookup` returns `published_at` as Unix epoch seconds; `archive.fetch` returns `published_at` as a human-readable string. Synthesis subagent struggles to sort findings chronologically and occasionally treats older sources as more recent.

Fix: a single `PostToolUse` hook that branches by tool name (or by field heuristics) and normalizes all `published_at` values to ISO 8601 UTC before they enter context. Status fields normalized similarly: `news_search` returns `status: 200`, `industry_db` returns `status: "OK"`, `archive.fetch` returns `success: true`; all collapsed to a single `status: "success" | "not_found" | "error"` enum. The synthesis subagent now reasons over one canonical vocabulary and chronological sort works deterministically.

The bug to watch for: a coordinator that "tries to normalize during synthesis" — by then the heterogeneity has already polluted three turns of context, the synthesis prompt has to handle five formats, and bugs are subtle and intermittent.

---

## Quick recall (full set)

- **Q:** When does a `PostToolUse` hook fire? → After a tool executes and before the result is appended to the conversation; the hook can transform the result.
- **Q:** When does a `PreToolUse` hook fire? → Before a tool call executes; the hook can allow, deny (with a reason returned to the model), or modify the input.
- **Q:** What's the central distinction between hooks and prompt-based enforcement? → Hooks give deterministic guarantees (zero failure rate for the gated path); prompts give probabilistic compliance (non-zero failure rate even with strong instructions).
- **Q:** Two canonical `PostToolUse` use cases? → Normalizing heterogeneous data formats (Unix → ISO 8601, status enums) and trimming verbose tool output before it bloats context.
- **Q:** Two canonical `PreToolUse` use cases? → Threshold blocks (e.g., refunds over $500) and prerequisite gates (e.g., refund requires verified customer ID).
- **Q:** What should a deny `reason` contain? → A corrective instruction that names the alternative workflow (e.g., "Use escalate_to_human with a structured payload"), not a terse error code.
- **Q:** Why normalize at the `PostToolUse` boundary rather than at synthesis? → Synthesis-stage normalization is too late; heterogeneity has already polluted multiple turns of context. Normalize at the source so the model never reasons over inconsistent shapes.
- **Q:** Words in a question stem that point to a hook rather than a prompt? → "Must", "must not", "guaranteed", "policy", "above the cap", "no exceptions", "compliance audit." These imply a zero failure rate.
- **Q:** When is a prompt sufficient even though a hook would also work? → For *style* and *preference* concerns where probabilistic compliance is acceptable (tone, citation style, response length).
- **Q:** What's the structural problem with `{"permissionDecision": "deny", "reason": "policy"}`? → The model has no signal for what to do next. Use the reason to name the alternative path so the model can redirect (e.g., "Use escalate_to_human with these structured fields").
- **Q:** Why is a single shared `PostToolUse` hook (branching by tool name) better than N parallel hooks doing the same job? → One canonical format definition in one place — easier to evolve, easier to audit, less code drift between tools.
- **Q:** What are the three operations a `PreToolUse` hook can perform on a tool call? → Allow (let it dispatch), deny (with a reason returned to the model), or **modify** the input — for input hygiene like stripping a `$` prefix from an `amount` field.
- **Q:** What is the full lifecycle order of a tool call with hooks? → Model emits `tool_use` → `PreToolUse` hook → tool execution → `PostToolUse` hook → `tool_result` appended to conversation → next model turn.
- **Q:** Where does the model see a `PreToolUse` deny `reason` on its next turn? → Delivered as a `tool_result` (marked as an error) tied to the original `tool_use_id` — the same channel real tool results use, which is why naming the redirect there lets the model recover gracefully.
- **Q:** Why is `PostToolUse` the wrong layer to "block" side effects like a refund? → It fires after the tool has already executed; the side effect (money moved, ledger updated) has happened. Compliance enforcement that prevents side effects must live in `PreToolUse`.
- **Q:** Why is harness-side `PreToolUse` enforcement preferable to coding the policy inside the MCP tool itself? → The hook stays in one auditable place in the agent harness, evolves without redeploying MCP servers, and prevents the dispatch entirely (no network round-trip, no partial side effects).
- **Q:** When sensitive fields (e.g., SSN, address) must not enter the conversation log, where should the redaction live? → In a `PostToolUse` hook that strips those fields before the `tool_result` is appended. Prompt-based "ignoring" is probabilistic and the fields still enter context.
