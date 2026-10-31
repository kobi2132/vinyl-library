// Captures the browser's "install app" event as early as possible (it can fire
// before React mounts) and works out which install path this device needs.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    markInstalled()
    notify()
  })
}

export const onInstallChange = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export const canPromptInstall = () => deferred !== null

/** Opens the native Android/Chrome install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') markInstalled()
  notify()
  return outcome === 'accepted'
}

export type Platform = 'ios' | 'android' | 'other'

export function platform(): Platform {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac; touch support gives it away
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

export const isIosSafari = () => platform() === 'ios' && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

const KEY = 'vl.install'
const SNOOZE_DAYS = 14

function read(): { installed?: boolean; snoozedAt?: number } {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}
function write(v: { installed?: boolean; snoozedAt?: number }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
function markInstalled() {
  write({ ...read(), installed: true })
}

/** Remember "not now" so the invitation doesn't nag on every sign-in. */
export const snoozeInstall = () => write({ ...read(), snoozedAt: Date.now() })

/** Should we invite this user to install, right after they sign in? */
export function shouldInvite(): boolean {
  if (platform() === 'other' || isStandalone()) return false
  const s = read()
  if (s.installed) return false
  if (s.snoozedAt && Date.now() - s.snoozedAt < SNOOZE_DAYS * 864e5) return false
  return true
}
