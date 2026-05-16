# Task 2.5 — Select and apply built-in tools (Read, Write, Edit, Bash, Grep, Glob) effectively

> **Domain 2 · Tool Design & MCP Integration** · 18% of the exam

## Why this matters

Built-in tools are the default toolbox every Claude Code session and every Agent SDK harness gets for free. The exam loves to test whether you reach for the **right primitive** — Grep vs Glob, Edit vs Read+Write — for a given symptom rather than reflexively reading whole files or shelling out to `cat`/`grep` via Bash. Choosing the wrong primitive wastes context window, slows the agent, and produces brittle behaviour (Edit calls that fail because the anchor text is not unique). Mastery here directly powers Scenario 4 (Developer Productivity) and Scenario 2 (Code Generation), where the agent must explore unfamiliar codebases without re-reading every file.

## Grep for content search across codebases

**Grep** is the right tool any time you need to locate **content inside files** — function names, error message strings, import statements, TODO comments, or any literal/regex pattern. It works across the entire workspace in one call and returns matching paths (or matching lines, depending on the output mode), which is dramatically cheaper than reading a directory of files in full and scanning them yourself.

A common production pattern: an engineer asks "where do we throw `RateLimitError`?" The agent runs **one Grep call** for the literal `RateLimitError`, gets back the half-dozen call sites, and now knows which files are worth reading. Compare that to the anti-pattern of reading every `.py` file in `src/` and inspecting each — that burns thousands of tokens for a single-line answer.

Grep also supports filters that narrow the search efficiently: a file-type filter (`type: "py"`), a glob (`*.test.tsx`), case-insensitivity, and the choice of `files_with_matches` (just the paths) vs `content` (the matching lines, optionally with context). Use `files_with_matches` for "where is this used at all?" and `content` for "show me the surrounding code."

> **Common pitfall** — Reaching for `Bash` to run `grep -r` instead of using the **Grep** built-in. The built-in is permissioned, structured, and respects the harness's path access; shelling out is slower, often produces messier output, and may need extra permission prompts.

**Quick recall**
- **Q:** What primitive do you use to find every caller of `parseInvoice` across a repo? → **Grep** for the literal string `parseInvoice`, optionally with a `type` or `glob` filter.
- **Q:** Why is Grep cheaper than Read for "find usages" tasks? → It returns only matches across many files in one call instead of loading whole file contents into context.

## Glob for file path patterns

**Glob** matches **file paths by name pattern**, not file contents. Reach for it when you know the *shape* of the filename you want — extensions, naming conventions, test/spec suffixes, generated files — and want a list of paths back to act on next.

A canonical example: "review every React test file in the project" maps to a single Glob call for `**/*.test.tsx`. The double-star `**` walks all directories; the rest of the pattern matches the filename. Other common patterns include `src/**/*.ts` (all TypeScript under `src/`), `**/migrations/*.sql` (every migration), or `**/CLAUDE.md` (every memory file in the tree).

Glob is path-only and **does not look inside files**. If you need both — say, "find every test file that mentions `processPayment`" — the right composition is Glob to list the candidates, then Grep with a `glob` filter to search inside them. (Or, more directly, Grep with `glob: "**/*.test.tsx"` and pattern `processPayment` in a single call.)

Glob results are sorted by modification time, which makes it convenient for "what changed recently?" sweeps without invoking Bash.

> **Common pitfall** — Using Grep with a content pattern when you only need filenames, or using Bash `find` instead of Glob. Glob is faster, returns sorted results, and avoids permission/escaping issues.

**Quick recall**
- **Q:** Which primitive lists every file matching `**/*.test.tsx`? → **Glob**.
- **Q:** You want every test file *that imports* `axios`. What's the minimal call shape? → **Grep** with `pattern: "axios"` and `glob: "**/*.test.*"` — one call, not two.

## Read + Write fallback when Edit can't find a unique anchor

**Edit** is the preferred primitive for targeted changes: it diffs cleanly, preserves the rest of the file untouched, and is the cheapest way to apply a fix once you know the exact text to swap. Edit's hard requirement is that **`old_string` must be unique** in the file — if it appears more than once (or zero times), the call fails because Edit cannot pick the right occurrence.

When that happens, the supported fallback is **Read the whole file → Write it back with the change applied**. Read gives you the entire current contents (with line numbers), you reconstruct the file with the modification, and Write replaces it atomically. This is also the right approach when the change spans many scattered locations or when you're effectively rewriting the file.

A worked example: you want to rename a local variable `cfg` to `config` in a 200-line file. `cfg` appears 14 times — Edit will not target a single one, and even with `replace_all` it would also clobber `cfgPath` and `parseCfgLine`. The reliable fix is Read → reconstruct with proper word-boundary substitutions → Write.

A safer middle ground when only a few occurrences exist: expand `old_string` with **surrounding context** so it becomes unique (include the preceding line, the function signature, etc.). Only fall back to Read+Write when even contextual expansion can't disambiguate.

> **Common pitfall** — Repeatedly retrying Edit with slightly different anchors and burning turns. If two attempts fail because of non-uniqueness, switch to Read+Write rather than guessing.

**Quick recall**
- **Q:** Edit fails with "old_string is not unique." First fix to try? → Expand `old_string` with surrounding context (the line above/below, function signature) until the snippet appears exactly once.
- **Q:** When is Read + Write the correct primitive over Edit? → When Edit can't be made unique, when the change spans many scattered sites, or when you're effectively rewriting the file.

## Incremental discovery: Grep for entry points → Read to follow imports

The exam-tested workflow for understanding an unfamiliar codebase is **incremental**: never load a directory in full, never read everything upfront. Start with a **Grep** for the symptom — an error string, a CLI command, a route path, the user-facing feature name — to pinpoint the entry points. Then **Read** only the files Grep surfaced, follow their imports to their dependencies, and repeat.

A concrete trace: a user reports "the `/checkout` endpoint returns 500 sometimes." A productive agent runs:

1. `Grep "/checkout"` (file paths) → finds `routes/checkout.ts`.
2. `Read routes/checkout.ts` → sees it imports `processPayment` from `services/payment`.
3. `Read services/payment.ts` → sees the throw site for the 500.
4. `Grep "processPayment"` → confirms whether other callers also need fixing.

Compare this to the anti-pattern of `Read`-ing everything in `routes/` and `services/` upfront: 20+ files into context, most of which are irrelevant, exhausting the window before the real work begins. Incremental discovery is the *single most important* habit when working in repos larger than a few hundred files.

> **Common pitfall** — "Let me just read the whole `src/` directory first to get oriented." This destroys context, takes longer than targeted Grep, and rarely improves understanding because the agent reads files it never needs.

**Quick recall**
- **Q:** First call when investigating a bug report tied to an error string? → **Grep** for the error string to find the throw site, *then* Read.
- **Q:** Why is "read everything upfront for orientation" an anti-pattern? → It exhausts context with files the agent will never need; targeted Grep gives the same orientation in one call.

## Tracing function usage across wrapper modules

Real codebases re-export and rename functions through wrapper modules. To trace **all real call sites** of a logical function, you can't just Grep one name — you need to know every alias. The pattern is two-phase: **first find every export of the function**, then Grep each exported name across the codebase.

Worked example: `formatCurrency` lives in `lib/format.ts`. The barrel file `lib/index.ts` re-exports it as `currency`. A consumer file imports it as `import { currency as fmt } from '@app/lib'` — so the actual call site reads `fmt(amount)`. A naïve `Grep "formatCurrency"` would miss every wrapped call.

Phase 1 — identify exports: `Grep "formatCurrency"` to find the source file plus barrels, then read those barrels to see what aliases exist (`currency`, etc.). Phase 2 — search uses: Grep each alias (`currency`, plus the original name) across the repo. For deeply re-exported code, you may need a third pass on intermediate aliases.

The same principle applies to renamed React components, repackaged utility functions, and any module that publishes a public name different from its internal name. Build the alias set first; search the alias set second.

> **Common pitfall** — Grepping only the original function name and concluding "no callers." Wrappers and barrel files mean the public name often differs from the implementation name; missing this leads to dead-code-deletion bugs.

**Quick recall**
- **Q:** Why is a single Grep insufficient to "find all callers" in a codebase with barrel files? → The function may be re-exported under different aliases; callers use the alias, not the original name.
- **Q:** Two-phase trace pattern? → Phase 1: identify all exported names (Grep + read barrels). Phase 2: Grep each alias across the codebase.

## Anti-patterns

- ❌ **Bash `grep -r` / `find` instead of Grep / Glob.** The Bash variants are slower, often produce messier output, and may trigger extra permission prompts.
- ✅ **Use the Grep / Glob built-ins; reserve Bash for things the dedicated tools genuinely can't do.**
- ❌ **Reading whole directories upfront for "orientation."** Burns context with files the agent never needs.
- ✅ **Start narrow with Grep on the symptom (error string, route, symbol), then Read only the surfaced files.**
- ❌ **Retrying Edit with slightly different anchors after a uniqueness failure.** Each retry is a wasted turn.
- ✅ **Expand `old_string` with surrounding context once; if still non-unique, switch to Read + Write.**
- ❌ **Grepping only the source-file function name in a codebase with barrel re-exports.** Misses every aliased call site.
- ✅ **Two-phase trace: identify all exported aliases first, then Grep each alias across the repo.**
- ❌ **Using Read on a 5,000-line file when you only need three functions.** Floods context with code the agent never reads.
- ✅ **Grep to locate the symbols, then Read with `offset`/`limit` to pull only the relevant ranges.**
- ❌ **Conflating Glob and Grep.** Glob finds files by *name*; Grep searches *content*. Mixing them up causes empty results or unnecessary reads.
- ✅ **Glob for filename patterns; Grep for content; combine them with `glob:` filter on Grep when you need both.**

## Worked example — Scenario S4 (Developer Productivity with Claude)

A developer asks the productivity agent: *"I deleted `LegacyCache.invalidate()` — am I going to break anything?"* A reflexive agent might Read every file under `src/` and skim for the symbol — that's the wrong move. The disciplined sequence: **Grep `"LegacyCache"`** to surface the source file plus the barrel exports → **Read** the barrels to discover that `LegacyCache` is re-exported as `Cache` from `@app/cache` → **Grep** both `LegacyCache.invalidate` and `Cache.invalidate` to enumerate every caller → **Read** only the caller files that actually use `.invalidate` to assess the blast radius. The fix step then uses **Edit** (with surrounding-line context to keep `old_string` unique) for each call site, falling back to **Read + Write** for the one file where the symbol appears six times. No Bash, no full-directory reads, and the agent stays well under its context budget.

## Quick recall (full set)

- **Q:** Grep vs Glob in one sentence? → Grep searches **inside** files; Glob matches **file paths** by name.
- **Q:** Edit fails because `old_string` matches three places. First remediation? → Expand `old_string` with surrounding context until exactly one match remains.
- **Q:** When that still fails? → Fall back to **Read + Write**: read the whole file, reconstruct with the change, write it back.
- **Q:** What's the right first call for "find every caller of `processPayment`"? → **Grep** for `processPayment` (and any known aliases) — not Read, not Bash.
- **Q:** Single call to find every React test file in the repo? → **Glob** with pattern `**/*.test.tsx`.
- **Q:** Single call to find React tests that import `axios`? → **Grep** with `pattern: "axios"` and `glob: "**/*.test.*"`.
- **Q:** Why is "Read all of `src/` to get oriented" an anti-pattern? → It floods context with irrelevant files; targeted Grep gives the same orientation cheaply.
- **Q:** Why does Grepping only the original function name miss callers? → Barrel re-exports and import-time aliases mean the call site uses a different name than the source file.
- **Q:** Why prefer the Grep built-in over Bash `grep -r`? → It's faster, structured, permissioned by the harness, and avoids extra prompts.
- **Q:** When is **Read + Write** clearly correct over Edit? → When Edit can't be made unique, when the change is scattered across many sites, or when you're effectively rewriting the file.
