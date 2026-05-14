"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api } from "@/lib/api";
import type { AyahMeta, SurahMeta } from "@/lib/types";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      return;
    }
    setLoading(true);
    setError(null);
    api
      .surah(surah)
      .then((d) => setAyat(d.ayat))
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "failed to load ayat"),
      )
      .finally(() => setLoading(false));
  }, [surah]);

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
                      </span>{" "}
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
