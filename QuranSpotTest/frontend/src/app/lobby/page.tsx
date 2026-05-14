"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ApiError, api, getToken, setToken } from "@/lib/api";
import type { Invite, User } from "@/lib/types";
import { WsClient, type LobbyMessage } from "@/lib/ws";

type QueueState =
  | { kind: "idle" }
  | { kind: "queueing"; position: number; elapsedMs: number };

export default function LobbyPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [roundCount, setRoundCount] = useState(3);
  const [queue, setQueue] = useState<QueueState>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WsClient<LobbyMessage> | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        setToken(null);
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const ws = new WsClient<LobbyMessage>("/ws/lobby");
    wsRef.current = ws;
    const off = ws.onMessage((msg) => {
      if (msg.type === "match_found" && msg.match_id) {
        clearElapsed();
        router.push(`/match/${msg.match_id}`);
      }
    });
    ws.connect();
    return () => {
      off();
      ws.close();
      wsRef.current = null;
    };
  }, [user, router]);

  useEffect(() => () => clearElapsed(), []);

  function clearElapsed() {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }

  async function startQueue() {
    setError(null);
    try {
      const res = await api.quickmatch({ round_count: roundCount });
      if (res.status === "matched" && res.match_id) {
        router.push(`/match/${res.match_id}`);
        return;
      }
      const start = performance.now();
      setQueue({
        kind: "queueing",
        position: res.queue_position ?? 1,
        elapsedMs: 0,
      });
      clearElapsed();
      elapsedTimerRef.current = window.setInterval(() => {
        setQueue((q) =>
          q.kind === "queueing"
            ? { ...q, elapsedMs: performance.now() - start }
            : q,
        );
      }, 250);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "quickmatch failed");
    }
  }

  async function cancelQueue() {
    clearElapsed();
    setQueue({ kind: "idle" });
    try {
      await api.cancelQueue();
    } catch {
      // ignore
    }
  }

  function signOut() {
    setToken(null);
    router.replace("/login");
  }

  if (!user) return <p className="p-6 text-slate-600">Loading…</p>;

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">QuranSpot</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-700">{user.display_name}</span>
          <button
            onClick={signOut}
            className="text-slate-700 hover:text-slate-900 underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold text-slate-900">
              Welcome, {user.display_name}
            </h2>
            <p className="text-sm text-slate-700">
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 text-xs">
                {user.email}
              </code>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-emerald-50 border border-emerald-300 rounded-lg px-4 py-2">
              <div className="text-xs uppercase tracking-wide text-emerald-700">
                ELO
              </div>
              <div className="text-2xl font-bold text-emerald-900">
                {user.rating}
              </div>
              <div className="text-xs text-emerald-700">
                {user.games_played} game{user.games_played === 1 ? "" : "s"}
              </div>
            </div>
            <div className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-600">
                Memorized
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {user.juz_equivalent.toFixed(1)}
              </div>
              <div className="text-xs text-slate-600">
                of 30 juz&apos; ({user.memorized_ayat_count} ayat)
              </div>
            </div>
          </div>
        </div>
      </section>

      <PrivateMatchSection roundCount={roundCount} />

      <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Quickmatch</h2>
        {queue.kind === "idle" ? (
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm">
              <span className="font-medium text-slate-800">Rounds:</span>
              <select
                value={roundCount}
                onChange={(e) => setRoundCount(Number(e.target.value))}
                className="border border-slate-300 rounded px-3 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {[1, 3, 5, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} round{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              <span className="text-slate-500">
                — roles alternate each round
              </span>
            </label>
            <button
              onClick={startQueue}
              className="bg-emerald-600 text-white rounded-lg px-5 py-2.5 font-semibold hover:bg-emerald-700 transition-colors"
            >
              Find opponent
            </button>
            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-slate-800">
                Searching for an opponent…{" "}
                <span className="text-slate-500 text-sm">
                  ({(queue.elapsedMs / 1000).toFixed(0)}s)
                </span>
              </p>
            </div>
            <button
              onClick={cancelQueue}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg px-4 py-2 font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Solo practice
        </h2>
        <p className="text-slate-700 text-sm mb-3">
          The system picks a random ayah from your memorized set — recite the
          next one.
        </p>
        <Link
          href="/solo"
          className="inline-block bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg px-4 py-2 font-semibold transition-colors"
        >
          Start a solo round →
        </Link>
      </section>
    </main>
  );
}

function PrivateMatchSection({ roundCount }: { roundCount: number }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const inv = await api.createInvite({ round_count: roundCount });
      setInvite(inv);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "could not create invite");
    } finally {
      setCreating(false);
    }
  }

  async function cancel() {
    if (!invite) return;
    try {
      await api.cancelInvite(invite.code);
    } catch {
      // ignore
    }
    setInvite(null);
    setCopied(false);
  }

  function copyLink() {
    if (!invite) return;
    const fullUrl = `${window.location.origin}${invite.url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 mb-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">
        Challenge a friend
      </h2>
      {!invite ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Create a private link and share it. The first person to accept
            becomes your opponent.
          </p>
          <button
            onClick={create}
            disabled={creating}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg px-4 py-2 font-semibold disabled:opacity-50 transition-colors"
          >
            {creating
              ? "Creating…"
              : `Create private link (${roundCount} rounds)`}
          </button>
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}${invite.url}`}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 bg-slate-50 font-mono"
            />
            <button
              onClick={copyLink}
              className="bg-emerald-600 text-white rounded px-3 py-2 text-sm font-semibold hover:bg-emerald-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Waiting for your friend to accept — you&apos;ll be redirected
            automatically.
          </p>
          <button
            onClick={cancel}
            className="text-sm text-slate-600 hover:text-slate-800 underline"
          >
            Cancel invite
          </button>
        </div>
      )}
    </section>
  );
}
