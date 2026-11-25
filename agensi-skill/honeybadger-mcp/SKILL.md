---
name: honeybadger-mcp
description: >-
  Sets up the Honeybadger MCP server and uses it to list projects and faults,
  fetch notices, compare deploys, and analyze production errors with the
  application stack and redacted request context. Use when the user asks to
  set up Honeybadger MCP, list unresolved production errors, inspect a
  Honeybadger fault ID, debug a Honeybadger exception, or analyze an error
  from Honeybadger in Cursor, Claude Code, or another MCP client.
---

# Honeybadger MCP

Connect an AI coding agent to Honeybadger so it can inspect live faults and suggest fixes.

## Prerequisites

- Node.js 18+
- Honeybadger account with API access
- An MCP-capable agent (Cursor, Claude Desktop, Claude Code, Windsurf, etc.)

## Setup (do this first if MCP tools are missing)

1. Confirm whether Honeybadger MCP tools are already available (`list_honeybadger_faults`, `analyze_honeybadger_issue`, `list_honeybadger_deploys`).
2. If they are missing, guide the user through setup using [references/setup.md](references/setup.md).
3. Apply the config template from [assets/mcp-config.template.json](assets/mcp-config.template.json). Never invent or hardcode API keys.
4. Ask the user to place these values in their local MCP config themselves. Do not echo the token back, write it into the repo, or send it anywhere except that local config:
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

Once the MCP server is running, use these tools. All of them are read-only. The v2 API returns at most 25 faults or notices per call.

### `list_honeybadger_projects` / `get_honeybadger_project`
Find the project id, environments, and team emails. Project API tokens are not returned. Use an email with `assignee:email`. `assignee:me` matches nothing on the API.

### `list_honeybadger_faults`
Open faults (`-is:resolved -is:ignored`), most recently seen, unless you pass another `state` or `q`.

- `environment` and `resolved` are folded into `q`. They are not separate API parameters.
- `order`: `recent` (default), `frequent`, or `created`
- `q`: Honeybadger search. Do not use `is:unresolved` — it is not a filter and matches everything.
- Time in `q`: `last_occurred.after:"24 hours ago"`, `created.after:"last deploy"`
- `limit` max 25. `page_url` for the next page.

### `summarize_honeybadger_faults`
Counts for the same search, before you list.

### `get_honeybadger_fault` / `get_honeybadger_notices`
One fault, or its occurrences. Notices include the application stack, request URL, user, and redacted context. Cookies and secrets are omitted.

### `get_honeybadger_occurrences`
Buckets for one fault (default `day`) or the project (default `hour`).

### `list_honeybadger_affected_users`
Who hit one fault.

### `list_honeybadger_deploys`
Recent deploys. Compare timestamps with `last_notice_at`; do not treat a deploy as the cause by itself.

### `get_honeybadger_report`
`notices_by_class`, `notices_by_location`, `notices_by_user`, or `notices_per_day`.

### `analyze_honeybadger_issue`
Fault, latest notices, daily counts, deploys in that environment, and affected users.

- `fault_id` (required)
- `include_context` (optional, default true)

## Investigation workflow

Copy and track:

```
Honeybadger investigation:
- [ ] Confirm MCP tools are available
- [ ] If the project id is unknown, list_honeybadger_projects
- [ ] List recent open faults (environment if known)
- [ ] Analyze the chosen fault_id
- [ ] Check deploys if timing matters
- [ ] Map the application frame to local source
- [ ] Propose a concrete fix + tests
```

### Steps

1. **Triage** — `list_honeybadger_faults` with the environment. The default search is already open faults, newest first. Pass `order: "frequent"` when volume matters more than recency.
2. **Deep dive** — `analyze_honeybadger_issue` for the chosen `fault_id`.
3. **Context** — use the redacted params from that analysis. Call `get_honeybadger_notices` only when you need another occurrence.
4. **Deploys** — `list_honeybadger_deploys` for that environment when the question is whether this started after a release.
5. **Locate** — open the primary application frame (`file:line`) in the workspace. Prefer `application_trace` over gem frames.
6. **Fix** — implement the smallest safe change; add a regression test when practical.
7. **Report** — summarize fault class, root cause, fix, and how to verify.

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

Sample inputs and the report shape to return are in [examples/sample-runs.md](examples/sample-runs.md).

## Boundaries

- Do not modify Honeybadger data; this skill is read/investigate only. Do not resolve, ignore, or delete faults.
- Do not invent fault IDs, project IDs, or stack traces.
- Do not search with `is:unresolved` or `assignee:me`. Use `-is:resolved` and an assignee email.
- If auth or project ID is missing, stop and ask for credentials / config — do not fabricate them.
- Prefer `analyze_honeybadger_issue` before long manual reasoning when a fault ID is known.

## Troubleshooting

See [references/setup.md](references/setup.md) for install paths, Cursor/Claude config snippets, and common auth errors.
