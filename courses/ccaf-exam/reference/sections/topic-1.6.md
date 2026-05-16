# Task 1.6 — Design task decomposition strategies for complex workflows

> Domain 1: Agentic Architecture & Orchestration. Excerpted from the official guide.

## Knowledge of
- When to use **fixed sequential pipelines** (prompt chaining) versus **dynamic adaptive decomposition** based on intermediate findings.
- Prompt chaining patterns that break reviews into sequential steps (e.g., analyze each file individually, then run a cross-file integration pass).
- The value of adaptive investigation plans that generate subtasks based on what is discovered at each step.

## Skills in
- Selecting task decomposition patterns appropriate to the workflow: **prompt chaining** for predictable multi-aspect reviews, **dynamic decomposition** for open-ended investigation tasks.
- Splitting large code reviews into per-file local analysis passes plus a separate cross-file integration pass to avoid attention dilution.
- Decomposing open-ended tasks (e.g., "add comprehensive tests to a legacy codebase") by first mapping structure, identifying high-impact areas, then creating a prioritized plan that adapts as dependencies are discovered.
