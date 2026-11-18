import { createHmac, timingSafeEqual } from 'node:crypto';

/** Maximum allowed difference between the webhook timestamp and the server clock. */
export const MAX_SKEW_SECONDS = 300;

export type SignatureFailure =
  | 'missing_headers'
  | 'invalid_timestamp'
  | 'expired_timestamp'
  | 'bad_signature';

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

export interface VerifyInput {
  signingKey: string;
  /** Body exactly as received, before any JSON parsing. */
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
  /** Current time in Unix seconds. */
  nowSeconds: number;
}

/**
 * Computes the signature the Android app produces (PayloadSingingPlugin.kt):
 * HMAC-SHA256(signingKey, rawBody + timestamp), hex lowercase.
 */
export function computeSignature(signingKey: string, rawBody: string, timestamp: string): string {
  return createHmac('sha256', signingKey).update(rawBody + timestamp).digest('hex');
}

export function verifyWebhookSignature(input: VerifyInput): SignatureResult {
  const { signingKey, rawBody, signature, timestamp, nowSeconds } = input;

  if (!signature || !timestamp) {
    return { ok: false, reason: 'missing_headers' };
  }

  if (!/^\d+$/.test(timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }

  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'expired_timestamp' };
  }

  const expected = Buffer.from(computeSignature(signingKey, rawBody, timestamp), 'utf8');
  const received = Buffer.from(signature.trim().toLowerCase(), 'utf8');

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true };
}
