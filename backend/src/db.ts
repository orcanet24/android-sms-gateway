import { DatabaseSync } from 'node:sqlite';

export interface ReceivedSms {
  messageId: string;
  phone: string;
  body: string;
  simNumber: number | null;
  receivedAt: number;
}

export interface Store {
  /** Stores a received SMS once. Returns false if this messageId was already stored. */
  saveReceivedSms(sms: ReceivedSms, rawPayload: string): boolean;
  queueOutgoing(id: string, phone: string, body: string): void;
  setOutgoingState(id: string, state: 'sent' | 'failed', error?: string): void;
  count(): { events: number; messages: number };
  close(): void;
}

export function openStore(path: string): Store {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      event       TEXT NOT NULL,
      message_id  TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      raw_payload TEXT NOT NULL,
      PRIMARY KEY (event, message_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  TEXT NOT NULL UNIQUE,
      direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      phone       TEXT NOT NULL,
      body        TEXT NOT NULL,
      sim_number  INTEGER,
      received_at INTEGER NOT NULL,
      state       TEXT,
      error       TEXT
    );
  `);

  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO webhook_events (event, message_id, received_at, raw_payload)
    VALUES ('sms:received', ?, ?, ?)
  `);
  const insertOutgoing = db.prepare(`
    INSERT INTO messages (message_id, direction, phone, body, state, received_at)
    VALUES (?, 'out', ?, ?, 'queued', ?)
  `);
  const setState = db.prepare(`UPDATE messages SET state = ?, error = ? WHERE message_id = ? AND direction = 'out'`);
  const insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages (message_id, direction, phone, body, sim_number, received_at)
    VALUES (?, 'in', ?, ?, ?, ?)
  `);

  return {
    saveReceivedSms(sms, rawPayload) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const event = insertEvent.run(sms.messageId, sms.receivedAt, rawPayload);
        if (event.changes === 0) {
          db.exec('COMMIT');
          return false;
        }
        insertMessage.run(sms.messageId, sms.phone, sms.body, sms.simNumber, sms.receivedAt);
        db.exec('COMMIT');
        return true;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    queueOutgoing(id, phone, body) {
      insertOutgoing.run(id, phone, body, Math.floor(Date.now() / 1000));
    },
    setOutgoingState(id, state, error) {
      setState.run(state, error ?? null, id);
    },
    count() {
      const events = db.prepare('SELECT COUNT(*) AS n FROM webhook_events').get() as { n: number };
      const messages = db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number };
      return { events: events.n, messages: messages.n };
    },
    close() {
      db.close();
    },
  };
}
