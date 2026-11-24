"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speaking instead of typing, using the speech recognition built into the browser (Chrome, Edge and Safari have it).
 * Nothing is recorded or stored by the app: the browser turns the speech into words, and the words go in the box.
 */
type Result = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type Ctor = new () => Recognition;

const engine = (): Ctor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const WHY: Record<string, string> = {
  "not-allowed": "The microphone is blocked for this site. Allow it in the browser's address bar, then try again.",
  "service-not-allowed": "The microphone is blocked for this site. Allow it in the browser's settings, then try again.",
  "audio-capture": "No microphone was found.",
  network: "Speech needs an internet connection, and it dropped. Try again.",
};

/** Tidies a spoken phrase before it joins what's already typed: one space between, no double spaces. */
export function joinSpoken(typed: string, spoken: string): string {
  const s = spoken.replace(/\s+/g, " ").trim();
  if (!s) return typed;
  if (!typed.trim()) return s.charAt(0).toUpperCase() + s.slice(1);
  return `${typed.replace(/\s+$/, "")} ${s}`;
}

export function useDictation(onText: (finalText: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [hearing, setHearing] = useState("");
  const [problem, setProblem] = useState("");
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const send = useRef(onText);
  send.current = onText;

  useEffect(() => setSupported(engine() !== null), []);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Engine = engine();
    if (!Engine) return;
    setProblem("");
    const r = new Engine();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) send.current(res[0].transcript);
        else live += res[0].transcript;
      }
      setHearing(live);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setProblem(WHY[e.error] ?? "The microphone stopped. Try again.");
    };
    r.onend = () => {
      setHearing("");
      // Browsers stop listening after a pause. Carry on until the person presses stop.
      if (wanted.current) {
        try {
          r.start();
          return;
        } catch {
          wanted.current = false;
        }
      }
      setListening(false);
    };
    rec.current = r;
    wanted.current = true;
    try {
      r.start();
      setListening(true);
    } catch {
      wanted.current = false;
      setProblem("The microphone couldn't start. Try again.");
    }
  }, []);

  useEffect(() => () => {
    wanted.current = false;
    rec.current?.abort();
  }, []);

  return { supported, listening, hearing, problem, start, stop };
}
