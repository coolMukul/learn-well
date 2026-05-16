# Domain 1 — Agentic Architecture & Orchestration

Summary
- Focus: designing agentic loops, multi-agent coordination, subagent invocation, hooks, session management, and multi-step workflows.
- Key concerns: correct loop termination (stop_reason), passing tool results into context, avoiding brittle prompt-only enforcement for deterministic rules, and designing coordinator-subagent patterns for observability and error handling.

Key Points
- Agentic loop: continue when stop_reason == "tool_use"; finish when "end_turn".
- Append tool results to conversation history between iterations to allow the model to reason with new data.
- Use programmatic enforcement (hooks/prerequisites) for critical business rules (e.g., identity verification) rather than relying solely on prompts.
- Coordinator-subagent (hub-and-spoke) pattern centralizes routing, error handling, and aggregation; subagents operate with isolated context unless explicit context is passed.
- Use Task tool for spawning subagents; include allowedTools: ["Task"] for coordinator invocation.
- Hooks (PostToolUse, interception) normalize and enforce rules deterministically.
- Session management: use named resume/fork_session patterns; prefer fresh sessions with injected summaries when prior tool results are stale.

Flashcards
- Q: What stop_reason signals that the model wants to call a tool?  
  A: "tool_use".
- Q: How should critical ordering constraints be enforced (e.g., verify customer before refund)?  
  A: Programmatic enforcement via hooks/prerequisite gates, not just prompts.
- Q: Where should subagent communication be routed for observability?  
  A: Through the coordinator agent (hub-and-spoke).
- Q: Do subagents inherit the coordinator's conversation history automatically?  
  A: No — context must be explicitly provided.
- Q: What is a safe pattern to explore divergent approaches from a shared analysis?  
  A: Fork-based session management (fork_session).

## Task 1.1 — Agentic loop for autonomous task execution

> Last studied: 2026-04-28T14:58:35+08:00

### Knowledge of
- The agentic loop is a request → inspect `stop_reason` → execute tools → append results → re-request cycle. It is the SDK's core control flow for autonomous execution.
- `stop_reason` values that drive the loop: `"tool_use"` means Claude wants to call one or more tools (continue the loop); `"end_turn"` means Claude has finished its turn (terminate the loop).
- After executing tool calls, the **tool result blocks must be appended to the conversation history** so the next request lets Claude reason over the new information.
- Model-driven decision-making: Claude picks which tool to call next based on accumulated context. This is fundamentally different from a scripted decision tree or a fixed tool sequence the developer hard-codes.
- A scripted pipeline removes Claude's ability to adapt — it can no longer skip an unneeded step, retry a different tool, or order calls based on what it just learned.

### Skills in
- Implement loop control flow that **continues** while `stop_reason == "tool_use"` and **terminates** when `stop_reason == "end_turn"`.
- Append tool-result blocks (matched by `tool_use_id`) to the message history between iterations so the model has the full causal trail.
- Let `stop_reason` be the **primary** termination signal. Use iteration caps only as a safety net for runaway loops, never as the main stopping mechanism.
- Recognize when a "looks done" heuristic (assistant produced text, "I'm done" appears in content) is masking a still-active loop.

### Anti-patterns to avoid
- **Parsing natural language for termination** — checking the assistant's text for words like "done", "finished", "complete". Brittle, locale-sensitive, and bypasses the canonical signal.
- **Iteration caps as the primary stopper** — capping at N iterations means correct multi-step tasks get truncated mid-flight, while broken loops still burn N iterations of tokens. Caps are a circuit-breaker, not a control mechanism.
- **Asserting on assistant text content** to decide loop state — a tool-calling turn may have empty/minimal text; a chatty model may produce prose between calls. Text presence ≠ termination.
- **Failing to append tool results** to history — the next iteration then has no idea what the tool returned and either re-calls it or hallucinates the outcome.
- **Hard-coding tool sequences** ("always call get_customer, then lookup_order, then process_refund") — eliminates the model's ability to adapt to the actual request shape.

### Worked example / scenario application
In Scenario 1 (Customer Support Resolution Agent), a refund request arrives. The loop sends the user message, gets back `stop_reason: "tool_use"` with a `get_customer` call, executes it, appends the tool_result, and re-sends. Claude now sees customer data and emits a `lookup_order` tool_use; the loop continues. After `process_refund` succeeds and Claude produces a confirmation message with `stop_reason: "end_turn"`, the loop exits. A common bug here is a developer who terminates after seeing "your refund has been processed" in assistant text — but Claude sometimes emits that text mid-turn before a final `escalate_to_human` tool call, causing the escalation to be silently dropped.

### Quick recall
- **Q:** What `stop_reason` value means "continue the agentic loop"?
  **A:** `"tool_use"`.
- **Q:** What `stop_reason` value means "the loop should terminate"?
  **A:** `"end_turn"`.
- **Q:** Where do tool results need to go between iterations?
  **A:** Appended to the conversation/message history so the next request includes them.
- **Q:** Is an iteration cap a valid primary termination mechanism?
  **A:** No — caps are a safety net only; `stop_reason` is the primary signal.
- **Q:** Why is parsing assistant text for "done" an anti-pattern?
  **A:** It's brittle and bypasses the canonical `stop_reason` signal; the model may produce text mid-turn before further tool calls.
- **Q:** What is the key difference between an agentic loop and a scripted tool pipeline?
  **A:** Model-driven decision-making — Claude chooses the next tool from context, vs the developer hard-coding the sequence.
- **Q:** If you check `len(response.content[0].text) > 0` to decide loop termination, what's wrong?
  **A:** Tool-calling turns can include text; text presence does not indicate completion. Use `stop_reason`.
