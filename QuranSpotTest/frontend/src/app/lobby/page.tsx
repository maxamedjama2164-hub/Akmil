"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NavBar } from "@/components/NavBar";
import { Recorder } from "@/components/Recorder";
import { ApiError, api, getToken, setToken } from "@/lib/api";
import { getAudioEnabled, getReciter, setAudioEnabled as saveAudioEnabled, setReciter as saveReciter } from "@/lib/prefs";
import type {
  ChallengeType,
  Invite,
  ScoreResult,
  SoloPick,
  SoloPickMutashabih,
  SoloPickQuiz,
  SurahChoice,
  User,
} from "@/lib/types";
import { WsClient, type LobbyMessage } from "@/lib/ws";

type Mode = "match" | "solo";

type QueueState =
  | { kind: "idle" }
  | { kind: "queueing"; position: number; elapsedMs: number };

/* ── Audio helpers ──────────────────────────────────────────────────────────── */

const RECITERS = [
  { id: "Alafasy_128kbps",             label: "Alafasy" },
  { id: "AbdulBaset_Murattal_128kbps", label: "Abdul Basit" },
  { id: "Maher_Al_Muaiqly_128kbps",   label: "Maher Al-Muaiqly" },
  { id: "Minshawy_Murattal_128kbps",  label: "Al-Minshawy" },
] as const;

type ReciterId = (typeof RECITERS)[number]["id"];

function getAudioUrl(reciter: string, surah: number, ayah: number): string {
  return `https://everyayah.com/data/${reciter}/${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;
}

function getAudioUrlForPick(pick: SoloPick, reciter: string): string | null {
  switch (pick.challenge_type) {
    case "recite":
      return getAudioUrl(reciter, pick.surah, pick.start_ayah);
    case "guess_surah":
    case "guess_ayah_number":
    case "guess_surah_number":
      return getAudioUrl(reciter, pick.correct_surah_number, pick.correct_ayah_number);
    case "mutashabih":
      if (pick.correct_ayah_number <= 1) return null;
      return getAudioUrl(reciter, pick.correct_surah_number, pick.correct_ayah_number - 1);
    default:
      return null;
  }
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function LobbyPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>("match");
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

  if (!user) return (
    <>
      <NavBar />
      <p className="p-6 text-slate-400">Loading…</p>
    </>
  );

  return (
    <>
      <NavBar />
      <main className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">

        {/* Player stats */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Welcome back, {user.display_name}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Ready to compete?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-emerald-950 border border-emerald-800 rounded-lg px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-emerald-500">ELO</div>
                <div className="text-3xl font-black text-emerald-400">{user.rating}</div>
                <div className="text-xs text-emerald-600">
                  {user.games_played} game{user.games_played === 1 ? "" : "s"}
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">Memorized</div>
                <div className="text-3xl font-black text-slate-200">{user.juz_equivalent.toFixed(1)}</div>
                <div className="text-xs text-slate-500">
                  of 30 juz' ({user.memorized_ayat_count} ayat)
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mode switcher */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode("match")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold uppercase tracking-widest transition-colors ${
              mode === "match"
                ? "bg-emerald-600 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Match
          </button>
          <button
            onClick={() => setMode("solo")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold uppercase tracking-widest transition-colors ${
              mode === "solo"
                ? "bg-emerald-600 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Solo Practice
          </button>
        </div>

        {mode === "match" && (
          <>
            <PrivateMatchSection roundCount={roundCount} />

            {/* Quickmatch */}
            <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h2 className="text-lg font-bold text-slate-100 uppercase tracking-wide mb-4">
                Quickmatch
              </h2>
              {queue.kind === "idle" ? (
                <div className="space-y-4">
                  <label className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-slate-300">Rounds:</span>
                    <select
                      value={roundCount}
                      onChange={(e) => setRoundCount(Number(e.target.value))}
                      className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {[1, 3, 5, 7].map((n) => (
                        <option key={n} value={n}>
                          {n} round{n === 1 ? "" : "s"}
                        </option>
                      ))}
                    </select>
                    <span className="text-slate-500">— roles alternate each round</span>
                  </label>
                  <button
                    onClick={startQueue}
                    className="bg-emerald-600 text-white rounded-lg px-6 py-3 font-bold uppercase tracking-wide hover:bg-emerald-500 transition-colors"
                  >
                    Find opponent
                  </button>
                  {error && (
                    <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-slate-300">
                      Searching for an opponent…{" "}
                      <span className="text-slate-500 text-sm">
                        ({(queue.elapsedMs / 1000).toFixed(0)}s)
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={cancelQueue}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-4 py-2 font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {mode === "solo" && <SoloPractice user={user} />}

      </main>
    </>
  );
}

/* ── Solo Practice (embedded) ───────────────────────────────────────── */

const CHALLENGE_OPTIONS: { type: ChallengeType; label: string; desc: string }[] = [
  { type: "recite",             label: "Recite",          desc: "Say the next ayah aloud" },
  { type: "guess_surah",        label: "Guess Surah",     desc: "Which surah is this from?" },
  { type: "guess_ayah_number",  label: "Guess Ayah #",    desc: "What is this ayah's number?" },
  { type: "guess_surah_number", label: "Guess Surah #",   desc: "What is this surah's number?" },
  { type: "mutashabih",         label: "Mutashabihaat",   desc: "Which similar ayah comes next?" },
  { type: "mix",                label: "Mix",             desc: "Random challenge each round" },
];

type SoloPhase =
  | { kind: "selecting" }
  | { kind: "loading" }
  | { kind: "ready"; pick: SoloPick }
  | { kind: "scoring"; pick: SoloPick }
  | { kind: "result"; pick: SoloPick; result: ScoreResult };

function SoloPractice({ user }: { user: User }) {
  const [phase, setPhase]         = useState<SoloPhase>({ kind: "selecting" });
  const [challengeType, setMode]  = useState<ChallengeType>("recite");
  const [quizAnswer, setAnswer]   = useState<{ selected: number; correct: boolean } | null>(null);
  const [mutashabihAnswer, setMutashabihAnswer] = useState<{ selected: string; correct: boolean } | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [streak, setStreak]       = useState(0);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => getAudioEnabled());
  const [reciter, setReciter]     = useState<ReciterId>(() => getReciter() as ReciterId);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-play when a new pick is ready
  useEffect(() => {
    if (!audioEnabled || phase.kind !== "ready") return;
    const url = getAudioUrlForPick(phase.pick, reciter);
    if (!url) return;
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => { audio.pause(); };
  }, [phase, audioEnabled, reciter]);

  // Stop audio when leaving solo practice
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  function playCurrentAudio() {
    if (phase.kind !== "ready") return;
    const url = getAudioUrlForPick(phase.pick, reciter);
    if (!url) return;
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
  }

  const pickNext = useCallback(async (type: ChallengeType) => {
    setError(null);
    setAnswer(null);
    setMutashabihAnswer(null);
    setPhase({ kind: "loading" });
    try {
      const pick = await api.soloPick(type);
      setPhase({ kind: "ready", pick });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "could not pick an ayah");
      setPhase({ kind: "selecting" });
    }
  }, []);

  function startMode(type: ChallengeType) {
    setMode(type);
    setStreak(0);
    pickNext(type);
  }

  async function handleRecording(blob: Blob) {
    if (phase.kind !== "ready" || phase.pick.challenge_type !== "recite") return;
    setPhase({ kind: "scoring", pick: phase.pick });
    setError(null);
    try {
      const r = await api.score({
        surah: phase.pick.surah,
        startAyah: phase.pick.start_ayah,
        audio: blob,
      });
      if (r.passed) setStreak((s) => s + 1); else setStreak(0);
      setPhase({ kind: "result", pick: phase.pick, result: r });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "scoring failed");
      setPhase({ kind: "ready", pick: phase.pick });
    }
  }

  function handleQuizGuess(selected: number) {
    if (phase.kind !== "ready" || phase.pick.challenge_type === "recite" || phase.pick.challenge_type === "mutashabih") return;
    const pick = phase.pick as SoloPickQuiz;
    const correctValue =
      pick.challenge_type === "guess_ayah_number"
        ? pick.correct_ayah_number
        : pick.correct_surah_number;
    const correct = selected === correctValue;
    if (correct) setStreak((s) => s + 1); else setStreak(0);
    setAnswer({ selected, correct });
  }

  function handleMutashabihGuess(selected: string) {
    if (phase.kind !== "ready" || phase.pick.challenge_type !== "mutashabih") return;
    const pick = phase.pick as SoloPickMutashabih;
    const correctKey = `${pick.correct_surah_number}:${pick.correct_ayah_number}`;
    const correct = selected === correctKey;
    if (correct) setStreak((s) => s + 1); else setStreak(0);
    setMutashabihAnswer({ selected, correct });
  }

  function nextChallenge() {
    pickNext(challengeType);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase.kind === "selecting") {
    return (
      <div className="space-y-4">
        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold px-1">
          Choose a challenge type
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CHALLENGE_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => startMode(opt.type)}
              className="bg-slate-900 border border-slate-800 hover:border-emerald-700 hover:bg-slate-800 rounded-xl p-4 text-left transition-colors group"
            >
              <div className="font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
                {opt.label}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row with mode name + streak */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => { audioRef.current?.pause(); setPhase({ kind: "selecting" }); setAnswer(null); setStreak(0); }}
          className="text-xs text-slate-500 hover:text-slate-300 uppercase tracking-widest font-bold flex items-center gap-1"
        >
          ← {CHALLENGE_OPTIONS.find((o) => o.type === challengeType)?.label ?? "Practice"}
        </button>
        {streak > 1 && (
          <span className="text-xs font-bold text-emerald-400 bg-emerald-950 border border-emerald-800 rounded-full px-2.5 py-0.5">
            {streak} streak
          </span>
        )}
      </div>

      {/* Audio controls */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        <button
          onClick={() => setAudioEnabled((v) => { saveAudioEnabled(!v); return !v; })}
          className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors ${
            audioEnabled
              ? "bg-emerald-900/50 border-emerald-700 text-emerald-400"
              : "bg-slate-800 border-slate-700 text-slate-500"
          }`}
        >
          {audioEnabled ? "Audio ON" : "Audio OFF"}
        </button>
        {audioEnabled && (
          <>
            <select
              value={reciter}
              onChange={(e) => { const v = e.target.value as ReciterId; saveReciter(v); setReciter(v); }}
              className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {RECITERS.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
            {phase.kind === "ready" && (
              <button
                onClick={playCurrentAudio}
                className="text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 transition-colors"
              >
                ▶ Replay
              </button>
            )}
          </>
        )}
      </div>

      {phase.kind === "loading" && (
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <p className="text-slate-400">Selecting a random ayah…</p>
        </section>
      )}

      {(phase.kind === "ready" || phase.kind === "scoring") && phase.pick.challenge_type === "recite" && (
        <RecitePanel
          pick={phase.pick}
          scoring={phase.kind === "scoring"}
          onComplete={handleRecording}
        />
      )}

      {phase.kind === "ready" && phase.pick.challenge_type !== "recite" && phase.pick.challenge_type !== "mutashabih" && (
        <QuizPanel
          pick={phase.pick as SoloPickQuiz}
          answer={quizAnswer}
          onGuess={handleQuizGuess}
          onNext={nextChallenge}
        />
      )}

      {phase.kind === "ready" && phase.pick.challenge_type === "mutashabih" && (
        <MutashabihPanel
          pick={phase.pick as SoloPickMutashabih}
          answer={mutashabihAnswer}
          onGuess={handleMutashabihGuess}
          onNext={nextChallenge}
        />
      )}

      {phase.kind === "result" && (
        <ReciteResultCard
          pick={phase.pick}
          result={phase.result}
          onNext={nextChallenge}
        />
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Recite mode ────────────────────────────────────────────────────────────── */

function RecitePanel({
  pick,
  scoring,
  onComplete,
}: {
  pick: SoloPick;
  scoring: boolean;
  onComplete: (blob: Blob) => void;
}) {
  if (pick.challenge_type !== "recite") return null;
  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-0.5">
            {pick.surah_name_en} · {pick.surah}:{pick.start_ayah}
          </p>
          <p className="text-sm text-slate-400">
            Recite the{" "}
            <span className="font-semibold text-emerald-400">next ayah</span>{" "}
            in full
          </p>
        </div>
        <div className="flex flex-col items-center">
          <span dir="rtl" className="font-arabic text-4xl font-bold text-emerald-400 leading-none">
            !أكمل
          </span>
          <span className="text-[10px] uppercase tracking-widest text-emerald-600 mt-0.5">continue</span>
        </div>
      </div>
      <p dir="rtl" className="quran-text text-2xl bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-100">
        {pick.start_ayah_text_uthmani}
      </p>
      <div className="max-w-sm">
        <Recorder disabled={scoring} onComplete={onComplete} />
      </div>
      {scoring && <p className="text-sm text-slate-400">Transcribing & scoring…</p>}
    </section>
  );
}

function ReciteResultCard({
  pick,
  result,
  onNext,
}: {
  pick: SoloPick;
  result: ScoreResult;
  onNext: () => void;
}) {
  if (pick.challenge_type !== "recite") return null;
  const pct = Math.round(result.accuracy * 100);
  const { label: statusLabel, cls: statusClasses } =
    result.reason === "no_speech"
      ? { label: "No speech detected", cls: "bg-amber-900/50 text-amber-300 border-amber-700" }
      : result.passed
      ? { label: "Passed", cls: "bg-emerald-900/50 text-emerald-300 border-emerald-700" }
      : { label: "Mistake detected", cls: "bg-red-900/50 text-red-300 border-red-800" };

  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-100">{statusLabel}</h2>
        <span className={`px-3 py-1 rounded-full text-lg font-bold border ${statusClasses}`}>{pct}%</span>
      </div>
      <AyahBlock label="You were asked to أكمل from" text={pick.start_ayah_text_uthmani ?? ""} sub={`${pick.surah_name_en} (${pick.surah}:${pick.start_ayah})`} />
      <AyahBlock label="Expected next ayah" text={result.target_text_uthmani} />
      <AyahBlock label="You said" text={result.transcript} placeholder="(no transcript)" />
      <button onClick={onNext} className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-500 transition-colors">
        Next challenge →
      </button>
    </section>
  );
}

/* ── Quiz mode (guess_surah / guess_ayah_number / guess_surah_number) ────────── */

function QuizPanel({
  pick,
  answer,
  onGuess,
  onNext,
}: {
  pick: SoloPickQuiz;
  answer: { selected: number; correct: boolean } | null;
  onGuess: (value: number) => void;
  onNext: () => void;
}) {
  const questionLabel =
    pick.challenge_type === "guess_surah"
      ? "Which surah is this from?"
      : pick.challenge_type === "guess_surah_number"
      ? "What is the surah number?"
      : "What is the ayah number in this surah?";

  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-5">
      {/* Ayah text */}
      {pick.challenge_type === "guess_ayah_number" && pick.quiz_surah_name_en && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          From: {pick.quiz_surah_name_en}
        </p>
      )}
      <p dir="rtl" className="quran-text text-2xl bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-100 leading-loose">
        {pick.ayah_text_uthmani}
      </p>

      {/* Question */}
      <p className="text-sm font-semibold text-slate-300">{questionLabel}</p>

      {/* Choices */}
      {pick.challenge_type === "guess_ayah_number" ? (
        <NumberChoices
          choices={pick.number_choices}
          correct={pick.correct_ayah_number}
          answer={answer}
          onGuess={onGuess}
        />
      ) : (
        <SurahChoices
          choices={pick.surah_choices}
          correct={pick.correct_surah_number}
          showNumbers={pick.challenge_type === "guess_surah_number"}
          answer={answer}
          onGuess={onGuess}
        />
      )}

      {/* Result reveal */}
      {answer && (
        <div className="space-y-3">
          <div className={`rounded-lg px-4 py-3 border text-sm font-semibold ${answer.correct ? "bg-emerald-900/50 border-emerald-700 text-emerald-300" : "bg-red-900/50 border-red-800 text-red-300"}`}>
            {answer.correct ? "Correct!" : "Wrong."}
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 space-y-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Answer</p>
            <p className="text-slate-100 font-bold">{pick.correct_surah_name_en}</p>
            <p dir="rtl" className="font-arabic text-lg text-slate-300 leading-loose">{pick.correct_surah_name_ar}</p>
            <p className="text-sm text-slate-400 pt-0.5">
              Surah <span className="font-bold text-slate-300">{pick.correct_surah_number}</span>
              {" · "}
              Ayah <span className="font-bold text-slate-300">{pick.correct_ayah_number}</span>
            </p>
          </div>
          <button onClick={onNext} className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-500 transition-colors">
            Next challenge →
          </button>
        </div>
      )}
    </section>
  );
}

function SurahChoices({
  choices,
  correct,
  showNumbers,
  answer,
  onGuess,
}: {
  choices: SurahChoice[];
  correct: number;
  showNumbers: boolean;
  answer: { selected: number; correct: boolean } | null;
  onGuess: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {choices.map((c) => {
        const isCorrect = c.surah_number === correct;
        const isSelected = answer?.selected === c.surah_number;
        let cls = "border border-slate-700 bg-slate-800 text-slate-200 hover:border-emerald-600 hover:bg-slate-700";
        if (answer) {
          if (isCorrect)       cls = "border border-emerald-500 bg-emerald-900/50 text-emerald-300";
          else if (isSelected) cls = "border border-red-500 bg-red-900/50 text-red-300";
          else                  cls = "border border-slate-700 bg-slate-800 text-slate-500 opacity-60";
        }
        return (
          <button
            key={c.surah_number}
            disabled={!!answer}
            onClick={() => onGuess(c.surah_number)}
            className={`rounded-lg px-3 py-3 text-sm font-semibold text-left transition-colors disabled:cursor-default ${cls}`}
          >
            {showNumbers ? (
              <span className="text-lg font-black">{c.surah_number}</span>
            ) : (
              <>
                <span className="block font-bold">{c.name_en}</span>
                <span dir="rtl" className="font-arabic text-base block mt-0.5 text-slate-400">{c.name_ar}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function NumberChoices({
  choices,
  correct,
  answer,
  onGuess,
}: {
  choices: number[];
  correct: number;
  answer: { selected: number; correct: boolean } | null;
  onGuess: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {choices.map((n) => {
        const isCorrect = n === correct;
        const isSelected = answer?.selected === n;
        let cls = "border border-slate-700 bg-slate-800 text-slate-200 hover:border-emerald-600 hover:bg-slate-700";
        if (answer) {
          if (isCorrect)       cls = "border border-emerald-500 bg-emerald-900/50 text-emerald-300";
          else if (isSelected) cls = "border border-red-500 bg-red-900/50 text-red-300";
          else                  cls = "border border-slate-700 bg-slate-800 text-slate-500 opacity-60";
        }
        return (
          <button
            key={n}
            disabled={!!answer}
            onClick={() => onGuess(n)}
            className={`rounded-lg px-3 py-4 text-2xl font-black text-center transition-colors disabled:cursor-default ${cls}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

/* ── Mutashabih mode ────────────────────────────────────────────────────────── */

function MutashabihPanel({
  pick,
  answer,
  onGuess,
  onNext,
}: {
  pick: SoloPickMutashabih;
  answer: { selected: string; correct: boolean } | null;
  onGuess: (key: string) => void;
  onNext: () => void;
}) {
  const correctKey = `${pick.correct_surah_number}:${pick.correct_ayah_number}`;
  const peerKey = `${pick.peer_surah_number}:${pick.peer_ayah_number}`;

  // Stable shuffle per pick.
  const options = useMemo(() => {
    const opts = [
      {
        key: correctKey,
        text: pick.ayah_text_uthmani,
        surahNum: pick.correct_surah_number,
        ayahNum: pick.correct_ayah_number,
        nameEn: pick.correct_surah_name_en,
        nameAr: pick.correct_surah_name_ar,
      },
      {
        key: peerKey,
        text: pick.peer_text_uthmani,
        surahNum: pick.peer_surah_number,
        ayahNum: pick.peer_ayah_number,
        nameEn: pick.peer_surah_name_en,
        nameAr: pick.peer_surah_name_ar,
      },
    ];
    return Math.random() < 0.5 ? opts : [opts[1], opts[0]];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick.correct_surah_number, pick.correct_ayah_number, pick.peer_surah_number, pick.peer_ayah_number]);

  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
        Mutashabihaat — similar ayahs
      </p>

      {/* Preceding ayah as context */}
      <div>
        <p className="text-xs text-slate-500 mb-1.5">This ayah was just recited:</p>
        <p dir="rtl" className="quran-text text-xl bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-300 leading-loose">
          {pick.preceding_ayah_text_uthmani}
        </p>
      </div>

      <p className="text-sm font-semibold text-slate-200">
        Which of these two similar ayahs comes next?
      </p>

      {/* Two options — surah info hidden until after answer */}
      <div className="space-y-2">
        {options.map((opt) => {
          const isCorrect = opt.key === correctKey;
          const isSelected = answer?.selected === opt.key;
          let cls = "border border-slate-700 bg-slate-800 hover:border-emerald-600 hover:bg-slate-700/80";
          if (answer) {
            if (isCorrect)       cls = "border-2 border-emerald-500 bg-emerald-900/40";
            else if (isSelected) cls = "border-2 border-red-500 bg-red-900/40";
            else                  cls = "border border-slate-700 bg-slate-800 opacity-40";
          }
          return (
            <button
              key={opt.key}
              disabled={!!answer}
              onClick={() => onGuess(opt.key)}
              className={`w-full rounded-xl p-4 text-left transition-colors disabled:cursor-default ${cls}`}
            >
              {/* Reveal full info only after answering */}
              {answer && (
                <div className="mb-2 pb-2 border-b border-slate-600/50">
                  <span className="text-sm font-bold text-slate-200 block">{opt.nameEn}</span>
                  <span dir="rtl" className="font-arabic text-base text-slate-400 block leading-loose">{opt.nameAr}</span>
                  <span className="text-xs text-slate-500">
                    Surah <span className="font-bold text-slate-400">{opt.surahNum}</span>
                    {" · "}
                    Ayah <span className="font-bold text-slate-400">{opt.ayahNum}</span>
                  </span>
                </div>
              )}
              <p dir="rtl" className="quran-text text-xl text-slate-100 leading-loose">
                {opt.text}
              </p>
            </button>
          );
        })}
      </div>

      {answer && (
        <div className="space-y-3">
          <div className={`rounded-lg px-4 py-3 border text-sm font-semibold ${answer.correct ? "bg-emerald-900/50 border-emerald-700 text-emerald-300" : "bg-red-900/50 border-red-800 text-red-300"}`}>
            {answer.correct ? "Correct!" : "Wrong."}
          </div>
          <button onClick={onNext} className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-500 transition-colors">
            Next challenge →
          </button>
        </div>
      )}
    </section>
  );
}

/* ── Shared ─────────────────────────────────────────────────────────────────── */

function AyahBlock({ label, text, sub, placeholder }: { label: string; text: string; sub?: string; placeholder?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <p dir="rtl" className="quran-text text-2xl bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-100">
        {text || (placeholder && <span dir="ltr" className="text-slate-500 font-sans text-base">{placeholder}</span>)}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

/* ── Private match section ──────────────────────────────────────────── */

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
    navigator.clipboard.writeText(`${window.location.origin}${invite.url}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <h2 className="text-lg font-bold text-slate-100 uppercase tracking-wide mb-3">
        Challenge a friend
      </h2>
      {!invite ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Create a private link and share it. The first person to accept becomes your opponent.
          </p>
          <button
            onClick={create}
            disabled={creating}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg px-4 py-2 font-semibold disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating…" : `Create private link (${roundCount} rounds)`}
          </button>
          {error && (
            <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
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
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-300 font-mono"
            />
            <button
              onClick={copyLink}
              className="bg-emerald-600 text-white rounded px-3 py-2 text-sm font-semibold hover:bg-emerald-500"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Waiting for your friend to accept — you'll be redirected automatically.
          </p>
          <button onClick={cancel} className="text-sm text-slate-500 hover:text-slate-300 underline">
            Cancel invite
          </button>
        </div>
      )}
    </section>
  );
}
