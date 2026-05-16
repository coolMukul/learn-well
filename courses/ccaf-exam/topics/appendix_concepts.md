# Appendix — Technologies & Concepts (quick reference)

- Claude Agent SDK: agent definitions, Task tool, stop_reason values, hooks (PostToolUse), allowedTools
- Model Context Protocol (MCP): servers, tools, resources, isError pattern, .mcp.json
- Claude Code: CLAUDE.md hierarchy, .claude/rules/, .claude/commands/, .claude/skills/
- JSON Schema & tool_use: structured extraction, nullable fields, enum patterns
- Message Batches API: cost savings vs latency tradeoffs, custom_id
- Built-in tools: Read, Write, Edit, Bash, Grep, Glob
- Session management: --resume, fork_session, Explore subagent, /compact
- Validation patterns: Pydantic/JSON schema validation, retry-with-error-feedback
