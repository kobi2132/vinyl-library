import { useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import type { VinylRecord } from '../types'
import { parseDiscogsCsv, readDiscogsFile, type DiscogsRow } from '../lib/discogsCsv'

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

  const readFile = async (f: File) => {
    setBusy(true)
    setError(null)
    try {
      const found = parseDiscogsCsv(await readDiscogsFile(f), library)
      if (found.length === 0) throw new Error('לא נמצאו תקליטים בקובץ')
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
        <ul className="pick-list">
          {shown.map(({ record: r, existing }) => (
            <li key={r.id}>
              <label className={`pick-row ${existing ? 'is-existing' : ''}`}>
                <input type="checkbox" checked={!existing && picked.has(r.id)} disabled={existing} onChange={() => toggle(r.id)} />
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
            onClick={() => onImport(rows.filter((r) => picked.has(r.record.id)).map((r) => r.record), rows.length)}
          >
            {picked.size === 0 ? 'לא נבחרו תקליטים' : picked.size === 1 ? 'ייבוא תקליט אחד' : `ייבוא ${picked.size} תקליטים`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
