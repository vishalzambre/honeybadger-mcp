import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/** Honeybadger returns at most 25 faults or notices per v2 request. */
export const HONEYBADGER_PAGE_LIMIT = 25;

export type FaultState = 'open' | 'resolved' | 'ignored' | 'unresolved' | 'all';
export type FaultOrder = 'recent' | 'frequent' | 'created';

export interface FaultQueryArgs {
  q?: string;
  environment?: string;
  resolved?: boolean;
  ignored?: boolean;
  state?: FaultState;
  order?: FaultOrder;
  limit?: unknown;
  defaultLimit?: number;
  occurred_after?: unknown;
  occurred_before?: unknown;
  created_after?: unknown;
}

export interface FaultListRequest {
  params: Record<string, string | number>;
  /** Search string actually sent as `q`, when one was sent. */
  query?: string;
  order: FaultOrder;
  limit: number;
  limitNote?: string;
}

/**
 * Quote a Honeybadger search value. Bare words stay bare; anything else is double-quoted.
 * Honeybadger treats an unknown `is:` value as "match everything", so callers must use
 * real tokens such as `-is:resolved` rather than `is:unresolved`.
 */
export function quoteSearchValue(value: string): string {
  if (/^[\w.@+-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** True when `q` already constrains resolved or ignored state. */
export function queryMentionsStatus(q: string): boolean {
  return /(?:^|\s)-?is:(?:resolved|ignored)\b/.test(q);
}

/**
 * Build the `q` string Honeybadger actually understands.
 *
 * `environment` and `resolved` are not fault-list query parameters. They are folded
 * into `q`. When the caller does not constrain status, the query defaults to open
 * faults (`-is:resolved -is:ignored`), which is the Honeybadger inbox.
 */
export function buildFaultQuery(args: FaultQueryArgs): string | undefined {
  const parts: string[] = [];
  const q = args.q?.trim();
  if (q) parts.push(q);
  if (args.environment?.trim()) {
    parts.push(`environment:${quoteSearchValue(args.environment.trim())}`);
  }
  parts.push(...statusTokens(args, q));
  return parts.length ? parts.join(' ') : undefined;
}

export function buildFaultListRequest(args: FaultQueryArgs): FaultListRequest {
  const query = buildFaultQuery(args);
  const { limit, limitNote } = clampLimit(args.limit, args.defaultLimit ?? 20);
  const order = resolveOrder(args.order);
  const params: Record<string, string | number> = { limit };
  if (query) params.q = query;
  if (order !== 'created') params.order = order;

  const occurredAfter = unixSeconds(args.occurred_after, 'occurred_after');
  const occurredBefore = unixSeconds(args.occurred_before, 'occurred_before');
  const createdAfter = unixSeconds(args.created_after, 'created_after');
  if (occurredAfter !== undefined) params.occurred_after = occurredAfter;
  if (occurredBefore !== undefined) params.occurred_before = occurredBefore;
  if (createdAfter !== undefined) params.created_after = createdAfter;

  return { params, query, order, limit, limitNote };
}

export function clampLimit(value: unknown, fallback: number): { limit: number; limitNote?: string } {
  const requested = coercePositiveInt(value) ?? fallback;
  const limit = Math.min(requested, HONEYBADGER_PAGE_LIMIT);
  return {
    limit,
    limitNote:
      requested > HONEYBADGER_PAGE_LIMIT
        ? `Requested ${requested} rows; Honeybadger returns at most ${HONEYBADGER_PAGE_LIMIT} per request.`
        : undefined,
  };
}

/**
 * Accept Unix seconds, Unix milliseconds, or an ISO-8601 timestamp.
 * Relative phrases are not parsed here; those belong in `q`
 * (`last_occurred.after:"24 hours ago"`).
 */
export function unixSeconds(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new McpError(ErrorCode.InvalidRequest, `${label} must be a positive Unix timestamp or an ISO-8601 date`);
    }
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return unixSeconds(Number(trimmed), label);
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${label} must be a Unix timestamp in seconds or an ISO-8601 date. Put relative times in q, for example last_occurred.after:"24 hours ago".`
      );
    }
    return Math.floor(parsed / 1000);
  }

  throw new McpError(ErrorCode.InvalidRequest, `${label} must be a Unix timestamp or an ISO-8601 date`);
}

export function resolveOrder(value: unknown): FaultOrder {
  if (value === undefined || value === null || value === '') return 'recent';
  if (value === 'recent' || value === 'frequent' || value === 'created') return value;
  throw new McpError(
    ErrorCode.InvalidRequest,
    'order must be "recent" (last seen), "frequent" (most notices), or "created" (oldest first, the API default)'
  );
}

export function readFaultQueryArgs(args: Record<string, unknown>, defaultLimit = 20): FaultQueryArgs {
  return {
    q: optionalString(args.q),
    environment: optionalString(args.environment),
    resolved: optionalBoolean(args.resolved),
    ignored: optionalBoolean(args.ignored),
    state: optionalState(args.state),
    order: optionalOrder(args.order),
    limit: args.limit,
    defaultLimit,
    occurred_after: args.occurred_after,
    occurred_before: args.occurred_before,
    created_after: args.created_after,
  };
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function optionalState(value: unknown): FaultState | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'open' || value === 'resolved' || value === 'ignored' || value === 'unresolved' || value === 'all') {
    return value;
  }
  throw new McpError(
    ErrorCode.InvalidRequest,
    'state must be "open", "resolved", "ignored", "unresolved", or "all"'
  );
}

function optionalOrder(value: unknown): FaultOrder | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return resolveOrder(value);
}

function statusTokens(args: FaultQueryArgs, q: string | undefined): string[] {
  const fromFlags: string[] = [];
  if (args.resolved === true) fromFlags.push('is:resolved');
  if (args.resolved === false) fromFlags.push('-is:resolved');
  if (args.ignored === true) fromFlags.push('is:ignored');
  if (args.ignored === false) fromFlags.push('-is:ignored');
  if (fromFlags.length) return fromFlags;

  if (args.state === 'all') return [];
  if (args.state === 'resolved') return ['is:resolved'];
  if (args.state === 'ignored') return ['is:ignored'];
  if (args.state === 'unresolved') return ['-is:resolved'];
  if (q && queryMentionsStatus(q)) return [];
  return ['-is:resolved', '-is:ignored'];
}

function coercePositiveInt(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.floor(parsed);
}
