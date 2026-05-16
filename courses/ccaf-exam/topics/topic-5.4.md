# Topic 5.4 — Context in large codebase exploration

> **Domain 5 · Context Management & Reliability** · 15% of the exam

## Why this matters

Large codebase exploration is the workflow most likely to **exhaust** an agent's context window. A single repo walk can pull in dozens of files and hundreds of Grep results — and as the window fills, the model's behaviour degrades. This topic is the operational counterweight to Topic 2.5's "incremental discovery": once exploration is unavoidably long, what **disciplines** keep the agent useful?

The exam tests five techniques: recognising **extended-session degradation** (drift to "typical patterns"), persisting findings in **scratchpad files**, isolating verbose work via **subagent delegation**, surviving crashes through **structured state manifests**, and using **/compact** sparingly. The trap is mixing them up — picking `/compact` when the right answer is "save findings to a scratchpad," or spawning a subagent when the right answer is to record a manifest. Scenarios S2 (Code Generation) and S4 (Developer Productivity) lean directly on these patterns.

## Extended-session degradation: drift to "typical patterns"

Extended sessions don't fail with an error — they fail with a slow, quiet **drift toward generic answers**. Early in the conversation Claude has read your project's `CLAUDE.md`, found that you wrap database calls in a `RetryableQuery` helper, and answered specific questions correctly. Sixty turns later, with thousands of tokens of Grep output in between, asking "how should I add retries to this new query?" can produce an answer that uses a generic `try/except + sleep` loop — the **typical pattern** the model has seen across the open-source training distribution. The project-specific helper is still in the message history, but it's buried beneath the noise, and the model's effective attention is dominated by the most recent thousand tokens.

The cause is a mix of long-context attention falloff and the fact that recent verbose output crowds out older, denser instructions. The symptom is **inconsistency**: the same agent that quoted `RetryableQuery` correctly at turn 5 invents a new pattern at turn 60. Treat any extended session that has scrolled hundreds of Grep results as **at risk** — assume drift, and design around it before the wrong code lands.

> **Common pitfall** — Treating long context as a quality feature ("now Claude has *all* of it!"). In practice, more raw tokens past the relevant section make project-specific facts harder, not easier, to surface.

**Quick recall**
- **Q:** What is the canonical symptom of extended-session degradation? → Drift to "typical patterns" — the model reverts to common idioms instead of project-specific ones once the relevant `CLAUDE.md` / earlier findings are buried deep in history.
- **Q:** Is the project-specific fact "gone" from context? → Usually no — it's still in the message history, but its effective attention weight has collapsed under the volume of intervening verbose output.

## Scratchpad files for persisting key findings across context boundaries

The durable fix for drift is not "trust the conversation history" — it is **scratchpad files**: short markdown notes the agent writes (and re-reads) during exploration. Findings live on disk, outside the conversation, and the agent loads them with a cheap Read every time it needs to anchor itself. Unlike the message history, a scratchpad **survives `/compact`, survives a crash, and survives the agent being replaced** by a fresh instance.

A canonical pattern from Scenario S2: an agent exploring a payments codebase writes `notes/exploration.md` after each phase — *"Refund flow: `POST /refunds` → `RefundService.refund()` → `Stripe.refunds.create`; uses `RetryableQuery` wrapper; idempotency key is `refund_${orderId}`."* When a fresh agent picks up the task, reading this 200-token note instantly restores facts that would otherwise have to be rediscovered through dozens of Grep calls. The note is **distilled** — only the load-bearing facts, not transcripts of every file read.

Scratchpads also let an agent **counteract its own drift**: after a long Grep run, write the takeaway *now*, while the right answer is in working memory. On the next ambiguous question, Read the scratchpad first; if its contents conflict with what the agent is about to say, trust the scratchpad — it was written when the evidence was fresh.

> **Common pitfall** — Treating scratchpads as a chat log. Dumping every file the agent read into the file is just relocating the noise. Write **conclusions**, not transcripts.

**Quick recall**
- **Q:** Why is a scratchpad file more durable than message history? → It's on disk: it survives `/compact`, crashes, and agent restarts; the conversation history doesn't.
- **Q:** What goes in a scratchpad? → Distilled findings (file paths, function names, invariants, decisions) — not transcripts of tool output.

## Subagent delegation for verbose exploration

Some questions have **inherently noisy** answers — "find every test that touches the refund table," "trace every caller of `RetryableQuery` through five layers of barrel exports." Running these in the main session pours hundreds of Grep result lines into the coordinator's history, blowing the context budget on raw discovery output the coordinator never needs in detail.

The pattern is **subagent delegation**: spawn a subagent (via the `Task` tool or SDK equivalent), let it run the verbose exploration in **its own** context window, and have it return a **short structured summary** — a few hundred tokens of conclusions, not the raw output. The coordinator's history grows by the summary only; the noise is discarded with the subagent.

A worked example from S4: the user asks "is `LegacyCache.invalidate()` safe to remove?" The coordinator delegates "enumerate every caller of `LegacyCache.invalidate` and any aliases" to an exploration subagent. The subagent runs a Phase-1/Phase-2 trace, reads two dozen files internally, and returns *"7 callers, all in `services/cache-warm/*`, all guarded by an `if (legacy) {}` flag that defaults false; safe to remove after the flag is dropped."* The coordinator gets the answer in a hundred tokens instead of ten thousand.

> **Common pitfall** — Spawning a subagent for a one-Grep question. Delegation has overhead (a separate turn, a separate prompt). Use it when the *output volume* is the problem, not for any task that "feels investigative."

**Quick recall**
- **Q:** What problem does subagent delegation actually solve? → Verbose exploration **output** flooding the main session's context — the subagent absorbs the noise and returns a summary.
- **Q:** What does the coordinator's history grow by after a delegated exploration? → The subagent's **summary**, not its raw tool output.

## Structured agent state exports (manifests) for crash recovery

Real exploration sessions can run for hours and **die** mid-task — a process restart, a network blip, a harness OOM. Without recovery, the next agent instance starts blind. The clean pattern is a **manifest**: a structured state export (JSON or strict-schema markdown) that each agent writes at known checkpoints, recording phase, files-of-interest, findings-so-far, and the next planned step.

When the agent restarts, the coordinator **loads the manifest** and **injects** it into the new agent's initial context. Recovery becomes deterministic: the new instance reads "Phase 2 of 4 complete; payment-flow trace done; refund-flow trace pending; next: Grep `RefundService` callers," and resumes from exactly that point. Without the manifest, recovery is "start over and hope" — operationally a non-starter on a multi-hour exploration.

Manifests differ from scratchpads in *intent*. A scratchpad is **knowledge** (what we learned). A manifest is **state** (where we are in the plan). Mature systems write both: the manifest tells the next agent *what to do next*; the scratchpad tells it *what's already been figured out*. In coordinator/subagent systems, each subagent exports its own manifest and the coordinator loads them on resume.

> **Common pitfall** — Encoding manifests as free-form prose ("we did some Grep stuff and found a thing"). Recovery requires **structured** fields the next agent can parse without ambiguity — phase, status, next step, artifact paths.

**Quick recall**
- **Q:** What does a manifest enable that a scratchpad does not? → Crash recovery — the next agent instance can resume from a known checkpoint instead of starting over.
- **Q:** Manifest vs scratchpad in one line? → Manifest = **state** (plan position); scratchpad = **knowledge** (findings so far).

## /compact to reduce context usage during extended exploration

`/compact` is the explicit Claude Code command that asks the model to **summarise** its conversation history in place, reclaiming context. When an exploration session's history is 80% Grep output and 20% useful reasoning, `/compact` can turn that into a couple of paragraphs of "here's what we've established," giving the agent room to keep going.

The trap is using `/compact` **reflexively** as the first response to a filling window. Compaction is **lossy**: the summary discards detail, and what gets discarded is whatever the model judges less important — which on a long technical exploration can include the exact file paths, function names, and project-specific helpers that prevent drift in the first place. Compact too aggressively and you accelerate the very degradation you were trying to prevent.

The mature pattern: write findings to a **scratchpad** *before* compacting, so the durable copy survives the summarisation; use `/compact` deliberately at logical phase boundaries; and prefer **subagent delegation** for noisy work that hasn't started yet (so it never pollutes the main history) over compacting after the noise is in. "Just `/compact` again" quietly produces the worst extended sessions, because each compaction loses a little more specific detail.

> **Common pitfall** — Treating `/compact` as free. It's lossy. If the load-bearing detail is only in conversation history, compaction will eventually erase it. Save it to a scratchpad first.

**Quick recall**
- **Q:** What does `/compact` do? → Summarises the conversation history in place, reducing token usage at the cost of detail.
- **Q:** Why is "rely on `/compact` to keep going" a long-session anti-pattern? → It's lossy; repeated compaction discards project-specific detail and accelerates drift to "typical patterns."

## Anti-patterns

- ❌ **Trusting long message history to retain project-specific facts.** Effective attention drops; the model drifts to "typical patterns" even though `CLAUDE.md` is technically still in context.
- ✅ **Persist load-bearing findings to scratchpad files; re-read them at decision points.**
- ❌ **Using `/compact` as the first response to a filling window.** Lossy summarisation discards exactly the project-specific detail you needed.
- ✅ **Save findings to a scratchpad first, then compact deliberately at phase boundaries; prefer subagent delegation for noise that hasn't entered the main session yet.**
- ❌ **Running verbose Grep/Read exploration in the main coordinator session.** Floods the window with raw output it doesn't need at full fidelity.
- ✅ **Delegate verbose exploration to a subagent; have it return a short structured summary.**
- ❌ **Free-form prose "state" notes for crash recovery.** "We did some Grep stuff" can't be parsed by the next agent.
- ✅ **Structured manifests with explicit fields (phase, status, next step, artifact paths).**
- ❌ **Treating scratchpads as a chat log — dumping every Grep hit.** Just relocates the noise.
- ✅ **Scratchpads hold distilled conclusions: file paths, function names, invariants, decisions.**
- ❌ **Conflating manifest and scratchpad.** Recording findings under "next step" or plan state under "findings" defeats both.
- ✅ **Manifest = state (plan position); scratchpad = knowledge (what we've learned).**

## Worked example — Scenario S4 (Developer Productivity with Claude)

A senior engineer asks the productivity agent to **audit the refund pipeline before a Stripe migration** — find every code path that touches refunds, every external integration, every retry policy, every test that exercises the flow. This is the kind of task that destroys naive sessions: dozens of files, hundreds of Grep hits, multiple phases, hours of run time.

The disciplined trace:

1. **Entry-point sweep (delegated).** The coordinator delegates "enumerate every route/handler that mentions refund" to an **exploration subagent**. The subagent runs the noisy Grep in its own context and returns a 300-token summary: three entry points with handler files and one-line descriptions. The coordinator grows by the summary, not the raw output.

2. **Scratchpad write.** The coordinator writes `notes/refund-audit.md` capturing the three entry points, the `RefundService` orchestrator, the project-specific `RetryableQuery` and `IdempotencyKey` helpers, and the assumption that Stripe is the sole external integration — distilled, ~400 tokens. This is the durable record that survives compaction.

3. **Manifest checkpoint.** The coordinator writes `state/audit-manifest.json` with `{phase: 2, completed: ["entry-points", "service-trace"], pending: ["test-coverage", "external-integrations"], next: "subagent: enumerate refund-related tests", artifacts: ["notes/refund-audit.md"]}`. If the process dies, the next instance resumes from `pending[0]`.

4. **More verbose work, delegated.** Test enumeration goes to another subagent. On return the scratchpad gains one bullet ("23 tests; 4 hit Stripe live; rest mocked") and the manifest advances.

5. **Deliberate compaction.** Around turn 50 the coordinator uses `/compact` **once**, at a phase boundary, after confirming the scratchpad and manifest are up to date — so nothing load-bearing depends on the soon-to-be-summarised history.

6. **Final report.** When the engineer asks "what should change for the migration?" the coordinator Reads the scratchpad first, anchoring on project-specific helpers, and answers using `RetryableQuery` (project) rather than a generic `try/except + sleep` (typical pattern). Drift averted.

The win is structural: noise stays in subagents, knowledge stays in the scratchpad, plan state stays in the manifest, and `/compact` is used once not six times.

## Quick recall (full set)

- **Q:** What is "drift to typical patterns"? → On extended sessions, Claude reverts to common open-source idioms instead of project-specific ones once the relevant `CLAUDE.md` / earlier findings are buried deep in history.
- **Q:** Is the project-specific fact gone from context when drift happens? → Usually still present in history, but with collapsed effective attention.
- **Q:** Durable fix for drift? → **Scratchpad files** — distilled findings on disk, re-read at decision points.
- **Q:** Scratchpad vs message history? → On disk: survives `/compact`, crashes, agent restarts; message history doesn't.
- **Q:** What problem does subagent delegation solve? → Verbose exploration **output** flooding the main session — the subagent absorbs the noise and returns a summary.
- **Q:** What grows in the coordinator's history after a delegated exploration? → The subagent's **summary**, not its raw tool output.
- **Q:** When is delegation overkill? → For one-Grep questions — overhead exceeds savings.
- **Q:** What does a manifest enable that a scratchpad doesn't? → **Crash recovery** — the next agent resumes from a known checkpoint.
- **Q:** Manifest vs scratchpad in one line? → Manifest = **state** (plan position); scratchpad = **knowledge** (findings).
- **Q:** Why is free-form prose a poor manifest format? → Recovery needs structured fields the next agent can parse without ambiguity.
- **Q:** What does `/compact` do? → Summarises conversation history in place, reducing tokens at the cost of detail.
- **Q:** Why is "rely on `/compact` to keep going" an anti-pattern? → Lossy; repeated compaction discards project-specific detail and accelerates drift.
- **Q:** Right ordering when extended exploration fills the window? → Save findings to scratchpad → prefer subagent delegation for **future** noise → use `/compact` deliberately at phase boundaries, not reflexively.
- **Q:** A fresh agent picks up an interrupted audit. What does it read first? → The **manifest** (where to resume) and the **scratchpad** (what's already established).
