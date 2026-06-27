# Deploying Fleet Logger to Render — Step-by-step Guide

This is the **deployment guide** for handing the Fleet Logger backend to a client
over the public internet. It assumes you want to host **one Docker service** on
[Render](https://render.com) (free tier) which runs **both** the Node Express
backend and the Python speech sidecar in a single container, behind the
URL Render gives you (e.g. `https://fleet-logger.onrender.com`).

---

## 0. Prerequisites — what you will need

Before doing anything, you'll need:

1. **A GitHub account.** Your code lives in a private or public repo.
2. **A Render account** — sign up at https://render.com (GitHub SSO option is fine).
3. **Docker Desktop on your laptop** so you can verify the build locally BEFORE pushing to Render.
   Get it from https://www.docker.com/products/docker-desktop (free).
4. **The NVIDIA API key** that is currently inside your local `.env`.
   *Keep this on paper or in a password manager.* Render will ask for it later.

> **Do NOT commit your `.env` to GitHub.** The `.gitignore` in this repo already
> excludes it, but double-check the next time you commit.

---

## 1. Push your code to a fresh GitHub repo

1. Sign in to https://github.com.
2. Click **New repository** → name it `fleet-logger` (private is fine).
3. **Do not** initialize with README / .gitignore — we already have those.
4. From your project root (`/Users/subhajitx/fleet-logger`), run:

```bash
git init
git add -A
# DO NOT commit your .env (the .gitignore covers it, but verify):
git status   # confirm no .env in the list
git commit -m "Initial Fleet Logger commit"
git branch -M main
git remote add origin https://github.com/<your-username>/fleet-logger.git
git push -u origin main
```

If Render complains during deploy that it can't pull from GitHub, you'll need to
authorize the Render GitHub app: https://github.com/apps/render/installations/new

---

## 2. Verify the build locally with Docker (before paying Render anything)

This catches 95% of deployment issues before they cost you time:

```bash
cd /Users/subhajitx/fleet-logger

# Build the image (takes 3–6 minutes the first time)
docker build -t fleet-logger .

# Run it locally with your NVIDIA key
docker run --rm -p 3000:3000 \
  --name fleet-logger-test \
  -e NVIDIA_API_KEY="paste-your-key-here" \
  -e TTS_FUNCTION_ID="877104f7-e885-42b9-8de8-f6e4c6303969" \
  -e ASR_FUNCTION_ID="ac04dbc6-29f9-4be5-bf32-010f01c4669b" \
  fleet-logger
```

When the build succeeds and the container starts, you should see logs like:

```
[entrypoint] launching sidecar on :5050
[entrypoint] sidecar is healthy
[entrypoint] launching Express server on :3000
Server listening on port 3000
```

Open http://localhost:3000/ — the Fleet Logger app should run with live ASR working.

Stop it with `Ctrl+C` (the entrypoint will tear down cleanly).

---

## 3. Deploy to Render — Blueprint method (easiest)

Render's **Blueprint** feature reads our `render.yaml` and configures the
service for you.

### Step 3.1 — Connect your repo

On https://dashboard.render.com → click **New +** → **Blueprint**.

- Connect your GitHub account if you haven't yet.
- Select the `fleet-logger` repo.
- Render will detect `render.yaml` and show a preview of the service it will create.
- Click **Apply** (or **Next** then **Create**.

### Step 3.2 — Add your secrets

The deploy will start and **fail at runtime** because secrets aren't set yet.
Don't worry — that's expected. Now add them:

1. Go to your service's **Environment** tab.
2. Click **Add Environment Variable** for each of:

   | Key | Value |
   |---|---|
   | `NVIDIA_API_KEY` | `paste your full key here` |
   | `TTS_FUNCTION_ID` | `877104f7-e885-42b9-8de8-f6e4c6303969` (Magpie TTS) |
   | `ASR_FUNCTION_ID` | `ac04dbc6-29f9-4be5-bf32-010f01c4669b` (Parakeet ASR) |
   | `GEMINI_API_KEY` | (optional) — only if you want Gemini fallback |
   | `SUPABASE_URL` | (optional) — if using Supabase as a data store |
   | `SUPABASE_SERVICE_ROLE_KEY` | (optional) |

3. Click **Save Changes** → Render will redeploy automatically.

### Step 3.3 — Verify

Once the deploy finishes (~5–8 min):

```bash
# Replace with your actual URL (shown on the Render service page)
curl https://fleet-logger.onrender.com/api/health
# Expected: {"status":"ok","sidecarEnabled":true,"nvidiaEnabled":true,...}
```

Visit `https://fleet-logger.onrender.com/` in your browser — you should see the Fleet Logger UI.

---

## 4. Always-on in 5 minutes — set up UptimeRobot (free)

Render's free tier **sleeps any web service that receives zero traffic for
15 minutes**. When asleep, the next request takes 30–60 s to wake. For a
voice logger where the client might tap the mic after a long pause, that
cold-start wait is painful.

**Solution:** a free [UptimeRobot](https://uptimerobot.com) account pings
`/api/health` every 3 minutes, forever. The ping never goes unanswered,
Render never sleeps, the client gets instant mic response.

1. Sign up at https://uptimerobot.com (free, no card).
2. Click **+ Add New Monitor**.
3. Fill in:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: `Fleet Logger`
   - **URL (or IP)**: `https://fleet-logger.onrender.com/api/health`
     *(replace with your real Render URL)*
   - **Monitoring Interval**: 5 minutes (free tier allows 5 min minimum;
     60-min intervals would risk sleeping between pings)
4. Click **Create Monitor**. UptimeRobot starts pinging immediately.

Verify the monitor works:
- UptimeRobot dashboard will turn **green ✅** within 30 s of the first ping.
- On Render's service page → **Logs**, you'll see a smooth stream of
  `GET /api/health 200` entries every 5 minutes. **That's the proof
  your service is staying warm.**

That's it. No card, no instance you manage.

> If you ever want to take it further, the paid tiers of Render Starter
> ($7/mo) eliminate the cold-start problem entirely. UptimeRobot is
> required *only* on the free tier.

---

## 5. Point your Android APK at the new backend & ship to the client

The APK that ships to your client must be **built with your Render URL
baked in**. The build script does this:

```bash
# From repo root.
VITE_API_BASE_URL=https://fleet-logger.onrender.com npm run build:apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Or use the default (same URL) — `npm run build:apk` is enough if you
deployed to `fleet-logger.onrender.com`.

To override the per-device URL without rebuilding the APK, the app's
**Settings → Backend URL** field lets the user paste any URL at runtime
(see Section 5.2 below).

### 5.1 First-time Android install on your client's phone

The APK is **debug-signed** (`com.fleet.logger`, signed with the Android
debug keystore). Since this is not for the Play Store, that's fine.

1. Copy `app-debug.apk` to your client. Three reliable ways:
   - **WhatsApp / Telegram / Drive / AirDrop** — quickest.
   - **Email** — the APK is ~6 MB, often too big for attachments over
     Gmail's 25 MB cap, but Drive handles it.
   - **USB cable + `adb install -r app-debug.apk`** — cleanest.

2. On the client's phone, the user opens the APK file.
   Android will block and prompt: *"For your security, your phone is not
   allowed to install unknown apps from this source."*
   → Tap **Settings** → enable *"Allow from this source"* for whichever
     app prompted (Files / Drive / WhatsApp).
   → Back-arrow out, tap **Install**. Confirms in ~3 s.

3. Open the app. The startup splash hits your Render URL and shows the
   *"VISHAL"* signature.

### 5.2 Per-device backend override (no rebuild)

If the client ever needs to switch the backend URL (e.g. you move off
Render), they don't need a new APK. The **Settings → Backend URL**
field persists the override in `localStorage` and takes precedence over
the build-time `VITE_API_BASE_URL`. Just paste the new URL, save,
restart the app.

### 5.3 Updating later

To push a new APK with code changes:

```bash
# 1. Make & commit your code changes
# 2. Rebuild the APK
VITE_API_BASE_URL=https://fleet-logger.onrender.com npm run build:apk
# 3. Send the new APK to the client
```

To push new backend code without touching the APK:
```bash
git push origin main
# Render auto-deploys from your connected repo
```

---

## 6. Costs (be honest with the client before showing them)

| Tier | Monthly cost | What you get |
|---|---|---|
| Render free (Docker) | **$0** but cold-starts | 500 h/month, sleeps after 15 min no traffic, slow first load (5–30 s) |
| Render Starter | **$7** | Always-on, no sleep, monthly included hours |
| NVIDIA NIM ASR + TTS | **~$0 to small** | Per-second billing on https://build.nvidia.com — every minute of dictation costs tiny amounts. Watch the dashboard. |

**Free tier gotcha:** the service sleeps when idle. The entrypoint takes ~10 s
to wake up. Clients hitting it cold will see a "slow first response." If that
bothers the client, upgrade to the $7 plan or set up an "always-warm" ping.

---

## 7. Production hardening checklist (do this once you have a paying client)

These are NOT required for the demo, but you need them before go-live:

- [ ] **Set a hard cap** on the NVIDIA API key via the NVIDIA dashboard.
  Go to https://build.nvidia.com → API Keys → set a monthly spend limit.
- [ ] **Rotate the API key** every 90 days. Generate a new key in Render, retire the old one.
- [ ] **Switch to Render Starter plan** ($7/mo) — free tier sleep behavior looks unprofessional on a real client demo.
- [ ] **Build a release-signed APK** (separate from the debug-signed APK in this repo). See `android/README-sign.md` when we get there.
- [ ] **Privacy review**: the app stores car numbers, driver names, and audio recordings. Confirm with your client where the data is supposed to live, and make sure that's clear to the user.
- [ ] **Custom domain** (`api.myfleet.com`) — attach via Render's "Custom Domains" tab once you have one.

---

## 8. If something goes wrong — troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Container crashes at start, "sidecar unreachable" | `NVIDIA_API_KEY` unset | Set it in Render's env vars, redeploy |
| `/api/health` says `sidecarEnabled:false` | Sidecar gRPC init failed | Check NVIDIA key is valid; check sidecar logs in Render's "Logs" tab |
| APK can't reach backend | Wrong `backendUrl` in app settings | Set backendUrl to the Render URL (where the API lives, not just the app) |
| 5-second delay before page loads | Free tier cold start | Upgrade to $7 Starter plan, or set up a cron pinger |
| Transcriptions return garbage | Audio encoded wrong | Browser sends `audio/webm`; sidecar converts internally. Don't pre-encode to WAV. |

---

## 9. Tear down

When you want to remove the deployment:

```bash
# In Render dashboard → service → Settings → Delete Service
```

This stops billing and removes the URL. Your code in GitHub is unaffected.

---

**Last reviewed:** 2026-06-25 — the Dockerfile, render.yaml, and sidecar
manifests in this repo were all verified working locally on macOS with Docker.
