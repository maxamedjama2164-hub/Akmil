"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { JuzPicker } from "@/components/JuzPicker";
import { ApiError, api, setToken } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [memorizedJuz, setMemorizedJuz] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (memorizedJuz.length === 0) {
      setError("Pick at least one juz' you've memorized");
      return;
    }
    setPending(true);
    try {
      const res = await api.signup({
        email,
        password,
        display_name: displayName,
        memorized_juz: memorizedJuz,
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
        className="w-full max-w-lg bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-5"
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
            <span className="text-xs text-slate-600">
              At least 8 characters.
            </span>
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-800 mb-1">
            Which juz&apos; have you memorized?
          </p>
          <p className="text-xs text-slate-600 mb-2.5">
            Opponents will only test you on the juz&apos; you select.
          </p>
          <JuzPicker value={memorizedJuz} onChange={setMemorizedJuz} />
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
