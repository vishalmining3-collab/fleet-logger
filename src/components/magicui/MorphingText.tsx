import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

/**
 * MorphingText — a premium magic-ui style text morph.
 *
 * Cycles through an array of `texts`, blending each word into the next with a
 * smooth opacity + rise + blur fade. Used for the FLEET LOGGER header brand and
 * the live voice-state labels (SPEECH LOGGER READY / LISTENING... / THINKING...).
 *
 * Matches the existing call signature: <MorphingText texts={[...]} className="..." />
 */
interface MorphingTextProps {
  texts: string[];
  className?: string;
  /** Seconds each word stays fully visible before morphing. */
  interval?: number;
}

export const MorphingText: React.FC<MorphingTextProps> = ({
  texts,
  className,
  interval = 2.4,
}) => {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  // Guard against empty input so we never render an empty header/label.
  const safeTexts = texts && texts.length > 0 ? texts : [''];

  useEffect(() => {
    if (safeTexts.length <= 1) return; // single word — no cycling needed

    let outTimer: ReturnType<typeof setTimeout>;
    let holdTimer: ReturnType<typeof setTimeout>;

    const cycle = () => {
      // 1. fade current word out
      setPhase('out');
      // 2. after the fade-out, advance index + fade the next word in
      outTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % safeTexts.length);
        setPhase('in');
      }, 480);
      // 3. hold the visible word, then schedule the next cycle
      holdTimer = setTimeout(cycle, interval * 1000);
    };

    // First cycle waits a full interval so the first word reads cleanly.
    const start = setTimeout(cycle, interval * 1000);

    return () => {
      clearTimeout(start);
      clearTimeout(outTimer);
      clearTimeout(holdTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTexts.length, interval]);

  return (
    <StyledMorphText
      className={className}
      data-phase={phase}
      key={index /* re-mount per word so the CSS enter animation replays */}
    >
      {safeTexts[index]}
    </StyledMorphText>
  );
};

/**
 * Scoped, self-contained styling. The enter/exit morph is driven by the
 * `data-phase` attribute so nothing leaks into the global stylesheet.
 */
const StyledMorphText = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  will-change: transform, opacity, filter;

  /* Enter — word rises up and de-blurs into focus */
  &[data-phase='in'] {
    animation: fl-morph-in 0.48s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  /* Exit — word drops slightly and blurs away */
  &[data-phase='out'] {
    animation: fl-morph-out 0.46s cubic-bezier(0.64, 0, 0.78, 0) both;
  }

  /* Hold — keep the word crisp and steady */
  &[data-phase='hold'] {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }

  @keyframes fl-morph-in {
    0% {
      opacity: 0;
      transform: translateY(55%);
      filter: blur(6px);
      letter-spacing: 0.4em;
    }
    100% {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
      letter-spacing: inherit;
    }
  }

  @keyframes fl-morph-out {
    0% {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-55%);
      filter: blur(6px);
    }
  }
`;
