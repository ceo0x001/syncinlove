'use client'

import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { deletePushSubscription, savePushSubscription } from '@/app/actions'
import { haptic, hapticsAvailable, hapticsEnabled, setHapticsEnabled } from '@/lib/haptics'
import { Button, Notice } from './ui'

/**
 * This device.
 *
 * Everything on this card is per-browser rather than per-account, which is why it
 * lives apart from the email preferences: turning push on here does not turn it on
 * for the laptop, and it cannot, because a push subscription belongs to a browser
 * install. Saying "this device" is not a hedge — it is the accurate scope.
 *
 * All three sections render only what the platform can actually do. An iPhone that
 * has not been installed to the home screen is shown how to install it, because on
 * iOS that is a hard prerequisite for notifications rather than a nicety. A laptop
 * with no vibration motor is not offered a haptics switch. An offer that does
 * nothing when accepted is worse than an absence.
 */

/**
 * The VAPID public key, base64url as the server states it, into the raw bytes
 * `pushManager.subscribe` wants.
 *
 * Annotated `Uint8Array<ArrayBuffer>` and built over an explicit buffer rather
 * than `new Uint8Array(length)`. The bare constructor now infers
 * `Uint8Array<ArrayBufferLike>`, which includes SharedArrayBuffer and so is not
 * assignable to BufferSource — the error is about a shared-memory case that cannot
 * arise here, but it is a compile error all the same.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

type Platform = {
  isIOS: boolean
  isStandalone: boolean
  /** Service worker + PushManager both present. Necessary, not sufficient, on iOS. */
  canPush: boolean
  canVibrate: boolean
}

/**
 * Read once, then handed out by reference.
 *
 * useSyncExternalStore compares snapshots with ===, so a function that builds a
 * fresh object per call would re-render forever. None of these values can change
 * without a page load — a phone does not grow a vibration motor mid-session — so
 * caching is accurate as well as necessary.
 *
 * The one case that looks like an exception is installing to the home screen,
 * which does change isStandalone. It also opens a brand new window, so the cache
 * is discarded with the tab.
 */
let cachedPlatform: Platform | null = null

function getPlatform(): Platform {
  if (!cachedPlatform) cachedPlatform = readPlatform()
  return cachedPlatform
}

/** Nothing to subscribe to. Required by the hook's signature. */
function noopSubscribe(): () => void {
  return () => {}
}

function readPlatform(): Platform {
  const ua = navigator.userAgent
  return {
    // iPadOS reports itself as a Mac, hence the touch check. Getting this wrong
    // means showing an iPad the wrong install instructions, which is the whole
    // value of this card on that platform.
    isIOS:
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document),
    isStandalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      // The non-standard iOS property, which is still the only reliable signal in
      // older installed Safari web apps.
      (window.navigator as { standalone?: boolean }).standalone === true,
    canPush: 'serviceWorker' in navigator && 'PushManager' in window,
    canVibrate: hapticsAvailable(),
  }
}

export function DeviceForm({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  /**
   * Browser-only, and null until the client has it.
   *
   * useSyncExternalStore rather than an effect that calls setState: it exists for
   * exactly this — state that lives outside React and has no server value — and
   * the server snapshot of null is what makes the placeholder below render
   * identically on both sides instead of a hydration mismatch.
   */
  const platform = useSyncExternalStore(noopSubscribe, getPlatform, () => null)

  if (!platform) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
        <p className="t-label">This device</p>
        <p className="t-small text-ink-faint">Checking what this device can do…</p>
      </div>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
      <div>
        <p className="t-label mb-1 block">This device</p>
        <p className="t-small text-ink-muted">
          These settings belong to this browser, not to your account. A phone and a
          laptop are set separately.
        </p>
      </div>

      <InstallSection platform={platform} />
      <PushSection platform={platform} vapidPublicKey={vapidPublicKey} />
      <HapticsSection platform={platform} />
    </div>
  )
}

/**
 * Installing.
 *
 * Android and desktop Chrome surface their own install affordance, so there they
 * get a nudge and nothing more — a fake button that cannot call the real prompt
 * would be worse than a sentence pointing at the real one. `beforeinstallprompt`
 * could drive a genuine button, but it does not exist on Safari at all, and one
 * platform having a button while the platform that needs it most has prose is a
 * confusing thing to ship.
 *
 * iOS gets the actual steps, because iOS has no prompt of any kind and nobody
 * finds Add to Home Screen by accident.
 */
function InstallSection({ platform }: { platform: Platform }) {
  if (platform.isStandalone) {
    return (
      <div className="rounded-[0.625rem] border border-hairline bg-paper-raised px-4 py-3">
        <p className="t-body text-ink">Installed</p>
        <p className="t-small text-ink-muted">
          You&rsquo;re running Sync from your home screen.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[0.625rem] border border-hairline bg-paper-raised px-4 py-3">
      <p className="t-body text-ink">Add Sync to your home screen</p>
      {platform.isIOS ? (
        <>
          <p className="t-small mt-1 text-ink-muted">
            Tap Share at the bottom of Safari, then <em>Add to Home Screen</em>.
          </p>
          <p className="t-small mt-2 text-ink-faint">
            On iPhone and iPad this is also what unlocks notifications — Apple only
            allows them once the app is on your home screen.
          </p>
        </>
      ) : (
        <p className="t-small mt-1 text-ink-muted">
          Your browser&rsquo;s menu has an <em>Install</em> or <em>Add to Home
          screen</em> option. It opens without the address bar and remembers you.
        </p>
      )}
    </div>
  )
}

/**
 * Push.
 *
 * The honest cases, all of which happen:
 *
 *   no VAPID key configured   the server cannot sign, so nothing is offered
 *   iOS, not installed        blocked by Apple until it is on the home screen
 *   permission denied         we cannot re-ask; only the OS can undo this
 *   subscribed                one row exists for this browser
 */
function PushSection({
  platform,
  vapidPublicKey,
}: {
  platform: Platform
  vapidPublicKey: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Gates the button so it cannot be pressed before we know whether this browser
   * is already subscribed — pressing it early would subscribe a second time.
   *
   * Starts true where there is nothing to look up. Derived in the initialiser
   * rather than corrected by the effect below: `setReady(true)` in an effect body
   * is a render-then-immediately-render-again, and here it is avoidable.
   */
  const [ready, setReady] = useState(() => !platform.canPush)

  /**
   * The OS-level permission, read straight from the browser.
   *
   * A lazy initialiser rather than an effect. This component only renders on the
   * client — its parent withholds it until the platform snapshot exists — so
   * Notification.permission is available on the very first render, and there is
   * nothing for an effect to correct.
   */
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    platform.canPush ? Notification.permission : 'default',
  )

  useEffect(() => {
    if (!platform.canPush) return

    let cancelled = false

    ;(async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          // Always fetch the worker itself. A cached service worker is how a fixed
          // bug fails to reach anybody for 24 hours.
          updateViaCache: 'none',
        })
        const existing = await registration.pushManager.getSubscription()
        if (!cancelled) setEndpoint(existing?.endpoint ?? null)
      } catch (caught) {
        if (!cancelled) setError((caught as Error).message)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [platform.canPush])

  if (!vapidPublicKey) {
    return (
      <Row title="Notifications">
        Not switched on yet. Emails still arrive exactly as before.
      </Row>
    )
  }

  if (!platform.canPush) {
    return (
      <Row title="Notifications">
        This browser doesn&rsquo;t support them. You&rsquo;ll still get the emails.
      </Row>
    )
  }

  // The one platform rule worth spelling out rather than failing quietly on.
  if (platform.isIOS && !platform.isStandalone) {
    return (
      <Row title="Notifications">
        Add Sync to your home screen first — on iPhone and iPad, Apple only allows
        notifications for installed apps.
      </Row>
    )
  }

  if (permission === 'denied') {
    return (
      <Row title="Notifications">
        Blocked for this site. Your browser&rsquo;s settings for syncin.love can
        turn it back on — we can&rsquo;t ask again from here.
      </Row>
    )
  }

  async function subscribe() {
    setError(null)
    try {
      const granted = await Notification.requestPermission()
      setPermission(granted)
      if (granted !== 'granted') return

      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        // Required by every browser: a push may not be silent. We show one every
        // time, so this costs us nothing.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
      })

      const json = sub.toJSON()
      const p256dh = json.keys?.p256dh
      const auth = json.keys?.auth
      if (!p256dh || !auth) throw new Error('This browser returned an incomplete subscription.')

      const result = await savePushSubscription(sub.endpoint, p256dh, auth)
      if (result?.error) {
        // Do not leave a live browser subscription pointing at a row we failed to
        // store: the push service would accept sends nobody could ever trigger.
        await sub.unsubscribe()
        setError(result.error)
        return
      }

      setEndpoint(sub.endpoint)
      haptic('commit')
    } catch (caught) {
      setError((caught as Error).message)
      haptic('error')
    }
  }

  async function unsubscribe() {
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        await deletePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setEndpoint(null)
      haptic('tap')
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
      <div className="rounded-[0.625rem] border border-hairline bg-paper-raised px-4 py-3">
        <p className="t-body text-ink">
          {endpoint ? 'Notifications are on for this device' : 'Notifications'}
        </p>
        <p className="t-small mt-1 text-ink-muted">
          {endpoint
            ? 'The same things the emails cover, sooner. Never what either of you wrote.'
            : 'Get told when they’ve answered, when a letter opens, and when the day’s closing — without checking.'}
        </p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button
        variant="quiet"
        disabled={pending || !ready}
        onClick={() =>
          startTransition(async () => {
            if (endpoint) await unsubscribe()
            else await subscribe()
          })
        }
      >
        {!ready
          ? 'Checking…'
          : pending
            ? 'One moment…'
            : endpoint
              ? 'Turn off on this device'
              : 'Turn on notifications'}
      </Button>
    </div>
  )
}

/**
 * Haptics.
 *
 * Hidden entirely where there is no motor, which in practice means hidden on
 * iPhone: Apple has never implemented navigator.vibrate, and installing to the
 * home screen does not change that. Showing an iPhone a switch that does nothing
 * would be the clearest possible way to look broken.
 *
 * The test buzz is the whole point of the control. "Does this phone do it and do I
 * like it" is not answerable from a label.
 */
function HapticsSection({ platform }: { platform: Platform }) {
  /**
   * localStorage is the source of truth, and it is genuinely external: the same
   * setting changed in another tab should be reflected here. Subscribing to
   * `storage` gets that for free, which an effect-plus-setState would not.
   */
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('storage', onChange)
    return () => window.removeEventListener('storage', onChange)
  }, [])

  const on = useSyncExternalStore(subscribe, hapticsEnabled, () => true)
  // Reading localStorage returns a fresh answer each call, so a local write has to
  // be announced for the snapshot to be re-read.
  const announce = () => window.dispatchEvent(new StorageEvent('storage'))

  if (!platform.canVibrate) {
    return platform.isIOS ? (
      <Row title="Vibration">
        iPhone and iPad don&rsquo;t let websites vibrate, even installed ones.
        Nothing we can do from here.
      </Row>
    ) : null
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
      <label className="press flex min-h-[3rem] cursor-pointer items-start gap-3 rounded-[0.625rem] border border-hairline bg-paper-raised px-4 py-3">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => {
            const next = event.target.checked
            setHapticsEnabled(next)
            announce()
            // Buzz on the way on, not on the way off. Confirming "off" with the
            // thing being turned off is a joke the second time and a bug the first.
            if (next) haptic('commit')
          }}
          className="mt-0.5 size-[1.125rem] shrink-0 accent-[var(--accent)]"
        />
        <span>
          <span className="t-body block text-ink">Vibrate on this device</span>
          <span className="t-small text-ink-muted">
            A short buzz when an answer sends and when a reveal lands.
          </span>
        </span>
      </label>

      {on ? (
        <button
          type="button"
          onClick={() => haptic('reveal')}
          className="t-small self-start text-ink-faint underline decoration-hairline underline-offset-4 hover:text-ink-muted"
        >
          Feel the reveal
        </button>
      ) : null}
    </div>
  )
}

/** A stated limitation. Same box as a control, so it reads as an answer not an error. */
function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[0.625rem] border border-hairline bg-paper-raised px-4 py-3">
      <p className="t-body text-ink">{title}</p>
      <p className="t-small mt-1 text-ink-muted">{children}</p>
    </div>
  )
}
