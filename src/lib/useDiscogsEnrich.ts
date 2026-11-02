import { useEffect, useRef } from 'react'
import type { VinylRecord } from '../types'
import { DiscogsUnavailable, dgGetReleaseDetails } from './discogs'

/*
 * A Discogs CSV has no covers, genres or tracks. After an import we fetch each release from
 * Discogs in the background, slowly: our token allows about 60 requests a minute for everyone
 * using the app, so one every 1.5 seconds leaves room for searches. Saved in batches, and it
 * carries on next time the app is opened if it was closed halfway.
 */
const GAP_MS = 1500
const BATCH = 10

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useDiscogsEnrich(
  records: VinylRecord[],
  active: boolean,
  patchRecords: (p: Map<string, Partial<VinylRecord>>) => void,
) {
  const pending = records.filter((r) => r.enrichPending && r.discogsId)
  const running = useRef(false)
  const stopped = useRef(false)
  const recordsRef = useRef(records)
  const patchRef = useRef(patchRecords)
  useEffect(() => {
    recordsRef.current = records
    patchRef.current = patchRecords
  })

  useEffect(() => {
    if (!active || running.current || stopped.current || pending.length === 0) return
    running.current = true
    void (async () => {
      const seen = new Set<string>()
      let batch = new Map<string, Partial<VinylRecord>>()
      let missed: string[] = []
      let gotAny = false
      const flush = () => {
        if (batch.size) patchRef.current(batch)
        batch = new Map()
      }
      try {
        for (;;) {
          const next = recordsRef.current.find((r) => r.enrichPending && r.discogsId && !seen.has(r.id))
          if (!next) break
          seen.add(next.id)
          if (!navigator.onLine) break
          try {
            const d = await dgGetReleaseDetails(String(next.discogsId))
            gotAny = true
            for (const id of missed) batch.set(id, { enrichPending: undefined })
            missed = []
            batch.set(next.id, {
              coverUrl: next.coverUrl || d.coverUrl,
              genres: next.genres.length ? next.genres : d.genres,
              tracks: next.tracks?.length ? next.tracks : d.tracks,
              barcode: next.barcode || d.barcode,
              country: next.country || d.country,
              enrichPending: undefined,
            })
          } catch (e) {
            if (e instanceof DiscogsUnavailable) {
              // A release deleted from Discogs also answers 404. Only give up on those once we know
              // Discogs answers at all; three in a row means it isn't reachable from here.
              missed.push(next.id)
              if (missed.length >= 3) {
                stopped.current = true
                break
              }
            } else if (/עמוס/.test((e as Error).message)) {
              seen.delete(next.id)
              flush()
              await wait(60_000)
              continue
            } else {
              break // network trouble: try again next time the app opens
            }
          }
          if (batch.size >= BATCH) flush()
          await wait(GAP_MS)
        }
        if (gotAny && !stopped.current) for (const id of missed) batch.set(id, { enrichPending: undefined })
      } finally {
        flush()
        running.current = false
      }
    })()
  }, [active, pending.length])

  return { left: pending.length }
}
