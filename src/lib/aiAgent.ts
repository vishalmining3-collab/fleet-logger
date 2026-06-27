/**
 * AI Agent — the voice that talks to the driver.
 *
 * The agent can:
 *  1. Speak a string via the server-side TTS (NIM Magpie Multilingual) — best quality,
 *     works on every device including mobile.
 *  2. Fall back to the browser's SpeechSynthesis if the server is down.
 *  3. Pause/resume itself when the user is speaking (avoids talking over them).
 *  4. Build natural-language readbacks from draft cards ("I logged car WB 02 AB 1234
 *     for hospital run from 9 to 18, is that right?").
 *  5. Ask focused follow-up questions for missing fields.
 *
 * Everything is fire-and-forget so the UI never blocks on speech.
 */

import { DutyEntry } from "../types";
import { getApiUrl } from "../config";

let currentAudio: HTMLAudioElement | null = null;
let isMuted = false;
let currentLanguage = "en-US";
type SpeakingListener = (speaking: boolean) => void;
const speakingListeners: Set<SpeakingListener> = new Set();
function notifySpeaking(speaking: boolean) {
  for (const l of speakingListeners) {
    try { l(speaking); } catch (e) {}
  }
}
export function subscribeSpeaking(listener: SpeakingListener): () => void {
  speakingListeners.add(listener);
  return () => { speakingListeners.delete(listener); };
}

/** Configure the language the agent speaks in. */
export function setAgentLanguage(lang: string) {
  currentLanguage = lang || "en-US";
}

/** Mute the agent. */
export function muteAgent() {
  isMuted = true;
  stopSpeaking();
}

/** Unmute the agent. */
export function unmuteAgent() {
  isMuted = false;
}

export function isAgentMuted() {
  return isMuted;
}

/** Stop any in-flight speech (server audio or browser TTS). */
export function stopSpeaking() {
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.src = ""; } catch (e) {}
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  notifySpeaking(false);
}

/**
 * Speak text through the server-side TTS. Falls back to browser SpeechSynthesis
 * if the server is unreachable.
 */
export async function speak(text: string, language?: string): Promise<void> {
  if (!text || !text.trim()) return;
  if (isMuted) return;
  const lang = language || currentLanguage;
  stopSpeaking();

  // Try server-side TTS first (best quality, works on every device).
  try {
    const audio = await fetchServerAudio(text, lang);
    if (audio) {
      playAudio(audio);
      return;
    }
  } catch (e) {
    console.warn("Server TTS failed, falling back to browser:", e);
  }
  // Fallback: browser SpeechSynthesis
  speakWithBrowser(text, lang);
}

async function fetchServerAudio(text: string, language: string): Promise<string | null> {
  try {
    const res = await fetch(getApiUrl("/api/tts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 100) return null; // empty response
    return URL.createObjectURL(blob);
  } catch (e) {
    return null;
  }
}

function playAudio(url: string) {
  if (!url) return;
  const audio = new Audio(url);
  currentAudio = audio;
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
    URL.revokeObjectURL(url);
    notifySpeaking(false);
  };
  audio.onerror = () => {
    if (currentAudio === audio) currentAudio = null;
    URL.revokeObjectURL(url);
    notifySpeaking(false);
  };
  audio.onplay = () => notifySpeaking(true);
  audio.play().catch((e) => {
    console.warn("Audio play failed:", e);
    if (currentAudio === audio) currentAudio = null;
    notifySpeaking(false);
  });
}

function speakWithBrowser(text: string, language: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = language;
  u.rate = 1.0;
  u.pitch = 1.0;
  u.onstart = () => notifySpeaking(true);
  u.onend = () => notifySpeaking(false);
  u.onerror = () => notifySpeaking(false);
  window.speechSynthesis.speak(u);
}

// ────────────────────────────────────────────────────────────────────────────
// Readback builders
// ────────────────────────────────────────────────────────────────────────────

function s(n: number) { return String(n).padStart(2, "0"); }
function t(time: string | null): string {
  if (!time) return "unknown time";
  return time;
}
function speakableTime(time: string | null): string {
  if (!time) return "unknown time";
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return time;
  const h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return min === "00" ? `${h12} ${ampm}` : `${h12} ${min} ${ampm}`;
}
function speakableCar(car: string | null): string {
  if (!car) return "unknown car";
  // For Indian plates, say letters as a word ("W B"), read digit groups as numbers
  // e.g. "WB 02 AB 1234" -> "W B, zero two, A B, one two three four"
  // We split on whitespace first, then within each part handle letters vs digits
  const parts = car.trim().split(/\s+/);
  const spoken: string[] = [];
  for (const part of parts) {
    // Split into letter groups and digit groups
    const groups = part.match(/([A-Za-z]+)|(\d+)/g) || [part];
    for (const g of groups) {
      if (/^[A-Za-z]+$/.test(g)) {
        // Spell out each letter
        spoken.push(g.toUpperCase().split("").join(" "));
      } else if (/^\d+$/.test(g)) {
        // Read the digit group as a number, or spell if 1 digit
        const n = parseInt(g, 10);
        if (g.length === 1) {
          spoken.push(["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n]);
        } else if (n < 100) {
          // Two-digit number e.g. "02" -> "two" (Indian plates lead with 0)
          const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"][Math.floor(n / 10)];
          const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n % 10];
          spoken.push([tens, ones].filter(Boolean).join(" "));
        } else {
          spoken.push(g);  // 3+ digit number, just read each digit
        }
      }
    }
  }
  return spoken.join(", ");
}

/**
 * Build a natural-language readback for a draft card.
 * Example: "I logged car W B zero two A B one two three four, hospital run,
 *           from 9 AM to 6 PM, in K M 1000 to 1120. Is that right?"
 */
export function buildReadback(entry: Partial<DutyEntry>, language: string = "en-US"): string {
  const parts: string[] = [];
  if (entry.duty) parts.push(entry.duty);
  if (entry.carNumber) parts.push(`car ${speakableCar(entry.carNumber)}`);
  if (entry.inTime && entry.outTime) {
    parts.push(`from ${speakableTime(entry.inTime)} to ${speakableTime(entry.outTime)}`);
  } else if (entry.inTime) {
    parts.push(`starting at ${speakableTime(entry.inTime)}`);
  } else if (entry.outTime) {
    parts.push(`ending at ${speakableTime(entry.outTime)}`);
  }
  if (entry.inKm != null && entry.outKm != null) {
    parts.push(`in kilometers ${entry.inKm} to ${entry.outKm}`);
  } else if (entry.inKm != null) {
    parts.push(`in kilometers starting at ${entry.inKm}`);
  } else if (entry.outKm != null) {
    parts.push(`in kilometers ending at ${entry.outKm}`);
  }

  if (parts.length === 0) return "I couldn't extract any details from your dictation.";
  // Capitalize first letter and end with a question
  const sentence = parts.join(", ");
  return `I logged ${sentence}. Is that right?`;
}

/**
 * Build a follow-up question for a missing field.
 */
export function buildFollowUpQuestion(entry: Partial<DutyEntry>): string | null {
  if (!entry.carNumber) return "What was the car number?";
  if (!entry.duty) return "What was the duty or purpose?";
  if (!entry.inTime) return "What time did the duty start?";
  if (!entry.outTime) return "What time did the duty end?";
  return null;
}

/**
 * Readback multiple drafts as a batch (e.g. "I logged 2 duties: ...").
 */
export function buildBatchReadback(entries: Partial<DutyEntry>[]): string {
  if (entries.length === 0) return "No logs were created.";
  if (entries.length === 1) return buildReadback(entries[0]);
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const bits: string[] = [];
    if (e.duty) bits.push(e.duty);
    if (e.carNumber) bits.push(`car ${speakableCar(e.carNumber)}`);
    if (e.inTime && e.outTime) bits.push(`${speakableTime(e.inTime)} to ${speakableTime(e.outTime)}`);
    if (bits.length === 0) bits.push("an entry");
    lines.push(`Entry ${i + 1}: ${bits.join(", ")}`);
  }
  return `I logged ${entries.length} duties. ${lines.join(". ")}. Should I save them?`;
}

// ────────────────────────────────────────────────────────────────────────────
// Mobile haptics
// ────────────────────────────────────────────────────────────────────────────

/** Trigger a short vibration on mobile devices. Silently no-ops on desktop. */
export function vibrate(pattern: number | number[] = 30) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) {}
}
