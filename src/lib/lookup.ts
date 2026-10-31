import type { RecordDraft } from '../types'
import { getReleaseDetails, searchByBarcode, searchByText, type Candidate } from './musicbrainz'
import { DiscogsUnavailable, dgGetReleaseDetails, dgSearchByBarcode, dgSearchByText } from './discogs'

/** Ask MusicBrainz and Discogs together; show whatever either finds. */
async function both(mb: Promise<Candidate[]>, dg: Promise<Candidate[]>): Promise<Candidate[]> {
  const [a, b] = await Promise.allSettled([mb, dg])
  const fromMb = a.status === 'fulfilled' ? a.value : []
  const fromDg = b.status === 'fulfilled' ? b.value : []
  const found = [...fromMb, ...fromDg]
  if (found.length) return found
  const failures = [a, b]
    .filter((x): x is PromiseRejectedResult => x.status === 'rejected')
    .map((x) => x.reason)
    .filter((e) => !(e instanceof DiscogsUnavailable))
  if (failures.length) throw failures[0]
  return []
}

export const lookupBarcode = (code: string) => both(searchByBarcode(code), dgSearchByBarcode(code))
export const lookupText = (artist: string, title: string) => both(searchByText(artist, title), dgSearchByText(artist, title))

export function lookupDetails(c: Candidate): Promise<RecordDraft> {
  return c.source === 'discogs' ? dgGetReleaseDetails(c.id) : getReleaseDetails(c.id)
}

export type { Candidate }
