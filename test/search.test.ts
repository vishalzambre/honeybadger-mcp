import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFaultQuery, clampLimit, resolveOrder, unixSeconds } from '../src/search.ts';

test('open faults are the default search', () => {
  assert.equal(buildFaultQuery({}), '-is:resolved -is:ignored');
});

test('environment and class search stay in q', () => {
  assert.equal(
    buildFaultQuery({ q: 'class:NoMethodError', environment: 'production' }),
    'class:NoMethodError environment:production -is:resolved -is:ignored'
  );
});

test('environment values with spaces are quoted', () => {
  assert.equal(buildFaultQuery({ environment: 'prod eu', state: 'all' }), 'environment:"prod eu"');
});

test('resolved true does not also add the open default', () => {
  assert.equal(buildFaultQuery({ resolved: true, environment: 'production' }), 'environment:production is:resolved');
});

test('resolved false means only -is:resolved', () => {
  assert.equal(buildFaultQuery({ resolved: false }), '-is:resolved');
});

test('an existing status token in q is left alone', () => {
  assert.equal(buildFaultQuery({ q: 'is:resolved class:Foo' }), 'is:resolved class:Foo');
});

test('state all skips the status filter', () => {
  assert.equal(buildFaultQuery({ state: 'all', environment: 'staging' }), 'environment:staging');
});

test('state ignored is explicit', () => {
  assert.equal(buildFaultQuery({ state: 'ignored' }), 'is:ignored');
});

test('limit is clamped to the v2 maximum of 25', () => {
  assert.deepEqual(clampLimit(100, 20), {
    limit: 25,
    limitNote: 'Requested 100 rows; Honeybadger returns at most 25 per request.',
  });
  assert.deepEqual(clampLimit(undefined, 10), { limit: 10, limitNote: undefined });
});

test('order defaults to recent and rejects unknown values', () => {
  assert.equal(resolveOrder(undefined), 'recent');
  assert.equal(resolveOrder('created'), 'created');
  assert.throws(() => resolveOrder('count'), /order must be/);
});

test('unixSeconds accepts ISO-8601 and rejects relative phrases', () => {
  assert.equal(unixSeconds('2026-01-01T00:00:00Z', 'occurred_after'), 1767225600);
  assert.equal(unixSeconds(1767225600000, 'occurred_after'), 1767225600);
  assert.throws(() => unixSeconds('24 hours ago', 'occurred_after'), /ISO-8601/);
});
