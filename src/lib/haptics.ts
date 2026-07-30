/**
 * Haptics.
 *
 * Where it works, this is `navigator.vibrate` and nothing more — the Vibration
 * API is the only haptic surface the web has. What that means in practice:
 *
 *   Android Chrome/Firefox/Edge   real vibration
 *   Desktop                       API present, no motor, silently does nothing
 *   iOS Safari                    not implemented, at all, installed or not
 *
 * The iOS gap is worth being blunt about because it is the platform most of this
 * app's users are on. Apple has never shipped `navigator.vibrate`, and adding the
 * app to the home screen does not change it. There is a widely-copied trick using
 * a hidden `<input type="checkbox" switch>` to borrow the system toggle haptic;
 * it only fires on a genuine user tap of that element, cannot be driven from a
 * transition or a server response, and breaks whenever Apple adjusts it. Faking
 * support with something that works in a demo and not on a reveal is worse than
 * not having it, so on iOS every call here is a no-op.
 *
 * So this is progressive enhancement in the strict sense: nothing in the app may
 * depend on a buzz having happened.
 */

/**
 * The vocabulary, deliberately small.
 *
 * Named for what happened, not for how long it buzzes, so the durations can be
 * retuned in one place without hunting through components. Patterns are short —
 * a phone that rattles for a third of a second feels like a notification from
 * somebody else's app, not like an answer landing.
 */
const PATTERNS = {
  /** A choice registered. The lightest thing that is still felt. */
  tap: 10,
  /** Sent, and no longer changeable — an answer, a sealed letter. */
  commit: [14, 40, 22],
  /** Both answers are in. The only pattern anybody should recognise. */
  reveal: [24, 60, 24, 60, 44],
  /** Refused, failed, or blocked. Two blunt knocks, distinct from commit. */
  error: [30, 50, 30],
} as const

export type Haptic = keyof typeof PATTERNS

/** localStorage key. Read on every call rather than cached — settings are a different tab. */
const PREF_KEY = 'sync.haptics'

/**
 * Is there any point offering the setting?
 *
 * Answers "would a buzz be possible here", which is why Settings can hide the
 * toggle on a laptop instead of offering a switch that controls nothing. Desktop
 * Chrome reports `vibrate` and has no motor, so this is a best effort — the
 * platform gives us no way to ask whether hardware exists.
 */
export function hapticsAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** On unless switched off. Somebody who never opens Settings still gets it. */
export function hapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    // Safari in private mode throws on localStorage. Default to on.
    return true
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // Nothing to do. The preference simply will not persist.
  }
}

/**
 * Buzz, if buzzing is possible and wanted.
 *
 * Never throws and never reports failure. A caller that had to handle "the
 * vibration didn't work" would end up with error handling around a decoration,
 * and every call site is in a click handler where a thrown exception costs the
 * actual interaction.
 */
export function haptic(kind: Haptic): void {
  if (!hapticsAvailable() || !hapticsEnabled()) return
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[])
  } catch {
    // Some browsers throw when the document is not focused or is hidden.
  }
}
