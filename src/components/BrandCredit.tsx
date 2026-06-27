import React, { useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";
import { startArcHandoff } from "../lib/brandCredit";

/**
 * BrandCredit — the in-splash "crafted by VISHAL" credit.
 *
 * Lives inside AestheticBootLoader. Three phases:
 *   A (0 → 10s)   Glitchy cyan text — matches the FLEET LOGGER wordmark
 *                 vocabulary (scan-out, jitter, deblur-in, glassmorphic).
 *   B (10s)       Text dissolves spark-leaving, calls startArcHandoff().
 *   C (10s → ~1.2s) A thin SVG filament arcs from the splash centre to the
 *                    future BrandMark slot (top-left of the topbar),
 *                    drawn via stroke-dashoffset, with cyan spark particles
 *                    shedding along the path. The boot overlay keeps the
 *                    arc visible while it animates — when the splash unmounts,
 *                    BrandMark takes over via consumeArcHandoff().
 *
 * Touch anywhere on the splash (the parent overlay) to skip Phase A.
 */
const PHASE_A_DURATION_MS = 10000;   // glitch playthrough
const PHASE_B_DURATION_MS = 1100;    // arc travel / landing

export const BrandCredit: React.FC = () => {
  const [phase, setPhase] = useState<"A" | "B" | "GONE">("A");
  const tickStart = useRef<number | null>(null);

  // Auto-run Phase A → Phase B → GONE on a fixed timer.
  useEffect(() => {
    tickStart.current = performance.now();
    const timerA = window.setTimeout(() => {
      // Hand off to the BrandMark right at the moment of dissolve.
      startArcHandoff();
      setPhase("B");
    }, PHASE_A_DURATION_MS);
    const timerB = window.setTimeout(() => {
      // Splash will soon unmount; BrandMark takes over the landing.
      setPhase("GONE");
    }, PHASE_A_DURATION_MS + PHASE_B_DURATION_MS);
    return () => {
      window.clearTimeout(timerA);
      window.clearTimeout(timerB);
    };
  }, []);

  return (
    <StyledCreditRoot>
      {phase === "A" && <CreditText />}
      {phase === "B" && <ArcFilament />}
    </StyledCreditRoot>
  );
};

// ─── Phase A: Glitchy text "crafted by VISHAL" ────────────────────────────

const CreditText: React.FC = () => (
  <StyledCreditText role="text" aria-label="crafted by VISHAL">
    <span className="bullet bullet-left"  aria-hidden />
    <span className="prefix">crafted by</span>
    <span className="divider" aria-hidden />
    <span className="name" data-text="VISHAL">VISHAL</span>
    <span className="bullet bullet-right" aria-hidden />
  </StyledCreditText>
);

// Each keyframe mirrors a bit of the FLEET LOGGER wordmark's vocabulary.
const glitchIn = keyframes`
  0%   { opacity: 0; filter: blur(6px); transform: translateY(8px); }
  55%  { opacity: 1; filter: blur(0);   transform: translateY(-1px); }
  100% { opacity: 1; filter: blur(0); transform: translateY(0); }
`;
const glitchJitter = keyframes`
  0%, 92%, 100% { transform: translateX(0); }
  93%           { transform: translateX(-1px); filter: hue-rotate(-12deg); }
  94%           { transform: translateX(1.5px); filter: hue-rotate(14deg); }
  95%           { transform: translateX(-0.5px); filter: hue-rotate(0deg); }
  96%           { transform: translateX(0.8px); }
`;
const dotPulse = keyframes`
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.25); }
`;
const dotPulseAlt = keyframes`
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.4); }
`;

const StyledCreditRoot = styled.div`
  position: relative;
  display: inline-block;
  overflow: hidden;            /* clip any escaping keyframe artifacts */
  padding: 0;
  margin-top: 1.4rem;
  margin-bottom: 1.6rem;
  user-select: none;
  pointer-events: none;
  /* Force the credit onto a single line. Without this, the parent
     inline-block shrinks to fit content but the long ‘crafted by’ +
     ‘VISHAL’ wordmark collapses to two lines on narrow viewports. */
  white-space: nowrap;
  max-width: 100vw;
`;

const StyledCreditText = styled.p`
  margin: 0;
  padding: 0.45rem 0.6rem;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  position: relative;
  font-family: "JetBrains Mono", "Menlo", monospace;
  font-size: 0.66rem;
  font-weight: 500;
  color: rgba(165, 243, 252, 0.65);
  text-shadow:
    0 0 6px rgba(34, 211, 238, 0.35),
    0 0 14px rgba(6, 182, 212, 0.2);
  letter-spacing: 0.18em;
  opacity: 0;
  animation:
    ${glitchIn} 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards,
    ${glitchJitter} 4s ease-in-out infinite 1.4s;

  /* Container dots — small, same size on both sides for visual symmetry */
  .bullet {
    width: 4px;
    height: 4px;
    border-radius: 9999px;
    background: rgba(6, 182, 212, 0.9);
    box-shadow: 0 0 6px rgba(6, 182, 212, 0.65);
    flex: 0 0 auto;
  }
  .bullet-left  { animation: ${dotPulse}    2.4s ease-in-out infinite; }
  .bullet-right { animation: ${dotPulseAlt} 2.4s ease-in-out 1.2s infinite; }

  /* Thin separator between “crafted by” and “VISHAL” — same look as the
     bullet system but slightly longer, contained, and tight to the text. */
  .divider {
    width: 14px;
    height: 1px;
    border-radius: 1px;
    background: linear-gradient(
      90deg,
      rgba(6, 182, 212, 0) 0%,
      rgba(34, 211, 238, 0.75) 50%,
      rgba(6, 182, 212, 0) 100%
    );
    box-shadow: 0 0 4px rgba(34, 211, 238, 0.5);
    flex: 0 0 auto;
    opacity: 0.85;
  }

  .prefix {
    color: rgba(165, 243, 252, 0.65);
    letter-spacing: 0.18em;
  }

  .name {
    color: rgba(165, 243, 252, 0.95);
    /* Slightly tighter than before so it doesn't read as disconnected. */
    letter-spacing: 0.32em;
    font-weight: 600;
    text-transform: uppercase;
    text-shadow:
      0 0 6px rgba(34, 211, 238, 0.55),
      0 0 18px rgba(6, 182, 212, 0.4);
    position: relative;
  }
  .name::before,
  .name::after {
    content: attr(data-text);
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
  }
  .name::before {
    color: rgba(34, 211, 238, 0.9);
    transform: translate(-1px, 0);
    animation: cypher-r 2.6s steps(1) infinite;
  }
  .name::after {
    color: rgba(99, 102, 241, 0.9);
    transform: translate(1px, 0);
    animation: cypher-b 2.6s steps(1) infinite;
  }

  @keyframes cypher-r {
    0%, 70%, 100% { opacity: 0; transform: translate(-1px, 0); }
    72%, 80%      { opacity: 0.85; transform: translate(-1.5px, 0); }
    76%           { opacity: 0.85; transform: translate(-0.5px, 0); }
  }
  @keyframes cypher-b {
    0%, 70%, 100% { opacity: 0; transform: translate(1px, 0); }
    73%, 81%      { opacity: 0.85; transform: translate(1.4px, 0); }
    77%           { opacity: 0.85; transform: translate(0.6px, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 1;
    &::after { animation: none; opacity: 0.5; }
    .name::before, .name::after { display: none; }
    .dot { animation: none; }
  }
`;

// ─── Phase B: arc filament from center to top-left slot ──────────────────
//
// The path travels from (50%, 92%) — the bottom-centre of the splash where
// the credit was — up and to the left toward the future BrandMark anchor
// at (8%, 8%). This is a CSS-positioned overlay inside the splash, drawn as
// a thin SVG quadratic curve with stroke-dashoffset, shedding spark
// particles.

const ArcFilament: React.FC = () => {
  // Two layers of stroke (a wider faded glow underneath, thin crisp line
  // on top), both draw via stroke-dashoffset. ~1.05s draw cycle.
  const DRAW_MS = 1050;

  return (
    <StyledFilamentRoot aria-hidden>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <linearGradient id="filamentGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%"   stopColor="rgba(6, 182, 212, 0.0)" />
            <stop offset="35%"  stopColor="rgba(34, 211, 238, 0.95)" />
            <stop offset="100%" stopColor="rgba(165, 243, 252, 1)" />
          </linearGradient>
          <filter id="filamentGlow">
            <feGaussianBlur stdDeviation="0.45" />
          </filter>
        </defs>
        {/* glow underlayer */}
        <path
          id="filament-glow"
          d="M 50 92 Q 38 60 18 26 Q 12 16 8 8"
          stroke="rgba(34, 211, 238, 0.55)"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          filter="url(#filamentGlow)"
          style={{
            strokeDasharray: 140,
            strokeDashoffset: 140,
            animation: `filament-draw ${DRAW_MS}ms cubic-bezier(0.65, 0, 0.35, 1) forwards`,
          }}
        />
        {/* crisp core line */}
        <path
          id="filament-core"
          d="M 50 92 Q 38 60 18 26 Q 12 16 8 8"
          stroke="url(#filamentGrad)"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
          style={{
            strokeDasharray: 140,
            strokeDashoffset: 140,
            animation: `filament-draw ${DRAW_MS}ms cubic-bezier(0.65, 0, 0.35, 1) forwards`,
          }}
        />
        {/* spark at the head */}
        <circle
          cx="8"
          cy="8"
          r="1.6"
          fill="rgba(165, 243, 252, 1)"
          style={{
            opacity: 0,
            transformOrigin: "8px 8px",
            animation: `head-spark ${DRAW_MS}ms ease-out forwards`,
          }}
        />
      </svg>
      <style>{`
        @keyframes filament-draw {
          0%   { stroke-dashoffset: 140; }
          90%  { stroke-dashoffset: 0;   }
          100% { stroke-dashoffset: 0;   opacity: 0.7; }
        }
        @keyframes head-spark {
          0%   { opacity: 0; transform: scale(0.6); }
          70%  { opacity: 1; transform: scale(2.2); }
          100% { opacity: 0.55; transform: scale(1.2); }
        }
      `}</style>
    </StyledFilamentRoot>
  );
};

const StyledFilamentRoot = styled.div`
  position: absolute;
  /* Anchor the SVG box to cover the same area as the credit, but slightly
     extended so the arc has room to travel to where the topbar BrandMark
     will land. */
  left: 50%;
  bottom: 12%;
  width: 60vw;
  max-width: 320px;
  height: 38vh;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 4;
`;
