import type { VinylRecord } from '../types'
import { dgSearchByBarcode, dgSearchByCatno, dgSearchByText } from './discogs'
import { mbDiscogsId, type Candidate } from './musicbrainz'

/*
 * Records found through MusicBrainz (or typed in by hand) have no Discogs id, so the record page
 * can't show their value, pressings or credits. These find the same record on Discogs.
 */

const isVinyl = (c: Candidate) => /vinyl|lp|12"|7"/i.test(c.format ?? '')

/**
 * A sure match only: MusicBrainz's own link to Discogs, or a barcode that finds exactly one
 * vinyl release on Discogs. Anything less certain is left for the person to pick.
 */
export async function findSureDiscogsId(r: VinylRecord): Promise<number | undefined> {
  if (r.mbid) {
    const id = await mbDiscogsId(r.mbid)
    if (id) return id
  }
  if (r.barcode) {
    const found = (await dgSearchByBarcode(r.barcode)).filter(isVinyl)
    if (found.length === 1) return Number(found[0].id)
  }
  return undefined
}

/** Possible Discogs releases for the person to choose from: by barcode, then catalogue number, then name. */
export async function discogsCandidates(r: VinylRecord): Promise<Candidate[]> {
  if (r.barcode) {
    const found = await dgSearchByBarcode(r.barcode)
    if (found.length) return found
  }
  if (r.catalogNumber) {
    const found = await dgSearchByCatno(r.catalogNumber)
    const same = found.filter((c) => !r.artist || c.artist.toLowerCase().includes(r.artist.toLowerCase().slice(0, 4)))
    if (same.length) return same
  }
  return dgSearchByText(r.artist, r.title)
}
