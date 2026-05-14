"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";

import { QuranPageViewer } from "@/components/QuranPageViewer";
import { Recorder } from "@/components/Recorder";
import { ApiError, api, getToken } from "@/lib/api";
import { LiveAudioReceiver } from "@/lib/live_audio";
import type {
  MatchPlayer,
  MatchState,
  RoundState,
  SurahMeta,
  User,
} from "@/lib/types";
import { WsClient } from "@/lib/ws";

type AudioMessage = {
  type: "round_audio";
  round_number: number;
  mime: string;
  audio_b64: string;
};

type MatchMessage = { type: "state"; match: MatchState } | AudioMessage;

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
  // Round-number → blob URL for the recorded audio
  const [audioByRound, setAudioByRound] = useState<Record<number, string>>({});
  const busyRef = useRef(false);
  const wsRef = useRef<WsClient<MatchMessage> | null>(null);

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

  useEffect(() => {
    if (!me) return;
    const ws = new WsClient<MatchMessage>(`/ws/match/${matchId}`);
    wsRef.current = ws;
    const off = ws.onMessage((msg) => {
      if (msg.type === "state") {
        if (!busyRef.current) setMatch(msg.match);
      } else if (msg.type === "round_audio") {
        const bytes = base64ToBytes(msg.audio_b64);
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: msg.mime,
        });
        const url = URL.createObjectURL(blob);
        setAudioByRound((prev) => {
          // Revoke any previous URL for this round to avoid leaks
          if (prev[msg.round_number]) URL.revokeObjectURL(prev[msg.round_number]);
          return { ...prev, [msg.round_number]: url };
        });
      }
    });
    ws.connect();
    return () => {
      off();
      ws.close();
      wsRef.current = null;
    };
  }, [matchId, me]);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of Object.values(audioByRound)) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const currentRound = match.rounds.find((r) => !r.finalized) ?? null;

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
          Match #{match.id}
          {match.is_private && (
            <span className="text-slate-500 text-base font-normal">
              {" "}· private
            </span>
          )}
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
        <CompletedView
          match={match}
          meId={me.id}
          audioByRound={audioByRound}
        />
      ) : currentRound ? (
        <RoundView
          match={match}
          round={currentRound}
          me={me}
          opponent={opponent}
          surahs={surahs}
          audioByRound={audioByRound}
          busyRef={busyRef}
          wsRef={wsRef}
          onMatchUpdate={setMatch}
        />
      ) : (
        <p className="text-slate-600 p-4">Waiting…</p>
      )}
    </main>
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
        if (r.finalized) {
          const iWon = r.winner_id === meId;
          cls = iWon
            ? "bg-emerald-100 border-emerald-400 text-emerald-900"
            : "bg-red-100 border-red-400 text-red-900";
          label = `R${r.number} ${iWon ? "W" : "L"}${r.overridden ? "★" : ""}`;
        } else if (r.transcript) {
          cls = "bg-purple-100 border-purple-400 text-purple-900";
          label = `R${r.number} review`;
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
  audioByRound,
  busyRef,
  wsRef,
  onMatchUpdate,
}: {
  match: MatchState;
  round: RoundState;
  me: User;
  opponent: MatchPlayer;
  surahs: SurahMeta[];
  audioByRound: Record<number, string>;
  busyRef: React.MutableRefObject<boolean>;
  wsRef: React.MutableRefObject<WsClient<MatchMessage> | null>;
  onMatchUpdate: (m: MatchState) => void;
}) {
  const isPicker = round.picker_id === me.id;
  const isReciter = round.reciter_id === me.id;

  if (round.transcript && !round.finalized) {
    return (
      <ReviewPanel
        match={match}
        round={round}
        isPicker={isPicker}
        opponentName={opponent.display_name}
        audioUrl={audioByRound[round.number] ?? null}
        busyRef={busyRef}
        onMatchUpdate={onMatchUpdate}
      />
    );
  }

  if (round.status === "waiting_for_pick") {
    return isPicker ? (
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
    );
  }

  if (round.status === "picked") {
    return isReciter ? (
      <ReciterPanel
        matchId={match.id}
        round={round}
        busyRef={busyRef}
        wsRef={wsRef}
        onMatchUpdate={onMatchUpdate}
      />
    ) : (
      <ListenLivePanel
        opponentName={opponent.display_name}
        round={round}
        wsRef={wsRef}
      />
    );
  }

  return null;
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

  const juzList = opponent.memorized_juz.length
    ? opponent.memorized_juz.join(", ")
    : "—";
  const surahList = opponent.memorized_surahs.length
    ? opponent.memorized_surahs.join(", ")
    : "—";

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Round {round.number}: your pick
        </h2>
        <p className="text-sm text-slate-700">
          Pick an ayah for{" "}
          <span className="font-semibold">{opponent.display_name}</span>; they
          will recite the next ayah in full.
        </p>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Restricted to {opponent.display_name}&apos;s memorized set —{" "}
        <span className="font-mono text-slate-800">juz: {juzList}</span> ·{" "}
        <span className="font-mono text-slate-800">surahs: {surahList}</span>
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
        allowedSurahs={opponent.memorized_surahs}
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
  wsRef,
  onMatchUpdate,
}: {
  matchId: number;
  round: RoundState;
  busyRef: React.MutableRefObject<boolean>;
  wsRef: React.MutableRefObject<WsClient<MatchMessage> | null>;
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
      <p className="text-sm text-slate-700 mb-2">
        Continue from{" "}
        <span className="font-semibold text-emerald-800">
          Surah {round.surah}, ayah {(round.start_ayah ?? 0) + 1}
        </span>{" "}
        — recite the next ayah in full (up to 15s).
      </p>

      {round.start_ayah_text_uthmani && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Picked ayah ({round.surah}:{round.start_ayah})
          </p>
          <p
            dir="rtl"
            className="quran-text text-2xl text-slate-900"
          >
            {round.start_ayah_text_uthmani}
          </p>
        </div>
      )}

      <div className="max-w-sm">
        <Recorder
          maxSeconds={15}
          disabled={submitting}
          onComplete={handle}
          liveAudioWs={wsRef.current}
        />
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Your opponent will hear you live as you recite.
      </p>
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

function ListenLivePanel({
  opponentName,
  round,
  wsRef,
}: {
  opponentName: string;
  round: RoundState;
  wsRef: React.MutableRefObject<WsClient<MatchMessage> | null>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const receiverRef = useRef<LiveAudioReceiver | null>(null);
  const [streaming, setStreaming] = useState(false);
  // Live audio defaults to MUTED to avoid a feedback loop when both
  // browser sessions are on the same machine (picker's speakers → reciter's
  // mic → garbled recording). Users with headphones can unmute manually.
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const recv = new LiveAudioReceiver();
    receiverRef.current = recv;
    recv.start(ws, (stream) => {
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
        audioRef.current.play().catch(() => {
          /* autoplay may need a user gesture */
        });
        setStreaming(true);
      }
    });
    return () => {
      recv.stop();
      receiverRef.current = null;
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
      setStreaming(false);
    };
  }, [wsRef]);

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
        <h2 className="text-lg font-semibold text-slate-900">
          {opponentName} is reciting
        </h2>
      </div>
      <p className="text-sm text-slate-700">
        You picked {round.surah}:{round.start_ayah}. They have up to 15 seconds.
      </p>

      {round.start_ayah_text_uthmani && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            You picked
          </p>
          <p dir="rtl" className="quran-text text-2xl text-slate-900">
            {round.start_ayah_text_uthmani}
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <audio
          ref={audioRef}
          autoPlay
          controls
          muted={muted}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="text-xs font-semibold px-2.5 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 whitespace-nowrap"
        >
          {muted ? "🔇 Tap to listen" : "🔊 Listening · mute"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        {streaming ? "Live audio connected." : "Waiting for stream…"}{" "}
        {muted &&
          "Audio is muted by default. Use headphones if both windows are on the same machine."}
      </p>
    </section>
  );
}

function WaitingPanel({
  title,
  body,
  startAyahText,
}: {
  title: string;
  body: string;
  startAyahText?: string | null;
}) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <p className="text-sm text-slate-700">{body}</p>
      {startAyahText && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            You picked
          </p>
          <p dir="rtl" className="quran-text text-2xl text-slate-900">
            {startAyahText}
          </p>
        </div>
      )}
    </section>
  );
}

function ReviewPanel({
  match,
  round,
  isPicker,
  opponentName,
  audioUrl,
  busyRef,
  onMatchUpdate,
}: {
  match: MatchState;
  round: RoundState;
  isPicker: boolean;
  opponentName: string;
  audioUrl: string | null;
  busyRef: React.MutableRefObject<boolean>;
  onMatchUpdate: (m: MatchState) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passed = round.passed === true;
  const accuracy = round.accuracy ?? 0;

  async function finalize(override: boolean) {
    setSubmitting(true);
    setError(null);
    busyRef.current = true;
    try {
      const m = await api.finalize(match.id, round.number, override);
      onMatchUpdate(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "finalize failed");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Round {round.number} — review
        </h2>
        <span
          className={`px-3 py-1 rounded-full text-sm font-bold border ${
            passed
              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
              : "bg-red-100 text-red-900 border-red-300"
          }`}
        >
          {passed ? "Passed" : "Failed"} · {Math.round(accuracy * 100)}%
        </span>
      </div>

      {audioUrl && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            The recording
          </p>
          <audio
            key={audioUrl}
            src={audioUrl}
            controls
            autoPlay
            className="w-full"
          />
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Expected (ayah {round.target_ayat?.[0]?.surah}:
          {round.target_ayat?.[0]?.number})
        </p>
        <p
          dir="rtl"
          className="quran-text text-2xl bg-slate-50 rounded-lg p-4 border border-slate-200"
        >
          {round.target_text}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Transcribed
        </p>
        <p
          dir="rtl"
          className="quran-text text-2xl bg-slate-50 rounded-lg p-4 border border-slate-200"
        >
          {round.transcript || (
            <span dir="ltr" className="text-slate-400 font-sans text-base">
              (no transcript)
            </span>
          )}
        </p>
      </div>

      {isPicker ? (
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          {!passed && (
            <button
              type="button"
              onClick={() => finalize(true)}
              disabled={submitting}
              className="flex-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg py-2.5 font-semibold disabled:opacity-50 transition-colors"
              title="If you think the computer got it wrong"
            >
              Award point to opponent
            </button>
          )}
          <button
            type="button"
            onClick={() => finalize(false)}
            disabled={submitting}
            className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {submitting
              ? "Submitting…"
              : passed
                ? "Accept (next round)"
                : "Confirm result (next round)"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Waiting for{" "}
          <span className="font-semibold">{opponentName}</span> to confirm the
          result…
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </section>
  );
}

function CompletedView({
  match,
  meId,
  audioByRound,
}: {
  match: MatchState;
  meId: number;
  audioByRound: Record<number, string>;
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
            ELO:{" "}
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
          const iWon = r.winner_id === meId;
          const meWasReciter = r.reciter_id === meId;
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
                  {r.overridden && (
                    <span className="ml-2 text-amber-700 text-xs">
                      (overridden)
                    </span>
                  )}
                </span>
                <span
                  className={`text-xs font-bold ${iWon ? "text-emerald-700" : "text-red-700"}`}
                >
                  {iWon ? "WON" : "LOST"} ·{" "}
                  {Math.round((r.accuracy ?? 0) * 100)}%
                </span>
              </div>
              {audioByRound[r.number] && (
                <audio
                  src={audioByRound[r.number]}
                  controls
                  className="w-full mt-2"
                />
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
