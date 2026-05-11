/**
 * Tiny typed WebSocket client with automatic reconnect.
 *
 *   const ws = new WsClient(`/ws/match/${id}`);
 *   const off = ws.onMessage(msg => { ... });
 *   ws.connect();
 *   ...
 *   off(); ws.close();
 */

import { getToken } from "./api";

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE ??
  (typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000").replace(
        /^http/,
        "ws",
      )
    : "ws://localhost:8000");

type Listener<T> = (msg: T) => void;

export class WsClient<TIn = unknown> {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener<TIn>>();
  private path: string;
  private closed = false;
  private reconnectAttempts = 0;
  private timer: number | null = null;

  constructor(path: string) {
    this.path = path;
  }

  connect(): void {
    if (this.closed || typeof window === "undefined") return;
    const token = getToken();
    const tokenPart = token
      ? `${this.path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
      : "";
    const url = `${WS_BASE}${this.path}${tokenPart}`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as TIn;
        for (const l of this.listeners) l(msg);
      } catch {
        // ignore non-JSON
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closed) return;
      const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempts);
      this.reconnectAttempts += 1;
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {
      // onclose will follow and trigger reconnect.
    };
  }

  onMessage(fn: Listener<TIn>): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  close(): void {
    this.closed = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}

export type LobbyMessage = { type: "match_found"; match_id: number };

export type MatchMessage = {
  type: "state";
  match: import("./types").MatchState;
};
