# Topic 3.2 — Custom slash commands and skills

> **Chapter 3 · Claude Code Configuration & Workflows** · 20% of the exam

## Why this matters

Slash commands and skills are how a team turns repeated Claude Code workflows into reusable, named operations — without re-typing the prompt and without baking those instructions into `CLAUDE.md` where they load every session whether needed or not. The exam tests two distinctions: **project vs. personal scope** (everyone who clones the repo, or just me?) and **on-demand vs. always-loaded** (context only when invoked, or every turn?). Both show up in Scenario 2 (Code Generation) and Scenario 4 (Developer Productivity), and both are routinely missed by candidates who default to "put it in `CLAUDE.md`."

Skill **frontmatter** — `context: fork`, `allowed-tools`, `argument-hint` — is the second high-value cluster. `context: fork` keeps verbose or exploratory skill output out of the main session. `allowed-tools` is the **least-privilege** whitelist for skills. `argument-hint` is purely UX — it prompts you for an argument you forgot — and the exam loves trapping candidates who think it enforces validation.

---

## .claude/commands/ (project, shared via VCS) vs ~/.claude/commands/ (personal)

A **slash command** is a markdown file whose name becomes the command. The directory determines its **scope**: `.claude/commands/` inside a repository defines a **project-scoped** command **checked into VCS** and therefore available to every developer who clones the repo. `~/.claude/commands/` (in the user's home directory) defines a **personal** command that exists only on that one machine and is invisible to teammates.

The decision is mechanical: if the command encodes team-shared workflow — `/review` walks the team's checklist, `/lint-and-fix` runs the project linter, `/release-notes` formats the changelog — it belongs in `.claude/commands/` and gets committed alongside the code that depends on it. New hires get it for free on `git clone`. If the command encodes a **personal preference** — `/explain-like-im-five`, `/journal` for session notes — it belongs in `~/.claude/commands/`, where it follows you across every project but never lands in anyone else's checkout.

A typical example: a team creates `.claude/commands/review.md` containing the team's six-step PR review checklist. Every dev who pulls `main` gets `/review`. Meanwhile, the security lead has `~/.claude/commands/threat-model.md` — a personal command they invoke on any project to think through STRIDE categories. That command is theirs; it is not in any repo.

> **Common pitfall** — Putting a team-wide command in `~/.claude/commands/` because "it's working on my machine." Teammates never receive it; bus-factor problems compound; the command quietly drifts as different developers copy-paste their own version.

**Quick recall**
- **Q:** Where does a `/review` command go if every developer on the team must have it after `git clone`? → `.claude/commands/review.md` in the repo, committed to VCS.
- **Q:** Where does a personal `/journal` command live so it doesn't appear for teammates? → `~/.claude/commands/journal.md` in the user's home directory.

## .claude/skills/ with SKILL.md frontmatter

A **skill** is a richer abstraction than a slash command. Skills live in `.claude/skills/<skill-name>/SKILL.md` (or `~/.claude/skills/<skill-name>/SKILL.md` for personal scope) and combine **frontmatter configuration** with a markdown body. Where a slash command is a one-shot prompt the user explicitly invokes, a skill is a packaged capability the harness loads **on demand** — by description match against the user's request or by explicit invocation — carrying declarative metadata alongside the prompt.

The frontmatter is YAML at the top of `SKILL.md`; the body below is the actual instructions. A minimal skill:

```
---
name: review
description: Run the team's standard PR review checklist
allowed-tools: [Read, Grep, Glob]
argument-hint: <pull-request-number>
context: fork
---

# Review skill
1. Read the PR diff …
2. Walk the checklist …
```

The frontmatter is parsed by the harness; the body is delivered to Claude when the skill activates. That separation is the point — operational concerns (which tools, which scope, what to ask the user for) are declarative metadata; the *prompt* is the markdown body. This makes skills auditable and reviewable in PRs.

> **Common pitfall** — Stuffing the entire prompt into the body without filling in `description` or `allowed-tools`. Without `description` the harness has nothing to match against; without `allowed-tools` the skill inherits everything, defeating least-privilege.

**Quick recall**
- **Q:** Where does a project-scoped skill called `review` live? → `.claude/skills/review/SKILL.md` in the repo.
- **Q:** What's at the top of every `SKILL.md`? → YAML frontmatter declaring `name`, `description`, and (where relevant) `allowed-tools`, `argument-hint`, `context`.

## Skill frontmatter: context: fork, allowed-tools, argument-hint

Three frontmatter keys carry most of a skill's behaviour:

- **`context: fork`** runs the skill's work in an **isolated sub-agent**. The skill gets its own conversation context; verbose output (file dumps, exploratory analysis) does **not** flow back into the main session — only the skill's final summary does.
- **`allowed-tools`** is a **whitelist** of built-in or MCP tools the skill may call. Listing `[Read, Grep, Glob]` denies `Write`, `Edit`, `Bash`, and everything else — least-privilege by construction. It is whitelist, not blacklist.
- **`argument-hint`** is a **UX** prompt. When the user invokes the skill without supplying an expected argument, the harness uses the hint string to ask for it. It does not validate, does not enforce, and cannot reject malformed input. It is a placeholder, not a schema.

A worked example: a `dependency-audit` skill declares `allowed-tools: [Read, Grep, Bash]`, `argument-hint: <package.json path>`, and `context: fork` so the (large) audit output stays out of the main session.

> **Common pitfall** — Assuming `argument-hint` enforces an argument or its format. It only prompts the user; the skill body still has to handle missing or malformed input.

**Quick recall**
- **Q:** Which frontmatter key restricts the tools a skill can call, and is it whitelist or blacklist? → `allowed-tools`, **whitelist** — anything not listed is denied.
- **Q:** What does `argument-hint` actually do? → Provides a UX hint to prompt the user for an argument; it does **not** validate or enforce.

## context: fork for isolating verbose/exploratory output from main session

`context: fork` is the answer to "this skill produces a wall of text I don't want in the main conversation." The harness runs the skill in a **sub-agent** with its own message history; only the skill's **final result** returns to the parent. Everything in between — intermediate tool calls, large file contents, exploratory reasoning — stays in the fork and is discarded.

Two scenario shapes need this. **Verbose output**: a `codebase-audit` skill that reads dozens of files and produces a five-page report — without fork, the parent inherits all that content and its window collapses. **Exploratory branches**: a `brainstorm-alternatives` skill that imagines three architectures — without fork, every dead branch lives forever in the main conversation.

A concrete trace: `/audit-dependencies` (with `context: fork`) reads twelve `package.json` files, runs `npm ls`, classifies each dependency, and returns a one-paragraph summary plus a JSON list. The main session sees only the summary. Without fork it would absorb all twelve reads — many thousands of tokens the developer never asked to keep.

`context: fork` is like a coordinator delegating to a subagent (same model under the hood) and receiving a structured return value. The parent stays alive; its context stays clean.

> **Common pitfall** — Using `context: fork` for a skill whose intermediate output you actually need downstream (e.g., a skill whose tool results another step relies on). Fork drops the intermediate context — if the parent needed those tool results visible, fork was the wrong choice.

**Quick recall**
- **Q:** What does `context: fork` do at runtime? → Runs the skill in an isolated sub-agent so its verbose intermediate output stays out of the main session; only the final result returns.
- **Q:** When is `context: fork` exactly wrong? → When the parent session needs to see the skill's intermediate tool results to drive subsequent steps.

## Personal skill variants in ~/.claude/skills/ to avoid affecting teammates

The same scope distinction applies to skills: project-scoped at `.claude/skills/<name>/SKILL.md` (committed, shared), personal at `~/.claude/skills/<name>/SKILL.md` (yours alone). The personal location is how you customise without affecting teammates.

The most common pattern is a **personal variant of a shared skill**. The repo defines `.claude/skills/review/SKILL.md` — the team's checklist. You want a slightly different style — extra accessibility checks, bullets instead of paragraphs. Editing the project skill changes everyone's `/review`. The right move: create `~/.claude/skills/review-mukul/SKILL.md` (a **different name** — variant, not override). Now `/review` still calls the team skill; `/review-mukul` calls yours; teammates see neither change.

Naming the variant differently is critical. If you put your personal skill at `~/.claude/skills/review/SKILL.md` (same name), precedence rules differ across harness versions — you risk silently shadowing the team skill on your machine, meaning you stop running the team's checklist without realising. A different name is unambiguous: both coexist, you choose which to invoke.

The same principle applies to entirely personal skills: `~/.claude/skills/journal/SKILL.md`, `~/.claude/skills/explain-eli5/SKILL.md`. None belong in any team's repo; all follow you across every project.

> **Common pitfall** — Editing the project skill in `.claude/skills/` to add personal preferences and then committing it. Now every teammate gets your preference whether they want it or not; PR review of the skill change is the only thing standing between you and a team-wide regression.

**Quick recall**
- **Q:** Where does a personal variant of the team's `review` skill go, and what should it be named? → `~/.claude/skills/review-<you>/SKILL.md` — a *different name* from the project skill so it doesn't shadow it.
- **Q:** Why is editing the project `.claude/skills/review/SKILL.md` for personal preferences wrong? → It commits your preferences for the whole team and changes everyone's `/review`.

## Skills (on-demand) vs CLAUDE.md (always-loaded)

The deepest decision in this topic is **when to use a skill versus a CLAUDE.md note**. CLAUDE.md is **always loaded** — every session, every turn. Skills are **on-demand** — they load only when the harness's matching logic decides the user's request fits the skill's `description`, or when the user explicitly invokes the slash form.

The trade-off is **activation cost**. CLAUDE.md is right for **universal standards**: code style, naming conventions, "always run `npm test` after edits." Those rules apply to every turn, so paying their context cost every turn is correct. Skills are right for **task-specific workflows**: the PR review checklist, the dependency audit, the migration generator. The user does those occasionally; loading them every turn wastes a meaningful slice of the window.

The exam traps candidates who default to CLAUDE.md "because it's reliable — it always runs." That reliability is the problem: a 1,500-token checklist in CLAUDE.md eats 1,500 tokens on **every** session, including the 90% where the developer is doing something else. The same checklist as a skill costs zero tokens until invoked.

Rule of thumb: if "should this apply right now?" is "yes, every turn, regardless of task," CLAUDE.md. If "only when the user is doing X," skill. If unsure, prefer the skill — activation cost is tiny.

> **Common pitfall** — Putting a long, task-specific workflow into CLAUDE.md "so it always runs." It always runs whether or not it's relevant; the cost is borne every session by every developer; the context window shrinks for unrelated work.

**Quick recall**
- **Q:** Universal "always run `npm test` after edits" rule — CLAUDE.md or skill? → **CLAUDE.md** — it applies on every turn.
- **Q:** A 1,500-token PR-review checklist used twice a week — CLAUDE.md or skill? → **Skill** — task-specific and infrequent; CLAUDE.md would burn the tokens on every unrelated session.

---

## Anti-patterns

- ❌ **Putting a team-wide command in `~/.claude/commands/`.** Teammates never get it; the workflow is silently per-machine.
- ✅ **Project-shared workflows go in `.claude/commands/` and are committed to VCS so every clone has them.**
- ❌ **Editing `.claude/skills/<shared>/SKILL.md` to add your personal preferences.** Commits your preferences for the whole team.
- ✅ **Create `~/.claude/skills/<shared>-<you>/SKILL.md` with a different name — a personal variant that doesn't shadow or alter the team skill.**
- ❌ **Pasting a long task-specific checklist into CLAUDE.md "so it always runs."** Burns context on every session, including the ones that don't need it.
- ✅ **Package task-specific workflows as skills; reserve CLAUDE.md for universal, every-turn rules.**
- ❌ **Trusting `argument-hint` to validate or require the argument.** It is a UX hint, not a schema.
- ✅ **Validate inputs in the skill body if it matters; treat `argument-hint` as a prompt-the-user string only.**
- ❌ **Omitting `allowed-tools` because "the skill won't call dangerous tools anyway."** Without the whitelist, the skill inherits everything, including `Bash` and `Edit`.
- ✅ **Always declare `allowed-tools` as the minimum set the skill genuinely needs — least privilege, whitelist semantics.**
- ❌ **Running a skill that produces a 5,000-token codebase audit without `context: fork`.** All that exploratory output collapses the main session's window.
- ✅ **Use `context: fork` for verbose / exploratory skills so only the final summary returns to the parent session.**

---

## Worked example — Scenario S2 (Code Generation with Claude Code)

A team standardising code review wants three things: (1) every developer who clones the repo to have the same `/review`; (2) the review skill allowed to read and search but never edit; (3) verbose intermediate findings to stay out of the main session. Right design: `.claude/skills/review/SKILL.md` with `description: Run the team's PR review checklist`, `allowed-tools: [Read, Grep, Glob]`, `argument-hint: <pull-request-number>`, `context: fork`. Commit it. Every clone now has `/review`; it cannot mutate the tree; its long per-file analysis runs in a fork and only the summary returns. A new joiner wanting accessibility checks creates `~/.claude/skills/review-aria/SKILL.md` under a different name — their `/review-aria` doesn't shadow the team `/review` and never lands in any teammate's checkout.

---

## Quick recall (full set)

- **Q:** Project-scoped slash command vs personal — directories? → `.claude/commands/` (project, VCS-shared) vs `~/.claude/commands/` (personal, home-dir).
- **Q:** Where does a project skill live? → `.claude/skills/<name>/SKILL.md` inside the repo.
- **Q:** What does `context: fork` do? → Runs the skill in an isolated sub-agent; verbose intermediate output stays out of the main session, only the final result returns.
- **Q:** `allowed-tools` — whitelist or blacklist? → **Whitelist**: only the listed tools are callable; everything else is denied.
- **Q:** What does `argument-hint` actually do? → Prompts the user for an argument; it is UX, not validation or enforcement.
- **Q:** Personal variant of a team skill — where and named how? → `~/.claude/skills/<different-name>/SKILL.md` so it doesn't shadow the team skill.
- **Q:** Universal rule "always run linter after edits" — CLAUDE.md or skill? → CLAUDE.md, because it must apply on every turn.
- **Q:** Long task-specific checklist used occasionally — CLAUDE.md or skill? → Skill — on-demand activation keeps the tokens out of unrelated sessions.
- **Q:** Why is putting a team workflow in `~/.claude/commands/` wrong? → It exists only on your machine; teammates never receive it.
- **Q:** Why is editing the shared `.claude/skills/<name>/SKILL.md` for personal taste wrong? → You commit your preferences for the whole team; the right move is a personal variant in `~/.claude/skills/`.
