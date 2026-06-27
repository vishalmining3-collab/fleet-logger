import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// -----------------------------------------------------------------------------
// Local data folder (used when no Supabase configured)
// -----------------------------------------------------------------------------
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "entries.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]), "utf8");
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// -----------------------------------------------------------------------------
// CORS
// -----------------------------------------------------------------------------
// Why this matters: the Android WebView is loaded by Capacitor with
// `androidScheme: 'http'`, meaning the page's origin is `http://localhost`.
// The dev backend (on the user's laptop) is reached via the Android emulator's
// bridge at `http://10.0.2.2:3000`. Different origin = CORS would block the
// `/api/*` fetches even though everything is on one machine.
//
// We opt in to a curated allow-list of origins + a wildcard for the emulator
// case. When the app is deployed (Render), CORS stays on because `*` is the
// simplest safe default — we don't use cookies, so credentials aren't leaked.
// -----------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  "http://localhost:3000",         // vite/express on the developer's machine
  "http://localhost",              // capacitor webview origin (Android emulator)
  "http://10.0.2.2:3000",          // alias of host loopback from inside the Android emulator
  "capacitor://localhost",         // ios webview origin (default Capacitor scheme)
  "http://localhost:8081",         // capacitor dev server
  /\.onrender\.com$/,             // anything deployed via Render Blueprint (regex)
];

if (process.env.RENDER_EXTERNAL_URL) {
  ALLOWED_ORIGINS.push(process.env.RENDER_EXTERNAL_URL.replace(/\/$/, ""));
}

// Fly.io — allow any *.fly.dev origin automatically. The Capacitor Android
// WebView loads from `http://localhost`, iOS uses `capacitor://localhost`,
// browser PWA users connect from whatever URL Fly assigned us.
if (process.env.FLY_APP_NAME) {
  ALLOWED_ORIGINS.push(`https://${process.env.FLY_APP_NAME}.fly.dev`);
}
if (process.env.APP_URL) {
  ALLOWED_ORIGINS.push(process.env.APP_URL.replace(/\/$/, ""));
}

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allow = ALLOWED_ORIGINS.some((o) => (typeof o === "string" ? o === origin : o.test(origin)));
  if (allow) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "Content-Type, Authorization"
  );
  res.header("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// -----------------------------------------------------------------------------
// AI provider configuration
//   Priority:  NVIDIA NIM (faster, more quota)  >  Gemini (fallback)
// -----------------------------------------------------------------------------
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

const NVIDIA_CHAT_MODEL =
  process.env.NVIDIA_CHAT_MODEL || "meta/llama-3.1-70b-instruct";
const NVIDIA_ASR_MODEL =
  process.env.NVIDIA_ASR_MODEL || "nvidia/parakeet-ctc-1.1b-asr";

// Initialize Gemini as fallback only
const gemini = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

// -----------------------------------------------------------------------------
// Helpers — local JSON storage
// -----------------------------------------------------------------------------
async function readLocalEntries(): Promise<any[]> {
  try {
    const data = await fs.promises.readFile(DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading local database:", err);
    return [];
  }
}

async function writeLocalEntries(entries: any[]): Promise<void> {
  const tmpFile = `${DATA_FILE}.tmp`;
  try {
    await fs.promises.writeFile(tmpFile, JSON.stringify(entries, null, 2), "utf8");
    await fs.promises.rename(tmpFile, DATA_FILE);
  } catch (err) {
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Helpers — Supabase REST proxy
// -----------------------------------------------------------------------------
const isSupabaseConfigured = () => !!SUPABASE_URL && !!SUPABASE_KEY;

async function supabaseFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}

async function readSupabaseEntries(): Promise<any[]> {
  const res = await supabaseFetch("/entries?order=date.desc,createdAt.desc");
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
  return await res.json();
}

async function upsertSupabaseEntry(entry: any): Promise<any> {
  const res = await supabaseFetch("/entries?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed: ${res.status}`);
  return await res.json();
}

async function deleteSupabaseEntry(id: string): Promise<void> {
  const res = await supabaseFetch(`/entries?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Supabase delete failed: ${res.status}`);
}

async function clearSupabaseEntries(): Promise<void> {
  const res = await supabaseFetch(`/entries?id=neq.00000000-0000-0000-0000-000000000000`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Supabase clear failed: ${res.status}`);
}

// -----------------------------------------------------------------------------
// Helpers — generic AI caller (NVIDIA NIM with Gemini fallback)
// -----------------------------------------------------------------------------

interface ChatResult { text: string }

async function callNimChat(systemPrompt: string, userPrompt: string): Promise<ChatResult> {
  if (!NVIDIA_API_KEY) throw new Error("NVIDIA_API_KEY not configured");
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  // Retry up to 3 times — NIM models occasionally return empty content under load
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model: NVIDIA_CHAT_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          top_p: 0.7,
          max_tokens: 1024,
          stream: false,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`NVIDIA NIM error ${res.status}: ${body}`);
      }
      const data = await res.json();
      const text: string =
        data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
      if (!text) {
        lastError = new Error("NVIDIA NIM returned empty response (attempt " + attempt + ")");
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
          continue;
        }
        throw lastError;
      }
      return { text };
    } catch (e: any) {
      lastError = e;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastError ?? new Error("NVIDIA NIM call failed");
}

async function callGeminiChat(systemPrompt: string, userPrompt: string): Promise<ChatResult> {
  if (!gemini) throw new Error("Gemini API not configured");
  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["entries"],
        properties: {
          entries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                carNumber: { type: Type.STRING },
                duty: { type: Type.STRING },
                inTime: { type: Type.STRING },
                outTime: { type: Type.STRING },
                inKm: { type: Type.INTEGER },
                outKm: { type: Type.INTEGER },
                date: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });
  const text = response.text || "{}";
  return { text };
}

async function chatWithFallback(systemPrompt: string, userPrompt: string): Promise<ChatResult> {
  if (NVIDIA_API_KEY) {
    try {
      console.log(`[chat] Using NVIDIA NIM (${NVIDIA_CHAT_MODEL})`);
      return await callNimChat(systemPrompt, userPrompt);
    } catch (e) {
      console.warn("[chat] NVIDIA NIM failed, falling back to Gemini:", e);
    }
  }
  if (gemini) {
    console.log("[chat] Using Gemini fallback");
    return await callGeminiChat(systemPrompt, userPrompt);
  }
  throw new Error("No AI provider is configured. Set NVIDIA_API_KEY or GEMINI_API_KEY.");
}

// -----------------------------------------------------------------------------
// Speech sidecar proxy
//
// We delegate TTS and ASR to a local Python sidecar (sidecar/speech_sidecar.py)
// which speaks gRPC to NVIDIA Riva (Magpie Multilingual TTS + Whisper ASR).
// The Node server never touches gRPC; it just talks HTTP/JSON to the sidecar.
//
// If the sidecar is unreachable, the app falls back to the browser's Web Speech
// API (STT) and SpeechSynthesis (TTS) for graceful degradation.
//
// On Fly.io (FLY_APP_NAME set) and without an explicit SIDECAR_URL, default
// to the sidecar app's internal DNS. Otherwise default to 127.0.0.1:5050.
// -----------------------------------------------------------------------------
const SIDECAR_URL =
  process.env.SIDECAR_URL ||
  (process.env.FLY_APP_NAME
    ? "http://fleet-logger-sidecar.internal:8080"
    : "http://127.0.0.1:5050");

async function callSidecarTTS(text: string, language: string): Promise<Buffer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${SIDECAR_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sidecar TTS error ${res.status}: ${errText.slice(0, 200)}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } finally {
    clearTimeout(timer);
  }
}

async function callSidecarASR(audioBase64: string, mimeType: string, language: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${SIDECAR_URL}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64, mimeType, language }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sidecar ASR error ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return data?.transcript ?? "";
  } finally {
    clearTimeout(timer);
  }
}

async function isSidecarAvailable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${SIDECAR_URL}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// API ROUTE: Health & configuration status
// -----------------------------------------------------------------------------
app.get("/api/health", async (_req, res) => {
  const sidecar = await isSidecarAvailable().catch(() => false);
  res.json({
    status: "ok",
    supabaseEnabled: isSupabaseConfigured(),
    geminiEnabled: !!gemini,
    nvidiaEnabled: !!NVIDIA_API_KEY,
    sidecarEnabled: sidecar,
    primaryProvider: NVIDIA_API_KEY ? "nvidia" : gemini ? "gemini" : "none",
    chatModel: NVIDIA_API_KEY ? NVIDIA_CHAT_MODEL : "gemini-2.5-flash",
    ttsModel: sidecar ? "magpie-multilingual" : "browser-speechsynthesis",
    asrModel: sidecar ? "whisper-large-v3" : "browser-web-speech",
    time: new Date().toISOString(),
  });
});

// -----------------------------------------------------------------------------
// API ROUTE: Provider info
// -----------------------------------------------------------------------------
app.get("/api/provider", (_req, res) => {
  if (NVIDIA_API_KEY) {
    res.json({ provider: "nvidia-nim", model: NVIDIA_CHAT_MODEL });
  } else if (gemini) {
    res.json({ provider: "gemini", model: "gemini-2.5-flash" });
  } else {
    res.status(503).json({ error: "No AI provider configured" });
  }
});

// -----------------------------------------------------------------------------
// API ROUTE: Entries CRUD (uses Supabase if configured, else local JSON)
// -----------------------------------------------------------------------------
app.get("/api/entries", async (_req, res) => {
  try {
    let entries: any[];
    if (isSupabaseConfigured()) {
      entries = await readSupabaseEntries();
    } else {
      entries = await readLocalEntries();
      entries.sort((a, b) => {
        const dateCompare = (b.date || "").localeCompare(a.date || "");
        if (dateCompare !== 0) return dateCompare;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    }
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entries", async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const prepared = payload.map((entry: any) => ({
      id: entry.id || crypto.randomUUID(),
      date: entry.date || new Date().toISOString().split("T")[0],
      carNumber: entry.carNumber || "UNKNOWN",
      duty: entry.duty || "General Duty",
      inTime: entry.inTime || "09:00",
      outTime: entry.outTime || "18:00",
      inKm: Number(entry.inKm) || 0,
      outKm: Number(entry.outKm) || 0,
      createdAt: Number(entry.createdAt) || Date.now(),
      updatedAt: Number(entry.updatedAt) || Date.now(),
      deviceId: entry.deviceId || "server",
      userId: entry.userId || "guest",
    }));

    if (isSupabaseConfigured()) {
      const results: any[] = [];
      for (const item of prepared) {
        const r = await upsertSupabaseEntry(item);
        if (Array.isArray(r) && r[0]) results.push(r[0]);
        else results.push(item);
      }
      res.json(results);
    } else {
      const current = await readLocalEntries();
      const updated = [...current];
      for (const item of prepared) {
        const idx = updated.findIndex((x) => x.id === item.id);
        if (idx !== -1) {
          if (item.updatedAt >= (updated[idx].updatedAt || 0)) {
            updated[idx] = item;
          }
        } else {
          updated.push(item);
        }
      }
      await writeLocalEntries(updated);
      res.json(prepared);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/entries/:id", async (req, res) => {
  const { id } = req.params;
  const item = { ...req.body, id, updatedAt: Date.now() };
  try {
    if (isSupabaseConfigured()) {
      const r = await upsertSupabaseEntry(item);
      const out = Array.isArray(r) ? r[0] : r;
      res.json(out || item);
    } else {
      const entries = await readLocalEntries();
      const idx = entries.findIndex((x) => x.id === id);
      if (idx !== -1) {
        entries[idx] = { ...entries[idx], ...item };
        await writeLocalEntries(entries);
        res.json(entries[idx]);
      } else {
        res.status(404).json({ error: `Entry ${id} not found` });
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/entries/:id", async (req, res) => {
  const { id } = req.params;
  try {
    if (isSupabaseConfigured()) {
      await deleteSupabaseEntry(id);
    } else {
      const entries = await readLocalEntries();
      await writeLocalEntries(entries.filter((x) => x.id !== id));
    }
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entries/clear", async (_req, res) => {
  try {
    if (isSupabaseConfigured()) {
      await clearSupabaseEntries();
    } else {
      await writeLocalEntries([]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// API ROUTE: /api/chat — AI extraction engine
// -----------------------------------------------------------------------------
const EXTRACTION_SYSTEM_PROMPT = `You are a fleet-logger assistant designed for a vehicle dispatcher (the person who manages the fleet and allots cars to drivers). Extract one or more duty entries from the spoken dictation. The dictation may be in English, Hindi, Bengali, or a code-mixed mix of these languages.

Return JSON matching this exact structure: { "entries": [ { "carNumber", "duty", "inTime", "outTime", "inKm", "outKm", "date" } ] }.

CRITICAL RULES:
- "carNumber" = the vehicle registration plate ONLY (e.g. "WB 02 AB 1234", "0201", "DL01", "HR26"). NEVER include the brand name ("Maruti", "Tata", "Suzuki", "Sumo"). Set to empty string "" if not mentioned.
- "duty" = the EVENT, PURPOSE, or WHO IS TRAVELING WITH (e.g., "Hospital Run with Rajesh", "Amit Airport Drop"). Clean and concise in 2-6 words. Title Case. Set to empty string "" if not mentioned.
- "inTime" / "outTime" = 24-hour format "HH:MM" (e.g. "09:00", "21:00"). Convert Hindi/Bengali/English time-of-day phrases ("morning 9am", "evening 9pm", "10 se 6", "sokal 9ta", "bikel 6ta", "raat 10 baje") to correct 24h format. Set to empty string "" if not mentioned.
- "inKm" / "outKm" = Integers representing the odometer readings. Set to 0 if not mentioned or if ambiguous.
- "date" = "YYYY-MM-DD" if a specific date or relative day coordinate ("yesterday", "today", "day before yesterday", "20th") was mentioned or can be derived. Otherwise, return empty string "".

If multiple vehicles or distinct duties are mentioned, return separate entry objects in the "entries" array. Do not merge them.
If information is missing, set those properties to empty string or 0. Do not hallucinate or guess any values!
If the transcript is just a connection test, feedback, or irrelevant greeting with no fleet or vehicle details (e.g. "hello mic testing", "testing 1 2 3"), return an empty entries array: { "entries": [] }.`;

app.post("/api/chat", async (req, res) => {
  const { transcript, currentDateISO, currentDayOfWeek, defaultCar, language } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: "Transcript is required" });
  }

  const lang = language || "English/Hindi/Bengali";
  const userPrompt = `Context Info:
- Today's date: ${currentDateISO || new Date().toISOString().split("T")[0]} (Day of week: ${currentDayOfWeek || "Monday"})
- Default Car Number: ${defaultCar || "None"}

Analyze the following dispatcher transcript and extract the entries strictly complying with the schema:
"${transcript}"`;

  try {
    const { text: resultText } = await chatWithFallback(EXTRACTION_SYSTEM_PROMPT, userPrompt);
    let cleanedText = (resultText || "").trim();
    // Strip leading/trailing non-JSON content
    const braceStart = cleanedText.indexOf("{");
    const braceEnd = cleanedText.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      cleanedText = cleanedText.substring(braceStart, braceEnd + 1);
    }
    let data: any;
    try {
      data = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error("[chat] Failed to parse LLM output:", cleanedText.slice(0, 500));
      return res.status(502).json({ error: "AI returned invalid JSON", raw: cleanedText });
    }

    // Normalize: the model might use alternative field names. Map them to our schema.
    // IMPORTANT: each alias is a UNIQUE list per canonical field; we don't share
    // aliases between inTime/outTime or inKm/outKm because the model can
    // legitimately use either term for either field depending on context.
    const FIELD_ALIASES: Record<string, string[]> = {
      carNumber: ["carNumber", "car_number", "vehicleNumber", "vehicle_number", "registration", "reg", "plate", "carplate", "car_plate"],
      duty: ["duty", "purpose", "event", "workplace", "task", "work", "job"],
      inTime: ["inTime", "in_time", "startTime", "start_time", "departure", "departTime", "depart_time", "fromTime", "from_time", "outTime", "out_time"],
      outTime: ["outTime", "out_time", "endTime", "end_time", "returnTime", "return_time", "arrivalTime", "arrival_time", "inTime", "in_time"],
      inKm: ["inKm", "in_km", "inOdometer", "in_odometer", "startKm", "start_km", "inwardKm", "inward_km", "outKm", "out_km"],
      outKm: ["outKm", "out_km", "outOdometer", "out_odometer", "endKm", "end_km", "inwardKm", "inward_km", "inKm", "in_km"],
      date: ["date", "dutyDate", "duty_date"],
    };

    const normalizeEntry = (raw: any): any => {
      const lower: Record<string, any> = {};
      for (const k of Object.keys(raw || {})) lower[k.toLowerCase()] = raw[k];
      const out: any = {};
      for (const canonical of Object.keys(FIELD_ALIASES)) {
        for (const alias of FIELD_ALIASES[canonical]) {
          const key = alias.toLowerCase();
          if (lower[key] !== undefined && lower[key] !== null) {
            out[canonical] = lower[key];
            break;
          }
        }
      }
      return out;
    };
    // Post-processing: LLMs (notably Meta-Llama-3.1-8B) sometimes return
    // inTime/outTime swapped when the user says "out at 09:00, in at 18:00".
    // We honour explicit "out at" / "in at" markers in the source transcript,
    // and otherwise apply a temporal-ordering heuristic.
    function hhmmToMinutes(s: string): number | null {
      if (!s) return null;
      const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const h = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
      return h * 60 + mm;
    }
    function minutesToHhmm(total: number): string {
      const m = ((Math.round(total) % 1440) + 1440) % 1440;
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return (h.toString().padStart(2, "0") + ":" + mm.toString().padStart(2, "0"));
    }
    function extractTimeMentions(text: string): Array<{ minutes: number; raw: string; isOut: boolean; isIn: boolean }> {
      if (!text) return [];
      const out: Array<{ minutes: number; raw: string; isOut: boolean; isIn: boolean }> = [];
      const lower = " " + text.toLowerCase() + " ";
      const re = /\b(out|in)\s*(?:at\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lower)) !== null) {
        const marker = m[1];
        const t = m[2].replace(/\s+/g, "");
        let minutes: number | null = null;
        const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
        if (m24) {
          const h = parseInt(m24[1], 10);
          const mm = parseInt(m24[2], 10);
          if (h < 24 && mm < 60) minutes = h * 60 + mm;
        } else {
          const m12 = t.match(/^(\d{1,2})(am|pm)$/);
          if (m12) {
            let h = parseInt(m12[1], 10);
            const ampm = m12[2];
            if (h >= 1 && h <= 12) {
              if (ampm === "pm" && h < 12) h += 12;
              if (ampm === "am" && h === 12) h = 0;
              minutes = h * 60;
            }
          } else {
            const mInt = t.match(/^(\d{1,2})$/);
            if (mInt) {
              const h = parseInt(mInt[1], 10);
              if (h >= 0 && h < 24) minutes = h * 60;
            }
          }
        }
        if (minutes !== null) {
          out.push({ minutes, raw: m[0].trim(), isOut: marker === "out", isIn: marker === "in" });
        }
      }
      return out;
    }
    function fixInOutSwap(entry: any, originalText: string): void {
      if (!entry) return;
      const inTime = entry.inTime;
      const outTime = entry.outTime;
      const mentions = extractTimeMentions(originalText);
      const outMarker = mentions.find((m) => m.isOut);
      const inMarker = mentions.find((m) => m.isIn);

      const inMin = hhmmToMinutes(inTime);
      const outMin = hhmmToMinutes(outTime);

      // Case A: both fields populated — apply swap / marker-based fix.
      if (inMin !== null && outMin !== null) {
        if (outMarker || inMarker) {
          if (outMarker && inMarker) {
            entry.inTime = minutesToHhmm(outMarker.minutes);
            entry.outTime = minutesToHhmm(inMarker.minutes);
          } else if (outMarker && !inMarker) {
            if (outMin === outMarker.minutes && inMin !== outMarker.minutes) {
              entry.inTime = minutesToHhmm(outMarker.minutes);
              entry.outTime = minutesToHhmm(inMin);
            }
          } else if (inMarker && !outMarker) {
            if (inMin === inMarker.minutes && outMin !== inMarker.minutes) {
              entry.inTime = minutesToHhmm(outMin);
              entry.outTime = minutesToHhmm(inMarker.minutes);
            }
          }
          return;
        }
        if (inMin > outMin) {
          const looksOvernight = outMin >= 18 * 60 && inMin <= 10 * 60;
          if (!looksOvernight) {
            entry.inTime = minutesToHhmm(outMin);
            entry.outTime = minutesToHhmm(inMin);
          }
        }
        return;
      }

      // Case B: only one field populated. The LLM sometimes drops the other side
      // of a pair. We try to recover the missing one from the markers.
      if (outMarker && inMarker) {
        // We have both intent markers — use them regardless of what the LLM
        // stored, since the markers are unambiguous.
        entry.inTime = entry.inTime || minutesToHhmm(outMarker.minutes);
        entry.outTime = entry.outTime || minutesToHhmm(inMarker.minutes);
        return;
      }
      if (outMarker && !inMarker) {
        if (inMin === null && outMin !== null) {
          // LLM set only outTime; that value is the depart time per the marker.
          entry.inTime = minutesToHhmm(outMarker.minutes);
          // outTime stays as the LLM had it (we can't be sure it's the depart value).
        }
      } else if (inMarker && !outMarker) {
        if (outMin === null && inMin !== null) {
          // LLM set only inTime; that value is actually the return time.
          entry.outTime = minutesToHhmm(inMarker.minutes);
        }
      }
    }


    if (Array.isArray(data?.entries)) {
      data.entries = data.entries.map(normalizeEntry);
      for (const e of data.entries) fixInOutSwap(e, transcript);
    } else if (data && typeof data === "object") {
      // The model might have returned entries at the root, or wrapped differently
      const wrapped = Object.values(data).find((v) => Array.isArray(v));
      if (Array.isArray(wrapped)) {
        data = { entries: wrapped.map(normalizeEntry) };
        for (const e of data.entries) fixInOutSwap(e, transcript);
      } else {
        data = { entries: [] };
      }
    } else {
      data = { entries: [] };
    }
    res.json(data);
  } catch (err: any) {
    console.error("[chat] AI failure:", err);
    res.status(500).json({ error: err.message || "Failed to process text content with AI." });
  }
});

// -----------------------------------------------------------------------------
// API ROUTE: /api/transcribe — cloud audio transcription
// -----------------------------------------------------------------------------
app.post("/api/transcribe", async (req, res) => {
  const { audioBase64, mimeType, language } = req.body;
  if (!audioBase64) {
    return res.status(400).json({ error: "audioBase64 data is required." });
  }
  try {
    let rawMime = mimeType || "audio/webm";
    if (rawMime.includes(";")) rawMime = rawMime.split(";")[0].trim();
    const cleanBase64 = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    const lang = language || "en-US";
    const transcript = await callSidecarASR(cleanBase64, rawMime, lang);
    res.json({ transcript, language: lang });
  } catch (err: any) {
    console.error("[transcribe] failure:", err.message?.slice(0, 200));
    res.status(500).json({ error: err.message || "Failed to transcribe audio" });
  }
});

// -----------------------------------------------------------------------------
// API ROUTE: /api/tts — server-side text-to-speech for the AI agent
// Returns audio/ogg (Opus) for direct playback in a browser <audio> tag.
// The sidecar proxies to NVIDIA Riva Magpie Multilingual TTS.
// -----------------------------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  const { text, language } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  const lang = language || "en-US";
  try {
    const audio = await callSidecarTTS(text, lang);
    res.setHeader("Content-Type", "audio/ogg");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(audio);
  } catch (err: any) {
    console.error("[tts] failure:", err.message?.slice(0, 200));
    res.status(502).json({ error: err.message || "TTS service unavailable" });
  }
});

// -----------------------------------------------------------------------------
// Vite middleware (dev) or static (prod)
// -----------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Primary AI provider: ${NVIDIA_API_KEY ? "NVIDIA NIM (" + NVIDIA_CHAT_MODEL + ")" : gemini ? "Gemini 2.5 Flash" : "NONE (set NVIDIA_API_KEY or GEMINI_API_KEY)"}`);
    console.log(`ASR provider: ${NVIDIA_API_KEY ? "NVIDIA NIM (" + NVIDIA_ASR_MODEL + ")" : gemini ? "Gemini 2.5 Flash" : "NONE"}`);
    console.log(`Supabase: ${isSupabaseConfigured() ? "enabled" : "disabled (using local data/entries.json)"}`);
  });
}

startServer();
