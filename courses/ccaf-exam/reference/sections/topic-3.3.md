# Task 3.3 — Apply path-specific rules for conditional convention loading

> Domain 3: Claude Code Configuration & Workflows. Excerpted from the official guide.

## Knowledge of
- `.claude/rules/` files with **YAML frontmatter `paths` fields** containing glob patterns for conditional rule activation.
- How path-scoped rules load **only when editing matching files**, reducing irrelevant context and token usage.
- The advantage of glob-pattern rules over directory-level CLAUDE.md files for conventions that span multiple directories (e.g., test files spread throughout a codebase).

## Skills in
- Creating `.claude/rules/` files with YAML frontmatter path scoping (e.g., `paths: ["terraform/**/*"]`) so rules load only when editing matching files.
- Using glob patterns in path-specific rules to apply conventions to files **by type regardless of directory location** (e.g., `**/*.test.tsx` for all test files).
- Choosing path-specific rules over subdirectory CLAUDE.md files when conventions must apply to files spread across the codebase.
