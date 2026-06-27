# Fleet Logger — Voice-First Intelligent PWA

A high-performance, voice-first Progressive Web App (PWA) for fleet operators and drivers in India. Drivers log daily vehicle duties by speaking naturally in English, Hindi, or Bengali — the app turns speech into structured logs in <50ms, and an AI agent speaks the result back to confirm.

## What's new

- **Local rule-based parser** handles ~80% of dictation in <2ms with no network call.
- **NVIDIA NIM** (Llama 3.1 8B for chat) is the primary AI engine, with Gemini as fallback.
- **Python gRPC sidecar** wraps NVIDIA Riva services that the Node server can't speak directly:
  - **Magpie Multilingual TTS** for the AI agent's voice (English + Hindi, 23 languages supported)
  - **Whisper Large v3** for cloud STT fallback when the browser's Web Speech API fails
- **AI Agent** that speaks the parsed draft readback, asks follow-up questions for missing fields, and confirms save with a haptic buzz.
- **Supabase REST proxy** ready (just add `SUPABASE_URL` + `SUPABASE_KEY` to `.env`).

## Architecture

```
┌──────────────┐  Browser Web Speech API  ┌──────────────┐
│   Browser    │ ─────────────────────────▶│  Draft Card  │
│   (mobile or │  (instant, free, on-device)  │  (editable)  │
│   desktop)   │                            └──────┬───────┘
└──────┬───────┘                                   │ Save
       │ Audio (when Web Speech fails)            │
       │                                           ▼
       │  POST /api/transcribe (audio)  ┌─────────────────────┐
       └──────────────────────────────▶│  Node Express       │
                                       │  (port 3000)        │
                                       └──────┬──────────────┘
                                              │ HTTP/JSON
                                              ▼
                                       ┌─────────────────────┐
                                       │  Python Sidecar     │
                                       │  (port 5050)        │
                                       │  FastAPI + gRPC     │
                                       └──────┬──────────────┘
                                              │ gRPC (TLS)
                                              ▼
                                       ┌─────────────────────┐
                                       │  NVIDIA NVCF        │
                                       │  Magpie TTS         │
                                       │  Whisper ASR        │
                                       │  Llama 3.1 Chat     │
                                       └─────────────────────┘
```

### Why a Python sidecar?

NVIDIA Riva (TTS/ASR) and the Magpie Multilingual model speak **gRPC with protocol buffers**. The Node.js `riva.client` is fragile and requires compiling `.proto` files. Python's `nvidia-riva-client` is the **officially supported** path. So we run a small FastAPI sidecar that:
- Accepts plain JSON over HTTP
- Maintains one persistent gRPC channel to `grpc.nvcf.nvidia.com:443`
- Returns OGG Opus audio bytes (TTS) or transcribed text (ASR)
- Falls back to `ffmpeg` for audio transcoding (browser webm → 16kHz PCM for Whisper)

## Run locally

1. **Install deps**:
   ```bash
   npm install
   pip3 install --user nvidia-riva-client fastapi uvicorn pydantic python-dotenv
   brew install ffmpeg  # for audio transcoding
   ```

2. **Get a free NVIDIA NIM key** at https://build.nvidia.com (click any model → "Get API Key") and put it in `.env`:
   ```bash
   cp .env.example .env
   # edit .env and set NVIDIA_API_KEY
   ```

3. **Start the sidecar** (in one terminal):
   ```bash
   cd sidecar && python3 speech_sidecar.py
   ```
   It listens on port 5050. On first startup it does a one-time "prewarm" TTS call so the first real user request is fast.

4. **Start the app** (in another terminal):
   ```bash
   npm run dev
   ```
   Open http://localhost:3000. Or, run the bundled launcher to start both with one command (and get the LAN IP for mobile testing):
   ```bash
   ./start.sh
   # → http://localhost:3000   (local)
   # → http://192.168.x.x:3000 (mobile on same WiFi)
   ```
   Both processes bind to `0.0.0.0` so phones on the same network can reach the dev server.

5. **Verify everything's working**:
   ```bash
   curl http://localhost:3000/api/health
   # Should show: sidecarEnabled: true, ttsModel: magpie-multilingual, asrModel: whisper-large-v3
   curl http://127.0.0.1:5050/health
   # Should show: tts_available: true, asr_available: true
   ```

## Tests

```bash
npm test         # runs both parser and agent tests (22 cases)
npm run test:parser  # 12 cases for the local rule-based parser
npm run test:agent   # 10 cases for the AI agent readback builders
```

## What the AI agent does

After every parse, the agent:
1. **Speaks the readback** of the parsed draft via the server TTS (NIM Magpie):
   > "I logged Hospital Run, car W B, zero two, A B, 1234, from 9 AM to 6 PM, for Rajesh. Is that right?"
2. **Asks follow-up questions** for missing fields (e.g. "What was the duty?"), again via TTS
3. **Confirms save** with a haptic vibration + spoken confirmation
4. **Auto-resumes the mic** for the next entry

The agent can be muted with the speaker icon in the topbar.

## Files

- `sidecar/speech_sidecar.py` — Python gRPC sidecar (TTS + ASR over HTTP)
- `src/lib/localParser.ts` — sub-50ms rule-based parser
- `src/lib/aiAgent.ts` — AI agent that speaks, builds readbacks, triggers haptics
- `src/App.tsx` — UI; hybrid parser (local first, LLM fallback); wired-up agent
- `server.ts` — Express server; proxies to sidecar for TTS/ASR; NIM for chat

## Optional: Supabase cloud sync

If you set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`, the server uses Supabase Postgres instead of local `data/entries.json`. The PRD's `entries` table schema is auto-used.
