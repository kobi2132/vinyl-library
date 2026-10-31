import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryFile, RecordDraft, VinylRecord } from '../types'
import { emptyLibrary, mergeLibraries, sameContent } from './merge'
import { AuthExpiredError, getStoredToken, getStoredUser, signIn, signOut, type GoogleUser } from './google'
import { createLibrary, findLibraryFile, readLibrary, updateLibrary } from './drive'

const LIB_KEY = 'vl.library'
const DIRTY_KEY = 'vl.dirty'
const MODE_KEY = 'vl.mode'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'needs-auth' | 'offline' | 'error'
export type Mode = 'google' | 'local' | null

function loadLocal(): LibraryFile {
  try {
    const raw = localStorage.getItem(LIB_KEY)
    if (raw) return { ...emptyLibrary(), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return emptyLibrary()
}

function saveLocal(lib: LibraryFile, dirty: boolean) {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(lib))
    localStorage.setItem(DIRTY_KEY, dirty ? '1' : '')
  } catch {
    /* storage full or blocked; Drive is still the source of truth */
  }
}

export function useLibrary() {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) || null)
  const [user, setUser] = useState<GoogleUser | null>(() => getStoredUser())
  const [lib, setLib] = useState<LibraryFile>(loadLocal)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const libRef = useRef(lib)
  const fileIdRef = useRef<string | null>(null)
  const syncing = useRef(false)
  const again = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  const sync = useCallback(async (tokenArg?: string) => {
    if (syncing.current) {
      again.current = true
      return
    }
    const token = tokenArg ?? getStoredToken()
    if (!token) {
      setStatus('needs-auth')
      return
    }
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }
    syncing.current = true
    setStatus('syncing')
    setError(null)
    try {
      if (!fileIdRef.current) fileIdRef.current = await findLibraryFile(token)
      const local = libRef.current
      if (!fileIdRef.current) {
        fileIdRef.current = await createLibrary(token, local)
      } else {
        const remote = await readLibrary(token, fileIdRef.current)
        const merged = mergeLibraries(local, { ...emptyLibrary(), ...remote })
        if (!sameContent(merged, remote)) {
          merged.updatedAt = new Date().toISOString()
          await updateLibrary(token, fileIdRef.current, merged)
        }
        // keep edits made while we were syncing
        const latest = mergeLibraries(merged, libRef.current)
        libRef.current = latest
        setLib(latest)
        saveLocal(latest, false)
      }
      saveLocal(libRef.current, false)
      setStatus('synced')
    } catch (e) {
      if (e instanceof AuthExpiredError) setStatus('needs-auth')
      else {
        setStatus('error')
        setError((e as Error).message)
      }
    } finally {
      syncing.current = false
      if (again.current) {
        again.current = false
        void sync()
      }
    }
  }, [])

  // initial sync, and re-sync when coming back online / to the tab
  useEffect(() => {
    if (mode !== 'google') return
    void sync()
    const onFocus = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    window.addEventListener('online', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('online', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [mode, sync])

  const commit = useCallback(
    (next: LibraryFile) => {
      next.updatedAt = new Date().toISOString()
      libRef.current = next
      setLib(next)
      saveLocal(next, mode === 'google')
      if (mode === 'google') {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => void sync(), 1200)
      }
    },
    [mode, sync],
  )

  const addRecord = useCallback(
    (draft: RecordDraft) => {
      const now = new Date().toISOString()
      const rec: VinylRecord = { ...draft, id: crypto.randomUUID(), addedAt: now, updatedAt: now }
      const cur = libRef.current
      commit({ ...cur, records: [...cur.records, rec] })
      return rec
    },
    [commit],
  )

  const updateRecord = useCallback(
    (id: string, draft: RecordDraft) => {
      const cur = libRef.current
      const now = new Date().toISOString()
      commit({
        ...cur,
        records: cur.records.map((r) => (r.id === id ? { ...r, ...draft, id, updatedAt: now } : r)),
      })
    },
    [commit],
  )

  const removeRecord = useCallback(
    (id: string) => {
      const cur = libRef.current
      commit({
        ...cur,
        records: cur.records.filter((r) => r.id !== id),
        deleted: { ...(cur.deleted ?? {}), [id]: new Date().toISOString() },
      })
    },
    [commit],
  )

  const importLibrary = useCallback(
    (incoming: LibraryFile) => {
      commit(mergeLibraries(libRef.current, incoming))
    },
    [commit],
  )

  const connectGoogle = useCallback(async () => {
    setError(null)
    try {
      const { token, user } = await signIn()
      setUser(user)
      localStorage.setItem(MODE_KEY, 'google')
      setMode('google')
      await sync(token)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [sync])

  const startLocal = useCallback(() => {
    localStorage.setItem(MODE_KEY, 'local')
    setMode('local')
  }, [])

  /** Google mode: the data lives in Drive, so the local copy is cleared.
   *  Local mode: keeps the records, so connecting Google later uploads them. */
  const logout = useCallback(() => {
    if (mode === 'google') {
      signOut()
      localStorage.removeItem(LIB_KEY)
      localStorage.removeItem(DIRTY_KEY)
      libRef.current = emptyLibrary()
      setLib(libRef.current)
    }
    localStorage.removeItem(MODE_KEY)
    fileIdRef.current = null
    setUser(null)
    setMode(null)
    setStatus('idle')
  }, [mode])

  const hasUnsynced = () => mode === 'google' && localStorage.getItem(DIRTY_KEY) === '1'

  return {
    mode,
    user,
    records: lib.records,
    library: lib,
    status,
    error,
    addRecord,
    updateRecord,
    removeRecord,
    importLibrary,
    connectGoogle,
    startLocal,
    logout,
    syncNow: () => void sync(),
    hasUnsynced,
  }
}
