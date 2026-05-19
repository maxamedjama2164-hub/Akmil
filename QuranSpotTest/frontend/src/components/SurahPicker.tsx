"use client";

import { useMemo, useState } from "react";

import type { SurahMeta } from "@/lib/types";

type CoverageState = "full" | "partial" | "none";

type Props = {
  surahs: SurahMeta[];
  value: number[];
  onChange: (next: number[]) => void;
  /** Which whole juz are already selected — used to show coverage badges. */
  memorizedJuz?: number[];
};

function juzCoverage(surah: SurahMeta, juzSet: Set<number>): CoverageState {
  if (juzSet.size === 0) return "none";
  // Check every juz the surah spans
  let coveredCount = 0;
  const span = surah.juz_max - surah.juz_min + 1;
  for (let j = surah.juz_min; j <= surah.juz_max; j++) {
    if (juzSet.has(j)) coveredCount++;
  }
  if (coveredCount === 0) return "none";
  if (coveredCount === span) return "full";
  return "partial";
}

export function SurahPicker({ surahs, value, onChange, memorizedJuz = [] }: Props) {
  const [search, setSearch] = useState("");
  const selectedSet = new Set(value);
  const juzSet = new Set(memorizedJuz);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return surahs;
    return surahs.filter(
      (s) =>
        s.name_en.toLowerCase().includes(q) ||
        s.name_ar.includes(search) ||
        String(s.id) === q,
    );
  }, [surahs, search]);

  const toggle = (surah: SurahMeta) => {
    const coverage = juzCoverage(surah, juzSet);
    // Fully covered by a selected juz — clicking would add nothing, so ignore.
    if (coverage === "full") return;
    const next = new Set(selectedSet);
    if (next.has(surah.id)) next.delete(surah.id);
    else next.add(surah.id);
    onChange([...next].sort((a, b) => a - b));
  };

  const all = (ids: number[]) => onChange([...ids].sort((a, b) => a - b));

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search surah…"
        className="w-full px-3 py-2 rounded border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
      />
      <div className="max-h-64 overflow-y-auto border border-slate-700 rounded bg-slate-800">
        <ul className="divide-y divide-slate-700">
          {filtered.map((s) => {
            const coverage = juzCoverage(s, juzSet);
            const checked = selectedSet.has(s.id) || coverage === "full";
            const locked = coverage === "full";

            return (
              <li key={s.id}>
                <label
                  className={`flex items-center px-3 py-1.5 gap-3 ${locked ? "cursor-default opacity-60" : "cursor-pointer hover:bg-slate-700"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggle(s)}
                    className="h-4 w-4 accent-emerald-500 shrink-0"
                  />
                  <span className="flex-1 flex items-baseline justify-between gap-2 text-sm min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-slate-500 shrink-0">{s.id}.</span>
                      <span className={`truncate ${checked ? "font-semibold text-emerald-300" : "text-slate-200"}`}>
                        {s.name_en}
                      </span>
                      {coverage === "full" && (
                        <span className="text-[10px] bg-emerald-900 text-emerald-400 border border-emerald-700 rounded px-1 shrink-0">
                          juz {s.juz_min === s.juz_max ? s.juz_min : `${s.juz_min}–${s.juz_max}`}
                        </span>
                      )}
                      {coverage === "partial" && (
                        <span className="text-[10px] bg-amber-900/60 text-amber-400 border border-amber-700 rounded px-1 shrink-0">
                          partial
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span dir="rtl" className="font-arabic text-base text-slate-400">{s.name_ar}</span>
                      <span className="text-xs text-slate-500 w-8 text-right">{s.ayat_count}</span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-3 text-sm text-slate-500">
              No surahs match &ldquo;{search}&rdquo;
            </li>
          )}
        </ul>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => all([])}
          className="px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-700"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => all(surahs.filter((s) => s.id >= 78).map((s) => s.id))}
          className="px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-700"
        >
          All of Juz Amma (78–114)
        </button>
        <button
          type="button"
          onClick={() => all([1])}
          className="px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-700"
        >
          Al-Fatihah
        </button>
        <span className="px-2 py-1 ml-auto text-slate-500">
          {value.length} surah{value.length === 1 ? "" : "s"} selected
        </span>
      </div>
    </div>
  );
}
