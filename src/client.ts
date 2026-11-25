import axios from 'axios';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

export interface HoneybadgerConfig {
  apiKey: string;
  projectId?: string;
  baseUrl: string;
}

export interface ApiResult {
  data: unknown;
  nextUrl?: string;
}

/**
 * Honeybadger Data API v2 client.
 * Personal auth tokens are sent as HTTP Basic username with an empty password.
 * v3 is Bearer-only, so this client stays on v2 to match existing MCP configs.
 */
export class HoneybadgerClient {
  constructor(private readonly config: HoneybadgerConfig) {}

  projectId(explicit?: unknown): string {
    const fromCall = resourceId(explicit);
    const id = fromCall || this.config.projectId?.trim();
    if (!id) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Project ID is required. Pass project_id or set HONEYBADGER_PROJECT_ID. Call list_honeybadger_projects to look it up.'
      );
    }
    assertResourceId(id, 'project_id');
    return id;
  }

  requireId(value: unknown, label: string): string {
    const id = resourceId(value);
    if (!id) throw new McpError(ErrorCode.InvalidRequest, `${label} is required`);
    assertResourceId(id, label);
    return id;
  }

  async get(pathOrUrl: string, params: Record<string, string | number | undefined> = {}): Promise<ApiResult> {
    if (!this.config.apiKey) {
      throw new McpError(ErrorCode.InvalidRequest, 'HONEYBADGER_API_KEY environment variable is required');
    }

    const url = this.resolveUrl(pathOrUrl);
    const query: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query[key] = value;
    }

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.apiKey}:`).toString('base64')}`,
          Accept: 'application/json',
        },
        params: query,
      });
      const nextUrl = firstAllowedNextUrl(this.config.baseUrl, [
        nextLinkFromBody(response.data),
        nextLinkFromHeader(headerValue(response.headers?.link)),
      ]);
      return { data: response.data, nextUrl };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw toMcpError(error);
    }
  }

  private resolveUrl(pathOrUrl: string): string {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      if (!isAllowedHoneybadgerUrl(this.config.baseUrl, pathOrUrl)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'page_url must be an API URL on the configured Honeybadger host, under /v2/'
        );
      }
      return pathOrUrl;
    }
    if (!pathOrUrl.startsWith('/')) {
      throw new McpError(ErrorCode.InvalidRequest, 'Honeybadger path must start with /');
    }
    const base = this.config.baseUrl.replace(/\/$/, '');
    if (pathOrUrl.startsWith('/v2/') || pathOrUrl === '/v2') return `${base}${pathOrUrl}`;
    return `${base}/v2${pathOrUrl}`;
  }
}

/**
 * True when `candidate` is the same origin as the configured Honeybadger host
 * and points at the v2 data API. Used to keep pagination URLs from sending
 * the auth header anywhere else.
 */
/** Resolve a relative pagination link against the configured Honeybadger host. */
export function toAbsoluteApiUrl(baseUrl: string, candidate: string): string | undefined {
  try {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return new URL(candidate, base).toString();
  } catch {
    return undefined;
  }
}

/**
 * First pagination link that stays on the configured Honeybadger host.
 * Relative `/v2/...` paths are resolved against `baseUrl`. Other origins are dropped
 * so the auth header is never sent with a caller-supplied URL.
 */
export function firstAllowedNextUrl(baseUrl: string, candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const absolute = toAbsoluteApiUrl(baseUrl, candidate);
    if (absolute && isAllowedHoneybadgerUrl(baseUrl, absolute)) return absolute;
  }
  return undefined;
}

export function isAllowedHoneybadgerUrl(baseUrl: string, candidate: string): boolean {
  try {
    const url = new URL(candidate);
    const allowed = new URL(baseUrl);
    const v2Path = url.pathname === '/v2' || url.pathname.startsWith('/v2/');
    return url.protocol === allowed.protocol && url.origin === allowed.origin && v2Path;
  } catch {
    return false;
  }
}

function resourceId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function assertResourceId(id: string, label: string): void {
  if (!/^[\w.-]+$/.test(id)) {
    throw new McpError(ErrorCode.InvalidRequest, `${label} contains unsupported characters`);
  }
}

function nextLinkFromBody(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const links = (data as { links?: { next?: unknown } }).links;
  return typeof links?.next === 'string' ? links.next : undefined;
}

function headerValue(header: unknown): string | undefined {
  if (typeof header === 'string') return header;
  if (Array.isArray(header)) return header.filter((part) => typeof part === 'string').join(',');
  return undefined;
}

function nextLinkFromHeader(header: string | undefined): string | undefined {
  const value = header;
  if (!value) return undefined;
  for (const part of value.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function toMcpError(error: unknown): McpError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = apiMessage(error.response?.data) || error.message;
    const requestId = error.response?.headers?.['x-request-id'];
    const suffix = typeof requestId === 'string' ? ` (request ${requestId})` : '';
    return new McpError(
      ErrorCode.InvalidRequest,
      status ? `Honeybadger API error: ${status} - ${detail}${suffix}` : `Network error: ${detail}`
    );
  }
  if (error instanceof Error) return new McpError(ErrorCode.InternalError, error.message);
  return new McpError(ErrorCode.InternalError, 'Honeybadger request failed');
}

function apiMessage(data: unknown): string {
  if (typeof data === 'string') return data.slice(0, 500);
  if (!data || typeof data !== 'object') return '';
  const body = data as { error?: unknown; errors?: unknown };
  if (typeof body.error === 'string') return body.error.slice(0, 500);
  if (body.error && typeof body.error === 'object' && 'message' in body.error) {
    return String((body.error as { message: unknown }).message).slice(0, 500);
  }
  if (body.errors) return JSON.stringify(body.errors).slice(0, 500);
  return JSON.stringify(data).slice(0, 500);
}
