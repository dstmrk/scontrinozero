/**
 * Haptic feedback utility.
 *
 * Uses the W3C Vibration API (navigator.vibrate) with PWM-inspired patterns:
 * each vibration is split into on/off micro-cycles to simulate variable intensity.
 * Works on Android Chrome and iOS Safari; graceful no-op elsewhere.
 *
 * Pattern format: [vibrate_ms, pause_ms, vibrate_ms, ...] passed to navigator.vibrate().
 */

export type HapticType = "light" | "success" | "error" | "warning";

const HAPTIC_PATTERNS: Record<HapticType, VibratePattern> = {
  // Single crisp tap — keypad digits
  light: [8],
  // Two pulses: medium then strong — successful receipt emission
  success: [15, 25, 60],
  // Four short bursts — AdE rejection or network error
  error: [14, 10, 14, 10, 14, 10, 14],
  // Three medium pulses — irreversible action (void receipt)
  warning: [15, 15, 15, 15, 15],
};

export function vibrate(type: HapticType): void {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  )
    return;
  navigator.vibrate(HAPTIC_PATTERNS[type]);
}
