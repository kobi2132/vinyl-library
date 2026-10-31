import type { RecordDraft } from '../types'
import { getReleaseDetails, searchByBarcode, searchByCatno, searchByText, type Candidate } from './musicbrainz'
import { DiscogsUnavailable, dgGetReleaseDetails, dgSearchByBarcode, dgSearchByCatno, dgSearchByText } from './discogs'

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


/**
 * Catalogue numbers are printed inconsistently ("BAN 14154", "BAN-14154", "BAN14154"),
 * so if the exact spelling finds nothing, try the other common spellings.
 */
export async function lookupCatno(catno: string): Promise<Candidate[]> {
  const c = catno.trim().replace(/\s+/g, ' ').toUpperCase()
  const m = c.match(/^([A-Z]+)[\s.-]*(\d.*)$/)
  const variants = [c, ...(m ? [`${m[1]} ${m[2]}`, `${m[1]}-${m[2]}`, `${m[1]}${m[2]}`] : [])]
  const tried = new Set<string>()
  for (const v of variants) {
    if (tried.has(v)) continue
    tried.add(v)
    const found = await both(searchByCatno(v), dgSearchByCatno(v))
    if (found.length) return found
  }
  return []
}

export function lookupDetails(c: Candidate): Promise<RecordDraft> {
  return c.source === 'discogs' ? dgGetReleaseDetails(c.id) : getReleaseDetails(c.id)
}

export type { Candidate }
