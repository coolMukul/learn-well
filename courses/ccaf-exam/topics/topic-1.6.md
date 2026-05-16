# Task 1.6 — Task decomposition strategies

> **Domain 1 · Agentic Architecture & Orchestration** · 27% of the exam
>
> _First study 2026-04-29; revisit 2026-05-02 (rev 2): post-test refreshed with 10 fresh questions on new angles — capacity-vs-attention framing, plan-as-scratchpad-file for long investigations, skipping the mapping pass (security hardening example), prompt-chain shape for OpenAPI doc generation, raw files vs structured summaries into the integration pass, strict-priority vs dependency-aware adaptation, scripted incident-playbook diagnosis, exploration-subagent isolation for verbose mapping output, the criticality × gap × blast-radius scoring formula, and adaptive-plan misuse for predictable daily-report workflows._

## Why this matters

Task 1.6 is the **strategy** layer of orchestration. Tasks 1.2 and 1.3 told you *how* a coordinator delegates to subagents (hub-and-spoke, isolated context, Task tool, structured payloads). Task 1.6 tells you *how* to slice the original problem into the subtasks the coordinator will then delegate. Pick the wrong decomposition shape and even perfect coordinator/subagent mechanics produce shallow, contradictory, or attention-diluted output.

The exam tests this with two recurring patterns:

1. **"Fixed pipeline vs adaptive plan"** — a workflow that is either (a) predictable and multi-aspect (review every file the same way) or (b) open-ended and discovery-driven (add comprehensive tests to a legacy codebase). Picking the wrong shape is the most common distractor: trying to pre-script an investigation, or trying to "let Claude figure it out" on a workflow whose steps are fixed and known in advance.
2. **"Single mega-prompt vs decomposed passes"** — a candidate is asked to review a 40-file PR or analyze a sprawling repo. Stuffing everything into one prompt causes **attention dilution**: subtle issues drop off, naming inconsistencies span files but no single pass sees them, and confidence drops. The right answer decomposes into per-file local analysis followed by a separate cross-file integration pass.

Two recurring wrong answers: (a) "Use a longer context window so the model sees everything at once" — does not fix attention dilution and may make it worse; (b) "Spawn one subagent per file but let each work in isolation with no integration step" — catches local bugs, misses cross-file inconsistencies. If you can articulate **when** to chain vs adapt and **why** the integration pass is separate, you can answer most 1.6 questions cold.

This task also connects to Task 4.6 (multi-instance / multi-pass review architectures), which is the **prompt-engineering** view of the same idea — the difference is that 1.6 is about *agent workflow shape*, 4.6 is about how individual review prompts are structured. They reinforce each other; the exam may use either lens.

---

## Fixed sequential pipelines (prompt chaining) vs dynamic adaptive decomposition

A **fixed sequential pipeline** is a chain of steps you, the architect, decide in advance. Step 1 always runs, then step 2, then step 3. Each step's output flows into the next. This is **prompt chaining**: a known recipe, executed the same way every time. It works when the workflow is **predictable and multi-aspect** — the steps and their order do not depend on what was discovered along the way.

A **dynamic adaptive decomposition** is the opposite: the agent inspects intermediate findings and *generates the next set of subtasks based on what it just learned*. Step 2 doesn't exist until step 1 finishes and reveals what step 2 should be. This is what you need for **open-ended investigation** where you cannot pre-enumerate the work — the structure of the codebase, the dependency graph, or the data itself dictates what to look at next.

The exam tests the *match* between workflow type and decomposition shape:

| Workflow | Right shape | Why |
| --- | --- | --- |
| "Review every file in this PR for security, style, and tests" | **Prompt chain** (fixed) | Same three aspects per file, predictable order. |
| "Analyze this incident: figure out the root cause" | **Adaptive plan** | Each finding (a 500 in service A) reveals the next thing to look at (service A's recent deploy log). |
| "Generate API docs for every endpoint in this folder" | **Prompt chain** | Endpoints are enumerable; the per-endpoint procedure is identical. |
| "Add comprehensive tests to a legacy codebase with no test plan" | **Adaptive plan** | High-impact areas surface only after structural mapping; priorities shift as dependencies are discovered. |

A simplified shape for the chain pattern:

```python
def review_pr(files):
    results = []
    for path in files:
        local = review_one_file(path)        # step 1: local analysis
        results.append(local)
    integration = cross_file_pass(results)   # step 2: cross-file integration
    return summarize(results, integration)   # step 3: summary
```

A simplified shape for the adaptive pattern:

```python
def investigate(question):
    plan = generate_initial_plan(question)        # mapping pass
    findings = []
    while plan.has_open_subtasks():
        next_task = plan.pop_highest_priority()
        result = run_subtask(next_task)
        findings.append(result)
        plan.update_with_findings(result)         # may add new subtasks
    return synthesize(findings)
```

Notice the loop in the adaptive version. The plan is rewritten as findings come in. New subtasks can be added (a discovered service dependency means a new service to investigate); existing ones can be re-prioritized; dead-ends can be closed.

**Common pitfall:** picking the chain pattern for an open-ended task because chains feel "safer" or "more controlled." The chain locks in a question structure that the data may not match. You end up running steps 2–N on findings that step 1 surfaced as irrelevant, wasting tokens and producing low-signal output. Conversely, picking adaptive decomposition for a predictable workflow burns extra LLM turns on plan-regeneration that adds no information — and introduces nondeterminism into a process that should be uniform.

**Quick recall**
- **Q:** When does a fixed sequential pipeline (prompt chain) fit best? → When the workflow is predictable and multi-aspect: every input goes through the same known steps in the same order.
- **Q:** When does dynamic adaptive decomposition fit? → Open-ended investigation where intermediate findings change what should be investigated next; you cannot pre-enumerate the subtasks.
- **Q:** Cheap mental test? → If you can write down the full list of subtasks before running the agent, chain. If the next subtask depends on what step N returned, adapt.

## Per-file local analysis + cross-file integration pass for code review

Code review is the canonical **prompt-chain** scenario in Domain 1 — and the most common 1.6 exam question. The textbook decomposition is **two passes**:

1. **Per-file local analysis pass.** For each file in the PR, run an isolated review focused on what that file alone reveals: function correctness, local style, missing null checks, test coverage of the functions in *that* file. The model's full attention is on one file's contents. Subtle local issues — a typo in a regex, an off-by-one in a loop, a missing `await` — surface here because nothing else is competing for the model's attention.

2. **Cross-file integration pass.** Take the local findings from pass 1 plus a structured summary (file paths, exported symbols, the local issues found per file) and run a *separate* pass focused only on cross-file concerns: API contracts that changed in file A but weren't updated in file B, naming inconsistencies, duplicate logic that should be factored, integration tests missing for new public surfaces. This pass does not re-do the local analysis; it only looks at what spans files.

The two passes have *different attention profiles*. A single mega-prompt that says "here are 40 files, find every issue" suffers from **attention dilution**: the model has to keep all 40 files mentally active simultaneously, and the per-file detail-finding suffers. Splitting the work means the local pass can be detailed and the integration pass can be wide-angle without competing.

A simplified shape:

```python
def review_pr(file_paths):
    local_findings = []
    for path in file_paths:
        # one prompt per file, each in a fresh context (often via a subagent)
        local_findings.append(local_review_subagent(path))

    # ONE integration prompt with the structured summary, not the raw files
    integration_findings = integration_review_subagent(
        summaries=[f.summary() for f in local_findings],
        api_changes=collect_api_changes(local_findings),
    )

    return merge(local_findings, integration_findings)
```

Two extras the exam likes to surface:

- **Subagent isolation amplifies the benefit.** When each per-file pass runs in its own subagent (Task 1.3), each subagent gets a clean context with only that one file. There's no leakage from prior files. This is *why* per-file decomposition pairs naturally with coordinator-subagent orchestration.
- **The integration pass operates on summaries, not raw files.** Re-feeding all 40 files to the integration pass defeats the purpose. The local pass produces structured findings (file path, exported names, issues, signatures changed) — the integration pass reasons over *that* structured payload.

**Common pitfall:** assuming a longer context window is the answer. A 200K context can hold the 40 files, but it cannot make the model pay equal attention to each. The bottleneck is attention, not raw token capacity. The decomposition fixes the attention problem; widening the context window does not. This same principle is restated in Task 4.6 from the prompt-engineering angle.

**Quick recall**
- **Q:** What does the per-file local pass optimize for? → Detailed local issues that need full attention on one file: typos, off-by-ones, missing local null checks, function-internal style.
- **Q:** What does the cross-file integration pass optimize for? → Issues that span files: API contract drift, naming inconsistencies, missing integration coverage, duplicated logic.
- **Q:** Why not stuff all files into one prompt? → Attention dilution: the model's per-file detail attention degrades, and subtle local issues drop off.

## Adaptive investigation plans that generate subtasks from intermediate findings

For **open-ended investigation** — incident root-cause analysis, security audits with no pre-defined surface, "explain why this metric regressed" — there is no fixed list of subtasks. The right approach is an **adaptive investigation plan**: a coordinator that runs an initial probe, examines what came back, and *generates the next round of subtasks based on what it just learned*.

The shape is a loop, not a pipeline. After every round of findings, the plan is updated:

- Promising leads gain priority and may spawn child subtasks (a 500-error trace points to service A → spawn "inspect service A's recent deploys" and "check service A's downstream dependencies").
- Dead-ends are closed (the database is healthy → drop the database-dive subtask).
- Newly-discovered scopes are added (the trace mentions a third-party API — add "check vendor status page").

The coordinator's job between rounds is **plan revision**: read the latest findings, update the open-subtask list, and pick the next batch to dispatch (often as parallel subagents, Task 1.3). The investigation terminates when the plan has no open subtasks above a relevance threshold *or* when a sufficient answer has converged.

This pairs naturally with coordinator-subagent orchestration (Task 1.2): the coordinator owns the plan; subagents execute individual probes with isolated context and return structured findings; the coordinator integrates and revises. The plan itself can be a scratchpad file (Task 5.4) so it survives context turnover during long investigations.

**Common pitfall:** scripting the investigation as a fixed chain because that feels more controllable. A scripted incident-response playbook ("step 1 check logs, step 2 check metrics, step 3 check deploys") will dutifully execute every step even on incidents where step 1 already produced the answer — and will fail to follow the lead it produced. The exam treats the scripted version as the wrong answer; the adaptive plan is the right one.

**Quick recall**
- **Q:** What's the loop in an adaptive plan? → Run the next subtask → ingest findings → revise plan (add/drop/reprioritize subtasks) → repeat until done.
- **Q:** Why is a scripted playbook the wrong answer for open-ended investigation? → It cannot follow the leads its own findings produce; it executes a fixed structure even when the data points elsewhere.
- **Q:** Where does the plan live across long investigations? → A scratchpad file the coordinator reads/writes between rounds, so context turnover does not lose the plan.

## Mapping → prioritization → dependency-aware adaptation for open-ended tasks

The canonical Skills-in example is "**add comprehensive tests to a legacy codebase**." There's no test plan, no obvious starting point, hundreds of files, intricate cross-module dependencies. Pre-enumerating the subtasks ("write tests for util.py, then for db.py, then for handlers.py") doesn't work because you don't yet know which files matter most, which paths are uncovered, or which modules other modules depend on.

The correct decomposition is a three-phase adaptive shape:

1. **Mapping pass.** First produce a structural map of the codebase: directory layout, public exports per module, dependency graph (who imports whom), existing test coverage per module if any. This pass is broad and shallow; it doesn't write tests, it produces an artifact the next phase can prioritize over. Often delegated to an exploration subagent so the verbose discovery output stays out of the coordinator's context (Task 5.4).

2. **Prioritization pass.** Score modules by impact: `business_criticality × current_coverage_gap × downstream_blast_radius`. The output is a ranked list of modules to test, with explicit reasoning per item ("auth/session.py: critical for login, currently 0% covered, used by 12 downstream modules — top priority"). The model now has a plan grounded in the actual structure, not in guesses.

3. **Dependency-aware adaptive execution.** Walk the priority list, but adapt as you go: when you start writing tests for module A, you may discover that module A's behaviour depends on module B's contract in a way the mapping missed. The plan updates: add "clarify B's contract" as a prerequisite subtask, defer A's tests until B is locked. Modules whose dependencies turn out to be already-tested move down the list. The plan is not static — discoveries during execution feed back into prioritization.

This is the "map → prioritize → adapt as dependencies are discovered" shape the excerpt names directly. It applies beyond test-writing: documentation generation for a legacy system, security hardening, dependency upgrades, deprecation cleanups — anything where you cannot pre-enumerate work because the structure of the codebase dictates what matters.

A simplified shape:

```python
def add_tests_to_legacy(repo):
    structure = mapping_subagent(repo)            # phase 1: map
    plan = prioritize(structure)                  # phase 2: rank by impact

    while plan.has_remaining():                   # phase 3: adapt
        next_module = plan.pop_top()
        result = test_writing_subagent(next_module)
        if result.uncovered_dependency:
            plan.insert_prerequisite(result.uncovered_dependency)
        if result.dependency_already_tested:
            plan.deprioritize_subtree(result.module)
    return plan.completed_modules
```

**Common pitfall:** skipping the mapping pass and letting the coordinator pick modules by name or by alphabetical order. The agent ends up writing tests for whichever module it sees first, missing the high-impact / high-risk modules entirely. The mapping pass is what makes prioritization possible; without it, prioritization degenerates to guessing.

A second pitfall: doing the mapping pass once and then locking the plan. Real codebases reveal dependencies only when you start touching them — the plan **must** stay editable through execution.

**Quick recall**
- **Q:** What are the three phases for an open-ended legacy-codebase task? → Map (structure + coverage), Prioritize (rank by impact), Adapt (revise plan as dependencies surface during execution).
- **Q:** Why is the mapping pass separate from prioritization? → Mapping is broad-and-shallow exploration that produces an artifact; prioritization reasons over that artifact. Mixing them dilutes both.
- **Q:** What keeps the prioritized plan from going stale mid-execution? → Each execution result can revise the plan: add prerequisites, deprioritize already-covered subtrees, surface new high-impact modules.

---

## Anti-patterns

- ❌ **Single mega-prompt for multi-file review.** Dumping 40 files into one prompt and asking for "all issues." Attention dilutes; subtle local issues drop off.
- ✅ **Decompose into per-file local passes + one cross-file integration pass.**
- ❌ **Scripted playbook for open-ended investigation.** Hard-coding "always run step 1, then 2, then 3" for incident response or audits. Cannot follow the leads its own findings produce.
- ✅ **Use an adaptive plan that revises subtasks each round based on findings.**
- ❌ **Adaptive decomposition for predictable work.** Asking the agent to "figure out the steps" for a workflow whose steps are known and uniform (e.g., generating docs for every endpoint). Wastes turns on plan-regeneration and introduces nondeterminism.
- ✅ **Use a fixed prompt chain for predictable, multi-aspect, enumerable work.**
- ❌ **No integration pass after per-file decomposition.** Per-file subagents catch local issues; without a separate integration pass, cross-file naming/contract issues go undetected.
- ✅ **Always run a separate cross-file integration pass — it's mandatory, not optional.**
- ❌ **Re-feeding raw files into the integration pass.** Defeats the decomposition; the integration pass loses its attention budget on the same per-file detail the local passes already covered.
- ✅ **Feed the integration pass only the structured summaries the local passes produced.**
- ❌ **Skipping the mapping phase on open-ended tasks.** Jumping straight to "pick a file and add tests" without first mapping structure and coverage produces work that doesn't track impact.
- ✅ **Map first, then prioritize by criticality × gap × blast radius, then execute.**
- ❌ **Locking the plan after the mapping pass.** Treating the prioritized list as immutable. Real dependencies surface during execution; you'll end up writing tests in the wrong order.
- ✅ **Keep the plan editable — let execution findings revise priorities and add prerequisites.**
- ❌ **Trusting longer context windows to fix attention dilution.** A 200K (or 1M) context holds the files but does not make per-file detail attention uniform.
- ✅ **Fix attention dilution with decomposition; capacity isn't the bottleneck.**

---

## Worked example — Scenario 3 (Multi-Agent Research System) and Scenario 2 (Code Generation)

**Scenario 2 angle — code review.** A coordinator receives a PR touching 22 files across an authentication subsystem. Picking the right decomposition: spawn 22 per-file local-review subagents in parallel (Task 1.3 parallel subagents), each with isolated context and a focused prompt — "review *this one file* for local correctness, style, and missing tests." Each subagent returns a structured payload: `{ path, exported_symbols, issues:[{severity, line, description}], api_changes:[...] }`. The coordinator collects 22 payloads, then runs a **single** integration-pass prompt: "given these 22 file summaries and these collected API changes, identify cross-file inconsistencies, contract drift, missing integration coverage, and duplicated logic." The integration pass sees only the summaries — not the raw files — so its attention is focused on cross-file structure. Result: detailed local findings *plus* the cross-file issues a mega-prompt would have missed.

**Scenario 3 angle — adaptive research.** A research coordinator is asked "is the regression in our deployment latency caused by the new caching layer?" There's no scripted answer. The coordinator generates an initial plan: probe latency metrics by service, probe deployment timeline, probe cache hit rate. The metric probe finds that latency spiked on service A specifically. The plan revises: drop the broad cache-hit probe, add "inspect service A recent deploys" and "check service A's upstream caller pattern." The deploy-history probe finds that service A's caching layer was deployed an hour before the spike. The plan revises again: add "diff cache config" and "check cache eviction rate." After three adaptive rounds the coordinator converges on the answer. Compare with a scripted version that would have run all three initial probes equally and dutifully executed predetermined follow-ups — far slower and far less likely to converge on the actual cause.

**Why this scenario tests Task 1.6 cleanly.** The PR review is *predictable and multi-aspect* — fixed pipeline. The incident investigation is *open-ended and discovery-driven* — adaptive plan. The two examples sit side-by-side on the exam to test whether you can pick the right shape per workflow.

---

## Quick recall (full set)

- **Q:** Fixed pipeline vs adaptive plan — how do you choose? → If you can pre-enumerate every subtask before running the agent, fixed pipeline. If the next subtask depends on what step N produced, adaptive plan.
- **Q:** Why decompose code review into per-file local + cross-file integration? → Per-file pass gets full model attention on local issues; integration pass focuses on cross-file concerns. A single mega-prompt suffers attention dilution.
- **Q:** Does a longer context window solve attention dilution? → No. Capacity isn't the bottleneck — attention is. Decomposition is the fix.
- **Q:** What's the input to the cross-file integration pass? → Structured summaries from the per-file passes (paths, exports, issues, API changes), not the raw file contents.
- **Q:** Why pair per-file decomposition with subagents? → Each subagent gets isolated context with one file, eliminating cross-file leakage and amplifying the attention benefit.
- **Q:** Three phases for open-ended legacy codebase tasks? → Map structure and coverage → Prioritize by impact (criticality × gap × blast radius) → Adapt the plan as dependencies surface during execution.
- **Q:** Why is "scripted incident playbook" the wrong answer for root-cause investigation? → It cannot follow leads its own findings produce; it executes fixed steps even when the data points elsewhere.
- **Q:** Why is "adaptive decomposition" the wrong answer for "generate API docs for every endpoint"? → The work is enumerable and uniform — adaptation adds nondeterminism with no information gain. A fixed chain is correct.
- **Q:** Where does the plan live during a long adaptive investigation? → A scratchpad/manifest file the coordinator reads and rewrites between rounds, surviving context turnover (Task 5.4).
- **Q:** What's the relation between Task 1.6 and Task 4.6? → 1.6 is the agent-workflow shape (chain vs adapt, per-file + integration). 4.6 is the prompt-engineering view of multi-pass review (independent reviewer instances, calibrated confidence). Same principles, different layer.
- **Q:** Does a 1M context window remove the need for decomposition on a 80-file PR review? → No. Capacity isn't the bottleneck — attention is. A 1M window can hold the files but cannot make the model pay equal attention to each. Decomposition (per-file local + cross-file integration) is the structural fix.
- **Q:** Where should a long-running adaptive investigation's plan live? → A scratchpad / manifest file the coordinator reads and rewrites between rounds. Inline in conversation, in the system prompt, or in coordinator memory all fail when context turns over (Task 5.4 callback).
- **Q:** What's the right scoring formula for prioritising modules in 'add tests to legacy codebase'? → `criticality × current_coverage_gap × downstream_blast_radius`, with explicit per-module reasoning. Alphabetical, BFS, or LOC-based ordering all skip the structural impact analysis.
- **Q:** How do you keep the verbose output of a mapping pass from bloating the coordinator's context? → Delegate the mapping pass to an exploration subagent (Task 5.4 pattern). The subagent's verbose output stays in its own isolated context; the coordinator receives a structured summary.
- **Q:** Why is adaptive plan revision wrong for a 'daily compliance report from five known MCP sources' workflow? → The work is enumerable, uniform, and predictable; adaptation introduces non-determinism into a process that should be uniform across runs. A fixed prompt-chain is correct.
