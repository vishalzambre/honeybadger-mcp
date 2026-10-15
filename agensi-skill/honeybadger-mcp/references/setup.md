# Honeybadger MCP — setup reference

## Install options

### Option A — global npm binary (recommended)

```bash
npm install -g @vishalzambre/honeybadger-mcp
```

If the package is only available from GitHub Packages:

```bash
npm install -g @vishalzambre/honeybadger-mcp --registry=https://npm.pkg.github.com
```

Or clone and build:

```bash
git clone https://github.com/vishalzambre/honeybadger-mcp.git
cd honeybadger-mcp
npm install
npm run build
npm install -g .
```

### Option B — local path to built `dist/index.js`

```bash
git clone https://github.com/vishalzambre/honeybadger-mcp.git
cd honeybadger-mcp
npm install
npm run build
```

Point MCP `command`/`args` at the absolute path to `dist/index.js`.

## Get Honeybadger credentials

1. **API key (Personal Auth Token)**  
   https://app.honeybadger.io/users/auth_tokens  
   Create a token and copy it into `HONEYBADGER_API_KEY`.

2. **Project ID**  
   From the project URL: `https://app.honeybadger.io/projects/{PROJECT_ID}`  
   Or from project settings. Put it in `HONEYBADGER_PROJECT_ID`.

3. **EU region**  
   Set `HONEYBADGER_BASE_URL=https://eu-app.honeybadger.io` and use an EU-region auth token.

## Config template

Copy [assets/mcp-config.template.json](../assets/mcp-config.template.json) into the client's MCP config file, then replace placeholders.

### Cursor

Edit `~/.cursor/mcp.json` (or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "honeybadger": {
      "command": "honeybadger-mcp",
      "env": {
        "HONEYBADGER_API_KEY": "YOUR_PERSONAL_AUTH_TOKEN",
        "HONEYBADGER_PROJECT_ID": "YOUR_PROJECT_ID"
      }
    }
  }
}
```

Local build alternative:

```json
{
  "mcpServers": {
    "honeybadger": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/honeybadger-mcp/dist/index.js"],
      "env": {
        "HONEYBADGER_API_KEY": "YOUR_PERSONAL_AUTH_TOKEN",
        "HONEYBADGER_PROJECT_ID": "YOUR_PROJECT_ID"
      }
    }
  }
}
```

### Claude Desktop

Same `mcpServers` block inside `claude_desktop_config.json` (location varies by OS).

### Claude Code

```bash
claude mcp add honeybadger --env HONEYBADGER_API_KEY=YOUR_TOKEN --env HONEYBADGER_PROJECT_ID=YOUR_ID -- honeybadger-mcp
```

Or with node path:

```bash
claude mcp add honeybadger --env HONEYBADGER_API_KEY=YOUR_TOKEN --env HONEYBADGER_PROJECT_ID=YOUR_ID -- node /ABSOLUTE/PATH/TO/honeybadger-mcp/dist/index.js
```

## Environment variables

```bash
HONEYBADGER_API_KEY=your_api_key_here
HONEYBADGER_PROJECT_ID=your_project_id
# Optional:
HONEYBADGER_BASE_URL=https://app.honeybadger.io
```

## Verify

1. Restart the agent so MCP reloads.
2. Confirm tools appear: `list_honeybadger_faults`, `get_honeybadger_fault`, `get_honeybadger_notices`, `analyze_honeybadger_issue`.
3. Ask: "List recent unresolved Honeybadger faults."

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `HONEYBADGER_API_KEY environment variable is required` | Missing env in MCP config | Add `env.HONEYBADGER_API_KEY` |
| `Project ID is required` | No default / no per-call ID | Set `HONEYBADGER_PROJECT_ID` or pass `project_id` |
| `401` / auth API error | Bad or wrong-region token | Recreate token; check US vs EU base URL |
| Tools not listed | MCP not loaded / bad command path | Fix path, rebuild, restart agent |
| Command not found `honeybadger-mcp` | Global install missing | Use `node` + absolute `dist/index.js` path |

## Debug

Run the server in a terminal to see stderr:

```bash
HONEYBADGER_API_KEY=... HONEYBADGER_PROJECT_ID=... honeybadger-mcp
# or
node /path/to/honeybadger-mcp/dist/index.js
```

Cursor MCP logs (macOS): `~/Library/Logs/Cursor/`

## Security

- Do not commit API keys or paste them into chat logs unnecessarily.
- Prefer personal auth tokens used only for local agent access.
- Rotate tokens if exposed.
