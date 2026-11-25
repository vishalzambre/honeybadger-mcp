import {
  asList,
  faultStatus,
  locationLabel,
  readAffectedUser,
  readDeploy,
  readFault,
  readNotice,
  type FaultView,
} from './model.js';
import { formatDeploy, formatNotice, formatOccurrences, similarFaultQuery } from './present.js';

export interface AnalysisInput {
  fault: unknown;
  notices: unknown;
  occurrences?: unknown;
  deploys?: unknown;
  affectedUsers?: unknown;
  includeContext: boolean;
  notes: string[];
}

/**
 * Build a debugging brief from a fault and its latest notice.
 * Request context is read from `request.context` / `request.params`, and the
 * stack prefers `application_trace` over gem frames.
 */
export function formatAnalysis(input: AnalysisInput): string {
  const fault = readFault(input.fault);
  const notices = asList(input.notices).map(readNotice);
  const latest = notices[0];
  const topFrames = latest ? (latest.applicationTrace.length ? latest.applicationTrace : latest.backtrace) : [];
  const primary = topFrames[0];

  const lines = [
    `# Honeybadger fault ${fault.id}`,
    '',
    `**${fault.klass || 'Error'}** — ${fault.message || 'No message'}`,
    '',
    `- Environment: ${fault.environment || 'unknown'}`,
    `- Status: ${faultStatus(fault)}`,
    `- Occurrences: ${fault.noticesCount || 'unknown'}${fault.noticesCountInRange != null ? ` (${fault.noticesCountInRange} in the requested window)` : ''}`,
    `- First seen: ${fault.createdAt || 'unknown'}`,
    `- Last seen: ${fault.lastNoticeAt || 'unknown'}`,
  ];

  const where = locationLabel(fault.component, fault.action);
  if (where) lines.push(`- Location: ${where}`);
  if (fault.assignee) lines.push(`- Assignee: ${fault.assignee}`);
  if (fault.tags.length) lines.push(`- Tags: ${fault.tags.join(', ')}`);
  if (fault.commentsCount) {
    lines.push(`- Comments: ${fault.commentsCount}. Read them on the fault page before changing code; this server does not load comment text.`);
  }
  if (fault.url) lines.push(`- URL: ${fault.url}`);
  if (primary) lines.push(`- Primary frame: \`${primary.file}:${primary.line || '?'}\`${primary.method ? ` in \`${primary.method}\`` : ''}`);

  if (latest) {
    lines.push('', '## Latest occurrence', '');
    lines.push(formatNotice(latest, input.includeContext));
  } else {
    lines.push('', 'No notices were returned, so there is no stack or request context.');
  }

  if (notices.length > 1) {
    lines.push('', '## Other recent notices');
    for (const notice of notices.slice(1, 5)) {
      const request = [notice.requestMethod, notice.requestUrl].filter(Boolean).join(' ');
      lines.push(`- ${notice.createdAt || 'unknown time'} — ${notice.message || 'no message'}${request ? ` — ${request}` : ''}`);
    }
  }

  if (input.occurrences !== undefined) {
    lines.push('', formatOccurrences(input.occurrences, { label: `fault ${fault.id}`, period: 'day' }));
  }

  const deploys = input.deploys === undefined ? [] : asList(input.deploys).map(readDeploy);
  if (input.deploys !== undefined) {
    lines.push('', '## Recent deploys');
    if (!deploys.length) {
      lines.push('No deploys were returned for this environment.');
    } else {
      for (const deploy of deploys.slice(0, 5)) lines.push(`- ${formatDeploy(deploy)}`);
      lines.push(deployRelation(fault, deploys[0]));
    }
  }

  if (input.affectedUsers !== undefined) {
    const users = asList(input.affectedUsers)
      .map(readAffectedUser)
      .filter((user): user is NonNullable<typeof user> => Boolean(user))
      .sort((a, b) => b.count - a.count);
    lines.push('', '## Affected users');
    if (!users.length) {
      lines.push('None recorded. Search `context.user_id:*` only if this app sends a user id.');
    } else {
      for (const user of users.slice(0, 10)) lines.push(`- ${user.user} — ${user.count}`);
      if (users.length > 10) lines.push(`… ${users.length - 10} more`);
    }
  }

  lines.push('', '## What to inspect', '', inspectionHint(fault.klass, primary?.file));
  if (primary) {
    lines.push(`Open \`${primary.file}\` at line ${primary.line || '?'} and compare it with the params and context from the latest occurrence.`);
  }
  lines.push('', '## Find similar faults', '', `\`${similarFaultQuery(fault)}\``);
  lines.push('', 'Resolved faults reopen automatically when they happen again. Ignored faults drop new occurrences until they are unignored.');

  if (input.notes.length) {
    lines.push('', '## Partial data');
    for (const note of input.notes) lines.push(`- ${note}`);
  }

  lines.push(
    '',
    '## Structured summary',
    '',
    '```json',
    JSON.stringify(
      {
        id: fault.id,
        klass: fault.klass,
        message: fault.message,
        environment: fault.environment,
        status: faultStatus(fault),
        notices_count: fault.noticesCount,
        location: locationLabel(fault.component, fault.action) || null,
        primary: primary ? { file: primary.file, line: primary.line, method: primary.method } : null,
        url: fault.url,
        request_url: latest?.requestUrl || null,
        user: latest?.user || null,
      },
      null,
      2
    ),
    '```'
  );

  return lines.join('\n');
}

export function inspectionHint(klass: string, file?: string): string {
  const name = klass.toLowerCase();
  const sentences: string[] = [];
  if (/nomethod|undefined method|nilclass|cannot read propert|undefined is not an object/.test(name)) {
    sentences.push('A method was called on nil, null, or the wrong type. Inspect the receiver at the top application frame and the value that produced it.');
  } else if (/nameerror|uninitialized constant|referenceerror|is not defined/.test(name)) {
    sentences.push('A constant, variable, or function name was missing. Check spelling, imports, and load paths at the top frame.');
  } else if (/argumenterror|typeerror|arity|illegal argument/.test(name)) {
    sentences.push('The call at the top frame received the wrong arguments or type. Compare the caller with the current method signature.');
  } else if (/activerecord|recordnotfound|recordinvalid|statementinvalid|pg::|mysql|sequel::/.test(name)) {
    sentences.push('This looks like a database error. Check the query, schema, and constraints around the top frame.');
  } else if (/timeout|etimedout|econnreset|econnrefused|socketerror|faraday|net::open/.test(name)) {
    sentences.push('This looks like a network or timeout failure. Check the external call at the top frame, its timeout, and whether it clusters on one host.');
  } else if (/keyerror|indexerror|keyerror|no such key/.test(name)) {
    sentences.push('A missing key or index was accessed. Compare the collection at the top frame with the params and context.');
  } else {
    sentences.push('Start at the top application frame and compare that line with the latest params and context.');
  }

  const ext = file?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (ext === 'rb') sentences.push('In Ruby, confirm the object is present before the call.');
  else if (ext === 'py') sentences.push('In Python, None and a missing dict key are the usual local cause.');
  else if (ext && ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext)) {
    sentences.push('In JavaScript, null and undefined are the usual local cause.');
  } else if (ext === 'php') sentences.push('In PHP, null and an undefined index are the usual local cause.');
  else if (ext === 'ex' || ext === 'exs') sentences.push('In Elixir, nil and a missing map key are the usual local cause.');
  else if (ext === 'go') sentences.push('In Go, a nil pointer or a failed type assertion is the usual local cause.');
  else if (ext && ['java', 'kt', 'kts', 'scala'].includes(ext)) {
    sentences.push('A null reference at the top frame is the usual local cause.');
  }
  return sentences.join(' ');
}

function deployRelation(
  fault: FaultView,
  newest: { createdAt: string; revision: string; environment: string } | undefined
): string {
  if (!newest?.createdAt || !fault.lastNoticeAt) {
    return 'Deploy time is a clue, not proof that a release caused the error.';
  }
  const noticeAt = Date.parse(fault.lastNoticeAt);
  const deployAt = Date.parse(newest.createdAt);
  if (Number.isNaN(noticeAt) || Number.isNaN(deployAt)) {
    return 'Deploy time is a clue, not proof that a release caused the error.';
  }
  const revision = newest.revision ? ` (${newest.revision})` : '';
  if (noticeAt >= deployAt) {
    return `The latest ${newest.environment || fault.environment} deploy${revision} at ${newest.createdAt} was recorded before the latest notice. That does not by itself mean the deploy caused the error.`;
  }
  return `The latest ${newest.environment || fault.environment} deploy${revision} at ${newest.createdAt} is newer than the latest notice.`;
}
