# Honeybadger MCP Server Setup Guide

This MCP server integrates Honeybadger error tracking with Cursor IDE, allowing you to fetch and analyze errors directly from your development environment.

## Prerequisites

- Node.js 18+ installed
- Honeybadger account with API access
- Cursor IDE with MCP support

## Installation

### 1. Clone the MCP Server

```bash
git clone git@github.com:vishalzambre/honeybadger-mcp.git
cd honeybadger-mcp
npm install
```

### 2. Build the Project

```bash
npm run build
```

### 3. Using as an NPM Package (Recommended)

**Global Installation:**

```bash
npm install -g honeybadger-mcp
```

Then configure it in Cursor:

```json
{
  "mcpServers": {
    "honeybadger": {
      "command": "honeybadger-mcp",
      "env": {
        "HONEYBADGER_API_KEY": "your_api_key_here",
        "HONEYBADGER_PROJECT_ID": "your_project_id"
      }
    }
  }
}
```

**Project-based Installation (Alternative):**

If you prefer to manage the MCP server as a project dependency:

```bash
npm install honeybadger-mcp
```

In this case, the command in your Cursor `mcp_servers.json` would point to the local installation within your project's `node_modules`:

```json
{
  "mcpServers": {
    "honeybadger": {
      "command": "node",
      "args": ["./node_modules/honeybadger-mcp/dist/index.js"],
      "env": {
        "HONEYBADGER_API_KEY": "your_api_key_here",
        "HONEYBADGER_PROJECT_ID": "your_project_id"
      }
    }
  }
}
```

### 4. Configure Environment Variables

Create a `.env` file in your project root:

```bash
# Required: Your Honeybadger API key
HONEYBADGER_API_KEY=your_api_key_here

# Optional: Default project ID (can be overridden per request)
HONEYBADGER_PROJECT_ID=your_project_id

# Optional: Custom Honeybadger URL (defaults to https://app.honeybadger.io)
HONEYBADGER_BASE_URL=https://app.honeybadger.io
```

### 4. Get Your Honeybadger Credentials

1. **API Key**:
   - Go to https://app.honeybadger.io/users/auth_tokens
   - Create a new Personal Auth Token
   - Copy the token for your `.env` file

2. **Project ID**:
   - Go to your project in Honeybadger
   - The project ID is in the URL: `https://app.honeybadger.io/projects/{PROJECT_ID}`
   - Or find it in project settings

## Cursor Configuration

### 1. Configure MCP in Cursor

Add the MCP server to your Cursor configuration. Edit your `~/.cursor/mcp_servers.json` (or equivalent):

```json
{
  "mcpServers": {
    "honeybadger": {
      "command": "node",
      "args": ["/path/to/honeybadger-mcp/dist/index.js"],
      "env": {
        "HONEYBADGER_API_KEY": "your_api_key_here",
        "HONEYBADGER_PROJECT_ID": "your_project_id"
      }
    }
  }
}
```

### 2. Alternative: Global Installation

This section will be updated or removed as it's now covered above. If you prefer the old way of cloning and installing globally from a local path, you can still do so, but using the published npm package is recommended for easier updates and management.

If installing from a local clone:
```bash
# Navigate to your cloned honeybadger-mcp directory
npm install -g . # Installs from the current directory

# Then configure in Cursor as before
# ... (Cursor configuration for local global install)
```

## Usage

Once configured, you can use these tools in Cursor:

### 1. List Recent Faults

```
List recent unresolved errors from Honeybadger in production environment
```

### 2. Get Specific Fault Details

```
Get details for Honeybadger fault ID 12345
```

### 3. Analyze an Issue

```
Analyze Honeybadger issue 12345 and provide fix suggestions
```

### 4. Get Error Occurrences

```
Get the latest 5 occurrences for Honeybadger fault 12345
```

## Available Tools

### `list_honeybadger_faults`
Lists recent faults with optional filtering by environment and resolved status.

**Parameters:**
- `project_id` (optional): Project ID
- `limit` (optional): Number of faults (default: 20, max: 100)
- `environment` (optional): Filter by environment
- `resolved` (optional): Filter by resolved status

### `get_honeybadger_fault`
Fetches detailed information about a specific fault.

**Parameters:**
- `fault_id` (required): The fault ID
- `project_id` (optional): Project ID

### `get_honeybadger_notices`
Fetches notices (error occurrences) for a specific fault.

**Parameters:**
- `fault_id` (required): The fault ID
- `project_id` (optional): Project ID
- `limit` (optional): Number of notices (default: 10, max: 100)

### `analyze_honeybadger_issue`
Provides comprehensive analysis with fix suggestions.

**Parameters:**
- `fault_id` (required): The fault ID
- `project_id` (optional): Project ID
- `include_context` (optional): Include request context (default: true)

## Example Workflow

1. **List recent errors**: "Show me the latest unresolved errors from production"
2. **Analyze specific error**: "Analyze Honeybadger fault 12345 and suggest fixes"
3. **Get error context**: "Get the latest occurrences for fault 12345 with full context"
4. **Review and fix**: Use the analysis to understand and fix the issue in your code

## Troubleshooting

### Common Issues

1. **Authentication Error**: Verify your API key is correct and has proper permissions
2. **Project Not Found**: Check your project ID is correct
3. **Connection Issues**: Verify network access to Honeybadger API

### Debug Mode

Run the server directly to see error messages:

```bash
node dist/index.js
```

### Logs

Check Cursor logs for MCP-related issues:
- macOS: `~/Library/Logs/Cursor/`
- Windows: `%APPDATA%\Cursor\logs\`
- Linux: `~/.config/Cursor/logs/`

## Security Notes

- Store API keys securely and never commit them to version control
- Use environment-specific API keys when possible
- Consider using read-only API tokens for this integration
- Regularly rotate your API keys

## Contributing

To extend this MCP server:

1. Add new tools in the `setupToolHandlers()` method
2. Implement corresponding handler methods
3. Update the tool list and documentation
4. Test thoroughly with your Honeybadger setup

## Support

For issues with:
- **This MCP server**: Check the code and configuration
- **Honeybadger API**: Refer to [Honeybadger API docs](https://docs.honeybadger.io/api/)
- **Cursor MCP integration**: Check Cursor documentation
