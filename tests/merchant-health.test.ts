import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMerchantHealth,
  healthIssueLabel,
  type HealthIssue,
} from '../lib/merchant-health';

const healthy = {
  email: 'real@example.com',
  isActive: true,
  youcanAccessToken: 'tok_abc',
  whatsappFromNumber: '+14155238886',
  whatsappTemplateSid: 'HX' + 'a'.repeat(32),
};

test('getMerchantHealth: fully configured merchant has no issues', () => {
  const h = getMerchantHealth(healthy);
  assert.equal(h.ok, true);
  assert.deepEqual(h.issues, []);
});

test('getMerchantHealth: inactive flag surfaces as an issue', () => {
  const h = getMerchantHealth({ ...healthy, isActive: false });
  assert.equal(h.ok, false);
  assert.ok(h.issues.includes('inactive'));
});

test('getMerchantHealth: missing access token surfaces (e.g. after uninstall)', () => {
  const h = getMerchantHealth({ ...healthy, youcanAccessToken: '' });
  assert.ok(h.issues.includes('no-access-token'));
});

test('getMerchantHealth: missing vs invalid WhatsApp sender', () => {
  assert.ok(
    getMerchantHealth({ ...healthy, whatsappFromNumber: '' })
      .issues.includes('no-whatsapp-sender'),
  );
  assert.ok(
    getMerchantHealth({ ...healthy, whatsappFromNumber: '14155238886' })
      .issues.includes('invalid-whatsapp-sender'),
  );
  assert.ok(
    getMerchantHealth({ ...healthy, whatsappFromNumber: '+abc' })
      .issues.includes('invalid-whatsapp-sender'),
  );
});

test('getMerchantHealth: missing vs invalid Twilio template SID', () => {
  assert.ok(
    getMerchantHealth({ ...healthy, whatsappTemplateSid: null })
      .issues.includes('no-whatsapp-template'),
  );
  assert.ok(
    getMerchantHealth({ ...healthy, whatsappTemplateSid: 'not-an-sid' })
      .issues.includes('invalid-whatsapp-template'),
  );
  // Wrong-prefix
  assert.ok(
    getMerchantHealth({
      ...healthy,
      whatsappTemplateSid: 'SM' + 'a'.repeat(32),
    }).issues.includes('invalid-whatsapp-template'),
  );
});

test('getMerchantHealth: placeholder install email flagged', () => {
  const h = getMerchantHealth({
    ...healthy,
    email: 'pending-1700000000000@youcan-install.local',
  });
  assert.ok(h.issues.includes('placeholder-email'));
});

test('getMerchantHealth: collects multiple issues simultaneously', () => {
  const h = getMerchantHealth({
    email: 'pending-1@youcan-install.local',
    isActive: false,
    youcanAccessToken: '',
    whatsappFromNumber: '',
    whatsappTemplateSid: null,
  });
  assert.equal(h.ok, false);
  const set = new Set<HealthIssue>(h.issues);
  for (const expected of [
    'inactive',
    'no-access-token',
    'no-whatsapp-sender',
    'no-whatsapp-template',
    'placeholder-email',
  ] as const) {
    assert.ok(set.has(expected), `missing ${expected}`);
  }
});

test('healthIssueLabel returns a non-empty string for every issue', () => {
  const all: HealthIssue[] = [
    'inactive',
    'no-access-token',
    'no-whatsapp-sender',
    'invalid-whatsapp-sender',
    'no-whatsapp-template',
    'invalid-whatsapp-template',
    'placeholder-email',
  ];
  for (const issue of all) {
    const label = healthIssueLabel(issue);
    assert.ok(label.length > 0, `empty label for ${issue}`);
  }
});
