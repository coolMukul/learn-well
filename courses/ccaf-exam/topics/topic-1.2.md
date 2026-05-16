# Task 1.2 — Coordinator-subagent orchestration

> **Domain 1 · Agentic Architecture & Orchestration** · 27% of the exam
>
> _First study 2026-04-29: hub-and-spoke patterns, isolated subagent context, dynamic subagent selection, iterative refinement, scope partitioning. Built around Scenario 3 (Multi-Agent Research System)._

## Why this matters

Task 1.2 is the architectural backbone of Scenario 3 (Multi-Agent Research System) and shows up indirectly in Scenario 1 (Customer Support) whenever a question features more than one agent in the same workflow. The exam consistently probes whether you understand that a coordinator is **not** a thin router — it actively decides who to invoke, what to pass them, and whether the synthesised output covers the original question. Get this wrong and downstream tasks (1.3 on subagent invocation, 1.4 on enforcement, 5.3 on error propagation, 5.6 on provenance) all collapse, because each of those is layered on top of the hub-and-spoke skeleton you build here.

The single most-tested intuition is that **subagents are not little Claudes that share your memory** — they are isolated processes the coordinator must brief explicitly. Almost every "the subagent went off course" or "the synthesis missed half the topic" question in this domain reduces to a coordinator-design failure: too narrow decomposition, missing context, no refinement loop, or comms routed peer-to-peer instead of through the hub.

---

## Hub-and-spoke architecture; routing all subagent comms through coordinator

A coordinator-subagent system follows a **hub-and-spoke** topology: the coordinator is the hub, every specialised subagent (web search, document analysis, synthesis, report generation in Scenario 3) is a spoke, and **all messages flow through the hub**. Subagents do not talk to each other directly. If the synthesis agent needs more web evidence, it returns to the coordinator with a gap report; the coordinator decides whether to re-invoke the search subagent and what query to give it.

This matters because the coordinator is your only point of **observability, error handling, and information control**. A peer-to-peer mesh — where, say, the search agent hands its raw output directly to synthesis — looks faster on a whiteboard but loses three things at once: (1) you can't log the inter-agent traffic in one place; (2) failures cascade unpredictably because each agent has to handle every other agent's error formats; (3) the coordinator can't enforce scope partitioning or deduplicate overlapping work because it never sees the intermediate state.

A simple shape:

```
                          [Coordinator]
                         /  |    |    \
                        /   |    |     \
              [Search] [Docs] [Synthesis] [Report]
```

Every arrow points up to the coordinator and back down again — never sideways.

**Common pitfall:** treating the coordinator as a glorified function that calls subagents in a fixed order and concatenates outputs. That's prompt chaining, not orchestration. The coordinator must read each subagent's result, decide what comes next, and route accordingly.

**Quick recall**
- **Q:** What topology defines a coordinator-subagent system? → Hub-and-spoke — coordinator is the hub, subagents are spokes, all comms flow through the hub.
- **Q:** Why route all subagent communication through the coordinator? → Single point for observability, consistent error handling, and controlled information flow (scope partitioning, dedup, gap detection).

## Subagents have isolated context; do not inherit coordinator history

This is the trap candidates fall into most often. When the coordinator spawns a subagent, that subagent starts with a **fresh, isolated context**. It does **not** automatically see the coordinator's conversation history, the user's original question, prior subagent results, or the running synthesis. If the coordinator needs the subagent to know any of that, the coordinator must **pass it explicitly** in the subagent's invocation prompt.

Concretely, in Scenario 3: the user asks for "a report on creative industries' adoption of generative AI in 2025." The coordinator decides to delegate to a web search subagent. If the coordinator just says `search("generative AI adoption")`, the search subagent has no idea this is about creative industries, no idea the year scope is 2025, and no idea the synthesis agent is going to compare music, film, and visual arts. It returns generic results and the synthesis is broken. The fix is for the coordinator to pass a structured brief: query terms + scope (creative industries, music/film/visual arts) + constraints (2025, English-language sources) + output shape (cite sources, return per-subtopic).

Isolated context is a feature, not a bug — it keeps each subagent's prompt focused, prevents context bloat from accumulated history (relevant to Domain 5), and means subagents can run in parallel without stepping on each other. But it requires the coordinator to be deliberate about what to share and what to omit.

**Common pitfall:** assuming "the subagent already knows what we're working on" because the coordinator does. It doesn't. If you didn't put it in the invocation, it's not there.

**Quick recall**
- **Q:** Does a subagent automatically inherit the coordinator's conversation history? → No — subagent context is isolated; the coordinator must pass relevant context explicitly in the invocation.
- **Q:** Why is isolated context useful? → Keeps subagent prompts focused, prevents history bloat, and enables parallel subagents without cross-contamination.

## Coordinator role: decomposition, delegation, aggregation, dynamic subagent selection

The coordinator has four distinct jobs and the exam likes to probe whether you can name each:

1. **Decomposition** — break the user's request into subtasks that map to the available subagents. For "report on generative AI in creative industries", that means identifying the relevant subdomains (music, film, visual arts), the source types (industry reports, news, academic), and the output shape.
2. **Delegation** — invoke the right subagent with a focused, explicit brief (see isolated context above). The brief includes scope, constraints, and any prior context the subagent needs.
3. **Aggregation** — collect subagent results, normalise them, and assemble them into a coherent input for the next step (often the synthesis subagent).
4. **Dynamic subagent selection** — and this is the one most-often missed — **the coordinator decides which subagents to invoke based on the query, not a fixed pipeline**. A simple factual lookup may need only the search agent; a multi-source comparison needs search + docs + synthesis; a regulatory question may add a citations agent. Always running the full pipeline wastes tokens and dilutes the synthesis.

A worked shape: query "what's the price of TSLA right now?" needs only one subagent (a finance lookup). The same coordinator faced with "compare TSLA and F's 5-year fundamentals and write a one-pager" should invoke search → docs → synthesis → report. **Same coordinator, different subagent set, chosen at decomposition time.**

**Common pitfall:** building a coordinator that always routes through every subagent regardless of complexity. The exam loves this anti-pattern as a distractor — it looks "thorough" but it's actually a fixed pipeline in disguise.

**Quick recall**
- **Q:** What are the four coordinator responsibilities? → Decomposition, delegation, aggregation, and dynamic subagent selection.
- **Q:** Should the coordinator route every query through every subagent? → No — it must analyse query requirements and dynamically pick the subset of subagents needed.

## Risks of overly narrow decomposition; iterative refinement loops

When the coordinator decomposes a broad topic into too few or too narrow subtasks, the synthesis output has **coverage gaps** that look invisible until someone with domain knowledge reads the report. The exam's canonical example: a coordinator asked for "creative industries' adoption of generative AI" decomposes only to "visual arts" and silently omits music and film. The web search and synthesis agents do their jobs correctly within the scope they were given — the failure is upstream, in the coordinator's decomposition.

The fix is an **iterative refinement loop**: after the synthesis subagent returns a draft, the coordinator evaluates the output for gaps against the original query, and if the coverage is incomplete, it **re-delegates to search and analysis subagents with targeted queries** for the missing subdomains, then re-invokes synthesis. This loops until the coverage is sufficient (or some bounded number of iterations elapses).

A concrete loop:

1. Coordinator decomposes → invokes search + synthesis → gets a draft.
2. Coordinator compares draft sections against the user's stated scope. Notices music and film are missing.
3. Coordinator re-invokes search agent with `{topic: "generative AI music industry 2025"}` and `{topic: "generative AI film/VFX 2025"}`.
4. Coordinator re-invokes synthesis with the new evidence appended.
5. Repeat until the draft covers all originally-implied subdomains.

This is also why dynamic subagent selection (above) is paired with refinement: the coordinator gets to **add** subagent invocations after seeing intermediate output, not just choose them upfront.

**Common pitfall:** treating the synthesis subagent's first draft as final. If the coordinator never compares the draft against the original question, gaps survive.

**Quick recall**
- **Q:** What's the typical failure when a coordinator decomposes a broad topic too narrowly? → Coverage gaps in the synthesis — entire sub-domains silently omitted.
- **Q:** What's the standard fix for incomplete synthesis output? → An iterative refinement loop where the coordinator detects gaps, re-delegates targeted queries to search/analysis, and re-invokes synthesis until coverage is sufficient.

## Partitioning research scope to minimize duplication

Two or more subagents working on a broad topic will overlap if you don't partition the scope. If both search subagents independently search "generative AI in creative industries", you pay twice for the same information and the synthesis subagent now has to deduplicate before reasoning. The coordinator's job is to **partition the scope** so each subagent has a distinct slice.

Two partitioning axes commonly tested:

- **By subtopic**: subagent A handles music, subagent B handles film, subagent C handles visual arts. Each gets a focused query and the union covers the whole space.
- **By source type**: subagent A searches news/web, subagent B reads industry reports, subagent C searches academic papers. Same subject space but disjoint source pools.

Either partition strategy works; choosing one over the other depends on whether the user cares more about subdomain coverage (use subtopic partitioning) or source diversity (use source-type partitioning). What you should **not** do is fan out N subagents with overlapping briefs and hope the synthesis sorts it out — that's the "throw more agents at it" anti-pattern, and the exam will mark it wrong.

Partitioning is also where dynamic selection pays off: the coordinator decides at decomposition time *both* how many subagents to invoke *and* the slice each one gets.

**Common pitfall:** assuming parallel subagents with the same prompt will "complement" each other. They mostly duplicate. Distinct slices are what creates coverage.

**Quick recall**
- **Q:** Why partition research scope across subagents? → To minimise duplication; without partitioning, parallel subagents return overlapping results, wasting tokens and forcing dedup on synthesis.
- **Q:** Two common partitioning strategies? → By subtopic (each agent owns a sub-domain) and by source type (each agent owns a source pool).

---

## Anti-patterns

- ❌ **Peer-to-peer subagent comms.** Search subagent hands raw results directly to synthesis, bypassing the coordinator. Breaks observability, error handling, and the coordinator's ability to detect gaps or partition further.
- ✅ **Route every subagent message through the coordinator (hub-and-spoke); no sideways arrows.**
- ❌ **Implicit context inheritance.** Coordinator invokes a subagent without passing scope/constraints, assuming "it'll figure it out from prior history." It can't — subagent context is isolated.
- ✅ **Pass scope, constraints, and prior context explicitly in every subagent invocation.**
- ❌ **Fixed pipeline disguised as orchestration.** Always invoking every subagent (search → docs → synthesis → report) regardless of query complexity. Wastes tokens and dilutes synthesis.
- ✅ **Dynamically select the subset of subagents the query actually needs at decomposition time.**
- ❌ **First draft = final draft.** Coordinator never evaluates the synthesis output against the original question, so gaps survive untouched.
- ✅ **Run an iterative refinement loop: detect gaps, re-delegate targeted queries, re-synthesize.**
- ❌ **Overlapping briefs without partitioning.** Multiple subagents fanned out on the same broad query, producing duplicated evidence and no broader coverage.
- ✅ **Partition scope across subagents — by subtopic or by source type — so each owns a distinct slice.**
- ❌ **Treating decomposition as a one-shot.** Refusing to add subagent invocations after seeing intermediate results.
- ✅ **Let the coordinator grow its plan during refinement — add subagent invocations based on what comes back.**

---

## Worked example — Scenario 3 (Multi-Agent Research System)

User request: *"Write a 2-page report on how creative industries are adopting generative AI in 2025."*

**Round 1.** Coordinator decomposes by subtopic: music, film, visual arts. Partitions scope by source type — search subagent A (news/web), search subagent B (industry reports). Invokes both in parallel, each with explicit context: subdomain set, year scope (2025), output shape (per-subdomain bullets with citations). Subagent results return to the coordinator (hub-and-spoke), not to each other.

**Round 2.** Coordinator aggregates results and invokes the synthesis subagent with a structured brief that names each subdomain. Synthesis returns a draft.

**Round 3 — refinement.** Coordinator compares the draft against the original question. Music and film are well-covered; visual arts is thin (only one citation). It re-delegates a targeted search — `{topic: "generative AI visual arts adoption 2025", source: "industry reports"}` — and re-invokes synthesis with the augmented evidence. Iterates until coverage is even across subdomains.

**Round 4.** Coordinator delegates to the report-generation subagent with the final synthesis as input.

The bug to watch for: a coordinator that skips Round 3 because the synthesis "looks fine." Without the refinement loop, the report ships with a thin visual-arts section and the user notices before the agent does.

---

## Quick recall (full set)

- **Q:** What's the topology of a coordinator-subagent system? → Hub-and-spoke. Coordinator is the hub; subagents are spokes; all messages flow through the hub.
- **Q:** Why is peer-to-peer subagent communication an anti-pattern? → Loses observability, distributed error handling, and the coordinator's ability to enforce partitioning or detect coverage gaps.
- **Q:** Do subagents inherit the coordinator's conversation history? → No. Subagent context is isolated; the coordinator must pass relevant scope and constraints explicitly in the invocation.
- **Q:** What are the four coordinator responsibilities? → Decomposition, delegation, aggregation, and dynamic subagent selection.
- **Q:** What does dynamic subagent selection mean? → The coordinator analyses query requirements and invokes only the subset of subagents needed — not a fixed full-pipeline routing.
- **Q:** What's the typical failure of overly narrow decomposition? → Coverage gaps — entire relevant sub-domains silently omitted from the synthesis.
- **Q:** What's the standard fix for an incomplete synthesis draft? → Iterative refinement loop: coordinator detects gaps, re-delegates targeted queries to search/analysis subagents, re-invokes synthesis, repeats until coverage is sufficient.
- **Q:** Why partition research scope across subagents? → To eliminate duplication; without partitioning, parallel subagents return overlapping results, wasting tokens and forcing dedup downstream.
- **Q:** Two common partitioning axes? → By subtopic (each subagent owns a sub-domain) and by source type (each subagent owns a source pool).
- **Q:** A coordinator routes every query through every subagent regardless of complexity. What's the diagnosis? → Fixed pipeline disguised as orchestration — wastes tokens and dilutes synthesis. Add dynamic subagent selection driven by query analysis.
- **Q:** A synthesis report omits music and film when asked about creative industries. Where's the root cause most likely to be? → Coordinator's decomposition step, not the search or synthesis subagents — the upstream subtask list never included music or film.
