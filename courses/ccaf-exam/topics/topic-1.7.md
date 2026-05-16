# Task 1.7 — Manage session state, resumption, and forking

> **Domain 1 · Agentic Architecture & Orchestration** · 27% of the exam
>
> _First study 2026-04-29; revisit 2026-05-02 (rev 2): post-test refreshed with 10 fresh questions on new angles — `--resume <session-name>` syntax, the stale-tool-result failure mode (refactored function still believed to be old shape), state-sharing semantics of resume vs fork, session-naming discipline as a lightweight handle, targeted re-Read for known file changes, when resume IS the right answer, multi-fork convergence at the coordinator, forking before any baseline exists (anti-pattern), why fork beats parallel subagents for 'compare strategies from a shared baseline,' and what to do when fresh and stale tool results disagree._

## Why this matters

Task 1.7 is the **session-lifecycle** layer of orchestration. Tasks 1.2–1.6 told you how to decompose work and dispatch subagents *within* a session. Task 1.7 tells you what happens **across** sessions: how to come back tomorrow to an investigation you started today, how to spin off a parallel "what if we tried approach B?" branch from a shared baseline, and — critically — when *not* to resume because the cached tool results have decayed into garbage.

The exam tests this with two recurring patterns:

1. **"Resume vs fresh-start"** — a candidate is asked what to do after files have changed since a prior session ended (a colleague refactored, CI ran, dependencies were upgraded). The wrong answer is always "resume the session with `--resume`." The right answer is "start fresh and inject a **structured summary** of what was learned, because the prior tool results are stale and resuming gives the model false confidence." Stale `Read` results, stale `Grep` matches, stale dependency listings — the model treats these as ground truth and reasons over them, producing answers that no longer match reality.
2. **"Branch exploration with `fork_session`"** — a candidate has done expensive shared baseline analysis (mapped a codebase, profiled a workload, gathered requirements) and now wants to compare approach A and approach B without redoing the baseline. The right primitive is `fork_session`: create independent branches from the shared baseline so each branch's exploration cannot leak into the other.

Two recurring wrong answers: (a) "Always resume — it saves tokens." This is the trap; tokens saved on the resume are paid back many times over when the model reasons from stale data. (b) "Just open two new sessions in parallel and re-do the baseline in each." This works but wastes the expensive analysis and risks the two branches drifting in their baseline understanding. `fork_session` is the right primitive.

This task also pairs with Task 5.4 (context management in large codebase exploration). Scratchpad files / structured manifests are how you survive *within* a long session; `--resume` and `fork_session` are how you survive *across* sessions and *across* parallel branches. Together they are the durability story for agentic work.

---

## Named session resumption with `--resume <session-name>`

Claude Code (and the Agent SDK) supports **named session resumption**: a session is given a name when it's started, and `--resume <session-name>` re-attaches to that named session, restoring the conversation history, prior tool results, and accumulated context. This is the right tool when you want to **continue exactly where you left off** — finish an investigation, follow up on findings, ask follow-up questions of an analysis the model already has in context.

Naming sessions matters because investigations live for hours or days. Auto-generated session IDs are forgettable; meaningful names (`auth-refactor-2026-04`, `q2-billing-audit`, `dependency-upgrade-investigation`) let you find and resume the right one. The name is a **stable handle** for the session's accumulated state.

A simplified shape:

```bash
# Start a named investigation session
claude --session-name auth-refactor-2026-04 \
  "Map the authentication subsystem and identify modules touching session tokens."

# ... session ends. Hours or a day later ...

# Resume by name to continue the investigation
claude --resume auth-refactor-2026-04 \
  "Now check whether each of those modules uses the new TokenStore interface."
```

The model picks up with full conversation history and tool-result context intact. The follow-up question reasons over what was already learned without re-running discovery.

The exam likes to surface two extras:

- **Sessions can be resumed multiple times.** A long investigation may span several work blocks; each resume continues from where the last block ended, building cumulative state. The session name is the persistent identifier.
- **Resumption is the right answer when prior context is mostly valid.** "Mostly valid" is the precondition. If the codebase, the data, or the external systems the session reasoned over have changed substantially since the session paused, resumption can mislead the model. That's where the next subtopic comes in.

**Common pitfall:** treating `--resume` as a default for every follow-up. Resumption inherits the prior session's tool results as ground truth. If a colleague merged a PR, if the database state changed, if a dependency was upgraded — the model still believes the cached `Read`/`Grep`/`tool_use` results from before. The exam tests this distinction directly (see "Resume vs fresh-start" below).

**Quick recall**
- **Q:** What does `--resume <session-name>` do? → Re-attaches to a named session, restoring conversation history and prior tool-result context, so the agent picks up exactly where it left off.
- **Q:** Why use named sessions instead of auto-generated IDs? → Names are stable, meaningful handles humans can reliably find days later; IDs are forgettable.
- **Q:** When is resumption the right call? → When prior context is mostly valid — i.e., the underlying systems and files the session reasoned over haven't changed materially since the pause.

## `fork_session` for parallel exploration branches

`fork_session` creates an **independent branch** from a shared session baseline. The fork copies the conversation history and context up to the fork point, but from then on the branches are isolated — neither sees the other's subsequent work. This is the right primitive when you want to **explore divergent approaches** from a common starting point and compare results without contamination.

The canonical exam scenario: you've spent significant analysis time mapping a codebase, profiling a workload, or gathering requirements (the **shared baseline**). Now you want to ask "what if we used approach A?" *and* "what if we used approach B?" The cheap-but-wrong move is to ask both questions in the same session — the second exploration is biased by what was just said about the first. The expensive-but-also-wrong move is to start two fresh sessions and redo the baseline in each — wasted tokens, and the baselines may drift. `fork_session` is the precise fit: one fork per approach, each branch inherits the shared baseline, and each explores independently.

A simplified shape:

```python
# Shared baseline session
baseline = start_session("Map the legacy billing module: dependencies, exports, test coverage.")
baseline.run_until_baseline_complete()

# Fork two branches from the baseline
branch_a = baseline.fork_session(name="refactor-via-strangler-pattern")
branch_b = baseline.fork_session(name="refactor-via-rewrite")

# Each branch explores independently
branch_a.send("Plan a strangler-fig refactor: incremental routes, dual-running phase.")
branch_b.send("Plan a clean-room rewrite: parallel implementation, cutover gate.")

# Compare outputs side by side; baselines are identical, conclusions are independent.
```

Two extras the exam likes to surface:

- **Forking pairs with subagent decomposition (Task 1.3).** A coordinator can fork a session per parallel investigation branch — each branch is a subagent-style exploration that doesn't interfere with the others, but they all share the same baseline analysis. This is more powerful than parallel subagents alone: subagents start with no context, forks start with the full baseline.
- **Forks are independent after the fork point.** Changes one branch makes — new tool calls, new file reads, new conclusions — are not visible to the other branch. That's the whole point: contamination-free comparison.

**Common pitfall:** confusing `fork_session` with `--resume`. Resume *continues* a single session line; fork *splits* the session into independent branches. If you want to compare approaches, fork. If you want to extend the same line of work, resume.

A second pitfall: forking from a stale baseline. If the underlying system has changed since the baseline was captured, both forks inherit the staleness. Use the resume-vs-fresh logic (next section) when deciding whether the baseline itself is still trustworthy.

**Quick recall**
- **Q:** What does `fork_session` produce? → Independent branches from a shared session baseline; branches inherit history up to the fork point but not each other's subsequent work.
- **Q:** Canonical use case? → Comparing divergent approaches (refactoring strategies, testing strategies, architecture options) from an expensive shared analysis baseline without redoing it per branch.
- **Q:** Fork vs resume? → Fork splits one session into independent branches; resume continues one session line.

## Resume vs starting fresh: the staleness tradeoff

This is the highest-stakes 1.7 decision and one of the most-tested patterns in Domain 1. The rule:

- **Resume** when prior context is **mostly valid** (the files and systems the session reasoned over haven't changed materially).
- **Start fresh with an injected structured summary** when prior tool results are **stale** (something has changed since the session paused).

Why fresh-with-summary, instead of resume? Because **stale tool results are worse than no tool results**. A resumed session inherits cached `Read` content, `Grep` matches, `Bash` outputs, MCP responses — and *the model treats these as authoritative*. If a file was edited yesterday, the cached `Read` shows the old content; the model reasons over the old content; the answers are wrong but presented confidently. There's no signal to the model that the data is stale.

A fresh session has no such illusion. The model knows it has only what you provided. If you provide a **structured summary** of what was learned previously — a manifest with file paths, key findings, decisions made, open questions — the model has the *facts* without the *stale tool results*. When it needs current data, it re-queries the tools and gets actual current results.

A simplified summary payload (bold labels stand in for section headers in the actual file):

```markdown
# Session summary — auth-refactor investigation (snapshot 2026-04-28)

**Files in scope** (re-read as needed; cached content is now stale)
- src/auth/session.py
- src/auth/token_store.py
- src/auth/middleware.py

**Key findings**
- session.py uses the legacy TokenStore.get_raw_token (deprecated).
- middleware.py has 3 call sites that bypass the new validation hook.

**Decisions**
- Migration target is the new TokenStore.read_token interface.

**Open questions**
- Does middleware.py's bypass have a test?
- What does CI say about the auth/* changes from PR #421 (merged today)?
```

The fresh session reads this summary, then re-runs the tools it needs. It pays the cost of a few re-reads but gains a guarantee that what it reasons over is current.

The exam tests three sub-patterns:

- **"Files have changed since the prior session"** → start fresh with a summary. The cached `Read` results are now wrong.
- **"A PR merged that touched the area we were investigating"** → start fresh with a summary. Even if our specific files weren't in the PR, downstream behaviour may have shifted.
- **"The investigation is paused mid-flight, no external changes have happened"** → resume is fine. Nothing has invalidated the cached results.

**Common pitfall:** assuming "resume saves tokens, so resume by default." The token savings are tiny relative to the cost of the model confidently reasoning from stale data. The exam consistently treats "resume despite known external changes" as the wrong answer; "start fresh with a structured summary" is the right one.

A second pitfall: starting fresh *without* a summary. The model now has no context — it has to redo discovery from scratch, wasting the prior investigation's value. The summary is what makes "fresh" cheaper than "resume + correct" in expectation.

**Quick recall**
- **Q:** When is starting fresh better than resuming? → When prior tool results are stale (files edited, PRs merged, dependencies upgraded, data changed) — cached results in a resumed session mislead the model.
- **Q:** Why is "fresh + structured summary" the right answer rather than just "fresh"? → The summary preserves the prior session's *facts and decisions* without dragging along its *stale tool results*. Best of both worlds: cheap context, current data.
- **Q:** What's the failure mode of resuming with stale results? → The model treats cached `Read`/`Grep`/`Bash` outputs as ground truth and reasons confidently over outdated data.

## Informing a resumed session about file changes for targeted re-analysis

A useful middle ground between full-resume and full-fresh: **resume + targeted re-analysis**. When prior context is mostly valid but a few specific files have changed, you can resume the session and *explicitly inform it* about which files changed and why. The session re-reads exactly those files, re-runs analysis only in the affected areas, and preserves everything else.

This avoids two failure modes simultaneously: it doesn't blindly trust stale cache (you've told the model what's stale), and it doesn't redo the entire investigation (you've scoped the re-analysis precisely).

A simplified shape:

```bash
claude --resume auth-refactor-2026-04 \
  "PR #421 just merged. The following files changed since our last session: \
   src/auth/middleware.py (validation hook moved to a new module), \
   src/auth/session.py (added refresh-token field). \
   Re-read those two files and update the migration plan accordingly. \
   Other files in our analysis are unchanged."
```

The model knows precisely what to re-verify. It re-runs `Read` on the two named files, integrates the new content with the prior analysis, and updates conclusions. Files outside the scope keep their cached state, which is still valid.

This is also where Task 5.4's **structured agent state exports** become useful: a manifest the session writes at pause time can be diffed against the current repo state at resume time, producing the precise list of files to re-read. The manifest acts as the "what we knew, when" anchor.

**Common pitfall:** resuming with vague language ("things may have changed, please re-check"). The model has no scope and either re-does too much (defeats the purpose of resuming) or re-does too little (still trusts most stale cache). Be **explicit and surgical** about which files changed and why.

**Quick recall**
- **Q:** When is "resume + targeted re-analysis" the right call? → When prior context is mostly valid but a small, named set of files has changed — explicit scoping lets the session re-verify only what's stale.
- **Q:** What makes targeted re-analysis effective? → Naming the changed files and the nature of the change explicitly. Vague "things may have changed" prompts produce either over- or under-correction.

## Structured summaries when starting fresh — the alternative to unreliable resume

When the staleness blast radius is too wide for targeted re-analysis (many files changed, dependencies upgraded, the underlying data store mutated), the right move is fresh-start-with-summary. The summary's quality determines whether "fresh" is faster or slower than "resume + correct."

A good summary is a **structured handoff payload**, similar to the structured handoff between coordinator and subagent (Task 1.4). It includes:

- **Scope:** which files / modules / systems were under investigation.
- **Key findings:** the substantive conclusions, with the supporting evidence in summary form (not raw tool output).
- **Decisions made:** what's been settled (architecture choice, migration target, severity classification).
- **Open questions:** what wasn't yet answered, so the resumed work knows where to pick up.
- **Provenance markers:** if specific findings depend on tool results that are now stale, flag them so the new session re-verifies before relying on them.

A simplified comparison:

| | Resume with stale cache | Fresh + structured summary |
| --- | --- | --- |
| Tokens to start | Low (history reused) | Medium (summary + first re-queries) |
| Risk of reasoning from stale data | High (no signal to model) | Low (summary states facts; tools re-queried) |
| Cost of recovery if wrong | Very high (silent bad answers) | Low (re-query the missing piece) |
| When to use | Nothing has changed | Anything material has changed |

The summary is also what lets a fresh session **fork** without losing the baseline: write the summary, start a fresh session per branch, inject the summary in each. Each branch has the same starting facts but fresh tool calls; explorations are independent and current.

**Common pitfall:** treating the summary as optional. A fresh session without a summary forces the model to redo the entire prior investigation from scratch — slow, expensive, and may not converge on the same conclusions. The summary is the *cheap* way to transfer accumulated knowledge without transferring stale tool results.

**Quick recall**
- **Q:** What does a good summary contain? → Scope, key findings, decisions made, open questions, and provenance flags on findings whose supporting tool results may be stale.
- **Q:** Why is "fresh + summary" not just "fresh"? → The summary preserves prior facts and decisions cheaply; without it, the new session has to redo the entire investigation.
- **Q:** Why is "fresh + summary" usually preferable to "resume + stale cache"? → Recovery cost when stale data is wrong is very high (silent bad answers); a summary-driven fresh session re-queries tools and gets current data.

---

## Anti-patterns

- ❌ **Defaulting to `--resume` for every follow-up.** Token savings are tiny compared to the cost of the model confidently reasoning from stale tool results.
- ✅ **Apply the staleness tradeoff: resume only when prior context is mostly valid.**
- ❌ **Resuming despite known external changes.** A merged PR, a dependency upgrade, a touched file since the session paused — any of these invalidates portions of the cached state. The model has no signal to know; answers go silently wrong.
- ✅ **Start fresh with a structured summary when external state has materially changed.**
- ❌ **Starting fresh with no summary.** Throws away the prior investigation; the new session redoes discovery from scratch.
- ✅ **Pair fresh-start with a structured summary (scope, findings, decisions, open questions).**
- ❌ **Confusing `fork_session` with `--resume`.** Fork splits into independent branches; resume continues one session line. Wrong primitive → contaminated comparison or duplicated baseline work.
- ✅ **Use `fork_session` to compare divergent approaches; use `--resume` to continue one line of work.**
- ❌ **Forking from a stale baseline.** Both branches inherit the staleness; the comparison is biased before the first fork-prompt runs.
- ✅ **Validate or refresh the baseline before forking when underlying systems may have moved.**
- ❌ **Vague "things may have changed, please re-check" prompts on a resume.** Forces the model to either re-do too much or trust too much.
- ✅ **Be explicit and surgical: name the changed files and the nature of the change.**
- ❌ **Anonymous/auto-generated session IDs for long-running investigations.** Auto IDs are forgettable; future-you can't find the session days later.
- ✅ **Use meaningful session names like `auth-refactor-2026-04` — durable handles humans can recall.**
- ❌ **Comparing approaches in a single session.** The second exploration is biased by what was said about the first.
- ✅ **Fork once per approach so each branch explores independently from the same baseline.**

---

## Worked example — Scenario 2 (Code Generation with Claude Code) and Scenario 4 (Developer Productivity)

**Scenario 2 angle — multi-day refactor.** A developer starts an investigation session named `auth-refactor-2026-04` to map the authentication subsystem and plan a migration to a new TokenStore interface. The first work block produces a list of 15 affected modules and a recommended phased plan. Twelve hours later, the developer returns. In the meantime, a teammate merged PR #421, which touched 3 of those 15 modules. The right move is **resume + targeted re-analysis**: `claude --resume auth-refactor-2026-04 "PR #421 changed src/auth/middleware.py and src/auth/session.py — re-read those two files and update the migration plan. Other files are unchanged."` The session re-reads exactly those files, integrates the new content, and updates conclusions surgically. Compare with a naive `--resume` ("continue where we left off") that would happily reason over the now-stale cached content of middleware.py — producing a "plan" that doesn't match reality.

**Scenario 4 angle — comparing refactor strategies.** A team wants to evaluate two approaches for migrating the legacy billing module: a strangler-fig pattern (incremental routes with dual-run) vs a clean-room rewrite (parallel implementation, single cutover). The expensive shared baseline is the structural map of billing.py — exports, dependencies, test coverage, business rules. The right shape: complete the baseline analysis once in a session named `billing-baseline`. Then `fork_session` twice — `billing-baseline-strangler` and `billing-baseline-rewrite`. Each branch sends its approach prompt and explores independently. Each fork inherits the same baseline (no drift), and neither contaminates the other (each conclusion is independent). Compare with the wrong move: asking the same session to compare both approaches in turn, which lets the first analysis bias the second.

**Why these scenarios test 1.7 cleanly.** Scenario 2 tests resume vs fresh — the staleness call. Scenario 4 tests fork vs alternatives — the divergent-branch call. Both are recurring exam patterns; both have unambiguously right answers if the candidate has internalised the trade-offs.

---

## Quick recall (full set)

- **Q:** What does `--resume <session-name>` do, and when is it the right call? → Re-attaches to a named session, restoring conversation history and tool-result context. Right when prior context is *mostly valid* — no material changes to the underlying files/systems.
- **Q:** Why named sessions over auto-generated IDs? → Names are durable, meaningful handles humans can find days later. IDs are forgettable for long-running investigations.
- **Q:** What is `fork_session`, and when is it the right primitive? → Creates independent branches from a shared session baseline. Right when comparing divergent approaches (refactor strategies, testing strategies) without redoing the expensive baseline analysis per branch.
- **Q:** Fork vs resume? → Fork splits a session into independent branches; resume continues a single session line. Wrong primitive → wrong outcome.
- **Q:** When is "start fresh with a structured summary" better than "resume"? → When prior tool results are stale: files edited, PRs merged, dependencies upgraded, external state changed. Cached results in a resumed session mislead the model silently.
- **Q:** What's the failure mode of resuming with stale tool results? → The model treats cached `Read`/`Grep`/`Bash` outputs as ground truth and reasons confidently over outdated data; no signal that anything is wrong.
- **Q:** What makes "fresh + summary" beat "resume + stale cache"? → The summary preserves prior facts and decisions cheaply; the fresh session re-queries tools and gets current data; recovery cost is bounded.
- **Q:** What goes into a good session summary? → Scope, key findings, decisions, open questions, and provenance flags on findings whose supporting tool results may be stale.
- **Q:** When is "resume + targeted re-analysis" the right call? → When most prior context is valid but a named small set of files has changed. Be explicit about which files and the nature of the change.
- **Q:** Why is "vague re-check" prompting on a resume an anti-pattern? → Without a precise scope, the model either re-does too much (defeats resuming) or trusts too much (still uses stale cache). Be surgical.
- **Q:** What's the relation between Task 1.7 and Task 5.4? → 5.4 covers durability *within* a long session (scratchpads, structured manifests). 1.7 covers durability *across* sessions and parallel branches (resume, fork, summary handoffs). The manifests from 5.4 are exactly the artifacts that feed 1.7's structured-summary pattern.
- **Q:** Concrete `--resume` syntax to continue a named session? → `claude --resume <session-name>` (e.g., `claude --resume auth-refactor-2026-04`). Re-attaches to that session's accumulated history and tool-result context.
- **Q:** State-sharing semantics — resume vs fork in one line? → Resume mutates one session linearly; fork creates independent branches that share state up to the fork point and then diverge.
- **Q:** Why is forking *immediately* on a fresh session (before any analysis) misuse of the primitive? → `fork_session`'s value is each branch inheriting an expensive prior baseline. With no baseline yet, you've paid the abstraction cost without earning the benefit — three parallel subagents (Task 1.3) or three independent fresh sessions are the right shape instead.
- **Q:** Why is `fork_session` better than parallel subagents (Task 1.3) for "compare strategies from this morning's analysis"? → Subagent context is isolated; each subagent would have to be hand-fed the morning's analysis through its prompt (lossy + expensive). Forks clone the current session including the built-up analysis, so each fork inherits the baseline natively.
- **Q:** How should a resumed agent behave when fresh tool results disagree with stale ones still in context? → Surface the discrepancy and either ask the user or explicitly note that the prior result is superseded. Silently preferring either source hides the staleness signal that should inform whether to keep resuming or switch to fresh+summary.
- **Q:** Convergence step after multi-fork comparison — what does the coordinator do? → Reads each fork's reported outcome, compares them on the user's stated criteria (risk vs effort vs rollback, etc.), and either recommends a winner or surfaces the trade-offs. Forks stay isolated; the coordinator does the cross-fork comparison.
