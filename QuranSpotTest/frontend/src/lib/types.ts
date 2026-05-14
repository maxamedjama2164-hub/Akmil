export const TOTAL_AYAT = 6236;
export const AYAT_PER_JUZ = TOTAL_AYAT / 30; // 207.87

export type User = {
  id: number;
  email: string;
  display_name: string;
  memorized_juz: number[];
  memorized_surahs: number[];
  memorized_ayat_count: number;
  juz_equivalent: number;
  rating: number;
  games_played: number;
  created_at: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type CoverageResponse = {
  memorized_ayat_count: number;
  juz_equivalent: number;
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

export type MatchPlayer = {
  id: number;
  display_name: string;
  memorized_juz: number[];
  memorized_surahs: number[];
  juz_equivalent: number;
  rating: number;
};

export type RoundState = {
  number: number;
  picker_id: number;
  reciter_id: number;
  status: "waiting_for_pick" | "picked" | "scored" | "finalized";
  surah: number | null;
  start_ayah: number | null;
  start_ayah_text_uthmani: string | null;
  target_text: string | null;
  target_ayat: { surah: number; number: number }[] | null;
  transcript: string | null;
  accuracy: number | null;
  passed: boolean | null;
  reason: string | null;
  finalized: boolean;
  overridden: boolean;
  winner_id: number | null;
};

export type MatchState = {
  id: number;
  status: "in_progress" | "completed" | "abandoned";
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
};

export type Invite = {
  code: string;
  url: string;
  round_count: number;
  challenger_id: number;
  challenger_name: string;
  challenger_rating: number;
  challenger_juz_equivalent: number;
  challenger_memorized_juz: number[];
  challenger_memorized_surahs: number[];
};

export type SoloPick = {
  surah: number;
  start_ayah: number;
  start_ayah_text_uthmani: string;
  surah_name_en: string;
  surah_name_ar: string;
};
