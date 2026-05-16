# In-Scope Topics

> Excerpted from the official Claude Certified Architect — Foundations Certification Exam Guide. The following topics are explicitly tested on the exam.

- **Agentic loop implementation** — Control flow based on `stop_reason`, tool result handling, loop termination conditions.
- **Multi-agent orchestration** — Coordinator-subagent patterns, task decomposition, parallel subagent execution, iterative refinement loops.
- **Subagent context management** — Explicit context passing, structured state persistence, crash recovery using manifests.
- **Tool interface design** — Writing effective tool descriptions, splitting vs consolidating tools, tool naming to reduce ambiguity.
- **MCP tool and resource design** — Resources for content catalogs, tools for actions, description quality for adoption.
- **MCP server configuration** — Project vs user scope, environment variable expansion, multi-server simultaneous access.
- **Error handling and propagation** — Structured error responses, transient vs business vs permission errors, local recovery before escalation.
- **Escalation decision-making** — Explicit criteria, honoring customer preferences, policy gap identification.
- **CLAUDE.md configuration** — Hierarchy (user/project/directory), `@import` patterns, `.claude/rules/` with glob patterns.
- **Custom commands and skills** — Project vs user scope, `context: fork`, `allowed-tools`, `argument-hint` frontmatter.
- **Plan mode vs direct execution** — Complexity assessment, architectural decisions, single-file changes.
- **Iterative refinement** — Input/output examples, test-driven iteration, interview pattern, sequential vs parallel issue resolution.
- **Structured output via tool_use** — Schema design, `tool_choice` configuration, nullable fields to prevent hallucination.
- **Few-shot prompting** — Ambiguous scenario targeting, format consistency, false positive reduction.
- **Batch processing** — Message Batches API appropriateness, latency tolerance assessment, failure handling by `custom_id`.
- **Context window optimization** — Trimming verbose tool outputs, structured fact extraction, position-aware input ordering.
- **Human review workflows** — Confidence calibration, stratified sampling, accuracy segmentation by document type and field.
- **Information provenance** — Claim-source mappings, temporal data handling, conflict annotation, coverage gap reporting.
