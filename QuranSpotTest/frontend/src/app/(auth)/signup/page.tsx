"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { JuzPicker } from "@/components/JuzPicker";
import { SurahPicker } from "@/components/SurahPicker";
import { ApiError, api, setToken } from "@/lib/api";
import type { CoverageResponse, SurahMeta } from "@/lib/types";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [memorizedJuz, setMemorizedJuz] = useState<number[]>([]);
  const [memorizedSurahs, setMemorizedSurahs] = useState<number[]>([]);
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [surahsStatus, setSurahsStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api.surahs()
      .then((s) => { setSurahs(s); setSurahsStatus("ready"); })
      .catch(() => setSurahsStatus("failed"));
  }, []);

  useEffect(() => {
    if (memorizedJuz.length === 0 && memorizedSurahs.length === 0) {
      setCoverage({ memorized_ayat_count: 0, juz_equivalent: 0 });
      return;
    }
    const t = window.setTimeout(() => {
      api
        .coverage({
          memorized_juz: memorizedJuz,
          memorized_surahs: memorizedSurahs,
        })
        .then(setCoverage)
        .catch(() => {
          /* keep the previous reading on transient failures */
        });
    }, 150);
    return () => window.clearTimeout(t);
  }, [memorizedJuz, memorizedSurahs]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (memorizedJuz.length === 0 && memorizedSurahs.length === 0) {
      setError("Select at least one juz' or surah you've memorized");
      return;
    }
    setPending(true);
    try {
      const res = await api.signup({
        email,
        password,
        display_name: displayName,
        memorized_juz: memorizedJuz,
        memorized_surahs: memorizedSurahs,
      });
      setToken(res.token);
      router.replace("/lobby");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Signup failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-5"
      >
        <h1 className="text-2xl font-black text-slate-100 uppercase tracking-wide">
          Create your account
        </h1>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">Display name</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            autoComplete="nickname"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              autoComplete="new-password"
            />
            <span className="text-xs text-slate-500">At least 8 characters.</span>
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">
            What have you memorized?
          </p>
          <p className="text-xs text-slate-500 -mt-2">
            Opponents will only test you on the juz&apos; and surahs you select.
          </p>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Whole juz&apos;
            </p>
            <JuzPicker value={memorizedJuz} onChange={setMemorizedJuz} />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Individual surahs (optional)
            </p>
            {surahsStatus === "loading" ? (
              <p className="text-sm text-slate-500">Loading surahs…</p>
            ) : surahsStatus === "failed" ? (
              <p className="text-sm text-slate-500">
                Server unreachable — select juz&apos; above for now. You can add individual surahs from your profile after signing up.
              </p>
            ) : (
              <SurahPicker
                surahs={surahs}
                value={memorizedSurahs}
                onChange={setMemorizedSurahs}
              />
            )}
          </div>

          <div className="bg-emerald-950 border border-emerald-800 rounded px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-300">
              Memorized:{" "}
              <span className="font-semibold text-emerald-400">
                {coverage?.memorized_ayat_count ?? 0}
              </span>{" "}
              ayat
            </span>
            <span className="text-slate-300">
              Roughly{" "}
              <span className="font-semibold text-emerald-400">
                {coverage?.juz_equivalent?.toFixed?.(1) ?? "0.0"}
              </span>{" "}
              of 30 juz&apos;
            </span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating account…" : "Join the arena"}
        </button>
        <p className="text-sm text-slate-500 text-center">
          Already have one?{" "}
          <Link
            href="/login"
            className="text-emerald-400 hover:text-emerald-300 underline font-medium"
          >
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
