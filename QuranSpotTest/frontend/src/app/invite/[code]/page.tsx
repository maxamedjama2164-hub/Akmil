"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { ApiError, api, getToken } from "@/lib/api";
import type { Invite, User } from "@/lib/types";

export default function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      // Remember where to come back after login
      if (typeof window !== "undefined") {
        sessionStorage.setItem("post_login_redirect", `/invite/${code}`);
      }
      router.replace("/login");
      return;
    }
    Promise.all([api.me(), api.getInvite(code)])
      .then(([u, inv]) => {
        setMe(u);
        setInvite(inv);
      })
      .catch((e) => {
        setError(
          e instanceof ApiError ? e.message : "could not load this invite",
        );
      });
  }, [code, router]);

  async function accept() {
    if (!invite) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await api.acceptInvite(invite.code);
      router.replace(`/match/${res.match_id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "could not accept invite");
      setAccepting(false);
    }
  }

  if (error) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-3">
          <h1 className="text-xl font-bold text-slate-900">Invite unavailable</h1>
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
          <Link
            href="/lobby"
            className="inline-block bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg px-4 py-2 font-semibold"
          >
            ← Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  if (!invite || !me) return <p className="p-6 text-slate-600">Loading…</p>;

  const isOwnInvite = invite.challenger_id === me.id;

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">
          You&apos;ve been challenged
        </h1>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
          <p className="text-sm text-slate-600">Challenger</p>
          <p className="text-lg font-semibold text-slate-900">
            {invite.challenger_name}
          </p>
          <p className="text-xs text-slate-500">
            ELO {invite.challenger_rating} ·{" "}
            {invite.challenger_juz_equivalent.toFixed(1)} of 30 juz&apos;
          </p>
        </div>
        <p className="text-sm text-slate-700">
          Best of <span className="font-semibold">{invite.round_count}</span>{" "}
          rounds, roles alternate. Wins/losses update your ELO.
        </p>

        {isOwnInvite ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            This is your own invite — share the link with someone else.
          </p>
        ) : (
          <button
            onClick={accept}
            disabled={accepting}
            className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {accepting ? "Joining…" : "Accept challenge"}
          </button>
        )}
        <Link
          href="/lobby"
          className="block text-center text-sm text-slate-700 hover:text-slate-900 underline"
        >
          Back to lobby
        </Link>
      </div>
    </main>
  );
}
