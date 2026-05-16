# Official Sample Questions

> Excerpted from the official Claude Certified Architect — Foundations Certification Exam Guide. These illustrate the format and difficulty level of the exam.

---

## Scenario: Customer Support Resolution Agent

### Q1
Production data shows that in 12% of cases, your agent skips `get_customer` entirely and calls `lookup_order` using only the customer's stated name, occasionally leading to misidentified accounts and incorrect refunds. What change would most effectively address this reliability issue?

A) Add a programmatic prerequisite that blocks `lookup_order` and `process_refund` calls until `get_customer` has returned a verified customer ID.
B) Enhance the system prompt to state that customer verification via `get_customer` is mandatory before any order operations.
C) Add few-shot examples showing the agent always calling `get_customer` first, even when customers volunteer order details.
D) Implement a routing classifier that analyzes each request and enables only the subset of tools appropriate for that request type.

**Correct: A.** When a specific tool sequence is required for critical business logic (verifying customer identity before processing refunds), programmatic enforcement provides deterministic guarantees that prompt-based approaches cannot. B and C rely on probabilistic LLM compliance, insufficient when errors have financial consequences. D addresses tool availability, not tool ordering.

### Q2
Production logs show the agent frequently calls `get_customer` when users ask about orders (e.g., "check my order #12345"), instead of `lookup_order`. Both tools have minimal descriptions ("Retrieves customer information" / "Retrieves order details") and accept similar identifier formats. What's the most effective first step?

A) Add few-shot examples to the system prompt demonstrating correct tool selection patterns, with 5-8 examples showing order-related queries routing to `lookup_order`.
B) Expand each tool's description to include input formats it handles, example queries, edge cases, and boundaries explaining when to use it versus similar tools.
C) Implement a routing layer that parses user input before each turn and pre-selects the appropriate tool based on detected keywords and identifier patterns.
D) Consolidate both tools into a single `lookup_entity` tool that accepts any identifier and internally determines which backend to query.

**Correct: B.** Tool descriptions are the primary mechanism LLMs use for tool selection. Minimal descriptions leave models without context to differentiate similar tools. B is the low-effort, high-leverage fix for the root cause. Few-shot (A) adds tokens without fixing the cause. Routing (C) is over-engineered. Consolidation (D) is a bigger change than a "first step" warrants.

### Q3
Your agent achieves 55% first-contact resolution, well below the 80% target. Logs show it escalates straightforward cases (standard damage replacements with photo evidence) while attempting to autonomously handle complex situations requiring policy exceptions. What's the most effective way to improve escalation calibration?

A) Add explicit escalation criteria to your system prompt with few-shot examples demonstrating when to escalate versus resolve autonomously.
B) Have the agent self-report a confidence score (1-10) before each response and route requests to humans when confidence falls below a threshold.
C) Deploy a separate classifier model trained on historical tickets to predict which requests need escalation.
D) Implement sentiment analysis to detect customer frustration levels and escalate when negative sentiment exceeds a threshold.

**Correct: A.** Explicit criteria + few-shot examples directly address the unclear decision boundaries — the proportionate first response. B fails because LLM self-reported confidence is poorly calibrated (the agent is already incorrectly confident on hard cases). C is over-engineered, requiring labeled data and ML infrastructure when prompt optimization hasn't been tried. D solves a different problem; sentiment doesn't correlate with case complexity.

---

## Scenario: Code Generation with Claude Code

### Q4
You want to create a custom `/review` slash command that runs your team's standard code review checklist. This command should be available to every developer who clones the repository. Where should you create this command file?

A) In the `.claude/commands/` directory in the project repository
B) In `~/.claude/commands/` in each developer's home directory
C) In the `CLAUDE.md` file at the project root
D) In a `.claude/config.json` file with a commands array

**Correct: A.** Project-scoped slash commands live in `.claude/commands/` within the repo — version-controlled and automatically available to all devs. B is for personal commands. C is for project context, not command definitions. D references a configuration mechanism that doesn't exist in Claude Code.

### Q5
You've been assigned to restructure the team's monolithic application into microservices. This will involve changes across dozens of files and requires decisions about service boundaries and module dependencies. Which approach should you take?

A) Enter plan mode to explore the codebase, understand dependencies, and design an implementation approach before making changes.
B) Start with direct execution and make changes incrementally, letting the implementation reveal the natural service boundaries.
C) Use direct execution with comprehensive upfront instructions detailing exactly how each service should be structured.
D) Begin in direct execution mode and only switch to plan mode if you encounter unexpected complexity during implementation.

**Correct: A.** Plan mode is designed for large-scale changes, multiple valid approaches, and architectural decisions — exactly what monolith-to-microservices restructuring requires. B risks costly rework when dependencies are discovered late. C assumes you already know the right structure. D ignores that the complexity is already stated in the requirements.

### Q6
Your codebase has distinct areas with different conventions: React components use functional style with hooks, API handlers use async/await with specific error handling, database models follow a repository pattern. Test files are spread throughout the codebase alongside the code they test (e.g., `Button.test.tsx` next to `Button.tsx`). You want all tests to follow the same conventions regardless of location. What's the most maintainable approach?

A) Create rule files in `.claude/rules/` with YAML frontmatter specifying glob patterns to conditionally apply conventions based on file paths.
B) Consolidate all conventions in the root `CLAUDE.md` file under headers for each area, relying on Claude to infer which section applies.
C) Create skills in `.claude/skills/` for each code type that include the relevant conventions in their `SKILL.md` files.
D) Place a separate `CLAUDE.md` file in each subdirectory containing that area's specific conventions.

**Correct: A.** `.claude/rules/` with glob patterns (e.g., `**/*.test.tsx`) applies conventions based on file paths regardless of directory location — essential for tests spread throughout the codebase. B relies on inference rather than explicit matching. C requires manual skill invocation. D can't easily handle files spread across many directories since CLAUDE.md files are directory-bound.

---

## Scenario: Multi-Agent Research System

### Q7
Running the system on "impact of AI on creative industries," each subagent completes successfully (web search finds articles, document analysis summarizes correctly, synthesis produces coherent output), but final reports cover only visual arts — missing music, writing, and film. The coordinator's logs show it decomposed the topic into "AI in digital art creation," "AI in graphic design," "AI in photography." Most likely root cause?

A) The synthesis agent lacks instructions for identifying coverage gaps in the findings it receives.
B) The coordinator agent's task decomposition is too narrow, resulting in subagent assignments that don't cover all relevant domains of the topic.
C) The web search agent's queries are not comprehensive enough.
D) The document analysis agent is filtering out non-visual creative-industry sources due to overly restrictive relevance criteria.

**Correct: B.** The coordinator's logs reveal it directly: it decomposed "creative industries" into only visual-arts subtasks. The subagents executed correctly within their assigned scope. A, C, D blame downstream agents that are working correctly.

### Q8
The web search subagent times out while researching a complex topic. Which error propagation approach best enables intelligent recovery?

A) Return structured error context to the coordinator including the failure type, the attempted query, any partial results, and potential alternative approaches.
B) Implement automatic retry logic with exponential backoff within the subagent, returning a generic "search unavailable" status only after all retries are exhausted.
C) Catch the timeout within the subagent and return an empty result set marked as successful.
D) Propagate the timeout exception directly to a top-level handler that terminates the entire research workflow.

**Correct: A.** Structured error context lets the coordinator decide intelligently — retry with a modified query, try an alternative, or proceed with partial results. B's generic status hides context. C silently suppresses the error and risks incomplete output. D terminates unnecessarily when recovery could succeed.

### Q9
The synthesis agent frequently needs to verify specific claims while combining findings. Currently verification round-trips through the coordinator (synthesis → coordinator → web search → synthesis) add 2-3 trips per task and 40% latency. 85% of these verifications are simple fact-checks (dates, names, statistics); 15% require deeper investigation. Most effective approach?

A) Give the synthesis agent a scoped `verify_fact` tool for simple lookups, while complex verifications continue delegating to the web search agent through the coordinator.
B) Have the synthesis agent batch all verification needs and return them to the coordinator at the end of its pass.
C) Give the synthesis agent access to all web search tools so it can handle any verification directly.
D) Have the web search agent proactively cache extra context around each source during initial research.

**Correct: A.** Least privilege: give synthesis only what it needs for the 85% common case, preserve coordination for complex cases. B's batching creates blocking dependencies (synthesis steps may depend on earlier verified facts). C over-provisions. D relies on speculative caching that can't reliably predict needs.

---

## Scenario: Claude Code for Continuous Integration

### Q10
Your pipeline script runs `claude "Analyze this pull request for security issues"` but the job hangs indefinitely. Logs indicate Claude Code is waiting for interactive input. What's the correct approach?

A) Add the `-p` flag: `claude -p "Analyze this pull request for security issues"`
B) Set the environment variable `CLAUDE_HEADLESS=true` before running.
C) Redirect stdin from `/dev/null`.
D) Add the `--batch` flag.

**Correct: A.** The `-p` (or `--print`) flag is the documented way to run Claude Code non-interactively — processes the prompt, outputs to stdout, exits. B and D reference non-existent features. C is a Unix workaround that doesn't address Claude Code's command syntax.

### Q11
Your team wants to reduce API costs. Two workflows currently use real-time Claude calls: (1) a blocking pre-merge check that must complete before developers merge, and (2) a technical-debt report generated overnight for review next morning. Your manager proposes switching both to the Message Batches API for its 50% savings. How should you evaluate this?

A) Use batch processing for the technical-debt reports only; keep real-time calls for pre-merge checks.
B) Switch both to batch processing with status polling.
C) Keep real-time calls for both to avoid batch result-ordering issues.
D) Switch both to batch with a timeout fallback to real-time if batches take too long.

**Correct: A.** Batches API offers 50% savings but processing times up to 24 hours with no SLA. Unsuitable for blocking pre-merge checks; ideal for overnight reports. B is wrong because "often faster" isn't acceptable for blocking workflows. C reflects a misconception (results can be correlated using `custom_id`). D adds unnecessary complexity.

### Q12
A pull request modifies 14 files. Single-pass review produces inconsistent results: detailed feedback for some files but superficial for others, obvious bugs missed, and contradictory feedback (flagging a pattern in one file while approving identical code elsewhere in the same PR). How should you restructure?

A) Split into focused passes: analyze each file individually for local issues, then a separate integration-focused pass examining cross-file data flow.
B) Require developers to split large PRs into smaller submissions of 3-4 files.
C) Switch to a higher-tier model with larger context window.
D) Run three independent review passes and only flag issues that appear in at least two of the three runs.

**Correct: A.** Splitting into focused passes addresses the root cause: attention dilution. File-by-file ensures consistent depth; integration pass catches cross-file issues. B shifts burden to developers. C misunderstands that larger context doesn't solve attention quality. D would suppress detection of real bugs.
