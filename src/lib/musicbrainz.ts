import type { RecordDraft, Track } from '../types'

const MB = 'https://musicbrainz.org/ws/2'

/* MusicBrainz asks for max ~1 request/second per client. */
let last = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function mbFetch<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  // MusicBrainz answers 503 when it is rate limiting; wait and try again a few times
  for (let attempt = 0; ; attempt++) {
    const wait = last + 1100 - Date.now()
    if (wait > 0) await sleep(wait)
    last = Date.now()
    const res = await fetch(`${MB}${path}${sep}fmt=json`, { headers: { Accept: 'application/json' } })
    if (res.status === 503 && attempt < 3) {
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (res.status === 503) throw new Error('MusicBrainz עמוס כרגע, נסה שוב בעוד רגע')
    if (!res.ok) throw new Error(`שגיאה בחיפוש (${res.status})`)
    return (await res.json()) as T
  }
}

interface MbArtistCredit {
  name: string
  joinphrase?: string
}
interface MbRelease {
  id: string
  title: string
  date?: string
  country?: string
  barcode?: string
  score?: number
  'artist-credit'?: MbArtistCredit[]
  'label-info'?: { 'catalog-number'?: string; label?: { name: string } }[]
  media?: {
    format?: string
    'track-count'?: number
    tracks?: { number: string; title: string; length?: number | null }[]
  }[]
  'release-group'?: { id: string; title?: string; 'primary-type'?: string }
  'cover-art-archive'?: { front?: boolean }
  genres?: { name: string; count: number }[]
  tags?: { name: string; count: number }[]
}

export interface Candidate {
  source: 'musicbrainz' | 'discogs'
  /** id in the source database */
  id: string
  mbid?: string
  artist: string
  title: string
  year?: number
  country?: string
  format?: string
  label?: string
  catalogNumber?: string
  barcode?: string
  thumb: string
}

const artistOf = (ac?: MbArtistCredit[]) =>
  (ac ?? []).map((a) => a.name + (a.joinphrase ?? '')).join('').trim()

const yearOf = (d?: string) => {
  const y = d ? parseInt(d.slice(0, 4), 10) : NaN
  return Number.isFinite(y) ? y : undefined
}

const formatOf = (r: MbRelease) => {
  const m = r.media ?? []
  if (!m.length) return undefined
  const f = m[0].format ?? ''
  return m.length > 1 ? `${m.length}× ${f}` : f
}

function toCandidate(r: MbRelease): Candidate {
  const li = r['label-info']?.[0]
  return {
    source: 'musicbrainz',
    id: r.id,
    mbid: r.id,
    artist: artistOf(r['artist-credit']),
    title: r.title,
    year: yearOf(r.date),
    country: r.country,
    format: formatOf(r),
    label: li?.label?.name,
    catalogNumber: li?.['catalog-number'],
    barcode: r.barcode || undefined,
    thumb: `https://coverartarchive.org/release/${r.id}/front-250`,
  }
}

/** Vinyl first, then by MusicBrainz score. */
function rank(list: MbRelease[]) {
  const isVinyl = (r: MbRelease) => /vinyl|lp|"/i.test(formatOf(r) ?? '')
  return [...list].sort((a, b) => Number(isVinyl(b)) - Number(isVinyl(a)) || (b.score ?? 0) - (a.score ?? 0))
}

export async function searchByBarcode(barcode: string): Promise<Candidate[]> {
  const code = barcode.replace(/\D/g, '')
  const variants = new Set([code])
  // UPC-A (12) and EAN-13 with leading 0 are the same code
  if (code.length === 12) variants.add('0' + code)
  if (code.length === 13 && code.startsWith('0')) variants.add(code.slice(1))
  const q = [...variants].map((v) => `barcode:${v}`).join(' OR ')
  const j = await mbFetch<{ releases: MbRelease[] }>(`/release?query=${encodeURIComponent(q)}&limit=15`)
  return rank(j.releases ?? []).map(toCandidate)
}

const esc = (s: string) => s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1')

export async function searchByText(artist: string, title: string): Promise<Candidate[]> {
  const parts: string[] = []
  if (title.trim()) parts.push(`release:(${esc(title.trim())})`)
  if (artist.trim()) parts.push(`artist:(${esc(artist.trim())})`)
  if (!parts.length) return []
  const j = await mbFetch<{ releases: MbRelease[] }>(
    `/release?query=${encodeURIComponent(parts.join(' AND '))}&limit=25`,
  )
  return rank(j.releases ?? []).map(toCandidate)
}

export async function searchByCatno(catno: string): Promise<Candidate[]> {
  const c = catno.trim()
  if (!c) return []
  const j = await mbFetch<{ releases: MbRelease[] }>(`/release?query=${encodeURIComponent(`catno:"${c.replace(/"/g, '')}"`)}&limit=25`)
  return rank(j.releases ?? []).map(toCandidate)
}

const fmtLength = (ms?: number | null) => {
  if (!ms) return undefined
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

/** Full details for one release, ready to save as a record. */
export async function getReleaseDetails(mbid: string): Promise<RecordDraft> {
  const r = await mbFetch<MbRelease>(
    `/release/${mbid}?inc=artist-credits+labels+recordings+release-groups+genres+tags`,
  )
  let genres = (r.genres ?? []).sort((a, b) => b.count - a.count).map((g) => g.name)
  const rgId = r['release-group']?.id
  if (rgId && genres.length === 0) {
    try {
      const rg = await mbFetch<MbRelease>(`/release-group/${rgId}?inc=genres+tags`)
      genres = (rg.genres ?? []).sort((a, b) => b.count - a.count).map((g) => g.name)
      if (!genres.length) genres = (rg.tags ?? []).sort((a, b) => b.count - a.count).slice(0, 3).map((t) => t.name)
    } catch {
      /* genres are optional */
    }
  }
  const tracks: Track[] = []
  const media = r.media ?? []
  media.forEach((m, i) => {
    for (const t of m.tracks ?? []) {
      tracks.push({
        position: media.length > 1 && /^\d+$/.test(t.number) ? `${i + 1}-${t.number}` : t.number,
        title: t.title,
        length: fmtLength(t.length),
      })
    }
  })
  const c = toCandidate(r)
  const coverUrl = r['cover-art-archive']?.front
    ? `https://coverartarchive.org/release/${r.id}/front-500`
    : rgId
      ? `https://coverartarchive.org/release-group/${rgId}/front-500`
      : undefined
  return {
    artist: c.artist,
    title: c.title,
    year: c.year,
    genres: genres.slice(0, 4).map(cap),
    label: c.label,
    catalogNumber: c.catalogNumber,
    barcode: c.barcode,
    country: c.country,
    format: c.format,
    coverUrl,
    tracks,
    mbid: r.id,
  }
}
