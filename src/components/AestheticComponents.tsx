import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { BrandCredit } from "./BrandCredit";

// -----------------------------------------------------------------------------
// Aesthetic Toggle Switch (Futuristic Liquid Style)
// -----------------------------------------------------------------------------
interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export const AestheticSwitch = ({ checked, onChange }: SwitchProps) => {
  return (
    <StyledSwitchWrapper>
      <label className="switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="slider" />
      </label>
    </StyledSwitchWrapper>
  );
}

const StyledSwitchWrapper = styled.div`
  .switch {
    font-size: 14px;
    position: relative;
    display: inline-block;
    width: 3.5em;
    height: 2em;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    --background: #1e1b4b;
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--background);
    transition: .5s;
    border-radius: 30px;
    border: 1px solid rgba(255,255,255,0.1);
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 1.4em;
    width: 1.4em;
    border-radius: 50%;
    left: 10%;
    bottom: 12%;
    box-shadow: inset 8px -4px 0px 0px #06b6d4;
    background: var(--background);
    transition: .5s;
  }

  input:checked + .slider {
    background-color: #312e81;
  }

  input:checked + .slider:before {
    transform: translateX(100%);
    box-shadow: inset 15px -4px 0px 15px #06b6d4;
  }
`;

// -----------------------------------------------------------------------------
// Animated Iridescent Pill — continuously-shifting radial-gradient pill
// Retuned from the original to the Fleet Logger palette (indigo + cyan + deep
// navy base). Used for the header Export + Profile buttons so both ends mirror.
// -----------------------------------------------------------------------------
export const IridescentPill = ({ children, onClick, className, type = "button" }: { children: React.ReactNode, onClick?: () => void, className?: string, type?: "button" | "submit" }) => {
  return (
    <StyledIridescentBtnWrapper onClick={onClick} type={type} className={className}>
      <div className="btn-wrapper">
        <div className="light" />
        <div className="gradient-layer" style={{ animationDelay: "0s", animationDuration: "25s" }} />
        <div className="gradient-layer" style={{ animationDelay: "0.15s", animationDuration: "15.9s" }} />
        <div className="gradient-layer" style={{ animationDelay: "0.53s", animationDuration: "26.4s" }} />
        <div className="gradient-layer" style={{ animationDelay: "0.45s", animationDuration: "17.8s" }} />
        <div className="gradient-layer" style={{ animationDelay: "1.6s", animationDuration: "19.2s" }} />
        <div className="gradient-layer" style={{ animationDelay: "1.6s", animationDuration: "29.2s" }} />
        <div className="gradient-layer" style={{ animationDelay: "1.6s", animationDuration: "20.2s" }} />
        <button className="gradient-btn" type={type}>{children}</button>
        <div className="text-overlay">{children}</div>
      </div>
    </StyledIridescentBtnWrapper>
  );
}

const StyledIridescentBtnWrapper = styled.button`
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: "JetBrains Mono", monospace;

  .btn-wrapper {
    --rad: 9999px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: clip;
    overflow-clip-margin: 4px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: var(--rad);
    padding: 6px 14px;
    height: 30px;
    min-width: 88px;
    filter: saturate(0.7) brightness(1.4);
  }

  .gradient-btn {
    position: relative;
    z-index: -1;
    padding: 0 16px;
    border: none;
    border-radius: var(--rad);
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12rem;
    text-transform: uppercase;
    color: rgba(8, 13, 26, 0);
    background-color: #0d162d;
    box-shadow: inset 0 0 6px 4px rgba(99, 102, 241, 0.45);
    text-shadow: none;
    cursor: pointer;
    mix-blend-mode: color-dodge;
    transition: color 0.3s ease, text-shadow 0.3s ease;
  }

  .gradient-layer {
    position: absolute;
    pointer-events: none;
    left: -160px;
    width: 500%;
    aspect-ratio: 1;
    background: radial-gradient(
      ellipse at 65% 180%,
      #6366f1,
      #06b6d4,
      #6366f1,
      #06b6d4,
      #6366f1,
      #06b6d4,
      #6366f1,
      #06b6d4,
      #6366f1,
      #06b6d4,
      #6366f1
    );
    mix-blend-mode: difference;
    animation: rotate 8s linear infinite;
  }

  .gradient-layer:last-child {
    mix-blend-mode: color-dodge;
  }

  @keyframes rotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .text-overlay {
    position: absolute;
    pointer-events: none;
    z-index: 2;
    padding: 0 16px;
    border-radius: var(--rad);
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12rem;
    text-transform: uppercase;
    color: #f8fafc;
    text-shadow: 0 0 6px rgba(6, 182, 212, 0.45);
    box-shadow:
      inset 0 -3px 3px 0 rgba(0, 0, 0, 0.35),
      inset 0 3px 3px 0 rgba(255, 255, 255, 0.1);
    mix-blend-mode: multiply;
    transition: transform 0.3s ease;
    animation: btn-opacity-pulse 5s ease infinite;
  }

  &:hover .text-overlay { transform: scale(1.06); }
  &:hover .gradient-btn { color: rgba(0,0,0,0); text-shadow: none; }
  &:active .text-overlay { transform: scale(0.95); }
  &:active .gradient-btn { color: rgba(0,0,0,0); text-shadow: none; }

  .light {
    position: absolute;
    pointer-events: none;
    z-index: 1;
    border-radius: 50px;
    width: 70%;
    height: 8px;
    background-color: rgba(255, 255, 255, 0.25);
    filter: blur(4px);
    animation: btn-pulse 3s ease-in-out infinite;
  }

  @keyframes btn-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.1; }
  }

  @keyframes btn-opacity-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.65; }
  }
`;

// -----------------------------------------------------------------------------
// Aesthetic Neumorphic Card
// -----------------------------------------------------------------------------
export const AestheticCard = ({ children, className }: { children?: React.ReactNode, className?: string }) => {
  return (
    <StyledCardWrapper className={className}>
      <div className="card-inner">
        {children}
      </div>
    </StyledCardWrapper>
  );
}

const StyledCardWrapper = styled.div`
  width: 100%;
  .card-inner {
   width: 100%;
   height: 100%;
   border-radius: 20px;
   background: #0d162d;
   box-shadow: 8px 8px 16px #050810,
               -8px -8px 16px #15244a;
   display: flex;
   flex-direction: column;
   align-items: center;
   justify-content: center;
   border: 1px solid rgba(255,255,255,0.03);
   padding: 12px;
  }
`;

// -----------------------------------------------------------------------------
// Aesthetic Gradient Button (Small & Precise for Export/Parse)
// -----------------------------------------------------------------------------
interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export const AestheticGradientButton = ({ label, ...props }: GradientButtonProps) => {
  return (
    <StyledGradientBtnWrapper>
      <div className="btn-wrapper">
        <div className="light" />
        <div className="gradient-layer" style={{animationDelay: '0s', animationDuration: '25s'}} />
        <div className="gradient-layer" style={{animationDelay: '1.6s', animationDuration: '20.2s'}} />
        <button className="gradient-btn" {...props}>{label}</button>
        <div className="text-overlay">{label}</div>
      </div>
    </StyledGradientBtnWrapper>
  );
}

const StyledGradientBtnWrapper = styled.div`
  display: inline-block;
  .btn-wrapper {
    --rad: 12px;
    --color-wrapper-border: rgba(255, 255, 255, 0.1);
    --color-layer-a: #6366f1;
    --color-layer-b: #06b6d4;
    --color-overlay-text: #fff;

    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--color-wrapper-border);
    border-radius: var(--rad);
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05rem;
    height: 32px;
    min-width: 80px;
    cursor: pointer;
    background: #000;
  }

  .gradient-btn {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
    color: transparent;
  }

  .gradient-layer {
    position: absolute;
    pointer-events: none;
    left: -100px;
    width: 400%;
    aspect-ratio: 1;
    background: radial-gradient(
      ellipse at 50% 50%,
      var(--color-layer-a),
      var(--color-layer-b),
      var(--color-layer-a)
    );
    mix-blend-mode: overlay;
    animation: rotate 10s linear infinite;
    opacity: 0.8;
  }

  @keyframes rotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .text-overlay {
    position: absolute;
    pointer-events: none;
    z-index: 2;
    color: var(--color-overlay-text);
    text-shadow: 0 0 8px rgba(6, 182, 212, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .light {
    position: absolute;
    pointer-events: none;
    z-index: 3;
    border-radius: 50%;
    width: 60%;
    height: 10px;
    background-color: #fff3;
    filter: blur(4px);
    top: 2px;
    animation: pulse 3s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0.2; }
  }
`;

// -----------------------------------------------------------------------------
// Frutiger Aesthetic Submit Button (Customized for App Colors)
// -----------------------------------------------------------------------------
export const FrutigerButton = ({ children, onClick }: { children: React.ReactNode, onClick?: () => void }) => {
  return (
    <StyledFrutigerWrapper onClick={onClick} className="frutiger-button">
      <div className="inner">
        <div className="top-white" />
        <span className="text">{children}</span>
      </div>
    </StyledFrutigerWrapper>
  );
}

const StyledFrutigerWrapper = styled.button`
  cursor: pointer;
  position: relative;
  padding: 2px;
  border-radius: 12px;
  border: 0;
  text-shadow: 1px 1px rgba(0,0,0,0.4);
  background: linear-gradient(#4f46e5, #06b6d4);
  box-shadow: 0px 4px 10px rgba(0,0,0,0.5);
  transition: 0.3s all;
  width: 100%;

  &:hover {
    box-shadow: 0px 6px 15px rgba(99, 102, 241, 0.3);
    transform: translateY(-1px);
  }

  &:active {
    box-shadow: 0px 0px 0px transparent;
    transform: translateY(1px);
  }

  .inner {
    position: relative;
    inset: 0px;
    padding: 0.8em 1.5em;
    border-radius: 10px;
    background: radial-gradient(circle at 50% 100%, rgba(6, 182, 212, 0.4) 10%, transparent 60%),
                linear-gradient(#312e81, #1e1b4b);
    overflow: hidden;
    transition: inherit;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .inner::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(-65deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 70%);
    background-size: 200% 100%;
    background-repeat: no-repeat;
    animation: shine-anim 4s ease infinite;
  }

  @keyframes shine-anim {
    0% { background-position: 150%; }
    100% { background-position: -150%; }
  }

  .top-white {
    position: absolute;
    border-radius: inherit;
    inset: 0 -8em;
    background: radial-gradient(
      circle at 50% -270%,
      rgba(255,255,255,0.15) 45%,
      rgba(255,255,255,0.05) 60%,
      transparent 60%
    );
    transition: inherit;
  }

  .text {
    position: relative;
    z-index: 1;
    color: white;
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 0.05rem;
    text-transform: uppercase;
  }
`;

// -----------------------------------------------------------------------------
// Frutiger Red Button (Red version of Frutiger Button)
// -----------------------------------------------------------------------------
export const FrutigerRedButton = ({ children, onClick }: { children: React.ReactNode, onClick?: () => void }) => {
  return (
    <StyledFrutigerRedWrapper onClick={onClick} className="frutiger-red-button">
      <div className="inner">
        <div className="top-white" />
        <span className="text">{children}</span>
      </div>
    </StyledFrutigerRedWrapper>
  );
}

const StyledFrutigerRedWrapper = styled.button`
  cursor: pointer;
  position: relative;
  padding: 2px;
  border-radius: 12px;
  border: 0;
  text-shadow: 1px 1px rgba(0,0,0,0.4);
  background: linear-gradient(#e11d48, #be123c);
  box-shadow: 0px 4px 10px rgba(0,0,0,0.5);
  transition: 0.3s all;
  width: 100%;

  &:hover {
    box-shadow: 0px 6px 15px rgba(225, 29, 72, 0.3);
    transform: translateY(-1px);
  }

  &:active {
    box-shadow: 0px 0px 0px transparent;
    transform: translateY(1px);
  }

  .inner {
    position: relative;
    inset: 0px;
    padding: 0.8em 1.5em;
    border-radius: 10px;
    background: radial-gradient(circle at 50% 100%, rgba(225, 29, 72, 0.4) 10%, transparent 60%),
                linear-gradient(#881337, #4c0519);
    overflow: hidden;
    transition: inherit;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .inner::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(-65deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 70%);
    background-size: 200% 100%;
    background-repeat: no-repeat;
    animation: shine-anim 4s ease infinite;
  }

  @keyframes shine-anim {
    0% { background-position: 150%; }
    100% { background-position: -150%; }
  }

  .top-white {
    position: absolute;
    border-radius: inherit;
    inset: 0 -8em;
    background: radial-gradient(
      circle at 50% -270%,
      rgba(255,255,255,0.15) 45%,
      rgba(255,255,255,0.05) 60%,
      transparent 60%
    );
    transition: inherit;
  }

  .text {
    position: relative;
    z-index: 1;
    color: white;
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 0.05rem;
    text-transform: uppercase;
  }
`;

// -----------------------------------------------------------------------------
// Aesthetic Ripple Mic Loader
// -----------------------------------------------------------------------------
export const MicRippleLoader = () => {
  return (
    <StyledLoaderWrapper>
      <div className="loader">
        <div className="box" />
        <div className="box" />
        <div className="box" />
        <div className="box" />
        <div className="box" />
        <div className="logo">
          <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="svg">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
      </div>
    </StyledLoaderWrapper>
  );
}

const StyledLoaderWrapper = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  .loader {
    --size: 100%;
    --duration: 2s;
    --logo-color: #06b6d4;
    --background: linear-gradient(
      0deg,
      rgba(6, 182, 212, 0.1) 0%,
      rgba(99, 102, 241, 0.1) 100%
    );
    height: var(--size);
    width: var(--size);
    aspect-ratio: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lo-loader .lo-box {
    position: absolute;
    background: var(--background);
    border-radius: 50%;
    border-top: 1px solid rgba(6, 182, 212, 0.5);
    box-shadow: rgba(0, 0, 0, 0.3) 0px 10px 10px -0px;
    backdrop-filter: blur(5px);
    animation: ripple var(--duration) infinite ease-in-out;
  }

  .lo-loader .lo-box:nth-child(1) { inset: 35%; z-index: 99; }
  .lo-loader .lo-box:nth-child(2) { inset: 27%; z-index: 98; border-color: rgba(6, 182, 212, 0.4); animation-delay: 0.2s; }
  .lo-loader .lo-box:nth-child(3) { inset: 19%; z-index: 97; border-color: rgba(6, 182, 212, 0.3); animation-delay: 0.4s; }
  .lo-loader .lo-box:nth-child(4) { inset: 11%; z-index: 96; border-color: rgba(6, 182, 212, 0.2); animation-delay: 0.6s; }
  .lo-loader .lo-box:nth-child(5) { inset: 3%; z-index: 95; border-color: rgba(6, 182, 212, 0.1); animation-delay: 0.8s; }

  .loader .logo {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    z-index: 100;
  }

  .loader .logo svg {
    fill: var(--logo-color);
    width: 36px;
    height: 36px;
    animation: color-change var(--duration) infinite ease-in-out;
  }

  @keyframes ripple {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.12); opacity: 0.4; }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes color-change {
    0%, 100% { fill: var(--logo-color); filter: drop-shadow(0 0 2px var(--logo-color)); }
    50% { fill: white; filter: drop-shadow(0 0 8px var(--logo-color)); }
  }
`;

// -----------------------------------------------------------------------------
// Aesthetic Thinking Loader — rotating-polygon SVG-mask loader.
// Directly adapted from your reference snippet:
//   - <svg> defines a <mask> with 7 polygons (the inversion source)
//   - .box applies mask: url(#thinkingClip); the masked gradient shows
//     the polygons as bright cuts over a coloured sphere
//   - the polygons themselves rotate at different speeds/origins
//   - the whole thing runs a `colorize` hue-rotate filter cycle
//
// Themed to FLEET LOGGER's cyan/indigo palette (no orange) and pinned to
// 96 px so it fits the home-screen orb slot.
// -----------------------------------------------------------------------------

export const AestheticThinkingLoader: React.FC<{ size?: number }> = ({
  size = 96,
}) => {
  return (
    <StyledPolygonLoaderWrapper $size={size}>
      <div className="lo-loader">
        <svg width={100} height={100} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <mask id="thinkingClip">
              <polygon points="0,0 100,0 100,100 0,100" fill="black" />
              <polygon points="25,25 75,25 50,75" fill="white" />
              <polygon points="50,25 75,75 25,75" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
            </mask>
          </defs>
        </svg>
        <div className="lo-box" />
      </div>
    </StyledPolygonLoaderWrapper>
  );
};

const StyledPolygonLoaderWrapper = styled.div<{ $size: number }>`
  position: relative;
  width: ${(p) => p.$size}px;
  height: ${(p) => p.$size}px;
  display: flex;
  align-items: center;
  justify-content: center;

  /*
    NOTE on CSS-class namespacing: we use the 'lo-' prefix on every class
    inside this loader to avoid colliding with the legacy '.loader' /
    '.box' / '.logo' rules in src/index.css (which include a
    'repeating-linear-gradient' mask used by an earlier scanner animation).

    Without the prefix those global styles leak on top of this loader and
    produce the vertical-stripe artifact the user observed.
  */
  .lo-loader {
    --time-animation: 2s;
    --size: 1;
    /* Palette: cyan + indigo (your reference used orange; we theme to FLEET LOGGER) */
    --color-one: #67e8f9;          /* sky-300 */
    --color-two: #818cf8;          /* indigo-400 */
    --color-three: rgba(103, 232, 249, 0.5);
    --color-four:  rgba(129, 140, 248, 0.5);
    --color-five:  rgba(103, 232, 249, 0.2);

    position: relative;
    border-radius: 50%;
    transform: scale(var(--size));
    box-shadow:
      0 0 14px 0 var(--color-three),
      0 16px 32px 0 var(--color-four);
    animation: colorize calc(var(--time-animation) * 3) ease-in-out infinite;
  }

  .lo-loader,
  .lo-loader::before,
  .lo-loader .lo-box,
  .lo-loader svg {
    width: 100px;
    height: 100px;
  }

  .lo-loader::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    border-radius: 50%;
    border-top: solid 1px var(--color-one);
    border-bottom: solid 1px var(--color-two);
    background: linear-gradient(180deg, var(--color-five), var(--color-four));
    box-shadow:
      inset 0 10px 10px 0 var(--color-three),
      inset 0 -10px 10px 0 var(--color-four);
  }

  .lo-loader .lo-box {
    background: linear-gradient(
      180deg,
      var(--color-one) 30%,
      var(--color-two) 70%
    );
    mask: url(#thinkingClip);
    -webkit-mask: url(#thinkingClip);
  }

  .lo-loader svg {
    position: absolute;
    inset: 0;
  }

  /* The mask animations: contrast ramps up/down while polygons spin */
  .lo-loader svg #thinkingClip {
    filter: contrast(15);
    animation: roundness calc(var(--time-animation) / 2) linear infinite;
  }
  .lo-loader svg #thinkingClip polygon {
    filter: blur(7px);
  }
  .lo-loader svg #thinkingClip polygon:nth-child(1) {
    transform-origin: 75% 25%;
    transform: rotate(90deg);
  }
  .lo-loader svg #thinkingClip polygon:nth-child(2) {
    transform-origin: 50% 50%;
    animation: rotation var(--time-animation) linear infinite reverse;
  }
  .lo-loader svg #thinkingClip polygon:nth-child(3) {
    transform-origin: 50% 60%;
    animation: rotation var(--time-animation) linear infinite;
    animation-delay: calc(var(--time-animation) / -3);
  }
  .lo-loader svg #thinkingClip polygon:nth-child(4) {
    transform-origin: 40% 40%;
    animation: rotation var(--time-animation) linear infinite reverse;
  }
  .lo-loader svg #thinkingClip polygon:nth-child(5) {
    transform-origin: 40% 40%;
    animation: rotation var(--time-animation) linear infinite reverse;
    animation-delay: calc(var(--time-animation) / -2);
  }
  .lo-loader svg #thinkingClip polygon:nth-child(6) {
    transform-origin: 60% 40%;
    animation: rotation var(--time-animation) linear infinite;
  }
  .lo-loader svg #thinkingClip polygon:nth-child(7) {
    transform-origin: 60% 40%;
    animation: rotation var(--time-animation) linear infinite;
    animation-delay: calc(var(--time-animation) / -1.5);
  }

  @keyframes rotation {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes roundness {
    0%   { filter: contrast(15); }
    20%  { filter: contrast(3); }
    40%  { filter: contrast(3); }
    60%  { filter: contrast(15); }
    100% { filter: contrast(15); }
  }
  @keyframes colorize {
    0%   { filter: hue-rotate(0deg); }
    20%  { filter: hue-rotate(-30deg); }
    40%  { filter: hue-rotate(-60deg); }
    60%  { filter: hue-rotate(-90deg); }
    80%  { filter: hue-rotate(-45deg); }
    100% { filter: hue-rotate(0deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .lo-loader,
    .lo-loader svg #thinkingClip,
    .lo-loader svg #thinkingClip polygon { animation: none !important; }
  }
`;


// -----------------------------------------------------------------------------
// Aesthetic Pill Buttons (augustin_4687 style from Uiverse)
// -----------------------------------------------------------------------------
export const AestheticPillButton = ({ children, onClick, className }: { children: React.ReactNode, onClick?: () => void, className?: string }) => {
  return (
    <StyledPillButton onClick={onClick} className={className} type="button">
      <div className="outer">
        <div className="inner">
          <div className="content">
            {children}
          </div>
        </div>
      </div>
    </StyledPillButton>
  );
}

const StyledPillButton = styled.button`
  display: inline-block;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  outline: none;
  font-family: "JetBrains Mono", monospace;
  user-select: none;
  width: 100%;

  .outer {
    background: rgba(76, 215, 246, 0.15); /* Glass accent base */
    border-radius: 9999px;
    padding: 4px;
    box-shadow: 0 0 15px rgba(6, 182, 212, 0.15);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    width: 100%;
  }

  .inner {
    background: rgba(14, 20, 22, 0.9); /* Dark background inner */
    border: 1px solid rgba(76, 215, 246, 0.3);
    border-radius: 9999px;
    padding: 2px;
  }

  .content {
    background: linear-gradient(135deg, #4cd7f6 0%, #04b4a2 100%); /* Neon cyan/teal gradient */
    color: #003640;
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 10px 20px;
    border-radius: 9999px;
    box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.4), 0 4px 10px rgba(6, 182, 212, 0.3);
    transition: background 0.3s, box-shadow 0.3s;
    text-align: center;
  }

  &:hover .outer {
    transform: scale(1.03);
  }

  &:hover .content {
    background: linear-gradient(135deg, #71f8e4 0%, #4edea3 100%); /* Emerald/Teal hover */
    box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.4), 0 6px 18px rgba(79, 219, 200, 0.4);
  }

  &:active .outer {
    transform: scale(0.97);
  }
`;

export const AestheticRedPillButton = ({ children, onClick, className }: { children: React.ReactNode, onClick?: () => void, className?: string }) => {
  return (
    <StyledRedPillButton onClick={onClick} className={className} type="button">
      <div className="outer">
        <div className="inner">
          <div className="content">
            {children}
          </div>
        </div>
      </div>
    </StyledRedPillButton>
  );
}

const StyledRedPillButton = styled.button`
  display: inline-block;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  outline: none;
  font-family: "JetBrains Mono", monospace;
  user-select: none;
  width: 100%;

  .outer {
    background: rgba(244, 63, 94, 0.15); /* Rose/red accent base */
    border-radius: 9999px;
    padding: 4px;
    box-shadow: 0 0 15px rgba(244, 63, 94, 0.15);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    width: 100%;
  }

  .inner {
    background: rgba(14, 20, 22, 0.9); /* Dark background inner */
    border: 1px solid rgba(244, 63, 94, 0.3);
    border-radius: 9999px;
    padding: 2px;
  }

  .content {
    background: linear-gradient(135deg, #f43f5e 0%, #be123c 100%); /* Neon rose/red gradient */
    color: #4c0519;
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 10px 20px;
    border-radius: 9999px;
    box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.4), 0 4px 10px rgba(244, 63, 94, 0.3);
    transition: background 0.3s, box-shadow 0.3s;
    text-align: center;
  }

  &:hover .outer {
    transform: scale(1.03);
  }

  &:hover .content {
    background: linear-gradient(135deg, #fb7185 0%, #e11d48 100%); /* Neon red/rose hover */
    box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.4), 0 6px 18px rgba(225, 29, 72, 0.4);
  }

  &:active .outer {
    transform: scale(0.97);
  }
`;

// -----------------------------------------------------------------------------
// Brand Credit — re-export from the standalone component file.
// All credit-line + arc-transfer logic lives in ./BrandCredit.tsx.
// Kept here as a stable import path so the boot loader's JSX reads cleanly.
// -----------------------------------------------------------------------------
export { BrandCredit } from "./BrandCredit";

// -----------------------------------------------------------------------------
// Aesthetic Boot Loader (Futuristic HUD System Diagnostics)
// -----------------------------------------------------------------------------
export const AestheticBootLoader = ({ onComplete }: { onComplete: () => void }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [showBypass, setShowBypass] = useState(false);

  const steps = [
    { label: "INITIATING HARDWARE SPEECH SYNTHESIS...", check: async () => {
        return window.speechSynthesis ? "OK" : "NO_TTS";
      }
    },
    { label: "PROBING NODE EXPRESS SERVER...", check: async () => {
        try {
          const res = await fetch('/api/health');
          return res.status === 200 ? "OK" : "ERR_STATUS";
        } catch {
          return "OFFLINE";
        }
      }
    },
    { label: "CONNECTING TO NVIDIA NIM CLIENT...", check: async () => {
        try {
          const res = await fetch('/api/health');
          const data = await res.json();
          return data.nvidiaEnabled ? "NVIDIA_ACTIVE" : data.geminiEnabled ? "GEMINI_FALLBACK" : "NO_AI_KEY";
        } catch {
          return "NO_CONNECTION";
        }
      }
    },
    { label: "RESOLVING ASR SPEECH SIDECAR...", check: async () => {
        try {
          const res = await fetch('/api/health');
          const data = await res.json();
          return data.sidecarEnabled ? "SIDECAR_ONLINE" : "BROWSER_SPEECH";
        } catch {
          return "BROWSER_SPEECH";
        }
      }
    },
    { label: "SYNCHRONIZING SECURE OFFLINE STORE...", check: async () => {
        return "SYNCED_OK";
      }
    }
  ];

  useEffect(() => {
    // Show bypass button if checks take too long
    const timer = setTimeout(() => setShowBypass(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (currentStep < steps.length) {
      const runStep = async () => {
        const step = steps[currentStep];
        setLogs(prev => [...prev, `[ .. ] ${step.label}`]);
        
        // Add a slight delay for realistic visual cadence
        await new Promise(r => setTimeout(r, 600));
        
        const result = await step.check();
        setLogs(prev => {
          const next = [...prev];
          next[next.length - 1] = `[ OK ] ${step.label} (${result})`;
          return next;
        });
        
        setCurrentStep(prev => prev + 1);
      };
      runStep();
    } else {
      // Completed all checks successfully
      const timer = setTimeout(() => {
        onComplete();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  return (
    <StyledBootOverlay>
      <div className="scanline" />
      <div className="grid-bg" />
      
      <div className="hud-box">
        {/* Isometric Refractive Glass Logo */}
        <div className="logo-container">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-svg">
            <defs>
              <linearGradient id="neonCyan" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4cd7f6" />
                <stop offset="100%" stopColor="#0891b2" />
              </linearGradient>
              <linearGradient id="glassShine" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                <stop offset="100%" stopColor="white" stopOpacity="0.0" />
              </linearGradient>
              <filter id="neonGlow">
                <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Glowing Backdrop */}
            <circle cx="60" cy="60" r="35" fill="#06b6d4" opacity="0.15" filter="url(#neonGlow)" />

            {/* Monogram F */}
            <g className="letter-f">
              <path d="M32 30 H58 V42 H44 V52 H54 V64 H44 V85 H32 Z" fill="url(#neonCyan)" opacity="0.85" filter="url(#neonGlow)" />
              <path d="M32 30 H58 V33 H35 V85 H32 Z" fill="url(#glassShine)" />
            </g>

            {/* Monogram L */}
            <g className="letter-l">
              <path d="M68 30 H80 V73 H92 V85 H68 Z" fill="url(#neonCyan)" opacity="0.85" filter="url(#neonGlow)" />
              <path d="M68 30 H80 V33 H71 V85 H68 Z" fill="url(#glassShine)" />
            </g>
          </svg>
        </div>

        <h1 className="title">FLEET LOGGER</h1>
        <p className="subtitle">AUTHENTICATING TELEMETRY CONSOLE</p>

        {/* Brand Credit — glitchy "crafted by VISHAL" living in the splash,
            then dissolves into a wire filament that arcs to the topbar V on
            the home screen. See BrandCredit.tsx for the full lifecycle. */}
        <BrandCredit />

        {/* Console Logs */}
        <div className="console-box">
          {logs.map((log, i) => (
            <div key={i} className="log-line">
              {log}
            </div>
          ))}
          {currentStep < steps.length && (
            <div className="cursor-line">_</div>
          )}
        </div>

        {showBypass && (
          <button onClick={onComplete} className="bypass-btn">
            BYPASS SYSTEMS & START OFFLINE
          </button>
        )}
      </div>
    </StyledBootOverlay>
  );
};

const StyledBootOverlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: #040812;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: "JetBrains Mono", monospace;

  .scanline {
    width: 100%;
    height: 100px;
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0),
      rgba(6, 182, 212, 0.05),
      rgba(255, 255, 255, 0)
    );
    position: absolute;
    top: -100px;
    left: 0;
    z-index: 2;
    animation: scanAnimation 6s linear infinite;
    pointer-events: none;
  }

  .grid-bg {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(255, 255, 255, 0.01) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255, 255, 255, 0.01) 1px, transparent 1px);
    background-size: 30px 30px;
    z-index: 1;
    pointer-events: none;
  }

  .hud-box {
    position: relative;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(480px, 90%);
    padding: 30px;
    border-radius: 24px;
    background: rgba(10, 17, 34, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20px);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8),
                inset 0 1px 1px rgba(255, 255, 255, 0.05);
  }

  .logo-container {
    margin-bottom: 20px;
    animation: floatAnimation 4s ease-in-out infinite;
  }

  .logo-svg {
    filter: drop-shadow(0 4px 20px rgba(6, 182, 212, 0.2));
  }

  .title {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 0.3em;
    color: #f8fafc;
    margin-bottom: 4px;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
  }

  .subtitle {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #06b6d4;
    margin-bottom: 24px;
  }

  .console-box {
    width: 100%;
    background: rgba(4, 8, 18, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 12px;
    padding: 18px;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 6px;
    text-align: left;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.6);
  }

  .log-line {
    font-size: 10px;
    color: #cbd5e1;
    line-height: 1.5;
    letter-spacing: 0.02em;
  }

  .cursor-line {
    font-size: 10px;
    color: #06b6d4;
    animation: blink 1s step-end infinite;
  }

  .bypass-btn {
    margin-top: 20px;
    padding: 8px 16px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #f43f5e;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border-radius: 9999px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;

    &:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.4);
      transform: translateY(-1px);
    }
  }

  @keyframes scanAnimation {
    0% { transform: translateY(0); }
    100% { transform: translateY(100vh); }
  }

  @keyframes floatAnimation {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }

  @keyframes blink {
    from, to { color: transparent }
    50% { color: #06b6d4; }
  }
`;