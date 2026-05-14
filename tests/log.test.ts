import { test } from 'node:test';
import assert from 'node:assert/strict';
import { log, logError } from '../lib/log';

function capture(stream: 'stdout' | 'stderr'): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const target = stream === 'stdout' ? console.log : console.error;
  const restore = () => {
    if (stream === 'stdout') console.log = target;
    else console.error = target;
  };
  const collector = ((s: unknown) => lines.push(String(s))) as typeof console.log;
  if (stream === 'stdout') console.log = collector;
  else console.error = collector;
  return { lines, restore };
}

test('log emits one JSON line on stdout with level=info', () => {
  const out = capture('stdout');
  try {
    log('test.event', { merchantId: 'm1', count: 3 });
  } finally {
    out.restore();
  }
  assert.equal(out.lines.length, 1);
  const parsed = JSON.parse(out.lines[0]);
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.event, 'test.event');
  assert.equal(parsed.merchantId, 'm1');
  assert.equal(parsed.count, 3);
  assert.ok(parsed.ts, 'timestamp present');
  // ISO-8601 round-trip
  assert.ok(!Number.isNaN(Date.parse(parsed.ts)));
});

test('logError emits on stderr with level=error', () => {
  const out = capture('stderr');
  try {
    logError('test.bad', { reason: 'boom' });
  } finally {
    out.restore();
  }
  assert.equal(out.lines.length, 1);
  const parsed = JSON.parse(out.lines[0]);
  assert.equal(parsed.level, 'error');
  assert.equal(parsed.event, 'test.bad');
  assert.equal(parsed.reason, 'boom');
});

test('log drops undefined fields from context', () => {
  const out = capture('stdout');
  try {
    log('test.partial', { present: 'yes', absent: undefined });
  } finally {
    out.restore();
  }
  const parsed = JSON.parse(out.lines[0]);
  assert.equal(parsed.present, 'yes');
  assert.equal('absent' in parsed, false);
});

test('log works with no context', () => {
  const out = capture('stdout');
  try {
    log('test.bare');
  } finally {
    out.restore();
  }
  const parsed = JSON.parse(out.lines[0]);
  assert.equal(parsed.event, 'test.bare');
  assert.equal(parsed.level, 'info');
});
