import React, { useState, useEffect, useRef } from "react";

/**
 * BlurFade — magic-ui style blur-to-clear entrance.
 *
 * Children start heavily blurred and scaled down with low opacity, then resolve to
 * crisp/full-opacity over ~0.5s with a small stagger. Used to wrap tab panels so
 * switching Voice -> History -> Reports feels like content materialising in rather
 * than hard-cutting. Pure CSS, no deps.
 */
interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  /** delay in seconds before the fade begins (stagger) */
  delay?: number;
  /** re-trigger when this value changes (e.g. activeTab key) */
  inView?: boolean;
}

export const BlurFade: React.FC<BlurFadeProps> = ({
  children,
  className = "",
  delay = 0,
  inView = true,
}) => {
  const [shown, setShown] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    setShown(false);
    const t = setTimeout(() => {
      if (mountedRef.current) setShown(true);
    }, delay * 1000);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
  }, [inView, delay]);

  return (
    <div
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        filter: shown ? "blur(0px)" : "blur(12px)",
        transform: shown ? "translateY(0) scale(1)" : "translateY(8px) scale(0.98)",
        transition:
          "opacity 0.5s cubic-bezier(0.22,1,0.36,1), filter 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.5s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {children}
    </div>
  );
};
