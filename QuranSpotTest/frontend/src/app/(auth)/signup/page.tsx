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
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api.surahs().then(setSurahs).catch(() => {
      /* signup still works without surah list */
    });
  }, []);

  // Live coverage readout: ask the server (the source of truth) so we don't
  // have to replicate the union-de-dup math in the browser. Debounced via
  // a small delay so rapid clicks don't spam the endpoint.
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
        className="w-full max-w-2xl bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-5"
      >
        <h1 className="text-2xl font-bold text-slate-900">
          Create your account
        </h1>

        <label className="block">
          <span className="text-sm font-medium text-slate-800">Display name</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            autoComplete="nickname"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              autoComplete="new-password"
            />
            <span className="text-xs text-slate-600">At least 8 characters.</span>
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800">
            What have you memorized?
          </p>
          <p className="text-xs text-slate-600 -mt-2">
            Opponents will only test you on the juz&apos; and surahs you select.
          </p>

          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
              Whole juz&apos;
            </p>
            <JuzPicker value={memorizedJuz} onChange={setMemorizedJuz} />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
              Individual surahs (optional)
            </p>
            {surahs.length === 0 ? (
              <p className="text-sm text-slate-500">Loading surahs…</p>
            ) : (
              <SurahPicker
                surahs={surahs}
                value={memorizedSurahs}
                onChange={setMemorizedSurahs}
              />
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-800">
              Memorized:{" "}
              <span className="font-semibold">
                {coverage?.memorized_ayat_count ?? 0}
              </span>{" "}
              ayat
            </span>
            <span className="text-slate-800">
              Roughly{" "}
              <span className="font-semibold text-emerald-800">
                {coverage?.juz_equivalent?.toFixed?.(1) ?? "0.0"}
              </span>{" "}
              of 30 juz&apos;
            </span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating account…" : "Sign up"}
        </button>
        <p className="text-sm text-slate-700 text-center">
          Already have one?{" "}
          <Link
            href="/login"
            className="text-emerald-700 hover:text-emerald-900 underline font-medium"
          >
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
