"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { QuranPageViewer } from "@/components/QuranPageViewer";
import { Recorder } from "@/components/Recorder";
import { ApiError, api, getToken } from "@/lib/api";
import type { ScoreResult, SurahMeta } from "@/lib/types";

export default function SoloPage() {
  const router = useRouter();
  const [surahs, setSurahs] = useState<SurahMeta[] | null>(null);
  const [surah, setSurah] = useState<number | null>(null);
  const [ayah, setAyah] = useState<number | null>(null);
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .surahs()
      .then(setSurahs)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "failed to load surahs"),
      );
  }, [router]);

  async function handleRecording(blob: Blob) {
    if (surah === null || ayah === null) return;
    setScoring(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.score({ surah, startAyah: ayah, audio: blob });
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "scoring failed");
    } finally {
      setScoring(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  if (!surahs) {
    return <p className="p-6 text-slate-600">Loading surahs…</p>;
  }

  const currentSurah = surah !== null ? surahs.find((s) => s.id === surah) : null;
  const ready = surah !== null && ayah !== null && !scoring && !result;

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-6">
        <Link
          href="/lobby"
          className="text-sm text-slate-700 hover:text-slate-900 underline"
        >
          ← Back to lobby
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Solo practice</h1>
      </header>

      {!result && (
        <>
          <QuranPageViewer
            surahs={surahs}
            surah={surah}
            ayah={ayah}
            onChange={({ surah: s, ayah: a }) => {
              setSurah(s);
              setAyah(a);
              setError(null);
            }}
          />

          <section className="mt-6 bg-white rounded-lg shadow-sm border border-slate-200 p-5">
            <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
              <div className="flex-1">
                <h2 className="font-semibold text-slate-900">
                  Recite the next ayat
                </h2>
                {surah !== null && ayah !== null && currentSurah ? (
                  <p className="text-sm text-slate-700 mt-1">
                    Picked{" "}
                    <span className="font-medium text-emerald-800">
                      {currentSurah.name_en} {surah}:{ayah}
                    </span>
                    . Continue from ayah {ayah + 1} (up to ~15s).
                  </p>
                ) : (
                  <p className="text-sm text-slate-600 mt-1">
                    Pick a starting ayah from the page viewer above.
                  </p>
                )}
              </div>
              <div className="w-full md:w-64">
                <Recorder
                  maxSeconds={15}
                  disabled={!ready}
                  onComplete={handleRecording}
                />
              </div>
            </div>
            {scoring && (
              <p className="text-sm text-slate-600 mt-3">Transcribing…</p>
            )}
            {error && (
              <p className="text-sm text-red-700 mt-3 font-medium">{error}</p>
            )}
          </section>
        </>
      )}

      {result && <ResultCard result={result} onReset={reset} />}
    </main>
  );
}

function ResultCard({
  result,
  onReset,
}: {
  result: ScoreResult;
  onReset: () => void;
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
    statusLabel = "Failed";
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Word accuracy" value={`${Math.round(result.word_accuracy * 100)}%`} />
        <Stat label="Char accuracy" value={`${Math.round(result.char_accuracy * 100)}%`} />
        <Stat label="Audio duration" value={`${result.duration_s}s`} />
        <Stat label="Inference" value={`${result.inference_s}s`} />
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Expected
        </p>
        <p
          dir="rtl"
          className="quran-text text-2xl bg-slate-50 rounded-lg p-4 border border-slate-200"
        >
          {result.target_text_uthmani}
        </p>
        <p className="text-xs text-slate-500 mt-1.5">
          Ayat:{" "}
          {result.ayat_used.map((a) => `${a.surah}:${a.number}`).join(", ")}
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
            <span className="text-slate-400" dir="ltr">
              (no transcript)
            </span>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-700 transition-colors"
      >
        Try another
      </button>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded border border-slate-200 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}
