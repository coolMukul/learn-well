# Topic 3.4 — Plan mode vs direct execution

> **Domain 3 · Claude Code Configuration & Workflows** · 20% of the exam

## Why this matters

"Plan mode or just go?" is one of the most common Claude Code workflow decisions, and the exam tests it in Scenario 2 (Code Generation) and Scenario 4 (Developer Productivity). Pick the wrong mode and you either burn turns planning a one-line bug fix, or you ship a half-thought-out architectural change across forty files and discover the wrong service boundary an hour in.

The mental model: **plan mode is for changes where the cost of a wrong direction is high; direct execution is for changes where you already know the answer**. Layered on top is the **Explore subagent**, which lets you do verbose, context-heavy discovery without polluting the main session. Knowing how the three combine (plan to investigate, exit to execute, optionally delegate noisy reading to Explore) is what separates a candidate who has used Claude Code in anger from one who has only memorised the feature list. "Always plan mode to be safe" is just as wrong as "always direct for speed" — the right answer is situational.

---

## Plan mode for large-scale changes, multiple valid approaches, architectural decisions, multi-file modifications

**Plan mode** is the right default whenever the change has any of these properties: it spans **many files**, admits **multiple valid approaches**, requires an **architectural decision** (where do service boundaries fall? which library do we migrate to?), or has high **failure cost** (the wrong direction means hours of rework, not a quick revert). The exam's canonical example is **monolith-to-microservices restructuring**: dozens of files, multiple plausible service boundaries, and the design choice you make in the first ten minutes constrains everything downstream.

Other clear plan-mode signals: a **library migration** affecting 45+ call sites; **choosing between integration approaches** with different infrastructure requirements; **refactoring a shared abstraction** several callers depend on; **adding a cross-cutting concern** (auth, telemetry) that touches every handler. In each case you want to **see the full design** — and have Claude help you reason about trade-offs — *before* a single edit lands.

Plan mode is **read-only by default**. Claude can Read, Grep, and Glob freely, but cannot Write or Edit. You exit plan mode (with the user's approval) when you're ready to commit.

> **Common pitfall** — Treating plan mode as a "preview before applying" feature. It is not a dry-run of a queued patch. It is a dedicated investigation phase where no writes happen at all; the plan is text, not staged diffs. Candidates who answer "plan mode shows me the diff before I apply it" lose Scenario 2 questions.

**Quick recall**
- **Q:** When is plan mode the right default? → Large-scale, multi-file, multiple-valid-approaches, or architectural-decision tasks.
- **Q:** Is plan mode a "preview the patch" feature? → No. It's a read-only investigation phase; nothing is staged, no diff is queued.

## Direct execution for simple, well-scoped changes (single-function, clear stack trace)

**Direct execution** is the right move when the change is **small, well-scoped, and the failure cost is low**. Textbook signals: a **single-function bug fix** with a clear stack trace; **adding one validation check**; **renaming a variable** in a single file; **fixing a typo**; **adding a missing import**. You already know what to change and where — there is no design space to explore.

Reaching for plan mode in these situations is a **negative-value habit**. It burns turns asking Claude to summarise a one-line fix and then asking permission to make it. The exam tests this in disguise: the stem describes a five-line patch with an unambiguous root cause and offers "enter plan mode" as a safety-flavoured distractor. The correct answer is direct execution.

The other half of the rule is **failure cost**. Even a small change in a high-stakes file (a database migration, a release script) can warrant planning, because reverting may not be free. A one-function change in a billing rounding rule is *not* the same as a one-function change in a logging helper.

> **Common pitfall** — "I'll plan-mode it just to be safe" on a trivial fix. That's not safety, that's wasted budget. Plan mode's value comes from preventing rework on **costly** decisions; on a single-function fix with a clear stack trace, there is no rework to prevent.

**Quick recall**
- **Q:** When is direct execution clearly correct? → Small, well-scoped change with low failure cost (single-function bug fix with a clear stack trace, one validation check, a typo).
- **Q:** What two factors decide between plan mode and direct execution? → **Scope** (how many files / how much design space) and **failure cost** (how expensive is a wrong direction).

## Plan mode enables safe codebase exploration before commitment

The deeper purpose of plan mode is **risk-free exploration**. Inside plan mode, Claude can Grep across the repo, Read scattered files, follow imports, and assemble a mental model of the area — and **none** of that activity can mutate the codebase. You can let Claude poke around an unfamiliar area aggressively without worrying that an iteration will accidentally write a half-finished refactor over a file you didn't mean to touch.

The exam frames this as **preventing costly rework**. The classical failure mode for direct execution on a complex task: Claude starts editing, three files in it discovers a constraint nobody mentioned (a downstream consumer, a circular import, a build target), and now you have a half-applied refactor. Plan mode collapses that risk — the constraint surfaces during exploration, the plan is updated, and you only commit after you know the shape of the work.

The natural rhythm: enter plan mode, ask Claude to map the area, iterate on the plan (you push back, Claude refines), and **only then** exit and execute. The plan itself is a useful artefact — design rationale you can paste into the PR description.

> **Common pitfall** — Conflating "safe exploration" with "preview before applying." Plan mode is read-only; there is no staged write to apply. When you exit plan mode and execute, you are running a **fresh** edit pass guided by the plan, not committing a queued diff.

**Quick recall**
- **Q:** What does plan mode let Claude do that direct execution doesn't? → Explore the codebase aggressively (Read, Grep, Glob) without any risk of writes.
- **Q:** What costly outcome does plan mode prevent on architectural tasks? → Rework — a half-applied edit that has to be unwound when a late-discovered constraint invalidates the approach.

## Explore subagent for verbose discovery to preserve main context

Some discovery phases produce **enormous output**: walking a 200-file directory, reading every barrel re-export, dumping the call graph of a sprawling module. Putting all of that in the main conversation evicts the actual question you're trying to answer. The **Explore subagent** is the canonical fix.

The Explore subagent runs its own conversation with its own context window, does the verbose work — Grep, Read, Glob, follow imports until it has the answer — and returns a **summary** to the main session. The main session sees the conclusion, not the noise.

Use Explore when the symptom is "I want to know X, but figuring out X requires reading a lot of irrelevant code first." Examples: *"What public API surface does this package expose?"* — the subagent reads every barrel and returns a concise list. *"Which tests fail when this hook is removed?"* — the subagent scans the test tree and returns a short list. The main session never has to load the intermediate files.

The pattern composes with plan mode: in plan mode, when the design space requires costly read-heavy discovery, **delegate that step to Explore** so the main session keeps the high-level reasoning. When Explore returns, the plan incorporates the summary.

> **Common pitfall** — Reaching for Explore for **every** investigation. It's a context-preservation tool, not a default. If the question can be answered in two Greps and one Read, doing it inline is cheaper than spinning up a subagent.

**Quick recall**
- **Q:** What problem does the Explore subagent solve? → Verbose discovery output flooding the main context window. The subagent does the noisy reading and returns a summary.
- **Q:** Does the main session see the subagent's individual tool calls? → No. It sees only the summary the subagent returns; the intermediate calls live in the subagent's own context.

## Combining: plan mode for investigation + direct execution for implementation

The most exam-tested pattern is **plan-then-execute**: use plan mode to investigate and design, then **exit** and use direct execution to implement. The two modes are not rivals — they are complementary phases of the same workflow.

Concretely, on a library migration: enter plan mode, have Claude map every import of the old library, identify equivalents in the new library, list edge cases (config differences, API changes, removed features), and produce a step-by-step implementation plan. Review the plan, push back on risky parts, refine. Then **exit plan mode** and let Claude execute file by file. If a surprise surfaces mid-execution that invalidates the plan, you can re-enter plan mode for that sub-decision and resume.

This combo is the right answer to *"migrate from library A to library B across 45 files; what workflow?"* The trap distractors are "stay in plan mode the whole time" (you cannot execute writes from plan mode) and "skip plan mode, go straight to direct execution and iterate" (you risk choosing the wrong migration shape). The correct answer separates **investigation** from **implementation** and uses the right mode for each.

> **Common pitfall** — Believing "plan mode is for thinking, direct execution is for typing" and using direct execution to **also** investigate. Investigating in direct execution mode is fine when scope is small, but on architectural changes the lack of a write-free phase tempts the agent to start editing before the design is clear.

**Quick recall**
- **Q:** What's the canonical plan-then-execute workflow? → Plan mode to investigate / design / refine, then exit plan mode to direct execution to implement.
- **Q:** Why not stay in plan mode through the implementation? → Plan mode is read-only; you cannot land writes from inside it. Implementation requires exiting.

---

## Anti-patterns

- ❌ **"Always use plan mode to be safe."** Wastes turns on trivial fixes (typos, single-line patches) where there is no design space.
- ✅ **Plan mode for high-cost / wide-scope / multi-approach changes; direct execution for small, well-scoped fixes.**
- ❌ **"Always use direct execution to be fast."** Gambles on architectural changes — late-discovered constraints force rework that dwarfs any time saved.
- ✅ **Match mode to scope and failure cost, not to a fixed personal preference.**
- ❌ **Treating plan mode as "preview before applying."** It is not a dry run of a staged diff; it is a read-only investigation phase, no patch waiting.
- ✅ **Treat the *plan* (text) as the artefact, not a queued edit.**
- ❌ **Staying in plan mode to do the implementation.** Plan mode is read-only; you can't land writes from it.
- ✅ **Plan-then-execute: exit plan mode before implementation begins.**
- ❌ **Reaching for Explore for every investigation.** Subagents spend context too; use them when discovery is verbose enough to threaten the main window.
- ✅ **Use Explore for verbose, context-heavy discovery; do small investigations inline.**
- ❌ **Starting in direct execution and "switching to plan mode if it gets complicated."** The complication is already stated in the requirements; reactive switching ignores known scope.
- ✅ **Choose the mode up front from the requirements.**

---

## Worked example — Scenario S2 (Code Generation with Claude Code)

A developer is assigned to **restructure a monolith into microservices**. Dozens of files; service boundaries not pre-decided. Two distractors: (1) "start in direct execution and let boundaries emerge from incremental edits" — risks committing to a boundary, partially refactoring, then discovering a downstream consumer that forces it to move; (2) "comprehensive upfront instructions detailing each service, then direct execution" — assumes you already know the right structure.

The disciplined sequence: **enter plan mode**, ask Claude to map module dependencies. For the read-heavy parts — the dependency graph, the call-site inventory — **delegate to the Explore subagent** so the main session doesn't fill with import lists. Explore returns: "module A depends on B, C; B is also imported by D, E, F; suggested boundaries X / Y / Z." Iterate on the plan in the main session, pick the boundary, list migration order. **Then exit plan mode and execute** file by file. If a surprise surfaces (a circular import the discovery missed), re-enter plan mode for that sub-decision, refine, exit, continue.

Skipping plan mode: three files in, the agent finds a planned boundary cuts through a shared utility used by both halves. Either there's a partial refactor to unwind, or planning happens anyway in a polluted session.

---

## Quick recall (full set)

- **Q:** Plan mode in one sentence? → Read-only investigation mode; Claude can Read / Grep / Glob but cannot Write or Edit.
- **Q:** Two factors that decide which mode? → **Scope** and **failure cost**.
- **Q:** Plan mode is correct for which tasks? → Multi-file, multi-approach, architectural, library-migration, restructuring.
- **Q:** Direct execution is correct for which tasks? → Single-function fix with a clear stack trace, one validation, a typo, well-scoped low-cost changes.
- **Q:** Is plan mode a "preview the patch" feature? → No. Nothing is staged, no diff is queued.
- **Q:** Why does plan mode reduce rework? → It surfaces constraints **before** any edit lands.
- **Q:** Can you commit edits from inside plan mode? → No. Exit to direct execution to land writes.
- **Q:** Plan-then-execute workflow? → Plan mode to investigate, exit, direct execution to implement; optionally re-enter for mid-flight sub-decisions.
- **Q:** What does the Explore subagent do? → Runs verbose discovery in its own context and returns a summary.
- **Q:** When should you reach for Explore? → When discovery would crowd the main context (call graphs, broad test scans, barrel-export traces).
- **Q:** When is Explore overkill? → When two Greps and one Read would answer it inline.
- **Q:** Why is "always plan mode to be safe" wrong? → Wastes turns on trivial changes with no design space.
- **Q:** Why is "always direct for speed" wrong? → Gambles on architectural tasks where late constraints force costly rework.
- **Q:** "Start direct, switch to plan if complicated" on a stated multi-service refactor — why wrong? → Complexity is stated; reactive switching ignores known scope.
- **Q:** One-line config typo with a clear error — plan or direct? → Direct execution.
- **Q:** Migrating a library across 45 call sites — what workflow? → Plan mode for investigation, exit to direct execution for the file-by-file edits.
- **Q:** Where do Explore's intermediate Reads / Greps end up? → In the subagent's own context — the main session sees only the summary.
- **Q:** Surprise constraint mid-execution invalidates your plan — right move? → Re-enter plan mode for that sub-decision, refine, exit, continue.
