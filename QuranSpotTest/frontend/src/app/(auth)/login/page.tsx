"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await api.login({ email, password });
      setToken(res.token);
      router.replace("/lobby");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4"
      >
        <h1 className="text-2xl font-bold text-slate-900">
          Log in to QuranSpot
        </h1>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            autoComplete="current-password"
          />
        </label>
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
          {pending ? "Logging in…" : "Log in"}
        </button>
        <p className="text-sm text-slate-700 text-center">
          No account?{" "}
          <Link
            href="/signup"
            className="text-emerald-700 hover:text-emerald-900 underline font-medium"
          >
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
