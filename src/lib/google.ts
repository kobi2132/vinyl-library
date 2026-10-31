import { GOOGLE_CLIENT_ID } from '../config'

/* Minimal typings for Google Identity Services token client */
interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string; login_hint?: string }): void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string
            scope: string
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }): TokenClient
          revoke(token: string, done?: () => void): void
        }
      }
    }
  }
}

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ')

const TOKEN_KEY = 'vl.token'
const USER_KEY = 'vl.user'

export interface GoogleUser {
  email: string
  name: string
  picture?: string
}

interface StoredToken {
  token: string
  expiresAt: number
}

let gisPromise: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('לא הצלחתי לטעון את ההתחברות של גוגל'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

/** Preload the GIS script so that the sign-in popup opens synchronously on click. */
export function preloadGoogle() {
  if (GOOGLE_CLIENT_ID) loadGis().catch(() => {})
}

export function isConfigured() {
  return Boolean(GOOGLE_CLIENT_ID)
}

export function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as StoredToken
    if (Date.now() > t.expiresAt - 60_000) return null
    return t.token
  } catch {
    return null
  }
}

export function getStoredUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as GoogleUser) : null
  } catch {
    return null
  }
}

/**
 * Opens the Google popup and resolves with an access token.
 * Must be called from a user gesture (click) to avoid popup blockers.
 */
export async function signIn(silent = false): Promise<{ token: string; user: GoogleUser }> {
  await loadGis()
  const known = getStoredUser()
  const token = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error_description || r.error || 'ההתחברות נכשלה'))
          return
        }
        const stored: StoredToken = {
          token: r.access_token,
          expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
        }
        localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'החלון נסגר' : e.message || e.type)),
    })
    client.requestAccessToken({
      prompt: silent || known ? '' : 'select_account',
      login_hint: known?.email,
    })
  })
  const user = await fetchUser(token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return { token, user }
}

async function fetchUser(token: string): Promise<GoogleUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('לא הצלחתי לקרוא את פרטי המשתמש')
  const j = await res.json()
  return { email: j.email, name: j.name || j.email, picture: j.picture }
}

export function signOut() {
  const t = getStoredToken()
  if (t && window.google) window.google.accounts.oauth2.revoke(t)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export class AuthExpiredError extends Error {
  constructor() {
    super('פג תוקף ההתחברות')
  }
}
