# Task 3.4 — Determine when to use plan mode vs direct execution

> Domain 3: Claude Code Configuration & Workflows. Excerpted from the official guide.

## Knowledge of
- **Plan mode** is designed for complex tasks involving large-scale changes, multiple valid approaches, architectural decisions, and multi-file modifications.
- **Direct execution** is appropriate for simple, well-scoped changes (e.g., adding a single validation check to one function).
- Plan mode enables **safe codebase exploration and design** before committing to changes, preventing costly rework.
- The **Explore subagent** for isolating verbose discovery output and returning summaries to preserve main conversation context.

## Skills in
- Selecting plan mode for tasks with architectural implications (e.g., microservice restructuring, library migrations affecting 45+ files, choosing between integration approaches with different infrastructure requirements).
- Selecting direct execution for well-understood changes with clear scope (e.g., a single-file bug fix with a clear stack trace, adding a date validation conditional).
- Using the **Explore subagent** for verbose discovery phases to prevent context window exhaustion during multi-phase tasks.
- **Combining** plan mode for investigation with direct execution for implementation (e.g., planning a library migration, then executing the planned approach).
