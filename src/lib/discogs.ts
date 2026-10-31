import type { RecordDraft, Track } from '../types'
import type { Candidate } from './musicbrainz'

/*
 * Discogs is reached through our own server (/api/discogs/... is proxied by Caddy to
 * api.discogs.com with the access token added there), so the token never reaches the browser.
 */
const API = '/api/discogs'

export class DiscogsUnavailable extends Error {}

async function dgFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } })
  const isJson = (res.headers.get('content-type') ?? '').includes('json')
  // Not configured on this server (falls through to the app's index.html) or proxy missing
  if (!isJson || res.status === 404 || res.status === 401 || res.status === 502) throw new DiscogsUnavailable()
  if (res.status === 429) throw new Error('Discogs עמוס כרגע, נסה שוב בעוד רגע')
  if (!res.ok) throw new Error(`שגיאה בחיפוש ב-Discogs (${res.status})`)
  return (await res.json()) as T
}

interface DgSearchResult {
  id: number
  type: string
  title: string
  year?: string
  country?: string
  format?: string[]
  label?: string[]
  catno?: string
  thumb?: string
  cover_image?: string
  barcode?: string[]
}

/** "Artist (2)" -> "Artist" (Discogs adds a number to tell apart artists with the same name) */
const cleanName = (s: string) => s.replace(/\s\(\d+\)$/, '').replace(/\*$/, '').trim()

function toCandidate(r: DgSearchResult): Candidate {
  const i = r.title.indexOf(' - ')
  const artist = i > 0 ? r.title.slice(0, i) : ''
  const title = i > 0 ? r.title.slice(i + 3) : r.title
  const y = r.year ? parseInt(r.year, 10) : NaN
  const fmt = r.format ?? []
  return {
    source: 'discogs',
    id: String(r.id),
    artist: cleanName(artist),
    title,
    year: Number.isFinite(y) && y > 0 ? y : undefined,
    country: r.country,
    format: fmt.slice(0, 2).join(', ') || undefined,
    label: r.label?.[0],
    catalogNumber: r.catno && r.catno !== 'none' ? r.catno : undefined,
    barcode: undefined,
    thumb: r.thumb || r.cover_image || '',
  }
}

const isVinyl = (c: Candidate) => /vinyl|lp/i.test(c.format ?? '')
const rank = (list: Candidate[]) => [...list].sort((a, b) => Number(isVinyl(b)) - Number(isVinyl(a)))

export async function dgSearchByBarcode(barcode: string): Promise<Candidate[]> {
  const code = barcode.replace(/\D/g, '')
  const j = await dgFetch<{ results: DgSearchResult[] }>(`/database/search?type=release&per_page=15&barcode=${encodeURIComponent(code)}`)
  return rank((j.results ?? []).map(toCandidate))
}

export async function dgSearchByText(artist: string, title: string): Promise<Candidate[]> {
  const p = new URLSearchParams({ type: 'release', per_page: '20' })
  if (artist.trim()) p.set('artist', artist.trim())
  if (title.trim()) p.set('release_title', title.trim())
  const j = await dgFetch<{ results: DgSearchResult[] }>(`/database/search?${p}`)
  return rank((j.results ?? []).map(toCandidate))
}

interface DgRelease {
  id: number
  title: string
  year?: number
  country?: string
  artists?: { name: string; anv?: string; join?: string }[]
  genres?: string[]
  styles?: string[]
  labels?: { name: string; catno?: string }[]
  formats?: { name: string; qty?: string; descriptions?: string[] }[]
  tracklist?: { position: string; title: string; duration?: string; type_?: string }[]
  images?: { type: string; uri: string }[]
  identifiers?: { type: string; value: string }[]
}

export async function dgGetReleaseDetails(id: string): Promise<RecordDraft> {
  const r = await dgFetch<DgRelease>(`/releases/${encodeURIComponent(id)}`)
  const artist = (r.artists ?? [])
    .map((a, i, all) => cleanName(a.anv || a.name) + (i < all.length - 1 ? ` ${a.join || ','} `.replace(' , ', ', ') : ''))
    .join('')
    .trim()
  const tracks: Track[] = (r.tracklist ?? [])
    .filter((t) => !t.type_ || t.type_ === 'track')
    .map((t, i) => ({ position: t.position || String(i + 1), title: t.title, length: t.duration || undefined }))
  const f = r.formats?.[0]
  const format = f ? [f.qty && f.qty !== '1' ? `${f.qty}×` : '', f.name, ...(f.descriptions ?? []).slice(0, 2)].filter(Boolean).join(' ') : undefined
  const barcode = r.identifiers?.find((x) => x.type === 'Barcode')?.value.replace(/\D/g, '') || undefined
  const cover = r.images?.find((im) => im.type === 'primary')?.uri ?? r.images?.[0]?.uri
  return {
    artist,
    title: r.title,
    year: r.year || undefined,
    genres: [...(r.styles ?? []), ...(r.genres ?? [])].slice(0, 4),
    label: r.labels?.[0] ? cleanName(r.labels[0].name) : undefined,
    catalogNumber: r.labels?.[0]?.catno && r.labels[0].catno !== 'none' ? r.labels[0].catno : undefined,
    barcode,
    country: r.country,
    format,
    coverUrl: cover,
    tracks,
    discogsId: r.id,
  }
}
