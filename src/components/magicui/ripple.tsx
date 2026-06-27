import React from 'react';
import styled, { keyframes } from 'styled-components';

/**
 * Ripple — listening-state animation, **literally** the "Loader" pattern
 * from your reference video:
 *
 *   - 5 nested round `.box` rings (`inset: 40/30/20/10/0 %` from parent)
 *     each rippling in a staggered breath (`scale 1 → 1.3 → 1`, 2s,
 *     ease-in-out, infinite, delays 0/0.2/0.4/0.6/0.8s).
 *   - The first box holds a centred `.logo` container with the mic glyph
 *     inside (centered via `display: grid; place-content: center; padding: 30%`).
 *   - The `Mic` glyph itself runs the `color-change` cycle on the parent
 *     `.logo`, shifting glow filter from cyan to bright white and back.
 *
 * Sits inside the voice orb container — fills the listening orb footprint.
 */
interface RippleProps {
  children?: React.ReactNode;
  className?: string;
}

export const Ripple: React.FC<RippleProps> = ({ children, className }) => {
  return (
    <StyledRippleRoot className={className}>
      <div className="lo-ripple">
        <div className="lo-box">
          {/* centred mic — children prop holds the Lucide Mic glyph */}
          <div className="lo-logo">{children}</div>
        </div>
        <div className="lo-box" />
        <div className="lo-box" />
        <div className="lo-box" />
        <div className="lo-box" />
      </div>
    </StyledRippleRoot>
  );
};

// ─── animations (verbatim style/timing from the reference Loader) ───────

const ripple = keyframes`
  0% {
    transform: scale(1);
    box-shadow: rgba(0, 0, 0, 0.3) 0px 10px 10px -0px;
  }
  50% {
    transform: scale(1.3);
    box-shadow: rgba(0, 0, 0, 0.3) 0px 30px 20px -0px;
  }
  100% {
    transform: scale(1);
    box-shadow: rgba(0, 0, 0, 0.3) 0px 10px 10px -0px;
  }
`;

const colorChange = keyframes`
  0%, 100% {
    filter: drop-shadow(0 0 4px rgba(165, 243, 252, 0.55))
            drop-shadow(0 0 12px rgba(34, 211, 238, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.95))
            drop-shadow(0 0 18px rgba(34, 211, 238, 0.7));
  }
`;

// ─── styled piece ────────────────────────────────────────────────────────

const StyledRippleRoot = styled.div<{ $mode?: "arriving" | "settled" }>`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;

  /* All Ripple classes are namespaced with 'lo-' so they cannot collide with
     the global '.loader' / '.box' rules in src/index.css (which used a
     repeating-linear-gradient mask for the legacy scanner thinking animation). */

  .lo-ripple {
    --duration: 2s;
    /* Cyan / indigo glassmorphic tinted onto the reference's grey. */
    --logo-color: rgba(165, 243, 252, 1);
    --background: linear-gradient(
      0deg,
      rgba(6, 182, 212, 0.10) 0%,
      rgba(99, 102, 241, 0.10) 100%
    );
    height: 100%;
    width: 100%;
    aspect-ratio: 1;
    position: relative;
  }

  .lo-box {
    position: absolute;
    background: var(--background);
    border-radius: 50%;
    border-top: 1px solid rgba(165, 243, 252, 0.45);
    box-shadow:
      rgba(0, 0, 0, 0.25) 0px 6px 6px -0px,
      0 0 8px rgba(34, 211, 238, 0.14);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    animation: ${ripple} var(--duration) infinite ease-in-out;
  }
  .lo-box:nth-child(1) { inset: 40%; z-index: 99; border-top-color: rgba(165, 243, 252, 0.55); }
  .lo-box:nth-child(2) { inset: 30%; z-index: 98; border-top-color: rgba(165, 243, 252, 0.42); animation-delay: 0.2s; }
  .lo-box:nth-child(3) { inset: 20%; z-index: 97; border-top-color: rgba(165, 243, 252, 0.32); animation-delay: 0.4s; }
  .lo-box:nth-child(4) { inset: 10%; z-index: 96; border-top-color: rgba(165, 243, 252, 0.22); animation-delay: 0.6s; }
  .lo-box:nth-child(5) { inset: 0%;  z-index: 95; border-top-color: rgba(165, 243, 252, 0.14); animation-delay: 0.8s; }

  .lo-logo {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    padding: 30%;
    z-index: 100;
    pointer-events: none;

    /* Whatever sits inside (e.g. <Mic />) — let it pulse on the color-change cycle */
    & > svg,
    & > * {
      color: rgba(165, 243, 252, 1);
      width: 100%;
      animation: ${colorChange} var(--duration) infinite ease-in-out;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lo-box { animation: none; }
    .lo-logo > * { animation: none; }
  }
`;
