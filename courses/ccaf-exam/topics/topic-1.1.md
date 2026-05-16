# Task 1.1 — Agentic loop for autonomous task execution

> **Domain 1 · Agentic Architecture & Orchestration** · 27% of the exam
>
> _Last revised 2026-04-29 (rev 3): post-test refreshed with new angles (statelessness of the API, custom finish_task tool as fake termination, harness-layer tool renaming, unregistered tool requests, dropping prior tool_results, synthetic user messages substituted for tool_result blocks, one-sentence definition)._

## Why this matters

The agentic loop is the single most-tested concept in Domain 1. Every other topic in this domain — coordinator/subagent design, hooks, session forking, multi-step enforcement — assumes you already understand how a model-driven loop is structured: who decides what runs next (Claude, not your code), how Claude communicates that decision (`stop_reason`), and what your code's only two responsibilities actually are (execute the requested tools, append the results, re-send).

Almost every "fixing a broken agent" exam scenario in this domain is really a question about the loop: someone is parsing text instead of `stop_reason`, or capping iterations as the primary stopper, or hard-coding a tool sequence and wondering why the agent can't adapt. If you can recognise these anti-patterns immediately, you'll bank a meaningful chunk of Domain 1's 27%.

---

## stop_reason values: tool_use vs end_turn

`stop_reason` is the **canonical** signal for what your loop should do next. Two values matter:

- `"tool_use"` — Claude has emitted one or more `tool_use` blocks and is asking your code to execute them. The loop **must continue**: run the tools, append their results to the conversation history, re-send.
- `"end_turn"` — Claude has finished its turn. The loop **terminates**.

Other values exist (`"max_tokens"`, `"stop_sequence"`, refusal-related codes) but for a normal agentic task you treat anything other than `"tool_use"` as "stop iterating," and you treat `"tool_use"` as "iterate."

The trap candidates fall into is using *anything other than* `stop_reason` as the primary signal — the assistant's text content, an iteration count, a heuristic on tool names. Each of those breaks in different production scenarios (see the anti-patterns below).

**Quick recall**
- **Q:** What `stop_reason` value means "continue the agentic loop"? → `"tool_use"`.
- **Q:** What `stop_reason` value means "the loop should terminate"? → `"end_turn"`.

## Appending tool results to conversation history between iterations

After your code executes the tools Claude requested, the **tool result blocks must be appended to the conversation history** before the next request. Each result is correlated to its tool call by `tool_use_id`, so Claude can match what it asked for to what came back.

If you skip this — or summarise the results into prose, or only append the successful ones — the next iteration goes blind. Claude will either re-call the same tool (because it has no record the call happened), hallucinate the outcome, or fall back to its prior knowledge. None of these are recoverable from inside the loop; they all look like "the agent is being weird" until someone inspects the message history.

**Common pitfall:** silently dropping failed tool calls "to avoid confusing the model." The opposite is true — the model needs to see the failure to react to it (retry with different params, escalate, give up gracefully).

**Quick recall**
- **Q:** Where do tool results need to go between iterations? → Appended (as `tool_result` blocks correlated by `tool_use_id`) to the message history before the next request.

## Model-driven decision-making vs scripted decision trees / fixed tool sequences

The defining property of an agentic loop is that **Claude picks the next tool from accumulated context**. Your code is a transport — it ships requests, runs requested tools, ships results back. It is not a controller.

Contrast this with a hard-coded pipeline like "always call `get_customer`, then `lookup_order`, then `process_refund`." That looks tidy but eliminates the model's ability to adapt: a status inquiry that needs no refund still walks the full sequence; a refund denied at policy can't be redirected to escalation; intermediate findings can't shape the next call.

The exam likes this distinction because it surfaces in Scenario 1 (Customer Support Resolution Agent) repeatedly. The "right" answer to "the agent is rigid" almost never involves adding more steps to the pipeline — it usually involves **removing** the pipeline and letting `stop_reason` drive iteration.

**Quick recall**
- **Q:** What's the key difference between an agentic loop and a scripted tool pipeline? → Model-driven decision-making — Claude chooses the next tool from context, vs the developer hard-coding the sequence.

## Anti-patterns

- ❌ **Parsing natural language for termination.** Checking assistant text for words like `"done"` or `"finished"`. Brittle, bypasses the canonical signal, and a tool-calling turn may include narrative text *before* its `tool_use` block — match the text, terminate early, drop the action.
- ✅ **Use `stop_reason` as the canonical termination signal (`end_turn` to stop, `tool_use` to continue).**
- ❌ **Iteration caps as the primary stopper.** Correct multi-step tasks get truncated mid-flight while broken loops still burn N iterations of tokens.
- ✅ **Use iteration caps only as a circuit-breaker; let `stop_reason` drive normal termination.**
- ❌ **Asserting on assistant text content.** `if response.content[0].text: break` — but tool-calling turns can include text; text presence ≠ termination.
- ✅ **Inspect `stop_reason`, not content presence, to decide whether to iterate.**
- ❌ **Failing to append tool results to history.** Forgetting (or summarising, or dropping failed) `tool_result` blocks — Claude re-calls the same tool, hallucinates, or falls back to prior knowledge.
- ✅ **Append every `tool_result` (correlated by `tool_use_id`) to history before the next request.**
- ❌ **Hard-coding tool sequences.** "Always call A, then B, then C" eliminates adaptability — status inquiries walk the full sequence, intermediate findings can't shape the next call.
- ✅ **Stop scripting; let Claude pick the next tool from accumulated context.**
- ❌ **Custom `finish_task` tool to terminate the loop.** Routes termination through a tool the model "decides" to call — text-matching in disguise. Model can forget, call it prematurely, or skip it.
- ✅ **Terminate on `stop_reason == "end_turn"` — the model-controlled signal the API already exposes.**
- ❌ **Silently renaming or substituting the requested tool in the harness** (e.g., `process_refund` → `manual_refund` for large amounts). Breaks model-driven decision-making — Claude reasons about subsequent steps as if the original ran.
- ✅ **Surface the constraint in the tool's result (`requires_manual_review: true`) and let Claude choose next.**
- ❌ **Dropping prior `tool_result` blocks from history to save tokens.** Forces Claude to re-issue tools or hallucinate outcomes.
- ✅ **Keep every `tool_use`/`tool_result` pair; trim verbose content inside a result if needed, never the block.**

---

## Worked example — Scenario 1 (Customer Support Resolution Agent)

A refund request arrives. The loop:

1. Sends the user message → Claude returns `stop_reason: "tool_use"` with a `get_customer` call.
2. Code executes `get_customer`, appends the `tool_result` (with the matching `tool_use_id`), re-sends.
3. Claude now sees customer data → emits a `lookup_order` `tool_use`. Loop continues.
4. After `process_refund` succeeds, Claude produces a confirmation message with `stop_reason: "end_turn"`. Loop exits.

A common bug here: a developer terminates after seeing `"your refund has been processed"` in assistant text. But Claude sometimes emits that confirmation text mid-turn *before* a final `escalate_to_human` tool call — so the escalation gets silently dropped. Using `stop_reason` instead of text matching makes this class of bug structurally impossible.

---

## Quick recall (full set)

- **Q:** What `stop_reason` means continue? → `"tool_use"`.
- **Q:** What `stop_reason` means terminate? → `"end_turn"`.
- **Q:** What must be appended to history between iterations? → Tool result blocks, correlated by `tool_use_id`.
- **Q:** Is an iteration cap a valid primary termination mechanism? → No — caps are a safety net only; `stop_reason` is the primary signal.
- **Q:** Why is parsing assistant text for "done" an anti-pattern? → Brittle and bypasses `stop_reason`; a tool-calling turn may include text before the actual `tool_use` block.
- **Q:** What does "model-driven decision-making" mean? → Claude chooses the next tool from context, instead of the developer hard-coding the sequence.
- **Q:** A pipeline always calls `get_customer` → `lookup_order` → `process_refund`. What's the trade-off? → It removes Claude's ability to adapt: status inquiries still walk the full sequence, intermediate findings can't shape the next call, and unrelated requests are forced through an irrelevant flow.
- **Q:** `if len(response.content[0].text) > 0: break` — what's wrong? → Tool-calling turns can include text; text presence does not indicate completion.
- **Q:** Claude returns *two* `tool_use` blocks in one turn (parallel calls). What does the loop do? → Execute **both** tools, append **both** `tool_result` blocks correlated by their respective `tool_use_id`s, then re-send.
- **Q:** A coordinator delegates to a subagent that runs its own loop. What drives the *coordinator's* iteration? → The coordinator's own response `stop_reason` — the subagent invocation is just a tool from the coordinator's perspective.
- **Q:** Which message role carries `tool_result` blocks back to Claude on the next request? → **User-role** messages, threaded between assistant turns. Tool results are inputs to the next assistant turn; they don't belong in `assistant` content.
- **Q:** Response arrives with `stop_reason: "max_tokens"` mid tool_use turn (truncated content). What does the loop do? → Surface or escalate (retry with higher budget, hand to caller). It is **neither** "continue" nor "terminate" — silently mapping it to either masks an incomplete response.
- **Q:** A tool throws an exception in your code. How should the loop communicate this back to Claude? → Append a `tool_result` block correlated by `tool_use_id` with `isError: true` and a short error description. Don't drop the entry; don't add a system message instead. The model needs to see the failure in the canonical channel to react in context.
- **Q:** Three `tool_use` blocks in one turn but the loop only executes the first and re-sends. What's the predicted symptom? → Claude re-issues the two missing tools next turn (because their `tool_use` entries have no matching `tool_result`), wasting iterations. Always run every tool_use before re-sending.
- **Q:** What invariant most directly guards against the most common loop bugs? → Every `tool_use` in history has a matching `tool_result` (correlated by `tool_use_id`) appended before the next request.
- **Q:** Is the Anthropic Messages API stateful across requests in an agentic loop? → No. The API is **stateless** — your loop must send the full message history (system + prior user/assistant turns including `tool_use` and `tool_result` blocks) on every request.
- **Q:** A team defines a custom `finish_task` tool and terminates the loop when Claude calls it, instead of when `stop_reason == "end_turn"`. Why is that an anti-pattern? → Termination is a model-controlled signal exposed by the API (`stop_reason`); routing it through a tool the model "decides" to call is text-matching in disguise — the model can forget, call it prematurely, or skip it on a multi-step path.
- **Q:** Claude requests a tool that isn't registered in your harness. What does the loop do? → Append a `tool_result` for the matching `tool_use_id` with `isError: true` describing the missing tool, then continue. Don't crash, don't drop the entry — the structured failure lets Claude pick a registered alternative or terminate.
- **Q:** Is it ever acceptable for the harness to silently rename or substitute the tool Claude requested (e.g., `process_refund` → `manual_refund` for large amounts)? → No. Silently substituting breaks model-driven decision-making — Claude reasons about subsequent steps as if the original tool ran. Surface the constraint via the tool's result (`requires_manual_review: true`) and let Claude pick the next action.
- **Q:** Is dropping prior `tool_result` blocks from history (to save tokens) ever safe? → No. Every `tool_use` in history needs its matching `tool_result`; dropping past results forces Claude to re-issue tools or hallucinate. Trim verbose *content* inside a result if needed, but keep the block and its `tool_use_id`.
