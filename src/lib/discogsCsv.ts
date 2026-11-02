import type { VinylRecord } from '../types'

/*
 * Discogs "Export collection" (Collection -> Export -> Export Collection) gives a CSV like:
 *
 *   Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added,
 *   Collection Media Condition,Collection Sleeve Condition,Collection Notes[,custom fields…]
 *
 * One row per copy in the collection. Artist/Label names can carry a Discogs number ("Prince (2)"),
 * several labels/catalogue numbers are joined with ", ", Released is a year, a full date or "0",
 * and Date Added is "YYYY-MM-DD HH:MM:SS". Sometimes the download is a .zip holding that CSV.
 */

/** RFC 4180 CSV: quoted fields, "" escapes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim()))
}

/** "Artist (2)" -> "Artist", "Artist*" -> "Artist" (Discogs name variations) */
const cleanName = (s: string) =>
  s
    .split(/,\s+/)
    .map((p) => p.replace(/\s\(\d+\)$/, '').replace(/\*$/, '').trim())
    .join(', ')

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export interface DiscogsImport {
  /** New records, ready to add */
  records: VinylRecord[]
  /** Rows in the file */
  total: number
  /** Rows skipped because the record is already in the library */
  existing: number
}

/** Turn a Discogs collection CSV into records, leaving out ones the library already has. */
export function parseDiscogsCsv(text: string, library: VinylRecord[]): DiscogsImport {
  const rows = parseCsv(text)
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const ix = {
    catno: col('catalog#', 'catalog #', 'catno'),
    artist: col('artist'),
    title: col('title'),
    label: col('label'),
    format: col('format'),
    released: col('released', 'year'),
    id: col('release_id', 'release id'),
    added: col('date added'),
    media: col('collection media condition'),
    sleeve: col('collection sleeve condition'),
    notes: col('collection notes', 'notes'),
  }
  if (ix.artist < 0 || ix.title < 0 || (ix.id < 0 && ix.catno < 0)) {
    throw new Error('הקובץ לא נראה כמו ייצוא אוסף מ-Discogs')
  }

  const byId = new Set(library.map((r) => r.discogsId).filter(Boolean))
  const byName = new Set(library.map((r) => `${norm(r.artist)}|${norm(r.title)}|${norm(r.catalogNumber)}`))
  const now = new Date().toISOString()
  const out: VinylRecord[] = []
  let existing = 0

  for (const r of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
    const artist = cleanName(get(ix.artist))
    const title = get(ix.title)
    if (!artist && !title) continue
    const id = parseInt(get(ix.id), 10)
    const discogsId = Number.isFinite(id) && id > 0 ? id : undefined
    const catno = get(ix.catno).split(/,\s+/)[0]
    const catalogNumber = catno && catno.toLowerCase() !== 'none' ? catno : undefined
    const nameKey = `${norm(artist)}|${norm(title)}|${norm(catalogNumber)}`
    if ((discogsId && byId.has(discogsId)) || byName.has(nameKey)) {
      existing++
      continue
    }

    const year = parseInt(get(ix.released).slice(0, 4), 10)
    const label = cleanName(get(ix.label).split(/,\s+/)[0] ?? '')
    const condition = [
      get(ix.media) && `מצב תקליט: ${get(ix.media)}`,
      get(ix.sleeve) && `מצב עטיפה: ${get(ix.sleeve)}`,
    ].filter(Boolean)
    const notes = [get(ix.notes), condition.join(' · ')].filter(Boolean).join('\n')
    const added = get(ix.added)
    const addedDate = added ? new Date(added.replace(' ', 'T')) : null

    out.push({
      id: crypto.randomUUID(),
      artist,
      title,
      year: year > 0 ? year : undefined,
      genres: [],
      label: label || undefined,
      catalogNumber,
      format: get(ix.format) || undefined,
      notes: notes || undefined,
      discogsId,
      // cover, genres and tracks are filled in afterwards from Discogs (see useDiscogsEnrich)
      enrichPending: discogsId ? true : undefined,
      addedAt: addedDate && !isNaN(addedDate.getTime()) ? addedDate.toISOString() : now,
      updatedAt: now,
    })
    // two copies of the same release in the file are both kept, but not matched again later
    if (discogsId) byId.add(discogsId)
  }
  return { records: out, total: rows.length - 1, existing }
}

/** Read the picked file: the CSV itself, or a .zip holding it (Discogs sometimes zips exports). */
export async function readDiscogsFile(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer())
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
  if (!isZip) return new TextDecoder('utf-8').decode(buf)
  return unzipFirstCsv(buf)
}

async function unzipFirstCsv(buf: Uint8Array<ArrayBuffer>): Promise<string> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // the central directory has the reliable sizes (local headers may defer them to a data descriptor)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('קובץ ה-zip פגום')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  for (let n = 0; n < count; n++) {
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const extraLen = v.getUint16(p + 30, true)
    const commentLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!/\.csv$/i.test(name)) continue
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const data = buf.subarray(start, start + size)
    if (method === 0) return new TextDecoder('utf-8').decode(data)
    if (method !== 8) break
    const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return await new Response(stream).text()
  }
  throw new Error('לא נמצא קובץ CSV בתוך ה-zip')
}
