# Domain 2 — Tool Design & MCP Integration

Summary
- Focus: designing clear tool interfaces, MCP server configuration and resource design, structured error responses, and appropriate tool distribution across agents.
- Key concerns: unambiguous tool descriptions, error metadata (errorCategory, isRetryable), scoped tool access to prevent misuse, and leveraging MCP resources for content catalogs.

Key Points
- Tool descriptions drive model tool selection—include input formats, example queries, edge cases, and boundaries.
- Return structured errors with fields like `isError`, `errorCategory` (transient/validation/permission), `isRetryable`, and a human-readable message.
- Limit the number of tools per agent to improve selection reliability; prefer 4–5 focused tools per agent role.
- Use .mcp.json for project-scoped MCP server config; support environment variable expansion for secrets.
- Expose catalogs/resources via MCP resources to reduce exploratory calls and improve performance.

Flashcards
- Q: What key metadata helps an agent decide whether to retry a tool call?  
  A: `errorCategory` and `isRetryable` flags.
- Q: Why avoid giving agents too many tools?  
  A: Excess tools increase decision complexity and reduce tool selection reliability.
- Q: Where should shared MCP servers be configured for team use?  
  A: Project-scoped `.mcp.json` with env var expansion for credentials.
- Q: What should tool descriptions include to reduce misrouting?  
  A: Expected inputs, example queries, outputs, edge cases, and when to use the tool.
- Q: How can MCP resources reduce exploratory tool calls?  
  A: By exposing content catalogs (issue lists, documentation hierarchies) as discoverable resources.
