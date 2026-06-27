/**
 * brandCredit.ts — coordination channel for the splash credit → topbar BrandMark hand-off.
 *
 * Why a module-level singleton:
 *   The splash lives in `AestheticBootLoader` and the BrandMark lives on the home
 *   topbar. They render at different times and never simultaneously on screen
 *   (the splash unmounts before the home mounts). We need to hand off *one*
 *   signal — "the wire-transfer is starting; prepare to receive the V" — without
 *   prop-drilling or adding a context provider. A module-level state with a
 *   subscribe hook does it cleanly with zero global side-effects.
 *
 * Lifecycle of Phase 2 (wire arc → topbar landing):
 *   1. AestheticBootLoader flips `startArcHandoff()` at t=10s of the credit.
 *   2. The boot overlay keeps the arc visible (it's part of the boot overlay)
 *      while the sidecar transitions the user out.
 *   3. When the boot overlay unmounts (splash → home swap), the BrandMark on
 *      the topbar mounts immediately. It checks `consumeArcHandoff()` — if
 *      true, it renders in "arriving" mode (filament draws onto it) instead
 *      of the steady "settled" mode.
 *   4. After 1.2 s the BrandMark commits to the steady state.
 *
 * Why one-shot (consume):
 *   The arriving animation is meaningful only on the very first frame after
 *   splash→home. After it plays once, subsequent visits to the home screen
 *   should just show the steady mark — not replay the arc every time.
 */

type Listener = () => void;

let arcRequested = false;
const listeners: Set<Listener> = new Set();

function notify() {
  for (const l of listeners) l();
}

/**
 * Called by `AestheticBootLoader` at the moment the credit begins its
 * 10-second glitch playthrough. Listener-subscribed components can
 * pre-warm.
 */
export function beginCreditAnimation(): void {
  // Currently a no-op; reserved for future "splash is alive" telemetry.
  // Kept as a stable API so the boot loader doesn't have to change again.
}

/**
 * Called by `AestheticBootLoader` at the END of the 10-second credit
 * animation, before the splash unmounts. Signals that the arc transfer
 * should animate into the topbar BrandMark on next mount.
 */
export function startArcHandoff(): void {
  arcRequested = true;
  notify();
}

/**
 * Called by `BrandMark` on mount. Returns true exactly once if the arc
 * transfer should play; subsequent mounts return false. This is the
 * one-shot consumption.
 */
export function consumeArcHandoff(): boolean {
  if (!arcRequested) return false;
  arcRequested = false;
  return true;
}

/**
 * Subscribe to arc-request changes. Currently only one truthy transition
 * is ever issued, but this API keeps the option open for retries or
 * slower-cold-starts in the future.
 */
export function subscribeArcHandoff(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
