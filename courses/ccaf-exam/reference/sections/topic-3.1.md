# Task 3.1 — Configure CLAUDE.md files with appropriate hierarchy, scoping, and modular organization

> Domain 3: Claude Code Configuration & Workflows. Excerpted from the official guide.

## Knowledge of
- The CLAUDE.md configuration **hierarchy**: user-level (`~/.claude/CLAUDE.md`), project-level (`.claude/CLAUDE.md` or root `CLAUDE.md`), and directory-level (subdirectory `CLAUDE.md` files).
- That **user-level settings apply only to that user** — instructions in `~/.claude/CLAUDE.md` are not shared with teammates via version control.
- The `@import` syntax for referencing external files to keep CLAUDE.md modular (e.g., importing specific standards files relevant to each package).
- `.claude/rules/` directory for organizing topic-specific rule files as an alternative to a monolithic CLAUDE.md.

## Skills in
- Diagnosing configuration hierarchy issues (e.g., a new team member not receiving instructions because they're in user-level rather than project-level configuration).
- Using `@import` to selectively include relevant standards files in each package's CLAUDE.md based on maintainer domain knowledge.
- Splitting large CLAUDE.md files into focused topic-specific files in `.claude/rules/` (e.g., `testing.md`, `api-conventions.md`, `deployment.md`).
- Using the `/memory` command to verify which memory files are loaded and diagnose inconsistent behavior across sessions.
