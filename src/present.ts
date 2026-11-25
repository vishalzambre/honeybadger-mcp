import { quoteSearchValue } from './search.js';
import { redact, truncate } from './redact.js';
import {
  asList,
  faultStatus,
  locationLabel,
  readAffectedUser,
  readDeploy,
  readFault,
  readNotice,
  readProject,
  type AffectedUser,
  type DeployView,
  type FaultView,
  type Frame,
  type NoticeView,
  type ProjectView,
} from './model.js';

export function formatProjectList(data: unknown): string {
  const projects = asList(data).map(readProject).filter((project) => project.id);
  if (!projects.length) return 'No Honeybadger projects were returned for this token.';
  const lines = [`# Honeybadger projects (${projects.length})`, ''];
  for (const project of projects) lines.push(formatProjectBlock(project, false), '');
  lines.push('Project API tokens are omitted. Pass an id as project_id, or set HONEYBADGER_PROJECT_ID.');
  return lines.join('\n').trimEnd();
}

export function formatProject(data: unknown): string {
  const project = readProject(data);
  return formatProjectBlock(project, true);
}

export function formatFaultList(data: unknown, meta: ListMeta): string {
  const faults = asList(data).map(readFault).filter((fault) => fault.id);
  const lines = [`# Honeybadger faults (project ${meta.projectId})`, describeQuery(meta)];
  if (meta.limitNote) lines.push(meta.limitNote);
  lines.push('');
  if (!faults.length) {
    lines.push(`No faults matched \`${meta.query || '(no search)'}\`.`);
  } else {
    for (const fault of faults) lines.push(formatFaultBullet(fault), '');
  }
  appendPageHint(lines, meta.nextUrl);
  return lines.join('\n').trimEnd();
}

export function formatFault(data: unknown): string {
  const fault = readFault(data);
  const lines = [
    `# Fault ${fault.id}`,
    '',
    `**${fault.klass || 'Error'}** — ${oneLine(fault.message)}`,
    '',
    ...faultDetailLines(fault),
  ];
  return lines.join('\n').trimEnd();
}

export function formatNotices(data: unknown, meta: { faultId: string; projectId: string; limitNote?: string; nextUrl?: string }): string {
  const notices = asList(data).map(readNotice);
  const lines = [`# Notices for fault ${meta.faultId} (project ${meta.projectId})`, ''];
  if (meta.limitNote) lines.push(meta.limitNote, '');
  if (!notices.length) {
    lines.push('No notices were returned.');
  } else {
    notices.forEach((notice, index) => {
      lines.push(formatNotice(notice, index === 0), '');
    });
  }
  lines.push('Cookies, session, and secret-looking fields are omitted.');
  appendPageHint(lines, meta.nextUrl);
  return lines.join('\n').trimEnd();
}

export function formatSummary(data: unknown, meta: { projectId: string; query?: string }): string {
  const lines = [`# Fault counts (project ${meta.projectId})`];
  if (meta.query) lines.push(`Search: \`${meta.query}\``);
  lines.push('', '```json', JSON.stringify(redact(data), null, 2).slice(0, 8000), '```');
  return lines.join('\n');
}

export function formatOccurrences(
  data: unknown,
  meta: { label: string; period: string; environment?: string }
): string {
  const points = readOccurrencePoints(data);
  const lines = [`# Occurrences — ${meta.label}`, `Period: ${meta.period} (UTC buckets)`];
  if (meta.environment) lines.push(`Environment: ${meta.environment}`);
  if (!points.length) {
    lines.push('', 'Honeybadger returned no occurrence buckets.');
    return lines.join('\n');
  }

  const total = points.reduce((sum, point) => sum + point.count, 0);
  const nonzero = points.filter((point) => point.count > 0);
  const peak = points.reduce((best, point) => (point.count > best.count ? point : best), points[0]);
  lines.push(`Total in window: ${total}`, `Non-zero buckets: ${nonzero.length} of ${points.length}`);
  if (peak && peak.count > 0) lines.push(`Peak: ${peak.count} at ${formatEpoch(peak.ts)}`);
  lines.push('');
  const shown = (nonzero.length ? nonzero : points.slice(-12)).slice(-24);
  for (const point of shown) {
    lines.push(`- ${formatEpoch(point.ts)} — ${point.count}`);
  }
  if (nonzero.length > shown.length) lines.push(`… ${nonzero.length - shown.length} earlier non-zero buckets omitted`);
  return lines.join('\n');
}

export function formatAffectedUsers(data: unknown, meta: { faultId: string }): string {
  const users = asList(data)
    .map(readAffectedUser)
    .filter((user): user is AffectedUser => Boolean(user))
    .sort((a, b) => b.count - a.count);
  const lines = [`# Affected users for fault ${meta.faultId}`, ''];
  if (!users.length) {
    lines.push('No affected users were returned. The app may not be sending user id or email in the notice context.');
    return lines.join('\n');
  }
  for (const user of users.slice(0, 50)) lines.push(`- ${user.user} — ${user.count}`);
  if (users.length > 50) lines.push(`… ${users.length - 50} more users omitted`);
  return lines.join('\n');
}

export function formatDeploys(data: unknown, meta: { projectId: string; environment?: string }): string {
  const deploys = asList(data).map(readDeploy);
  const lines = [`# Deploys (project ${meta.projectId})`];
  if (meta.environment) lines.push(`Environment: ${meta.environment}`);
  lines.push('');
  if (!deploys.length) {
    lines.push('No deploys were returned.');
    return lines.join('\n');
  }
  for (const deploy of deploys) lines.push(`- ${formatDeploy(deploy)}`);
  return lines.join('\n');
}

export function formatReport(
  report: string,
  data: unknown,
  meta: { projectId: string; environment?: string; start?: string; stop?: string }
): string {
  const lines = [`# ${report} (project ${meta.projectId})`];
  if (meta.environment) lines.push(`Environment: ${meta.environment}`);
  if (meta.start || meta.stop) lines.push(`Window: ${meta.start || '…'} → ${meta.stop || '…'}`);
  lines.push('');
  if (!Array.isArray(data)) {
    lines.push('```json', JSON.stringify(redact(data), null, 2).slice(0, 8000), '```');
    return lines.join('\n');
  }
  const rows = data.slice(0, 30);
  if (!rows.length) lines.push('No rows were returned for this window.');
  for (const row of rows) {
    if (Array.isArray(row) && row.length >= 2) lines.push(`- ${oneLine(String(row[0]))} — ${row[1]}`);
    else lines.push(`- ${oneLine(JSON.stringify(row))}`);
  }
  if (data.length > rows.length) lines.push(`… ${data.length - rows.length} more rows omitted`);
  return lines.join('\n');
}

export function formatRaw(data: unknown): string {
  const text = JSON.stringify(redact(data), null, 2);
  if (text.length <= 20_000) return text;
  return `${text.slice(0, 20_000)}\n… truncated ${text.length - 20_000} characters`;
}

export function formatNotice(notice: NoticeView, includeBody: boolean): string {
  const lines = [`## ${notice.createdAt || 'Notice'} ${notice.id ? `(${notice.id})` : ''}`.trim()];
  if (notice.message) lines.push(`- Message: ${oneLine(notice.message)}`);
  const where = locationLabel(notice.component, notice.action);
  if (where) lines.push(`- Location: ${where}`);
  if (notice.requestMethod || notice.requestUrl) {
    lines.push(`- Request: ${[notice.requestMethod, notice.requestUrl].filter(Boolean).join(' ')}`);
  }
  if (notice.user) lines.push(`- User: ${formatUser(notice.user)}`);
  if (notice.hostname) lines.push(`- Host: ${notice.hostname}`);
  if (notice.revision) lines.push(`- Revision: ${notice.revision}`);
  if (notice.environmentName) lines.push(`- Environment: ${notice.environmentName}`);
  if (notice.userAgent) lines.push(`- User agent: ${truncate(notice.userAgent, 180)}`);
  if (notice.noticeUrl) lines.push(`- Notice: ${notice.noticeUrl}`);

  const appFrames = notice.applicationTrace;
  const frames = appFrames.length ? appFrames : notice.backtrace;
  if (frames.length) {
    lines.push('', appFrames.length ? '### Application stack' : '### Backtrace (no application frames reported)');
    frames.slice(0, 8).forEach((frame, index) => {
      lines.push(`${index + 1}. ${formatFrame(frame)}`);
      if (includeBody && index === 0) {
        const snippet = sourceSnippet(frame);
        if (snippet) lines.push('```', snippet, '```');
      }
    });
    if (frames.length > 8) lines.push(`… ${frames.length - 8} more frames`);
  }

  if (includeBody) {
    appendJson(lines, 'Context', notice.context);
    appendJson(lines, 'Params', notice.params);
    if (notice.breadcrumbs.length) {
      lines.push('', '### Breadcrumbs');
      for (const crumb of notice.breadcrumbs) lines.push(`- ${oneLine(crumb)}`);
    }
  }
  return lines.join('\n');
}

export function formatDeploy(deploy: DeployView): string {
  const who = deploy.username ? ` by ${deploy.username}` : '';
  const repo = deploy.repository ? ` (${deploy.repository})` : '';
  return `${deploy.createdAt || 'unknown time'} ${deploy.environment || 'unknown env'} ${deploy.revision || 'unknown revision'}${who}${repo}`;
}

function formatProjectBlock(project: ProjectView, detailed: boolean): string {
  const counts =
    project.unresolvedFaultCount != null || project.faultCount != null
      ? `${project.unresolvedFaultCount ?? '?'} unresolved / ${project.faultCount ?? '?'} total`
      : 'fault counts unavailable';
  const lines = [
    `## ${project.name || 'Untitled'} (${project.id})`,
    `- ${project.active ? 'Active' : 'Inactive'} · ${counts}`,
  ];
  if (project.environments.length) lines.push(`- Environments: ${project.environments.join(', ')}`);
  if (project.lastNoticeAt) lines.push(`- Last notice: ${project.lastNoticeAt}`);
  if (project.resolveErrorsOnDeploy != null) {
    lines.push(`- Resolve errors on deploy: ${project.resolveErrorsOnDeploy ? 'yes' : 'no'}`);
  }
  if (detailed && project.users.length) {
    lines.push('- Team:');
    for (const user of project.users) {
      lines.push(`  - ${user.name || user.email || user.id}${user.email ? ` <${user.email}>` : ''}`);
    }
    lines.push('  Use an email with `assignee:email` in q. `assignee:me` matches nothing on the API.');
  }
  if (detailed && project.sites.length) {
    lines.push('- Uptime sites:');
    for (const site of project.sites) {
      lines.push(`  - ${site.name || 'site'} — ${site.state || 'unknown'} ${site.url}`.trim());
    }
  }
  return lines.join('\n');
}

function formatFaultBullet(fault: FaultView): string {
  const where = locationLabel(fault.component, fault.action);
  const lines = [
    `- **${fault.id}** ${fault.klass || 'Error'} — ${oneLine(fault.message, 180)}`,
    `  ${fault.environment || 'unknown env'} · ${fault.noticesCount || '?'} notices · last seen ${fault.lastNoticeAt || 'unknown'} · ${faultStatus(fault)}`,
  ];
  const extra = [
    where,
    fault.assignee ? `assignee ${fault.assignee}` : '',
    fault.tags.length ? `tags ${fault.tags.join(', ')}` : '',
    fault.url,
  ].filter(Boolean);
  if (extra.length) lines.push(`  ${extra.join(' · ')}`);
  return lines.join('\n');
}

function faultDetailLines(fault: FaultView): string[] {
  const where = locationLabel(fault.component, fault.action);
  const lines = [
    `- Environment: ${fault.environment || 'unknown'}`,
    `- Status: ${faultStatus(fault)}`,
    `- Occurrences: ${fault.noticesCount || 'unknown'}${fault.noticesCountInRange != null ? ` (${fault.noticesCountInRange} in the requested window)` : ''}`,
    `- First seen: ${fault.createdAt || 'unknown'}`,
    `- Last seen: ${fault.lastNoticeAt || 'unknown'}`,
  ];
  if (where) lines.push(`- Location: ${where}`);
  if (fault.assignee) lines.push(`- Assignee: ${fault.assignee}`);
  if (fault.tags.length) lines.push(`- Tags: ${fault.tags.join(', ')}`);
  if (fault.commentsCount) lines.push(`- Comments: ${fault.commentsCount} (read them in the Honeybadger UI)`);
  if (fault.url) lines.push(`- URL: ${fault.url}`);
  if (fault.projectId) lines.push(`- Project: ${fault.projectId}`);
  return lines;
}

function formatFrame(frame: Frame): string {
  const method = frame.method ? ` in \`${frame.method}\`` : '';
  return `\`${frame.file}:${frame.line || '?'}\`${method}`;
}

function sourceSnippet(frame: Frame): string | undefined {
  if (!frame.source) return undefined;
  const entries = Object.entries(frame.source).slice(0, 12);
  if (!entries.length) return undefined;
  return entries.map(([line, code]) => `${line}: ${truncate(code, 240)}`).join('\n');
}

function appendJson(lines: string[], title: string, value: Record<string, unknown>): void {
  if (!Object.keys(value).length) return;
  lines.push('', `### ${title}`, '```json', JSON.stringify(redact(value), null, 2), '```');
}

function describeQuery(meta: ListMeta): string {
  const search = meta.query ? `\`${meta.query}\`` : 'none';
  const limit = meta.limit > 0 ? ` · limit: ${meta.limit}` : '';
  return `Search: ${search} · order: ${meta.order}${limit}`;
}

function appendPageHint(lines: string[], nextUrl?: string): void {
  if (!nextUrl) return;
  lines.push('', `Next page: pass this URL as page_url (it replaces q, order, and limit): ${nextUrl}`);
}

function formatUser(user: { id?: string; email?: string }): string {
  if (user.email && user.id) return `${user.email} (id ${user.id})`;
  return user.email || `id ${user.id}`;
}

function formatEpoch(seconds: number): string {
  const millis = seconds > 1e12 ? seconds : seconds * 1000;
  return new Date(millis).toISOString();
}

function readOccurrencePoints(data: unknown): Array<{ ts: number; count: number }> {
  if (!Array.isArray(data)) return [];
  const points: Array<{ ts: number; count: number }> = [];
  for (const item of data) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const ts = Number(item[0]);
    const count = Number(item[1]);
    if (!Number.isFinite(ts) || !Number.isFinite(count)) continue;
    points.push({ ts, count });
  }
  return points;
}

function oneLine(value: string, max = 400): string {
  return truncate(value.replace(/\s+/g, ' ').trim(), max);
}

export function similarFaultQuery(fault: FaultView): string {
  const parts: string[] = [];
  if (fault.klass) parts.push(`class:${quoteSearchValue(fault.klass)}`);
  if (fault.environment) parts.push(`environment:${quoteSearchValue(fault.environment)}`);
  parts.push('-is:resolved', '-is:ignored');
  return parts.join(' ');
}

export interface ListMeta {
  projectId: string;
  query?: string;
  order: string;
  limit: number;
  limitNote?: string;
  nextUrl?: string;
}
