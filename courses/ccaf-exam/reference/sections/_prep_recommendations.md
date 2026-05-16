# Exam Preparation Recommendations & Hands-On Exercises

> Excerpted from the official Claude Certified Architect — Foundations Certification Exam Guide.

## Recommendations

1. **Build an agent with the Claude Agent SDK.** Implement a complete agentic loop with tool calling, error handling, and session management. Practice spawning subagents and passing context between them.
2. **Configure Claude Code for a real project.** Set up CLAUDE.md with a configuration hierarchy, create path-specific rules in `.claude/rules/`, build custom skills with frontmatter options (`context: fork`, `allowed-tools`), and integrate at least one MCP server.
3. **Design and test MCP tools.** Write tool descriptions that clearly differentiate similar tools. Implement structured error responses with error categories and retryable flags. Test tool selection reliability with ambiguous requests.
4. **Build a structured data extraction pipeline.** Use `tool_use` with JSON schemas, implement validation-retry loops, design schemas with optional/nullable fields, practice batch processing with the Message Batches API.
5. **Practice prompt engineering techniques.** Write few-shot examples for ambiguous scenarios. Define explicit review criteria to reduce false positives. Design multi-pass review architectures for large code reviews.
6. **Study context management patterns.** Practice extracting structured facts from verbose tool outputs, implementing scratchpad files for long sessions, and designing subagent delegation to manage context limits.
7. **Review escalation and human-in-the-loop patterns.** Understand when to escalate (policy gaps, customer requests, inability to progress) versus resolve autonomously. Practice designing human review workflows with confidence-based routing.
8. **Complete the official Practice Exam.** Before sitting the real exam, complete the practice exam (link provided separately by Anthropic). Same scenarios and question format; explanations are shown after each answer.

## Hands-on exercises

### Exercise 1 — Multi-Tool Agent with Escalation Logic
Reinforces: Domains 1, 2, 5.

1. Define 3-4 MCP tools with detailed descriptions that clearly differentiate each tool's purpose, expected inputs, and boundary conditions. Include at least two tools with similar functionality.
2. Implement an agentic loop that checks `stop_reason` to determine continue vs present-final-response. Handle both `"tool_use"` and `"end_turn"` correctly.
3. Add structured error responses to your tools: `errorCategory` (transient/validation/permission), `isRetryable` boolean, human-readable descriptions. Test agent handling of each.
4. Implement a programmatic hook that intercepts tool calls to enforce a business rule (e.g., blocking operations above a threshold), redirecting to escalation when triggered.
5. Test with multi-concern messages and verify the agent decomposes, handles each concern, and synthesizes a unified response.

### Exercise 2 — Configure Claude Code for a Team Workflow
Reinforces: Domains 3, 2.

1. Create a project-level CLAUDE.md with universal coding standards and testing conventions. Verify project-level instructions apply across team members.
2. Create `.claude/rules/` files with YAML frontmatter glob patterns (e.g., `paths: ["src/api/**/*"]`, `paths: ["**/*.test.*"]`). Test rules load only on matching files.
3. Create a project-scoped skill in `.claude/skills/` with `context: fork` and `allowed-tools` restrictions. Verify the skill runs in isolation.
4. Configure an MCP server in `.mcp.json` with environment variable expansion. Add a personal experimental MCP server in `~/.claude.json`. Verify both are available simultaneously.
5. Test plan mode versus direct execution on tasks of varying complexity: single-file bug fix, multi-file library migration, new feature with multiple valid approaches.

### Exercise 3 — Structured Data Extraction Pipeline
Reinforces: Domains 4, 5.

1. Define an extraction tool with a JSON schema containing required and optional fields, an enum with `"other"` + detail, and nullable fields. Process documents missing some fields and verify the model returns null rather than fabricating.
2. Implement a validation-retry loop: when validation fails, send a follow-up with the document, the failed extraction, and the specific error. Track resolvable (format) vs unresolvable (info absent) errors.
3. Add few-shot examples demonstrating extraction from documents with varied formats (inline citations vs bibliographies, narrative vs structured tables).
4. Design a batch processing strategy: submit 100 documents via the Message Batches API, handle failures by `custom_id`, resubmit with modifications, calculate total processing time vs SLA constraints.
5. Implement human review routing: have the model output field-level confidence scores, route low-confidence to human review, analyze accuracy by document type and field.

### Exercise 4 — Multi-Agent Research Pipeline
Reinforces: Domains 1, 2, 5.

1. Build a coordinator that delegates to ≥2 subagents (web search, document analysis). Ensure `allowedTools` includes `"Task"` and that each subagent receives findings directly in its prompt rather than relying on automatic context inheritance.
2. Implement parallel subagent execution by emitting multiple `Task` calls in a single coordinator response. Measure latency improvement vs sequential.
3. Design structured output for subagents that separates content from metadata: each finding has a claim, evidence excerpt, source URL/document name, publication date. Verify synthesis preserves attribution.
4. Implement error propagation: simulate a subagent timeout and verify the coordinator receives structured error context (failure type, attempted query, partial results). Test that the coordinator can proceed with partials and annotate coverage gaps.
5. Test with conflicting source data (two credible sources, different statistics). Verify synthesis preserves both with attribution rather than picking one, and structures the report to distinguish well-established from contested findings.
