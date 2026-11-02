import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { Cover } from './Cover'
import type { RecordDraft, VinylRecord } from '../types'
import { parseDiscogsCsv, readDiscogsFile, type DiscogsRow } from '../lib/discogsCsv'
import { DiscogsUnavailable, dgCollectionPage, dgGetReleaseDetails, type DgCover } from '../lib/discogs'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Covers for the list. The CSV has none, but its file name carries the Discogs user name
 * ("name-collection-20261102-0841.csv"), and a public collection gives 100 covers per request.
 * Otherwise (private collection, renamed file) covers are fetched one by one for the rows on screen,
 * slowly, because the Discogs token is shared by everyone.
 */
function useCovers(rows: DiscogsRow[] | null, fileName: string) {
  const [covers, setCovers] = useState<Map<number, DgCover>>(new Map())
  const [lazyFor, setLazyFor] = useState<DiscogsRow[] | null>(null)
  const lazy = Boolean(rows) && lazyFor === rows
  const details = useRef(new Map<number, RecordDraft>())
  const wanted = useRef<number[]>([])
  const observer = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (!rows) return
    let cancelled = false
    const user = fileName.match(/^(.+?)-collection-\d{8}-\d{4}/i)?.[1]
    void (async () => {
      if (!user) return setLazyFor(rows)
      try {
        for (let page = 1, pages = 1; page <= Math.min(pages, 30) && !cancelled; page++) {
          const res = await dgCollectionPage(user, page)
          pages = res.pages
          if (cancelled) return
          setCovers((m) => new Map([...m, ...res.covers]))
          await wait(1000)
        }
      } catch {
        if (!cancelled) setLazyFor(rows)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rows, fileName])

  useEffect(() => {
    if (!lazy) return
    let stop = false
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = Number((e.target as HTMLElement).dataset.release)
        if (!id) continue
        if (e.isIntersecting) wanted.current.push(id)
        else wanted.current = wanted.current.filter((x) => x !== id)
      }
    })
    observer.current = obs
    document.querySelectorAll<HTMLElement>('[data-release]').forEach((el) => obs.observe(el))
    void (async () => {
      let misses = 0
      const done = new Set<number>()
      while (!stop && misses < 3) {
        const id = wanted.current.find((x) => !done.has(x))
        if (!id) {
          await wait(300)
          continue
        }
        done.add(id)
        try {
          const d = await dgGetReleaseDetails(String(id))
          misses = 0
          details.current.set(id, d)
          if (!stop) setCovers((m) => new Map(m).set(id, { thumb: d.coverUrl, coverUrl: d.coverUrl, genres: d.genres }))
        } catch (e) {
          if (e instanceof DiscogsUnavailable) misses++
          else if (/עמוס/.test((e as Error).message)) await wait(30_000)
        }
        await wait(1500)
      }
    })()
    return () => {
      stop = true
      obs.disconnect()
      observer.current = null
    }
  }, [lazy])

  const watch = (el: HTMLElement | null) => {
    if (el) observer.current?.observe(el)
  }
  return { covers, details, watch }
}

/**
 * Step 1 explains how to export the collection from Discogs and takes the file.
 * Step 2 lists everything in it, so the user picks what goes into the library.
 */
export function DiscogsImport({
  library,
  onImport,
  onClose,
}: {
  library: VinylRecord[]
  onImport: (records: VinylRecord[], inFile: number) => void
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<DiscogsRow[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [fileName, setFileName] = useState('')
  const { covers, details, watch } = useCovers(rows, fileName)

  const readFile = async (f: File) => {
    setBusy(true)
    setError(null)
    try {
      const found = parseDiscogsCsv(await readDiscogsFile(f), library)
      if (found.length === 0) throw new Error('לא נמצאו תקליטים בקובץ')
      setFileName(f.name)
      setRows(found)
      setPicked(new Set(found.filter((r) => !r.existing).map((r) => r.record.id)))
      setQuery('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const shown = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(({ record: r }) => `${r.artist} ${r.title} ${r.label ?? ''} ${r.catalogNumber ?? ''}`.toLowerCase().includes(q))
  }, [rows, query])

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept=".csv,text/csv,.zip,application/zip"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) void readFile(f)
      }}
    />
  )

  if (!rows) {
    return (
      <Modal title="ייבוא האוסף מ-Discogs" onClose={onClose}>
        <div className="discogs-import">
          <p>אפשר להעביר לכאן את כל האוסף שלכם מ-Discogs בבת אחת.</p>
          <ol>
            <li>
              באתר Discogs, נכנסים ל-<b dir="ltr">Collection</b> ולוחצים על <b dir="ltr">Export</b>{' '}
              (או ישירות:{' '}
              <a href="https://www.discogs.com/users/export" target="_blank" rel="noreferrer" dir="ltr">
                discogs.com/users/export
              </a>
              ).
            </li>
            <li>
              לוחצים על <b dir="ltr">Export Collection</b>, מחכים רגע ומורידים את הקובץ שנוצר.
            </li>
            <li>בוחרים כאן את הקובץ שירד (CSV, או zip אם כך הגיע).</li>
          </ol>
          <p className="muted">
            בשלב הבא תראו את כל התקליטים שבקובץ ותבחרו מה נכנס. העטיפות, הז'אנרים ורשימות השירים יתמלאו מ-Discogs ברקע בדקות
            שאחרי הייבוא, כל עוד האפליקציה פתוחה.
          </p>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary wide" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'קורא את הקובץ…' : 'בחירת קובץ'}
          </button>
        </div>
        {fileInput}
      </Modal>
    )
  }

  /** Use what we already fetched for the list; a full release fetch means nothing is left to fill later. */
  const withCover = (r: VinylRecord): VinylRecord => {
    const full = r.discogsId ? details.current.get(r.discogsId) : undefined
    if (full) {
      return { ...r, coverUrl: full.coverUrl, genres: full.genres, tracks: full.tracks, barcode: full.barcode, country: full.country, enrichPending: undefined }
    }
    const c = r.discogsId ? covers.get(r.discogsId) : undefined
    return c ? { ...r, coverUrl: c.coverUrl, genres: c.genres?.length ? c.genres : r.genres } : r
  }

  const existingCount = rows.filter((r) => r.existing).length
  const selectable = shown.filter((r) => !r.existing)
  const allOn = selectable.length > 0 && selectable.every((r) => picked.has(r.record.id))
  const toggleAll = () => {
    const next = new Set(picked)
    for (const r of selectable) {
      if (allOn) next.delete(r.record.id)
      else next.add(r.record.id)
    }
    setPicked(next)
  }
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  return (
    <Modal
      title="מה נכנס לספרייה?"
      onClose={onClose}
      wide
      onBack={() => {
        setRows(null)
        return true
      }}
    >
      <div className="discogs-pick">
        <div className="pick-head">
        <p className="muted">
          בקובץ {rows.length} תקליטים
          {existingCount > 0 && ` · ${existingCount} כבר בספרייה`}
        </p>
        {rows.length > 12 && (
          <input
            type="search"
            className="pick-search"
            placeholder="חיפוש ברשימה…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <label className="pick-row pick-all">
          <input type="checkbox" checked={allOn} disabled={selectable.length === 0} onChange={toggleAll} />
          <span>{query.trim() ? `סמן את כל ${selectable.length} שנמצאו` : 'סמן הכל'}</span>
        </label>
        </div>
        <ul className="pick-list">
          {shown.map(({ record: r, existing }) => (
            <li key={r.id} ref={watch} data-release={r.discogsId ?? ''}>
              <label className={`pick-row ${existing ? 'is-existing' : ''}`}>
                <input type="checkbox" checked={!existing && picked.has(r.id)} disabled={existing} onChange={() => toggle(r.id)} />
                <Cover url={r.discogsId ? covers.get(r.discogsId)?.thumb : undefined} artist={r.artist} title={r.title} size="sm" />
                <span className="pick-text">
                  <strong dir="auto">{r.title}</strong>
                  <span dir="auto">{r.artist}</span>
                  <small dir="auto">
                    {existing ? 'כבר בספרייה' : [r.year, r.format, r.label].filter(Boolean).join(' · ')}
                  </small>
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="muted pick-empty">לא נמצא ברשימה</li>}
        </ul>
        <div className="pick-actions">
          <button className="btn ghost" onClick={() => setRows(null)}>
            קובץ אחר
          </button>
          <button
            className="btn primary"
            disabled={picked.size === 0}
            onClick={() => onImport(rows.filter((r) => picked.has(r.record.id)).map((r) => withCover(r.record)), rows.length)}
          >
            {picked.size === 0 ? 'לא נבחרו תקליטים' : picked.size === 1 ? 'ייבוא תקליט אחד' : `ייבוא ${picked.size} תקליטים`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
