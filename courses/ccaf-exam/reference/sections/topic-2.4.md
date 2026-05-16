# Task 2.4 — Integrate MCP servers into Claude Code and agent workflows

> Domain 2: Tool Design & MCP Integration. Excerpted from the official guide.

## Knowledge of
- **MCP server scoping**: project-level (`.mcp.json`) for shared team tooling vs user-level (`~/.claude.json`) for personal/experimental servers.
- Environment variable expansion in `.mcp.json` (e.g., `${GITHUB_TOKEN}`) for credential management without committing secrets.
- That tools from **all configured MCP servers are discovered at connection time** and available simultaneously to the agent.
- **MCP resources** as a mechanism for exposing content catalogs (e.g., issue summaries, documentation hierarchies, database schemas) to reduce exploratory tool calls.

## Skills in
- Configuring shared MCP servers in project-scoped `.mcp.json` with environment variable expansion for authentication tokens.
- Configuring personal/experimental MCP servers in user-scoped `~/.claude.json`.
- **Enhancing MCP tool descriptions** to explain capabilities and outputs in detail, preventing the agent from preferring built-in tools (like Grep) over more capable MCP tools.
- Choosing existing community MCP servers over custom implementations for standard integrations (e.g., Jira), reserving custom servers for team-specific workflows.
- Exposing content catalogs as **MCP resources** to give agents visibility into available data without requiring exploratory tool calls.
