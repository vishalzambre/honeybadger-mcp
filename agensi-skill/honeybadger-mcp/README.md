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
| `SKILL.md` | Agent instructions + frontmatter |
| `references/setup.md` | Install, credentials, troubleshooting |
| `assets/mcp-config.template.json` | Global-binary MCP config |
| `assets/mcp-config.local-path.template.json` | Local `node dist/index.js` config |

## Listing notes (Agensi)

Suggested marketplace description:

> Connect your coding agent to Honeybadger. List production faults, inspect notices, and get stack-aware fix suggestions via the Honeybadger MCP server — with copy-paste Cursor/Claude config and a clear investigation workflow.

Suggested price: free (no payout setup required) or a low one-time price once Zoneless/Stripe payouts are connected.

## License

MIT — same as the honeybadger-mcp server.
