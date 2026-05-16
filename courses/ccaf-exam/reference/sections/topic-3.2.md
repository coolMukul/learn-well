# Task 3.2 — Create and configure custom slash commands and skills

> Domain 3: Claude Code Configuration & Workflows. Excerpted from the official guide.

## Knowledge of
- **Project-scoped commands** in `.claude/commands/` (shared via version control) vs **user-scoped commands** in `~/.claude/commands/` (personal).
- **Skills** in `.claude/skills/` with `SKILL.md` files that support frontmatter configuration including `context: fork`, `allowed-tools`, and `argument-hint`.
- The `context: fork` frontmatter option for running skills in an **isolated sub-agent context**, preventing skill outputs from polluting the main conversation.
- Personal skill customization: creating personal variants in `~/.claude/skills/` with different names to avoid affecting teammates.

## Skills in
- Creating project-scoped slash commands in `.claude/commands/` for team-wide availability via version control.
- Using `context: fork` to isolate skills that produce verbose output (e.g., codebase analysis) or exploratory context (e.g., brainstorming alternatives) from the main session.
- Configuring `allowed-tools` in skill frontmatter to restrict tool access during skill execution (e.g., limiting to file write operations to prevent destructive actions).
- Using `argument-hint` frontmatter to prompt developers for required parameters when they invoke the skill without arguments.
- Choosing between **skills** (on-demand invocation for task-specific workflows) and **CLAUDE.md** (always-loaded universal standards).
