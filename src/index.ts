#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';
import { formatAnalysis } from './analyze.js';
import { HoneybadgerClient, type ApiResult } from './client.js';
import { readFault } from './model.js';
import {
  formatAffectedUsers,
  formatDeploys,
  formatFault,
  formatFaultList,
  formatNotices,
  formatOccurrences,
  formatProject,
  formatProjectList,
  formatRaw,
  formatReport,
  formatSummary,
} from './present.js';
import {
  buildFaultListRequest,
  buildFaultQuery,
  clampLimit,
  optionalString,
  readFaultQueryArgs,
  unixSeconds,
} from './search.js';

const VERSION = '0.4.0';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const projectId = z
  .string()
  .optional()
  .describe('Project ID. Defaults to HONEYBADGER_PROJECT_ID. Call list_honeybadger_projects to find it.');

const faultId = z.string().describe('Fault ID');

const raw = z.boolean().optional().describe('Return redacted JSON instead of the summary');

const searchArgs = {
  q: z
    .string()
    .optional()
    .describe(
      'Honeybadger search string. Examples: class:NoMethodError, environment:production, -is:resolved -is:ignored, last_occurred.after:"24 hours ago", created.after:"last deploy", context.user_email:a@b.com. Do not use is:unresolved (it is not a filter and matches everything). Do not use assignee:me (it matches nothing on the API; use an email, assignee:nobody, or assignee:anybody).'
    ),
  environment: z.string().optional().describe('Added to q as environment:"name"'),
  resolved: z
    .boolean()
    .optional()
    .describe('true adds is:resolved. false adds -is:resolved. Omit it to use state.'),
  ignored: z.boolean().optional().describe('true adds is:ignored. false adds -is:ignored.'),
  state: z
    .enum(['open', 'resolved', 'ignored', 'unresolved', 'all'])
    .optional()
    .describe('Status filter when resolved/ignored are omitted. Defaults to open (-is:resolved -is:ignored) unless q already sets status.'),
  occurred_after: z.union([z.string(), z.number()]).optional().describe('Unix seconds or ISO-8601. Limits notices counted in the window.'),
  occurred_before: z.union([z.string(), z.number()]).optional().describe('Unix seconds or ISO-8601'),
  created_after: z.union([z.string(), z.number()]).optional().describe('Unix seconds or ISO-8601. First-seen time.'),
};

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'Honeybadger tool failed';
  return { isError: true, content: [{ type: 'text', text: message }] };
}

class HoneybadgerMCPServer {
  private server = new McpServer({ name: 'honeybadger-mcp', version: VERSION });
  private client: HoneybadgerClient;

  constructor() {
    this.client = new HoneybadgerClient({
      apiKey: process.env.HONEYBADGER_API_KEY || '',
      projectId: process.env.HONEYBADGER_PROJECT_ID,
      baseUrl: process.env.HONEYBADGER_BASE_URL || 'https://app.honeybadger.io',
    });
    this.registerTools();
  }

  private registerTools(): void {
    this.tool(
      'list_honeybadger_projects',
      'List Honeybadger projects visible to this token: id, name, environments, and unresolved fault counts. Project API tokens are omitted.',
      { account_id: z.string().optional().describe('Limit the list to one account'), raw },
      (args) => this.listProjects(args)
    );

    this.tool(
      'get_honeybadger_project',
      'Get one Honeybadger project, including environments and team emails. Use an email with assignee:email in fault search. assignee:me does not work on the API. The project API token is omitted.',
      { project_id: projectId, raw },
      (args) => this.getProject(args)
    );

    this.tool(
      'list_honeybadger_faults',
      'List faults (errors) for a project. Defaults to open faults (-is:resolved -is:ignored), most recently seen first. Honeybadger returns at most 25 per request. environment and resolved are folded into the q search string; they are not separate API parameters.',
      {
        project_id: projectId,
        limit: z.number().optional().describe('Page size. Default 20, maximum 25.'),
        order: z.enum(['recent', 'frequent', 'created']).optional().describe('recent = last seen, frequent = most notices, created = oldest first. Default recent.'),
        page_url: z.string().optional().describe('Next-page URL previously returned by this tool. Replaces q, order, and limit.'),
        ...searchArgs,
        raw,
      },
      (args) => this.listFaults(args)
    );

    this.tool(
      'get_honeybadger_fault',
      'Fetch one fault: class, message, environment, status, counts, assignee, tags, and the Honeybadger URL.',
      { project_id: projectId, fault_id: faultId, raw },
      (args) => this.getFault(args)
    );

    this.tool(
      'get_honeybadger_notices',
      'Fetch occurrences of a fault. Returns the application stack, request URL, user, and redacted context/params. Cookies, session, and secrets are omitted. The v2 API returns at most 25 notices, newest first.',
      {
        project_id: projectId,
        fault_id: faultId,
        limit: z.number().optional().describe('How many notices to return. Default 10, maximum 25.'),
        created_after: searchArgs.created_after,
        created_before: z.union([z.string(), z.number()]).optional().describe('Unix seconds or ISO-8601'),
        page_url: z.string().optional().describe('Next-page URL previously returned by this tool'),
        raw,
      },
      (args) => this.getNotices(args)
    );

    this.tool(
      'summarize_honeybadger_faults',
      'Count faults for a project, using the same search rules as list_honeybadger_faults. Use this before listing when you only need how many errors are open.',
      { project_id: projectId, ...searchArgs, raw },
      (args) => this.summarizeFaults(args)
    );

    this.tool(
      'get_honeybadger_occurrences',
      'Occurrence counts over time. Pass fault_id for one error (default period day). Omit fault_id for the whole project (default period hour). period is hour, day, week, or month. Buckets are UTC.',
      {
        project_id: projectId,
        fault_id: z.string().optional().describe('Fault ID. Omit for project-wide counts.'),
        period: z.enum(['hour', 'day', 'week', 'month']).optional(),
        environment: z.string().optional().describe('Project-wide counts only'),
      },
      (args) => this.getOccurrences(args)
    );

    this.tool(
      'list_honeybadger_affected_users',
      'Users affected by one fault, most-affected first. Empty when the app does not send a user id or email.',
      {
        project_id: projectId,
        fault_id: faultId,
        q: z.string().optional().describe('Optional Honeybadger search string applied to the affected-user list'),
      },
      (args) => this.listAffectedUsers(args)
    );

    this.tool(
      'list_honeybadger_deploys',
      'Recent deploys for a project, newest first. Use this to see whether an error started after a release. Deploy time is a clue, not proof of cause.',
      {
        project_id: projectId,
        environment: z.string().optional(),
        local_username: z.string().optional().describe('Username recorded on the deploy'),
        limit: z.number().optional().describe('Default 10, maximum 25'),
        created_after: searchArgs.created_after,
        created_before: z.union([z.string(), z.number()]).optional(),
      },
      (args) => this.listDeploys(args)
    );

    this.tool(
      'get_honeybadger_report',
      'Project report from the Honeybadger Reports tab: notices grouped by class, location, user, or day.',
      {
        project_id: projectId,
        report: z.enum(['notices_by_class', 'notices_by_location', 'notices_by_user', 'notices_per_day']),
        environment: z.string().optional(),
        start: z.string().optional().describe('ISO-8601 start of the reporting window'),
        stop: z.string().optional().describe('ISO-8601 end of the reporting window'),
      },
      (args) => this.getReport(args)
    );

    this.tool(
      'analyze_honeybadger_issue',
      'Investigate one fault: status, application stack, redacted request context, daily occurrence counts, recent deploys in that environment, and affected users. Cookies and secrets are omitted. This does not change the fault in Honeybadger.',
      {
        project_id: projectId,
        fault_id: faultId,
        include_context: z.boolean().optional().describe('Include redacted request context and params. Default true.'),
      },
      (args) => this.analyzeIssue(args)
    );
  }

  private tool(
    name: string,
    description: string,
    inputSchema: ZodRawShape,
    handler: (args: Record<string, unknown>) => Promise<string>
  ): void {
    // registerTool's zod generics blow up when the schema is a ZodRawShape variable.
    const register = this.server.registerTool.bind(this.server) as (
      toolName: string,
      config: { description: string; inputSchema: ZodRawShape; annotations: typeof READ_ONLY },
      cb: (args: Record<string, unknown>) => Promise<ToolResult>
    ) => void;
    register(name, { description, inputSchema, annotations: READ_ONLY }, async (args) => {
      try {
        return textResult(await handler(args));
      } catch (error) {
        return errorResult(error);
      }
    });
  }

  private async listProjects(args: Record<string, unknown>): Promise<string> {
    const accountId = optionalString(args.account_id);
    const result = await this.client.get('/projects', { account_id: accountId });
    return wantRaw(args.raw) ? formatRaw(result.data) : formatProjectList(result.data);
  }

  private async getProject(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const result = await this.client.get(`/projects/${projectIdValue}`);
    return wantRaw(args.raw) ? formatRaw(result.data) : formatProject(result.data);
  }

  private async listFaults(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const pageUrl = optionalString(args.page_url);
    if (pageUrl) {
      const result = await this.client.get(pageUrl);
      if (wantRaw(args.raw)) return formatRaw(result.data);
      return formatFaultList(result.data, {
        projectId: projectIdValue,
        query: '(from page_url)',
        order: 'from page_url',
        limit: 0,
        nextUrl: result.nextUrl,
      });
    }

    const request = buildFaultListRequest(readFaultQueryArgs(args, 20));
    const result = await this.client.get(`/projects/${projectIdValue}/faults`, request.params);
    if (wantRaw(args.raw)) return formatRaw(result.data);
    return formatFaultList(result.data, {
      projectId: projectIdValue,
      query: request.query,
      order: request.order,
      limit: request.limit,
      limitNote: request.limitNote,
      nextUrl: result.nextUrl,
    });
  }

  private async getFault(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const fault = this.client.requireId(args.fault_id, 'fault_id');
    const result = await this.client.get(`/projects/${projectIdValue}/faults/${fault}`);
    return wantRaw(args.raw) ? formatRaw(result.data) : formatFault(result.data);
  }

  private async getNotices(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const fault = this.client.requireId(args.fault_id, 'fault_id');
    const pageUrl = optionalString(args.page_url);
    const { limit, limitNote } = clampLimit(args.limit, 10);
    const result = pageUrl
      ? await this.client.get(pageUrl)
      : await this.client.get(`/projects/${projectIdValue}/faults/${fault}/notices`, {
          limit,
          created_after: unixSeconds(args.created_after, 'created_after'),
          created_before: unixSeconds(args.created_before, 'created_before'),
        });
    if (wantRaw(args.raw)) return formatRaw(result.data);
    return formatNotices(result.data, {
      faultId: fault,
      projectId: projectIdValue,
      limitNote,
      nextUrl: result.nextUrl,
    });
  }

  private async summarizeFaults(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const query = buildFaultQuery(readFaultQueryArgs(args));
    const params = {
      q: query,
      occurred_after: unixSeconds(args.occurred_after, 'occurred_after'),
      occurred_before: unixSeconds(args.occurred_before, 'occurred_before'),
      created_after: unixSeconds(args.created_after, 'created_after'),
    };
    const result = await this.client.get(`/projects/${projectIdValue}/faults/summary`, params);
    return wantRaw(args.raw) ? formatRaw(result.data) : formatSummary(result.data, { projectId: projectIdValue, query });
  }

  private async getOccurrences(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const period = readChoice(args.period, ['hour', 'day', 'week', 'month'] as const, 'period');
    const fault = args.fault_id == null || args.fault_id === '' ? undefined : this.client.requireId(args.fault_id, 'fault_id');
    if (fault) {
      const used = period ?? 'day';
      const result = await this.client.get(`/projects/${projectIdValue}/faults/${fault}/occurrences`, { period: used });
      return formatOccurrences(result.data, { label: `fault ${fault}`, period: used });
    }
    const used = period ?? 'hour';
    const environment = optionalString(args.environment);
    const result = await this.client.get(`/projects/${projectIdValue}/occurrences`, { period: used, environment });
    return formatOccurrences(result.data, { label: `project ${projectIdValue}`, period: used, environment });
  }

  private async listAffectedUsers(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const fault = this.client.requireId(args.fault_id, 'fault_id');
    const result = await this.client.get(`/projects/${projectIdValue}/faults/${fault}/affected_users`, {
      q: optionalString(args.q),
    });
    return formatAffectedUsers(result.data, { faultId: fault });
  }

  private async listDeploys(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const { limit, limitNote } = clampLimit(args.limit, 10);
    const environment = optionalString(args.environment);
    const result = await this.client.get(`/projects/${projectIdValue}/deploys`, {
      limit,
      environment,
      local_username: optionalString(args.local_username),
      created_after: unixSeconds(args.created_after, 'created_after'),
      created_before: unixSeconds(args.created_before, 'created_before'),
    });
    const text = formatDeploys(result.data, { projectId: projectIdValue, environment });
    return limitNote ? `${text}\n\n${limitNote}` : text;
  }

  private async getReport(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const report = readChoice(
      args.report,
      ['notices_by_class', 'notices_by_location', 'notices_by_user', 'notices_per_day'] as const,
      'report'
    );
    if (!report) throw new McpError(ErrorCode.InvalidRequest, 'report is required');
    const environment = optionalString(args.environment);
    const start = optionalString(args.start);
    const stop = optionalString(args.stop);
    const result = await this.client.get(`/projects/${projectIdValue}/reports/${report}`, { environment, start, stop });
    return formatReport(report, result.data, { projectId: projectIdValue, environment, start, stop });
  }

  private async analyzeIssue(args: Record<string, unknown>): Promise<string> {
    const projectIdValue = this.client.projectId(args.project_id);
    const fault = this.client.requireId(args.fault_id, 'fault_id');
    const includeContext = args.include_context !== false;
    const faultResult = await this.client.get(`/projects/${projectIdValue}/faults/${fault}`);
    const environment = readFault(faultResult.data).environment || undefined;

    const [notices, occurrences, deploys, users] = await Promise.all([
      settle('notices', () => this.client.get(`/projects/${projectIdValue}/faults/${fault}/notices`, { limit: 5 })),
      settle('occurrence counts', () =>
        this.client.get(`/projects/${projectIdValue}/faults/${fault}/occurrences`, { period: 'day' })
      ),
      settle('deploys', () => this.client.get(`/projects/${projectIdValue}/deploys`, { limit: 5, environment })),
      settle('affected users', () => this.client.get(`/projects/${projectIdValue}/faults/${fault}/affected_users`)),
    ]);

    return formatAnalysis({
      fault: faultResult.data,
      notices: notices.data ?? [],
      occurrences: occurrences.data,
      deploys: deploys.data,
      affectedUsers: users.data,
      includeContext,
      notes: [notices.note, occurrences.note, deploys.note, users.note].filter((note): note is string => Boolean(note)),
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Honeybadger MCP server ${VERSION} running on stdio`);
  }
}

async function settle(label: string, request: () => Promise<ApiResult>): Promise<{ data?: unknown; note?: string }> {
  try {
    const result = await request();
    return { data: result.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { note: `Could not load ${label}: ${message}` };
  }
}

function wantRaw(value: unknown): boolean {
  return value === true;
}

function readChoice<T extends string>(value: unknown, allowed: readonly T[], label: string): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new McpError(ErrorCode.InvalidRequest, `${label} must be one of: ${allowed.join(', ')}`);
}

const server = new HoneybadgerMCPServer();
server.run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
