"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AkmilLogo } from "@/components/AkmilLogo";
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
    <main className="min-h-dvh flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4"
      >
        <div className="flex flex-col items-center gap-3 pb-2">
          <AkmilLogo size="lg" />
          <p className="text-sm text-slate-400">Sign in to compete</p>
        </div>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            autoComplete="current-password"
          />
        </label>
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
          {pending ? "Logging in…" : "Enter the arena"}
        </button>
        <p className="text-sm text-slate-500 text-center">
          No account?{" "}
          <Link
            href="/signup"
            className="text-emerald-400 hover:text-emerald-300 underline font-medium"
          >
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
