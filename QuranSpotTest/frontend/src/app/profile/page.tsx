"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";

import { Avatar, AVATAR_GRADIENTS } from "@/components/Avatar";
import { JuzPicker } from "@/components/JuzPicker";
import { NavBar } from "@/components/NavBar";
import { SurahPicker } from "@/components/SurahPicker";
import { ApiError, api, getToken, setToken } from "@/lib/api";
import type { SurahMeta, User } from "@/lib/types";

const AVATAR_COLOR_KEY = (id: number) => `akmil_avatar_${id}`;

function eloTitle(rating: number) {
  if (rating >= 2000) return { label: "Grand Hafiz", color: "text-amber-300 bg-amber-900/40 border-amber-600" };
  if (rating >= 1800) return { label: "Master",      color: "text-purple-300 bg-purple-900/40 border-purple-600" };
  if (rating >= 1600) return { label: "Scholar",     color: "text-blue-300 bg-blue-900/40 border-blue-600" };
  if (rating >= 1400) return { label: "Hafiz",       color: "text-emerald-300 bg-emerald-900/40 border-emerald-600" };
  if (rating >= 1200) return { label: "Reciter",     color: "text-slate-300 bg-slate-800 border-slate-600" };
  return                       { label: "Learner",   color: "text-slate-400 bg-slate-800 border-slate-700" };
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);

  // avatar
  const [colorIdx, setColorIdx] = useState(0);
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // name
  const [displayName, setDisplayName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // theme
  const [theme, setThemeState] = useState<"dark" | "light">("dark");

  // bio
  const [bio, setBio] = useState("");
  const [bioSaving, setBioSaving] = useState(false);
  const [bioMsg, setBioMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // memorized
  const [memorizedJuz, setMemorizedJuz] = useState<number[]>([]);
  const [memorizedSurahs, setMemorizedSurahs] = useState<number[]>([]);
  const [memSaving, setMemSaving] = useState(false);
  const [memMsg, setMemMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // live juz preview (debounced coverage API call)
  const [liveJuz, setLiveJuz] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    Promise.all([api.me(), api.surahs()])
      .then(([u, s]) => {
        setUser(u);
        setSurahs(s);
        setDisplayName(u.display_name);
        setBio(u.bio ?? "");
        setMemorizedJuz(u.memorized_juz);
        setMemorizedSurahs(u.memorized_surahs);
        setAvatarData(u.avatar_data ?? null);
        const stored = localStorage.getItem(AVATAR_COLOR_KEY(u.id));
        if (stored !== null) setColorIdx(Number(stored));
        const savedTheme = localStorage.getItem("akmil_theme");
        if (savedTheme === "light") setThemeState("light");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const fetchLiveCoverage = useCallback((juz: number[], surahs: number[]) => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await api.coverage({ memorized_juz: juz, memorized_surahs: surahs });
        setLiveJuz(res.juz_equivalent);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  function handleJuzChange(next: number[]) {
    setMemorizedJuz(next);
    fetchLiveCoverage(next, memorizedSurahs);
  }

  function handleSurahChange(next: number[]) {
    setMemorizedSurahs(next);
    fetchLiveCoverage(memorizedJuz, next);
  }

  function applyTheme(t: "dark" | "light") {
    setThemeState(t);
    localStorage.setItem("akmil_theme", t);
    if (t === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }

  function pickColor(idx: number) {
    setColorIdx(idx);
    if (user) localStorage.setItem(AVATAR_COLOR_KEY(user.id), String(idx));
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file);
      const updated = await api.updateProfile({ avatar_data: compressed });
      setAvatarData(compressed);
      setUser(updated);
    } catch {
      // silently ignore — keep old photo
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removePhoto() {
    setPhotoUploading(true);
    try {
      const updated = await api.updateProfile({ avatar_data: "" });
      setAvatarData(null);
      setUser(updated);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || displayName.trim() === user?.display_name) return;
    setNameSaving(true); setNameMsg(null);
    try {
      const u = await api.updateProfile({ display_name: displayName.trim() });
      setUser(u);
      setNameMsg({ ok: true, text: "Saved" });
    } catch (err) {
      setNameMsg({ ok: false, text: err instanceof ApiError ? err.message : "Failed" });
    } finally {
      setNameSaving(false);
      setTimeout(() => setNameMsg(null), 2500);
    }
  }

  async function saveBio(e: React.FormEvent) {
    e.preventDefault();
    setBioSaving(true); setBioMsg(null);
    try {
      const u = await api.updateProfile({ bio: bio.trim() });
      setUser(u);
      setBioMsg({ ok: true, text: "Saved" });
    } catch (err) {
      setBioMsg({ ok: false, text: err instanceof ApiError ? err.message : "Failed" });
    } finally {
      setBioSaving(false);
      setTimeout(() => setBioMsg(null), 2500);
    }
  }

  async function saveMemorized() {
    if (memorizedJuz.length === 0 && memorizedSurahs.length === 0) {
      setMemMsg({ ok: false, text: "Select at least one juz' or surah" });
      return;
    }
    setMemSaving(true); setMemMsg(null);
    try {
      const u = await api.updateProfile({ memorized_juz: memorizedJuz, memorized_surahs: memorizedSurahs });
      setUser(u);
      setMemMsg({ ok: true, text: "Saved" });
    } catch (err) {
      setMemMsg({ ok: false, text: err instanceof ApiError ? err.message : "Failed" });
    } finally {
      setMemSaving(false);
      setTimeout(() => setMemMsg(null), 2500);
    }
  }

  if (!user) return (
    <>
      <NavBar />
      <p className="p-6 text-slate-400">Loading…</p>
    </>
  );

  const title = eloTitle(user.rating);
  const memberSince = new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <>
      <NavBar />
      <main className="max-w-2xl mx-auto p-4 md:p-6 space-y-4 pb-12">

        {/* ── Hero card ─────────────────────────────────────────── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Avatar / photo */}
            <div className="relative shrink-0">
              <Avatar
                name={user.display_name}
                size="xl"
                colorIdx={colorIdx}
                imageData={avatarData}
              />
              {photoUploading && (
                <div className="absolute inset-0 rounded-full bg-slate-900/70 flex items-center justify-center">
                  <span className="text-xs text-slate-300">…</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-black text-slate-100 leading-tight">
                {user.display_name}
              </h1>
              <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-widest ${title.color}`}>
                {title.label}
              </span>
              {user.bio && (
                <p className="mt-2 text-sm text-slate-400 italic">"{user.bio}"</p>
              )}
              <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-3">
                <Stat label="ELO" value={user.rating} accent="emerald" />
                <Stat label="Games" value={user.games_played} />
                <Stat label="Juz'" value={user.juz_equivalent.toFixed(1)} />
              </div>
              <p className="text-xs text-slate-600 mt-2">Member since {memberSince}</p>
            </div>
          </div>

          {/* Photo upload controls */}
          <div className="mt-5 flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoFile}
            />
            <button
              type="button"
              disabled={photoUploading}
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {avatarData ? "Change photo" : "Upload photo"}
            </button>
            {avatarData && (
              <button
                type="button"
                disabled={photoUploading}
                onClick={removePhoto}
                className="bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
          </div>

          {/* Color picker — only shown when no photo */}
          {!avatarData && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
                Avatar color
              </p>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_GRADIENTS.map(([from, to], i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickColor(i)}
                    className={`w-8 h-8 rounded-full ring-2 transition-all ${
                      colorIdx === i ? "ring-white scale-110" : "ring-transparent hover:ring-slate-500"
                    }`}
                    style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Display name ──────────────────────────────────────── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
            Display name
          </h2>
          <form onSubmit={saveName} className="flex gap-2">
            <input
              type="text"
              required
              minLength={2}
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={nameSaving || !displayName.trim() || displayName.trim() === user.display_name}
              className="bg-emerald-600 text-white rounded-lg px-4 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {nameSaving ? "…" : nameMsg?.ok ? "✓ Saved" : "Save"}
            </button>
          </form>
          {nameMsg && !nameMsg.ok && (
            <p className="mt-1.5 text-xs text-red-400">{nameMsg.text}</p>
          )}
        </section>

        {/* ── Bio ───────────────────────────────────────────────── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
            Bio
          </h2>
          <form onSubmit={saveBio} className="space-y-2">
            <textarea
              maxLength={200}
              rows={3}
              placeholder="Tell others about yourself…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{bio.length}/200</span>
              <button
                type="submit"
                disabled={bioSaving}
                className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40 transition-colors"
              >
                {bioSaving ? "…" : bioMsg?.ok ? "✓ Saved" : "Save bio"}
              </button>
            </div>
          </form>
          {bioMsg && !bioMsg.ok && (
            <p className="mt-1 text-xs text-red-400">{bioMsg.text}</p>
          )}
        </section>

        {/* ── Memorized Quran ───────────────────────────────────── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Memorized Quran
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Opponents will only test you on what you select.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Whole juz'
            </p>
            <JuzPicker value={memorizedJuz} onChange={handleJuzChange} />
          </div>

          {surahs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Individual surahs
              </p>
              <SurahPicker
                surahs={surahs}
                value={memorizedSurahs}
                onChange={handleSurahChange}
                memorizedJuz={memorizedJuz}
              />
            </div>
          )}

          <div className="bg-emerald-950/60 border border-emerald-800 rounded-lg px-4 py-2.5 flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-slate-300">
              <span className="font-bold text-emerald-400">{user.memorized_ayat_count}</span> ayat
            </span>
            <span className="text-slate-300 flex items-center gap-1.5">
              ≈ <span className="font-bold text-emerald-400">
                {(liveJuz ?? user.juz_equivalent).toFixed(1)}
              </span> of 30 juz'
              {liveJuz !== null && Math.abs(liveJuz - user.juz_equivalent) > 0.05 && (
                <span className="text-[10px] text-amber-400 bg-amber-900/40 border border-amber-700 rounded px-1">
                  unsaved
                </span>
              )}
            </span>
          </div>

          {memMsg && (
            <p className={`text-xs ${memMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {memMsg.ok ? "✓ " : ""}{memMsg.text}
            </p>
          )}

          <button
            type="button"
            onClick={saveMemorized}
            disabled={memSaving}
            className="w-full bg-emerald-600 text-white rounded-lg py-2.5 font-semibold hover:bg-emerald-500 disabled:opacity-40 transition-colors"
          >
            {memSaving ? "Saving…" : "Save memorized Quran"}
          </button>
        </section>

        {/* ── Account ───────────────────────────────────────────── */}
        <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Account
          </h2>
          <p className="text-sm text-slate-500">
            <span className="font-mono text-slate-400">{user.email}</span>
          </p>

          {/* Theme toggle */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
              Appearance
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => applyTheme("dark")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  theme === "dark"
                    ? "bg-slate-700 border-slate-500 text-slate-100"
                    : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                <span>🌙</span> Dark
              </button>
              <button
                type="button"
                onClick={() => applyTheme("light")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  theme === "light"
                    ? "bg-slate-200 border-slate-300 text-slate-900"
                    : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                <span>☀️</span> Light
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setToken(null); router.replace("/login"); }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-4 py-2 font-semibold transition-colors"
          >
            Sign out
          </button>
        </section>

      </main>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "emerald";
}) {
  return (
    <div className="text-center sm:text-left">
      <div className="text-[10px] uppercase tracking-widest text-slate-600">{label}</div>
      <div className={`text-xl font-black ${accent === "emerald" ? "text-emerald-400" : "text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}
