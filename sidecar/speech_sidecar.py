"""
Fleet Logger Speech Sidecar
===========================

A small Python service that exposes NVIDIA Riva (Magpie TTS + Parakeet ASR)
over plain HTTP/JSON so the Node.js server can use it without compiling gRPC
protobufs.

Endpoints:
  POST /tts
    body: { "text": "...", "language": "en-US"|"hi-IN", "voice": "EN-US.Aria" (optional) }
    returns: audio/ogg (Opus-encoded audio) — ready for <audio> tag

  POST /transcribe
    body: { "audioBase64": "...", "mimeType": "audio/webm" }
    returns: { "transcript": "the spoken text" }

  GET /health
    returns: { "status": "ok", "tts_available": true, "asr_available": true }

The sidecar keeps a single persistent gRPC channel to nvcf.nvidia.com.
Authentication uses the same NVIDIA NIM API key the Node server uses.
"""

import base64
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

# Load .env from the project root (one level up from this file)
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
except Exception:
    pass

# Disable gRPC fork handlers to prevent child process crashes when running subprocesses (ffmpeg)
os.environ["GRPC_ENABLE_FORK_SUPPORT"] = "false"

import grpc
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import riva.client
from riva.client.proto import (
    riva_tts_pb2,
    riva_tts_pb2_grpc,
    riva_asr_pb2,
    riva_asr_pb2_grpc,
    riva_audio_pb2,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("speech-sidecar")

# --- Config ---
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
TTS_FUNCTION_ID = os.environ.get("TTS_FUNCTION_ID", "877104f7-e885-42b9-8de8-f6e4c6303969")
ASR_FUNCTION_ID = os.environ.get("ASR_FUNCTION_ID", "ac04dbc6-29f9-4be5-bf32-010f01c4669b")  # ai-parakeet-ctc-1_1b-asr-inworld
NVCF_HOST = os.environ.get("NVCF_HOST", "grpc.nvcf.nvidia.com:443")
SAMPLE_RATE = 22050

# --- Auth + gRPC channel ---
def build_auth(function_id: str) -> riva.client.Auth:
    return riva.client.Auth(
        uri=NVCF_HOST,
        use_ssl=True,
        metadata_args=[
            ("function-id", function_id),
            ("authorization", f"Bearer {NVIDIA_API_KEY}"),
        ],
    )

# Single persistent channel (gRPC best practice — channels are expensive to open)
_channel = None
_tts_auth = None
_asr_auth = None
_tts_stub = None
_asr_stub = None


def init_grpc():
    global _channel, _tts_auth, _asr_auth, _tts_stub, _asr_stub
    if not NVIDIA_API_KEY:
        log.error("NVIDIA_API_KEY not set")
        return False
    try:
        _channel = grpc.secure_channel(NVCF_HOST, grpc.ssl_channel_credentials())
        _tts_auth = build_auth(TTS_FUNCTION_ID)
        _asr_auth = build_auth(ASR_FUNCTION_ID)
        _tts_stub = riva_tts_pb2_grpc.RivaSpeechSynthesisStub(_channel)
        _asr_stub = riva_asr_pb2_grpc.RivaSpeechRecognitionStub(_channel)
        log.info("gRPC channel + stubs initialized")
        return True
    except Exception as e:
        log.error("gRPC init failed: %s", e)
        return False


# --- App ---
app = FastAPI(title="Fleet Logger Speech Sidecar")


class TTSRequest(BaseModel):
    text: str
    language: str = "en-US"
    voice: Optional[str] = None  # e.g. "EN-US.Aria". If None, model uses default.


class TranscribeRequest(BaseModel):
    audioBase64: str
    mimeType: str = "audio/webm"
    language: str = "en-US"


@app.on_event("startup")
def on_startup():
    if not init_grpc():
        return
    # Prewarm the gRPC channel with a tiny TTS call so the first real user request
    # doesn't pay the connection-handshake cost. Errors are non-fatal.
    import threading
    def _prewarm():
        try:
            time.sleep(0.5)  # let the server finish its own startup
            import riva.client.proto.riva_tts_pb2 as _tts
            import riva.client.proto.riva_audio_pb2 as _audio
            req = _tts.SynthesizeSpeechRequest(
                text="ok",
                language_code="en-US",
                voice_name="",
                encoding=_audio.AudioEncoding.OGGOPUS,
                sample_rate_hz=22050,
            )
            _tts_stub.Synthesize(req, metadata=_tts_auth.get_auth_metadata(), timeout=20)
            log.info("TTS prewarm complete")
        except Exception as e:
            log.warning("TTS prewarm failed (non-fatal): %s", e)
    threading.Thread(target=_prewarm, daemon=True).start()


@app.get("/health")
def health():
    return {
        "status": "ok" if _channel is not None else "degraded",
        "tts_available": _tts_stub is not None,
        "asr_available": _asr_stub is not None,
        "tts_model": "magpie-multilingual",
        "asr_model": "parakeet-1.1b",
        "supported_tts_languages": ["en-US", "hi-IN"],
    }


@app.post("/tts")
def tts(req: TTSRequest):
    if _tts_stub is None:
        raise HTTPException(503, "TTS not initialized")
    if not req.text or not req.text.strip():
        raise HTTPException(400, "text is required")

    # Strip any non-Latin script unless the model supports it.
    # Magpie supports EN-US + HI-IN. For other languages we still pass through
    # and let the model pick a reasonable default voice.
    language = req.language
    if language not in ("en-US", "hi-IN"):
        log.warning("Requested language %s not in primary list, falling back to en-US", language)
        language = "en-US"
    # Magpie Multilingual TTS: if we pass a voice name, the model treats it
    # as a zero-shot prompt and requires reference audio. We don't have that,
    # so we pass an empty voice name and let the model auto-pick from the
    # language code. (This is the only way to get plain TTS from Magpie.)
    voice = req.voice if req.voice else ""

    # Build the request
    pb_req = riva_tts_pb2.SynthesizeSpeechRequest(
        text=req.text,
        language_code=language,
        voice_name=voice,
        encoding=riva_audio_pb2.AudioEncoding.OGGOPUS,
        sample_rate_hz=SAMPLE_RATE,
    )
    try:
        resp = _tts_stub.Synthesize(pb_req, metadata=_tts_auth.get_auth_metadata(), timeout=20)
        audio = bytes(resp.audio)
        log.info("TTS OK: text=%d chars, voice=%s, lang=%s, audio=%d bytes", len(req.text), voice, language, len(audio))
        return Response(content=audio, media_type="audio/ogg")
    except grpc.RpcError as e:
        log.error("TTS RPC error: %s — %s", e.code(), e.details()[:200])
        if "rate limit" in e.details().lower():
            raise HTTPException(429, "TTS rate limit hit. Please wait a few seconds.")
        raise HTTPException(502, f"TTS service error: {e.details()[:200]}")


@app.post("/transcribe")
def transcribe(req: TranscribeRequest):
    if _asr_stub is None:
        raise HTTPException(503, "ASR not initialized")
    try:
        clean_b64 = req.audioBase64.split(",")[-1] if "," in req.audioBase64 else req.audioBase64
        audio_bytes = base64.b64decode(clean_b64)
        log.info("Transcribe request: %d bytes of %s", len(audio_bytes), req.mimeType)

        # Riva ASR expects LINEAR_PCM 16-bit 16kHz mono. We accept webm/wav/ogg from the
        # browser and convert with ffmpeg if needed.
        raw_pcm = _decode_to_pcm(audio_bytes, req.mimeType)
        if raw_pcm is None or len(raw_pcm) == 0:
            raise HTTPException(400, "Could not decode audio to PCM")

        asr_req = riva_asr_pb2.RecognizeRequest(
            config=riva_asr_pb2.RecognitionConfig(
                encoding=riva_audio_pb2.AudioEncoding.LINEAR_PCM,
                sample_rate_hertz=16000,
                language_code=req.language,
                max_alternatives=1,
                enable_automatic_punctuation=True,
            ),
            audio=raw_pcm,
        )
        resp = _asr_stub.Recognize(asr_req, metadata=_asr_auth.get_auth_metadata(), timeout=30)
        transcript = ""
        for result in resp.results:
            for alt in result.alternatives:
                if alt.transcript:
                    transcript = alt.transcript
                    break
            if transcript:
                break
        log.info("Transcribe OK: %d chars", len(transcript))
        return {"transcript": transcript}
    except grpc.RpcError as e:
        log.error("ASR RPC error: %s — %s", e.code(), e.details()[:200])
        raise HTTPException(502, f"ASR service error: {e.details()[:200]}")
    except Exception as e:
        log.exception("Transcribe failed")
        raise HTTPException(500, str(e))


def _decode_to_pcm(audio_bytes: bytes, mime_type: str) -> Optional[bytes]:
    """Decode any browser-recorded audio (webm/ogg/wav) to 16kHz 16-bit mono PCM.
    Uses ffmpeg if available; otherwise assumes the bytes are already raw PCM (wav)."""
    import subprocess
    import tempfile

    # If it's already a WAV, we can extract PCM directly with the stdlib
    if mime_type.endswith("wav") or audio_bytes[:4] == b"RIFF":
        try:
            import wave
            import io
            with wave.open(io.BytesIO(audio_bytes), "rb") as w:
                if w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2:
                    return w.readframes(w.getnframes())
        except Exception:
            pass

    # Try ffmpeg
    try:
        with tempfile.NamedTemporaryFile(suffix="." + mime_type.split("/")[-1].split(";")[0], delete=False) as inp:
            inp.write(audio_bytes)
            inp_path = inp.name
        with tempfile.NamedTemporaryFile(suffix=".pcm", delete=False) as outp:
            outp_path = outp.name
        subprocess.run(
            ["ffmpeg", "-y", "-i", inp_path, "-ar", "16000", "-ac", "1", "-f", "s16le", outp_path],
            check=True, capture_output=True, timeout=30,
        )
        with open(outp_path, "rb") as f:
            return f.read()
    except FileNotFoundError:
        log.warning("ffmpeg not installed; cannot decode %s", mime_type)
        return None
    except subprocess.CalledProcessError as e:
        log.error("ffmpeg failed (exit code %d). Stderr: %s", e.returncode, e.stderr.decode(errors="ignore"))
        return None
    except Exception as e:
        log.error("decode error: %s", e)
        return None
    finally:
        try: os.unlink(inp_path)
        except Exception: pass
        try: os.unlink(outp_path)
        except Exception: pass


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("SIDECAR_HOST", "0.0.0.0")
    port = int(os.environ.get("SIDECAR_PORT", "5050"))
    uvicorn.run(app, host=host, port=port, log_level="info")
