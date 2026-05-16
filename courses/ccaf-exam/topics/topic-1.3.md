# Task 1.3 — Subagent invocation, context passing, and spawning

> **Domain 1 · Agentic Architecture & Orchestration** · 27% of the exam
>
> _First study 2026-04-29; revisit 2026-05-02 (rev 2): post-test refreshed with 10 fresh questions on new angles — Task input fields the subagent does/doesn't see at boot, allowedTools=[] for synthesis (cross-spec misuse), placement of persistent constraints in AgentDefinition.system_prompt vs per-invocation Task prompt, and fork_session misuse for routine delegation. Built around Scenario 3 (Multi-Agent Research System)._

## Why this matters

Task 1.2 told you the coordinator should be a hub-and-spoke orchestrator. Task 1.3 is where that abstraction lands on real machinery: **the Task tool**, the **AgentDefinition** config, and the **invocation prompt**. Get any of these three wrong and the orchestration silently degrades — the subagent never spawns, or spawns with empty context, or all four subagents do the same thing because their definitions overlap. The exam loves to surface this as scenario diagnosis questions where the symptom (e.g., "the synthesis report is missing citations") is downstream, but the root cause is in how the coordinator spawned the subagent.

The four most-tested intuitions you must internalise here:

1. The **Task tool** is the spawning mechanism, and `allowedTools` must include `"Task"` for the coordinator — otherwise it can't spawn at all.
2. Subagents have **isolated context** (carried over from 1.2), so the coordinator must hand-pass everything the subagent needs in the invocation prompt.
3. **Parallel subagents** are emitted as multiple `Task` calls in a **single coordinator turn**, not across separate turns.
4. Coordinator prompts must specify **goals + quality criteria**, not a step-by-step procedure — that's what unlocks the subagent's adaptability.

Almost every scenario question that touches more than one agent touches one of those four ideas.

---

## Task tool as spawning mechanism; `allowedTools` must include `"Task"`

In the Claude Agent SDK, **subagents are spawned via the built-in `Task` tool**. When the coordinator decides to delegate, it emits a `tool_use` block whose tool name is `"Task"` and whose input includes the subagent type and the prompt for that subagent. The runtime intercepts the call, looks up the matching `AgentDefinition`, spawns a new isolated agent with the prompt as its first user message, and returns the subagent's final response back to the coordinator as a `tool_result`.

This means the coordinator's **`allowedTools` list must include `"Task"`**. If it doesn't, the coordinator literally cannot spawn anything — the model can want to delegate, but the runtime won't expose the Task tool, so the coordinator falls back to attempting the work itself in its own context, with all the bloat and lost-in-the-middle problems Domain 5 warns about.

A concrete coordinator config sketch:

```python
coordinator = AgentDefinition(
    name="research_coordinator",
    description="Decomposes research questions and delegates to specialist subagents.",
    allowedTools=["Task"],  # <-- without this, no subagents can be spawned
    system_prompt="You orchestrate research subagents. Decompose, delegate, aggregate."
)
```

And the actual invocation, mid-conversation:

```json
{
  "type": "tool_use",
  "name": "Task",
  "input": {
    "subagent_type": "web_search_agent",
    "prompt": "<focused brief here — see next sections>"
  }
}
```

**Common pitfall:** assuming the coordinator can call subagents "natively" because it's higher up the hierarchy. It can't — `Task` is a tool like any other and must be allow-listed. Strip it from `allowedTools` and the orchestration silently collapses to a single-agent flow.

**Quick recall**
- **Q:** What tool spawns a subagent in the Claude Agent SDK? → The built-in **Task** tool.
- **Q:** What must the coordinator's `allowedTools` include for it to delegate? → `"Task"` — without it, the coordinator can't spawn anything.

## Explicit context passing — subagents do not auto-inherit

Task 1.2 said subagents have isolated context; Task 1.3 says **here's how you compensate**. When the coordinator emits a `Task` call, the **prompt field of that call is the entire universe** the subagent will see at boot. The subagent does not get the coordinator's prior messages, the user's original question, the system prompt, or any prior subagent's output — unless the coordinator copies the relevant pieces into that prompt string.

This drives a specific authoring discipline. For each subagent invocation, the coordinator must include:

- **The original goal** — what the user actually wants. Don't paraphrase it into a sub-task and lose the why.
- **The narrowed scope for this subagent** — the slice of the goal it's responsible for.
- **Constraints** — date ranges, source types, output format, citation rules, length limits.
- **Prior findings, if relevant** — e.g., when invoking the synthesis subagent, the coordinator includes the **complete** outputs of the search and document-analysis subagents in the prompt; the synthesis subagent has no other way to see them.

A concrete scenario-3 example. After the coordinator has run search + document-analysis, the synthesis invocation looks like:

```json
{
  "name": "Task",
  "input": {
    "subagent_type": "synthesis_agent",
    "prompt": "GOAL: Produce a 2-page report on creative-industries adoption of generative AI in 2025, broken out by music, film, and visual arts.\n\nSEARCH RESULTS (from web_search_agent):\n<full list of titles, URLs, snippets>\n\nDOC ANALYSIS (from doc_agent):\n<per-document findings>\n\nQUALITY CRITERIA: every claim must cite a source by ID; flag any claims supported by only one source as 'thin evidence'."
  }
}
```

Notice three things: the **goal is restated**, the **prior findings are copied verbatim** into the prompt (not summarised — see Task 5.6 on losing attribution in summaries), and the **quality criteria** are explicit.

**Common pitfall:** sending a one-liner prompt like `synthesise the search results` and trusting the runtime to wire up prior context. It won't — the subagent sees only what's in `prompt`. Anything missing is invisible.

**Quick recall**
- **Q:** How does the coordinator give a subagent context? → By writing it into the **prompt** field of the `Task` invocation. The subagent sees nothing else.
- **Q:** When invoking a synthesis subagent, what goes in the prompt? → The original goal, scope, constraints, and the **complete** outputs of any prior subagents whose results synthesis depends on.

## AgentDefinition: descriptions, system prompts, tool restrictions

An **AgentDefinition** is the static config that defines a subagent type before any invocation happens. The coordinator picks which definition to use via `subagent_type` in the `Task` call. The definition has three parts that the exam will probe:

- **Description** — a short, role-focused string that tells the coordinator (and a human reader) what this subagent does. The coordinator's model uses descriptions to choose the right `subagent_type` for each delegation, so the description must distinguish this agent from siblings (e.g., `web_search_agent` vs `doc_analysis_agent`).
- **System prompt** — the persistent instructions for the subagent's own model: its role, output format, tone, what it must always do, what it must never do. This is what specialises a generic Claude into "a synthesis specialist that emits cited bullet lists" or "a search specialist that returns title/URL/snippet triples."
- **Tool restrictions** (`allowedTools`) — the **scoped** tool list for this subagent. A web search subagent's `allowedTools` is usually `["web_search"]`; a doc agent's is `["read_document", "extract_text"]`; a synthesis agent often has **no tools** at all because it just reasons over the prompt. Restrictions matter for two reasons: they prevent cross-specialisation misuse (synthesis trying to web-search and producing junk — Task 2.3) and they keep the per-subagent tool count low enough that selection stays reliable (Task 2.3 again — 18 tools in one agent degrades selection vs. 4–5).

A concrete shape:

```python
synthesis_agent = AgentDefinition(
    name="synthesis_agent",
    description="Combines structured findings from search and document subagents into a cited report. Emits Markdown.",
    allowedTools=[],  # synthesis reasons over its prompt; no tools needed
    system_prompt="You are a synthesis specialist. You receive structured findings and produce a cited report. Every claim cites a source by ID. If evidence is thin, say so explicitly."
)
```

**Common pitfall:** writing vague descriptions like "helps with research" or "does analysis." The coordinator's model can't pick reliably between two subagents whose descriptions overlap. Descriptions are how the coordinator routes — make them disjoint and specific.

**Quick recall**
- **Q:** What three pieces does an AgentDefinition typically include? → Description (used for routing), system prompt (specialisation), and `allowedTools` (scoped tool list).
- **Q:** Why scope each subagent's `allowedTools` narrowly? → Prevents cross-specialisation misuse and keeps per-agent tool counts low so selection stays reliable.

## Structured data formats with attribution metadata when passing context

When the coordinator passes the output of one subagent into another's prompt, it must use a **structured format that separates content from metadata** — not a free-text paragraph. Each finding should carry its **attribution**: source URL, document name, page number, retrieval timestamp, confidence, whatever's relevant. The synthesis subagent (and any downstream report subagent) needs that metadata to cite correctly. Lose the attribution at this hop and you lose it forever — Task 5.6 calls this out as the canonical provenance failure.

A reasonable shape — JSON, YAML, or a tightly-formatted Markdown table — looks like:

```json
{
  "findings": [
    {
      "id": "F1",
      "claim": "60% of major film studios used GenAI in pre-visualisation in 2025.",
      "source": {"type": "industry_report", "name": "Studio Tech 2025 Q3", "page": 12, "url": "..."},
      "retrieved": "2026-04-15"
    },
    {
      "id": "F2",
      "claim": "Universal Music banned GenAI vocal cloning in artist contracts.",
      "source": {"type": "news", "outlet": "Billboard", "url": "...", "date": "2025-09-14"}
    }
  ]
}
```

Synthesis can now reference findings by `id` (`F1`, `F2`) in its output, and the report subagent can trace each citation back to its source. If instead the search subagent had returned `"60% of studios use GenAI; Universal banned vocal cloning"` as prose, the synthesis subagent would have to either drop citations entirely or invent attribution — both failure modes the exam tests for.

**Common pitfall:** treating subagent outputs as freeform prose. The coordinator's job is to **enforce a structured contract** between subagents — that's what keeps attribution intact across the pipeline.

**Quick recall**
- **Q:** What format should subagent outputs use when feeding them into another subagent? → A structured format (JSON, table, etc.) that **separates content from attribution metadata** (URLs, document names, dates).
- **Q:** Why does the structure matter at the coordinator hop? → Because the next subagent needs the metadata to cite correctly; lose it here and provenance is irrecoverable downstream (Task 5.6).

## Parallel subagents in a single coordinator turn (multiple Task calls)

The coordinator achieves parallelism by emitting **multiple `Task` tool calls in the same assistant turn** — not by calling one, waiting for the result, then calling the next. The runtime executes parallel `tool_use` blocks concurrently and surfaces all the `tool_result` blocks back to the coordinator together in the next turn.

A concrete shape — the coordinator's response contains three Task blocks side-by-side:

```json
[
  {"type": "tool_use", "name": "Task", "input": {"subagent_type": "search_agent", "prompt": "...music subdomain..."}},
  {"type": "tool_use", "name": "Task", "input": {"subagent_type": "search_agent", "prompt": "...film subdomain..."}},
  {"type": "tool_use", "name": "Task", "input": {"subagent_type": "search_agent", "prompt": "...visual arts subdomain..."}}
]
```

All three subagents start at roughly the same time. When all three finish, the coordinator gets three parallel `tool_result` blocks in one tool-result message, then synthesises in the next turn. **Wall-clock latency drops from 3× a single search to roughly 1×.**

The contrast — and the exam's favourite distractor — is the coordinator that does:

> Turn 1: emit one Task call (music). Turn 2: receive result, emit Task call (film). Turn 3: receive result, emit Task call (visual arts).

That's serial, not parallel. The total latency is 3× and you've gained nothing over a single sequential subagent. The fix is structural: emit all three Task calls in the **same** assistant turn.

A second subtle point: parallel subagents have **independent isolated contexts**, so they can't conflict — but they also can't see each other's progress. That's exactly why Task 1.2's scope-partitioning rule matters: parallel subagents must be given **disjoint slices** in their respective prompts, or they duplicate work.

**Common pitfall:** spawning subagents one at a time across consecutive turns and calling it "parallelism." It isn't — parallelism in the SDK is defined by multiple `Task` calls in **one** coordinator response.

**Quick recall**
- **Q:** How does a coordinator spawn subagents in parallel? → Emit **multiple `Task` tool-use blocks in a single assistant turn** — the runtime executes them concurrently.
- **Q:** Why is "Task call → wait → Task call → wait" not parallel? → Each turn is sequential; the wall-clock cost is the sum, not the max. True parallelism requires all `Task` calls in one turn.

## fork_session for divergent exploration from a shared baseline

`fork_session` is a session-management primitive (it also shows up in Task 1.7) that lets the coordinator **branch off the current session into multiple independent forks that share the same starting context**. Each fork can then explore a divergent approach without polluting the others. When the coordinator wants to compare alternative solutions, design directions, or hypotheses against the same baseline, fork_session is the right tool.

The mental model: a normal `Task` call spawns a subagent with a **fresh empty context** and only sees what's in the prompt. `fork_session` instead **clones the current session** — system prompt, prior tool results, the running analysis — and runs each fork from there. The forks are siblings, parallel branches off the same trunk; the coordinator collects each fork's outcome and decides which (if any) to keep.

A worked use case: the coordinator has spent several turns analysing a research topic and built up a shared analysis baseline. It now wants to **compare three synthesis strategies** — chronological narrative, per-subdomain comparison, and per-source-type breakdown — without restarting the analysis three times. It forks the session three ways, runs each fork's synthesis from the same baseline, and picks the one whose output best fits the user's stated quality criteria. None of the forks see each other.

The line between `Task` and `fork_session` to keep clean for the exam:

- **Task** → fresh isolated subagent, gets only what's in the prompt. Use for routine delegation where the subagent doesn't need history.
- **fork_session** → branch off the current session with all its built-up context. Use for **divergent exploration from a shared baseline** when re-establishing the baseline in each prompt would be expensive or lossy.

**Common pitfall:** using `Task` for divergent exploration and re-pasting the baseline into every prompt — works, but burns tokens and risks dropping nuance. Or, the inverse, using `fork_session` for routine delegation and inheriting context the subagent doesn't need (which violates the isolated-context principle for plain delegation).

**Quick recall**
- **Q:** What does `fork_session` do that `Task` doesn't? → Branches the **current session** (with all its built-up context) into independent forks; `Task` spawns a fresh isolated subagent with only the prompt.
- **Q:** When is `fork_session` the right choice? → When you need to explore **divergent approaches from a shared analysis baseline** — comparing alternative solutions or strategies that all start from the same accumulated context.

## Goal-oriented coordinator prompts (not procedural)

The coordinator's prompts to subagents (and the coordinator's own system prompt) should specify **research goals and quality criteria**, not a step-by-step procedure. The reason is in the orchestration premise: subagents are specialists; they know how to do their job; what they need from the coordinator is **what counts as success**, not a transcribed checklist of clicks.

Concretely, compare two prompts to the same web search subagent:

**Procedural (worse):**
> "First search Google for 'generative AI music 2025'. Then click on the first three results. Then summarise each. Then return the summaries."

**Goal-oriented (better):**
> "GOAL: Find authoritative recent evidence on generative-AI adoption in the music industry in 2025. SCOPE: industry reports and major news outlets, English language. CONSTRAINTS: prefer sources from 2025; flag anything older than 2024. OUTPUT: 5–8 findings as `{id, claim, source: {type, name, url, date}}`. QUALITY: every claim must trace to a single named source; if evidence is thin, say so explicitly."

The goal-oriented version lets the subagent adapt — pick the best search strategy, skip dead-ends, return early when it has enough evidence — while still being held to a measurable standard. The procedural version locks the subagent into one execution path that may not match what the search tool actually surfaces, and provides no quality bar so the result is "whatever happened."

This same principle applies to the coordinator's *own* system prompt: it should say "decompose research goals into focused subtasks; partition scope to minimise duplication; iteratively refine until coverage matches the user's stated scope" — not "always invoke search → docs → synthesis → report in that order." The latter is a fixed pipeline (anti-pattern from Task 1.2) hiding inside a coordinator's prompt.

**Common pitfall:** writing procedural prompts to "make the subagent reliable." It does the opposite — it removes the subagent's ability to recover from edge cases the procedure didn't anticipate. Goals + criteria > steps.

**Quick recall**
- **Q:** Should coordinator prompts to subagents specify steps or goals? → Goals plus quality criteria. Steps lock the subagent into one path and remove its adaptability.
- **Q:** What does a goal-oriented prompt include? → The goal, scope, constraints, output shape, and quality criteria — not a click-by-click procedure.

---

## Anti-patterns

- ❌ **Coordinator missing `Task` in `allowedTools`.** Looks like a normal config; quietly disables all delegation — the coordinator falls back to single-agent.
- ✅ **Include `"Task"` in the coordinator's `allowedTools` so it can spawn subagents.**
- ❌ **Empty/minimal subagent prompt.** `Task({prompt: "synthesise the results"})` — assumes the subagent inherits context. It doesn't; the prompt is the entire universe.
- ✅ **Pass goal, scope, constraints, and prior findings explicitly in every Task prompt.**
- ❌ **Vague AgentDefinition descriptions.** Two subagents with overlapping descriptions ("does research", "helps research") confuse the coordinator's routing.
- ✅ **Write specific, disjoint descriptions so the coordinator's model can route reliably.**
- ❌ **Free-form prose between subagents.** Search returns "Universal banned vocal cloning, studios use GenAI more, ..." with no IDs or sources. Synthesis can't cite.
- ✅ **Use a structured format (JSON / table) with attribution metadata for inter-subagent data.**
- ❌ **Sequential Task calls labelled "parallel."** Task in turn 1, wait, Task in turn 2 — wall-clock cost is the sum.
- ✅ **Emit all parallel Task calls as multiple `tool_use` blocks in a single coordinator turn.**
- ❌ **Procedural coordinator prompts.** "First do X, then Y, then Z" removes subagent adaptability and locks the path.
- ✅ **Specify goal, scope, constraints, output shape, and quality criteria — not steps.**
- ❌ **Using `Task` when `fork_session` is right.** Re-pasting a long shared baseline into every Task prompt burns tokens and may lose nuance.
- ✅ **Use `fork_session` for divergent exploration from a shared, expensive baseline.**
- ❌ **Using `fork_session` when `Task` is right.** Forking the entire session for routine delegation pollutes the subagent with context it doesn't need.
- ✅ **Use `Task` for routine delegation — the isolated, prompt-only context is the feature.**

---

## Worked example — Scenario 3 (Multi-Agent Research System)

User request: *"Write a 2-page report on how creative industries are adopting generative AI in 2025."*

**Coordinator config (boot).** AgentDefinitions exist for `web_search_agent`, `doc_analysis_agent`, `synthesis_agent`, `report_agent`. Coordinator's `allowedTools` includes `"Task"`. Each subagent's `allowedTools` is scoped: search has `web_search`; docs has `read_document`; synthesis has `[]` (no tools); report has `[]`.

**Round 1 — parallel search.** Coordinator emits **three `Task` calls in one turn**, each invoking `web_search_agent` with a goal-oriented prompt scoped to a different subdomain (music, film, visual arts) and a different source-type slice. All three subagents run concurrently. Each returns structured findings as `{id, claim, source: {…}}` JSON.

**Round 2 — synthesis.** Coordinator gathers the three findings sets, embeds them **verbatim** (with attribution metadata intact) into a synthesis-subagent prompt that restates the user's goal and the quality criterion ("every claim cites a source by ID; flag thin evidence"). Synthesis returns a draft.

**Round 3 — divergent comparison via `fork_session`.** Coordinator wants to compare two report styles (chronological narrative vs per-subdomain comparison) without restarting the analysis. It forks the session twice; each fork invokes `report_agent` with the same draft but a different style brief. Coordinator picks the fork whose output best matches the user's preference signal.

**The bug to watch for.** A coordinator that (a) forgets `"Task"` in allowedTools (no spawning), or (b) sends `Task({prompt: "do the music part"})` with no goal/scope/quality (subagent improvises and the synthesis loses comparability across subdomains), or (c) calls `Task` once per subdomain across three turns instead of three Tasks in one turn (3× wall-clock latency for no benefit). All three are textbook 1.3 failures.

---

## Quick recall (full set)

- **Q:** What tool spawns a subagent in the Claude Agent SDK? → The built-in **Task** tool.
- **Q:** What entry must appear in the coordinator's `allowedTools`? → `"Task"`. Without it, the coordinator cannot delegate.
- **Q:** What does a subagent automatically inherit from the coordinator? → **Nothing.** Context is isolated; the subagent sees only what the coordinator copies into the `Task` invocation prompt.
- **Q:** What three pieces does an AgentDefinition usually carry? → Description (used by the coordinator to route), system prompt (the subagent's specialisation), and `allowedTools` (scoped to the subagent's role).
- **Q:** Why scope `allowedTools` per subagent? → Prevents cross-specialisation misuse and keeps per-subagent tool count low (Task 2.3 — 18 tools in one agent degrades selection vs 4–5).
- **Q:** What format should subagent outputs use when feeding them into the next subagent? → A **structured format** that separates content from attribution metadata (source IDs, URLs, dates, page numbers) — not free-form prose.
- **Q:** How does a coordinator spawn subagents in parallel? → Emit **multiple `Task` tool-use blocks in the same assistant turn** — the runtime executes them concurrently and returns all results together in the next turn.
- **Q:** Why does "Task → wait → Task → wait" fail to deliver parallelism? → Each turn is sequential; total latency is the sum, not the max. True parallelism requires the Task calls to share a single coordinator turn.
- **Q:** Difference between `Task` and `fork_session`? → `Task` spawns a fresh, isolated subagent that sees only its prompt. `fork_session` branches the **current session** (with all its built-up context) so each fork explores a divergent approach from the same baseline.
- **Q:** When is `fork_session` the right choice? → For **divergent exploration from a shared baseline** — comparing alternative solutions/strategies that all start from the same accumulated analysis.
- **Q:** Should coordinator prompts to subagents be procedural or goal-oriented? → Goal-oriented — specify the goal, scope, constraints, output shape, and quality criteria. Procedural prompts lock the subagent into one path and remove its adaptability.
- **Q:** A coordinator emits a single Task call with prompt `"synthesise the results"` and the synthesis is incoherent. What's the most likely root cause? → Empty prompt — synthesis has no goal, no prior findings, no quality criteria. Subagent context is isolated; everything must be passed explicitly.
- **Q:** Beyond the `prompt` field, what does a Task subagent automatically receive from the coordinator's session at boot? → **Nothing.** Boot-time inputs are the subagent's AgentDefinition `system_prompt` plus the `prompt` field of the Task call. The coordinator's history, system prompt, allowedTools, and prior subagent results are all invisible unless copied into the prompt.
- **Q:** Where do persistent role/format constraints belong vs per-invocation goal/scope/criteria? → Persistent constraints (role, output format) belong in the subagent's **AgentDefinition `system_prompt`**; per-invocation goal, scope, and quality criteria belong in the **Task `prompt`** the coordinator emits.
- **Q:** A team uses `fork_session` for every subagent invocation to "save re-pasting context." What goes wrong? → fork_session inherits the entire current session, so routine subagents carry baseline context they don't need — context bloat, irrelevant tangents, blown token budgets. Reserve fork_session for **divergent exploration from a shared baseline**; use **Task** for routine delegation.
