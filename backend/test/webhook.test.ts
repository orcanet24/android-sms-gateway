import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { openStore } from '../src/db.js';
import { computeSignature } from '../src/signature.js';

const key = 'test-key';
const unusedPhone = { sendMessage: async () => ({ ok: true as const }) };
const now = 1_800_000_000;

const payload = JSON.stringify({
  event: 'sms:received',
  payload: {
    messageId: 'msg-1',
    sender: '+34600111222',
    message: 'hola',
    simNumber: 1,
    receivedAt: new Date(now * 1000).toISOString(),
  },
});

function signedHeaders(body: string) {
  const ts = String(now);
  return {
    'content-type': 'application/json',
    'x-timestamp': ts,
    'x-signature': computeSignature(key, body, ts),
  };
}

test('a duplicate webhook delivery is stored only once', async () => {
  const store = openStore(':memory:');
  const app = buildApp({ webhookSigningKey: key, store, phone: unusedPhone, now: () => now });

  const first = await app.inject({ method: 'POST', url: '/webhooks/sms', headers: signedHeaders(payload), payload });
  const second = await app.inject({ method: 'POST', url: '/webhooks/sms', headers: signedHeaders(payload), payload });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().stored, true);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().stored, false);

  const count = store.count();
  assert.equal(count.messages, 1);
  assert.equal(count.events, 1);

  await app.close();
  store.close();
});

test('a correctly signed body that is not JSON returns 400 invalid_json', async () => {
  const store = openStore(':memory:');
  const app = buildApp({ webhookSigningKey: key, store, phone: unusedPhone, now: () => now });

  const malformed = '{"event": "sms:received", ';
  const res = await app.inject({ method: 'POST', url: '/webhooks/sms', headers: signedHeaders(malformed), payload: malformed });

  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_json');
  assert.equal(store.count().events, 0);

  await app.close();
  store.close();
});
