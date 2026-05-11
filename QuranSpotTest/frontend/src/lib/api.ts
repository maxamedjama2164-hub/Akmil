import type {
  AuthResponse,
  MatchState,
  QuickmatchResponse,
  RatingRow,
  ScoreResult,
  SurahDetail,
  SurahMeta,
  User,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const TOKEN_KEY = "qspot_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  const body = init.body;
  if (typeof body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      if (typeof json?.detail === "string") detail = json.detail;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function postMultipart<T>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: form,
    headers,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  signup: (body: {
    email: string;
    password: string;
    display_name: string;
    memorized_juz: number[];
  }) =>
    request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<User>("/api/auth/me"),

  surahs: () => request<SurahMeta[]>("/api/quran/surahs"),
  surah: (n: number, opts?: { juzMin?: number; juzMax?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.juzMin !== undefined) qs.set("juz_min", String(opts.juzMin));
    if (opts?.juzMax !== undefined) qs.set("juz_max", String(opts.juzMax));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<SurahDetail>(`/api/quran/surah/${n}${suffix}`);
  },

  score: (args: { surah: number; startAyah: number; audio: Blob }) => {
    const fd = new FormData();
    fd.append("surah", String(args.surah));
    fd.append("start_ayah", String(args.startAyah));
    fd.append("file", args.audio, "recording.webm");
    return postMultipart<ScoreResult>("/api/score", fd);
  },

  ratings: () => request<RatingRow[]>("/api/ratings/me"),

  quickmatch: (body: { round_count: number }) =>
    request<QuickmatchResponse>("/api/matches/quickmatch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cancelQueue: () =>
    request<{ cancelled: boolean }>("/api/matches/cancel-queue", {
      method: "POST",
    }),
  match: (id: number) => request<MatchState>(`/api/matches/${id}`),
  pick: (id: number, body: { surah: number; start_ayah: number }) =>
    request<MatchState>(`/api/matches/${id}/pick`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  recording: (id: number, audio: Blob) => {
    const fd = new FormData();
    fd.append("file", audio, "recording.webm");
    return postMultipart<MatchState>(`/api/matches/${id}/recording`, fd);
  },
};
