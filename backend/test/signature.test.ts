import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSignature, verifyWebhookSignature } from '../src/signature.js';

const key = 'test-key';
const body = '{"event":"sms:received"}';
const now = 1_800_000_000;
const ts = String(now);

test('accepts a valid signature', () => {
  const sig = computeSignature(key, body, ts);
  assert.deepEqual(
    verifyWebhookSignature({ signingKey: key, rawBody: body, signature: sig, timestamp: ts, nowSeconds: now }),
    { ok: true },
  );
});

test('rejects a tampered body', () => {
  const sig = computeSignature(key, body, ts);
  const r = verifyWebhookSignature({ signingKey: key, rawBody: body + ' ', signature: sig, timestamp: ts, nowSeconds: now });
  assert.deepEqual(r, { ok: false, reason: 'bad_signature' });
});

test('rejects a timestamp older than 300 seconds', () => {
  const old = String(now - 301);
  const sig = computeSignature(key, body, old);
  const r = verifyWebhookSignature({ signingKey: key, rawBody: body, signature: sig, timestamp: old, nowSeconds: now });
  assert.deepEqual(r, { ok: false, reason: 'expired_timestamp' });
});

test('rejects missing headers', () => {
  const r = verifyWebhookSignature({ signingKey: key, rawBody: body, signature: undefined, timestamp: ts, nowSeconds: now });
  assert.deepEqual(r, { ok: false, reason: 'missing_headers' });
});
