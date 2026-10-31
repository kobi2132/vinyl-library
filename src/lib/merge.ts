import type { LibraryFile, VinylRecord } from '../types'

/** Merge two copies of the library: newest edit wins, deletions win over older edits. */
export function mergeLibraries(a: LibraryFile, b: LibraryFile): LibraryFile {
  const deleted: Record<string, string> = { ...(a.deleted ?? {}) }
  for (const [id, t] of Object.entries(b.deleted ?? {})) {
    if (!deleted[id] || deleted[id] < t) deleted[id] = t
  }
  const byId = new Map<string, VinylRecord>()
  for (const r of [...a.records, ...b.records]) {
    const cur = byId.get(r.id)
    if (!cur || cur.updatedAt < r.updatedAt) byId.set(r.id, r)
  }
  const records = [...byId.values()].filter((r) => !deleted[r.id] || deleted[r.id] < r.updatedAt)
  return {
    version: 1,
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
    records,
    deleted,
  }
}

export function sameContent(a: LibraryFile, b: LibraryFile) {
  const key = (l: LibraryFile) =>
    JSON.stringify([
      [...l.records].sort((x, y) => x.id.localeCompare(y.id)).map((r) => [r.id, r.updatedAt]),
      Object.keys(l.deleted ?? {}).sort(),
    ])
  return key(a) === key(b)
}

export function emptyLibrary(): LibraryFile {
  return { version: 1, updatedAt: new Date(0).toISOString(), records: [], deleted: {} }
}

/** Validate an imported JSON file (our own export format, or a bare array of records). */
export function parseImport(text: string): LibraryFile {
  const j = JSON.parse(text)
  const records: unknown = Array.isArray(j) ? j : j?.records
  if (!Array.isArray(records)) throw new Error('הקובץ לא נראה כמו גיבוי של הספרייה')
  const now = new Date().toISOString()
  const clean: VinylRecord[] = records
    .filter((r) => r && typeof r === 'object' && (r.title || r.artist))
    .map((r) => ({
      ...r,
      id: r.id || crypto.randomUUID(),
      artist: String(r.artist ?? ''),
      title: String(r.title ?? ''),
      genres: Array.isArray(r.genres) ? r.genres.map(String) : [],
      addedAt: r.addedAt || now,
      updatedAt: r.updatedAt || now,
    }))
  return { version: 1, updatedAt: now, records: clean, deleted: Array.isArray(j) ? {} : (j.deleted ?? {}) }
}
