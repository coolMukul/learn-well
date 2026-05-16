# Technologies and Concepts (Appendix)

> Excerpted from the official Claude Certified Architect — Foundations Certification Exam Guide. The following technologies and concepts may appear on the exam.

## Claude Agent SDK
- Agent definitions
- Agentic loops, `stop_reason` handling
- Hooks: `PostToolUse`, tool-call interception
- Subagent spawning via the `Task` tool
- `allowedTools` configuration

## Model Context Protocol (MCP)
- MCP servers, MCP tools, MCP resources
- `isError` flag
- Tool descriptions and tool distribution
- `.mcp.json` configuration
- Environment variable expansion

## Claude Code
- CLAUDE.md hierarchy: user / project / directory
- `.claude/rules/` with YAML frontmatter path-scoping
- `.claude/commands/` for slash commands
- `.claude/skills/` with `SKILL.md` frontmatter (`context: fork`, `allowed-tools`, `argument-hint`)
- Plan mode, direct execution
- `/memory` command, `/compact`, `--resume`, `fork_session`, Explore subagent

## Claude Code CLI
- `-p` / `--print` flag for non-interactive mode
- `--output-format json`, `--json-schema` for structured CI output

## Claude API
- `tool_use` with JSON schemas
- `tool_choice` options: `"auto"`, `"any"`, forced tool selection
- `stop_reason` values: `"tool_use"`, `"end_turn"`
- `max_tokens`, system prompts

## Message Batches API
- 50% cost savings
- Up to 24-hour processing window
- `custom_id` for request/response correlation
- Polling for completion
- **No multi-turn tool calling support**

## JSON Schema
- Required vs optional fields
- Enum types
- Nullable fields
- "other" + detail string patterns
- Strict mode for syntax error elimination

## Pydantic
- Schema validation
- Semantic validation errors
- Validation-retry loops

## Built-in tools
- Read, Write, Edit, Bash, Grep, Glob — purposes and selection criteria

## Few-shot prompting
- Targeted examples for ambiguous scenarios
- Format demonstration
- Generalization to novel patterns

## Prompt chaining
- Sequential task decomposition into focused passes

## Context window management
- Token budgets
- Progressive summarization
- Lost-in-the-middle effects
- Context extraction
- Scratchpad files

## Session management
- Session resumption, `fork_session`, named sessions
- Session context isolation

## Confidence scoring
- Field-level confidence
- Calibration with labeled validation sets
- Stratified sampling for error rate measurement
