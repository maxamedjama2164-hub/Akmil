"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LiveAudioBroadcaster } from "@/lib/live_audio";
import type { WsClient } from "@/lib/ws";

type Props = {
  disabled?: boolean;
  onComplete: (blob: Blob) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  liveAudioWs?: WsClient<any> | null;
};

const MAX_RECORDING_MS = 10 * 60 * 1000; // 10 minutes
const WARN_REMAINING_MS = 60 * 1000;    // warn when < 60 s left

type Status = "idle" | "requesting" | "recording" | "error";

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t))
      return t;
  }
  return "";
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function Recorder({ disabled, onComplete, liveAudioWs }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [volume, setVolume] = useState(0); // 0-100 RMS level

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRef = useRef<number | null>(null);
  const broadcasterRef = useRef<LiveAudioBroadcaster | null>(null);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    rec.stop();
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; }
    if (vadRef.current !== null) { window.clearInterval(vadRef.current); vadRef.current = null; }
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    broadcasterRef.current?.stop();
    broadcasterRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setVolume(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Volume meter via WebAudio
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);

      vadRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) { const n = (v - 128) / 128; sum += n * n; }
        setVolume(Math.min(100, Math.sqrt(sum / buf.length) * 300));
      }, 50);

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || "audio/webm" });
        cleanup();
        setStatus("idle");
        setElapsedMs(0);
        onComplete(blob);
      };

      rec.start();
      startTsRef.current = performance.now();
      setStatus("recording");
      setElapsedMs(0);

      if (liveAudioWs) {
        broadcasterRef.current = new LiveAudioBroadcaster();
        broadcasterRef.current.start(stream, liveAudioWs).catch((e) => {
          console.warn("live audio broadcast failed:", e);
        });
      }

      timerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startTsRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS) stop();
      }, 100);

    } catch (e) {
      setStatus("error");
      const isBlocked =
        e instanceof DOMException &&
        (e.name === "NotAllowedError" || e.name === "PermissionDeniedError");
      setError(
        isBlocked
          ? "Microphone blocked. Click the lock icon in your browser's address bar → allow microphone, then try again."
          : e instanceof Error ? e.message : "could not access microphone",
      );
      cleanup();
    }
  }, [cleanup, liveAudioWs, onComplete]);

  const isRecording = status === "recording";
  const nearLimit = isRecording && elapsedMs >= MAX_RECORDING_MS - WARN_REMAINING_MS;

  return (
    <div className="space-y-2">
      {isRecording ? (
        <>
          {/* Volume + elapsed row */}
          <div className="flex items-center gap-3">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-[width] duration-75"
                style={{ width: `${Math.min(100, volume * 2)}%` }}
              />
            </div>
            <span className={`text-sm font-mono shrink-0 tabular-nums ${nearLimit ? "text-amber-400" : "text-slate-400"}`}>
              {formatElapsed(elapsedMs)}
              {nearLimit && ` / ${formatElapsed(MAX_RECORDING_MS)}`}
            </span>
          </div>
          {nearLimit && (
            <p className="text-xs text-amber-400 text-center">
              Recording stops automatically at 10 minutes
            </p>
          )}
          <button
            type="button"
            onClick={stop}
            className="w-full bg-red-600 text-white rounded-lg py-3 font-semibold hover:bg-red-700 transition-colors"
          >
            Stop recording
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={disabled || status === "requesting"}
          className="w-full bg-emerald-600 text-white rounded-lg py-3 font-semibold hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
        >
          {status === "requesting" ? "Allow microphone…" : "● Start recording"}
        </button>
      )}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
