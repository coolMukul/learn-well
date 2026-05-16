# Task 2.2 — Implement structured error responses for MCP tools

> Domain 2: Tool Design & MCP Integration. Excerpted from the official guide.

## Knowledge of
- The MCP `isError` flag pattern for communicating tool failures back to the agent.
- The distinction between **transient errors** (timeouts, service unavailability), **validation errors** (invalid input), **business errors** (policy violations), and **permission errors**.
- Why uniform error responses (generic "Operation failed") prevent the agent from making appropriate recovery decisions.
- The difference between **retryable and non-retryable** errors, and how returning structured metadata prevents wasted retry attempts.

## Skills in
- Returning structured error metadata including `errorCategory` (transient/validation/permission), `isRetryable` boolean, and human-readable descriptions.
- Including `retriable: false` flags and customer-friendly explanations for business rule violations so the agent can communicate appropriately.
- Implementing local error recovery within subagents for transient failures, propagating to the coordinator only errors that cannot be resolved locally — along with **partial results** and **what was attempted**.
- Distinguishing between **access failures** (needing retry decisions) and **valid empty results** (representing successful queries with no matches).
