# Honeybadger MCP (Agensi skill)

Agent skill that installs/configures [@vishalzambre/honeybadger-mcp](https://github.com/vishalzambre/honeybadger-mcp) and drives Honeybadger fault investigation from Cursor, Claude Code, and other MCP clients.

## What you get

- Setup instructions for the Honeybadger MCP server
- Ready-to-copy MCP config templates
- A repeatable triage → analyze → fix workflow
- Tool reference for listing faults, notices, and issue analysis

## Requirements

- Node.js 18+
- Honeybadger Personal Auth Token + project ID
- MCP-capable agent

## Quick start

1. Install the skill via Agensi (or unzip into your agent's skills directory).
2. Follow `references/setup.md` to install the MCP server and apply `assets/mcp-config.template.json`.
3. Restart the agent and ask: "List recent unresolved Honeybadger faults in production."

## Files

| Path | Purpose |
|---|---|
| `SKILL.md` | Agent instructions + frontmatter (`name`, `description`) |
| `references/setup.md` | Install, credentials, troubleshooting |
| `examples/sample-runs.md` | Sample prompts, tool calls, and report shape |
| `assets/mcp-config.template.json` | Global-binary MCP config |
| `assets/mcp-config.local-path.template.json` | Local `node dist/index.js` config |

## Listing notes (Agensi)

Paste these into Creator Studio. Leave the price at free so no Stripe or Zoneless payout setup is required.

**Title:** Honeybadger MCP

**Price:** Free

**Description:**

> Connect your coding agent to Honeybadger. This skill installs and configures the Honeybadger MCP server, then lists production faults, inspects notices, and returns stack-aware fix suggestions. Includes a Cursor and Claude config template plus setup instructions. Use it when debugging Honeybadger exceptions, unresolved production errors, or a specific fault ID.

**Tags:** honeybadger, mcp, error-tracking, debugging, cursor

## License

MIT — same as the honeybadger-mcp server.
