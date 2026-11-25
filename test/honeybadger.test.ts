import assert from 'node:assert/strict';
import test from 'node:test';
import { redact } from '../src/redact.ts';
import { readNotice } from '../src/model.ts';
import { formatAnalysis } from '../src/analyze.ts';
import { isAllowedHoneybadgerUrl, firstAllowedNextUrl } from '../src/client.ts';

const noticePayload = {
  id: 'notice-1',
  fault_id: 99,
  created_at: '2026-11-25T06:00:00Z',
  url: 'https://app.honeybadger.io/projects/1/faults/99/notice-1',
  message: 'NoMethodError: undefined method `name` for nil',
  environment: {
    environment_name: 'production',
    hostname: 'web-1',
    revision: 'abc123',
    project_root: { path: '/app' },
  },
  web_environment: {
    REQUEST_METHOD: 'POST',
    HTTP_USER_AGENT: 'TestAgent',
    HTTP_COOKIE: 'session=secret-cookie',
    HTTP_AUTHORIZATION: 'Bearer super-secret',
  },
  request: {
    url: 'https://example.com/checkout',
    component: 'OrdersController',
    action: 'create',
    user: { id: 7, email: 'ada@example.com' },
    context: { user_id: 7, password: 'super-secret-password' },
    params: { authenticity_token: 'csrf-value', item_id: '42' },
    session: { session_id: 'should-not-appear' },
  },
  cookies: { _session: 'should-not-appear' },
  application_trace: [
    {
      file: 'app/controllers/orders_controller.rb',
      number: '18',
      method: 'create',
      source: { '17': 'def create', '18': '  order.name' },
    },
  ],
  backtrace: [{ file: '/gems/honeybadger/lib/honeybadger.rb', number: '3', method: 'notify' }],
};

test('notice context is read from request, not the top level', () => {
  const notice = readNotice(noticePayload);
  assert.equal(notice.requestUrl, 'https://example.com/checkout');
  assert.equal(notice.context.user_id, 7);
  assert.equal(notice.params.item_id, '42');
  assert.equal(notice.user?.email, 'ada@example.com');
  assert.equal(notice.applicationTrace[0]?.file, 'app/controllers/orders_controller.rb');
  assert.equal(notice.hostname, 'web-1');
  assert.equal(notice.revision, 'abc123');
  assert.equal(notice.requestMethod, 'POST');
});

test('analysis uses the application frame and redacts secrets', () => {
  const text = formatAnalysis({
    fault: {
      id: 99,
      klass: 'NoMethodError',
      message: "undefined method `name` for nil:NilClass",
      environment: 'production',
      notices_count: 4,
      created_at: '2026-11-20T00:00:00Z',
      last_notice_at: '2026-11-25T06:00:00Z',
      resolved: false,
      ignored: false,
      component: 'OrdersController',
      action: 'create',
      url: 'https://app.honeybadger.io/projects/1/faults/99',
      project_id: 1,
    },
    notices: [noticePayload],
    occurrences: [
      [1764000000, 0],
      [1764086400, 3],
    ],
    deploys: [
      {
        environment: 'production',
        revision: 'abc123',
        local_username: 'ada',
        created_at: '2026-11-24T12:00:00Z',
      },
    ],
    affectedUsers: [{ user: 'ada@example.com', count: 4 }],
    includeContext: true,
    notes: [],
  });

  assert.match(text, /app\/controllers\/orders_controller\.rb:18/);
  assert.match(text, /ada@example.com/);
  assert.match(text, /item_id/);
  assert.match(text, /abc123/);
  assert.doesNotMatch(text, /super-secret-password/);
  assert.doesNotMatch(text, /csrf-value/);
  assert.doesNotMatch(text, /secret-cookie/);
  assert.doesNotMatch(text, /should-not-appear/);
  assert.match(text, /\[redacted\]/);
});

test('redact replaces secret keys and leaves ordinary fields', () => {
  const value = redact({ message: 'boom', api_key: 'abcd', nested: { token: 'xyz' } }) as {
    message: string;
    api_key: string;
    nested: { token: string };
  };
  assert.equal(value.message, 'boom');
  assert.equal(value.api_key, '[redacted]');
  assert.equal(value.nested.token, '[redacted]');
});

test('pagination URLs must stay on the configured Honeybadger host', () => {
  const base = 'https://app.honeybadger.io';
  assert.equal(isAllowedHoneybadgerUrl(base, 'https://app.honeybadger.io/v2/projects/1/faults'), true);
  assert.equal(isAllowedHoneybadgerUrl(base, 'https://evil.example/v2/projects/1/faults'), false);
  assert.equal(isAllowedHoneybadgerUrl(base, 'https://app.honeybadger.io/v1/notices'), false);
  assert.equal(
    firstAllowedNextUrl(base, ['/v2/projects/1/faults?page=2', 'https://evil.example/v2/projects/1']),
    'https://app.honeybadger.io/v2/projects/1/faults?page=2'
  );
  assert.equal(firstAllowedNextUrl(base, ['https://eu-app.honeybadger.io/v2/projects/1/faults']), undefined);
});
