import type { VinylRecord } from '../types'

export type SortKey = 'artist' | 'title' | 'year-desc' | 'year-asc' | 'added'

export const SORT_LABELS: Record<SortKey, string> = {
  artist: 'אמן (א-ת / A-Z)',
  title: 'שם אלבום (א-ת / A-Z)',
  'year-desc': 'שנה (חדש לישן)',
  'year-asc': 'שנה (ישן לחדש)',
  added: 'נוספו לאחרונה',
}

const collator = new Intl.Collator(['he', 'en'], { sensitivity: 'base', numeric: true })

/** "The Beatles" sorts under B. */
export const sortName = (s: string) => s.replace(/^(the|a|an)\s+/i, '').trim()

export function sortRecords(list: VinylRecord[], key: SortKey): VinylRecord[] {
  const byArtist = (a: VinylRecord, b: VinylRecord) =>
    collator.compare(sortName(a.artist), sortName(b.artist)) ||
    (a.year ?? 9999) - (b.year ?? 9999) ||
    collator.compare(a.title, b.title)
  const s = [...list]
  switch (key) {
    case 'artist':
      return s.sort(byArtist)
    case 'title':
      return s.sort((a, b) => collator.compare(sortName(a.title), sortName(b.title)) || byArtist(a, b))
    case 'year-desc':
      return s.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || byArtist(a, b))
    case 'year-asc':
      return s.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || byArtist(a, b))
    case 'added':
      return s.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }
}

/** First letter used for section headers when sorting by name. */
export function initialOf(s: string) {
  const c = sortName(s).charAt(0).toUpperCase()
  return /[A-Zא-ת]/.test(c) ? c : '#'
}

export function matches(r: VinylRecord, q: string) {
  if (!q) return true
  const hay = [
    r.artist,
    r.title,
    r.label,
    r.catalogNumber,
    r.barcode,
    r.country,
    r.notes,
    r.year?.toString(),
    ...r.genres,
    ...(r.tracks ?? []).map((t) => t.title),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

export const decadeOf = (y?: number) => (y ? Math.floor(y / 10) * 10 : undefined)
