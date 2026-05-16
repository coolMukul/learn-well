# Task 1.2 — Orchestrate multi-agent systems with coordinator-subagent patterns

> Domain 1: Agentic Architecture & Orchestration. Excerpted from the official guide.

## Knowledge of
- Hub-and-spoke architecture where a **coordinator agent** manages all inter-subagent communication, error handling, and information routing.
- How subagents operate with **isolated context** — they do not inherit the coordinator's conversation history automatically.
- The role of the coordinator in task decomposition, delegation, result aggregation, and deciding which subagents to invoke based on query complexity.
- Risks of overly narrow task decomposition by the coordinator, leading to incomplete coverage of broad research topics.

## Skills in
- Designing coordinator agents that analyze query requirements and **dynamically select** which subagents to invoke rather than always routing through the full pipeline.
- Partitioning research scope across subagents to minimize duplication (e.g., assigning distinct subtopics or source types to each agent).
- Implementing **iterative refinement loops** where the coordinator evaluates synthesis output for gaps, re-delegates to search and analysis subagents with targeted queries, and re-invokes synthesis until coverage is sufficient.
- Routing all subagent communication through the coordinator for observability, consistent error handling, and controlled information flow.
