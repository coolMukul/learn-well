# Task 5.4 — Manage context effectively in large codebase exploration

> Domain 5: Context Management & Reliability. Excerpted from the official guide.

## Knowledge of
- **Context degradation in extended sessions**: models start giving inconsistent answers and referencing "typical patterns" rather than specific classes discovered earlier.
- The role of **scratchpad files** for persisting key findings across context boundaries.
- **Subagent delegation** for isolating verbose exploration output while the main agent coordinates high-level understanding.
- **Structured state persistence** for crash recovery: each agent exports state to a known location, and the coordinator loads a manifest on resume.

## Skills in
- Spawning subagents to investigate specific questions (e.g., "find all test files," "trace refund flow dependencies") while the main agent preserves high-level coordination.
- Having agents maintain **scratchpad files** recording key findings, referencing them for subsequent questions to counteract context degradation.
- Summarizing key findings from one exploration phase before spawning sub-agents for the next phase, injecting summaries into initial context.
- Designing **crash recovery** using structured agent state exports (manifests) that the coordinator loads on resume and injects into agent prompts.
- Using `/compact` to reduce context usage during extended exploration sessions when context fills with verbose discovery output.
