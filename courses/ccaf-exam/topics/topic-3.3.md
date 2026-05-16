# Topic 3.3 — Path-specific rules with glob conditional loading

> **Domain 3 · Claude Code Configuration & Workflows** · 20% of the exam

## Why this matters

Real codebases mix conventions: React components are functional with hooks, API handlers use async/await with a specific error envelope, database models follow a repository pattern, and **test files are scattered everywhere**, often colocated next to the code they test (`Button.test.tsx` next to `Button.tsx`). If you stuff every convention into the root `CLAUDE.md`, you pay for all of them on every prompt and Claude has to *infer* which section applies to the current edit. If you instead drop a `CLAUDE.md` in each subdirectory, you cover directories cleanly — but conventions that span the tree (test naming, migration safety, fixture rules) end up duplicated or missed.

`.claude/rules/` files with **YAML frontmatter `paths` globs** are the precise tool for this job: they activate **only when Claude is editing a file that matches the glob**. That keeps unrelated context out of the window for normal edits, and reliably *injects* the right convention the moment a matching file is touched. This is exactly the trade-off the official sample question (Q6 in Scenario 2) tests: tests spread throughout the codebase, conventions that must apply by file *type* regardless of *location* — the right answer is `.claude/rules/` with globs, not subdirectory CLAUDE.md.

This topic is in scope for Scenario 2 (Code Generation) and Scenario 5 (CI), where the same rules drive the in-IDE agent and the headless reviewer.

---

## `.claude/rules/` files with YAML frontmatter `paths` glob arrays

A path-scoped rule is a Markdown file under `.claude/rules/` (project-level) with a **YAML frontmatter block** declaring which files it should attach to. The shape is small and deliberate:

```markdown
---
paths:
  - "**/*.test.tsx"
  - "**/*.test.ts"
---

# Test conventions

- Use `describe`/`it` (never `test()`) so output groups by component.
- Each test file imports from `@app/test-utils`, never directly from `@testing-library/react`.
- One `it` per behaviour; share fixtures via `beforeEach`, not module-level state.
```

The `paths` field is an **array of glob patterns**, not a single string. Each entry is a standard glob — `*` matches one path segment, `**` matches across directories, brace expansion (`{ts,tsx}`) and character classes work. The harness evaluates the array as an OR: a file matches the rule if it matches **any** entry.

The body of the file is just Markdown — the same kind of guidance you would write in `CLAUDE.md`. There is no special schema for the body; it is injected verbatim into the model's context whenever the rule activates.

> **Common pitfall** — Writing `paths: "**/*.test.tsx"` (a string) instead of `paths: ["**/*.test.tsx"]` (an array). The frontmatter expects an array even when there is one entry.

**Quick recall**
- **Q:** What field in `.claude/rules/` frontmatter declares scope? → `paths`, an **array** of globs.
- **Q:** Where do path-scoped rule files live? → `.claude/rules/` at the project root (version-controlled with the repo).

## Conditional rule activation only when editing matching files

The defining behaviour — and the property the exam keeps probing — is that a path-scoped rule **only loads when Claude touches a file whose path matches one of the rule's globs**. If the agent is editing `src/services/payment.ts` and your rule is scoped to `**/*.test.tsx`, the rule does **not** appear in context. If the agent then opens `src/services/payment.test.tsx` to add a regression test, the rule activates and the test conventions are injected.

This conditional behaviour does three things at once:

1. **Saves tokens.** Rules you don't need don't sit in your context window. A repo with twenty path-scoped rules can pay for at most the few that match the active edit.
2. **Reduces cross-talk.** Test conventions don't leak into production-code edits and vice versa, so you stop seeing "Claude tried to add `describe` blocks to my service file" failures.
3. **Makes activation auditable.** Whether a rule fires is a function of the file path, not of Claude's inference about which section of `CLAUDE.md` applies. You can predict it without running the model.

The contrast with `CLAUDE.md` is the load-time behaviour: `CLAUDE.md` is **always** loaded for every interaction in its scope (project root or subdirectory), regardless of which file Claude is editing. Path-scoped rules are **conditional**.

> **Common pitfall** — Expecting a path-rule to influence reasoning *before* a matching file is opened (e.g., during a planning step that hasn't touched any test files yet). The rule has not activated; conventions you assumed were guiding the plan aren't there.

**Quick recall**
- **Q:** When does a `.claude/rules/` file with `paths: ["**/*.test.tsx"]` enter context? → Only when Claude is editing a file matching that glob.
- **Q:** Does `CLAUDE.md` load conditionally on the file being edited? → No — it loads for every interaction in its scope.

## Glob patterns spanning directories (e.g., `**/*.test.tsx`)

The reason `paths` uses globs (and not, say, directory prefixes) is that the conventions you most want to scope **don't live in one directory**. Test files, migrations, fixtures, mocks, generated stubs — all of these spread across the tree by design. A glob describes them by *shape*, not by *location*.

Common patterns you'll see in real `.claude/rules/`:

- `**/*.test.tsx` — every React component test, anywhere in the repo.
- `**/*.{test,spec}.{ts,tsx,js,jsx}` — every test file across all the JS-family extensions.
- `**/migrations/*.sql` — every migration, regardless of which service owns it.
- `terraform/**/*` — everything under the Terraform tree.
- `**/__fixtures__/**` — fixtures wherever they live.
- `apps/*/api/**/*.ts` — API code in any app, but not their UI code or tests.

The double-star `**` is the bit that makes this directory-spanning. `*.test.tsx` would only match test files in the current directory; `**/*.test.tsx` walks every level. If you forget the `**`, your rule silently fails to activate for files nested below the project root — a subtle bug because the file is named correctly but the path doesn't match.

A `.claude/rules/` directory typically contains a handful of small, focused rule files: one for tests, one for migrations, one for Terraform, one for fixtures. **Each file owns one convention; the glob array picks where it applies.** Splitting by concern keeps each rule readable and lets you delete one without cascading edits.

> **Common pitfall** — Writing `paths: ["*.test.tsx"]` and wondering why deeply-nested tests aren't picking up the rule. Without `**/`, the pattern only matches the project root.

**Quick recall**
- **Q:** Glob for "every React test file in the repo, regardless of directory"? → `**/*.test.tsx`.
- **Q:** Why is `*.test.tsx` (no `**/`) usually wrong as a `paths` entry? → It only matches files in the project root, not nested ones.

## When to prefer path-scoped rules over directory-level CLAUDE.md

Both mechanisms inject context. The decision is about **scope shape**:

- **Directory-level `CLAUDE.md`** suits conventions that apply to *everything* inside one subtree. `frontend/CLAUDE.md` describing the React component layout is a clean fit because every file under `frontend/` is in scope and there is little risk of irrelevant activation.
- **Path-scoped rules** suit conventions that apply by **file type or pattern**, especially when matching files are spread across multiple directories — or when only a *subset* of files in a directory should pick up the convention.

The clearest tells that path-rules are the right choice:

1. **Files are spread across the codebase.** Tests next to source files, migrations under each service, fixtures under each module. A subtree-bound `CLAUDE.md` can't express "tests, wherever they are."
2. **The convention is file-type specific, not directory-wide.** Test naming rules shouldn't influence how non-test files in the same directory get edited. With a directory `CLAUDE.md`, every edit in that directory pays for the test conventions even when Claude is editing the source file.
3. **You want predictable, declarative activation.** A glob is a precise contract; a directory `CLAUDE.md` plus prose like "the next section applies to test files" relies on the model inferring which section is relevant.

The polluting-context failure mode is the one to remember: a directory `CLAUDE.md` that mixes "use the repository pattern" (for models) with "use describe/it" (for tests) sometimes nudges Claude to add `describe` blocks to model files because *both* sections were in context together. Path-rules eliminate that by only injecting the test convention when a test file is open.

A useful default split: **directory `CLAUDE.md` for area-wide context** (architecture, ownership, what this folder is *for*); **path-scoped rules for file-type conventions** (naming, imports, fixture style, migration safety). They compose; you don't have to pick one.

> **Common pitfall** — Reaching for a subdirectory `CLAUDE.md` to enforce a test-file convention. It works in the simple case (all tests under one folder) but breaks the moment tests start being colocated with source.

**Quick recall**
- **Q:** Tests are colocated next to source files (`Button.test.tsx` next to `Button.tsx`). What's the right scope mechanism for test conventions? → `.claude/rules/` with `paths: ["**/*.test.tsx", ...]`.
- **Q:** Why is a directory `CLAUDE.md` a poor fit for "test conventions" when source and tests share directories? → The CLAUDE.md applies to **every** file in the directory, polluting non-test edits with test conventions.
- **Q:** Is it valid to have a rule with no `paths` field at all? → Yes — that means the rule is global / always-loaded; use deliberately.

---

## Anti-patterns

- ❌ **Putting all conventions in the root `CLAUDE.md`** and trusting Claude to infer which section applies to the current file. Inference is probabilistic; on any given edit some sections that don't apply are still in context.
- ✅ **Move file-type conventions to `.claude/rules/` with `paths` globs**; keep `CLAUDE.md` for project-wide architecture and ownership context.

- ❌ **Subdirectory `CLAUDE.md` for conventions that span directories** (e.g., a `tests/CLAUDE.md` when tests are actually colocated with source files everywhere). The rule never reaches half the files it should.
- ✅ **Use `.claude/rules/` with `paths: ["**/*.test.tsx"]`** — describes tests by shape, regardless of location.

- ❌ **`paths: "**/*.test.tsx"` as a string.** YAML frontmatter expects an array; this either fails to parse or matches nothing depending on the harness.
- ✅ **`paths: ["**/*.test.tsx"]`** — array form even for a single glob.

- ❌ **`paths: ["*.test.tsx"]` (no `**/`).** Only matches the project root; nested tests silently fail to activate the rule.
- ✅ **`paths: ["**/*.test.tsx"]`** — `**/` makes the pattern directory-spanning.

- ❌ **One mega-rule file** mixing test, migration, Terraform, and fixture conventions under a single `paths` array combining every glob. Activates the wrong sections too often and is hard to delete piecemeal.
- ✅ **One rule per concern**, each with its own `paths`. Compose by having multiple rules activate when appropriate.

- ❌ **Expecting path-rules to influence planning before any matching file is opened.** Rules are conditional on the file being edited; a planning step that hasn't touched a test file yet doesn't see the test rule.
- ✅ **If a convention must guide planning, put it in `CLAUDE.md` (always-loaded) and keep the path-rule for the in-edit reinforcement.**

- ❌ **Omitting `paths` entirely without realising it.** A `.claude/rules/` file with no `paths` frontmatter loads globally — surprising if you intended scoping.
- ✅ **Always include `paths` when you want conditional activation; omit deliberately and document it when you want a global rule.**

---

## Worked example — Scenario S2 (Code Generation with Claude Code)

Your team's React monorepo has the structure: `apps/storefront/components/Button.tsx` next to `apps/storefront/components/Button.test.tsx`, plus migrations under `apps/storefront/db/migrations/*.sql` and Terraform under `infra/terraform/`. The team standards are:

- Tests use `describe`/`it`, import from `@app/test-utils`, and never use module-level fixtures.
- Migrations must include a reversible `-- DOWN` block and never `DROP TABLE` without an explicit comment justifying it.
- Terraform changes require `terraform plan` output to be referenced in the PR description.

The wrong instinct is to dump all of this into the root `CLAUDE.md`. Edits to `Button.tsx` would then drag test, migration, and Terraform conventions into context — Claude has been observed adding `describe` blocks to non-test files when context conflates them. The other wrong instinct is `apps/storefront/components/CLAUDE.md`: it would *also* apply to `Button.tsx`, polluting source edits with test conventions, and it can't even reach the migration files in a sibling directory.

The right structure is a small `.claude/rules/` directory:

```
.claude/rules/
  tests.md          paths: ["**/*.test.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"]
  migrations.md     paths: ["**/migrations/*.sql"]
  terraform.md      paths: ["infra/terraform/**/*", "**/*.tf"]
```

Now: editing `Button.tsx` activates **none** of them — it's just a component edit, governed by the root `CLAUDE.md`. Editing `Button.test.tsx` activates `tests.md` only. Editing `2026_05_03_add_orders.sql` activates `migrations.md` only. The cross-talk problem disappears, the tests can be anywhere they want to be, and adding a fourth convention is a single new file under `.claude/rules/`.

This is the canonical answer to the official Q6 sample: **path-scoped rules with glob patterns, not subdirectory CLAUDE.md, when conventions must follow files spread across the codebase.**

---

## Quick recall (full set)

- **Q:** What field in `.claude/rules/` frontmatter scopes a rule to specific files? → `paths`, an array of glob patterns.
- **Q:** When does a path-scoped rule load? → Only when Claude is editing a file whose path matches one of the globs in `paths`.
- **Q:** Does `CLAUDE.md` activate conditionally on the edited file? → No — it loads for every interaction in its scope (project root or its subdirectory), regardless of which file is being edited.
- **Q:** Glob for "every React test file, anywhere in the repo"? → `**/*.test.tsx`.
- **Q:** Why is `*.test.tsx` (no `**/`) usually wrong? → It only matches the project root; nested tests are missed.
- **Q:** Tests are colocated with source files everywhere. Best mechanism for test conventions? → `.claude/rules/` with `paths: ["**/*.test.tsx", ...]`.
- **Q:** Why is a subtree `CLAUDE.md` a poor fit when source and tests share directories? → It applies to **every** file in the directory, dragging test conventions into non-test edits.
- **Q:** Why is putting all conventions in the root `CLAUDE.md` weaker than path-scoped rules? → Every section sits in context for every interaction; activation depends on Claude's inference rather than a declarative path match.
- **Q:** What does a `.claude/rules/` file with **no** `paths` field do? → Loads globally / always — use deliberately.
- **Q:** Should `paths` be a string or an array? → Array — `paths: ["**/*.test.tsx"]`, even for a single glob.
- **Q:** Right way to organise `.claude/rules/` for a repo with tests, migrations, and Terraform conventions? → One file per concern, each with its own `paths` array; compose via multiple rules activating together when applicable.
- **Q:** A planning step hasn't opened any test files yet. Will the test path-rule influence the plan? → No — path-scoped rules activate only when a matching file is being edited.
- **Q:** When is a directory `CLAUDE.md` actually the right tool? → When the convention applies to *every* file in that subtree (architecture/ownership) and you want it always loaded for that area.
- **Q:** Path-scoped rule vs `.claude/skills/` SKILL.md for conventions? → Path-scoped rules activate *automatically* on file path; skills require explicit invocation.
- **Q:** Path-scoped rule vs `.claude/commands/` slash command for conventions? → Slash commands are user-triggered prompts; path-rules attach passively to matching edits.
