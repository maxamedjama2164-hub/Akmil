const AUDIO_ENABLED_KEY = "akmil_audio_enabled";
const RECITER_KEY = "akmil_reciter";

export const DEFAULT_RECITER = "Alafasy_128kbps";

export function getAudioEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(AUDIO_ENABLED_KEY);
  return v === null ? true : v === "true";
}

export function setAudioEnabled(enabled: boolean): void {
  localStorage.setItem(AUDIO_ENABLED_KEY, String(enabled));
}

export function getReciter(): string {
  if (typeof window === "undefined") return DEFAULT_RECITER;
  return localStorage.getItem(RECITER_KEY) ?? DEFAULT_RECITER;
}

export function setReciter(id: string): void {
  localStorage.setItem(RECITER_KEY, id);
}
