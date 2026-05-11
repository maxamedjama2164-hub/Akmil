"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** Maximum recording length in seconds. */
  maxSeconds?: number;
  /** Whether the user can start a new recording. */
  disabled?: boolean;
  /** Called when the user stops recording or the timer expires. */
  onComplete: (blob: Blob) => void;
};

type Status = "idle" | "requesting" | "recording" | "error";

function pickMimeType(): string {
  // Prefer Opus in WebM (Chrome/Firefox); fall back to mp4/aac (Safari).
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const t of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(t)
    ) {
      return t;
    }
  }
  return "";
}

export function Recorder({ maxSeconds = 15, disabled, onComplete }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const stopReasonRef = useRef<"manual" | "timeout" | null>(null);

  const stop = useCallback((reason: "manual" | "timeout") => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    stopReasonRef.current = reason;
    rec.stop();
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || mimeType || "audio/webm",
        });
        cleanup();
        setStatus("idle");
        setElapsedMs(0);
        onComplete(blob);
      };

      rec.start();
      startTsRef.current = performance.now();
      setStatus("recording");
      setElapsedMs(0);

      timerRef.current = window.setInterval(() => {
        const dt = performance.now() - startTsRef.current;
        setElapsedMs(dt);
        if (dt >= maxSeconds * 1000) stop("timeout");
      }, 100);
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error ? e.message : "could not access microphone",
      );
      cleanup();
    }
  }, [cleanup, maxSeconds, onComplete, stop]);

  const seconds = Math.min(elapsedMs / 1000, maxSeconds);
  const remaining = Math.max(0, maxSeconds - seconds);
  const pct = (seconds / maxSeconds) * 100;
  const isRecording = status === "recording";

  return (
    <div className="space-y-2">
      {isRecording ? (
        <button
          type="button"
          onClick={() => stop("manual")}
          className="w-full bg-red-600 text-white rounded-lg py-3 font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          Stop ({remaining.toFixed(1)}s)
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={disabled || status === "requesting"}
          className="w-full bg-emerald-600 text-white rounded-lg py-3 font-semibold hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {status === "requesting" ? "Allow microphone…" : "● Record"}
        </button>
      )}
      {isRecording && (
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-500 transition-[width] ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
