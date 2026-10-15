---
name: honeybadger-mcp
description: >-
  Sets up and uses the Honeybadger MCP server to list faults, fetch notices,
  and analyze production errors with fix suggestions. Use when the user
  mentions Honeybadger, production errors, fault IDs, unresolved exceptions,
  error tracking, or asks to debug/analyze Honeybadger issues in Cursor,
  Claude Code, or other MCP clients.
---

# Honeybadger MCP

Connect an AI coding agent to Honeybadger so it can inspect live faults and suggest fixes.

## Prerequisites

- Node.js 18+
- Honeybadger account with API access
- An MCP-capable agent (Cursor, Claude Desktop, Claude Code, Windsurf, etc.)

## Setup (do this first if MCP tools are missing)

1. Confirm whether Honeybadger MCP tools are already available (`list_honeybadger_faults`, `get_honeybadger_fault`, `get_honeybadger_notices`, `analyze_honeybadger_issue`).
2. If they are missing, guide the user through setup using [references/setup.md](references/setup.md).
3. Apply the config template from [assets/mcp-config.template.json](assets/mcp-config.template.json). Never invent or hardcode API keys.
4. Ask the user for:
   - `HONEYBADGER_API_KEY` — Personal Auth Token from https://app.honeybadger.io/users/auth_tokens
   - `HONEYBADGER_PROJECT_ID` — numeric ID from the project URL (`/projects/{ID}`)
5. After config changes, tell the user to restart the agent / reload MCP servers.
6. Verify with a light call: list a few recent unresolved faults.

## Credentials (required)

| Variable | Required | Purpose |
|---|---|---|
| `HONEYBADGER_API_KEY` | Yes | Personal Auth Token (Basic auth username) |
| `HONEYBADGER_PROJECT_ID` | Recommended | Default project; can be overridden per tool call |
| `HONEYBADGER_BASE_URL` | No | Defaults to `https://app.honeybadger.io` (EU: `https://eu-app.honeybadger.io`) |

Never commit secrets. Prefer read-only / personal auth tokens scoped for investigation.

## Available tools

Once the MCP server is running, use these tools:

### `list_honeybadger_faults`
List recent faults.

- `project_id` (optional)
- `limit` (optional, default 20, max 100)
- `environment` (optional, e.g. `production`)
- `resolved` (optional boolean)
- `q` (optional Honeybadger query string)
- `page_url` (optional pagination URL from `links.next` / `links.prev`)

### `get_honeybadger_fault`
Fetch one fault by ID.

- `fault_id` (required)
- `project_id` (optional)

### `get_honeybadger_notices`
Fetch occurrences for a fault.

- `fault_id` (required)
- `project_id` (optional)
- `limit` (optional, default 10, max 100)
- `q` (optional)
- `page_url` (optional)

### `analyze_honeybadger_issue`
Full analysis with stack context and fix suggestions.

- `fault_id` (required)
- `project_id` (optional)
- `include_context` (optional, default true)

## Investigation workflow

Copy and track:

```
Honeybadger investigation:
- [ ] Confirm MCP tools are available
- [ ] List recent unresolved faults (environment if known)
- [ ] Pick the target fault_id
- [ ] Analyze the issue
- [ ] Pull latest notices if more context is needed
- [ ] Map stack frames to local source
- [ ] Propose a concrete fix + tests
```

### Steps

1. **Triage** — `list_honeybadger_faults` with `resolved: false` and the right `environment`.
2. **Deep dive** — `analyze_honeybadger_issue` for the chosen `fault_id`.
3. **Context** — if params/session/CGI data matter, call `get_honeybadger_notices`.
4. **Locate** — open the primary file/line from the stack trace in the workspace.
5. **Fix** — implement the smallest safe change; add a regression test when practical.
6. **Report** — summarize fault class, root cause, fix, and how to verify.

## Output format

When reporting findings, use:

```markdown
## Honeybadger finding
- **Fault ID:** …
- **Class / message:** …
- **Environment:** …
- **Occurrences:** …
- **Primary location:** `path:line` in `method`
- **Root cause:** one short paragraph
- **Recommended fix:** concrete steps or patch outline
- **Verification:** how to confirm in Honeybadger / tests
```

## Example prompts to support

- "List recent unresolved Honeybadger errors in production"
- "Analyze Honeybadger fault 12345"
- "Get the latest 5 notices for fault 12345"
- "Help me fix this Honeybadger NoMethodError"

## Boundaries

- Do not modify Honeybadger data; this skill is read/investigate only.
- Do not invent fault IDs, project IDs, or stack traces.
- If auth or project ID is missing, stop and ask for credentials / config — do not fabricate them.
- Prefer `analyze_honeybadger_issue` before long manual reasoning when a fault ID is known.

## Troubleshooting

See [references/setup.md](references/setup.md) for install paths, Cursor/Claude config snippets, and common auth errors.
