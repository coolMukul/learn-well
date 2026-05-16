# Domain 3 — Claude Code Configuration & Workflows

Summary
- Focus: CLAUDE.md hierarchy and modularization, skills and commands, path-scoped rules, plan mode vs direct execution, and integrating Claude Code into CI/CD.
- Key concerns: configuration scoping (user vs project vs directory), using `.claude/rules/` with YAML frontmatter for glob-based rules, using plan mode for large/architectural tasks, and non-interactive CLI flags for CI.

Key Points
- CLAUDE.md hierarchy: user-level (~/.claude/CLAUDE.md), project-level (.claude/CLAUDE.md), directory-level CLAUDE.md.
- Use `@import` to modularize CLAUDE.md; prefer `.claude/rules/` for path-specific rules with glob patterns.
- Create project-scoped slash commands in `.claude/commands/` and skills in `.claude/skills/` with frontmatter (`context: fork`, `allowed-tools`, `argument-hint`).
- Choose plan mode for multi-file architectural changes; direct execution for small, well-scoped edits.
- For CI: use `-p` flag (non-interactive), `--output-format json`, and `--json-schema` to enforce structured outputs.

Flashcards
- Q: Where should a project-wide slash command live so it's version-controlled?  
  A: `.claude/commands/` in the project repository.
- Q: When should you use plan mode vs direct execution?  
  A: Use plan mode for complex, multi-file or architectural tasks; direct execution for small, local changes.
- Q: Which CLI flag runs Claude Code non-interactively in CI?  
  A: `-p` (or `--print`).
- Q: How do you apply path-specific rules across files in many directories?  
  A: Put YAML rule files with `paths:` glob patterns in `.claude/rules/`.
- Q: Why use `context: fork` in a skill frontmatter?  
  A: To isolate verbose/experimental outputs from the main session context.
