# Topic 3.1 — CLAUDE.md hierarchy, scoping, and modular organization

> **Chapter 3 · Claude Code Configuration & Workflows** · 20% of the exam

## Why this matters

`CLAUDE.md` is the single most important configuration surface in Claude Code: it is the **memory file** the harness loads into every session to teach the agent your conventions, your stack, and your "house rules." Misplacing instructions across the **user / project / subdirectory** hierarchy is the most common cause of "it works on my machine, not on my teammate's" bugs in agentic workflows. The exam tests whether you can reason about *which* file gets loaded, *whose* machine sees it, and *how* to modularise large rule sets without turning CLAUDE.md into an unreadable wall of text. This is the foundation for Scenario S2 (Code Generation with Claude Code) and S4 (Developer Productivity).

## Hierarchy: ~/.claude/CLAUDE.md (user) vs .claude/CLAUDE.md or root CLAUDE.md (project) vs subdirectory CLAUDE.md

Claude Code resolves memory by walking a **three-tier hierarchy**, and at session start every applicable tier is concatenated into the agent's context. The tiers are:

1. **User-level memory** — `~/.claude/CLAUDE.md`. Lives in the developer's home directory, applies to **every project that user opens**, and is invisible to teammates. Use it for personal preferences ("always show me diffs in unified format", "I prefer pnpm over npm").
2. **Project-level memory** — either `.claude/CLAUDE.md` or a top-level `CLAUDE.md` at the repository root. Lives **inside the repo**, is checked into version control, and applies to anyone who clones the project. Use it for shared conventions ("we use TypeScript strict mode", "all tests live next to source files").
3. **Subdirectory / directory-level memory** — a `CLAUDE.md` placed inside a subfolder such as `services/api/CLAUDE.md`. It loads **when the agent works on files within that subtree**, layered on top of the project root and user files. Use it for sub-package or sub-module conventions ("this directory is the legacy v1 API — do not introduce new endpoints here").

Concrete example: a monorepo has `CLAUDE.md` at the root saying "use Prettier defaults," and `apps/mobile/CLAUDE.md` saying "two-space indent, no semicolons." When Claude edits `apps/mobile/src/App.tsx`, **both** files are in scope — the more specific one effectively overrides the more general one for the overlapping rule. The project root provides the baseline; subdirectory files refine.

Precedence in practice: more-specific rules win on conflict, but loading is **additive, not exclusive** — the root file is not unloaded just because a subdirectory file exists. This is why repeated guidance ("write tests with Jest") in three places does not double-up its weight, but contradictory guidance is dangerous and should be resolved by deleting the duplicate, not by relying on layering order.

> **Common pitfall** — Putting team-wide conventions in `~/.claude/CLAUDE.md` "because that's where I have my CLAUDE.md." Teammates do not see it; debugging "Claude doesn't follow our test convention on Alex's machine but does on mine" almost always traces back to user-vs-project scope confusion.

**Quick recall**
- **Q:** Where do shared team conventions belong? → **Project-level** (`.claude/CLAUDE.md` or root `CLAUDE.md`), checked into VCS.
- **Q:** A rule that should only apply when editing `services/payment/`? → A `CLAUDE.md` *inside* `services/payment/`.

## User-level CLAUDE.md is NOT shared with teammates via VCS

The single rule that catches the most candidates: `~/.claude/CLAUDE.md` lives in the **user's home directory**, not in the repo, so **`git` never sees it**. Two engineers cloning the same repository can have wildly different agent behaviour because each has their own user-level file, or none at all.

This is by design. User-level memory is for **personal ergonomics** that should not be forced on teammates: "respond tersely," "I'm on Windows so prefer PowerShell examples," "always include type hints in Python," "my editor uses tabs." Pushing those into a shared repo would impose one developer's preferences on the whole team.

The diagnostic pattern shows up constantly on the exam: *"A teammate reports that Claude Code is not following the project's commit-message style. On your machine it works fine. What is the most likely cause?"* The answer is almost always: the rule lives in **your** `~/.claude/CLAUDE.md`, not in the project's `CLAUDE.md`. The fix is to **move the relevant lines into the project-level file** and commit it, so every clone of the repo gets the same instructions.

A related gotcha: even within a single user account, `~/.claude/CLAUDE.md` does **not** travel between machines unless you explicitly sync your home directory (dotfiles repo, Mackup, etc.). "Works on my laptop, not on my desktop" can have the same root cause.

> **Common pitfall** — Treating `~/.claude/CLAUDE.md` like a place to draft team rules "until they're stable enough to share." They never get migrated; the team's behaviour stays divergent.

**Quick recall**
- **Q:** Why is `~/.claude/CLAUDE.md` not shared with teammates? → It lives in the user's home directory, outside the repo, so VCS doesn't track it.
- **Q:** Diagnosis when *only one teammate* reports inconsistent rule-following? → Likely a user-scope file the others lack — promote the rule to project scope.

## @import syntax for modular references to external files

A growing `CLAUDE.md` quickly becomes unreadable. The supported way to keep it lean is the **`@import` syntax**, which lets one CLAUDE.md reference another file by relative path. At load time the harness inlines the imported file's contents into the parent, so the agent sees one combined document but **maintainers** see small, single-purpose files.

The canonical use is per-package modularity in a monorepo. The root `CLAUDE.md` becomes a manifest:

```
# Project rules
@import .claude/rules/testing.md
@import .claude/rules/api-conventions.md
@import .claude/rules/security.md
```

Each imported file is owned by the team that cares about that domain. The QA lead edits `testing.md` without touching anyone else's rules; the security team edits `security.md`. Pull requests stay focused, and merge conflicts on a single monolithic CLAUDE.md disappear.

`@import` is a **file reference**, not a magic loader. Two implications candidates often miss: (1) the path must be **valid and reachable** from the importing file — broken paths silently produce empty content; (2) imports are not glob patterns — `@import .claude/rules/*.md` does not work, you import named files. (Compare with `.claude/rules/` directory loading, covered in the next section.)

A team can also use `@import` to pull a **subset** of rules for a sub-package: `apps/api/CLAUDE.md` might `@import ../../.claude/rules/api-conventions.md` plus `@import ./local-overrides.md`, while `apps/web/CLAUDE.md` imports a different set. The maintainer of each package decides which standards files are relevant.

> **Common pitfall** — Treating `@import` as conditional ("only loaded if relevant"). It is unconditional inlining; if the importing file is in scope, the imported file is in scope.

**Quick recall**
- **Q:** What does `@import path/to/file.md` do? → Inlines that file's contents into the importing CLAUDE.md at load time.
- **Q:** Why prefer `@import` over a giant CLAUDE.md? → Smaller, focused files with clear ownership; cleaner diffs and PRs.

## .claude/rules/ as alternative to monolithic CLAUDE.md

`.claude/rules/` is a project-level directory of **topic-specific rule files** — `testing.md`, `api-conventions.md`, `deployment.md`, `error-handling.md`, etc. Like `@import`, it solves the "monolithic CLAUDE.md is unreadable" problem, but as an **organisational pattern** rather than a different mechanism: the rule files are still memory, just split out and individually maintained.

A common shape is YAML-frontmatter on each rule file declaring **path globs** the rule applies to:

```
---
applies_to: "**/*.test.tsx"
---
# React test conventions
- Use Testing Library, not Enzyme.
- One `describe` per component; one `it` per behaviour.
```

This lets you express "these conventions apply to React test files **wherever they live in the repo**" — which a subdirectory `CLAUDE.md` cannot do, because subdirectory memory is bound to a directory tree, not to a filename pattern. When tests live next to source (`Button.test.tsx` next to `Button.tsx` everywhere), `.claude/rules/` with a glob is the right tool.

`.claude/rules/` and `@import` are complementary, not competing. A team can have a small root `CLAUDE.md` that `@import`s a few core files, plus `.claude/rules/` for domain conventions discoverable on their own. Choice between them often comes down to whether you want **one canonical entry point** (root + imports) or **a directory of self-describing rules** (`.claude/rules/` with frontmatter).

> **Common pitfall** — Believing `.claude/rules/` is a different *runtime* from CLAUDE.md. It is not — it is the same memory system, organised differently. The rule files are still memory loaded into context.

**Quick recall**
- **Q:** When does `.claude/rules/` win over a subdirectory `CLAUDE.md`? → When the rule must apply by **filename pattern** across many directories, not by a single directory tree.
- **Q:** Is `.claude/rules/` a different mechanism from CLAUDE.md? → No — same memory system, organised as a directory of focused files.

## /memory command to verify which memory files are loaded

`/memory` is the **diagnostic command** for memory configuration. Run it in a Claude Code session and the harness lists every CLAUDE.md (and imported file) currently loaded into context, with paths. It is the answer to "is my rule actually in scope right now?"

The exam-tested debugging loop: a developer says "Claude isn't following our test convention." Step 1 is **`/memory`**, *not* "edit the rule." If the project's `CLAUDE.md` is missing from the listed files, the rule was never loaded — maybe it's in a subdirectory the agent isn't currently working in, maybe it's a user-level file on someone else's machine, maybe an `@import` path is broken. Editing the rule won't help until you understand why it isn't loaded.

`/memory` reports **what is loaded right now**, not what *should* load — it is a runtime diagnostic. Two consequences: (1) if the agent is working in a different working directory than expected, the loaded set may differ from your guess; (2) a freshly-edited file is only reflected after the harness re-reads memory (typically next session, or after a reload).

A second use is verifying `@import` resolution. After adding `@import .claude/rules/security.md` to your CLAUDE.md, run `/memory` and confirm `security.md` appears in the list. If it doesn't, the path is wrong or the file is empty — `@import` failures are silent.

> **Common pitfall** — Treating `/memory` as a way to *change* memory. It is read-only — the diagnostic, not the editor. To change what's loaded, edit the underlying files.

**Quick recall**
- **Q:** Command to verify which memory files are loaded? → `/memory`.
- **Q:** First step when diagnosing "Claude isn't following rule X"? → Run `/memory` to see whether the rule's file is even loaded.

## Anti-patterns

- ❌ **Putting team-wide rules in `~/.claude/CLAUDE.md`.** Teammates never see them; behaviour diverges across machines.
- ✅ **Put shared rules in project-level `CLAUDE.md` (or `.claude/CLAUDE.md`) and commit them.**
- ❌ **One 800-line root `CLAUDE.md` covering everything.** Unreadable, hard to review, painful merge conflicts.
- ✅ **Split into `.claude/rules/*.md` (or use `@import`) so each domain owns its file.**
- ❌ **Using subdirectory `CLAUDE.md` to enforce conventions on `*.test.tsx` files spread across many directories.** Subdirectory memory is tree-scoped, not filename-pattern-scoped.
- ✅ **Use `.claude/rules/` with a glob in YAML frontmatter — pattern-scoped rules apply wherever the matching file lives.**
- ❌ **Editing rules without first running `/memory` when something isn't being followed.** You may "fix" a rule that wasn't loaded in the first place.
- ✅ **`/memory` first to confirm scope; then edit.**
- ❌ **Assuming `@import path/*.md` works as a glob.** It does not — `@import` takes a single path.
- ✅ **List each imported file explicitly, or use `.claude/rules/` for directory-level grouping.**

## Worked example — Scenario S2 (Code Generation with Claude Code)

A team is rolling out Claude Code across a monorepo. Day 1: one engineer drafts every convention in `~/.claude/CLAUDE.md` and demos it. Day 2: teammates clone, pair-program, and find Claude ignoring half the rules. The fix is a clean three-tier split. **Project-level**: a root `CLAUDE.md` that `@import`s `.claude/rules/testing.md`, `.claude/rules/api-conventions.md`, and `.claude/rules/security.md` — committed, so every clone gets the same baseline. **Subdirectory**: `apps/legacy-v1/CLAUDE.md` with a single rule, "no new endpoints here, this is frozen." **User-level**: each engineer keeps personal preferences ("show diffs unified", "I prefer pnpm") in their own `~/.claude/CLAUDE.md`. To verify, every developer runs `/memory` in their first session and confirms all three project-level imports plus the subdirectory file appear when they open a file under `apps/legacy-v1/`. The "works on my machine" gap closes the same afternoon.

## Quick recall (full set)

- **Q:** Three tiers of CLAUDE.md, in order from broadest to narrowest? → User (`~/.claude/CLAUDE.md`) → project (root or `.claude/CLAUDE.md`) → subdirectory (`<dir>/CLAUDE.md`).
- **Q:** Which tier is *not* shared via VCS? → **User-level** — it lives in `~`, outside the repo.
- **Q:** A teammate doesn't see a rule that works on your machine — most likely cause? → The rule is in **your** `~/.claude/CLAUDE.md`, not in the project's `CLAUDE.md`.
- **Q:** Right tool to apply test conventions to `**/*.test.tsx` files spread across the repo? → A rule file in `.claude/rules/` with a glob in YAML frontmatter — *not* a subdirectory CLAUDE.md.
- **Q:** Right tool when a rule applies only to files under `services/payment/`? → A subdirectory `CLAUDE.md` inside `services/payment/`.
- **Q:** What does `@import path/to/file.md` do? → Inlines that file's contents into the importing CLAUDE.md at load time.
- **Q:** Does `@import` accept globs like `@import .claude/rules/*.md`? → **No** — it takes a single explicit path.
- **Q:** Is `.claude/rules/` a different runtime from CLAUDE.md? → No — same memory system, just a different organisational pattern.
- **Q:** What does `/memory` do? → Lists the memory files currently loaded into the session — read-only diagnostic.
- **Q:** First step when "Claude isn't following rule X"? → Run `/memory` to confirm the rule's file is actually loaded; *then* fix the underlying scope or path.
