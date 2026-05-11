"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

import { QuranPageViewer } from "@/components/QuranPageViewer";
import { Recorder } from "@/components/Recorder";
import { ApiError, api, getToken } from "@/lib/api";
import { prettyTier } from "@/lib/types";
import type {
  MatchPlayer,
  MatchState,
  RoundState,
  SurahMeta,
  User,
} from "@/lib/types";
import { WsClient, type MatchMessage } from "@/lib/ws";

export default function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const matchId = Number(id);
  const router = useRouter();

  const [me, setMe] = useState<User | null>(null);
  const [surahs, setSurahs] = useState<SurahMeta[] | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Used to ignore stale WS state pushes while a user action's HTTP response
  // is in flight (REST response carries the freshest match state).
  const busyRef = useRef(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    Promise.all([api.me(), api.surahs()])
      .then(([u, s]) => {
        setMe(u);
        setSurahs(s);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/login");
        } else {
          setError(e instanceof ApiError ? e.message : "failed to load");
        }
      });
  }, [router]);

  // Subscribe to the match WS. The server pushes the full match state on
  // every change (pick made, recording scored, match completed).
  useEffect(() => {
    if (!me) return;
    const ws = new WsClient<MatchMessage>(`/ws/match/${matchId}`);
    const off = ws.onMessage((msg) => {
      if (busyRef.current) return; // don't overwrite optimistic state
      if (msg.type === "state") setMatch(msg.match);
    });
    ws.connect();
    return () => {
      off();
      ws.close();
    };
  }, [matchId, me]);

  if (!me || !surahs) return <p className="p-6 text-slate-600">Loading…</p>;
  if (error && !match)
    return (
      <main className="p-6 max-w-2xl mx-auto">
        <p className="text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
        <Link
          href="/lobby"
          className="inline-block mt-4 text-slate-700 hover:text-slate-900 underline"
        >
          ← Back to lobby
        </Link>
      </main>
    );
  if (!match) return <p className="p-6 text-slate-600">Loading match…</p>;

  const opponent: MatchPlayer =
    match.player_a.id === me.id ? match.player_b : match.player_a;
  const myWins = match.player_a.id === me.id ? match.a_wins : match.b_wins;
  const oppWins = match.player_a.id === me.id ? match.b_wins : match.a_wins;
  const currentRound = match.rounds.find((r) => r.status !== "scored") ?? null;

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-4">
        <Link
          href="/lobby"
          className="text-sm text-slate-700 hover:text-slate-900 underline"
        >
          ← Lobby
        </Link>
        <h1 className="text-xl font-bold text-slate-900">
          Match #{match.id}{" "}
          <span className="text-slate-500 text-base font-normal">
            · {prettyTier(match.tier)}
          </span>
        </h1>
        <span
          className={`px-3 py-1 rounded text-xs font-semibold ${
            match.status === "completed"
              ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
              : "bg-blue-100 text-blue-900 border border-blue-300"
          }`}
        >
          {match.status === "completed" ? "Completed" : "In progress"}
        </span>
      </header>

      <section className="mb-4 bg-white rounded-lg shadow-sm border border-slate-200 px-4 py-3">
        <div className="flex justify-between items-center text-sm">
          <PlayerLine label="You" name={me.display_name} wins={myWins} />
          <span className="text-slate-400 font-bold">vs</span>
          <PlayerLine
            label="Opponent"
            name={opponent.display_name}
            wins={oppWins}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1.5 text-center">
          Best of {match.round_count} · roles alternate each round
        </p>
      </section>

      <RoundHistoryStrip match={match} meId={me.id} />

      {match.status === "completed" ? (
        <CompletedView match={match} meId={me.id} />
      ) : currentRound ? (
        <RoundView
          match={match}
          round={currentRound}
          me={me}
          opponent={opponent}
          surahs={surahs}
          busyRef={busyRef}
          onMatchUpdate={setMatch}
        />
      ) : (
        <p className="text-slate-600 p-4">Waiting…</p>
      )}
    </main>
  );
}

function PlayerLine({
  label,
  name,
  wins,
}: {
  label: string;
  name: string;
  wins: number;
}) {
  return (
    <div className="flex-1 text-center">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="font-semibold text-slate-900">{name}</div>
      <div className="text-lg font-bold text-emerald-700">{wins}</div>
    </div>
  );
}

function RoundHistoryStrip({
  match,
  meId,
}: {
  match: MatchState;
  meId: number;
}) {
  return (
    <div className="flex gap-1.5 mb-4">
      {match.rounds.map((r) => {
        let cls = "bg-slate-100 border-slate-200 text-slate-500";
        let label = `R${r.number}`;
        if (r.status === "scored") {
          const meWasReciter = r.reciter_id === meId;
          const iWon = meWasReciter ? r.passed : !r.passed;
          cls = iWon
            ? "bg-emerald-100 border-emerald-400 text-emerald-900"
            : "bg-red-100 border-red-400 text-red-900";
          label = `R${r.number} ${iWon ? "W" : "L"}`;
        } else if (r.status === "picked") {
          cls = "bg-blue-100 border-blue-400 text-blue-900";
        } else {
          cls = "bg-amber-100 border-amber-400 text-amber-900";
        }
        return (
          <span
            key={r.number}
            className={`px-2.5 py-1 rounded border text-xs font-semibold flex-1 text-center ${cls}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function RoundView({
  match,
  round,
  me,
  opponent,
  surahs,
  busyRef,
  onMatchUpdate,
}: {
  match: MatchState;
  round: RoundState;
  me: User;
  opponent: MatchPlayer;
  surahs: SurahMeta[];
  busyRef: React.MutableRefObject<boolean>;
  onMatchUpdate: (m: MatchState) => void;
}) {
  const isPicker = round.picker_id === me.id;
  const isReciter = round.reciter_id === me.id;

  // Show last scored round's outcome briefly while next round is waiting_for_pick
  const lastScored = [...match.rounds]
    .reverse()
    .find((r) => r.number < round.number && r.status === "scored");

  return (
    <div className="space-y-4">
      {lastScored && (
        <ScoredRoundCallout round={lastScored} meId={me.id} />
      )}

      {round.status === "waiting_for_pick" &&
        (isPicker ? (
          <PickerPanel
            matchId={match.id}
            round={round}
            opponent={opponent}
            surahs={surahs}
            busyRef={busyRef}
            onMatchUpdate={onMatchUpdate}
          />
        ) : (
          <WaitingPanel
            title="Opponent is picking"
            body={`${opponent.display_name} is choosing an ayah for you to continue.`}
          />
        ))}

      {round.status === "picked" &&
        (isReciter ? (
          <ReciterPanel
            matchId={match.id}
            round={round}
            busyRef={busyRef}
            onMatchUpdate={onMatchUpdate}
          />
        ) : (
          <WaitingPanel
            title="Opponent is reciting"
            body={`Picked ayah ${round.surah}:${round.start_ayah}. ${opponent.display_name} has up to 15 seconds.`}
          />
        ))}
    </div>
  );
}

function PickerPanel({
  matchId,
  round,
  opponent,
  surahs,
  busyRef,
  onMatchUpdate,
}: {
  matchId: number;
  round: RoundState;
  opponent: MatchPlayer;
  surahs: SurahMeta[];
  busyRef: React.MutableRefObject<boolean>;
  onMatchUpdate: (m: MatchState) => void;
}) {
  const [surah, setSurah] = useState<number | null>(null);
  const [ayah, setAyah] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (surah === null || ayah === null) return;
    setSubmitting(true);
    setError(null);
    busyRef.current = true;
    try {
      const m = await api.pick(matchId, { surah, start_ayah: ayah });
      onMatchUpdate(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "pick failed");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Round {round.number}: your pick
        </h2>
        <p className="text-sm text-slate-700">
          Pick an ayah for{" "}
          <span className="font-semibold">{opponent.display_name}</span> to
          continue from. They&apos;ll recite the next ayah(s).
        </p>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Restricted to {opponent.display_name}&apos;s memorized juz&apos;:{" "}
        <span className="font-mono text-slate-800">
          {opponent.memorized_juz.join(", ")}
        </span>
      </p>

      <QuranPageViewer
        surahs={surahs}
        surah={surah}
        ayah={ayah}
        onChange={(next) => {
          setSurah(next.surah);
          setAyah(next.ayah);
        }}
        allowedJuz={opponent.memorized_juz}
      />

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-700">
          {surah !== null && ayah !== null ? (
            <>
              Selected:{" "}
              <span className="font-semibold text-emerald-800">
                {surah}:{ayah}
              </span>
            </>
          ) : (
            <span className="text-slate-500">No ayah selected yet</span>
          )}
        </p>
        <button
          type="button"
          onClick={confirm}
          disabled={surah === null || ayah === null || submitting}
          className="bg-emerald-600 text-white rounded-lg px-5 py-2.5 font-semibold hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting…" : "Confirm pick"}
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
          {error}
        </p>
      )}
    </section>
  );
}

function ReciterPanel({
  matchId,
  round,
  busyRef,
  onMatchUpdate,
}: {
  matchId: number;
  round: RoundState;
  busyRef: React.MutableRefObject<boolean>;
  onMatchUpdate: (m: MatchState) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(blob: Blob) {
    setSubmitting(true);
    setError(null);
    busyRef.current = true;
    try {
      const m = await api.recording(matchId, blob);
      onMatchUpdate(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "recording failed");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">
        Round {round.number}: your recitation
      </h2>
      <p className="text-sm text-slate-700 mb-4">
        Continue from{" "}
        <span className="font-semibold text-emerald-800">
          Surah {round.surah}, ayah {(round.start_ayah ?? 0) + 1}
        </span>{" "}
        onward. You have up to 15 seconds.
      </p>

      <div className="max-w-sm">
        <Recorder
          maxSeconds={15}
          disabled={submitting}
          onComplete={handle}
        />
      </div>
      {submitting && (
        <p className="text-sm text-slate-600 mt-3">Transcribing & scoring…</p>
      )}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
          {error}
        </p>
      )}
    </section>
  );
}

function WaitingPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <p className="text-sm text-slate-700">{body}</p>
    </section>
  );
}

function ScoredRoundCallout({
  round,
  meId,
}: {
  round: RoundState;
  meId: number;
}) {
  const meWasReciter = round.reciter_id === meId;
  const iWon = meWasReciter ? round.passed : !round.passed;
  const accuracy = round.accuracy ?? 0;
  return (
    <section
      className={`rounded-lg border px-4 py-3 ${
        iWon
          ? "bg-emerald-50 border-emerald-300"
          : "bg-red-50 border-red-300"
      }`}
    >
      <p className="text-sm font-semibold text-slate-900">
        Round {round.number}: {iWon ? "You won" : "You lost"}
        {round.passed !== null && (
          <span className="text-slate-600 font-normal">
            {" "}— accuracy {Math.round(accuracy * 100)}% (reciter{" "}
            {round.passed ? "passed" : "missed"})
          </span>
        )}
      </p>
    </section>
  );
}

function CompletedView({
  match,
  meId,
}: {
  match: MatchState;
  meId: number;
}) {
  const meIsA = match.player_a.id === meId;
  const myWins = meIsA ? match.a_wins : match.b_wins;
  const oppWins = meIsA ? match.b_wins : match.a_wins;
  const myBefore = meIsA ? match.a_rating_before : match.b_rating_before;
  const myAfter = meIsA ? match.a_rating_after : match.b_rating_after;
  const delta =
    myBefore !== null && myAfter !== null ? myAfter - myBefore : null;

  let label: string;
  let cls: string;
  if (myWins > oppWins) {
    label = "Victory!";
    cls = "bg-emerald-100 text-emerald-900 border-emerald-300";
  } else if (myWins < oppWins) {
    label = "Defeat";
    cls = "bg-red-100 text-red-900 border-red-300";
  } else {
    label = "Draw";
    cls = "bg-slate-100 text-slate-900 border-slate-300";
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-5">
      <div className={`rounded-lg border px-4 py-3 ${cls}`}>
        <h2 className="text-2xl font-bold">{label}</h2>
        <p className="text-sm mt-0.5">
          Final score: {myWins} — {oppWins}
        </p>
      </div>

      {delta !== null && myAfter !== null && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-700">
            Your {prettyTier(match.tier)} rating:{" "}
            <span className="font-semibold text-slate-900">{myBefore}</span> →{" "}
            <span className="font-bold text-slate-900">{myAfter}</span>{" "}
            <span
              className={delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-slate-600"}
            >
              ({delta > 0 ? "+" : ""}
              {delta})
            </span>
          </p>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
          Round breakdown
        </h3>
        {match.rounds.map((r) => {
          const meWasReciter = r.reciter_id === meId;
          const iWon = meWasReciter ? r.passed : !r.passed;
          return (
            <div
              key={r.number}
              className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">
                  R{r.number} — you were{" "}
                  {meWasReciter ? "reciter" : "picker"}{" "}
                  ({r.surah}:{r.start_ayah})
                </span>
                <span
                  className={`text-xs font-bold ${iWon ? "text-emerald-700" : "text-red-700"}`}
                >
                  {iWon ? "WON" : "LOST"} · {Math.round((r.accuracy ?? 0) * 100)}%
                </span>
              </div>
              {meWasReciter && r.transcript && (
                <p
                  dir="rtl"
                  className="font-arabic text-base text-slate-800 mt-1.5"
                >
                  {r.transcript}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Link
        href="/lobby"
        className="inline-block bg-emerald-600 text-white rounded-lg px-5 py-2.5 font-semibold hover:bg-emerald-700 transition-colors"
      >
        Back to lobby
      </Link>
    </section>
  );
}
