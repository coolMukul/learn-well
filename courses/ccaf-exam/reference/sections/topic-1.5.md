# Task 1.5 — Apply Agent SDK hooks for tool-call interception and data normalization

> Domain 1: Agentic Architecture & Orchestration. Excerpted from the official guide.

## Knowledge of
- Hook patterns (e.g., `PostToolUse`) that intercept **tool results** for transformation before the model processes them.
- Hook patterns that intercept **outgoing tool calls** to enforce compliance rules (e.g., blocking refunds above a threshold).
- The distinction between using hooks for **deterministic guarantees** versus relying on prompt instructions for **probabilistic compliance**.

## Skills in
- Implementing `PostToolUse` hooks to **normalize heterogeneous data formats** (Unix timestamps, ISO 8601, numeric status codes) from different MCP tools before the agent processes them.
- Implementing tool-call interception hooks that **block policy-violating actions** (e.g., refunds exceeding $500) and **redirect** to alternative workflows (e.g., human escalation).
- Choosing **hooks over prompt-based enforcement** when business rules require guaranteed compliance.
