# Task 1.1 — Design and implement agentic loops for autonomous task execution

> Domain 1: Agentic Architecture & Orchestration. Excerpted from the official guide.

## Knowledge of
- The agentic loop lifecycle: sending requests to Claude, inspecting `stop_reason` (`"tool_use"` vs `"end_turn"`), executing requested tools, and returning results for the next iteration.
- How tool results are appended to conversation history so the model can reason about the next action.
- The distinction between **model-driven decision-making** (Claude reasons about which tool to call next based on context) and **pre-configured decision trees** or fixed tool sequences.

## Skills in
- Implementing agentic loop control flow that **continues** when `stop_reason` is `"tool_use"` and **terminates** when `stop_reason` is `"end_turn"`.
- Adding tool results to conversation context between iterations so the model can incorporate new information into its reasoning.
- Avoiding anti-patterns:
  - Parsing natural language signals to determine loop termination.
  - Setting arbitrary iteration caps as the **primary** stopping mechanism.
  - Checking for assistant text content as a completion indicator.
