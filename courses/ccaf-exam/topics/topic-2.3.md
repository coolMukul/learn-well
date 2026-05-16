# Task 2.3 — Tool distribution across agents and tool_choice

> **Domain 2 · Tool Design & MCP Integration** · 18% of the exam
>
> _First study 2026-05-02. Anchored to the task-2.3 excerpt._

## Why this matters

Task 2.3 is where **agent architecture meets tool routing**. Tasks 1.2/1.3 said: decompose into a coordinator and specialized subagents. Task 2.1 said: write tool descriptions that disambiguate. Task 2.3 closes the loop: **which subagent gets which tools, and how do you steer tool-call decisions when "auto" isn't enough?** The exam surfaces this through Scenario 3 (Multi-Agent Research) and Scenario 1 (Customer Support), with stems like "the synthesis agent keeps calling web search" or "the agent sometimes returns prose when we need a structured tool call." Recognize **tool overload**, **cross-specialization misuse**, and the three `tool_choice` modes, and you own this task.

## Tool overload (18 vs 4-5) degrades selection reliability

The excerpt is explicit: giving an agent access to **too many tools** (e.g., 18 instead of 4-5) **degrades tool selection reliability** by increasing decision complexity. As the tool list grows, the model spends more attention reading descriptions, and **descriptions overlap more** (Task 2.1) so the disambiguation signal weakens. The agent picks the wrong tool, or picks a generic tool when a more specific one fits.

An agent's tool list is part of its **prompt budget**. Every tool consumes attention regardless of use on this turn. A 4-5 tool agent reads its toolbox once and picks confidently; an 18-tool agent re-evaluates every option on every turn and entropy compounds across multi-turn loops.

**Concrete example.** A coordinator that hands one subagent every tool — `web_search`, `news_search`, `industry_db.lookup`, `archive.fetch`, `load_document`, `summarize_doc`, `extract_metadata`, `verify_fact`, `cite`, `format_report`, plus utilities — produces an agent that picks `web_search` for queries `industry_db.lookup` would answer better, or calls `summarize_doc` on raw URLs because both `summarize_doc` and `load_document` mention "document." Splitting the workflow into a **search subagent** (4 tools), **document subagent** (3 tools), and **synthesis subagent** (3 tools) restores selection accuracy.

**Common pitfall:** assuming "more tools = more capable agent." More tools dilute selection. Capability comes from the right scoped subset plus the right architecture.

**Quick recall**
- **Q:** Roughly how many tools is "too many"? → ~18; 4–5 is the comfortable target the excerpt cites.
- **Q:** What gets worse as the tool list grows? → Selection reliability — description overlap and decision complexity both rise.

## Cross-specialization misuse (synthesis agent attempting web search)

The second failure mode the excerpt names is **cross-specialization misuse**: an agent given tools outside its specialization tends to misuse them. The canonical example: a **synthesis agent attempting web searches**. Synthesis should reason over collected findings, but once it has a `web_search` tool, it routinely "checks one more thing" instead of producing the report, drifts off-task, and duplicates work.

An agent's role is communicated by **two signals together**: the system prompt (which says "you synthesize") and the tool list (which says "you can search the web"). When those signals contradict, the **tool list usually wins** — the model takes actions it has the means to take. A synthesis agent without a search tool simply cannot drift into search; the route doesn't exist.

**Concrete example.** Scenario 3 — the synthesis subagent receives findings from search/document subagents and produces a cited report. If its toolbox includes `web_search`, it occasionally emits `web_search("verify claim X")` mid-synthesis. Fix: **remove `web_search`** and route any verification need through the coordinator (Task 1.2 hub-and-spoke). If verification is high-frequency, give synthesis a **scoped cross-role tool** like `verify_fact(claim, source_id)` that checks against already-collected sources — not a general search tool.

**Common pitfall:** thinking "I'll give every agent every tool just in case." This guarantees drift. The agent's specialization must be enforced by the **toolbox shape**, not just by prose in the system prompt.

**Quick recall**
- **Q:** What is "cross-specialization misuse"? → An agent calling tools outside its role (synthesis agent doing web searches), causing drift and duplicate work.
- **Q:** Why does the toolbox win over the system prompt? → If a route exists, the model eventually takes it; removing the tool removes the route.

## Scoped tools per role, with limited cross-role tools

The excerpt's fix is **scoped tool access**: give each agent only the tools its role needs, with **limited cross-role tools** for specific high-frequency needs. Small, role-shaped toolboxes plus a small number of carefully chosen cross-role utilities.

The "limited cross-role" qualifier matters. Two patterns:

- **Coordinator-routed escalation for rare needs.** If synthesis occasionally needs deep search, it hands back to the coordinator, which dispatches the search subagent. Extra hop; preserves specialization.
- **Scoped utility tool for high-frequency needs.** If verification happens on most synthesis turns, the coordinator hop each time is wasteful. Add a **constrained** tool like `verify_fact(claim, source_id)` — no free-form query, no web access, only already-collected sources. The narrow surface keeps specialization intact.

**Concrete example.** Scenario 1 — the support agent's toolbox is `get_customer`, `lookup_order`, `process_refund`, `escalate_to_human`. That's it. A `web_search` for "is this product known to fail?" would be drift; if the team needs that capability, it belongs in a separate research subagent the coordinator dispatches.

**Common pitfall:** treating scoped tool access as just "fewer tools." The point is **role-shaped tools**: the toolbox is a contract about what the agent does. Cross-role tools are added deliberately for measured, high-frequency needs, not opportunistically.

**Quick recall**
- **Q:** When do you add a cross-role tool to a specialized agent? → When the cross-role need is **high-frequency** and a coordinator hop on every turn is wasteful; the cross-role tool itself must be **constrained**.
- **Q:** Where do rare cross-role needs go? → Back through the coordinator (hub-and-spoke from Task 1.2), which dispatches the right specialist.

## Constrained alternatives over generic (load_document over fetch_url)

A specific application of scoped tools: **replace generic tools with constrained alternatives**. The excerpt's example replaces `fetch_url(url)` with `load_document(url)` that **validates** the URL points to a document (not arbitrary web content) and returns parsed structure rather than raw bytes. Narrower contract, sharper description, bounded failure modes.

The principle: **a generic tool's surface area is a liability**. `fetch_url` invites the model to fetch anything — search results, social media, image binaries, paywalled HTML — and interpret whatever comes back. `load_document` is contractually about documents; it can refuse non-document URLs with a clean error (Task 2.2), and the description signals not to reach for it for general fetches.

**Concrete example.** A document subagent with `fetch_url` ended up "fetching" Twitter threads, Stack Overflow answers, and broken PDFs. Replacing with `load_document` (validates supported types: PDF, DOCX, structured HTML; returns parsed sections with metadata) jumps accuracy and predictability — the surface no longer matches off-task uses.

**Common pitfall:** keeping a generic tool "for flexibility." Flexibility on the input side becomes drift on the behaviour side. Constrain the tool, and the agent's behaviour follows.

**Quick recall**
- **Q:** Why prefer `load_document` to `fetch_url`? → Narrower contract, sharper description, validates input shape, fewer off-task uses, cleaner error surface.
- **Q:** How does this connect to Task 2.1? → A constrained tool's description can be specific and unambiguous; a generic tool's description has to cover too many cases and overlaps with other tools.

## tool_choice: 'auto' / 'any' / forced selection

The excerpt names three `tool_choice` configurations, each with a distinct guarantee:

- **`tool_choice: "auto"`** — model decides whether to call a tool or return text. Default. Use when either path is valid.
- **`tool_choice: "any"`** — model **must call some tool**, picks which one. Use when a free-form text reply would be wrong (the agent should always do something via a tool).
- **`tool_choice: {"type": "tool", "name": "extract_metadata"}`** — **forced selection** of a specific named tool. Use when a particular tool must run first (extract metadata before enrichment) or as a structured-output channel (Task 4.3).

**Concrete example.** A document-extraction agent must call `extract_metadata` on turn 1 before downstream enrichment. Setting `tool_choice: {"type": "tool", "name": "extract_metadata"}` on that call **guarantees** the metadata step; subsequent turns return to `"auto"` so the model picks further tools or replies.

A common mix-up the exam tests: `"any"` does **not** mean "any specific tool" — it means "any tool, model's choice, but no free-form text." Forced selection by name is a different mode.

**Common pitfall:** reaching for `"any"` when you actually need forced selection of a specific tool. `"any"` only blocks free-form text replies; it doesn't pin the choice.

**Quick recall**
- **Q:** What does `tool_choice: "any"` guarantee? → That the model calls some tool (no free-form text reply); the model still picks which one.
- **Q:** What does forced selection (`{"type": "tool", "name": "X"}`) guarantee? → Tool X is called this turn; the model only decides the input.

## Forcing a tool first then processing in follow-up turns

The excerpt names a multi-turn pattern: **force a tool first** (e.g., `extract_metadata`) then **process subsequent steps in follow-up turns** with `tool_choice: "auto"`. Forced selection is a **per-turn** lever, not a session setting. Use it surgically on the turn where compliance matters; release after.

This shows up where **step ordering is a hard requirement** — metadata before enrichment, permission check before data modification. Forced selection on turn 1 pins step 1; subsequent turns let the model decide. Compare to a `PreToolUse` hook (Task 1.5) which would also enforce ordering by denying out-of-order calls. Both are deterministic, but forced selection is the simpler tool when the constraint is "must call X first" rather than "must not call Y before X."

**Concrete example.** Scenario 6 — an extraction pipeline has `extract_metadata`, `enrich_addresses`, `validate_totals`, `summarize`. Bug: the model sometimes skips `extract_metadata` and enriches raw text. Fix: turn 1 sets `tool_choice: {"type": "tool", "name": "extract_metadata"}`; turn 2 onward switches to `"auto"` and the model picks `enrich_addresses`, then `validate_totals`, then returns the summary. One extra round-trip; guaranteed first step.

**Common pitfall:** leaving forced selection on for the whole session. The model can't ever return a final answer if it's pinned to a single tool every turn — you'll loop or stall. Force on the turn that matters; release after.

**Quick recall**
- **Q:** When is "force tool X first, then auto" the right pattern? → When step ordering is a hard requirement and you want to guarantee step 1 without writing a `PreToolUse` hook.
- **Q:** Why must you release back to `tool_choice: "auto"` (or off forced) after the forced turn? → Because forced selection pins every turn to that one tool; you'd never reach a final reply or a different next tool.

---

## Anti-patterns

- ❌ **Union-toolbox agents.** Giving one agent every tool in the system; selection reliability collapses (the ~18-tool overload symptom).
- ✅ **Split into role-scoped subagents with 4–5 tools each.**
- ❌ **Cross-specialization toolboxes** — `web_search` on the synthesis agent, or `process_refund` on a research agent. The extra tool becomes a drift route the model eventually takes.
- ✅ **Enforce specialization through the toolbox shape, not just system-prompt prose.**
- ❌ **Generic tools "for flexibility"** (`fetch_url`, `run_anything`, `query_db`). Flexible input surface = unbounded output behaviour.
- ✅ **Replace with constrained alternatives like `load_document` that validate input shape.**
- ❌ **Confusing `tool_choice: "any"` with forced selection.** `"any"` blocks text replies but lets the model pick; forced selection pins by name.
- ✅ **Use `{"type": "tool", "name": "X"}` to pin a specific tool; `"any"` only forbids prose replies.**
- ❌ **Leaving forced `tool_choice` on for the whole session.** The agent never returns a final answer or branches; it loops on the pinned tool.
- ✅ **Force selection on the one ordering-critical turn, then release back to `"auto"`.**
- ❌ **Using `"auto"` when the agent must always act via a tool.** Free-form text replies slip through and downstream has nothing structured.
- ✅ **Use `tool_choice: "any"` to forbid the prose path while letting the model pick which tool.**
- ❌ **Adding cross-role tools every time someone notices friction.** Each addition is a new drift route.
- ✅ **Add cross-role tools only for measured high-frequency needs; route rare needs via the coordinator.**
- ❌ **Using forced `tool_choice` for policy compliance** (e.g., "always escalate for over-$500 refunds"). The model isn't choosing — it just calls the forced tool unconditionally.
- ✅ **Use a `PreToolUse` hook (Task 1.5) for policy compliance; reserve forced `tool_choice` for ordering and structured-output.**

---

## Worked example — Scenario S3 (Multi-Agent Research System)

A research coordinator delegates to four subagents: **search**, **document analysis**, **synthesis**, **report generation**. Initial design gave each subagent the full toolbox. Two bugs: **(1)** the synthesis subagent kept emitting `web_search("verify claim X")` mid-synthesis, duplicating work and bloating context; **(2)** the document subagent occasionally `fetch_url`'d Twitter threads.

Task 2.3 fixes both. Scope the toolboxes: search gets `{web_search, news_search, industry_db.lookup, archive.fetch}`; document gets `{load_document, extract_metadata, summarize_doc}` (replacing `fetch_url` per the constrained-alternative principle); synthesis gets `{verify_fact, cite}` only (no `web_search`; `verify_fact` is the **scoped cross-role tool** for the high-frequency verification need); report gets `{format_report}`. On the document subagent's first turn per doc, the coordinator sets `tool_choice: {"type": "tool", "name": "extract_metadata"}` to guarantee metadata before enrichment, then releases to `"auto"`. Selection accuracy jumps; drift disappears.

The wrong-answer set the exam offers: "tighten system prompts to tell synthesis not to search" (probabilistic; tool route still exists), "add few-shot examples" (same), "raise temperature" (worse). The structural answer is **scoped toolboxes plus targeted forced `tool_choice` on the ordering-critical turn**.

---

## Quick recall (full set)

- **Q:** What two failure modes does Task 2.3 explicitly call out? → Tool overload (too many tools per agent degrades selection reliability) and cross-specialization misuse (an agent calls tools outside its role, causing drift).
- **Q:** What is the "comfortable" tool-count target the excerpt cites? → 4–5 per agent, vs ~18 as the overload anti-example.
- **Q:** What is the scoped-tool-access principle? → Give each agent only the tools its role needs, with **limited** cross-role tools for measured high-frequency needs.
- **Q:** When do rare cross-role needs go through the coordinator vs into a cross-role tool? → Coordinator for rare needs (one extra hop is fine); a constrained cross-role tool only when the need is high-frequency.
- **Q:** Why prefer `load_document` over `fetch_url`? → Narrower contract, validates input shape, sharper description, bounded failure modes — fewer off-task uses.
- **Q:** What does `tool_choice: "auto"` mean? → Default; the model chooses whether to call a tool or return text.
- **Q:** What does `tool_choice: "any"` mean? → The model **must** call some tool (no free-form text reply); it still picks which one.
- **Q:** What does forced `tool_choice: {"type": "tool", "name": "X"}` mean? → The model is pinned to call tool X on this turn; only the input to X is the model's decision.
- **Q:** When is "force tool first, then `auto`" the right pattern? → When a specific step (e.g., `extract_metadata`) must run first and you want a guarantee without writing a `PreToolUse` hook.
- **Q:** What goes wrong if you leave forced `tool_choice` on for an entire session? → The agent can never return a final answer or branch to other tools — it loops on the pinned tool indefinitely.
- **Q:** Why is forced `tool_choice` the wrong mechanism for policy compliance (e.g., "must escalate over $500")? → The model isn't choosing whether to escalate; it just calls the forced tool unconditionally. Policy compliance is a `PreToolUse` hook from Task 1.5.
- **Q:** Why does the toolbox usually win over the system prompt when they conflict? → If a route exists, the model will eventually take it. Removing the tool removes the route entirely; prose can only discourage probabilistically.
