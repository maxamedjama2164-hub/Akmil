"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { NavBar } from "@/components/NavBar";
import { api } from "@/lib/api";
import type { LeaderboardEntry } from "@/lib/types";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .leaderboard(50)
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total_players);
      })
      .catch(() => setError("Could not load leaderboard"))
      .finally(() => setLoading(false));
  }, []);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <>
      <NavBar />
      <main className="max-w-3xl mx-auto p-4 md:p-6">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-3xl font-black text-slate-100 uppercase tracking-wide">
            Leaderboard
          </h1>
          {!loading && total > 0 && (
            <span className="text-slate-500 text-sm">
              {total} ranked player{total === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {loading && <p className="text-slate-400">Loading…</p>}
        {error && (
          <p className="text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
            {error}
          </p>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-10 text-center">
            <p className="text-slate-400 text-lg">No ranked players yet.</p>
            <p className="text-slate-500 text-sm mt-1">
              Complete a match to appear here.
            </p>
          </div>
        )}

        {/* Podium — top 3 */}
        {top3.length >= 2 && (
          <div className="mb-6">
            <PodiumSection entries={top3} />
          </div>
        )}

        {/* Rest of the board */}
        {rest.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
          <div className="bg-slate-900 overflow-hidden min-w-[360px]">
            <div className="grid grid-cols-[2.5rem_1fr_5rem_4.5rem_4.5rem] gap-x-3 px-4 py-2 border-b border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">#</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Player</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 text-right">ELO</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 text-right">Games</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 text-right">Juz'</span>
            </div>
            {rest.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[2.5rem_1fr_5rem_4.5rem_4.5rem] gap-x-3 px-4 py-3 border-b border-slate-800/60 last:border-b-0 items-center hover:bg-slate-800/40 transition-colors"
              >
                <span className="text-sm font-bold text-slate-600 text-center">
                  {entry.rank}
                </span>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={entry.display_name} size="xs" />
                  <span className="font-semibold text-slate-300 truncate text-sm">
                    {entry.display_name}
                  </span>
                </div>
                <span className="text-right font-black text-emerald-400 tabular-nums">
                  {entry.rating}
                </span>
                <span className="text-right text-slate-500 text-sm tabular-nums">
                  {entry.games_played}
                </span>
                <span className="text-right text-slate-500 text-sm tabular-nums">
                  {entry.juz_equivalent.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          </div>
        )}

        {/* If fewer than 3, show as regular list */}
        {top3.length > 0 && top3.length < 2 && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            {entries.map((entry) => (
              <RankRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/* ── Podium ──────────────────────────────────────────────────────────────── */

function PodiumSection({ entries }: { entries: LeaderboardEntry[] }) {
  const first = entries[0];
  const second = entries[1];
  const third = entries[2] ?? null;

  return (
    <div className="flex items-end justify-center gap-3">
      {/* 2nd */}
      <PodiumBlock
        entry={second}
        medal="🥈"
        podiumHeight="py-5"
        borderColor="border-slate-500"
        bgColor="bg-slate-800/60"
        eloColor="text-slate-300"
        nameColor="text-slate-400"
        avatarSize="sm"
      />

      {/* 1st — center, tallest */}
      <PodiumBlock
        entry={first}
        medal="🥇"
        podiumHeight="py-8"
        borderColor="border-amber-500"
        bgColor="bg-amber-900/30"
        eloColor="text-amber-400"
        nameColor="text-slate-100"
        avatarSize="md"
        featured
      />

      {/* 3rd */}
      {third && (
        <PodiumBlock
          entry={third}
          medal="🥉"
          podiumHeight="py-3"
          borderColor="border-orange-700"
          bgColor="bg-orange-900/20"
          eloColor="text-orange-400"
          nameColor="text-slate-400"
          avatarSize="sm"
        />
      )}
    </div>
  );
}

function PodiumBlock({
  entry,
  medal,
  podiumHeight,
  borderColor,
  bgColor,
  eloColor,
  nameColor,
  avatarSize,
  featured = false,
}: {
  entry: LeaderboardEntry;
  medal: string;
  podiumHeight: string;
  borderColor: string;
  bgColor: string;
  eloColor: string;
  nameColor: string;
  avatarSize: "sm" | "md";
  featured?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center flex-1 max-w-[180px] ${featured ? "max-w-[200px]" : ""}`}>
      <Avatar name={entry.display_name} size={avatarSize} />
      <p className={`${nameColor} text-xs font-bold mt-2 text-center truncate w-full px-1`}>
        {entry.display_name}
      </p>
      <p className={`${eloColor} font-black ${featured ? "text-2xl" : "text-lg"} tabular-nums`}>
        {entry.rating}
      </p>
      <div
        className={`w-full ${bgColor} border-t-2 ${borderColor} rounded-t-md mt-2 ${podiumHeight} flex items-start justify-center pt-2`}
      >
        <span className={featured ? "text-2xl" : "text-xl"}>{medal}</span>
      </div>
    </div>
  );
}

function RankRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 last:border-b-0">
      <span className="w-6 text-sm font-bold text-slate-600 text-center shrink-0">
        {entry.rank}
      </span>
      <Avatar name={entry.display_name} size="xs" />
      <span className="flex-1 font-semibold text-slate-300 truncate text-sm">
        {entry.display_name}
      </span>
      <span className="font-black text-emerald-400 tabular-nums">{entry.rating}</span>
    </div>
  );
}
