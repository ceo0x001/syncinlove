import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/**
 * What jsdom does not give you, and this app assumes.
 *
 * Each of these exists because a component here reads it during render or in an
 * effect. Stubbing them in one place rather than per-file keeps the tests about the
 * component instead of about the environment.
 */

afterEach(cleanup)

/**
 * matchMedia.
 *
 * `OccasionBanner` subscribes to prefers-reduced-motion through useSyncExternalStore,
 * and the reveal reads it too. jsdom has no implementation at all, so without this
 * every component that respects the preference throws on mount.
 *
 * Defaults to "motion is fine", which is the majority case. A test that cares sets
 * `matchMediaMatches(true)` to become somebody who asked for less movement.
 */
let reduceMotion = false

export function matchMediaMatches(matches: boolean) {
  reduceMotion = matches
}

vi.stubGlobal(
  'matchMedia',
  (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
)

/**
 * A real localStorage.
 *
 * jsdom hands back a bare `{}` here — an object with no getItem, setItem or clear —
 * so anything touching storage throws rather than behaving like a browser. Left
 * unstubbed, the tests that matter most would pass for the wrong reason: the occasion
 * banner wraps its storage access in try/catch (Safari private mode throws), so a
 * broken Storage would look exactly like a first visit, every time, and the
 * seen-once-a-day rule would appear to work while never being exercised.
 *
 * Map-backed and installed here, so the tests own it and can reason about it.
 */
const store = new Map<string, string>()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  },
})

afterEach(() => {
  reduceMotion = false
  store.clear()
})

/**
 * requestAnimationFrame, run immediately.
 *
 * jsdom schedules it on a timer, and the occasion banner defers its burst by one frame
 * so the card paints first. Under test that deferral is a source of flake with nothing
 * to gain — the assertion is that the frame was requested and the pieces appear, not
 * when the compositor got to it.
 *
 * This is also the shape of the bug that started all of this. The confetti effect
 * returned before ever reaching requestAnimationFrame, and nothing observable said so:
 * the localStorage key was written, no error was thrown, and reduced motion was off.
 * Running the frame synchronously is what lets a test assert "it actually got there".
 */
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(0)
  return 0
})
vi.stubGlobal('cancelAnimationFrame', () => {})

/**
 * navigator.vibrate.
 *
 * `haptic()` is called on reveal and on tapping the occasion card. Absent in jsdom, and
 * the helper is deliberately not defensive about it — it is not worth branching in
 * production code for a case only tests hit.
 */
Object.defineProperty(window.navigator, 'vibrate', {
  value: () => true,
  writable: true,
  configurable: true,
})
