"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api } from "@/lib/api";
import type { AyahMeta, AyahStatus, SurahMeta, SurahSimilarity, VerseInfo } from "@/lib/types";

type Props = {
  surahs: SurahMeta[];
  surah: number | null;
  ayah: number | null;
  onChange: (next: { surah: number | null; ayah: number | null }) => void;
  /** If either filter is set, the picker view restricts selection to the
   * union of allowedJuz' juz-coverage and allowedSurahs' surah-membership.
   * Surahs that don't intersect either are hidden from the surah list. */
  allowedJuz?: number[];
  allowedSurahs?: number[];
};

function toArabicNumerals(n: number): string {
  return n
    .toString()
    .replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

export function QuranPageViewer({
  surahs,
  surah,
  ayah,
  onChange,
  allowedJuz,
  allowedSurahs,
}: Props) {
  const [search, setSearch] = useState("");
  const [ayat, setAyat] = useState<AyahMeta[]>([]);
  const [similarity, setSimilarity] = useState<SurahSimilarity>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoAyah, setInfoAyah] = useState<{ surah: number; number: number } | null>(null);
  const [verseInfo, setVerseInfo] = useState<VerseInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const selectedRef = useRef<HTMLSpanElement | null>(null);
  const surahButtonRef = useRef<HTMLButtonElement | null>(null);

  const juzSet = useMemo(
    () => (allowedJuz && allowedJuz.length ? new Set(allowedJuz) : null),
    [allowedJuz],
  );
  const surahSet = useMemo(
    () =>
      allowedSurahs && allowedSurahs.length ? new Set(allowedSurahs) : null,
    [allowedSurahs],
  );
  const hasFilter = juzSet !== null || surahSet !== null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = surahs;
    if (hasFilter) {
      result = result.filter((s) => {
        if (surahSet?.has(s.id)) return true;
        if (juzSet) {
          for (let j = s.juz_min; j <= s.juz_max; j++) {
            if (juzSet.has(j)) return true;
          }
        }
        return false;
      });
    }
    if (!q) return result;
    return result.filter(
      (s) =>
        s.name_en.toLowerCase().includes(q) ||
        s.name_ar.includes(search) ||
        String(s.id) === q,
    );
  }, [surahs, search, juzSet, surahSet, hasFilter]);

  const currentSurah = useMemo(
    () => (surah !== null ? surahs.find((s) => s.id === surah) : null),
    [surahs, surah],
  );

  useEffect(() => {
    if (surah === null) {
      setAyat([]);
      setSimilarity({});
      return;
    }
    setLoading(true);
    setError(null);
    setInfoAyah(null);
    setVerseInfo(null);
    Promise.all([
      api.surah(surah),
      api.surahSimilarity(surah).catch(() => ({} as SurahSimilarity)),
    ])
      .then(([detail, sim]) => {
        setAyat(detail.ayat);
        setSimilarity(sim);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "failed to load ayat"),
      )
      .finally(() => setLoading(false));
  }, [surah]);

  function handleInfoClick(e: React.MouseEvent, s: number, n: number) {
    e.stopPropagation();
    if (infoAyah?.surah === s && infoAyah?.number === n) {
      setInfoAyah(null);
      setVerseInfo(null);
      return;
    }
    setInfoAyah({ surah: s, number: n });
    setVerseInfo(null);
    setInfoLoading(true);
    api.verseInfo(s, n).then(setVerseInfo).finally(() => setInfoLoading(false));
  }

  useEffect(() => {
    if (ayah !== null && selectedRef.current) {
      selectedRef.current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [ayah, ayat]);

  useEffect(() => {
    if (surah !== null && surahButtonRef.current) {
      surahButtonRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [surah]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[70vh] min-h-[480px]">
      {/* ─── Surah index ─────────────────────────────────────────── */}
      <aside className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search surah…"
            className="w-full px-3 py-2 rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtered.map((s) => {
            const active = s.id === surah;
            return (
              <li key={s.id}>
                <button
                  ref={active ? surahButtonRef : null}
                  type="button"
                  onClick={() => onChange({ surah: s.id, ayah: null })}
                  className={`w-full text-left px-3 py-2.5 border-l-4 transition-colors flex items-center justify-between ${
                    active
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                      : "border-transparent hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`text-xs ${active ? "text-emerald-700" : "text-slate-500"}`}
                    >
                      {s.id}.
                    </span>
                    <span className={active ? "font-semibold" : ""}>
                      {s.name_en}
                    </span>
                  </span>
                  <span
                    dir="rtl"
                    className="font-arabic text-lg text-slate-700"
                  >
                    {s.name_ar}
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-sm text-slate-500">
              No surahs match &ldquo;{search}&rdquo;
            </li>
          )}
        </ul>
      </aside>

      {/* ─── Reading panel ───────────────────────────────────────── */}
      <section className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        {currentSurah ? (
          <>
            <header className="px-5 py-4 border-b border-slate-200 flex items-baseline justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {currentSurah.name_en}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Juz&nbsp;
                  {currentSurah.juz_min === currentSurah.juz_max
                    ? currentSurah.juz_min
                    : `${currentSurah.juz_min}–${currentSurah.juz_max}`}
                  {" · "}
                  {currentSurah.ayat_count} ayat
                </p>
              </div>
              <span
                dir="rtl"
                className="font-arabic text-3xl text-slate-800"
              >
                {currentSurah.name_ar}
              </span>
            </header>

            {/* Legend — only shown when the surah has marked ayat */}
            {(Object.values(similarity).includes("repeated") || Object.values(similarity).includes("similar")) && (
              <div className="px-5 py-2 border-b border-slate-100 flex flex-wrap gap-3 text-xs text-slate-600">
                {Object.values(similarity).includes("repeated") && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-red-200 ring-1 ring-red-400" />
                    Repeated verbatim elsewhere
                  </span>
                )}
                {Object.values(similarity).includes("similar") && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-orange-200 ring-1 ring-orange-400" />
                    Very similar to another ayah
                  </span>
                )}
              </div>
            )}

            {/* Verse info panel — Quran Foundation API translation */}
            {infoAyah && (
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 text-sm">
                {infoLoading && <p className="text-slate-400">Loading translation…</p>}
                {!infoLoading && verseInfo && !verseInfo.error && (
                  <div className="space-y-1">
                    <p className="text-slate-700 leading-relaxed">{verseInfo.translation_en}</p>
                    <p className="text-xs text-slate-400 flex gap-3">
                      {verseInfo.page_number != null && <span>Page {verseInfo.page_number}</span>}
                      {verseInfo.hizb_number != null && <span>Hizb {verseInfo.hizb_number}</span>}
                      {verseInfo.sajdah_type && <span className="text-indigo-500">Sajdah ({verseInfo.sajdah_type})</span>}
                      <span className="text-slate-300">· Saheeh International</span>
                    </p>
                  </div>
                )}
                {!infoLoading && verseInfo?.error && (
                  <p className="text-red-500 text-xs">Could not load translation</p>
                )}
              </div>
            )}

            <div
              dir="rtl"
              className="quran-text flex-1 overflow-y-auto px-6 py-5 text-2xl text-slate-900"
            >
              {loading && (
                <p
                  dir="ltr"
                  className="text-base text-slate-500 font-sans"
                >
                  Loading ayat…
                </p>
              )}
              {error && (
                <p dir="ltr" className="text-base text-red-600 font-sans">
                  {error}
                </p>
              )}
              {!loading &&
                !error &&
                ayat.map((a) => {
                  const active = a.number === ayah;
                  const allowedHere =
                    !hasFilter ||
                    (surahSet?.has(surah ?? -1) ?? false) ||
                    (juzSet?.has(a.juz) ?? false);
                  const status = similarity[String(a.number)] as AyahStatus | undefined;
                  const infoOpen = infoAyah?.surah === surah && infoAyah?.number === a.number;
                  const handlePick = () => {
                    if (allowedHere) onChange({ surah, ayah: a.number });
                  };
                  return (
                    <span key={a.number}>
                      <span
                        ref={active ? selectedRef : null}
                        role={allowedHere ? "button" : undefined}
                        tabIndex={allowedHere ? 0 : -1}
                        onClick={handlePick}
                        onKeyDown={(e) => {
                          if (
                            allowedHere &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
                            e.preventDefault();
                            handlePick();
                          }
                        }}
                        className={`rounded px-1 transition-colors ${
                          !allowedHere
                            ? "text-slate-400 cursor-not-allowed"
                            : active
                              ? "bg-emerald-200 text-emerald-950 ring-2 ring-emerald-500 ring-offset-1 cursor-pointer"
                              : status === "repeated"
                                ? "bg-red-100 text-red-900 ring-1 ring-red-300 cursor-pointer hover:bg-red-200"
                                : status === "similar"
                                  ? "bg-orange-100 text-orange-900 ring-1 ring-orange-300 cursor-pointer hover:bg-orange-200"
                                  : "hover:bg-emerald-50 cursor-pointer"
                        }`}
                      >
                        {a.text_uthmani}
                      </span>
                      <span
                        onClick={handlePick}
                        className={`inline-flex items-center justify-center mx-1 select-none text-base ${
                          !allowedHere
                            ? "text-slate-400"
                            : active
                              ? "text-emerald-800 font-semibold cursor-pointer"
                              : "text-emerald-700 hover:text-emerald-900 cursor-pointer"
                        }`}
                        title={
                          allowedHere
                            ? `Ayah ${a.number}`
                            : `Ayah ${a.number} is outside the reciter's memorized set`
                        }
                      >
                        ﴿{toArabicNumerals(a.number)}﴾
                      </span>
                      {allowedHere && (
                        <button
                          dir="ltr"
                          type="button"
                          onClick={(e) => handleInfoClick(e, surah!, a.number)}
                          className={`inline-flex items-center justify-center text-xs w-4 h-4 rounded-full mr-1 transition-colors align-middle ${
                            infoOpen
                              ? "bg-slate-600 text-white"
                              : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                          }`}
                          title="Show English translation"
                        >
                          i
                        </button>
                      )}{" "}
                    </span>
                  );
                })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Choose a surah from the list to begin reading.
          </div>
        )}
      </section>
    </div>
  );
}
