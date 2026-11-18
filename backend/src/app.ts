import Fastify from 'fastify';
import { verifyWebhookSignature } from './signature.js';
import type { Store } from './db.js';
import type { PhoneClient } from './phone.js';
import { randomUUID } from 'node:crypto';

export interface AppOptions {
  webhookSigningKey: string;
  store: Store;
  phone: PhoneClient;
  /** Injectable clock in Unix seconds, for tests. */
  now?: () => number;
}

export function buildApp(options: AppOptions) {
  const app = Fastify({ logger: false });
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  // Read the body as a string so the signature is checked over the exact bytes received.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post<{ Body: { phone?: string; text?: string } }>('/v1/sms', async (req, reply) => {
    const { phone, text } = req.body ?? {};
    if (!phone || !text) {
      return reply.code(400).send({ error: 'phone and text are required' });
    }

    const id = randomUUID();
    options.store.queueOutgoing(id, phone, text);

    const result = await options.phone.sendMessage(id, phone, text);
    options.store.setOutgoingState(id, result.ok ? 'sent' : 'failed', result.ok ? undefined : result.error);

    return reply.code(result.ok ? 202 : 502).send({ id, state: result.ok ? 'sent' : 'failed' });
  });

  app.post<{ Body: string }>('/webhooks/sms', async (req, reply) => {
    const rawBody = req.body;
    const result = verifyWebhookSignature({
      signingKey: options.webhookSigningKey,
      rawBody,
      signature: req.headers['x-signature'] as string | undefined,
      timestamp: req.headers['x-timestamp'] as string | undefined,
      nowSeconds: now(),
    });

    if (!result.ok) {
      return reply.code(401).send({ error: result.reason });
    }

    let body: {
      event?: string;
      payload?: {
        messageId?: string;
        sender?: string;
        message?: string;
        simNumber?: number | null;
        receivedAt?: string;
      };
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return reply.code(400).send({ error: 'invalid_json' });
    }

    if (body.event !== 'sms:received' || !body.payload?.messageId) {
      return reply.code(200).send({ ok: true, stored: false });
    }

    const p = body.payload;
    const stored = options.store.saveReceivedSms(
      {
        messageId: p.messageId!,
        phone: p.sender ?? '',
        body: p.message ?? '',
        simNumber: p.simNumber ?? null,
        receivedAt: p.receivedAt ? Math.floor(Date.parse(p.receivedAt) / 1000) : now(),
      },
      rawBody,
    );

    return reply.code(200).send({ ok: true, stored });
  });

  return app;
}
