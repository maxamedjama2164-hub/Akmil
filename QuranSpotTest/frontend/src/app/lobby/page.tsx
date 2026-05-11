"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ApiError, api, getToken, setToken } from "@/lib/api";
import { prettyTier } from "@/lib/types";
import type { RatingRow, User } from "@/lib/types";
import { WsClient, type LobbyMessage } from "@/lib/ws";

type QueueState =
  | { kind: "idle" }
  | { kind: "queueing"; tier: string; position: number; elapsedMs: number };

export default function LobbyPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
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
    Promise.all([api.me(), api.ratings()])
      .then(([u, r]) => {
        setUser(u);
        setRatings(r);
      })
      .catch(() => {
        setToken(null);
        router.replace("/login");
      });
  }, [router]);

  // Open the lobby WebSocket. The server pushes `match_found` events when
  // matchmaker pairs us with someone who was queued first.
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

  useEffect(() => {
    return () => clearElapsed();
  }, []);

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
      // Otherwise we're queued; WS will push when we're paired.
      const start = performance.now();
      setQueue({
        kind: "queueing",
        tier: res.tier,
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

  if (!user || !ratings) return <p className="p-6 text-slate-600">Loading…</p>;

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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Welcome, {user.display_name}!
            </h2>
            <p className="text-sm text-slate-700 mt-0.5">
              Memorized: {user.memorized_juz.length} juz&apos;{" "}
              <span className="text-slate-500">
                ({user.memorized_juz.join(", ")})
              </span>
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 font-semibold text-sm border border-emerald-300">
            Tier: {prettyTier(user.tier)}
          </span>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">
          Your ratings
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ratings.map((r) => (
            <div
              key={r.tier}
              className={`rounded-lg border px-3 py-2 ${
                r.tier === user.tier
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="text-xs text-slate-600">{prettyTier(r.tier)}</div>
              <div className="text-lg font-bold text-slate-900">{r.rating}</div>
              <div className="text-xs text-slate-500">
                {r.games_played} game{r.games_played === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      </section>

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
              Find opponent ({prettyTier(user.tier)})
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
                Searching for an opponent in{" "}
                <span className="font-semibold">{prettyTier(queue.tier)}</span>
                …{" "}
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
          Take a spot test on your own — no opponent, no rating changes.
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
