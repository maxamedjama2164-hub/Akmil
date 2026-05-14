"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
      const pick = await api.soloPick();
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
    if (phase.kind !== "ready") return;
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

  if (!me) return <p className="p-6 text-slate-600">Loading…</p>;

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto">
      <header className="flex justify-between items-center mb-6">
        <Link
          href="/lobby"
          className="text-sm text-slate-700 hover:text-slate-900 underline"
        >
          ← Back to lobby
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Solo practice</h1>
      </header>

      {phase.kind === "loading" && (
        <p className="text-slate-600">Picking a random ayah from your memorized set…</p>
      )}

      {(phase.kind === "ready" || phase.kind === "scoring") && (
        <PrompPanel
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
        <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </main>
  );
}

function PrompPanel({
  pick,
  scoring,
  onComplete,
}: {
  pick: SoloPick;
  scoring: boolean;
  onComplete: (blob: Blob) => void;
}) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          {pick.surah_name_en} ({pick.surah}:{pick.start_ayah})
        </p>
        <p
          dir="rtl"
          className="quran-text text-2xl bg-slate-50 rounded-lg p-4 border border-slate-200"
        >
          {pick.start_ayah_text_uthmani}
        </p>
        <p className="text-sm text-slate-700 mt-3">
          Recite{" "}
          <span className="font-semibold text-emerald-800">
            the next ayah ({pick.surah}:{pick.start_ayah + 1})
          </span>{" "}
          in full — up to 15 seconds.
        </p>
      </div>
      <div className="max-w-sm">
        <Recorder maxSeconds={15} disabled={scoring} onComplete={onComplete} />
      </div>
      {scoring && (
        <p className="text-sm text-slate-600">Transcribing & scoring…</p>
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
  const pct = Math.round(result.accuracy * 100);
  let statusLabel: string;
  let statusClasses: string;
  if (result.reason === "no_speech") {
    statusLabel = "No speech detected";
    statusClasses = "bg-amber-100 text-amber-900 border-amber-300";
  } else if (result.passed) {
    statusLabel = "Passed";
    statusClasses = "bg-emerald-100 text-emerald-900 border-emerald-300";
  } else {
    statusLabel = "Mistake detected";
    statusClasses = "bg-red-100 text-red-900 border-red-300";
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">{statusLabel}</h2>
        <span
          className={`px-3 py-1 rounded-full text-lg font-bold border ${statusClasses}`}
        >
          {pct}%
        </span>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          You were asked to continue from
        </p>
        <p
          dir="rtl"
          className="quran-text text-2xl bg-slate-50 rounded-lg p-4 border border-slate-200"
        >
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
        <p
          dir="rtl"
          className="quran-text text-2xl bg-slate-50 rounded-lg p-4 border border-slate-200"
        >
          {result.target_text_uthmani}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          You said
        </p>
        <p
          dir="rtl"
          className="quran-text text-2xl bg-slate-50 rounded-lg p-4 border border-slate-200"
        >
          {result.transcript || (
            <span dir="ltr" className="text-slate-400 font-sans text-base">
              (no transcript)
            </span>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-700 transition-colors"
      >
        Try another ayah
      </button>
    </section>
  );
}
