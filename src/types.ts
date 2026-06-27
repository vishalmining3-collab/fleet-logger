export interface DutyEntry {
  id: string;
  date: string; // YYYY-MM-DD
  carNumber: string;
  duty: string;
  driverName?: string; // optional driver attribution (used by reports leaderboard)
  inTime: string; // HH:MM (24h)
  outTime: string; // HH:MM (24h)
  inKm: number | null;
  outKm: number | null;
  createdAt: number;
  updatedAt: number;
  deviceId: string;
}

/**
 * A parsed-but-unconfirmed log produced by the voice/text parser and shown in
 * the "Extracted Draft Log" sheet before the user confirms and saves.
 *
 * Extends a partial DutyEntry with transient validation/origin flags consumed
 * by the draft UI (missing-field highlighting + follow-up prompts).
 */
export interface DraftCard extends Partial<DutyEntry> {
  _missingCar?: boolean;
  _missingDuty?: boolean;
  _source?: "local" | "llm" | "ai";
}

export interface AppSettings {
  voiceMode: "single-shot" | "guided" | "intelligent";
  speechLanguage: string; // locale e.g. "en-IN", "hi-IN", "bn-IN", etc.
  ttsConfirmation: boolean;
  defaultCar: string;
  serverSync: boolean;
  sttEngine: "browser" | "cloud";
  backendUrl?: string; // cloud backend URL configured for the mobile WebView/APK
}

export const SUPPORTED_LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi (हिन्दी)" },
  { code: "bn-IN", label: "Bengali (বাংলা)" },
  { code: "ta-IN", label: "Tamil (தமிழ்)" },
  { code: "te-IN", label: "Telugu (తెలుగు)" },
  { code: "mr-IN", label: "Marathi (मराठी)" }
];
