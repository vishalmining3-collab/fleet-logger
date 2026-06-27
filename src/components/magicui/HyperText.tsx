import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";

/**
 * HyperText — magic-ui style character scramble.
 *
 * The target word sits still while each character rapidly cycles through random
 * glyphs before "locking in" left-to-right. Unlike MorphingText (which swaps whole
 * words and visibly moves), HyperText keeps a fixed box: the text never shifts
 * position — only the glyphs scramble in place. Ideal for a stable wordmark.
 *
 * It re-scrambles whenever `text` changes (e.g. LOGGER -> SYSTEM).
 */
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&/(_)?@".split("");

interface HyperTextProps {
  text: string;
  className?: string;
  /** ms each character takes to resolve */
  duration?: number;
  /** scramble refresh rate in ms */
  speed?: number;
}

export const HyperText: React.FC<HyperTextProps> = ({
  text,
  className,
  duration = 600,
  speed = 35,
}) => {
  const [display, setDisplay] = useState(text);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const resolved = text.split("");
    let step = 0;
    const totalSteps = Math.max(Math.floor(duration / speed), resolved.length);

    // Clear any prior run
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      step += 1;
      setDisplay(
        resolved
          .map((ch, i) => {
            // Spaces stay spaces; resolved characters lock in left-to-right
            if (ch === " ") return " ";
            const lockAt = (i / resolved.length) * totalSteps;
            if (step >= lockAt) return ch;
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join("")
      );

      if (step >= totalSteps) {
        setDisplay(text);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, duration, speed]);

  return <StyledSpan className={className}>{display}</StyledSpan>;
};

/**
 * Scoped wrapper: monospaced tabular figures keep the box width stable while the
 * glyphs scramble, so the wordmark never visually jumps.
 */
const StyledSpan = styled.span`
  display: inline-flex;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  letter-spacing: inherit;
`;

/**
 * HyperTextCycle — cycles an array of words through HyperText.
 *
 * The wrapper holds a FIXED min-width (the widest word) so the surrounding
 * wordmark (e.g. "FLEET LOGGER") never visually shifts when the cycling word
 * changes length. Each word scrambles in place on a stable baseline.
 */
interface HyperTextCycleProps {
  words: string[];
  className?: string;
  /** seconds each word stays before re-scrambling to the next */
  interval?: number;
}

export const HyperTextCycle: React.FC<HyperTextCycleProps> = ({
  words,
  className,
  interval = 3,
}) => {
  const [idx, setIdx] = useState(0);
  const safeWords = words && words.length > 0 ? words : [""];

  useEffect(() => {
    if (safeWords.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % safeWords.length);
    }, interval * 1000);
    return () => clearInterval(t);
  }, [safeWords.length, interval]);

  // fixed width = widest word, so the box never jumps
  const widest = safeWords.reduce((m, w) => (w.length > m.length ? w : m), "");

  return (
    <span className={className} style={{ display: "inline-flex", minWidth: `${widest.length + 1}ch` }}>
      <HyperText text={safeWords[idx]} />
    </span>
  );
};

