import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Settings,
  Download,
  Trash2,
  Plus,
  Search,
  Calendar,
  Car,
  Clock,
  Check,
  AlertCircle,
  X,
  ChevronDown,
  ChevronRight,
  Database,
  Wifi,
  WifiOff,
  User,
  RefreshCw,
  FileSpreadsheet,
  Volume2,
  VolumeX,
  Keyboard,
  Info,
  Layers,
  ArrowRight,
  TrendingUp,
  Award
} from "lucide-react";
import { DutyEntry, AppSettings, DraftCard, SUPPORTED_LANGUAGES } from "./types";
import {
  calculateTotalHours,
  calculateTotalKm,
  normalizeTimeTo24h,
  downloadCSVFile,
  copyToGoogleSheets,
  exportToCSV
} from "./utils";
import { parseLocal, isLocalParseReliable, LocalDraft } from "./lib/localParser";
import { speak, stopSpeaking, muteAgent, unmuteAgent, isAgentMuted, buildReadback, buildFollowUpQuestion, buildBatchReadback, vibrate, setAgentLanguage, subscribeSpeaking } from "./lib/aiAgent";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User as FirebaseUser } from "firebase/auth";
import { collection, doc, setDoc, query, where, getDocs, deleteDoc, updateDoc } from "firebase/firestore";
import { getApiUrl } from "./config";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { MorphingText } from "./components/magicui/MorphingText";
import { HyperText, HyperTextCycle } from "./components/magicui/HyperText";
import { BlurFade } from "./components/magicui/BlurFade";
import { Ripple } from "./components/magicui/ripple";
import { BrandMark } from "./components/BrandMark";
import {
  AestheticSwitch,
  AestheticCard,
  AestheticGradientButton,
  AestheticPillButton,
  AestheticRedPillButton,
  MicRippleLoader,
  AestheticBootLoader,
  FrutigerButton,
  FrutigerRedButton,
  AestheticThinkingLoader
} from "./components/AestheticComponents";
const isAndroid = typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("android");

export default function App() {
  const [showBoot, setShowBoot] = useState(true);
  // App states
  const [activeTab, setActiveTab] = useState<"voice" | "history" | "report" | "settings">("voice");
  const [entries, setEntries] = useState<DutyEntry[]>([]);
  const [syncQueue, setSyncQueue] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServerHealthy, setIsServerHealthy] = useState(true);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Authenticate using Google provider
  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        showToast(`Welcome ${result.user.displayName || "User"}! Cloud Sync active.`, "success");
      }
    } catch (e: any) {
      showToast(`Sign In failed: ${e.message}`, "error");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast("Successfully signed out.", "success");
    } catch (e: any) {
      showToast("Failed to sign out.", "error");
    }
  };
  // UI States
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isDraftSheetOpen, setIsDraftSheetOpen] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(() => {
    try { return localStorage.getItem("fleet_push_notifications") === "true"; } catch (e) { return true; }
  });
  const [offlineModeCache, setOfflineModeCache] = useState(() => {
    try { return localStorage.getItem("fleet_offline_cache") === "true"; } catch (e) { return true; }
  });
  const [multiLanguageInput, setMultiLanguageInput] = useState(() => {
    try { return localStorage.getItem("fleet_multilang") === "true"; } catch (e) { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem("fleet_push_notifications", String(pushNotifications)); } catch (e) {}
  }, [pushNotifications]);

  useEffect(() => {
    try { localStorage.setItem("fleet_offline_cache", String(offlineModeCache)); } catch (e) {}
  }, [offlineModeCache]);

  useEffect(() => {
    try { localStorage.setItem("fleet_multilang", String(multiLanguageInput)); } catch (e) {}
  }, [multiLanguageInput]);

  const [settings, setSettings] = useState<AppSettings>({
    voiceMode: "intelligent",
    speechLanguage: "en-IN",
    ttsConfirmation: true,
    defaultCar: "WB 02 AB 1234",
    serverSync: true,
    // Use cloud STT (sidecar /api/transcribe) by default — it works the same on web and Chrome WebView.
    // The localStorage migration block below also upgrades any pre-existing "browser" setting.
    sttEngine: "cloud",
    backendUrl: navigator.userAgent.toLowerCase().includes("android")
      ? "https://fleet-logger-backend.onrender.com"
      : (typeof window !== "undefined" ? window.location.origin : "")
  });

  // AI Agent state (mute toggle for the spoken voice)
  const [agentMuted, setAgentMuted] = useState(() => {
    try { return localStorage.getItem("fleet_agent_muted") === "true"; } catch (e) { return false; }
  });
  useEffect(() => {
    if (agentMuted) { muteAgent(); } else { unmuteAgent(); }
    try { localStorage.setItem("fleet_agent_muted", String(agentMuted)); } catch (e) {}
  }, [agentMuted]);

  // Track whether the AI agent is currently speaking so we can pulse the UI.
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  useEffect(() => {
    return subscribeSpeaking((speaking) => setIsAgentSpeaking(speaking));
  }, []);

  // Voice engine states
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [micVolume, setMicVolume] = useState(0);

  // Mirror the latest transcript string so async callbacks (silence timer,
  // stop handlers) can read the current value without stale-closure issues.
  const transcriptRef = useRef("");
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  const interimTranscriptRef = useRef("");
  useEffect(() => { interimTranscriptRef.current = interimTranscript; }, [interimTranscript]);
  const [draftCards, setDraftCards] = useState<DraftCard[]>([]);
  const draftCardsRef = useRef<DraftCard[]>([]);
  useEffect(() => {
    if (draftCards.length > 0) {
      setIsDraftSheetOpen(true);
    }
  }, [draftCards]);

  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [activeFollowUpIndex, setActiveFollowUpIndex] = useState<number | null>(null);
  const [manualTranscriptInput, setManualTranscriptInput] = useState("");

  // Manual Form State
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().split("T")[0],
    carNumber: "",
    duty: "",
    inTime: "09:00",
    outTime: "18:00",
    inKm: "" as number | string,
    outKm: "" as number | string
  });

  // History filtering states
  const [historySearch, setHistorySearch] = useState("");
  const [dateFilterChip, setDateFilterChip] = useState<"7" | "30" | "90" | "all">("all");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<DutyEntry>>({});

  // Report states
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Toast notifications state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Ref hook to standard Web Speech API
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveParseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browserSpeechMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize the AI agent's spoken language to match the app's setting
  useEffect(() => {
    setAgentLanguage(settings.speechLanguage);
  }, [settings.speechLanguage]);

  // Setup Notification helper
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Monitor Network
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("Internet connection restored. Synchronizing...", "success");
      syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("App is offline. Logs will be saved locally & synced later.", "info");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncQueue]);

  // Load configuration and data on boot
  useEffect(() => {
    // Settings
    const storedSettings = localStorage.getItem("fleet_settings");
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings);
        // The sidecar ASR (parakeet-1.1b via /api/transcribe) is fully wired and working —
        // prefer it over the unreliable browser Web Speech. Migrate any pre-existing
        // "browser" setting forward to "cloud" so the user gets the working path.
        if (!parsed.sttEngine || parsed.sttEngine === "browser") {
          parsed.sttEngine = "cloud";
          try { localStorage.setItem("fleet_settings", JSON.stringify(parsed)); } catch (e) {}
        }
        // Migrate from old hardcoded LAN IPs to the public Render backend URL
        if (parsed.backendUrl === "http://192.168.0.102:3000" || parsed.backendUrl === "http://10.241.195.227:3000") {
          parsed.backendUrl = "https://fleet-logger-backend.onrender.com";
        }
        try { localStorage.setItem("fleet_settings", JSON.stringify(parsed)); } catch (e) {}
        setSettings(parsed);
      } catch (e) {}
    } else {
      const defaultSettings: AppSettings = {
        voiceMode: "intelligent",
        speechLanguage: "en-IN",
        ttsConfirmation: true,
        defaultCar: "WB 02 AB 1234",
        serverSync: true,
        sttEngine: "cloud",
        backendUrl: "https://fleet-logger-backend.onrender.com"
      };
      try {
        localStorage.setItem("fleet_settings", JSON.stringify(defaultSettings));
      } catch (e) {}
      setSettings(defaultSettings);
    }

    // Sync Offline queue
    const queuedData = localStorage.getItem("fleet_sync_queue");
    if (queuedData) {
      try {
        setSyncQueue(JSON.parse(queuedData));
      } catch (e) {}
    }

    checkHealth();

    // Setup periodic sync & health check
    const interval = setInterval(() => {
      checkHealth();
      if (isOnline && settings.serverSync) {
        syncOfflineQueue();
      }
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);

      
      // Fetch matching items for active state
      fetchEntries();
    });
    return () => unsubscribe();
  }, []);

  // Save Settings wrapper
  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem("fleet_settings", JSON.stringify(newSettings));
  };

  // Check Health of Node API
  const checkHealth = async () => {
    try {
      const res = await fetch(getApiUrl("/api/health"));
      if (res.ok) {
        setIsServerHealthy(true);
      } else {
        setIsServerHealthy(false);
      }
    } catch (e) {
      setIsServerHealthy(false);
    }
  };

  // Test connection to the cloud backend
  const handleTestConnection = async () => {
    showToast("Testing cloud backend connection...", "info");
    try {
      const res = await fetch(getApiUrl("/api/health"));
      if (res.ok) {
        showToast("Connection to cloud backend successful!", "success");
      } else {
        showToast(`Cloud backend responded with code ${res.status}`, "error");
      }
    } catch (e) {
      showToast("Cloud backend unreachable. Check URL or network.", "error");
    }
  };

  // Handle export with month filtering and mobile/Capacitor sharing support
  const handleExport = async () => {
    const reportEntries = entries.filter(e => e.date.startsWith(reportMonth));
    if (reportEntries.length === 0) {
      showToast("No entries found for the selected month.", "info");
      return;
    }

    const filename = `fleet_logger_report_${reportMonth}.csv`;
    const isMobile = navigator.userAgent.toLowerCase().includes("android") || (window as any).Capacitor;

    if (isMobile) {
      try {
        const csvContent = exportToCSV(reportEntries);
        // Write the CSV file to the Cache directory so it is temporary but shareable
        const writeResult = await Filesystem.writeFile({
          path: filename,
          data: csvContent,
          directory: Directory.Cache,
          encoding: Encoding.UTF8
        });

        // Share the file using Capacitor's native share sheet
        await Share.share({
          title: `Fleet Logger Report - ${reportMonth}`,
          url: writeResult.uri,
          dialogTitle: `Share Fleet Logger Report`
        });
        
        showToast("Report shared successfully!", "success");
        return;
      } catch (err) {
        console.error("Capacitor native share failed:", err);
        showToast("Native share failed, attempting browser download...", "error");
      }
    }

    // Fallback to traditional browser download
    downloadCSVFile(reportEntries, filename);
  };

  // Fetch from Cloud Firestore (if authenticated) or Express API
  const fetchEntries = async () => {
    try {
      if (auth.currentUser) {
        try {
          const q = query(
            collection(db, "entries"),
            where("userId", "==", auth.currentUser.uid)
          );
          const querySnapshot = await getDocs(q);
          const fbEntries: DutyEntry[] = [];
          querySnapshot.forEach((docSnapshot) => {
            fbEntries.push(docSnapshot.data() as DutyEntry);
          });
          
          fbEntries.sort((a, b) => {
            const dateCompare = (b.date || "").localeCompare(a.date || "");
            if (dateCompare !== 0) return dateCompare;
            return (b.createdAt || 0) - (a.createdAt || 0);
          });
          
          setEntries(fbEntries);
          localStorage.setItem("fleet_entries", JSON.stringify(fbEntries));
          return;
        } catch (fbErr: any) {
          console.warn("Firestore fetch failed, checking local server... Error:", fbErr);
          handleFirestoreError(fbErr, OperationType.GET, "entries");
        }
      }

      const res = await fetch(getApiUrl("/api/entries"));
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
        localStorage.setItem("fleet_entries", JSON.stringify(data));
      } else {
        // Fallback to local cache
        const local = localStorage.getItem("fleet_entries");
        if (local) setEntries(JSON.parse(local));
      }
    } catch (e) {
      const local = localStorage.getItem("fleet_entries");
      if (local) setEntries(JSON.parse(local));
    }
  };

  // Synchronize offline queue to API or Firestore
  const syncOfflineQueue = async () => {
    if (syncQueue.length === 0) return;
    const queue = [...syncQueue];
    let itemsProcessedCount = 0;

    for (const action of queue) {
      try {
        if (auth.currentUser) {
          if (action.type === "upsert" && action.payload) {
            await setDoc(doc(db, "entries", action.payload.id), {
              ...action.payload,
              userId: auth.currentUser.uid
            });
          } else if (action.type === "delete" && action.id) {
            await deleteDoc(doc(db, "entries", action.id));
          }
          itemsProcessedCount++;
        } else {
          let res;
          if (action.type === "upsert") {
            res = await fetch(getApiUrl("/api/entries"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(action.payload)
            });
          } else if (action.type === "delete") {
            res = await fetch(getApiUrl(`/api/entries/${action.id}`), {
              method: "DELETE"
            });
          }

          if (res && res.ok) {
            itemsProcessedCount++;
          } else {
            break; // Stop syncing if server isn't reachable
          }
        }
      } catch (err) {
        break; // Stop syncing if service isn't reachable
      }
    }

    if (itemsProcessedCount > 0) {
      const remaining = queue.slice(itemsProcessedCount);
      setSyncQueue(remaining);
      localStorage.setItem("fleet_sync_queue", JSON.stringify(remaining));
      showToast(`Synced ${itemsProcessedCount} offline duty entries with Cloud.`, "success");
      fetchEntries();
    }
  };

  // Queues write/delete operation
  const pushToQueue = (operation: { type: "upsert" | "delete"; id?: string; payload?: any }) => {
    const updated = [...syncQueue, operation];
    setSyncQueue(updated);
    localStorage.setItem("fleet_sync_queue", JSON.stringify(updated));
  };

  // Initialize Speech Recognition
  // Silence-detection: auto-stop listening SILENCE_TIMEOUT_MS after the last
  // final transcript. When the timer fires we both stop the recognizer AND
  // immediately parse the captured transcript — without the parse call, the
  // app would silently swallow the user's dictation.
  const SILENCE_TIMEOUT_MS = 2200;
  const armSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      // Auto-stop if still listening (works for both browser and cloud ASR).
      if (!isListeningRef.current) return;
      const finalText = (transcriptRef.current || "").trim();
      const interimText = (interimTranscriptRef.current || "").trim();
      const combined = (finalText + " " + interimText).trim();
      // Browser STT: stop the recognizer (it triggers onend -> final parse).
      // Cloud STT : stop the MediaRecorder (its onstop handler posts to /api/transcribe).
      const wasCloud = settings.sttEngine === "cloud";
      isListeningRef.current = false;
      setIsListening(false);
      if (browserSpeechMaxTimerRef.current) {
        clearTimeout(browserSpeechMaxTimerRef.current);
        browserSpeechMaxTimerRef.current = null;
      }
      try { wasCloud ? cloudAsrRecorderRef.current?.stop() : recognitionRef.current?.stop(); } catch (e) {}
      if (combined && combined.length > 1) {
        if (!wasCloud) {
          showToast("Auto-stopped (silence). Parsing…", "info");
          void parseTranscriptWithAI(combined);
        }
      } else {
        showToast("Didn't catch that. Try again or type below.", "info");
      }
    }, SILENCE_TIMEOUT_MS);
  };

  // When the browser doesn't support Web Speech API (e.g. some mobile browsers,
  // or environments where mic permission is denied), fall back to recording audio
  // and posting it to /api/transcribe which calls NIM Whisper Large v3.
  const cloudAsrChunksRef = useRef<Blob[]>([]);
  const cloudAsrRecorderRef = useRef<MediaRecorder | null>(null);
  const cloudAsrSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudAsrMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudAsrAudioCtxRef = useRef<AudioContext | null>(null);
  const cloudAsrAnalyserRef = useRef<AnalyserNode | null>(null);
  const cloudAsrRafRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);

  const stopCloudAsrRecording = () => {
    if (cloudAsrSilenceTimerRef.current) { clearTimeout(cloudAsrSilenceTimerRef.current); cloudAsrSilenceTimerRef.current = null; }
    if (cloudAsrMaxTimerRef.current) { clearTimeout(cloudAsrMaxTimerRef.current); cloudAsrMaxTimerRef.current = null; }
    if (cloudAsrRafRef.current) { cancelAnimationFrame(cloudAsrRafRef.current); cloudAsrRafRef.current = null; }
    if (cloudAsrAudioCtxRef.current) { try { cloudAsrAudioCtxRef.current.close(); } catch (e) {} cloudAsrAudioCtxRef.current = null; }
    cloudAsrAnalyserRef.current = null;
    setMicVolume(0);
  };

  const startCloudAsrRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg");
      const recorder = new MediaRecorder(stream, { mimeType });
      cloudAsrChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) cloudAsrChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopCloudAsrRecording();
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(cloudAsrChunksRef.current, { type: mimeType });
        if (blob.size < 100) {
          showToast("No audio captured. Try again.", "info");
          return;
        }
        setIsProcessing(true);
        try {
          const reader = new FileReader();
          const b64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const res = await fetch(getApiUrl("/api/transcribe"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: b64, mimeType, language: settings.speechLanguage }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Server error" }));
            showToast(`Cloud STT failed: ${err.error || "Unknown"}. Use the text box below.`, "error");
            return;
          }
          const data = await res.json();
          const text = (data?.transcript || "").trim();
          if (text) {
            setTranscript(text);
            await parseTranscriptWithAI(text);
          } else {
            showToast("Cloud STT returned no speech. Try again.", "info");
          }
        } catch (e: any) {
          showToast(`Cloud STT error: ${e?.message || e}`, "error");
        } finally {
          setIsProcessing(false);
        }
      };

      cloudAsrRecorderRef.current = recorder;
      recorder.start(500);  // collect chunks every 500ms
      setIsListening(true);
      isListeningRef.current = true;
      hasSpokenRef.current = false;
      // Do not arm the browser speech recognizer silence timer (armSilenceTimer) for the cloud flow,
      // as the cloud flow does not compile transcripts in real time, which would cause an immediate 2.2s cutoff.

      // Audio-level silence detection. We tap into the same MediaStream via an
      // AudioContext, feed it through an AnalyserNode, and watch the time-domain
      // RMS in a requestAnimationFrame loop. When the level stays below threshold
      // for SILENCE_TIMEOUT_MS, we auto-stop.
      const SILENCE_THRESHOLD = 0.015;  // RMS amplitude below this counts as silence
      const SILENCE_TIMEOUT_MS = 1600;  // 1.6s of silence to auto-stop
      const MAX_DURATION_MS = 25000;    // hard cap to avoid runaway recordings
      try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
          const ctx: AudioContext = new Ctx();
          if (ctx.state === "suspended") {
            ctx.resume();
          }
          cloudAsrAudioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          cloudAsrAnalyserRef.current = analyser;
          const buf = new Float32Array(analyser.fftSize);
          let lastLoud = performance.now();
          const tick = () => {
            if (!cloudAsrAnalyserRef.current) return;
            cloudAsrAnalyserRef.current.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const rms = Math.sqrt(sum / buf.length);
            if (rms > SILENCE_THRESHOLD) {
              lastLoud = performance.now();
              hasSpokenRef.current = true;
            }
            setMicVolume(rms);
            if (hasSpokenRef.current && (performance.now() - lastLoud > SILENCE_TIMEOUT_MS)) {
              if (cloudAsrRecorderRef.current && cloudAsrRecorderRef.current.state === "recording") {
                cloudAsrRecorderRef.current.stop();
                setIsListening(false);
                isListeningRef.current = false;
                showToast("Auto-stopped (silence detected).", "info");
              }
              return;
            }
            cloudAsrRafRef.current = requestAnimationFrame(tick);
          };
          cloudAsrRafRef.current = requestAnimationFrame(tick);
        }
      } catch (e) {
        console.warn("Audio level detection unavailable, falling back to fixed timeout", e);
      }

      // Hard cap so we never record more than MAX_DURATION_MS.
      cloudAsrMaxTimerRef.current = setTimeout(() => {
        if (cloudAsrRecorderRef.current && cloudAsrRecorderRef.current.state === "recording") {
          cloudAsrRecorderRef.current.stop();
          setIsListening(false);
          isListeningRef.current = false;
          showToast("Max recording length reached.", "info");
        }
      }, MAX_DURATION_MS);
    } catch (err: any) {
      console.error("Cloud ASR mic error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showToast("Mic permission denied. Please grant microphone access.", "error");
      } else {
        showToast(`Mic error: ${err.message || err.name}`, "error");
      }
    }
  };

  const startBrowserSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Fall back to NIM Whisper via /api/transcribe
      startCloudAsrRecording();
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = settings.speechLanguage;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setTranscript("");
      setInterimTranscript("");
      
      if (browserSpeechMaxTimerRef.current) clearTimeout(browserSpeechMaxTimerRef.current);
      browserSpeechMaxTimerRef.current = setTimeout(() => {
        if (isListeningRef.current) {
          isListeningRef.current = false;
          setIsListening(false);
          try { recognitionRef.current?.stop(); } catch (e) {}
          if (browserSpeechMaxTimerRef.current) {
            clearTimeout(browserSpeechMaxTimerRef.current);
            browserSpeechMaxTimerRef.current = null;
          }
          showToast("Max recording length reached.", "info");
        }
      }, 25000);
    };

    rec.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (final) {
        setTranscript((prev) => (prev + final).trimStart());
      }
      // Re-arm silence timer on any result (final or interim) to prevent early cutoff
      armSilenceTimer();
      // Live incremental parse preview: as the user speaks, debounce-fire a
      // parse on the running transcript + interim so the draft card updates
      // in real time. We only show incremental results when no draft card is
      // already on screen, to avoid clobbering a save in progress.
      const liveFinal = transcriptRef.current;
      const liveInterim = (interim || "").trim();
      const liveCombined = ((liveFinal + " " + liveInterim).trim());
      if (liveCombined.length > 14 && isListeningRef.current) {
        if (liveParseTimerRef.current) clearTimeout(liveParseTimerRef.current);
        liveParseTimerRef.current = setTimeout(() => {
          if (isListeningRef.current && draftCardsRef.current.length === 0) {
            void parseTranscriptWithAI(liveCombined);
          }
        }, 1100);
      }
      setInterimTranscript(interim);
    };

    rec.onerror = (e: any) => {
      console.error("STT Error:", e);
      console.warn("[mic] SpeechRecognition error:", e?.error, e);
      if (browserSpeechMaxTimerRef.current) {
        clearTimeout(browserSpeechMaxTimerRef.current);
        browserSpeechMaxTimerRef.current = null;
      }
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        // Browser STT was rejected (often because this browser blocks it entirely,
        // e.g. in-app webviews, or because the user denied the page permission).
        // We CAN still record audio directly via getUserMedia and send it to our
        // cloud STT — that needs a different permission scope. Try that path.
        setIsListening(false);
        isListeningRef.current = false;
        try { rec.stop(); } catch (e2) {}
        try { recognitionRef.current?.stop(); } catch (e2) {}
        recognitionRef.current = null;
        // Wait a beat so the previous recognizer fully tears down before the
        // cloud recorder claims the same mic.
        setTimeout(() => startCloudAsrRecording(), 300);
      } else if (e.error === "no-speech") {
        // Quietly ignore — auto-restart will keep listening
      } else if (e.error === "audio-capture") {
        showToast("No microphone detected. Connect a mic and try again.", "error");
        setIsListening(false);
        isListeningRef.current = false;
      } else if (e.error === "network") {
        setIsListening(false);
        isListeningRef.current = false;
        // Stop the broken browser recognizer, then kick off cloud ASR.
        try { rec.stop(); } catch (e2) {}
        try { recognitionRef.current?.stop(); } catch (e2) {}
        recognitionRef.current = null;
        setTimeout(() => startCloudAsrRecording(), 250);
      } else {
        showToast("Speech Engine error: " + e.error, "error");
        setIsListening(false);
        isListeningRef.current = false;
      }
    };

    rec.onend = () => {
      // If we still think we're listening, the recognizer ended unexpectedly
      // (e.g. the browser cut us off). Auto-restart so the user doesn't lose
      // their place.
      if (isListeningRef.current) {
        try {
          recognitionRef.current?.start();
        } catch (e) {}
        return;
      }
      if (browserSpeechMaxTimerRef.current) {
        clearTimeout(browserSpeechMaxTimerRef.current);
        browserSpeechMaxTimerRef.current = null;
      }
      setIsListening(false); // Sync state with ref on final end
      // The recognizer has fully ended AND we don't want to restart — this is
      // our final safety-net parse. If the silence timer or toggle-stop path
      // already parsed, parseTranscriptWithAI is a no-op on empty input.
      const finalText = (transcriptRef.current || "").trim();
      if (finalText.length > 1) {
        void parseTranscriptWithAI(finalText);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      // Do not arm initial silence timer here; let the browser SpeechRecognition run until
      // the first word is spoken (or the 25-second hard cap expires), to prevent early cutoff.
    } catch (e: any) {
      console.error("Failed to start speech recognition:", e);
      isListeningRef.current = false;
      setIsListening(false);
      // Fall back to cloud STT (NIM Whisper) on any start failure
      setTimeout(() => startCloudAsrRecording(), 250);
    }
  };

  // Handle Voice button toggle
  const toggleListening = async () => {
    console.log("[mic] tap registered, isListening=", isListeningRef.current);
    if (isListeningRef.current) {
      // STOP LISTENING & PROCESS TRANSCRIPT
      setIsListening(false);
      isListeningRef.current = false;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (browserSpeechMaxTimerRef.current) {
        clearTimeout(browserSpeechMaxTimerRef.current);
        browserSpeechMaxTimerRef.current = null;
      }

      if (settings.sttEngine === "cloud") {
        if (cloudAsrRecorderRef.current && cloudAsrRecorderRef.current.state === "recording") {
          try { cloudAsrRecorderRef.current.stop(); } catch (e) {}
        }
        stopCloudAsrRecording();
      } else {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
          recognitionRef.current = null;
        }
        // Parse whatever final transcript we already captured from the live browser session
        const stopFinal = (transcriptRef.current || "").trim();
        const stopInterim = (interimTranscriptRef.current || "").trim();
        const stopCombined = (stopFinal + " " + stopInterim).trim();
        if (stopCombined.length > 1) {
          void parseTranscriptWithAI(stopCombined);
        } else {
          showToast("Nothing captured. Try again or type below.", "info");
        }
      }
      return;
    } else {
      // START LISTENING
      setTranscript("");
      setInterimTranscript("");
      setDraftCards([]);

      // Mic permission check up front — fail fast with a clear toast so the user
      // isn't left wondering why "tap to record" did nothing.
      try {
        if (navigator?.mediaDevices?.getUserMedia) {
          // Probe permission state without committing to a stream.
          let permState: string | null = null;
          try {
            // @ts-ignore - permissions API not in all browsers
            const perm = await navigator.permissions?.query?.({ name: "microphone" as any });
            permState = perm?.state || null;
          } catch (e) { /* permissions API not available */ }
          if (permState === "denied") {
            showToast("Microphone permission is blocked. Open browser site settings to allow it.", "error");
            return;
          }
        }
      } catch (e) {
        console.warn("[mic] permission check failed", e);
      }

      // Pick the STT engine: cloud (parakeet via /api/transcribe) is the default
      // because it's reliable + works the same way on web and inside Chrome WebView.
      // Browser Web Speech is kept as an opt-in fallback for users who explicitly
      // want it (e.g. offline demo), but we no longer make it the silent default.
      if (settings.sttEngine === "cloud") {
        await startCloudAsrRecording();
      } else {
        startBrowserSpeech();
      }
    }
  };

  // Parse transcribed text into structured logs with AI.
  // Normalize any extraction result (from local parser or LLM) into draft cards
  const buildDraftCards = (entries: any[]): any[] => {
    return entries
      .filter((e: any) => e && (e.carNumber || e.duty || e.inTime || e.outTime))
      .map((entry: any) => {
        const carNum = entry.carNumber || settings.defaultCar || "";
        const hasCar = !!carNum;
        const dutyText = entry.duty || "";
        const hasDuty = !!dutyText;
        return {
          id: crypto.randomUUID(),
          date: entry.date || new Date().toISOString().split("T")[0],
          carNumber: carNum,
          duty: dutyText,
          inTime: entry.inTime ? normalizeTimeTo24h(String(entry.inTime)) : "09:00",
          outTime: entry.outTime ? normalizeTimeTo24h(String(entry.outTime)) : "18:00",
          inKm: entry.inKm != null && entry.inKm !== 0 && entry.inKm !== "" ? Number(entry.inKm) : null,
          outKm: entry.outKm != null && entry.outKm !== 0 && entry.outKm !== "" ? Number(entry.outKm) : null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          // Flags for missing items
          _missingCar: !hasCar,
          _missingDuty: !hasDuty,
          _source: entry._source || "ai",
        };
      });
  };

  // Hybrid parser: local rule-based first, LLM fallback for ambiguity.
  const parseTranscriptWithAI = async (textToParse: string) => {
    setIsProcessing(true);
    const startTime = performance.now();
    try {
      // 1. Try the local rule-based parser first (sub-50ms, handles 80% of dictation).
      const localDrafts = parseLocal(textToParse, { defaultCar: settings.defaultCar });
      const localReliable = isLocalParseReliable(localDrafts, textToParse);

      if (localReliable && localDrafts.length > 0) {
        const elapsed = (performance.now() - startTime).toFixed(0);
        const parsed = buildDraftCards(localDrafts.map((d) => ({ ...d, _source: "local" })));
        if (parsed.length > 0) {
          setDraftCards(parsed);
          showToast(`Extracted ${parsed.length} draft${parsed.length > 1 ? "s" : ""} locally in ${elapsed}ms.`, "success");
          if (settings.ttsConfirmation && parsed[0] && !isListeningRef.current) {
            speak(buildBatchReadback(parsed), settings.speechLanguage);
          }
          const indexMissing = parsed.findIndex((p: any) => p._missingCar || p._missingDuty);
          setActiveFollowUpIndex(indexMissing !== -1 ? indexMissing : null);
          if (indexMissing !== -1 && !isListeningRef.current) {
            const q = buildFollowUpQuestion(parsed[indexMissing]);
            if (q) {
              setTimeout(() => {
                if (!isListeningRef.current) {
                  speak(q, settings.speechLanguage);
                }
              }, 2200);
            }
          }
          return;
        }
      }

      // 2. Local parse was inconclusive — fall back to the LLM.
      const res = await fetch(getApiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: textToParse,
          currentDateISO: new Date().toISOString().split("T")[0],
          currentDayOfWeek: new Date().toLocaleDateString("en-US", { weekday: "long" }),
          defaultCar: settings.defaultCar,
          language: SUPPORTED_LANGUAGES.find(l => l.code === settings.speechLanguage)?.label || "Mixed Language"
        })
      });

      if (res.ok) {
        const result = await res.json();
        if (result.entries && result.entries.length > 0) {
          // Merge local + LLM results when both have useful data
          const llmCards = buildDraftCards(result.entries.map((e: any) => ({ ...e, _source: "llm" })));
          // If local parse found partial data and LLM disagrees on duty/car, prefer LLM.
          // For everything else, just use LLM output.
          const parsed = llmCards.length > 0 ? llmCards : buildDraftCards(localDrafts);
          if (parsed.length > 0) {
            setDraftCards(parsed);
            const elapsed = (performance.now() - startTime).toFixed(0);
            showToast(`Extracted ${parsed.length} draft${parsed.length > 1 ? "s" : ""} via AI in ${elapsed}ms.`, "success");
            if (settings.ttsConfirmation && parsed[0] && !isListeningRef.current) {
              const verbal = buildBatchReadback(parsed);
              speak(verbal, settings.speechLanguage);
            }
            const indexMissing = parsed.findIndex((p: any) => p._missingCar || p._missingDuty);
            setActiveFollowUpIndex(indexMissing !== -1 ? indexMissing : null);
            // If the LLM also handled a missing-field follow-up, ask via the agent
            if (indexMissing !== -1 && !isListeningRef.current) {
              const q = buildFollowUpQuestion(parsed[indexMissing]);
              if (q) {
                setTimeout(() => {
                  if (!isListeningRef.current) {
                    speak(q, settings.speechLanguage);
                  }
                }, 2200);
              }
            }
            return;
          }
          showToast("No duty log entries parsed from speech. Please speak clearly.", "info");
        } else if (localDrafts.length > 0) {
          // LLM returned empty but local had partial data — use local
          const parsed = buildDraftCards(localDrafts.map((d) => ({ ...d, _source: "local" })));
          if (parsed.length > 0) {
            setDraftCards(parsed);
            showToast(`Extracted ${parsed.length} draft${parsed.length > 1 ? "s" : ""} from local rules.`, "info");
            return;
          }
          showToast("No duty log entries parsed from speech. Please speak clearly.", "info");
        } else {
          showToast("No duty log entries parsed from speech. Please speak clearly.", "info");
        }
      } else {
        // LLM failed — fall back to whatever local produced
        if (localDrafts.length > 0) {
          const parsed = buildDraftCards(localDrafts.map((d) => ({ ...d, _source: "local" })));
          if (parsed.length > 0) {
            setDraftCards(parsed);
            showToast(`AI extraction failed. Used local rules for ${parsed.length} draft${parsed.length > 1 ? "s" : ""}.`, "info");
            return;
          }
        }
        showToast("AI extraction service error. Please try again or use manual mode.", "error");
      }
    } catch (e) {
      console.error("Parser error:", e);
      showToast("Cannot connect to AI extraction service.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualTranscriptSubmit = async () => {
    const textToParse = manualTranscriptInput.trim();
    if (!textToParse) {
      showToast("Please enter some dictation notes to parse.", "info");
      return;
    }
    setTranscript(textToParse);
    setInterimTranscript("");
    setManualTranscriptInput("");
    await parseTranscriptWithAI(textToParse);
  };

  // Submit and save the calculated drafts
  const handleSaveDraftCards = async () => {
    if (draftCards.length === 0) return;
    const savedCards = [...draftCards];  // capture before clearing

    // Check critical warnings
    const incomplete = savedCards.some(d => !d.carNumber || !d.duty);
    if (incomplete) {
      if (!confirm("Some draft logs are missing Car Plates or Duty descriptions. Save anyway?")) {
        return;
      }
    }

    const payload = savedCards.map(item => {
      // Remove temporary key highlights before saving
      const { _missingCar, _missingDuty, ...clean } = item as any;
      return {
        ...clean,
        inKm: clean.inKm !== null ? Number(clean.inKm) : 0,
        outKm: clean.outKm !== null ? Number(clean.outKm) : 0,
      };
    });

    try {
      // Save locally instantly
      const currentLocal = [...entries];
      payload.forEach(item => {
        currentLocal.unshift(item); // Insert newest at very top
      });
      setEntries(currentLocal);
      localStorage.setItem("fleet_entries", JSON.stringify(currentLocal));

      // Sync online or add to sync queue
      if (auth.currentUser) {
        try {
          for (const item of payload) {
            await setDoc(doc(db, "entries", item.id), {
              ...item,
              userId: auth.currentUser.uid
            });
          }
          showToast("Duty logs saved securely to Firestore.", "success");
        } catch (fbErr: any) {
          console.warn("Direct Firestore save failed, using local offline fallback:", fbErr);
          payload.forEach(item => pushToQueue({ type: "upsert", payload: { ...item, userId: auth.currentUser!.uid } }));
          showToast("Firestore offline cache active. Queued for background sync.", "info");
        }
      } else {
        if (isOnline && settings.serverSync) {
          const res = await fetch(getApiUrl("/api/entries"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            showToast("Duty logs saved & synchronized safely.", "success");
          } else {
            payload.forEach(item => pushToQueue({ type: "upsert", payload: item }));
            showToast("Saved locally. Added to background sync queue.", "info");
          }
        } else {
          payload.forEach(item => pushToQueue({ type: "upsert", payload: item }));
          showToast("Saved offline locally. Synced value queued.", "info");
        }
      }

      // Reset
      setDraftCards([]);
      setTranscript("");
      setActiveFollowUpIndex(null);
      fetchEntries(); // Refresh
    } catch (e) {
      if (auth.currentUser) {
        payload.forEach(item => pushToQueue({ type: "upsert", payload: { ...item, userId: auth.currentUser!.uid } }));
      } else {
        payload.forEach(item => pushToQueue({ type: "upsert", payload: item }));
      }
      showToast("Logged offline successfully.", "info");
    }
  };

  // Handle follow up answering chatbot logic
  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeFollowUpIndex === null || !followUpAnswer) return;

    const cards = [...draftCards];
    const item = { ...cards[activeFollowUpIndex] };

    // Update according to what was missing
    if (item._missingCar) {
      item.carNumber = followUpAnswer.toUpperCase();
      item._missingCar = false;
    } else if (item._missingDuty) {
      item.duty = followUpAnswer;
      item._missingDuty = false;
    } else {
      // Append generally
      item.duty = item.duty ? `${item.duty} (${followUpAnswer})` : followUpAnswer;
    }

    cards[activeFollowUpIndex] = item;
    setDraftCards(cards);
    setFollowUpAnswer("");

    // Find next missing
    const nextIdx = cards.findIndex((p: any) => p._missingCar || p._missingDuty);
    if (nextIdx !== -1) {
      setActiveFollowUpIndex(nextIdx);
    } else {
      setActiveFollowUpIndex(null);
    }

    showToast("Draft card updated successfully.", "success");
  };

  // Switch follow up via micro-interaction click
  const selectNextFollowUp = (index: number) => {
    setActiveFollowUpIndex(index);
  };

  // Update specific draft input fields manually in voice cards
  const updateDraftField = (index: number, field: keyof DutyEntry, value: any) => {
    const cards = [...draftCards];
    cards[index] = { ...cards[index], [field]: value };
    setDraftCards(cards);
  };

  // Manual fallback form submitting
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.carNumber.trim()) {
      showToast("Car Number Plate is required.", "error");
      return;
    }
    if (!manualForm.duty.trim()) {
      showToast("Duty Details purpose is required.", "error");
      return;
    }

    const payload: DutyEntry = {
      id: crypto.randomUUID(),
      date: manualForm.date,
      carNumber: manualForm.carNumber.trim().toUpperCase(),
      duty: manualForm.duty.trim(),
      inTime: manualForm.inTime,
      outTime: manualForm.outTime,
      inKm: manualForm.inKm !== "" ? Number(manualForm.inKm) : 0,
      outKm: manualForm.outKm !== "" ? Number(manualForm.outKm) : 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: "client_manual"
    };

    // Save state instantly
    const nextLocal = [payload, ...entries];
    setEntries(nextLocal);
    localStorage.setItem("fleet_entries", JSON.stringify(nextLocal));

    try {
      if (auth.currentUser) {
        try {
          await setDoc(doc(db, "entries", payload.id), {
            ...payload,
            userId: auth.currentUser.uid
          });
          showToast("Manual duty log registered securely in Firestore.", "success");
        } catch (fbErr: any) {
          console.warn("Firestore manual save failed, using fallback:", fbErr);
          pushToQueue({ type: "upsert", payload: { ...payload, userId: auth.currentUser.uid } });
          showToast("Saved local cache. Queued for background sync.", "info");
        }
      } else {
        if (isOnline && settings.serverSync) {
          const res = await fetch(getApiUrl("/api/entries"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            showToast("Manual duty log registered successfully.", "success");
          } else {
            pushToQueue({ type: "upsert", payload });
            showToast("Saved locally. Queued for background sync.", "info");
          }
        } else {
          pushToQueue({ type: "upsert", payload });
          showToast("Saved offline locally.", "info");
        }
      }

      // Reset
      setManualForm({
        date: new Date().toISOString().split("T")[0],
        carNumber: "",
        duty: "",
        inTime: "09:00",
        outTime: "18:00",
        inKm: "",
        outKm: ""
      });
      fetchEntries();
    } catch (err) {
      pushToQueue({ type: "upsert", payload });
      showToast("Saved offline locally.", "info");
    }
  };

  // Trigger inline history edit
  const startEditing = (entry: DutyEntry) => {
    setEditingEntryId(entry.id);
    setEditingData({ ...entry });
  };

  // Save inline edits
  const saveEntryChanges = async (id: string) => {
    const original = entries.find(x => x.id === id);
    if (!original) return;

    const updatedItem = {
      ...original,
      ...editingData,
      updatedAt: Date.now()
    } as DutyEntry;

    // Update state instantly
    const nextEntries = entries.map(item => item.id === id ? updatedItem : item);
    setEntries(nextEntries);
    localStorage.setItem("fleet_entries", JSON.stringify(nextEntries));

    try {
      if (auth.currentUser) {
        try {
          await setDoc(doc(db, "entries", id), {
            ...updatedItem,
            userId: auth.currentUser.uid
          }, { merge: true });
          showToast("Duty log updated securely in Firestore.", "success");
        } catch (fbErr: any) {
          console.warn("Firestore update failed, queueing offline fallback:", fbErr);
          pushToQueue({ type: "upsert", payload: { ...updatedItem, userId: auth.currentUser.uid } });
          showToast("Saved local changes. Added to background sync.", "info");
        }
      } else {
        if (isOnline && settings.serverSync) {
          const res = await fetch(getApiUrl(`/api/entries/${id}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedItem)
          });
          if (res.ok) {
            showToast("Duty log updated successfully.", "success");
          } else {
            pushToQueue({ type: "upsert", payload: updatedItem });
            showToast("Saved local changes. Added to background sync.", "info");
          }
        } else {
          pushToQueue({ type: "upsert", payload: updatedItem });
          showToast("Saved local offline changes.", "info");
        }
      }
      setEditingEntryId(null);
      fetchEntries();
    } catch (e) {
      if (auth.currentUser) {
        pushToQueue({ type: "upsert", payload: { ...updatedItem, userId: auth.currentUser.uid } });
      } else {
        pushToQueue({ type: "upsert", payload: updatedItem });
      }
      showToast("Offline update complete.", "info");
      setEditingEntryId(null);
    }
  };

  // Delete log entry with double check
  const deleteEntryLog = async (id: string, car: string, date: string) => {
    if (!confirm(`Are you sure you want to permanently delete vehicle entry ${car} on ${date}?`)) {
      return;
    }

    const nextEntries = entries.filter(item => item.id !== id);
    setEntries(nextEntries);
    localStorage.setItem("fleet_entries", JSON.stringify(nextEntries));

    try {
      if (auth.currentUser) {
        try {
          await deleteDoc(doc(db, "entries", id));
          showToast("Duty log deleted securely from Firestore.", "success");
        } catch (fbErr: any) {
          console.warn("Firestore delete failed, queueing offline fallback:", fbErr);
          pushToQueue({ type: "delete", id });
          showToast("Deleted locally. Saved deletion sync.", "info");
        }
      } else {
        if (isOnline && settings.serverSync) {
          const res = await fetch(getApiUrl(`/api/entries/${id}`), {
            method: "DELETE"
          });
          if (res.ok) {
            showToast("Duty log deleted successfully.", "success");
          } else {
            pushToQueue({ type: "delete", id });
            showToast("Deleted locally. Queued server removal.", "info");
          }
        } else {
          pushToQueue({ type: "delete", id });
          showToast("Deleted offline. Saved deletion sync.", "info");
        }
      }
      fetchEntries();
    } catch (e) {
      pushToQueue({ type: "delete", id });
      showToast("Deleted locally.", "info");
    }
  };

  // Danger Zone Database Wiping
  const handleClearDatabase = async () => {
    const confirmation1 = confirm("⚠️ DANGER ZONE: This will wipe ALL synced server rows and permanent local lists. Continue?");
    if (!confirmation1) return;
    
    const confirmation2 = confirm("CONFIRM AGAIN: Are you absolutely certain? This operation is completely irreversible.");
    if (!confirmation2) return;

    try {
      if (auth.currentUser) {
        try {
          const q = query(collection(db, "entries"), where("userId", "==", auth.currentUser.uid));
          const querySnapshot = await getDocs(q);
          for (const docSnapshot of querySnapshot.docs) {
            await deleteDoc(doc(db, "entries", docSnapshot.id));
          }
          showToast("Firestore entries wiped clean.", "success");
        } catch (fbErr: any) {
          console.warn("Firestore wipe failed:", fbErr);
          showToast("Failed to empty Cloud DB.", "error");
        }
      } else {
        if (isOnline) {
          const res = await fetch(getApiUrl("/api/entries/clear"), { method: "POST" });
          if (res.ok) {
            showToast("Database successfully deleted clean.", "success");
          } else {
            showToast("Failed to empty Cloud DB. Wiping locally.", "error");
          }
        }
      }
      
      setEntries([]);
      setSyncQueue([]);
      localStorage.setItem("fleet_entries", JSON.stringify([]));
      localStorage.setItem("fleet_sync_queue", JSON.stringify([]));
      showToast("Local cache reset clean.", "success");
    } catch (err) {
      showToast("Offline clear completed.", "success");
    }
  };

  // Autocomplete vehicle matchers helper
  const uniqueCarNumbers = Array.from(new Set(entries.map(e => e.carNumber))).filter(Boolean);

  // Group and Filter history items
  const filteredHistoryEntries = entries.filter(entry => {
    const searchLower = historySearch.toLowerCase();
    const matchSearch =
      (entry.carNumber || "").toLowerCase().includes(searchLower) ||
      (entry.duty || "").toLowerCase().includes(searchLower) ||
      (entry.date || "").includes(searchLower);

    if (!matchSearch) return false;

    // Date chips check
    if (dateFilterChip === "all") return true;
    const itemDate = new Date(entry.date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - itemDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (dateFilterChip === "7") return diffDays <= 7;
    if (dateFilterChip === "30") return diffDays <= 30;
    if (dateFilterChip === "90") return diffDays <= 90;

    return true;
  });

  // Unique sorted dates
  const groupedHistoryDates = (Array.from(new Set(filteredHistoryEntries.map(e => e.date))) as string[]).sort(
    (a, b) => b.localeCompare(a)
  );

  // Calculate stats for report view matching YYYY-MM
  const reportEntries = entries.filter(e => e.date.startsWith(reportMonth));

  const reportStats = reportEntries.reduce(
    (acc, cur) => {
      acc.hours += calculateTotalHours(cur.inTime, cur.outTime);
      acc.km += calculateTotalKm(cur.inKm, cur.outKm);
      acc.trips++;
      return acc;
    },
    { hours: 0, km: 0, trips: 0 }
  );

  // Car list aggregations
  const carAggregates: {
    [car: string]: { trips: number; hours: number; km: number; speeds: number[] };
  } = {};

  reportEntries.forEach(entry => {
    const carNum = entry.carNumber || "UNKNOWN";
    const hours = calculateTotalHours(entry.inTime, entry.outTime);
    const km = calculateTotalKm(entry.inKm, entry.outKm);

    if (!carAggregates[carNum]) {
      carAggregates[carNum] = { trips: 0, hours: 0, km: 0, speeds: [] };
    }

    carAggregates[carNum].trips += 1;
    carAggregates[carNum].hours += hours;
    carAggregates[carNum].km += km;
    if (hours > 0) {
      carAggregates[carNum].speeds.push(km / hours);
    }
  });

  // Daily distance aggregator for selected month
  const getDailyDistances = () => {
    if (!reportMonth) return [];
    const [year, month] = reportMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const dayEntries = entries.filter(e => e.date === dateStr);
      const distance = dayEntries.reduce((sum, e) => sum + calculateTotalKm(e.inKm, e.outKm), 0);
      return { day: dayNum, distance };
    });
  };

  // Top drivers statistics leaderboard
  const getDriverLeaderboard = () => {
    const driverStats: Record<string, { name: string; trips: number; km: number }> = {};
    const monthEntries = entries.filter(e => e.date.startsWith(reportMonth));
    
    monthEntries.forEach(e => {
      const driver = e.driverName || "Unknown Driver";
      if (!driverStats[driver]) {
        driverStats[driver] = { name: driver, trips: 0, km: 0 };
      }
      driverStats[driver].trips += 1;
      driverStats[driver].km += calculateTotalKm(e.inKm, e.outKm);
    });
    
    return Object.values(driverStats).sort((a, b) => b.km - a.km);
  };

  if (showBoot) {
    return <AestheticBootLoader onComplete={() => setShowBoot(false)} />;
  }

  return (
    <div className="flex flex-col h-dvh w-full bg-[#080d1a] text-[#f8fafc] font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* Toast Notification — compact, top-right, RED for errors */}
      {toast && (
        <div id="applet-toast" className="fixed top-20 right-4 z-[100] animate-slide-in pointer-events-none select-none max-w-[60%]">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md border shadow-lg shadow-black/40 ${
              toast.type === "error"
                ? "bg-rose-950/80 border-rose-500/40"
                : "bg-slate-950/85 border-white/10"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              toast.type === "success" ? "bg-emerald-400 animate-pulse"
                : toast.type === "error" ? "bg-rose-400"
                : "bg-cyan-400"
            }`} />
            <p className={`text-[9px] font-sans tracking-wide font-semibold leading-none ${
              toast.type === "error" ? "text-rose-100" : "text-slate-200"
            }`}>{toast.message}</p>
          </div>
        </div>
      )}

      {/* Top Header — line-free, symmetric 3-col layout with mirrored pills */}
      <header className="relative grid grid-cols-3 items-center gap-3 px-4 pt-safe pb-6 backdrop-blur-xl bg-[#080d1a]/80 sticky top-0 z-40 shrink-0">
        {/* Soft gradient fade replaces the hard border line */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-[#080d1a]" />

        {/* Left: BrandMark — glassmorphic V permanent monogram, mirrors the
            user-icon button at the right edge (same w-8 h-8, same row,
            symmetric justify-start vs the right's justify-end). */}
        <BrandMark />

        {/* Center: FLEET LOGGER — dead-center on the grid middle track */}
        <div className="flex items-center justify-self-center select-none">
          <div className="flex items-baseline justify-center gap-1.5 text-sm font-sans font-black uppercase">
            <span className="tracking-[0.3em] text-slate-100 drop-shadow-sm">FLEET</span>
            <span className="tracking-[0.3em] text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]">
              <HyperTextCycle
                words={["LOGGER", "SYSTEM", "ENGINE"]}
                interval={3}
              />
            </span>
          </div>
        </div>

        {/* Right: Original circular Profile button */}
        <div className="flex items-center justify-self-end">
          {currentUser ? (
            <button
              onClick={() => setActiveTab("settings")}
              className="group w-8 h-8 rounded-full border border-indigo-500/30 bg-indigo-600/10 flex items-center justify-center cursor-pointer hover:border-cyan-400 transition-all overflow-hidden focus:outline-none shadow-lg shadow-indigo-500/10"
              title="View Settings / User Profile"
            >
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || "User"}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-xs font-mono font-bold text-indigo-300">
                  {(currentUser.displayName || "AD").slice(0, 2).toUpperCase()}
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={() => setActiveTab("settings")}
              className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center cursor-pointer hover:border-indigo-500/40 hover:bg-white/10 transition-all focus:outline-none shadow-md"
              title="View Settings / Connect Google Auth"
            >
              <User className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
      </header>


      {/* Main Container viewport */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* Left Sidebar statistics panel matching editorial markup */}
        <aside id="statistics-syncs-aside" className="hidden lg:flex w-80 border-r border-white/5 bg-[#0a1122] flex-col p-6 overflow-hidden shrink-0">
          <div className="mb-8">
            <label className="text-[10px] uppercase tracking-[0.23em] text-slate-500 block mb-4.5 font-bold font-mono">
              SHIFT STATS ({new Date().toISOString().split("T")[0]})
            </label>
            <div className="grid grid-cols-2 gap-3.5">
              <div id="stat-trips-box" className="p-4 rounded-xl bg-white/5 border border-white/5 shadow-inner">
                <p className="text-[10px] text-slate-400 uppercase font-medium">Daily Trips</p>
                <p className="text-2xl font-bold font-mono text-cyan-400">
                  {entries.filter(e => e.date === new Date().toISOString().split("T")[0]).length}
                </p>
              </div>
              <div id="stat-hours-box" className="p-4 rounded-xl bg-white/5 border border-white/5">
                <p className="text-[10px] text-slate-400 uppercase font-medium">Daily Hours</p>
                <p className="text-2xl font-bold font-mono text-indigo-400">
                  {entries
                    .filter(e => e.date === new Date().toISOString().split("T")[0])
                    .reduce((tot, match) => tot + calculateTotalHours(match.inTime, match.outTime), 0)
                    .toFixed(1)}
                  <span className="text-[11px] font-normal text-slate-500 ml-1">hrs</span>
                </p>
              </div>
            </div>
          </div>

          {/* Scrollable list of recent database entries */}
          <div className="flex-1 flex flex-col min-h-0">
            <label className="text-[10px] uppercase tracking-[0.23em] text-slate-500 block mb-4 font-bold font-mono">
              RECENT LOGS
            </label>
            <div className="space-y-3.5 overflow-y-auto pr-1 filter" style={{ scrollbarWidth: "thin" }}>
              {entries.slice(0, 5).map((entry, index) => (
                <div
                  key={entry.id || index}
                  className="p-3.5 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/20 transition-all text-xs"
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="font-bold text-indigo-300 font-mono tracking-tight">
                      {entry.carNumber || "GENERAL"}
                    </span>
                    <span className="text-[9px] text-[#94a3b8]/60 uppercase font-mono">
                      {entry.date}
                    </span>
                  </div>
                  <p className="text-slate-200 font-medium truncate mb-1">{entry.duty || "General Duties"}</p>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-2 pt-2 border-t border-white/5">
                    <span>{entry.inTime} - {entry.outTime}</span>
                    <span className="text-cyan-400 font-bold">{calculateTotalHours(entry.inTime, entry.outTime)} hrs</span>
                  </div>
                </div>
              ))}
              
              {entries.length === 0 && (
                <div className="text-center py-10 border border-dashed border-white/10 rounded-xl bg-white/5 text-slate-500 text-xs text-balance">
                  <Database className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  No logs compiled yet. Try speaking a duty.
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Dynamic Viewport Frame with bottom padding to ensure content is fully above absolute nav */}
        <section className="flex-1 relative flex flex-col bg-gradient-to-b from-[#080d1a] to-[#0d162d] pb-25 mb-1 overflow-y-auto scroll-container-gpu">
          
          {/* Ambient Glow Orbs background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-indigo-600/5 rounded-full blur-[100px]"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] bg-cyan-400/5 rounded-full blur-[80px]"></div>
          </div>

          <div className="relative z-10 p-4 md:p-5 max-w-4xl mx-auto w-full flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              {/* TAB 1: VOICE SPEECH CENTER */}
              {activeTab === "voice" && (
                <div
                  id="voice-tab-panel"
                  className={`flex-1 flex flex-col items-center w-full pt-1.5 gap-4 sm:gap-5 ${isAndroid ? "" : "animate-blur-fade-in"}`}
                >
                
                {/* Top Metrics Row */}
                {(() => {
                  const todayStr = new Date().toISOString().split("T")[0];
                  const todayEntries = entries.filter(e => e.date === todayStr);
                  const tripsToday = todayEntries.length;
                  const distanceToday = todayEntries.reduce((sum, e) => sum + calculateTotalKm(e.inKm, e.outKm), 0);
                  const activeCarsToday = new Set(todayEntries.map(e => e.carNumber).filter(Boolean)).size || 0;
                  
                  return (
                    <div className="metrics-grid-container grid grid-cols-3 gap-3 w-full max-w-lg mb-2">
                      <AestheticCard className="metrics-card-custom h-18">
                        <Layers className="w-4 h-4 text-cyan-400/70 mb-1" />
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-black">Trips</p>
                        <p className="text-xl font-bold font-mono text-cyan-400">{tripsToday}</p>
                      </AestheticCard>
                      <AestheticCard className="metrics-card-custom h-18">
                        <Car className="w-4 h-4 text-indigo-400/70 mb-1" />
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-black">Distance</p>
                        <p className="text-xl font-bold font-mono text-indigo-400">{distanceToday} <span className="text-[10px] font-normal text-slate-500">KM</span></p>
                      </AestheticCard>
                      <AestheticCard className="metrics-card-custom h-18">
                        <Car className="w-4 h-4 text-emerald-400/70 mb-1" />
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-black">Active Cars</p>
                        <p className="text-xl font-bold font-mono text-emerald-400">{activeCarsToday} <span className="text-[10px] font-normal text-slate-500">cars</span></p>
                      </AestheticCard>
                    </div>
                  );
                })()}

                {/* Voice stack — SINGLE flex-col column so pill, orb, and TAP button
                    share one perfectly-centered vertical axis. */}
                <div className="voice-stack-container flex flex-col items-center justify-start w-full gap-8">

                  {/* State Label — fixed-width pill, text only, no dot, no pulse */}
                  {isListening ? (
                    <div className="state-label-pill inline-flex items-center justify-center px-4 py-1 min-w-[210px] bg-cyan-500/10 border border-cyan-400/20 rounded-full text-cyan-400 text-xs font-mono tracking-widest uppercase">
                      <MorphingText
                        texts={["LISTENING...", "SPEAK NOW", "RECORDING", settings.speechLanguage]}
                        interval={2.4}
                        className="h-4 inline-flex items-center"
                      />
                    </div>
                  ) : isProcessing ? (
                    <div className="state-label-pill inline-flex items-center justify-center px-4 py-1 min-w-[210px] bg-purple-500/10 border border-purple-400/20 rounded-full text-purple-400 text-xs font-mono tracking-widest uppercase">
                      <MorphingText
                        texts={["AI EXTRACTING...", "THINKING...", "PARSING DATA", "ANALYZING"]}
                        interval={2.4}
                        className="h-4 inline-flex items-center"
                      />
                    </div>
                  ) : (
                    <div className="state-label-pill inline-flex items-center justify-center px-4 py-1 min-w-[280px] bg-indigo-500/10 border border-indigo-400/20 rounded-full text-indigo-300 text-xs font-mono tracking-wider uppercase">
                      <MorphingText
                        texts={["SPEECH LOGGER READY", "TAP TO START", "VOICE COMMANDS ACTIVE"]}
                        interval={2.4}
                        className="h-4 inline-flex items-center"
                      />
                    </div>
                  )}

                  {/* Voice Orb or Thinking Loader Animation */}
                  {isProcessing ? (
                    <div className="my-2">
                      <AestheticThinkingLoader />
                    </div>
                  ) : (
                    <div
                      className="voice-orb-container relative mx-auto flex items-center justify-center w-48 h-48 my-2 cursor-pointer group"
                      onClick={toggleListening}
                    >
                      {isListening ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Ripple>
                            <Mic className="w-9 h-9 text-cyan-300" strokeWidth={2.25} />
                          </Ripple>
                        </div>
                      ) : (
                        <>
                          {/* Neon glow halo */}
                          <div className="absolute inset-0 rounded-full blur-2xl opacity-40 scale-110 transition-all duration-700 bg-indigo-600/20 group-hover:bg-indigo-600/30" />

                          {/* Concentric SVG rings, all centered on 100/100 */}
                          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 200">
                            <circle cx="100" cy="100" r="90" fill="none"
                               stroke="rgba(255,255,255,0.05)"
                               strokeWidth="1.5" strokeDasharray="2 8"
                               style={{ transformOrigin: "center" }} />
                            <circle cx="100" cy="100" r="76" fill="none"
                               stroke="rgba(255,255,255,0.08)"
                               strokeWidth="1" strokeDasharray="4 6"
                               strokeOpacity="0.4"
                               style={{ transformOrigin: "center" }} />
                            <circle cx="100" cy="100" r="62" fill="none"
                               stroke="rgba(99,102,241,0.15)"
                               strokeWidth="2" className="animate-pulse"
                               style={{ transformOrigin: "center" }} />
                          </svg>

                          {/* Core Mic Orb Button — fixed 96px, centered */}
                          <div
                            className="core-mic-button relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl bg-gradient-to-tr from-[#101830] to-slate-900 border border-white/10 hover:border-indigo-500/30 hover:shadow-indigo-500/10"
                          >
                            <div className="absolute inset-0 rounded-full transition-opacity duration-500 blur-xl bg-indigo-500/10 opacity-0 hover:opacity-100" />
                            <div className="relative z-10 text-white">
                              <Mic className="w-8 h-8 text-slate-300" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* TAP button — same column, dead-center under the mic */}
                  <button
                    onClick={isProcessing ? undefined : toggleListening}
                    className={`px-6 py-2 rounded-full text-[10px] font-mono tracking-widest font-bold shadow-xl uppercase transition-all duration-300 border ${
                      isListening
                        ? "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/35 hover:bg-rose-500 active:scale-95 cursor-pointer animate-fade-in"
                        : isProcessing
                        ? "bg-purple-500/20 text-purple-400 border-purple-500/30 cursor-default"
                        : "bg-[#0d162d] text-slate-300 border-white/10 hover:border-indigo-500/30 active:scale-95 cursor-pointer"
                    }`}
                  >
                    {isListening ? "TAP TO FINISH" : isProcessing ? "THINKING..." : "TAP TO RECORD"}
                  </button>
                </div>

                {/* Suggestion Chips */}
                {!isListening && !isProcessing && (
                  <div className="w-full max-w-lg mt-2 mb-2 suggestion-chips-container">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1.5 text-center font-bold">
                      Suggested Voice Cues (Tap to load demo):
                    </p>
                    <div className="flex overflow-x-auto gap-2 py-1 justify-start sm:justify-center px-4 scrollbar-none snap-x snap-mandatory">
                      <button
                        onClick={() => {
                          setManualTranscriptInput("Rajesh went on hospital run from 9am to 6pm in WB 02 AB 1234");
                          showToast("Demo loaded! Click PARSE to test.", "info");
                        }}
                        className="cursor-pointer shrink-0 snap-center focus:outline-none"
                      >
                        <AestheticCard className="px-3.5 py-1.5 h-auto rounded-full border-none shadow-sm hover:shadow-cyan-500/10 transition-all hover:scale-105">
                          <span className="text-[10px] text-slate-300 font-medium whitespace-nowrap">🗣️ Rajesh Hospital Run</span>
                        </AestheticCard>
                      </button>
                      <button
                        onClick={() => {
                          setManualTranscriptInput("Amit driving DL01 for Airport Drop 12:00 PM to 4:00 PM, KM 1000 to 1120");
                          showToast("Demo loaded! Click PARSE to test.", "info");
                        }}
                        className="cursor-pointer shrink-0 snap-center focus:outline-none"
                      >
                        <AestheticCard className="px-3.5 py-1.5 h-auto rounded-full border-none shadow-sm hover:shadow-indigo-500/10 transition-all hover:scale-105">
                          <span className="text-[10px] text-slate-300 font-medium whitespace-nowrap">🗣️ Amit Airport Drop</span>
                        </AestheticCard>
                      </button>
                    </div>
                  </div>
                )}

                {/* Live Transcript / Interim Preview card */}
                {(isListening || interimTranscript || transcript) && (
                  <div className="w-full max-w-lg flex flex-col justify-start mb-2">
                    <div className="glass-card border border-cyan-400/20 rounded-xl p-4 shadow-lg animate-fade-in">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-mono tracking-widest text-cyan-400 font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                          LIVE CAPTURE TRANSCRIPT
                        </span>
                        <span className="text-[8px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded-full uppercase">
                          {settings.speechLanguage}
                        </span>
                      </div>
                      <p className="text-sm font-sans text-slate-200 leading-relaxed italic">
                        {transcript ? (
                          <span>
                            {transcript}
                            {interimTranscript && <span className="text-cyan-400/70"> {interimTranscript}</span>}
                          </span>
                        ) : interimTranscript ? (
                          <span className="text-cyan-400/70">{interimTranscript}</span>
                        ) : (
                          <span className="text-slate-500 font-sans italic">Listening for voice cues...</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Fallback Manual Text Input for blocked microphone - Pushed to bottom */}
                {!isListening && !isProcessing && (
                  <div className="w-full max-w-lg bg-white/[0.02] border border-white/5 rounded-xl p-3 text-xs shadow-md mt-auto mb-1">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[9px] font-mono tracking-wider font-bold text-slate-400 uppercase">
                        Mic Fallback / Type Dispatcher Notes:
                      </span>
                      <span className="text-[9px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full font-bold">
                        Manual Parser Simulation
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-[#080d1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="e.g. Rajesh driving WB 02 AB 1234 on Hospital Run..."
                        value={manualTranscriptInput}
                        onChange={(e) => setManualTranscriptInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleManualTranscriptSubmit();
                          }
                        }}
                      />
                      <AestheticGradientButton
                        label="Parse"
                        onClick={handleManualTranscriptSubmit}
                        disabled={isProcessing || !manualTranscriptInput.trim()}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* TAB 3: CHRONOLOGICAL HISTORICAL LOGS */}
            {activeTab === "history" && (
              <div
                id="history-tab-panel"
                className={`flex-1 py-2 ${isAndroid ? "" : "animate-blur-fade-in"}`}
              >
                
                {/* Search & Date chip filters block */}
                <div className="mb-6 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
                  <div className="flex gap-2 flex-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search history · AI-powered"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="w-full bg-[#101930] border border-white/10 rounded-xl pl-10.5 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      onClick={() => setIsManualModalOpen(true)}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-indigo-500/20 flex items-center gap-1.5 font-mono shrink-0"
                      title="Add manual entry"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">NEW MANUAL LOG</span>
                    </button>
                  </div>

                  {/* Window Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto self-start shrink-0">
                    <button
                      onClick={() => setDateFilterChip("7")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono tracking-tight font-medium transition-colors ${
                        dateFilterChip === "7" ? "bg-indigo-600 text-white" : "bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      7 Days
                    </button>
                    <button
                      onClick={() => setDateFilterChip("30")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono tracking-tight font-medium transition-colors ${
                        dateFilterChip === "30" ? "bg-indigo-600 text-white" : "bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      30 Days
                    </button>
                    <button
                      onClick={() => setDateFilterChip("90")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono tracking-tight font-medium transition-colors ${
                        dateFilterChip === "90" ? "bg-indigo-600 text-white" : "bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      90 Days
                    </button>
                    <button
                      onClick={() => setDateFilterChip("all")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono tracking-tight font-medium transition-colors ${
                        dateFilterChip === "all" ? "bg-indigo-600 text-white" : "bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      All Time
                    </button>
                  </div>
                </div>

                {/* Archival count badge */}
                {dateFilterChip !== "all" && entries.length > filteredHistoryEntries.length && (
                  <div className="mb-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2.5 text-xs text-indigo-400 flex items-center justify-between">
                    <span>💡 {entries.length - filteredHistoryEntries.length} older entries archived. Switch window filter to 'All Time' to see them.</span>
                    <button onClick={() => setDateFilterChip("all")} className="underline font-bold">Show All</button>
                  </div>
                )}

                {/* Sequential Groups by Date */}
                <div className="space-y-8 w-full">
                  {groupedHistoryDates.map(dateGroup => {
                    const groupItems = filteredHistoryEntries.filter(e => e.date === dateGroup);
                    if (groupItems.length === 0) return null;

                    return (
                      <div
                        key={dateGroup}
                        className="space-y-4 w-full mb-6"
                      >
                        <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-slate-500 font-bold uppercase mt-4 w-full date-header-gpu">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{dateGroup} ({new Date(dateGroup).toLocaleDateString("en-US", { weekday: "short" })})</span>
                          <span className="h-px bg-white/5 flex-1 ml-2"></span>
                        </div>

                        <div className="space-y-3 w-full">
                          {groupItems.map(entry => (
                            <div
                              key={entry.id}
                              className={`glass-card p-4 rounded-xl border border-white/5 w-full ${isAndroid ? "" : "hover:bg-white/[0.04] transition-colors group duration-200"}`}
                            >
                              {editingEntryId === entry.id ? (
                              /* INLINE EDITOR VIEW */
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div>
                                    <label className="text-[9px] text-slate-500 block uppercase">Car</label>
                                    <input 
                                      type="text"
                                      value={editingData.carNumber || ""}
                                      onChange={(e) => setEditingData({ ...editingData, carNumber: e.target.value })}
                                      className="w-full bg-[#080d1a] border border-white/10 rounded px-2.5 py-1 text-xs text-white uppercase font-mono"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-slate-500 block uppercase">Date</label>
                                    <input 
                                      type="date"
                                      value={editingData.date || ""}
                                      onChange={(e) => setEditingData({ ...editingData, date: e.target.value })}
                                      className="w-full bg-[#080d1a] border border-white/10 rounded px-2.5 py-1 text-xs text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-slate-500 block uppercase">Times</label>
                                    <div className="flex gap-1">
                                      <input 
                                        type="text"
                                        value={editingData.inTime || ""}
                                        onChange={(e) => setEditingData({ ...editingData, inTime: e.target.value })}
                                        className="w-full bg-[#080d1a] border border-white/10 rounded px-1 py-1 text-xs text-white text-center font-mono"
                                      />
                                      <input 
                                        type="text"
                                        value={editingData.outTime || ""}
                                        onChange={(e) => setEditingData({ ...editingData, outTime: e.target.value })}
                                        className="w-full bg-[#080d1a] border border-white/10 rounded px-1 py-1 text-xs text-white text-center font-mono"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-slate-500 block uppercase">KMs (In / Out)</label>
                                    <div className="flex gap-1">
                                      <input 
                                        type="number"
                                        value={editingData.inKm !== null ? editingData.inKm : ""}
                                        onChange={(e) => setEditingData({ ...editingData, inKm: e.target.value !== "" ? Number(e.target.value) : null })}
                                        className="w-full bg-[#080d1a] border border-white/10 rounded px-1 py-1 text-xs text-white text-center font-mono"
                                      />
                                      <input 
                                        type="number"
                                        value={editingData.outKm !== null ? editingData.outKm : ""}
                                        onChange={(e) => setEditingData({ ...editingData, outKm: e.target.value !== "" ? Number(e.target.value) : null })}
                                        className="w-full bg-[#080d1a] border border-white/10 rounded px-1 py-1 text-xs text-white text-center font-mono"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div>
                                   <label className="text-[9px] text-slate-500 block uppercase font-mono font-bold">Duty Purpose / With</label>
                                   <input 
                                     type="text"
                                     value={editingData.duty || ""}
                                     onChange={(e) => setEditingData({ ...editingData, duty: e.target.value })}
                                     className="w-full bg-[#080d1a] border border-white/10 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                   />
                                 </div>
                                <div className="flex justify-end gap-2 pt-2">
                                  <button onClick={() => setEditingEntryId(null)} className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs rounded">
                                    Cancel
                                  </button>
                                  <button onClick={() => saveEntryChanges(entry.id)} className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-xs text-white rounded font-bold">
                                    Save Record
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* COMPACT CARD ROW DISPLAY — single column on mobile, robust against WebView quirks */
                              <div className="flex flex-col w-full items-stretch justify-between gap-3">
                                <div className="flex items-start gap-3 w-full">
                                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/15">
                                    <Car className="w-5 h-5 text-indigo-400" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-bold text-white font-mono tracking-tight text-sm uppercase truncate">
                                        {entry.carNumber || "GENERAL"}
                                      </h3>
                                    </div>
                                    <p className="text-sm text-slate-100 font-medium mt-0.5 leading-snug truncate">
                                      {entry.duty || "Fleet operational trip duties."}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/5 w-full">
                                  <div className="flex flex-wrap gap-4 font-mono text-xs">
                                    <div>
                                      <p className="text-[9px] text-[#94a3b8]/60 uppercase tracking-wider block">Duration</p>
                                      <p className="text-slate-200 mt-0.5 flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-indigo-400 inline shrink-0" />
                                        <span className="whitespace-nowrap">{entry.inTime} - {entry.outTime}</span>
                                        <span className="text-indigo-300 font-bold">({calculateTotalHours(entry.inTime, entry.outTime)}h)</span>
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] text-[#94a3b8]/60 uppercase tracking-wider block">distance Odometer</p>
                                      <p className="text-slate-200 mt-0.5">
                                        <span className="whitespace-nowrap">{entry.inKm !== null ? entry.inKm : "-"} to {entry.outKm !== null ? entry.outKm : "-"}</span>
                                        <span className="text-cyan-400 font-bold ml-1 whitespace-nowrap">({calculateTotalKm(entry.inKm, entry.outKm)}km)</span>
                                      </p>
                                    </div>
                                  </div>

                                  {/* Custom Actions for Management */}
                                  <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button
                                      onClick={() => startEditing(entry)}
                                      className="p-1.5 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 rounded-lg transition-colors focus:outline-none"
                                      title="Edit logs inline"
                                    >
                                      <Plus className="w-4.5 h-4.5 rotate-45" />
                                    </button>
                                    <button
                                      onClick={() => deleteEntryLog(entry.id, entry.carNumber, entry.date)}
                                      className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors focus:outline-none"
                                      title="Delete entries"
                                    >
                                      <Trash2 className="w-4.5 h-4.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        </div>
                      </div>
                    );
                  })}

                  {filteredHistoryEntries.length === 0 && (
                    <div className="text-center py-16 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                      <p className="text-slate-500 text-sm">No historical log registers match search criteria.</p>
                      <button onClick={() => { setHistorySearch(""); setDateFilterChip("all"); }} className="text-indigo-400 hover:underline text-xs font-bold mt-2 font-mono uppercase">
                        Clear all filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: MONTHLY REPORTS SUMMARY PANEL */}
            {activeTab === "report" && (
              <div
                id="report-tab-panel"
                className={`flex-1 py-2 space-y-6 w-full ${isAndroid ? "" : "animate-blur-fade-in"}`}
              >
                
                {/* Reports header — HyperText-animated title + short subtitle, centered,
                    then the compact [ Month picker ] [ Export ] row below it. */}
                <div className="flex flex-col items-center justify-center gap-2 bg-white/5 border border-white/5 px-4 py-4 rounded-xl shadow-md">
                  {/* Animated title — same HyperText scramble as FLEET wordmark */}
                  <HyperText
                    text="ANALYTICS REPORT"
                    className="text-sm font-sans tracking-[0.3em] font-black text-slate-100 uppercase drop-shadow-sm"
                  />
                  {/* Static subtitle */}
                  <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase text-center">
                    Month-wise performance matrices
                  </p>

                  {/* Picker + Export row */}
                  <div className="flex flex-row items-center justify-center gap-3 pt-1">
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => setReportMonth(e.target.value)}
                      className="bg-[#080d1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/40 w-36 min-w-[140px]"
                    />
                    <AestheticGradientButton
                      label="Export"
                      onClick={handleExport}
                    />
                  </div>
                </div>

                {/* KPI Boxes — clean glass, subtle icon-only motion */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="glass-card p-5 rounded-2xl flex items-center justify-between shadow-md">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold">Month trips logged</p>
                      <h4 className="text-2xl font-bold font-mono text-cyan-400 mt-2">{reportStats.trips} trips</h4>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center">
                      <Layers className="w-6 h-6 text-cyan-400 animate-icon-float" />
                    </div>
                  </div>

                  <div className="glass-card p-5 rounded-2xl flex items-center justify-between shadow-md">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold">cumulative duration</p>
                      <h4 className="text-2xl font-bold font-mono text-indigo-400 mt-2">
                        {reportStats.hours.toFixed(1)} <span className="text-sm font-normal">hrs</span>
                      </h4>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-indigo-400" style={{ animation: "spin-slow 10s linear infinite" }} />
                    </div>
                  </div>

                  <div className="glass-card p-5 rounded-2xl flex items-center justify-between shadow-md">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold">Cumulative range distance</p>
                      <h4 className="text-2xl font-bold font-mono text-emerald-400 mt-2">
                        {reportStats.km} <span className="text-sm font-normal">km</span>
                      </h4>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
                      <Car className="w-6 h-6 text-emerald-400 animate-cruise" />
                    </div>
                  </div>
                </div>

                {/* SVG Chart Panel */}
                {(() => {
                  const dailyData = getDailyDistances();
                  const maxVal = Math.max(...dailyData.map(d => d.distance), 50); // min scale 50
                  const width = 500;
                  const height = 150;
                  const padding = 20;

                  const pathD = dailyData.reduce((acc, d, i) => {
                    const x = padding + (i / (dailyData.length - 1)) * (width - padding * 2);
                    const y = height - padding - (d.distance / maxVal) * (height - padding * 2);
                    return acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
                  }, "");

                  const fillD = pathD ? `${pathD} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z` : "";

                  return (
                    <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-4 shadow-md">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs uppercase font-mono tracking-widest font-bold text-slate-400 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-cyan-400" />
                          DAILY DISTANCE TREND (KM)
                        </h4>
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full font-bold">
                          Max: {maxVal.toFixed(0)} KM
                        </span>
                      </div>
                      
                      {reportEntries.length === 0 ? (
                        <div className="h-32 relative overflow-hidden rounded-xl bg-white/[0.02] border border-white/5">
                          {/* Neon baseline chart — flat zero-data line on real axes */}
                          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 500 128" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="neonLine" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#06b6d4" />
                              </linearGradient>
                              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="2.5" result="b" />
                                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                              </filter>
                            </defs>
                            {/* gridlines / axes */}
                            <line x1="20" y1="32" x2="480" y2="32" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                            <line x1="20" y1="64" x2="480" y2="64" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                            <line x1="20" y1="100" x2="480" y2="100" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                            {/* zero-data neon baseline */}
                            <line x1="20" y1="100" x2="480" y2="100" stroke="url(#neonLine)" strokeWidth="2.5" strokeLinecap="round" filter="url(#neonGlow)" />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono tracking-widest text-slate-500 uppercase">
                            No distance logged this month
                          </span>
                        </div>
                      ) : (
                        <div className="relative">
                          <svg className="w-full h-auto overflow-visible" viewBox={`0 0 ${width} ${height}`}>
                            <defs>
                              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            
                            {/* Gridlines */}
                            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                            <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

                            {/* Fill path */}
                            {fillD && <path d={fillD} fill="url(#chartGrad)" />}
                            
                            {/* Stroke path */}
                            {pathD && <path d={pathD} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                            
                            {/* Static dots */}
                            {dailyData.map((d, i) => {
                              const x = padding + (i / (dailyData.length - 1)) * (width - padding * 2);
                              const y = height - padding - (d.distance / maxVal) * (height - padding * 2);
                              if (d.distance === 0) return null;
                              return (
                                <circle
                                  key={i}
                                  cx={x}
                                  cy={y}
                                  r="3"
                                  fill="#080d1a"
                                  stroke="#06b6d4"
                                  strokeWidth="1.5"
                                />
                              );
                            })}
                          </svg>
                          <div className="flex justify-between text-[8px] text-slate-500 font-mono pt-1">
                            <span>Day 1</span>
                            <span>Day 15</span>
                            <span>Day {dailyData.length}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Top Drivers Leaderboard */}
                {(() => {
                  const leaderboard = getDriverLeaderboard();
                  const maxKm = leaderboard.length > 0 ? Math.max(...leaderboard.map(d => d.km), 1) : 1;

                  return (
                    <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-4 shadow-md">
                      <h4 className="text-xs uppercase font-mono tracking-widest font-bold text-slate-400 flex items-center gap-2">
                        <Award className="w-4.5 h-4.5 text-amber-400" />
                        TOP DRIVERS LEADERBOARD
                      </h4>
                      
                      {leaderboard.length === 0 ? (
                        <div className="py-8 text-center text-slate-500 text-xs">
                          No driver statistics compiled for this month.
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          {leaderboard.map((drv, idx) => {
                            const pct = Math.min((drv.km / maxKm) * 100, 100);
                            return (
                              <div key={drv.name} className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <div className="flex items-center gap-2.5">
                                    <span className={`w-5 h-5 rounded-md flex items-center justify-center font-mono font-bold text-[10px] ${
                                      idx === 0 
                                        ? "bg-amber-400/20 text-amber-300 border border-amber-500/30" 
                                        : idx === 1 
                                        ? "bg-slate-400/20 text-slate-300 border border-slate-400/30" 
                                        : "bg-white/5 text-slate-400"
                                    }`}>
                                      {idx + 1}
                                    </span>
                                    <span className="font-bold text-slate-100">{drv.name}</span>
                                  </div>
                                  <div className="font-mono text-slate-400 text-[10px] flex items-center gap-2">
                                    <span>{drv.trips} trips</span>
                                    <span>•</span>
                                    <span className="text-cyan-400 font-bold">{drv.km} KM</span>
                                  </div>
                                </div>
                                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500" 
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Car-wise aggregation breakdown table */}
                <div className="glass-card rounded-2xl overflow-hidden shadow-md">
                  <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                    <h4 className="text-xs uppercase font-mono tracking-widest font-bold text-slate-400">VEHICLE MATRICES LOGS</h4>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-500 uppercase font-mono tracking-widest text-[9px] bg-white/[0.01]">
                          <th className="px-5 py-3">Car Number Plate</th>
                          <th className="px-5 py-3">Completed Trips</th>
                          <th className="px-5 py-3">Total Operational Hours</th>
                          <th className="px-5 py-3">Cumulative Distance range</th>
                          <th className="px-5 py-3">Calculated Avg Speed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {Object.keys(carAggregates).map((carKey) => {
                          const item = carAggregates[carKey];
                          const avgSpeed = item.hours > 0 ? (item.km / item.hours).toFixed(1) : "0";

                          return (
                            <tr key={carKey} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-5 py-3.5 font-bold text-white">{carKey}</td>
                              <td className="px-5 py-3.5 text-cyan-400">{item.trips}</td>
                              <td className="px-5 py-3.5 text-indigo-400">{item.hours.toFixed(1)} hrs</td>
                              <td className="px-5 py-3.5 text-emerald-400">{item.km} km</td>
                              <td className="px-5 py-3.5 text-amber-400 font-bold">{avgSpeed} km/h</td>
                            </tr>
                          );
                        })}

                        {Object.keys(carAggregates).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-5 py-8 text-center text-slate-500 font-sans">
                              No entries found matching date window {reportMonth}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {/* TAB 5: SYSTEM SETTINGS PANEL */}
            {activeTab === "settings" && (
              <div
                id="settings-tab-panel"
                className={`flex-1 py-2 space-y-6 w-full max-w-2xl mx-auto ${isAndroid ? "" : "animate-blur-fade-in"}`}
              >
                
                {/* Dispatcher profile header card */}
                <div className="glass-card rounded-2xl p-6 border border-white/5 flex flex-col sm:flex-row items-center gap-5 shadow-md">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center font-mono font-bold text-white text-xl shadow-lg shadow-indigo-900/30">
                    {currentUser ? (currentUser.displayName || "AD").slice(0, 2).toUpperCase() : "AD"}
                  </div>
                  <div className="text-center sm:text-left flex-1">
                    <h3 className="text-base font-bold text-white tracking-wide">
                      {currentUser ? currentUser.displayName : "Admin Dispatcher"}
                    </h3>
                    <p className="text-xs text-indigo-400 font-mono mt-0.5">System Dispatcher Admin</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Device Sync ID: <span className="font-mono">client_manual</span>
                    </p>
                  </div>
                  {currentUser ? (
                    <button
                      onClick={handleSignOut}
                      className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-xl transition-all"
                    >
                      Sign Out Account
                    </button>
                  ) : (
                    <button
                      onClick={handleGoogleSignIn}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-900/20"
                    >
                      Connect Google Auth
                    </button>
                  )}
                </div>

                {/* Grid of settings options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Extraction & Speech */}
                  <div className="space-y-4">
                    {/* Voice extraction choices */}
                    <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-3.5 shadow-md">
                      <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block font-bold">
                        Voice Extraction Protocol
                      </label>
                      <div className="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-lg">
                        {["single-shot", "guided", "intelligent"].map((mode) => (
                          <button
                            key={mode}
                            onClick={() => saveSettings({ ...settings, voiceMode: mode as any })}
                            className={`py-1.5 text-[9px] font-bold uppercase rounded transition-colors ${
                              settings.voiceMode === mode ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {mode.replace("-", " ")}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Locale Selector */}
                    <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-3 shadow-md">
                      <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block font-bold">
                        Dictation Speech Dialect locale
                      </label>
                      <select
                        value={settings.speechLanguage}
                        onChange={(e) => saveSettings({ ...settings, speechLanguage: e.target.value })}
                        className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Speech Engine Info */}
                    <div className="glass-card p-5 rounded-2xl border border-white/5 flex items-center justify-between shadow-md">
                      <div>
                        <span className="text-[11px] text-slate-200 font-mono font-bold block uppercase">Speech STT Engine</span>
                        <span className="text-[10px] text-slate-500">Browser first, Whisper fallback</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded font-bold">HYBRID</span>
                    </div>

                    {/* sync interval / details */}
                    <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-3.5 shadow-md">
                      <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-bold">System Status Details</h4>
                      <div className="space-y-2 text-[11px] font-mono">
                        <div className="flex justify-between py-1 border-b border-white/5 text-slate-400">
                          <span>AI Model</span>
                          <span className="text-white">Gemini 2.5 Flash</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/5 text-slate-400">
                          <span>Sync Interval</span>
                          <span className="text-white">Every 20 seconds</span>
                        </div>
                        <div className="flex justify-between py-1 text-slate-400">
                          <span>App Version</span>
                          <span className="text-white">v2.4 (WebView/APK PWA)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Configurations & Toggles */}
                  <div className="space-y-4">
                    {/* Feature Toggles */}
                    <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-3 shadow-md">
                      <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block font-bold mb-1">
                        Dispatcher Preferences
                      </label>
                      
                      {/* Server sync */}
                      <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                        <div>
                          <span className="text-[11px] text-slate-200 font-mono font-bold block uppercase">Server Real-time Sync</span>
                          <span className="text-[10px] text-slate-500">Synchronize logs online automatically</span>
                        </div>
                        <AestheticSwitch
                          checked={settings.serverSync}
                          onChange={(checked) => saveSettings({ ...settings, serverSync: checked })}
                        />
                      </div>

                      {/* TTS readback */}
                      <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                        <div>
                          <span className="text-[11px] text-slate-200 font-mono font-bold block uppercase">TTS Aloud Readback</span>
                          <span className="text-[10px] text-slate-500">Read details after voice extraction</span>
                        </div>
                        <AestheticSwitch
                          checked={settings.ttsConfirmation}
                          onChange={(checked) => saveSettings({ ...settings, ttsConfirmation: checked })}
                        />
                      </div>

                      {/* Push notifications */}
                      <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                        <div>
                          <span className="text-[11px] text-slate-200 font-mono font-bold block uppercase">Push Notifications</span>
                          <span className="text-[10px] text-slate-500">Enable local status update sounds</span>
                        </div>
                        <AestheticSwitch
                          checked={pushNotifications}
                          onChange={(checked) => setPushNotifications(checked)}
                        />
                      </div>

                      {/* Offline Mode Cache */}
                      <div className="flex items-center justify-between py-2.5 border-b border-white/5">
                        <div>
                          <span className="text-[11px] text-slate-200 font-mono font-bold block uppercase">Offline cache storage</span>
                          <span className="text-[10px] text-slate-500">Writethrough local database cache</span>
                        </div>
                        <AestheticSwitch
                          checked={offlineModeCache}
                          onChange={(checked) => setOfflineModeCache(checked)}
                        />
                      </div>

                      {/* Multi-language Input */}
                      <div className="flex items-center justify-between py-2.5">
                        <div>
                          <span className="text-[11px] text-slate-200 font-mono font-bold block uppercase">Multi-language Input</span>
                          <span className="text-[10px] text-slate-500">Listen for mixed dialects (Hinglish/Benglish)</span>
                        </div>
                        <AestheticSwitch
                          checked={multiLanguageInput}
                          onChange={(checked) => setMultiLanguageInput(checked)}
                        />
                      </div>
                    </div>

                    {/* Driver Configurations */}
                    <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-3.5 shadow-md">
                      <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-bold">Fallback Profiles</h4>
                      <div className="max-w-xs">
                        <label className="text-[9px] uppercase tracking-wider text-slate-400 font-mono block font-bold mb-1">
                          Default Plate
                        </label>
                        <input
                          type="text"
                          value={settings.defaultCar}
                          onChange={(e) => saveSettings({ ...settings, defaultCar: e.target.value })}
                          className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cloud Backend URL configuration */}
                <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-4 shadow-md">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs uppercase font-mono tracking-widest font-bold text-slate-300">CLOUD BACKEND CONFIG</h4>
                      <p className="text-[10px] text-slate-500">Configure absolute endpoint destination URL (Capacitor APK builds)</p>
                    </div>
                    {settings.backendUrl && (
                      <span className="text-[9px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full font-bold">
                        Custom URL Configured
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input 
                      type="text"
                      placeholder="e.g. https://fleet-backend.koyeb.app"
                      value={settings.backendUrl || ""}
                      onChange={(e) => saveSettings({ ...settings, backendUrl: e.target.value })}
                      className="w-full sm:flex-1 bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      onClick={handleTestConnection}
                      className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md font-mono shrink-0"
                    >
                      TEST CONNECTION
                    </button>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="border border-red-500/20 bg-red-500/[0.03] p-5 rounded-2xl space-y-3 shadow-md">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest block font-mono">DANGER OPERATIONS ZONE</h4>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Permanently delete all synced database entries and wipe local storage log files. This action is completely irreversible!
                  </p>
                  <button
                    onClick={handleClearDatabase}
                    className="w-full py-2.5 bg-red-600/20 border border-red-500/40 hover:bg-red-600 hover:text-white transition-colors text-xs text-red-200 font-bold rounded-xl uppercase tracking-wider text-center"
                  >
                    WIPE DATABASE & CLEAR ENTRIES
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      </main>

      {/* View Draft Log minimized floating pill button */}
      {draftCards.length > 0 && !isDraftSheetOpen && (
        <button
          onClick={() => setIsDraftSheetOpen(true)}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 px-6 py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 border border-cyan-400/35 hover:scale-105 active:scale-95 text-white font-bold rounded-full text-xs shadow-xl shadow-cyan-500/25 flex items-center gap-2 animate-bounce transition-all uppercase tracking-wider font-mono cursor-pointer"
        >
          <Layers className="w-4 h-4" />
          View Draft Log ({draftCards.length})
        </button>
      )}

      {/* Manual Fallback Entry Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-[#0a1122] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <Keyboard className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-wide">New Manual Log</h2>
                  <p className="text-[11px] text-[#94a3b8]">Add duty log details manually</p>
                </div>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="p-1.5 bg-white/5 border border-white/5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={async (e) => {
              await handleManualSubmit(e);
              setIsManualModalOpen(false);
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1 font-bold">
                    Date of Duty *
                  </label>
                  <input
                    type="date"
                    required
                    value={manualForm.date}
                    onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1 font-bold">
                    Car Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WB 02 AB 1234"
                    list="recent-cars-list"
                    value={manualForm.carNumber}
                    onChange={(e) => setManualForm({ ...manualForm, carNumber: e.target.value })}
                    className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-xs uppercase text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <datalist id="recent-cars-list">
                    {uniqueCarNumbers.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="w-full">
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1 font-bold">
                  Duty Purpose / With *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hospital Run with Rajesh"
                  value={manualForm.duty}
                  onChange={(e) => setManualForm({ ...manualForm, duty: e.target.value })}
                  className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1 font-bold">
                    In-Time (Start)
                  </label>
                  <input
                    type="time"
                    value={manualForm.inTime}
                    onChange={(e) => setManualForm({ ...manualForm, inTime: e.target.value })}
                    className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1 font-bold">
                    Out-Time (End)
                  </label>
                  <input
                    type="time"
                    value={manualForm.outTime}
                    onChange={(e) => setManualForm({ ...manualForm, outTime: e.target.value })}
                    className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1 font-bold">
                    In Kilometers
                  </label>
                  <input
                    type="number"
                    placeholder="Start KM value"
                    value={manualForm.inKm}
                    onChange={(e) => setManualForm({ ...manualForm, inKm: e.target.value })}
                    className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1 font-bold">
                    Out Kilometers
                  </label>
                  <input
                    type="number"
                    placeholder="End KM value"
                    value={manualForm.outKm}
                    onChange={(e) => setManualForm({ ...manualForm, outKm: e.target.value })}
                    className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Computations preview */}
              <div className="grid grid-cols-2 gap-4 bg-[#080d1a] border border-white/5 p-3 rounded-xl">
                <div className="text-center border-r border-white/5">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide">Total Hours</p>
                  <p className="text-base font-bold text-indigo-400 font-mono mt-0.5">
                    {calculateTotalHours(manualForm.inTime, manualForm.outTime)} hrs
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide">Total Distance</p>
                  <p className="text-base font-bold text-cyan-400 font-mono mt-0.5">
                    {calculateTotalKm(Number(manualForm.inKm) || 0, Number(manualForm.outKm) || 0)} km
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition-all shadow-lg shadow-indigo-900/30 flex-1"
                >
                  Save Log Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Draft Log Bottom-Sheet Overlay */}
      {isDraftSheetOpen && draftCards.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-[#0a1122] rounded-t-3xl border-t border-white/15 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Handle bar */}
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto my-3 shrink-0" />
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 pb-4 border-b border-white/5 shrink-0">
              <h3 className="text-sm font-bold tracking-wider uppercase font-mono text-cyan-400 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                EXTRACTED DRAFT LOG ({draftCards.length})
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => speak(buildBatchReadback(draftCards), settings.speechLanguage)}
                  title="Read all drafts aloud"
                  className="text-cyan-400 hover:text-white hover:bg-cyan-500/20 border border-cyan-500/30 p-1.5 rounded-lg transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { stopSpeaking(); setDraftCards([]); setIsDraftSheetOpen(false); }}
                  title="Discard all drafts"
                  className="text-slate-400 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Form Details */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {draftCards.map((draft, idx) => (
                <div 
                  key={draft.id || idx}
                  onClick={() => selectNextFollowUp(idx)}
                  className={`p-5 rounded-2xl transition-all border relative space-y-4 ${
                    activeFollowUpIndex === idx 
                      ? "bg-indigo-500/10 border-indigo-500/30 shadow-md shadow-indigo-500/5" 
                      : "bg-white/[0.03] border-white/5 hover:border-white/10"
                  }`}
                >
                  {/* Speaker controls */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isAgentSpeaking) {
                          stopSpeaking();
                        } else {
                          speak(buildReadback(draft), settings.speechLanguage);
                        }
                      }}
                      className={`text-cyan-400 hover:text-white hover:bg-cyan-500/25 border border-cyan-500/20 p-1.5 rounded-lg transition-colors ${isAgentSpeaking ? "bg-cyan-500/20 animate-pulse" : ""}`}
                    >
                      {isAgentSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    {(draft._missingCar || draft._missingDuty) && (
                      <span className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Incomplete
                      </span>
                    )}
                  </div>

                  {/* Grid details */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                    {/* Vehicle Plate */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] uppercase tracking-widest text-[#94a3b8]/60 font-mono font-bold block">
                          Vehicle Plate
                        </label>
                        {draft.carNumber ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <span className="text-[8px] text-amber-400 font-bold bg-amber-500/10 px-1.5 rounded">Tap to fill</span>}
                      </div>
                      <input 
                        type="text"
                        value={draft.carNumber || ""}
                        placeholder="e.g. WB 02"
                        onChange={(e) => updateDraftField(idx, "carNumber", e.target.value)}
                        className={`w-full bg-[#080d1a] border rounded-xl px-2.5 py-1.5 font-mono text-xs uppercase focus:outline-none ${
                          draft._missingCar ? "border-amber-500/40 text-amber-300 focus:border-amber-500" : "border-white/10 text-white focus:border-indigo-500"
                        }`}
                      />
                    </div>

                    {/* Duty Description */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] uppercase tracking-widest text-[#94a3b8]/60 font-mono font-bold block">
                          Duty Purpose / With
                        </label>
                        {draft.duty ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <span className="text-[8px] text-amber-400 font-bold bg-amber-500/10 px-1.5 rounded">Tap to fill</span>}
                      </div>
                      <input 
                        type="text"
                        value={draft.duty || ""}
                        placeholder="e.g. Hospital Run with Rajesh"
                        onChange={(e) => updateDraftField(idx, "duty", e.target.value)}
                        className={`w-full bg-[#080d1a] border rounded-xl px-2.5 py-1.5 text-xs focus:outline-none ${
                          draft._missingDuty ? "border-amber-500/40 text-amber-300 focus:border-amber-500" : "border-white/10 text-white focus:border-indigo-500"
                        }`}
                      />
                    </div>

                    {/* In time */}
                    <div>
                      <label className="text-[9px] uppercase tracking-widest text-[#94a3b8]/60 font-mono font-bold block mb-1">
                        In-Time
                      </label>
                      <input 
                        type="text"
                        value={draft.inTime || ""}
                        onChange={(e) => updateDraftField(idx, "inTime", e.target.value)}
                        className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none text-center"
                      />
                    </div>

                    {/* Out time */}
                    <div>
                      <label className="text-[9px] uppercase tracking-widest text-[#94a3b8]/60 font-mono font-bold block mb-1">
                        Out-Time
                      </label>
                      <input 
                        type="text"
                        value={draft.outTime || ""}
                        onChange={(e) => updateDraftField(idx, "outTime", e.target.value)}
                        className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none text-center"
                      />
                    </div>

                    {/* KM Fields */}
                    <div>
                      <label className="text-[9px] uppercase tracking-widest text-[#94a3b8]/60 font-mono font-bold block mb-1">
                        Odometer (In / Out)
                      </label>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          placeholder="In"
                          value={draft.inKm !== null ? draft.inKm : ""}
                          onChange={(e) => updateDraftField(idx, "inKm", e.target.value !== "" ? Number(e.target.value) : null)}
                          className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-1.5 py-1.5 font-mono text-xs text-white focus:outline-none text-center"
                        />
                        <span className="text-slate-500">-</span>
                        <input 
                          type="number"
                          placeholder="Out"
                          value={draft.outKm !== null ? draft.outKm : ""}
                          onChange={(e) => updateDraftField(idx, "outKm", e.target.value !== "" ? Number(e.target.value) : null)}
                          className="w-full bg-[#080d1a] border border-white/10 rounded-xl px-1.5 py-1.5 font-mono text-xs text-white focus:outline-none text-center"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Micro-aggregated display */}
                  <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 px-3.5 py-2 rounded-xl text-[10px] font-mono text-slate-400">
                    <span>Computed Duration: <strong className="text-indigo-400">{calculateTotalHours(draft.inTime || "", draft.outTime || "")} hrs</strong></span>
                    <span>Distance Logged: <strong className="text-cyan-400">{calculateTotalKm(draft.inKm, draft.outKm)} KM</strong></span>
                  </div>
                </div>
              ))}

              {/* Chatbot conversation style follow-up response block for incomplete fields */}
              {activeFollowUpIndex !== null && draftCards[activeFollowUpIndex] && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold font-mono">
                    <AlertCircle className="w-4 h-4" />
                    <span>AI FOLLOW-UP ASSISTANT</span>
                  </div>
                  <p className="text-slate-300">
                    {draftCards[activeFollowUpIndex]._missingCar 
                      ? "I couldn't identify the vehicle plate. What was the Car Number?"
                      : draftCards[activeFollowUpIndex]._missingDuty
                      ? "What was the purpose or operational duty description?"
                      : "Provide any additional start/end odometer readings:"
                    }
                  </p>
                  <form onSubmit={handleFollowUpSubmit} className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Type or speak missing detail..."
                      value={followUpAnswer}
                      onChange={(e) => setFollowUpAnswer(e.target.value)}
                      className="flex-1 bg-[#080d1a] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 text-xs"
                    />
                    <button 
                      type="submit"
                      className="px-4 py-2 bg-amber-500 text-[#080d1a] rounded-xl font-bold hover:bg-amber-400 transition-colors flex items-center gap-1 font-mono text-[10px] uppercase"
                    >
                      <span>Apply</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Bottom buttons */}
            <div className="px-6 py-4.5 border-t border-white/5 bg-white/[0.01] flex justify-end gap-3.5 w-full shrink-0">
              <div className="flex-1">
                <AestheticRedPillButton onClick={() => setIsDraftSheetOpen(false)}>
                  MINIMIZE
                </AestheticRedPillButton>
              </div>
              <div className="flex-1">
                <AestheticPillButton
                  onClick={() => {
                    handleSaveDraftCards();
                    setIsDraftSheetOpen(false);
                  }}
                >
                  SAVE LOGS
                </AestheticPillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Nav Tabs Bar styled natively for Editorial look */}
      <nav className="fixed bottom-0 left-0 right-0 h-24 pb-safe glass-bottom-bar grid grid-cols-4 z-40 shadow-2xl">
        <button
          id="tab-btn-voice"
          onClick={() => setActiveTab("voice")}
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "voice" 
              ? "border-t-2 border-indigo-500 bg-indigo-500/5 text-indigo-400" 
              : "text-slate-400 hover:text-white hover:bg-white/[0.02]"
          }`}
        >
          <Mic className="w-5.5 h-5.5" />
          <span className="text-[9px] uppercase tracking-widest font-bold">Voice Logging</span>
        </button>

        <button
          id="tab-btn-history"
          onClick={() => { setActiveTab("history"); fetchEntries(); }}
          className={`flex flex-col items-center justify-center gap-1 transition-all relative ${
            activeTab === "history" 
              ? "border-t-2 border-indigo-500 bg-indigo-500/5 text-indigo-400" 
              : "text-slate-400 hover:text-white hover:bg-white/[0.02]"
          }`}
        >
          <div className="relative">
            <Database className="w-5.5 h-5.5" />
            {entries.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-[#080d1a]">
                {entries.length}
              </span>
            )}
          </div>
          <span className="text-[9px] uppercase tracking-widest font-bold">History Logs</span>
        </button>

        <button
          id="tab-btn-report"
          onClick={() => { setActiveTab("report"); fetchEntries(); }}
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "report" 
              ? "border-t-2 border-indigo-500 bg-indigo-500/5 text-indigo-400" 
              : "text-slate-400 hover:text-white hover:bg-white/[0.02]"
          }`}
        >
          <Layers className="w-5.5 h-5.5" />
          <span className="text-[9px] uppercase tracking-widest font-bold">Reports</span>
        </button>

        <button
          id="tab-btn-settings"
          onClick={() => setActiveTab("settings")}
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "settings" 
              ? "border-t-2 border-indigo-500 bg-indigo-500/5 text-indigo-400" 
              : "text-slate-400 hover:text-white hover:bg-white/[0.02]"
          }`}
        >
          <Settings className="w-5.5 h-5.5" />
          <span className="text-[9px] uppercase tracking-widest font-bold">Settings</span>
        </button>
      </nav>

    </div>
  );
}
