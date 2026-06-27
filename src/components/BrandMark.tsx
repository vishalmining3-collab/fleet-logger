import React, { useEffect, useState } from "react";
import styled, { keyframes, css } from "styled-components";
import { consumeArcHandoff, subscribeArcHandoff } from "../lib/brandCredit";

/**
 * BrandMark — clean glassmorphic "V" monogram, mirrored opposite the user
 * icon at the right edge of the topbar.
 *
 * Visual: a static 32x32 glass disc with a crisp "V" letter floating on top,
 * plus a soft cyan bloom halo. NO rotating gradient stack — just a clean,
 * stable brand mark that stays legible in every lighting.
 *
 * Two states:
 *   - "arriving" (consumed after splash handoff): a brief 1.2s in-flare,
 *     then settle into the steady state.
 *   - "settled": subtle continuous "alive" treatment — slow glass-shine
 *     sweep and a gentle chromatic-aberration glitch every ~9s.
 *
 * One-shot handoff via consumeArcHandoff().
 */
export const BrandMark: React.FC = () => {
  const [mode, setMode] = useState<"arriving" | "settled">("settled");

  useEffect(() => {
    if (consumeArcHandoff()) {
      setMode("arriving");
      const t = window.setTimeout(() => setMode("settled"), 1200);
      return () => window.clearTimeout(t);
    }
    const unsub = subscribeArcHandoff(() => {
      if (consumeArcHandoff()) {
        setMode("arriving");
        window.setTimeout(() => setMode("settled"), 1200);
      }
    });
    return unsub;
  }, []);

  return (
    <StyledSlot aria-hidden>
      <StyledDisc $mode={mode}>
        <span className="bloom" />
        <span className="letter">V</span>
        {mode === "arriving" && <span className="flare" />}
      </StyledDisc>
    </StyledSlot>
  );
};

// ─── animations ──────────────────────────────────────────────────────────

const sheenSweep = keyframes`
  0%, 78%, 100% { transform: translateX(-125%) skewX(-22deg); opacity: 0; }
  88%           { opacity: 0.45; }
  92%           { transform: translateX(125%)  skewX(-22deg); opacity: 0; }
`;
const chromaticGlitch = keyframes`
  0%, 88%, 100% { transform: translate(0, 0); filter: none; }
  90%           { transform: translate(-0.5px, 0);
                  filter: drop-shadow(0.5px 0 0 rgba(34,211,238,0.9))
                          drop-shadow(-0.5px 0 0 rgba(99,102,241,0.85)); }
  92%           { transform: translate(0.5px, -0.3px); filter: none; }
  94%           { transform: translate(0, 0); }
`;
const pulseGlow = keyframes`
  0%, 100% { opacity: 0.50; }
  50%      { opacity: 0.85; }
`;
const arrivalPop = keyframes`
  0%   { transform: scale(0.6); filter: blur(4px); opacity: 0.4; }
  60%  { transform: scale(1.06); filter: blur(0); opacity: 1; }
  100% { transform: scale(1); filter: blur(0); opacity: 1; }
`;
const arrivalFlare = keyframes`
  0%   { opacity: 0.9;  transform: scale(1); }
  60%  { opacity: 0.4;  transform: scale(1.55); }
  100% { opacity: 0;    transform: scale(2.0); }
`;

// ─── styled pieces ────────────────────────────────────────────────────────

const StyledSlot = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 100%;
`;

const StyledDisc = styled.div<{ $mode: "arriving" | "settled" }>`
  position: relative;
  width: 2rem;          /* w-8 — matches the right-side profile button */
  height: 2rem;         /* h-8 — matches the right-side profile button */
  border-radius: 9999px;
  overflow: hidden;
  isolation: isolate;
  cursor: default;
  pointer-events: auto;

  background:
    radial-gradient(120% 120% at 35% 25%, rgba(165, 243, 252, 0.16) 0%, rgba(8, 47, 73, 0.55) 60%, rgba(2, 6, 23, 0.75) 100%);
  backdrop-filter: blur(10px) saturate(150%);
  -webkit-backdrop-filter: blur(10px) saturate(150%);
  border: 1px solid rgba(34, 211, 238, 0.45);
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.07),
    inset 0 0 10px rgba(34, 211, 238, 0.18),
    0 0 14px rgba(6, 182, 212, 0.32),
    0 0 22px rgba(99, 102, 241, 0.18);

  ${(p) =>
    p.$mode === "arriving"
      ? css`animation: ${arrivalPop} 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards;`
      : css`animation: ${chromaticGlitch} 9s steps(1) infinite;`}

  /* Soft outer bloom — keeps the disc feeling 'alive' without spinning */
  .bloom {
    position: absolute;
    inset: -6px;
    border-radius: 9999px;
    pointer-events: none;
    z-index: 0;
    background: radial-gradient(circle at center, rgba(34, 211, 238, 0.32) 0%, rgba(34, 211, 238, 0) 70%);
    animation: ${pulseGlow} 4.2s ease-in-out infinite;
  }

  /* The "V" — single crisp letter at the centre of the disc */
  .letter {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Inter", "system-ui", sans-serif;
    font-weight: 700;
    font-size: 0.78rem;
    line-height: 1;
    letter-spacing: 0.04em;
    color: rgba(220, 252, 255, 0.96);
    text-shadow:
      0 0 6px rgba(34, 211, 238, 0.65),
      0 0 14px rgba(6, 182, 212, 0.40);
    pointer-events: none;
  }

  /* Periodic sheen sweep — feels like glass catching light */
  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(
      100deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(186, 230, 253, 0.35) 45%,
      rgba(255, 255, 255, 0) 100%
    );
    transform: translateX(-125%) skewX(-22deg);
    animation: ${sheenSweep} 7s ease-in-out infinite;
    mix-blend-mode: screen;
  }

  /* Brief flare overlay only during the arc-handoff arrival */
  .flare {
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    pointer-events: none;
    background: radial-gradient(circle at center, rgba(165, 243, 252, 0.85) 0%, rgba(34, 211, 238, 0.5) 35%, rgba(34, 211, 238, 0) 70%);
    z-index: 3;
    animation: ${arrivalFlare} 1.2s ease-out forwards;
  }

  @media (prefers-reduced-motion: reduce) {
    .bloom, .letter, .flare, &::before { animation: none !important; }
  }
`;
