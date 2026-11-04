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
  if (res.status === 429) throw new Error('Discogs עמוס כרגע, נסו שוב בעוד רגע')
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

export async function dgSearchByQuery(q: string): Promise<Candidate[]> {
  const p = new URLSearchParams({ type: 'release', per_page: '20', q: q.trim() })
  const j = await dgFetch<{ results: DgSearchResult[] }>(`/database/search?${p}`)
  return rank((j.results ?? []).map(toCandidate))
}

export async function dgSearchByCatno(catno: string): Promise<Candidate[]> {
  const p = new URLSearchParams({ type: 'release', per_page: '25', catno: catno.trim() })
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
  const r = await rawRelease(id)
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

interface DgCollectionPage {
  pagination: { pages: number }
  releases: { id: number; basic_information: { thumb?: string; cover_image?: string; genres?: string[]; styles?: string[] } }[]
}

export interface DgCover {
  thumb?: string
  coverUrl?: string
  genres?: string[]
}

/** One page (100 records) of a user's Discogs collection: covers and genres. Works for public collections. */
export async function dgCollectionPage(user: string, page: number): Promise<{ pages: number; covers: Map<number, DgCover> }> {
  const j = await dgFetch<DgCollectionPage>(
    `/users/${encodeURIComponent(user)}/collection/folders/0/releases?per_page=100&page=${page}`,
  )
  const covers = new Map<number, DgCover>()
  for (const r of j.releases ?? []) {
    const b = r.basic_information ?? {}
    const real = (u?: string) => (u && !/spacer\.gif/.test(u) ? u : undefined)
    covers.set(r.id, {
      thumb: real(b.thumb) ?? real(b.cover_image),
      coverUrl: real(b.cover_image) ?? real(b.thumb),
      genres: [...(b.styles ?? []), ...(b.genres ?? [])].slice(0, 4),
    })
  }
  return { pages: j.pagination?.pages ?? 1, covers }
}

/* ---------- More from Discogs, shown on the record page (fetched when the page opens, not saved in Drive) ---------- */

/** Results kept for this visit, so reopening a record page costs no request. */
const memo = new Map<string, Promise<unknown>>()
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined
  if (!p) {
    p = load()
    memo.set(key, p)
    p.catch(() => memo.delete(key))
  }
  return p
}

export interface Credit {
  name: string
  role: string
}

export interface ReleaseExtras {
  masterId?: number
  artists: { id: number; name: string }[]
  credits: Credit[]
  /** Matrix / runout and the other markings that tell one pressing from another */
  identifiers: { type: string; value: string; description?: string }[]
  notes?: string
  videos: { title: string; uri: string }[]
  images: string[]
  have?: number
  want?: number
  rating?: { average: number; count: number }
  numForSale?: number
}

interface DgReleaseFull extends DgRelease {
  master_id?: number
  artists?: { id: number; name: string; anv?: string; join?: string }[]
  extraartists?: { name: string; anv?: string; role: string }[]
  notes?: string
  videos?: { title: string; uri: string }[]
  identifiers?: { type: string; value: string; description?: string }[]
  community?: { have?: number; want?: number; rating?: { average: number; count: number } }
  num_for_sale?: number
}

/** One request per release per visit, shared by the add flow and the record page. */
const rawRelease = (id: string) => cached(`raw${id}`, () => dgFetch<DgReleaseFull>(`/releases/${encodeURIComponent(id)}`))

const IDENT_ORDER = ['Matrix / Runout', 'Barcode', 'Label Code', 'Rights Society', 'Pressing Plant ID', 'Mastering SID Code', 'Mould SID Code']

export function dgReleaseExtras(id: number): Promise<ReleaseExtras> {
  return cached(`r${id}`, async () => {
    const r = await rawRelease(String(id))
    const order = (t: string) => (IDENT_ORDER.indexOf(t) + 1 || 99)
    return {
      masterId: r.master_id || undefined,
      artists: (r.artists ?? []).filter((a) => a.id).map((a) => ({ id: a.id, name: cleanName(a.name) })),
      credits: (r.extraartists ?? []).map((a) => ({ name: cleanName(a.anv || a.name), role: a.role })),
      identifiers: [...(r.identifiers ?? [])].sort((a, b) => order(a.type) - order(b.type)),
      notes: r.notes?.trim() || undefined,
      videos: (r.videos ?? []).filter((v) => /youtu/.test(v.uri)),
      images: (r.images ?? []).map((im) => im.uri).filter(Boolean),
      have: r.community?.have,
      want: r.community?.want,
      rating: r.community?.rating?.count ? r.community.rating : undefined,
      numForSale: r.num_for_sale,
    }
  })
}

export interface Version {
  id: number
  title: string
  format: string
  label: string
  catno: string
  country: string
  year?: number
  vinyl: boolean
  thumb?: string
}

interface DgVersions {
  versions: { id: number; title: string; format?: string; label?: string; catno?: string; country?: string; released?: string; major_formats?: string[]; thumb?: string }[]
}

/** Every pressing of the album (the Discogs "master"), oldest first. */
export function dgVersions(masterId: number): Promise<Version[]> {
  return cached(`m${masterId}`, async () => {
    const j = await dgFetch<DgVersions>(`/masters/${masterId}/versions?per_page=100&sort=released&sort_order=asc`)
    return (j.versions ?? []).map((v) => {
      const y = parseInt(v.released ?? '', 10)
      return {
        id: v.id,
        title: v.title,
        format: v.format ?? '',
        label: cleanName(v.label ?? ''),
        catno: v.catno && v.catno !== 'none' ? v.catno : '',
        country: v.country ?? '',
        year: y > 0 ? y : undefined,
        vinyl: (v.major_formats ?? []).some((f) => /vinyl/i.test(f)) || /vinyl|LP/.test(v.format ?? ''),
        thumb: v.thumb || undefined,
      }
    })
  })
}

export interface Price {
  value: number
  currency: string
}

/**
 * What Discogs suggests asking for this release in each condition. Discogs works it out from
 * past sales, so one odd sale (a $1 bargain) barely moves it. Needs the token's own Discogs
 * account to have its seller settings filled in; null when Discogs has no suggestion.
 */
export function dgPriceSuggestions(id: number): Promise<Partial<Record<string, Price>> | null> {
  return cached(`p${id}`, async () => {
    try {
      const j = await dgFetch<Record<string, Price>>(`/marketplace/price_suggestions/${id}`)
      const out: Record<string, Price> = {}
      for (const [k, v] of Object.entries(j)) {
        const code = k.match(/\(([^)]+)\)\s*$/)?.[1]?.split(/\s+/)[0]
        if (code && v && typeof v.value === 'number' && v.value > 0) out[code] = v
      }
      return Object.keys(out).length ? out : null
    } catch (e) {
      if (e instanceof DiscogsUnavailable) return null
      throw e
    }
  })
}

export interface ArtistRelease {
  /** The release to fetch (for an album with many pressings, its main pressing) */
  releaseId: number
  masterId?: number
  title: string
  year?: number
  format?: string
  thumb?: string
}

interface DgArtistReleases {
  pagination: { pages: number }
  releases: { id: number; type: 'master' | 'release'; main_release?: number; title: string; year?: number; role: string; format?: string; thumb?: string }[]
}

/** The artist's own releases (not appearances on other people's records), oldest first. */
export function dgArtistReleases(artistId: number): Promise<ArtistRelease[]> {
  return cached(`a${artistId}`, async () => {
    const out: ArtistRelease[] = []
    for (let page = 1; page <= 3; page++) {
      const j = await dgFetch<DgArtistReleases>(`/artists/${artistId}/releases?sort=year&sort_order=asc&per_page=100&page=${page}`)
      for (const r of j.releases ?? []) {
        if (r.role !== 'Main') continue
        out.push({
          releaseId: r.type === 'master' ? (r.main_release ?? r.id) : r.id,
          masterId: r.type === 'master' ? r.id : undefined,
          title: r.title,
          year: r.year || undefined,
          format: r.format,
          thumb: r.thumb || undefined,
        })
      }
      if (page >= (j.pagination?.pages ?? 1)) break
    }
    return out
  })
}
