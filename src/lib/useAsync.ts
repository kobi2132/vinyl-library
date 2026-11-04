import { useEffect, useState } from 'react'

export type Async<T> = { state: 'idle' | 'loading' } | { state: 'done'; value: T } | { state: 'error'; error: Error }

/** Runs load() whenever the key changes (null = don't run yet) and keeps the latest result. */
export function useAsync<T>(key: string | null, load: () => Promise<T>): Async<T> {
  const [res, setRes] = useState<{ key: string | null; v: Async<T> }>({ key: null, v: { state: 'idle' } })
  useEffect(() => {
    if (key === null) return
    let live = true
    setRes({ key, v: { state: 'loading' } })
    load().then(
      (value) => live && setRes({ key, v: { state: 'done', value } }),
      (error: Error) => live && setRes({ key, v: { state: 'error', error } }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return key !== null && res.key === key ? res.v : { state: key === null ? 'idle' : 'loading' }
}
