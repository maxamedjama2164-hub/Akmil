export const TIER_LABELS = [
  "juz_1",
  "juz_5",
  "juz_10",
  "juz_15",
  "juz_20",
  "juz_25",
  "full",
] as const;

export type Tier = (typeof TIER_LABELS)[number];

export function prettyTier(t: string): string {
  if (t === "full") return "Full Quran";
  const n = t.replace("juz_", "");
  return `${n} Juz`;
}

export function tierForCount(count: number): Tier {
  const checkpoints: Tier[] = [
    "juz_1", "juz_5", "juz_10", "juz_15", "juz_20", "juz_25", "full",
  ];
  const sizes = [1, 5, 10, 15, 20, 25, 30];
  let result: Tier = "juz_1";
  for (let i = 0; i < sizes.length; i++) {
    if (count >= sizes[i]) result = checkpoints[i];
  }
  return result;
}

export type User = {
  id: number;
  email: string;
  display_name: string;
  memorized_juz: number[];
  tier: Tier;
  created_at: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type SurahMeta = {
  id: number;
  name_ar: string;
  name_en: string;
  ayat_count: number;
  juz_min: number;
  juz_max: number;
};

export type AyahMeta = {
  number: number;
  juz: number;
  text_uthmani: string;
  text_simple: string;
};

export type SurahDetail = {
  surah: number;
  juz_min: number;
  juz_max: number;
  ayat: AyahMeta[];
};

export type ScoreResult = {
  accuracy: number;
  word_accuracy: number;
  char_accuracy: number;
  passed: boolean;
  reason: string | null;
  transcript: string;
  transcript_normalized: string;
  target_text_uthmani: string;
  target_text_normalized: string;
  ayat_used: { surah: number; number: number }[];
  duration_s: number;
  inference_s: number;
};

export type RatingRow = {
  tier: Tier;
  rating: number;
  games_played: number;
};

export type MatchPlayer = {
  id: number;
  display_name: string;
  memorized_juz: number[];
  tier: Tier;
};

export type RoundState = {
  number: number;
  picker_id: number;
  reciter_id: number;
  status: "waiting_for_pick" | "picked" | "scored";
  surah: number | null;
  start_ayah: number | null;
  target_text: string | null;
  target_ayat: { surah: number; number: number }[] | null;
  transcript: string | null;
  accuracy: number | null;
  passed: boolean | null;
  reason: string | null;
};

export type MatchState = {
  id: number;
  status: "in_progress" | "completed" | "abandoned";
  tier: Tier;
  round_count: number;
  player_a: MatchPlayer;
  player_b: MatchPlayer;
  a_wins: number;
  b_wins: number;
  a_rating_before: number | null;
  b_rating_before: number | null;
  a_rating_after: number | null;
  b_rating_after: number | null;
  rounds: RoundState[];
  is_private: boolean;
  created_at: string;
  completed_at: string | null;
};

export type QuickmatchResponse = {
  status: "matched" | "queued";
  match_id: number | null;
  queue_position: number | null;
  tier: Tier;
};
