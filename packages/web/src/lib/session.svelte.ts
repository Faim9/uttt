import type { ClientMessage, ServerMessage, User } from '@uttt/core';

/** Calls the JSON API; failed requests throw with the server's error message. */
export async function api<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

/** The signed-in user, or null for guests. */
export const session = $state<{ user: User | null; ready: boolean }>({ user: null, ready: false });

/** Loads the session (which also gives guests their cookie), then opens the socket. */
export async function startSession(): Promise<void> {
  session.user = (await api<{ user: User | null }>('GET', '/api/me')).user;
  session.ready = true;
  socket.connect();
}

/** Signs in, signs up, or signs out; the socket reconnects to pick up the new identity. */
export async function authenticate(
  action: 'login' | 'signup' | 'logout',
  body: object = {},
): Promise<void> {
  session.user = (await api<{ user: User | null }>('POST', `/api/${action}`, body)).user;
  socket.reconnect();
}

/** One WebSocket per tab for all real-time traffic; reconnects automatically. */
class Socket {
  connected = $state(false);
  private ws: WebSocket | null = null;
  private retries = 0;
  private readonly listeners = new Set<(message: ServerMessage) => void>();

  connect(): void {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retries = 0;
    };
    ws.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      for (const listener of this.listeners) listener(message);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.connected = false;
      setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.retries++, 10_000));
    };
  }

  reconnect(): void {
    const old = this.ws;
    this.connected = false;
    this.connect();
    old?.close();
  }

  /** Messages sent while disconnected are dropped; pages resend what they need on reconnect. */
  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  /** Returns an unsubscribe function, so it can be returned from an $effect. */
  listen(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const socket = new Socket();
