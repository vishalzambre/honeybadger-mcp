export interface Frame {
  file: string;
  method: string;
  line: string;
  source?: Record<string, string>;
}

export interface FaultView {
  id: string;
  klass: string;
  message: string;
  environment: string;
  projectId: string;
  createdAt: string;
  lastNoticeAt: string;
  noticesCount: string;
  noticesCountInRange?: string;
  url: string;
  resolved: boolean;
  ignored: boolean;
  paused: boolean;
  resolveOnDeploy: boolean;
  component?: string;
  action?: string;
  tags: string[];
  assignee?: string;
  commentsCount?: number;
}

export interface NoticeView {
  id: string;
  faultId: string;
  message: string;
  createdAt: string;
  noticeUrl: string;
  requestUrl?: string;
  component?: string;
  action?: string;
  user?: { id?: string; email?: string };
  environmentName?: string;
  hostname?: string;
  revision?: string;
  projectRoot?: string;
  userAgent?: string;
  requestMethod?: string;
  applicationTrace: Frame[];
  backtrace: Frame[];
  context: Record<string, unknown>;
  params: Record<string, unknown>;
  breadcrumbs: string[];
}

export interface ProjectView {
  id: string;
  name: string;
  active: boolean;
  environments: string[];
  faultCount?: number;
  unresolvedFaultCount?: number;
  lastNoticeAt?: string;
  earliestNoticeAt?: string;
  resolveErrorsOnDeploy?: boolean;
  users: Array<{ id: string; name: string; email: string }>;
  sites: Array<{ name: string; state: string; url: string }>;
}

export interface DeployView {
  id?: string;
  environment: string;
  revision: string;
  repository?: string;
  username?: string;
  createdAt: string;
}

export interface AffectedUser {
  user: string;
  count: number;
}

/** Unwrap Honeybadger list payloads, which arrive as an array or as `{ results | data }`. */
export function asList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  for (const key of ['results', 'data', 'faults', 'notices', 'deploys', 'projects']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

export function asRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const record = data as Record<string, unknown>;
  for (const key of ['fault', 'project', 'notice', 'deploy']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return record;
}

export function readFault(data: unknown): FaultView {
  const fault = asRecord(data);
  const assignee = readAssignee(fault.assignee);
  const tags = Array.isArray(fault.tags) ? fault.tags.map((tag) => String(tag)).filter(Boolean) : [];
  return {
    id: text(fault.id),
    klass: text(fault.klass),
    message: text(fault.message),
    environment: text(fault.environment),
    projectId: text(fault.project_id),
    createdAt: text(fault.created_at),
    lastNoticeAt: text(fault.last_notice_at),
    noticesCount: text(fault.notices_count),
    noticesCountInRange:
      fault.notices_count_in_range === undefined || fault.notices_count_in_range === null
        ? undefined
        : text(fault.notices_count_in_range),
    url: text(fault.url),
    resolved: fault.resolved === true,
    ignored: fault.ignored === true,
    paused: fault.paused === true || fault.snoozed === true,
    resolveOnDeploy: fault.resolve_on_deploy === true,
    component: text(fault.component) || undefined,
    action: text(fault.action) || undefined,
    tags,
    assignee,
    commentsCount: typeof fault.comments_count === 'number' ? fault.comments_count : undefined,
  };
}

/**
 * Normalize a notice into the fields an investigation needs.
 * The v2 payload nests context, params, and user under `request`, and the
 * app-only stack lives in `application_trace`. Older flat shapes are still read.
 */
export function readNotice(data: unknown): NoticeView {
  const notice = asRecord(data);
  const request = record(notice.request);
  const environment = notice.environment;
  const environmentRecord = record(environment);
  const web = record(notice.web_environment);

  return {
    id: text(notice.id),
    faultId: text(notice.fault_id),
    message: text(notice.message),
    createdAt: text(notice.created_at || notice.occurred_at),
    noticeUrl: text(notice.url),
    requestUrl: text(request.url) || undefined,
    component: text(request.component || notice.component) || undefined,
    action: text(request.action || notice.action) || undefined,
    user: readUser(request.user || notice.user),
    environmentName:
      text(environmentRecord.environment_name) ||
      (typeof environment === 'string' ? environment : '') ||
      text(notice.environment_name) ||
      undefined,
    hostname: text(environmentRecord.hostname || notice.hostname) || undefined,
    revision: text(environmentRecord.revision || notice.revision) || undefined,
    projectRoot: text(record(environmentRecord.project_root).path) || undefined,
    userAgent: text(web.HTTP_USER_AGENT || request.user_agent) || undefined,
    requestMethod: text(web.REQUEST_METHOD || request.method) || undefined,
    applicationTrace: readFrames(notice.application_trace),
    backtrace: readFrames(notice.backtrace),
    context: record(request.context || notice.context),
    params: record(request.params || notice.params),
    breadcrumbs: readBreadcrumbs(notice.breadcrumbs),
  };
}

export function readProject(data: unknown): ProjectView {
  const project = asRecord(data);
  return {
    id: text(project.id),
    name: text(project.name),
    active: project.active !== false,
    environments: Array.isArray(project.environments) ? project.environments.map((item) => String(item)) : [],
    faultCount: typeof project.fault_count === 'number' ? project.fault_count : undefined,
    unresolvedFaultCount:
      typeof project.unresolved_fault_count === 'number' ? project.unresolved_fault_count : undefined,
    lastNoticeAt: text(project.last_notice_at) || undefined,
    earliestNoticeAt: text(project.earliest_notice_at) || undefined,
    resolveErrorsOnDeploy:
      typeof project.resolve_errors_on_deploy === 'boolean' ? project.resolve_errors_on_deploy : undefined,
    users: readUsers(project.users),
    sites: readSites(project.sites),
  };
}

export function readDeploy(data: unknown): DeployView {
  const deploy = asRecord(data);
  return {
    id: text(deploy.id) || undefined,
    environment: text(deploy.environment),
    revision: text(deploy.revision),
    repository: text(deploy.repository) || undefined,
    username: text(deploy.local_username) || undefined,
    createdAt: text(deploy.created_at),
  };
}

export function readAffectedUser(data: unknown): AffectedUser | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const recordValue = data as Record<string, unknown>;
  const user = text(recordValue.user || recordValue.email || recordValue.id);
  if (!user) return undefined;
  const count = typeof recordValue.count === 'number' ? recordValue.count : Number(recordValue.count ?? 0);
  return { user, count: Number.isFinite(count) ? count : 0 };
}

export function faultStatus(fault: Pick<FaultView, 'resolved' | 'ignored' | 'paused' | 'resolveOnDeploy'>): string {
  const parts: string[] = [];
  if (fault.ignored) parts.push('ignored');
  if (fault.resolved) parts.push('resolved');
  if (!fault.ignored && !fault.resolved) parts.push('open');
  if (fault.paused) parts.push('paused');
  if (fault.resolveOnDeploy) parts.push('resolve on next deploy');
  return parts.join(', ');
}

export function locationLabel(component?: string, action?: string): string | undefined {
  if (component && action) return `${component}#${action}`;
  return component || action;
}

function readFrames(value: unknown): Frame[] {
  if (!Array.isArray(value)) return [];
  const frames: Frame[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const frame = item as Record<string, unknown>;
    const file = text(frame.file);
    if (!file) continue;
    frames.push({
      file,
      method: text(frame.method || frame.function || frame.name),
      line: text(frame.number || frame.line),
      source: readSource(frame.source),
    });
  }
  return frames;
}

function readSource(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source: Record<string, string> = {};
  for (const [line, code] of Object.entries(value as Record<string, unknown>)) {
    source[line] = String(code);
  }
  return Object.keys(source).length ? source : undefined;
}

function readBreadcrumbs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      lines.push(item.trim());
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const crumb = item as Record<string, unknown>;
    const message = text(crumb.message || crumb.category || crumb.name);
    if (message) lines.push(message);
  }
  return lines.slice(-8);
}

function readAssignee(value: unknown): string | undefined {
  const user = readUser(value);
  if (!user) return undefined;
  if (user.email && text((value as Record<string, unknown>).name)) {
    return `${text((value as Record<string, unknown>).name)} <${user.email}>`;
  }
  return user.email || user.id;
}

function readUser(value: unknown): { id?: string; email?: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const user = value as Record<string, unknown>;
  const id = user.id == null || user.id === '' ? undefined : String(user.id);
  const email = typeof user.email === 'string' && user.email ? user.email : undefined;
  if (!id && !email) return undefined;
  return { id, email };
}

function readUsers(value: unknown): ProjectView['users'] {
  if (!Array.isArray(value)) return [];
  const users: ProjectView['users'] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const user = item as Record<string, unknown>;
    users.push({
      id: text(user.id),
      name: text(user.name),
      email: text(user.email),
    });
  }
  return users;
}

function readSites(value: unknown): ProjectView['sites'] {
  if (!Array.isArray(value)) return [];
  const sites: ProjectView['sites'] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const site = item as Record<string, unknown>;
    sites.push({
      name: text(site.name),
      state: text(site.state),
      url: text(site.url),
    });
  }
  return sites;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (value == null) return '';
  return String(value);
}
