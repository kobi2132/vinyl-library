import { useEffect, useMemo, useState } from 'react'
import { useLibrary, type SyncStatus } from './lib/useLibrary'
import { preloadGoogle } from './lib/google'
import { decadeOf, initialOf, matches, sortRecords, SORT_LABELS, type SortKey } from './lib/format'
import { exportExcel, exportJson } from './lib/exporters'
import { PrintSheet } from './components/PrintSheet'
import { parseImport } from './lib/merge'
import type { VinylRecord } from './types'
import { Welcome } from './components/Welcome'
import { Menu } from './components/Menu'
import { Cover } from './components/Cover'
import { AddFlow } from './components/AddFlow'
import { RecordDetail } from './components/RecordDetail'

type View = 'grid' | 'list'

function usePref<T extends string>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, v)
    } catch {
      /* ignore */
    }
  }, [key, v])
  return [v, setV] as const
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: '',
  syncing: 'שומר…',
  synced: 'שמור בדרייב',
  'needs-auth': 'לחץ להתחברות מחדש',
  offline: 'אין חיבור, יישמר אחר כך',
  error: 'שגיאה בשמירה, לחץ לנסות שוב',
}

export default function App() {
  const lib = useLibrary()
  const [query, setQuery] = useState('')
  const [sort, setSort] = usePref<SortKey>('vl.sort', 'artist')
  const [view, setView] = usePref<View>('vl.view', 'grid')
  const [genre, setGenre] = useState('')
  const [decade, setDecade] = useState('')
  const [adding, setAdding] = useState<'scan' | 'manual' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(preloadGoogle, [])
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    // let covers start loading before the print dialog takes a snapshot
    const t = setTimeout(() => window.print(), 400)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const genreCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of lib.records) for (const g of r.genres) m.set(g, (m.get(g) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [lib.records])

  const decades = useMemo(
    () => [...new Set(lib.records.map((r) => decadeOf(r.year)).filter((d): d is number => d !== undefined))].sort(),
    [lib.records],
  )

  const shown = useMemo(() => {
    const list = lib.records.filter(
      (r) =>
        matches(r, query) &&
        (!genre || r.genres.includes(genre)) &&
        (!decade || String(decadeOf(r.year)) === decade),
    )
    return sortRecords(list, sort)
  }, [lib.records, query, genre, decade, sort])

  const groups = useMemo(() => {
    const keyOf = (r: VinylRecord) =>
      sort === 'artist'
        ? initialOf(r.artist)
        : sort === 'title'
          ? initialOf(r.title)
          : sort.startsWith('year')
            ? r.year
              ? `שנות ה-${decadeOf(r.year)}`
              : 'ללא שנה'
            : ''
    const out: { key: string; items: VinylRecord[] }[] = []
    for (const r of shown) {
      const k = keyOf(r)
      if (out.length && out[out.length - 1].key === k) out[out.length - 1].items.push(r)
      else out.push({ key: k, items: [r] })
    }
    return out
  }, [shown, sort])

  if (!lib.mode) return <Welcome onGoogle={lib.connectGoogle} onLocal={lib.startLocal} error={lib.error} />

  const open = lib.records.find((r) => r.id === openId) ?? null
  const filtering = Boolean(query || genre || decade)
  const artists = new Set(lib.records.map((r) => r.artist.toLowerCase())).size

  const statusClick = () => {
    if (lib.status === 'needs-auth') void lib.connectGoogle()
    else if (lib.status === 'error' || lib.status === 'offline') lib.syncNow()
  }

  const importFile = async (f: File) => {
    try {
      const incoming = parseImport(await f.text())
      lib.importLibrary(incoming)
      setToast(`יובאו ${incoming.records.length} תקליטים`)
    } catch (e) {
      setToast((e as Error).message)
    }
  }

  const logout = () => {
    if (lib.hasUnsynced() && !confirm('יש שינויים שעוד לא נשמרו בדרייב. להתנתק בכל זאת?')) return
    lib.logout()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-disc" aria-hidden="true" />
          <div>
            <h1>הספרייה שלי</h1>
            <small>
              {lib.records.length} תקליטים · {artists} אמנים
            </small>
          </div>
        </div>
        <div className="topbar-end">
          {lib.mode === 'google' && STATUS_TEXT[lib.status] && (
            <button className={`sync sync-${lib.status}`} onClick={statusClick} title={lib.error ?? ''}>
              <span className="dot" />
              {STATUS_TEXT[lib.status]}
            </button>
          )}
          {lib.mode === 'local' && <span className="sync sync-local">במכשיר בלבד</span>}
          <Menu
            user={lib.user}
            isLocal={lib.mode === 'local'}
            onExport={() => exportJson(lib.library)}
            onExportExcel={() =>
              exportExcel(shown)
                .then(() => setToast('קובץ האקסל ירד'))
                .catch((e: Error) => setToast(`הייצוא נכשל: ${e.message}`))
            }
            onExportPdf={() => setPrinting(true)}
            exportNote={filtering ? `הייצוא כולל רק את ${shown.length} התקליטים שמוצגים כרגע` : undefined}
            onImport={importFile}
            onSync={lib.syncNow}
            onLogout={logout}
          />
        </div>
      </header>

      <section className="toolbar">
        <div className="search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="חיפוש אמן, אלבום, שיר, לייבל…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filters">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="מיון">
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                מיון: {v}
              </option>
            ))}
          </select>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="ז'אנר" className={genre ? 'active' : ''}>
            <option value="">כל הז'אנרים</option>
            {genreCounts.map(([g, n]) => (
              <option key={g} value={g}>
                {g} ({n})
              </option>
            ))}
          </select>
          <select value={decade} onChange={(e) => setDecade(e.target.value)} aria-label="עשור" className={decade ? 'active' : ''}>
            <option value="">כל השנים</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                שנות ה-{d}
              </option>
            ))}
          </select>
          <div className="seg" role="group" aria-label="תצוגה">
            <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="עטיפות">
              ▦
            </button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="רשימה">
              ☰
            </button>
          </div>
        </div>
        {filtering && (
          <div className="filter-summary">
            מציג {shown.length} מתוך {lib.records.length}
            <button
              className="link-btn"
              onClick={() => {
                setQuery('')
                setGenre('')
                setDecade('')
              }}
            >
              ניקוי סינון
            </button>
          </div>
        )}
      </section>

      <main className="shelf">
        {lib.records.length === 0 ? (
          <div className="empty">
            <div className="empty-disc" aria-hidden="true" />
            <h2>האוסף עוד ריק</h2>
            <p>סרוק את הברקוד שעל גב העטיפה של התקליט הראשון שלך.</p>
            <button className="btn primary big" onClick={() => setAdding('scan')}>
              סריקת ברקוד
            </button>
            <button className="link-btn" onClick={() => setAdding('manual')}>
              או הוספה ידנית
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <p>לא נמצאו תקליטים שמתאימים לחיפוש.</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.key || 'all'} className="group">
              {g.key && <h3 className="group-head">{g.key}</h3>}
              <ul className={view === 'grid' ? 'grid' : 'list'}>
                {g.items.map((r) => (
                  <li key={r.id}>
                    <button className="card" onClick={() => setOpenId(r.id)}>
                      <Cover url={r.coverUrl} artist={r.artist} title={r.title} size={view === 'grid' ? 'md' : 'sm'} />
                      <div className="card-text">
                        <strong dir="auto">{r.title}</strong>
                        <span dir="auto">{r.artist}</span>
                        <small>{[r.year, view === 'list' ? r.genres.slice(0, 2).join(', ') : ''].filter(Boolean).join(' · ')}</small>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {lib.records.length > 0 && (
        <div className="fab-row">
          <button className="fab secondary" onClick={() => setAdding('manual')} aria-label="הוספה ידנית">
            ＋
          </button>
          <button className="fab" onClick={() => setAdding('scan')}>
            <span aria-hidden="true">▥</span> סריקה
          </button>
        </div>
      )}

      {adding && (
        <AddFlow
          start={adding}
          records={lib.records}
          genreOptions={genreCounts.map(([g]) => g)}
          onClose={() => setAdding(null)}
          onOpenExisting={(r) => {
            setAdding(null)
            setOpenId(r.id)
          }}
          onSave={(d) => {
            lib.addRecord(d)
            setAdding(null)
            setToast(`"${d.title}" נוסף לספרייה`)
          }}
        />
      )}

      {open && (
        <RecordDetail
          key={open.id}
          record={open}
          genreOptions={genreCounts.map(([g]) => g)}
          onClose={() => setOpenId(null)}
          onUpdate={(d) => {
            lib.updateRecord(open.id, d)
            setToast('השינויים נשמרו')
          }}
          onDelete={() => {
            lib.removeRecord(open.id)
            setOpenId(null)
            setToast('התקליט נמחק')
          }}
          onGenre={(g) => {
            setGenre(g)
            setOpenId(null)
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
      {printing && (
        <PrintSheet
          records={shown}
          subtitle={[`ממוין לפי ${SORT_LABELS[sort].replace(/ \(.*\)/, '')}`, genre, decade && `שנות ה-${decade}`, query && `חיפוש: ${query}`]
            .filter(Boolean)
            .join(' · ')}
        />
      )}
    </div>
  )
}
