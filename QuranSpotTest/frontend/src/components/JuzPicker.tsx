"use client";

import { prettyTier, tierForCount } from "@/lib/types";

type Props = {
  /** Currently-selected juz numbers (1..30). */
  value: number[];
  onChange: (next: number[]) => void;
};

export function JuzPicker({ value, onChange }: Props) {
  const set = new Set(value);

  const toggle = (j: number) => {
    const next = new Set(set);
    if (next.has(j)) next.delete(j);
    else next.add(j);
    onChange([...next].sort((a, b) => a - b));
  };

  const all = (juz: number[]) => onChange([...juz].sort((a, b) => a - b));

  const tier = tierForCount(value.length);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => {
          const on = set.has(j);
          return (
            <button
              key={j}
              type="button"
              onClick={() => toggle(j)}
              className={`py-2 rounded text-sm font-medium border transition-colors ${
                on
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-white text-slate-700 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50"
              }`}
            >
              {j}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <QuickButton
          label="None"
          onClick={() => all([])}
        />
        <QuickButton
          label="Juz 30 (Amma)"
          onClick={() => all([30])}
        />
        <QuickButton
          label="Last 5"
          onClick={() => all([26, 27, 28, 29, 30])}
        />
        <QuickButton
          label="All 30"
          onClick={() => all(Array.from({ length: 30 }, (_, i) => i + 1))}
        />
      </div>

      <div className="flex items-center justify-between text-sm bg-slate-50 border border-slate-200 rounded px-3 py-2">
        <span className="text-slate-700">
          <span className="font-semibold text-slate-900">{value.length}</span>{" "}
          juz selected
        </span>
        <span className="text-slate-700">
          Queue tier:{" "}
          <span className="font-semibold text-emerald-800">
            {prettyTier(tier)}
          </span>
        </span>
      </div>
    </div>
  );
}

function QuickButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
    >
      {label}
    </button>
  );
}
