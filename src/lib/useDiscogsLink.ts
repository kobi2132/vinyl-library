import { useEffect, useRef } from 'react'
import type { VinylRecord } from '../types'
import { DiscogsUnavailable } from './discogs'
import { findSureDiscogsId } from './discogsLink'

/*
 * In the background, connect records that came from MusicBrainz (or were typed in with a barcode)
 * to their Discogs release, so their record page shows value, pressings and credits too.
 * Only sure matches are made (see findSureDiscogsId); each record is tried once.
 * Slow on purpose: MusicBrainz allows one request a second, and Discogs is shared by everyone.
 */
const GAP_MS = 2500

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const needsLink = (r: VinylRecord) => !r.discogsId && !r.discogsLinkTried && !r.enrichPending && Boolean(r.mbid || r.barcode)

export function useDiscogsLink(
  records: VinylRecord[],
  active: boolean,
  patchRecords: (p: Map<string, Partial<VinylRecord>>) => void,
) {
  const pending = records.filter(needsLink).length
  const running = useRef(false)
  const recordsRef = useRef(records)
  const patchRef = useRef(patchRecords)
  useEffect(() => {
    recordsRef.current = records
    patchRef.current = patchRecords
  })

  useEffect(() => {
    if (!active || running.current || pending === 0) return
    running.current = true
    void (async () => {
      const seen = new Set<string>()
      try {
        for (;;) {
          const next = recordsRef.current.find((r) => needsLink(r) && !seen.has(r.id))
          if (!next || !navigator.onLine) break
          seen.add(next.id)
          try {
            const id = await findSureDiscogsId(next)
            // the record may have been linked by hand meanwhile
            const now = recordsRef.current.find((r) => r.id === next.id)
            if (now && !now.discogsId) patchRef.current(
              // linked records get their missing cover, genres and tracks from Discogs too (useDiscogsEnrich)
              new Map([[next.id, id ? { discogsId: id, discogsLinkTried: true, enrichPending: true } : { discogsLinkTried: true }]]),
            )
          } catch (e) {
            if (e instanceof DiscogsUnavailable) break // Discogs not reachable from this site: stop for this visit
            if (/עמוס/.test((e as Error).message)) {
              seen.delete(next.id)
              await wait(60_000)
              continue
            }
            break // network trouble: try again next time the app opens
          }
          await wait(GAP_MS)
        }
      } finally {
        running.current = false
      }
    })()
  }, [active, pending])
}
