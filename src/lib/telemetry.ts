/*
 * Anonymous usage events and contact messages, sent to the site's own small API (/api/app).
 * Nothing personal is sent: a random id for this device, which features were used, and the
 * library's size. For signed-in users the server turns the Google account into an anonymous id
 * (it never stores the email), so one person on two devices counts once.
 */
import { getStoredToken } from './google'
import type { LibraryFile } from '../types'
import { isStandalone } from './install'

const API = '/api/app'
const DEVICE_KEY = 'vl.device'
const QUEUE_KEY = 'vl.events'
const LAST_OPEN_KEY = 'vl.lastOpen'
const INSTALLED_KEY = 'vl.installTracked'

export type Feature =
  | 'open'
  | 'scan_barcode'
  | 'scan_catno'
  | 'search_name'
  | 'add_manual'
  | 'add'
  | 'lookup'
  | 'edit'
  | 'export_excel'
  | 'export_pdf'
  | 'backup'
  | 'restore'
  | 'install'
  | 'contact'
  | 'sync'

interface QueuedEvent {
  name: Feature
  ts: number
  detail?: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage blocked: events are simply not kept */
  }
}

export function deviceId(): string {
  let id = read<string>(DEVICE_KEY, '')
  if (!id) {
    id = crypto.randomUUID()
    write(DEVICE_KEY, id)
  }
  return id
}

export function platform(): 'android' | 'iphone' | 'desktop' | 'other' {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

const isInstalled = isStandalone

export function browserName() {
  const ua = navigator.userAgent
  if (/SamsungBrowser/.test(ua)) return 'Samsung'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Firefox|FxiOS/.test(ua)) return 'Firefox'
  if (/Chrome|CriOS/.test(ua)) return 'Chrome'
  if (/Safari/.test(ua)) return 'Safari'
  return 'דפדפן אחר'
}

const PLATFORM_LABEL = { android: 'Android', iphone: 'iPhone', desktop: 'מחשב', other: 'מכשיר אחר' }

/** The technical line attached to a contact message. */
export function techLine(signedIn: boolean) {
  return [`גרסה ${__APP_VERSION__}`, PLATFORM_LABEL[platform()], browserName(), isInstalled() ? 'מותקנת' : null, signedIn ? 'מחובר' : 'לא מחובר']
    .filter(Boolean)
    .join(' · ')
}

// ---------- events ----------

let library: LibraryFile | null = null
let timer: number | undefined

/** The app keeps this up to date so every batch carries the library's current size. */
export function setLibrary(lib: LibraryFile) {
  library = lib
}

function snapshot() {
  const genres: Record<string, number> = {}
  for (const r of library?.records ?? []) for (const g of r.genres) genres[g] = (genres[g] ?? 0) + 1
  const top = Object.fromEntries(Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 15))
  return {
    platform: platform(),
    installed: isInstalled(),
    records: library?.records.length,
    libBytes: library ? JSON.stringify(library).length : undefined,
    genres: top,
  }
}

export function track(name: Feature, detail?: string) {
  const q = read<QueuedEvent[]>(QUEUE_KEY, [])
  q.push({ name, ts: Date.now(), detail })
  write(QUEUE_KEY, q.slice(-200))
  clearTimeout(timer)
  timer = window.setTimeout(() => void flush(), 3000)
}

/** One "open" per visit; coming back within 30 minutes is the same visit. */
export function trackOpen() {
  const last = read<number>(LAST_OPEN_KEY, 0)
  if (Date.now() - last > 30 * 60_000) track('open')
  write(LAST_OPEN_KEY, Date.now())
  // iPhone gives no "installed" event: the first open from the home screen counts instead
  if (isInstalled() && !read<boolean>(INSTALLED_KEY, false)) {
    write(INSTALLED_KEY, true)
    track('install')
  }
}

let flushing = false
export async function flush(keepalive = false) {
  if (flushing || !navigator.onLine) return
  const events = read<QueuedEvent[]>(QUEUE_KEY, [])
  if (!events.length) return
  flushing = true
  try {
    const token = getStoredToken()
    const res = await fetch(`${API}/events`, {
      method: 'POST',
      keepalive,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ device: deviceId(), events, snapshot: snapshot() }),
    })
    // sent (or refused for good): drop what was sent, keep anything queued meanwhile
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      const now = read<QueuedEvent[]>(QUEUE_KEY, [])
      write(QUEUE_KEY, now.slice(events.length))
    }
  } catch {
    /* offline or the API is down: try again next time */
  } finally {
    flushing = false
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush(true))
  window.addEventListener('online', () => void flush())
  window.addEventListener('appinstalled', () => {
    write(INSTALLED_KEY, true)
    track('install')
  })
}

// ---------- contact ----------

export type ContactType = 'bug' | 'idea' | 'feedback' | 'other'
export const CONTACT_TYPES: Record<ContactType, string> = {
  bug: 'תקלה',
  idea: 'רעיון לשיפור',
  feedback: 'מחשבות ופידבק',
  other: 'אחר',
}

export async function sendContact(m: { type?: ContactType; name: string; email: string; body: string; tech: string }) {
  if (!navigator.onLine) throw new Error('אין חיבור לאינטרנט. הטקסט נשמר כאן, אפשר לנסות שוב.')
  let res: Response
  try {
    res = await fetch(`${API}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...m, device: deviceId() }),
    })
  } catch {
    throw new Error('השליחה נכשלה. כדאי לבדוק את החיבור ולנסות שוב.')
  }
  if (res.status === 429) throw new Error('נשלחו הרבה פניות היום. אפשר לנסות שוב מחר.')
  if (!res.ok) throw new Error('השליחה נכשלה. אפשר לנסות שוב בעוד רגע.')
}

// ---------- developer page ----------

export class AdminError extends Error {}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken()
  if (!token) throw new AdminError('צריך להתחבר מחדש עם Google')
  const res = await fetch(`${API}/admin/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  })
  if (res.status === 403) throw new AdminError('אין הרשאה, או שההתחברות פגה. כדאי להתחבר מחדש.')
  if (!res.ok) throw new AdminError('השרת לא ענה. אולי השירות עוד לא הותקן.')
  return (res.status === 204 ? undefined : await res.json()) as T
}
