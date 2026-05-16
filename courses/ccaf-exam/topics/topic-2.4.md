# Task 2.4 — Integrate MCP servers into Claude Code and agent workflows

> **Domain 2 · Tool Design & MCP Integration** · 18% of the exam
>
> _First study 2026-05-02: scoping (`.mcp.json` vs `~/.claude.json`), env-var expansion as the credential boundary, MCP resources for catalogues, description craft vs built-in `Grep`, and community-vs-custom server choice._

## Why this matters

Task 2.4 is where Tool Design meets day-to-day **Claude Code** and **Agent SDK** usage. Other Domain 2 tasks cover how to *design* tools; 2.4 covers how to *deliver* them — how MCP servers attach, who sees them, where credentials live, and why a good MCP tool can be silently bypassed for `Grep` if its description is weak. The exam tests two recurring patterns: a **scoping/credentials** question and a **discoverability/description** question.

## Project-scoped `.mcp.json` vs user-scoped `~/.claude.json`

MCP servers attach to Claude Code through one of two config files, and the choice tells you **who sees the server**:

- **`.mcp.json`** at the project root is **project-scoped**. Checked into version control, shared with the team. Anyone cloning the repo and running Claude Code inside it gets the same MCP servers. Right home for **shared team tooling** — the MCP server wrapping your internal API, your team's Jira, your docs server. Principle: "if every teammate in this repo needs it, it lives in `.mcp.json`."
- **`~/.claude.json`** is **user-scoped**, on the developer's home directory, not shared. Right home for **personal or experimental** servers — a custom MCP server you're prototyping, a personal integration you don't want to inflict on teammates. Principle: "if only I need this, it lives in `~/.claude.json`."

A concrete shape — same project, two scopes:

```json
// .mcp.json — checked in, every teammate gets these
{
  "mcpServers": {
    "jira":         { "command": "npx",  "args": ["-y", "@team/mcp-jira"] },
    "internal-api": { "command": "node", "args": ["./tools/mcp-server.js"] }
  }
}

// ~/.claude.json — personal, not shared
{ "mcpServers": { "my-todo": { "command": "node", "args": ["~/mcp-todo/server.js"] } } }
```

**Common pitfall:** committing a personal experimental server into `.mcp.json`. Teammates pull, their Claude Code tries to spawn a server they don't have installed, breakage ensues. Inverse pitfall: putting a shared team server only in `~/.claude.json` so onboarding teammates can't reproduce your workflow.

**Quick recall**
- **Q:** Where does a team-shared MCP server config live? → `.mcp.json` at the project root, checked into VCS.
- **Q:** Where does a personal/experimental MCP server config live? → `~/.claude.json` (user-scoped, not shared).

## Environment-variable expansion in `.mcp.json` for credentials

Because `.mcp.json` is committed, raw secrets in it would leak into the repo history. The MCP config supports **environment-variable expansion** with `${VAR}` syntax to keep credentials out of the file. The committed config references the variable; the developer (or CI) populates the value via their shell environment. This is the **credential boundary** between shared config and per-developer secrets.

A concrete shape:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    },
    "jira": {
      "command": "npx", "args": ["-y", "@team/mcp-jira"],
      "env": { "JIRA_API_TOKEN": "${JIRA_TOKEN}", "JIRA_BASE_URL": "${JIRA_URL}" }
    }
  }
}
```

Each developer sets `GITHUB_TOKEN`, `JIRA_TOKEN`, etc. in their shell. The committed `.mcp.json` is identical for everyone; the resolved config at runtime is per-developer. The pattern gives every teammate access **with their own identity** (their PAT, their Jira account) rather than baking a shared service-account token into the repo, and lets CI use a separate audited token without code changes.

**Common pitfall:** hard-coding a literal token into `.mcp.json` "just to get it working" and committing it. This leaks the secret into git history forever, even after a later cleanup commit. Always use `${VAR}` expansion from day one for any field that holds a credential.

**Quick recall**
- **Q:** Why does `.mcp.json` use `${VAR}` expansion for tokens? → To keep secrets out of version control while still letting the committed config describe the server. Each developer (or CI) supplies the value via their environment.
- **Q:** What goes wrong if a literal API token is committed in `.mcp.json`? → It leaks into git history permanently and gives every repo cloner the same shared identity.

## All configured MCP servers are discovered at connection time

When a Claude Code session (or an Agent SDK runtime) starts, **every MCP server listed across both `.mcp.json` and `~/.claude.json` is connected and its tools enumerated**. Tool discovery happens **once, at connection time**, and from that point on the agent has the **simultaneous union** of every server's tools available. The agent does not "load" or "switch" MCP servers per request — the full toolset is always there.

Two design implications:

1. **No on-the-fly loading.** You can't wait until the agent needs Jira to spin up the Jira server. Either it's configured at session start or it isn't.
2. **Tools collide in the same selection space.** Every MCP tool competes for attention alongside every other MCP tool *and* every built-in. This is why Task 2.3's overload concern (≥18 tools degrades selection) and Task 2.1's description-quality concern matter so much for MCP.

Example: a Scenario 4 session attaches `github`, `jira`, internal `service-catalog`, plus built-in `Read`, `Grep`, `Glob`, `Bash`, `Edit`. A weakly-described `jira_search` may be passed over in favour of `Grep` over a checked-in `tickets/` directory.

**Common pitfall:** assuming the agent will "find" a useful MCP server you didn't configure, or treating MCP servers as something that can be enabled mid-session. Configuration is a session-start decision, not a runtime negotiation.

**Quick recall**
- **Q:** When are MCP server tools discovered? → At session connection time — once, at the start; the full union of all configured servers' tools is then available simultaneously.
- **Q:** What does "available simultaneously" imply for tool design? → Every MCP tool competes for selection alongside every other MCP and built-in tool. Description quality and tool-distribution discipline (Tasks 2.1, 2.3) become more important as you attach more MCP servers.

## MCP resources for content catalogs

MCP exposes two primitives: **tools** (callable actions like `jira_create_issue`) and **resources** (content objects the agent can read, like `jira://issues/PROJ-123`). Resources are the right mechanism for **content catalogues** — issue summaries, documentation hierarchies, database schemas — the agent should *see* without an exploratory tool call.

Every exploratory tool call costs a turn and risks a wrong query. If "what's available" is exposed as resources, the agent gets a structured directory at session start and targets the right item directly.

A concrete shape — a Multi-Agent Research docs MCP server:

```text
Resources advertised by docs-mcp at connection:
  docs://product/overview
  docs://api/reference
  docs://api/auth
  docs://playbooks/incident-response
  docs://playbooks/deploy
```

The research subagent sees this list up-front. If the user asks about incident response, the agent can `read_resource("docs://playbooks/incident-response")` directly. Without the resource catalogue, the agent would have to call `search_docs("incident")`, evaluate hits, possibly `list_pages`, then read — three round-trips for what should be one. The same applies to Jira issue summaries, database schemas, and any other domain catalogue.

**Common pitfall:** modelling everything as a tool. If the agent has to call `list_*` or `search_*` just to know what exists, you've spent turns on what a resource catalogue would have provided for free at connection time.

**Quick recall**
- **Q:** What is an MCP resource, and when do you reach for one? → A content object the agent can read directly (`read_resource(URI)`); use it when you have a catalogue (issues, docs, schemas) the agent should *see* without an exploratory tool call.
- **Q:** Why prefer a resource catalogue over a `list_*` tool? → Resources are advertised at connection time, so the agent has visibility upfront — no extra turns spent discovering what exists.

## Enhancing MCP tool descriptions to win over built-in tools

Built-in tools like **`Grep`** are *always* attached and have crisp, well-known semantics. When you attach an MCP server whose tools overlap functionally with a built-in (`search_code`, `find_in_repo`, `query_logs`), the agent will frequently default to `Grep` unless your MCP tool's **description explicitly explains why and when to prefer it**. This is the most common reason a "we shipped that MCP tool, why isn't Claude using it?" complaint surfaces.

An MCP tool description has to **affirmatively explain its added capability over the built-in alternative**. Three things to include:

1. **What the MCP tool does that the built-in can't.** "Searches across all 14 production microservices, including ones not in the local checkout" beats "searches code."
2. **The shape of the output.** If your MCP tool returns ranked, deduplicated, ownership-annotated results, *say so* — that's a reason for the model to choose it.
3. **Concrete invocation hints with example queries.** "Use this when the user asks about cross-repo behaviour or wants ownership info" gives the model a clear handle.

A weak vs strong description for the same tool:

```text
Weak:   "search_code: Search code."
Strong: "search_code: Search across all 14 production service repos and return
         ranked, deduplicated matches with the owning team and last-modified
         date. Use this — not built-in Grep — whenever the question spans
         repos or needs ownership info."
```

With the strong description the model knows the tool reaches further than `Grep` and what it gets back. With the weak one it has no positive reason to deviate from the built-in.

**Common pitfall:** treating MCP tool descriptions as developer comments — short, jargony. The model is the reader, and it has to choose between your tool and `Grep` purely from the description.

**Quick recall**
- **Q:** Why does an MCP tool description need to call out the built-in alternative? → Because built-ins like `Grep` are always present and the model defaults to them unless the MCP description gives a positive reason to pick the MCP tool instead.
- **Q:** What three pieces should a competitive MCP description include? → Capability beyond the built-in, the output shape, and example queries / invocation hints.

## Choosing community MCP servers over custom for standard integrations

For **standard third-party systems** (Jira, GitHub, GitLab, Slack, Confluence, common databases), there is almost always a **community-maintained MCP server** published. Default: **adopt the community server**. Reasons: surface-area maintenance is already absorbed; descriptions already win against built-ins; upgrades are someone else's job.

The flip side: **custom MCP servers are right for team-specific workflows** no community server covers — your internal API, your bespoke deployment system. Custom is also right when a community server has a critical gap (missing endpoint, wrong auth model) you need now.

```text
Standard       → community: jira / github / postgres → @modelcontextprotocol/server-*
Team-specific  → custom:    internal-api / prod-deploys → ./tools/mcp-*
```

**Common pitfall:** building a custom MCP server for a system with a mature community version. You take on permanent maintenance for a solved problem and your descriptions probably won't beat the community ones. Reserve custom-server effort for workflows that are genuinely yours.

**Quick recall**
- **Q:** Default choice for a standard integration like Jira or GitHub? → A community-maintained MCP server.
- **Q:** When is a custom MCP server the right call? → For team-specific workflows no community server covers, or to fill a critical gap in an otherwise-good community server.

## Anti-patterns

- ❌ **Personal experimental MCP servers in committed `.mcp.json`.** Teammates pull and Claude Code fails to spawn a server they don't have.
- ✅ **Put personal/experimental servers in user-scoped `~/.claude.json`; only shared team tooling goes in `.mcp.json`.**
- ❌ **Hard-coded API tokens in `.mcp.json`.** Leaks the secret into git history permanently and gives every cloner the same shared identity.
- ✅ **Use `${VAR}` env-variable expansion from day one for any credential field.**
- ❌ **Treating MCP server attach as runtime.** Tools are discovered once at session start; you can't enable Jira mid-conversation.
- ✅ **Configure all required MCP servers at session-start time; treat attach as a session-start decision.**
- ❌ **Modelling content catalogues as `list_*` tools instead of MCP resources.** Costs extra turns to discover what exists.
- ✅ **Expose catalogues (issues, docs, schemas) as MCP resources advertised at connection time.**
- ❌ **Shipping an MCP tool with a one-line description and wondering why the agent uses `Grep`.** The model defaults to built-ins unless the description gives a positive reason.
- ✅ **Write descriptions that affirmatively call out capability beyond the built-in, output shape, and when-to-use.**
- ❌ **Building a custom MCP server for a standard integration with a mature community version.** You inherit permanent maintenance for a solved problem.
- ✅ **Adopt the community MCP server for standard integrations (Jira, GitHub, Postgres); reserve custom for team-specific workflows.**
- ❌ **Assuming MCP server count is free.** Every server's tools enter the same selection space; piling on servers degrades selection.
- ✅ **Treat each new server as an addition to the unified toolbox — apply Task 2.3 overload limits and Task 2.1 description discipline.**

---

## Worked example — Scenario 1 (Customer Support Resolution Agent)

A team shipping the customer support agent wants three integrations: their internal **Customer DB** (proprietary REST API), **Jira Service Management** for escalations, and **GitHub** for issues teammates filed against the agent. Project-scoped `.mcp.json` declares all three: `customer-db` (custom server at `./tools/mcp-customer-db.js`), `jira` (community `@modelcontextprotocol/server-jira`), `github` (community). Auth uses `${CUSTOMER_DB_TOKEN}`, `${JIRA_TOKEN}`, `${GITHUB_TOKEN}` so no secrets sit in the repo and each support engineer authenticates as themselves. Jira and GitHub are community choices because both are standard integrations; only `customer-db` is custom because no community server speaks the proprietary protocol. The team also exposes `customer-db://schemas/customer` and `customer-db://schemas/order` as **MCP resources**, so the agent has the schema visible at session start — no exploratory `list_fields` calls. After deployment, telemetry shows the agent hitting `Grep` over local escalation playbooks instead of calling `jira_search_issues`. The fix is **description enhancement**: rewrite "Search Jira issues" to "Search live Jira Service Management issues across all support projects, returning ranked results with status, assignee, and SLA timer. Use this — not Grep — whenever the user asks about ticket status, ownership, or SLA breach risk." The agent then routes the right questions to `jira_search_issues`.

---

## Quick recall (full set)

- **Q:** Where do shared team MCP servers vs personal ones go? → Shared in project-scoped `.mcp.json` (checked in); personal/experimental in user-scoped `~/.claude.json`.
- **Q:** Why does `.mcp.json` support `${VAR}` expansion? → To keep secrets out of version control; each developer (or CI) supplies the token via their environment.
- **Q:** When are MCP tools discovered, and what's the implication? → Once, at session connection time, across all configured servers; the full union is then simultaneously available and competes for the model's tool-selection attention.
- **Q:** What is an MCP resource and when do you reach for one? → A content object the agent can `read_resource(URI)` directly; use it for catalogues (issues, docs, schemas) so the agent doesn't burn turns on exploratory `list_*` / `search_*` calls.
- **Q:** Why might a functional MCP tool be ignored in favour of `Grep`? → Its description doesn't give the model a positive reason to deviate from the always-present built-in. Fix: rewrite to call out capability beyond `Grep`, output shape, and when-to-use.
- **Q:** Default choice for integrating Jira or GitHub? → A community-maintained MCP server. Build custom only for team-specific workflows or to fill a critical gap.
- **Q:** Failure mode of committing a literal API token in `.mcp.json`? → The secret leaks into git history permanently and every cloner inherits the same shared identity. Use `${VAR}` from day one.
- **Q:** Failure mode of putting an experimental personal MCP server in `.mcp.json`? → Teammates pull and Claude Code fails to spawn a server they don't have installed.
- **Q:** Relation between 2.4 and 2.1 / 2.3? → 2.4 is delivery: how MCP servers attach. 2.1 (descriptions) and 2.3 (tool distribution / overload) decide whether the delivered tools actually get *selected*.
