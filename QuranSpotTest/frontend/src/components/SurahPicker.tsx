"use client";

import { useMemo, useState } from "react";

import type { SurahMeta } from "@/lib/types";

type Props = {
  surahs: SurahMeta[];
  /** Currently-selected surah ids. */
  value: number[];
  onChange: (next: number[]) => void;
};

export function SurahPicker({ surahs, value, onChange }: Props) {
  const [search, setSearch] = useState("");
  const set = new Set(value);

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

  const toggle = (id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
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
        className="w-full px-3 py-2 rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
      />
      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded bg-white">
        <ul className="divide-y divide-slate-100">
          {filtered.map((s) => {
            const on = set.has(s.id);
            return (
              <li key={s.id}>
                <label className="flex items-center px-3 py-1.5 cursor-pointer hover:bg-emerald-50">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(s.id)}
                    className="h-4 w-4 accent-emerald-600 mr-3"
                  />
                  <span className="flex-1 flex items-baseline justify-between gap-2 text-sm">
                    <span>
                      <span className="text-xs text-slate-500 mr-1.5">
                        {s.id}.
                      </span>
                      <span className={on ? "font-semibold text-emerald-900" : "text-slate-800"}>
                        {s.name_en}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span dir="rtl" className="font-arabic text-base text-slate-700">
                        {s.name_ar}
                      </span>
                      <span className="text-xs text-slate-500 w-8 text-right">
                        {s.ayat_count}
                      </span>
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
          className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() =>
            all(surahs.filter((s) => s.id >= 78).map((s) => s.id))
          }
          className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
        >
          All of Juz Amma (78–114)
        </button>
        <button
          type="button"
          onClick={() => all([1])}
          className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
        >
          Al-Fatihah
        </button>
        <span className="px-2 py-1 ml-auto text-slate-700">
          {value.length} surah{value.length === 1 ? "" : "s"} selected
        </span>
      </div>
    </div>
  );
}
