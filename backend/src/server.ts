import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildApp } from './app.js';
import { openStore } from './db.js';
import { createPhoneClient } from './phone.js';

const signingKey = process.env.WEBHOOK_SIGNING_KEY;
if (!signingKey) {
  throw new Error('WEBHOOK_SIGNING_KEY is required');
}

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? 'data/sms.db';
mkdirSync(dirname(dbPath), { recursive: true });
const store = openStore(dbPath);
const phoneUrl = process.env.PHONE_URL;
const phoneUser = process.env.PHONE_USERNAME;
const phonePass = process.env.PHONE_PASSWORD;
if (!phoneUrl || !phoneUser || !phonePass) {
  throw new Error('PHONE_URL, PHONE_USERNAME and PHONE_PASSWORD are required');
}
const phone = createPhoneClient({ baseUrl: phoneUrl, username: phoneUser, password: phonePass });
const app = buildApp({ webhookSigningKey: signingKey, store, phone });

app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`listening on :${port}`);
});
