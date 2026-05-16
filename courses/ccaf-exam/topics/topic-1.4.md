# Task 1.4 — Multi-step workflows: enforcement and handoff

> **Domain 1 · Agentic Architecture & Orchestration** · 27% of the exam
>
> _First study 2026-04-29: programmatic enforcement vs prompt-based ordering, deterministic compliance for sensitive operations, structured handoff payloads, parallel investigation of multi-concern requests. Built around Scenario 1 (Customer Support Resolution Agent)._

## Why this matters

Task 1.4 is where Domain 1 stops being abstract and starts touching the legal-and-compliance edge of agent design. The exam loves probing whether you can tell the difference between a prompt that *asks* the agent to verify identity before issuing a refund and a system that *cannot issue a refund* until identity has been verified. They look similar from inside the agent's transcript; they look very different in production when the agent is tested adversarially or simply confused.

Three intuitions get tested over and over:

1. **Prompt instructions have a non-zero failure rate.** "Always check the customer ID first" is policy, not enforcement. For identity verification, refunds, and any other operation where a single bad call has financial or compliance impact, ordering must be enforced **programmatically** — by hooks or prerequisite gates the agent cannot route around.
2. **Multi-concern requests need parallel decomposition, not serial firefighting.** A customer asking about a billing dispute *and* an account lockout *and* a return is three investigations sharing one context, not one long-running thread that loses scope halfway through.
3. **Handoffs to humans need a structured payload.** The next human (or system) does not have the conversation transcript. They need customer ID, root cause, recommended action, refund amount, all in a defined shape — not a paragraph of prose ending in "see chat log."

Get any of those wrong and you get the canonical Scenario 1 failure modes: refunds issued to misidentified accounts, partial resolutions that drop subsequent concerns, escalations where the human asks "wait, who is this?" Domain 1.5 (PostToolUse / interception hooks) is the immediate next layer — 1.4 establishes the pattern; 1.5 shows the SDK mechanics.

---

## Programmatic enforcement (hooks, prerequisite gates) vs prompt-based ordering

Prompt-based ordering means writing instructions in the agent's system prompt or user prompt that *tell* it which tool to call first, second, third. "Always call `get_customer` before `process_refund`. Never call `process_refund` without a verified customer ID." Programmatic enforcement means **the runtime refuses to execute `process_refund` until `get_customer` has returned a verified ID**, regardless of what the model wants to do.

The mental model is the difference between a policy poster on the wall and a locked door. The poster is useful — most well-instructed agents follow it most of the time. But "most of the time" is the load-bearing phrase, and on the exam, every time it shows up next to "identity verification" or "financial operations," the right answer is the locked door.

Concretely, programmatic enforcement uses two SDK building blocks (covered deeper in Task 1.5):
- **Prerequisite gates** — track session state and reject tool calls that violate the gate. A `process_refund` gate checks `session.verified_customer_id` and returns an error to the model if it's null.
- **Hooks** — `PreToolUse` hooks intercept tool calls *before* they execute and can deny them with a structured error the model sees and reasons about. `PostToolUse` hooks run *after* and can transform results or set session state (e.g., setting `verified_customer_id` after `get_customer` succeeds).

A simplified shape:

```python
@hook("PreToolUse", match="process_refund")
def gate_refund(tool_call, session):
    if not session.get("verified_customer_id"):
        return {
            "permissionDecision": "deny",
            "reason": "process_refund requires a verified customer ID. Call get_customer first."
        }
    return {"permissionDecision": "allow"}
```

Now the agent *can* still try to call `process_refund` first — but the runtime denies it, the model sees the deny reason, and on the next turn it correctly calls `get_customer`. The compliance guarantee is that no refund executes without verification, regardless of model behaviour.

**Common pitfall:** treating a stronger system prompt as the fix for a workflow that keeps skipping a prerequisite. The exam frames this as "we updated the prompt three times and the agent still occasionally skips identity verification." The right answer is *programmatic enforcement*, not prompt iteration. Stronger prompts reduce the failure rate; only enforcement makes it zero.

**Quick recall**
- **Q:** What's the structural difference between prompt-based ordering and programmatic enforcement? → Prompt-based ordering tells the model what to do (and the model usually obeys); programmatic enforcement is a runtime gate or hook that *prevents* a tool call from executing until prerequisites are met.
- **Q:** Two SDK primitives that implement programmatic enforcement? → `PreToolUse` hooks (deny the call before execution) and prerequisite gates (reject calls based on session state, e.g., `verified_customer_id`).

## Deterministic compliance for identity verification, financial operations

Some operations have **no acceptable failure rate**. Issuing a refund to the wrong account, transferring money based on an unverified identity claim, or processing a return without confirming the order belongs to the caller — these aren't "occasionally embarrassing"; they're financial loss, fraud exposure, and compliance violations. Prompt instructions, no matter how clear, have a probabilistic failure rate. **Probabilistic ≠ zero.** That's the gap that requires deterministic enforcement.

The exam pattern: a Scenario 1 question describes an agent that issues refunds based on names alone, or skips `get_customer` when the customer "sounds legitimate," or calls `process_refund` and `lookup_order` together without verifying that the order belongs to the customer. The diagnosis is always the same — *prompt is doing the job that enforcement should be doing*. The fix is also always the same — **add a programmatic prerequisite that blocks the sensitive tool until verification has demonstrably succeeded.**

A concrete Scenario 1 layout:

| Operation | Enforcement requirement |
|---|---|
| `get_customer(...)` | None — read-only lookup. |
| `lookup_order(order_id)` | Gate: order must belong to verified customer. |
| `process_refund(order_id, amount)` | Gate: verified customer + the order's customer matches verified ID + amount within policy. |
| `escalate_to_human(...)` | None — escalation should always be available. |

Note that the **gates compose**: `process_refund` doesn't just check verification; it checks that *this* order belongs to *this* verified customer and that the amount is within policy. Each gate is a small, deterministic check. The agent's prompt can still describe the workflow conversationally, but the gates are the actual safety boundary.

A second exam pattern worth flagging: questions that present a deterministic-compliance need and offer four options where three are prompt-engineering tweaks ("clearer instructions", "few-shot examples of correct ordering", "a stronger system prompt") and one is a hook or gate. The hook/gate is the right answer every time. The wrong answers are seductive because they really do help — but they don't drive the failure rate to zero.

**Common pitfall:** assuming deterministic-compliance failures can be solved by Domain 4 prompt engineering alone. Few-shot examples and explicit criteria reduce error rates; gates and hooks eliminate them for the operations that need elimination.

**Quick recall**
- **Q:** When is prompt-based ordering definitively insufficient? → When the operation has no acceptable failure rate (identity verification before financial operations, refunds, transfers, account changes). Prompt has non-zero failure rate; enforcement gives zero.
- **Q:** What's the canonical fix when an agent occasionally skips identity verification despite prompt instructions? → A programmatic prerequisite/hook on the sensitive tool (e.g., block `process_refund` until `verified_customer_id` is set by a successful `get_customer` call).

## Structured handoff payloads: customer ID, root cause, refund amount, recommended action

When the agent escalates to a human (or hands off to a downstream system), the receiver does **not** have the conversation transcript. Even if the transcript exists somewhere, asking a human agent to read 40 turns of dialogue to figure out what happened is both slow and unreliable — the human will skim, miss the policy nuance, and either redo work the agent already did or take the agent's framing at face value when they shouldn't.

The fix is a **structured handoff payload** with a defined shape. Every handoff carries the same fields, in the same order, with the same field names. The exam-canonical fields for Scenario 1 are:

- `customer_id` — the verified ID, not a name. Names are ambiguous; IDs aren't.
- `root_cause` — a short, plain-language reason for the escalation (e.g., "policy gap: refund amount exceeds tier-2 cap"). Not the full conversation; the *why*.
- `refund_amount` (or relevant operation amount) — the exact value if any monetary action is recommended. Numbers are unambiguous; "a small refund" is not.
- `recommended_action` — what the agent thinks the human should do next, with reasoning. Not a directive — a recommendation the human can override.

A concrete shape, emitted by the agent's `escalate_to_human` tool call:

```json
{
  "customer_id": "C-48201",
  "root_cause": "Multiple-match on order ID — two orders match customer's stated reference; cannot disambiguate without additional identifier (delivery zip or invoice date).",
  "refund_amount": null,
  "recommended_action": "Ask customer for delivery zip code, then re-attempt order lookup. If still ambiguous, defer to manual order search.",
  "transcript_summary": "3-line summary of the customer's request and steps taken so far.",
  "investigation_state": {
      "verified_customer_id": "C-48201",
      "candidate_order_ids": ["O-991", "O-992"]
  }
}
```

The point of the structure is that the receiving human (or system) reads four fields and knows exactly what to do — they don't need the transcript. `transcript_summary` is a courtesy; the *actionable* content is in the structured fields.

The exam tests two failure modes here:
- **Free-text handoffs.** The agent emits "the customer is upset and wants a refund, please help" — no customer ID, no amount, no recommended action. Receiver has to start over.
- **Identifier ambiguity.** The agent passes "John Smith" instead of `customer_id: C-48201`. Multiple John Smiths exist. The receiver picks the wrong one.

Either failure mode is a structural problem with the handoff schema, not a prompt issue. The fix: define the payload, validate it (Pydantic / JSON schema), reject incomplete handoffs.

**Common pitfall:** treating handoff as "send a message to a human" rather than "produce a structured artifact the human can act on without reading the chat." The exam draws this distinction sharply.

**Quick recall**
- **Q:** What's wrong with handing off as free-form prose? → The receiving human/system doesn't have the conversation context; prose escalations force them to re-investigate. Structured fields (customer ID, root cause, refund amount, recommended action) let them act immediately.
- **Q:** Why pass `customer_id` rather than the customer's name? → Names are ambiguous; verified IDs aren't. Name-based handoffs invite misidentified accounts at the human-handoff hop.

## Decomposing multi-concern requests into parallel investigations with shared context

Customers often arrive with **three problems in one message**: "I was charged twice for last month, my password reset email isn't coming through, and I'd like to return the headphones I bought." A naive agent treats this as one long thread and loses scope by turn ten — it solves the billing dispute and forgets the return; or it gets stuck on the password reset and never reaches the billing item.

The Task 1.4 pattern is to **decompose the request into distinct items up front**, then investigate each **in parallel** (Task 1.3 mechanics: multiple `Task` calls in one coordinator turn) with **shared context**. Shared context is the verified customer ID, the conversation summary, and any constraints — passed into each parallel subagent's invocation prompt so each sub-investigation has what it needs to operate on the right account without redoing identity verification.

A concrete shape:

1. Agent runs `get_customer` once. Verified ID lands in session state.
2. Agent decomposes the request into three items: `billing_dispute`, `password_reset`, `return_headphones`.
3. Agent emits **three Task calls in one turn**, each invoking a specialist subagent (or the same general subagent with different briefs). Each Task prompt includes:
    - The verified `customer_id` (shared context — no duplicate verification).
    - The specific concern and any details from the customer's message.
    - Tool budget and quality criteria.
4. Subagents return findings in a structured format (Task 1.3 — `{id, claim, source}` pattern adapted to support tickets: `{concern_id, status, action_taken, follow_up_required}`).
5. Agent synthesises a single response that addresses all three concerns and, if any concern needs escalation, emits a structured handoff that names *which concern* needs the human.

The contrast — the failure mode the exam tests for — is:
- **Serial firefighting.** Agent works the billing dispute to completion, then asks the customer "what was the other thing?" Now the customer has to repeat themselves; trust drops; the password reset and return get lost.
- **Re-verifying identity for each concern.** Agent calls `get_customer` three times; wastes tokens; risks treating the three concerns as if they were three different customers.

The shared-context discipline is what makes parallelism safe: each subagent gets the same verified ID, so all three resolutions are pinned to the same account.

**Common pitfall:** parallelism without shared context — each subagent re-runs `get_customer` independently, each one slightly differently, and now they're potentially operating on different account interpretations. Pass the verified ID once, in shared context; never re-verify.

**Quick recall**
- **Q:** What's the structural fix for an agent that loses track of multi-concern requests? → Decompose up front into distinct items, investigate in parallel (multiple Task calls in one turn) with shared context (verified customer ID, conversation summary).
- **Q:** Why share context across the parallel investigations? → To pin all sub-investigations to the same verified account without re-verifying, and to make synthesis coherent across concerns.

---

## Anti-patterns

- ❌ **Prompt-only ordering for sensitive ops.** "Always verify the customer first" in the system prompt, no enforcement gate. Works most of the time; fails the one time that matters.
- ✅ **Add a `PreToolUse` gate that physically blocks the sensitive tool until verification has run.**
- ❌ **Identity verification in a single tool call without state recording.** Agent calls `get_customer`, reads the result inline, then later calls `process_refund` with nothing checking that verification happened in this session.
- ✅ **Use a `PostToolUse` hook to record `verified_customer_id` in session state; gate downstream tools on it.**
- ❌ **Free-text escalation messages.** `escalate_to_human({message: "customer is upset, please help"})` — no ID, no recommended action, no amount. Receiver re-investigates from scratch.
- ✅ **Emit a structured payload with `customer_id`, `root_cause`, `refund_amount`, `recommended_action`.**
- ❌ **Name-based handoffs.** Passing `customer_name: "John Smith"` instead of `customer_id: "C-48201"`. Multiple John Smiths exist; misidentification is inevitable.
- ✅ **Always pass the verified `customer_id` (not name) across handoffs.**
- ❌ **Serial firefighting on multi-concern requests.** Agent solves the first concern, forgets concerns 2 and 3, asks "anything else?"
- ✅ **Decompose into distinct items up front and investigate in parallel with shared context.**
- ❌ **Re-verifying identity per concern in parallel investigations.** Each subagent calls `get_customer` independently — tokens wasted, divergence risk.
- ✅ **Verify once; pass the verified ID to every parallel subagent via shared context.**
- ❌ **Composing gates loosely.** `process_refund` checks "is there *some* verified customer" but not "does *this order* belong to *that* customer."
- ✅ **Make each gate check all preconditions — verified ID + order-belongs-to-customer + amount-within-policy.**
- ❌ **Iterating on the prompt to fix a determinism bug.** Failure rate drops from 2/100 to 1/100; team declares victory — but 1/100 is still a compliance incident.
- ✅ **Reach for a hook from turn one when the operation has no acceptable failure rate.**

---

## Worked example — Scenario 1 (Customer Support Resolution Agent)

Customer message: *"Hi, this is Jane Roberts. I was double-charged for last month's invoice (#INV-7732), and the headphones I bought (order #O-991) arrived damaged — I'd like a return. Also my login isn't working."*

**Round 1 — verification.** Agent calls `get_customer({name: "Jane Roberts"})`. Returns two matches (`C-48201` and `C-48244`). The `escalate_to_human` payload is *not* yet emitted; instead the agent asks Jane for an additional identifier (last 4 digits of the credit card on file, per Task 5.2's "request additional identifiers, don't heuristic-pick" rule). Jane provides them; `get_customer` resolves to `C-48201`. A `PostToolUse` hook on `get_customer` writes `session.verified_customer_id = "C-48201"`.

**Round 2 — parallel decomposition.** Agent identifies three concerns: (a) duplicate-charge dispute on `INV-7732`, (b) damaged-goods return for `O-991`, (c) login issue. Emits **three Task calls in one turn**, each carrying `customer_id: C-48201` in shared context. Subagent A investigates the invoice (calls `lookup_order` for any order tied to `INV-7732`); subagent B looks up `O-991`'s status and return policy; subagent C checks account status for any login lockout flag.

**Round 3 — gates fire.** Subagent A finds the duplicate charge and tries `process_refund({order_id: "INV-7732", amount: 89.00})`. The `PreToolUse` gate on `process_refund` checks: is the order tied to the verified customer? Yes. Is the amount within tier-2 refund cap? Yes. Allowed. Subagent B finds the damaged-goods return is within policy and starts a return process. Subagent C discovers the login issue is a multi-factor lockout that requires a human to clear (policy gap).

**Round 4 — synthesis + structured handoff.** Agent synthesises a single response to Jane explaining: refund issued for the duplicate charge, return started for the headphones, login issue escalating to a human. For (c), agent emits:

```json
{
  "tool": "escalate_to_human",
  "input": {
    "customer_id": "C-48201",
    "root_cause": "MFA lockout requires manual reset; agent has no MFA-clear permission.",
    "refund_amount": null,
    "recommended_action": "Clear MFA lockout via admin console; verify with customer by call-back.",
    "transcript_summary": "Customer reports login issue alongside billing/return. Refund and return resolved by agent; only the MFA issue remains.",
    "investigation_state": {"verified_customer_id": "C-48201", "concern_id": "login_issue"}
  }
}
```

The bug to watch for in 1.4 questions: a coordinator that handles all three concerns serially and forgets the login issue (anti-pattern: serial firefighting), or that emits a free-text escalation with no `customer_id` so the human queue can't tell which "Jane Roberts" account to operate on, or — worst — that processes the refund without the gate, in a session where the agent never actually verified Jane's identity at all.

---

## Quick recall (full set)

- **Q:** Difference between prompt-based ordering and programmatic enforcement? → Prompt tells the model what to do (probabilistic compliance); enforcement is a runtime gate/hook that physically prevents the wrong sequence (deterministic compliance).
- **Q:** When is enforcement non-optional rather than nice-to-have? → When the failure has no acceptable rate — identity verification before financial operations, refunds, transfers, sensitive account changes.
- **Q:** Two SDK primitives for programmatic enforcement? → `PreToolUse` hooks (deny tool calls before execution) and prerequisite gates (reject calls based on session state like `verified_customer_id`).
- **Q:** A team has tightened the system prompt three times and the agent still occasionally skips identity verification. What's the correct diagnosis? → Wrong tool for the job — prompts give probabilistic compliance, gates give deterministic. Add a `PreToolUse` hook on `process_refund` that requires verified customer ID; stop iterating on the prompt.
- **Q:** What's wrong with `escalate_to_human({message: "customer is upset, help"})`? → No `customer_id`, no root cause, no refund amount, no recommended action. The receiving human has to re-investigate from the transcript (which they don't have). Use a structured payload.
- **Q:** Four canonical fields in a Scenario 1 handoff payload? → `customer_id` (verified), `root_cause`, `refund_amount` (or relevant operation amount), `recommended_action`.
- **Q:** Why pass `customer_id` rather than the customer's name in a handoff? → Names are ambiguous (multiple matches, misspellings); verified IDs aren't.
- **Q:** A multi-concern customer message arrives. What's the structural pattern? → Decompose the request into distinct items, then investigate them in parallel (multiple Task calls in one coordinator turn) with shared context (verified customer ID, conversation summary). Synthesise into a single response.
- **Q:** Why pass shared context to each parallel subagent rather than letting each verify identity independently? → Re-verifying per subagent wastes tokens, risks divergent interpretations of the customer, and creates cross-customer-refund risk under edge cases. Verify once; share the ID.
- **Q:** A `process_refund` gate checks "is there *some* verified customer in session"; an order-cross-account refund slipped through. What's the gate composition fix? → Tighten the gate to verify the *order's* customer matches the *session's* verified customer, not just that any verified customer exists. Each gate should check all preconditions, not a partial subset.
