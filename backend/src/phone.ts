export interface PhoneConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export interface PhoneClient {
  /** Sends one message. `id` is the idempotency key; the phone answers 409 if it already exists. */
  sendMessage(id: string, phone: string, text: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

export function createPhoneClient(config: PhoneConfig): PhoneClient {
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    // Refresh one minute before expiry.
    if (token && token.expiresAt - Date.now() > 60_000) return token.value;

    const basic = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const res = await fetch(`${config.baseUrl}/auth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 3600, scopes: ['messages:send'] }),
    });
    if (!res.ok) throw new Error(`token request failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_at: string };
    token = { value: data.access_token, expiresAt: Date.parse(data.expires_at) };
    return token.value;
  }

  return {
    async sendMessage(id, phone, text) {
      try {
        const res = await fetch(`${config.baseUrl}/message`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await getToken()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            id,
            phoneNumbers: [phone],
            textMessage: { text },
            withDeliveryReport: true,
          }),
        });
        if (res.ok || res.status === 409) return { ok: true };
        return { ok: false, error: `phone responded ${res.status}` };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };
}
