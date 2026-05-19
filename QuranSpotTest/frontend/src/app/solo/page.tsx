"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { NavBar } from "@/components/NavBar";
import { Recorder } from "@/components/Recorder";
import { ApiError, api, getToken } from "@/lib/api";
import type { ScoreResult, SoloPick, User } from "@/lib/types";

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; pick: SoloPick }
  | { kind: "scoring"; pick: SoloPick }
  | { kind: "result"; pick: SoloPick; result: ScoreResult };

export default function SoloPage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);

  const pickNext = useCallback(async () => {
    setError(null);
    setPhase({ kind: "loading" });
    try {
      const pick = await api.soloPick("recite");
      setPhase({ kind: "ready", pick });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "could not pick an ayah");
      setPhase({ kind: "loading" });
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .me()
      .then((u) => {
        setMe(u);
        pickNext();
      })
      .catch(() => router.replace("/login"));
  }, [router, pickNext]);

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
      setPhase({ kind: "result", pick: phase.pick, result: r });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "scoring failed");
      setPhase({ kind: "ready", pick: phase.pick });
    }
  }

  if (!me) return (
    <>
      <NavBar />
      <p className="p-6 text-slate-400">Loading…</p>
    </>
  );

  return (
    <>
      <NavBar />
      <main className="max-w-3xl mx-auto p-4 md:p-6">
        {phase.kind === "loading" && (
          <p className="text-slate-400">Selecting a random ayah from your memorized set…</p>
        )}

        {(phase.kind === "ready" || phase.kind === "scoring") && (
          <PromptPanel
            pick={phase.pick}
            scoring={phase.kind === "scoring"}
            onComplete={handleRecording}
          />
        )}

        {phase.kind === "result" && (
          <ResultCard
            pick={phase.pick}
            result={phase.result}
            onNext={pickNext}
          />
        )}

        {error && (
          <p className="mt-4 text-sm text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
            {error}
          </p>
        )}
      </main>
    </>
  );
}

function PromptPanel({
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
          <span
            dir="rtl"
            className="font-arabic text-4xl font-bold text-emerald-400 leading-none"
          >
            !أكمل
          </span>
          <span className="text-[10px] uppercase tracking-widest text-emerald-600 mt-0.5">
            continue
          </span>
        </div>
      </div>

      <p
        dir="rtl"
        className="quran-text text-2xl bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-100"
      >
        {pick.start_ayah_text_uthmani}
      </p>

      <div className="max-w-sm">
        <Recorder disabled={scoring} onComplete={onComplete} />
      </div>
      {scoring && (
        <p className="text-sm text-slate-400">Transcribing & scoring…</p>
      )}
    </section>
  );
}

function ResultCard({
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
  let statusLabel: string;
  let statusClasses: string;
  if (result.reason === "no_speech") {
    statusLabel = "No speech detected";
    statusClasses = "bg-amber-900/50 text-amber-300 border-amber-700";
  } else if (result.passed) {
    statusLabel = "Passed";
    statusClasses = "bg-emerald-900/50 text-emerald-300 border-emerald-700";
  } else {
    statusLabel = "Mistake detected";
    statusClasses = "bg-red-900/50 text-red-300 border-red-800";
  }

  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-100">{statusLabel}</h2>
        <span className={`px-3 py-1 rounded-full text-lg font-bold border ${statusClasses}`}>
          {pct}%
        </span>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          You were asked to أكمل from
        </p>
        <p dir="rtl" className="quran-text text-2xl bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-100">
          {pick.start_ayah_text_uthmani}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {pick.surah_name_en} ({pick.surah}:{pick.start_ayah})
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Expected next ayah
        </p>
        <p dir="rtl" className="quran-text text-2xl bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-100">
          {result.target_text_uthmani}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          You said
        </p>
        <p dir="rtl" className="quran-text text-2xl bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-100">
          {result.transcript || (
            <span dir="ltr" className="text-slate-500 font-sans text-base">
              (no transcript)
            </span>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-500 transition-colors"
      >
        Next challenge →
      </button>
    </section>
  );
}
