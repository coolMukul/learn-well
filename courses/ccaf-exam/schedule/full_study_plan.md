# Claude Certified Architect — Foundations: Topic Grid

Source of truth for *what* to study and *when*. Methodology (how to study, quiz rules, mastery definition) lives in [schedule/daily_plan.md](daily_plan.md).

- **Plan starts:** 2026-04-29
- **Goal:** pass the Foundations exam (≥720 / 1000 scaled, ~72%)
- **Approach:** cover every task statement in the official guide thoroughly. We are explicitly not weighting study time by domain percentage — Anthropic could rebalance the form at any point, so all 28 task statements get equal rigor.

Target dates below are suggestions to keep momentum; slip them as needed. Fill `Started` and `Mastered` with the actual date you hit each milestone.

## Mastery columns

| Column | Meaning |
| --- | --- |
| Target | Suggested study date (movable) |
| Started | Date the topic note + first quiz attempt happened |
| Mastered | Date of a ≥90% topic quiz, with topic note + any hands-on artifact done |

---

## Domain 1 — Agentic Architecture & Orchestration

Notes file: [topics/domain1_agentic_architecture.md](../topics/domain1_agentic_architecture.md)

| ID | Task statement | Subtopics | Target | Started | Mastered |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Agentic loop for autonomous task execution | `stop_reason` (`tool_use` vs `end_turn`); appending tool results to history; model-driven vs scripted decision trees; anti-patterns (NL parsing for termination, arbitrary iteration caps, asserting on assistant text) | 2026-04-29 | | |
| 1.2 | Coordinator-subagent orchestration | hub-and-spoke; isolated subagent context; coordinator role in decomposition / delegation / aggregation; risks of over-narrow decomposition; iterative refinement loops; partitioning scope to minimize duplication | 2026-04-30 | | |
| 1.3 | Subagent invocation, context passing, spawning | Task tool; `allowedTools` must include `Task`; AgentDefinition (description / system prompt / tool restrictions); explicit context passing; structured data formats with attribution; parallel subagents in a single turn; goals-not-procedures coordinator prompts; `fork_session` for divergent exploration | 2026-05-01 | | |
| 1.4 | Multi-step workflows: enforcement & handoff | programmatic prerequisites vs prompt-based ordering; deterministic compliance for financial/identity flows; structured handoff payload (customer ID, root cause, refund, recommended action) for human escalation; multi-concern decomposition with shared context | 2026-05-02 | | |
| 1.5 | Agent SDK hooks for interception & normalization | `PostToolUse` for result transformation; outgoing tool-call interception for compliance; deterministic guarantees vs probabilistic prompt compliance; data normalization (Unix → ISO 8601, status code mappings); blocking + redirect to escalation | 2026-05-03 | | |
| 1.6 | Task decomposition strategies | fixed sequential pipelines (prompt chaining) vs adaptive decomposition; per-file + cross-file integration passes for code review; mapping → prioritization → dependency-aware adaptation for open-ended tasks | 2026-05-04 | | |
| 1.7 | Session state, resumption, forking | `--resume <session-name>`; `fork_session` for parallel branches; resume-vs-fresh-start tradeoff when prior tool results are stale; informing resumed sessions of file changes for targeted re-analysis | 2026-05-05 | | |

---

## Domain 2 — Tool Design & MCP Integration

Notes file: [topics/domain2_tool_design_mcp.md](../topics/domain2_tool_design_mcp.md)

| ID | Task statement | Subtopics | Target | Started | Mastered |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Tool interfaces with clear descriptions & boundaries | descriptions as primary selection signal; input formats / examples / edge cases / boundaries; eliminating overlap by renaming + scoping; splitting generic tools into purpose-specific ones; auditing system prompts for keyword bleed | 2026-05-06 | | |
| 2.2 | Structured error responses for MCP tools | `isError`; transient vs validation vs business vs permission errors; `errorCategory`, `isRetryable`, `retriable: false` + customer-friendly text; local recovery in subagents before propagating; access failure vs valid empty result | 2026-05-07 | | |
| 2.3 | Tool distribution across agents + tool_choice | tool overload (18 vs 4–5) degrading selection; restricting subagents to role-relevant tools; constrained alternatives over generic (e.g., `load_document` over `fetch_url`); scoped cross-role tools for high-frequency needs; `tool_choice` `auto` / `any` / forced (`{"type":"tool","name":"..."}`) | 2026-05-08 | | |
| 2.4 | MCP server integration | project (`.mcp.json`) vs user (`~/.claude.json`) scoping; `${ENV_VAR}` expansion for credentials; simultaneous discovery of all configured servers; MCP **resources** for content catalogs (vs **tools** for actions); enhanced tool descriptions to win over built-ins; community vs custom servers | 2026-05-09 | | |
| 2.5 | Built-in tools (Read, Write, Edit, Bash, Grep, Glob) | Grep for content search; Glob for path patterns; Read+Write fallback when Edit anchor isn't unique; incremental discovery (Grep → Read → trace imports); tracing function usage across wrapper modules | 2026-05-10 | | |

Buffer / Domains 1–2 cumulative quiz (30 Qs): 2026-05-11

---

## Domain 3 — Claude Code Configuration & Workflows

Notes file: [topics/domain3_claude_code_workflows.md](../topics/domain3_claude_code_workflows.md)

| ID | Task statement | Subtopics | Target | Started | Mastered |
| --- | --- | --- | --- | --- | --- |
| 3.1 | CLAUDE.md hierarchy, scoping, modular organization | user-level (`~/.claude/CLAUDE.md`) vs project (`.claude/CLAUDE.md` / root `CLAUDE.md`) vs directory-level; user-level not shared via VCS; `@import` for modular references; `.claude/rules/` as alternative to monolithic CLAUDE.md; `/memory` to verify loads | 2026-05-12 | | |
| 3.2 | Custom slash commands & skills | `.claude/commands/` (project, shared) vs `~/.claude/commands/` (personal); `.claude/skills/` with `SKILL.md` frontmatter; `context: fork`, `allowed-tools`, `argument-hint`; personal skill variants in `~/.claude/skills/`; skills (on-demand) vs CLAUDE.md (always-loaded) | 2026-05-13 | | |
| 3.3 | Path-specific rules with glob conditional loading | `.claude/rules/` YAML frontmatter `paths`; conditional activation by editing path; glob patterns spanning directories (e.g., `**/*.test.tsx`); when to prefer rules over directory-level CLAUDE.md | 2026-05-14 | | |
| 3.4 | Plan mode vs direct execution | plan mode for architectural / multi-file / multi-approach work; direct execution for well-scoped single-file changes; Explore subagent for verbose discovery; combining plan + direct (plan migration, then execute) | 2026-05-15 | | |
| 3.5 | Iterative refinement techniques | input/output examples > prose for transformations; test-driven iteration with shared failures; the **interview pattern** (have Claude ask first); single message for interacting fixes vs sequential for independent fixes | 2026-05-16 | | |
| 3.6 | Claude Code in CI/CD | `-p` / `--print` non-interactive flag; `--output-format json` + `--json-schema` for parseable findings; CLAUDE.md as CI context channel (testing standards, fixtures, criteria); session-isolation rationale (generator vs reviewer); incremental review with prior-finding context | 2026-05-17 | | |

---

## Domain 4 — Prompt Engineering & Structured Output

Notes file: [topics/domain4_prompt_engineering.md](../topics/domain4_prompt_engineering.md)

| ID | Task statement | Subtopics | Target | Started | Mastered |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Explicit criteria to reduce false positives | specific categorical criteria over "be conservative" / confidence filters; false-positive contagion across categories; severity criteria with concrete code examples; temporarily disabling high-FP categories to restore trust | 2026-05-18 | | |
| 4.2 | Few-shot prompting for consistency | 2–4 targeted examples for ambiguous cases; demonstrating reasoning ("why this over plausible alternative"); format demonstration (location / issue / severity / fix); generalization to novel patterns; reducing extraction hallucination | 2026-05-19 | | |
| 4.3 | Structured output via tool_use & JSON schemas | `tool_use` + JSON schema = guaranteed schema compliance (eliminates syntax errors, not semantic); `tool_choice`: `auto` / `any` / forced; nullable / optional fields prevent fabrication; enums with `unclear` / `other` + detail; format normalization in prompt alongside schema | 2026-05-20 | | |
| 4.4 | Validation, retry, feedback loops | retry-with-error-feedback (original doc + failed extraction + specific errors); when retry won't help (info absent from source); `detected_pattern` for FP analysis; semantic validation (`calculated_total` vs `stated_total`, `conflict_detected` flags) | 2026-05-21 | | |
| 4.5 | Batch processing strategies | Message Batches API: 50% cost, ≤24h window, no SLA; appropriate for non-blocking workloads; **does not** support multi-turn tool calling within a request; `custom_id` for correlation; submission cadence math for SLAs; pre-batch prompt refinement on samples | 2026-05-22 | | |
| 4.6 | Multi-instance & multi-pass review | self-review limits (generator retains reasoning context); independent reviewer instances; per-file local + cross-file integration passes; calibrated confidence reporting per finding | 2026-05-23 | | |

Buffer / Domains 3–4 cumulative quiz (30 Qs): 2026-05-24

---

## Domain 5 — Context Management & Reliability

Notes file: [topics/domain5_context_management.md](../topics/domain5_context_management.md)

| ID | Task statement | Subtopics | Target | Started | Mastered |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Conversation context preservation | progressive summarization risks (numbers / dates / customer expectations); lost-in-the-middle; tool-result token bloat; persistent "case facts" block; trimming to relevant fields; structured-data handoffs to context-poor downstream agents | 2026-05-25 | | |
| 5.2 | Escalation & ambiguity resolution | escalation triggers (customer asks, policy gap, no progress); honoring explicit human requests immediately; sentiment / self-confidence are unreliable proxies; clarifying on multiple-match ambiguity rather than heuristic-picking | 2026-05-26 | | |
| 5.3 | Error propagation across multi-agent systems | structured error context (failure type, attempted query, partials, alternatives); access failure vs valid empty result; anti-patterns (silent suppression, whole-workflow termination); coverage annotations on synthesis output | 2026-05-27 | | |
| 5.4 | Context in large codebase exploration | extended-session degradation (drift to "typical patterns"); scratchpad files; subagent delegation for verbose exploration; structured state exports for crash recovery; `/compact` | 2026-05-28 | | |
| 5.5 | Human review workflows & confidence calibration | aggregate accuracy hiding stratum failures; stratified random sampling; field-level confidence calibrated on labeled validation set; segmenting accuracy by document type / field before automating | 2026-05-29 | | |
| 5.6 | Provenance & multi-source synthesis | claim-source mappings preserved through synthesis; conflicting credible sources → annotate with attribution, don't pick; required publication / collection dates to disambiguate temporal data; rendering content-type-appropriately (tables vs prose vs lists) | 2026-05-30 | | |

---

## Scenario walkthroughs

For each scenario: identify the relevant tools / agents / hooks / prompts, sketch the agentic flow, note escalation rules, and write a one-page design in [topics/scenarios_summary.md](../topics/scenarios_summary.md).

| # | Scenario | Primary domains | Target | Done |
| --- | --- | --- | --- | --- |
| 1 | Customer Support Resolution Agent | D1, D2, D5 | 2026-05-31 | |
| 2 | Code Generation with Claude Code | D3, D5 | 2026-06-01 | |
| 3 | Multi-Agent Research System | D1, D2, D5 | 2026-06-02 | |
| 4 | Developer Productivity with Claude | D2, D3, D1 | 2026-06-03 | |
| 5 | Claude Code for CI/CD | D3, D4 | 2026-06-04 | |
| 6 | Structured Data Extraction | D4, D5 | 2026-06-05 | |

---

## Hands-on exercises (from the guide's preparation recommendations)

| # | Exercise | Target | Done |
| --- | --- | --- | --- |
| 1 | Build a complete agentic loop with the Claude Agent SDK (tool calling, error handling, sessions, subagents with context passing) | 2026-06-06 | |
| 2 | Configure Claude Code on a real project (CLAUDE.md hierarchy, `.claude/rules/` glob paths, custom skill with `context: fork` + `allowed-tools`, ≥1 MCP server) | 2026-06-07 | |
| 3 | Design ≥3 MCP tools with differentiated descriptions and structured error responses; test selection on ambiguous inputs | 2026-06-08 | |
| 4 | Build a structured extraction pipeline (`tool_use` + JSON schemas, validation-retry, optional/nullable fields, batch processing with `custom_id`) | 2026-06-09 | |
| 5 | Prompt engineering set: few-shot for ambiguous extraction, explicit criteria for review, multi-pass review architecture | 2026-06-10 | |
| 6 | Context management drills: extract structured facts from verbose tool outputs; scratchpad-driven long session; subagent delegation for context-budget management | 2026-06-11 | |
| 7 | Escalation / HITL design: explicit escalation criteria, structured handoffs, confidence-routed human review | 2026-06-12 | |
| 8 | **Take the official Practice Exam** (link provided separately by Anthropic). Review every wrong answer. | 2026-06-13 | |

---

## Mock exams & final prep

| # | Item | Target | Score |
| --- | --- | --- | --- |
| Mock A | Full timed mock (60 Qs from `data/questions.json`) | 2026-06-14 | |
| Remediation | Deep-dive every miss; targeted re-quizzes | 2026-06-15 | |
| Mock B | Full timed mock with shuffled bank | 2026-06-16 | |
| Final review | Light pass over weak topics + flashcards | 2026-06-17 | |
| Exam day | Sit the real exam | 2026-06-18+ | |

---

## Out-of-scope topics (the guide explicitly excludes — do not study)

- Fine-tuning, training custom models, model weights, internal architecture
- Constitutional AI, RLHF, safety training methodology
- Computer use (browser / desktop automation)
- Vision / image analysis
- Streaming API / server-sent events
- Rate limiting, quotas, pricing math
- API authentication, billing, OAuth, key rotation
- Cloud provider configurations (AWS / GCP / Azure)
- Embedding models, vector DB internals
- Prompt caching internals (only need to know it exists)
- Tokenization specifics
- MCP server hosting / infrastructure / networking
- Performance benchmarking, model comparison metrics
- Specific programming-language framework details beyond schema/tool config

---

## Progress tracking

- Quiz attempts → appended to [data/progress.json](../data/progress.json) with `timestamp`, `topics`, `score`, `total`, `duration_seconds`, `question_ids`.
- Topic notes → per-domain files in [topics/](../topics/).
- Flashcards → [notes/](../notes/).
- Update the `Started` / `Mastered` columns above as you go.
