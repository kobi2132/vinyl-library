import { useEffect, useMemo, useRef, useState } from 'react'
import { exitApp, useBack } from './lib/back'
import { useLibrary, type SyncStatus } from './lib/useLibrary'
import { preloadGoogle } from './lib/google'
import { decadeOf, initialOf, matches, sortRecords, SORT_LABELS, type SortKey } from './lib/format'
import { exportExcel, exportJson } from './lib/exporters'
import { PrintSheet } from './components/PrintSheet'
import { parseImport } from './lib/merge'
import type { RecordDraft, VinylRecord, WantItem } from './types'
import { Welcome } from './components/Welcome'
import { Menu } from './components/Menu'
import { Cover } from './components/Cover'
import { AddFlow, type AddStart } from './components/AddFlow'
import { RecordDetail } from './components/RecordDetail'
import { InstallPrompt } from './components/InstallPrompt'
import { shouldInvite } from './lib/install'
import { ContactPage } from './components/ContactPage'
import { DevPage } from './components/DevPage'
import { DiscogsImport } from './components/DiscogsImport'
import { useDiscogsEnrich } from './lib/useDiscogsEnrich'
import { useDiscogsLink } from './lib/useDiscogsLink'
import { ArtistPage } from './components/ArtistPage'
import { Wantlist } from './components/Wantlist'
import { dgGetReleaseDetails } from './lib/discogs'
import { adminFetch, setLibrary, track, trackOpen } from './lib/telemetry'
import { ADMIN_EMAIL } from './config'
import { BarcodeIcon, GridIcon, ListIcon, PlusIcon, SearchIcon } from './components/Icons'

type View = 'grid' | 'list'

/** True when saving the edit form would change nothing. */
function sameDraft(r: VinylRecord, d: RecordDraft) {
  const norm = (x: RecordDraft) => {
    const keep = Object.entries(x)
      .filter(([k, v]) => !['id', 'addedAt', 'updatedAt'].includes(k) && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
      .sort(([a], [b]) => a.localeCompare(b))
    return JSON.stringify(keep)
  }
  return norm(r) === norm(d)
}

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
  'needs-auth': 'התחברות מחדש',
  offline: 'אין חיבור, יישמר אחר כך',
  error: 'השמירה נכשלה, לנסות שוב',
}

export default function App() {
  const lib = useLibrary()
  const [query, setQuery] = useState('')
  const [sort, setSort] = usePref<SortKey>('vl.sort', 'artist')
  const [view, setView] = usePref<View>('vl.view', 'grid')
  const [genre, setGenre] = useState('')
  const [decade, setDecade] = useState('')
  const [adding, setAdding] = useState<AddStart | null>(null)
  const [addingWant, setAddingWant] = useState(false)
  const [wantsOpen, setWantsOpen] = useState(false)
  const [artist, setArtist] = useState<{ id: number; name: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const [printing, setPrinting] = useState(false)
  const [inviteInstall, setInviteInstall] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [devOpen, setDevOpen] = useState(false)
  const [discogsOpen, setDiscogsOpen] = useState(false)
  const [devCount, setDevCount] = useState(0)
  const isAdmin = lib.mode === 'google' && lib.user?.email?.toLowerCase() === ADMIN_EMAIL

  const say = (text: string, undo?: () => void) => setToast({ text, undo })
  const enrich = useDiscogsEnrich(lib.records, Boolean(lib.mode), lib.patchRecords)
  useDiscogsLink(lib.records, Boolean(lib.mode) && enrich.left === 0, lib.patchRecords)

  useEffect(preloadGoogle, [])
  // anonymous usage stats: one "open" per visit, and the library's size with each batch
  useEffect(() => setLibrary(lib.library), [lib.library])
  useEffect(() => {
    if (lib.mode) trackOpen()
  }, [lib.mode])
  // the owner sees how many contact messages are waiting, on the developer page menu item
  useEffect(() => {
    if (!isAdmin) return
    adminFetch<{ open: number }>('summary')
      .then((r) => setDevCount(r.open))
      .catch(() => {})
  }, [isAdmin])
  // right after sign-in, invite phone users to install the app (once per visit)
  useEffect(() => {
    if (!lib.mode || !shouldInvite()) return
    const t = setTimeout(() => setInviteInstall(true), 700)
    return () => clearTimeout(t)
  }, [lib.mode])
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
  // Back on the library: first clear a search or filter, then "press again to exit" instead of closing at once
  const lastBack = useRef(0)
  useBack(Boolean(lib.mode), () => {
    if (query || genre || decade) {
      setQuery('')
      setGenre('')
      setDecade('')
      return true
    }
    if (Date.now() - lastBack.current < 2000) {
      exitApp()
      return
    }
    lastBack.current = Date.now()
    say('לחצו שוב על "חזור" כדי לצאת')
    return true
  })
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 2600)
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
    // the cover grid is one continuous grid; section headings only in the list view
    const keyOf = (r: VinylRecord) =>
      view === 'grid'
        ? ''
        : sort === 'artist'
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
  }, [shown, sort, view])

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
      track('restore')
      say(`יובאו ${incoming.records.length} תקליטים`)
    } catch (e) {
      say((e as Error).message)
    }
  }

  const importDiscogs = (records: VinylRecord[]) => {
    lib.addRecords(records)
    track('import_discogs', String(records.length))
    setDiscogsOpen(false)
    say(records.length === 1 ? 'תקליט אחד יובא מ-Discogs' : `יובאו ${records.length} תקליטים מ-Discogs`)
  }

  const addWant = (w: Omit<WantItem, 'id' | 'addedAt' | 'updatedAt'>) =>
    say(lib.addWant(w) ? `"${w.title}" נוסף לרשימת המשאלות` : `"${w.title}" כבר ברשימת המשאלות`)

  /** Got a record from the wantlist: into the library (with full details when it came from Discogs), off the list */
  const gotWant = async (w: WantItem) => {
    let draft: RecordDraft = { artist: w.artist, title: w.title, year: w.year, label: w.label, catalogNumber: w.catalogNumber, country: w.country, format: w.format, coverUrl: w.coverUrl, discogsId: w.discogsId, genres: [] }
    if (w.discogsId) {
      try {
        const d = await dgGetReleaseDetails(String(w.discogsId))
        draft = { ...d, coverUrl: d.coverUrl || w.coverUrl }
      } catch {
        /* keep what the wantlist had */
      }
    }
    lib.addRecord(draft)
    lib.removeWant(w.id)
    say(`"${w.title}" עבר לספרייה`)
  }

  const logout = () => {
    if (lib.hasUnsynced() && !confirm('יש שינויים שעוד לא נשמרו בדרייב. להתנתק בכל זאת?')) return
    lib.logout()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/logo.svg" alt="" />
          <div>
            <h1>הספרייה שלי</h1>
            <small>
              {lib.records.length} תקליטים · {artists} אמנים
            </small>
            {enrich.left > 0 && <small className="enrich-note">משלים עטיפות ({enrich.left})</small>}
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
            onExport={() => {
              exportJson(lib.library)
              track('backup')
            }}
            onExportExcel={() =>
              exportExcel(shown)
                .then(() => track('export_excel'))
                .then(() => say('קובץ האקסל ירד'))
                .catch((e: Error) => say(`הייצוא נכשל: ${e.message}`))
            }
            onExportPdf={() => {
              setPrinting(true)
              track('export_pdf')
            }}
            exportNote={filtering ? `הייצוא כולל רק את ${shown.length} התקליטים שמוצגים כרגע` : undefined}
            onImport={importFile}
            onDiscogs={() => setDiscogsOpen(true)}
            onSync={() => {
              lib.syncNow()
              track('sync')
            }}
            onConnect={() => void lib.connectGoogle().then((err) => err && say(`ההתחברות לא הושלמה: ${err}`))}
            onLogout={logout}
            onContact={() => setContactOpen(true)}
            onWants={() => setWantsOpen(true)}
            wantsCount={lib.wants.length}
            onDev={isAdmin ? () => setDevOpen(true) : undefined}
            devOpenCount={devCount}
          />
        </div>
      </header>

      <section className="toolbar">
        <div className="toolbar-row">
          <div className="search">
            <SearchIcon size={18} />
            <input
              type="search"
              placeholder="חיפוש אמן, אלבום, שיר…"
              aria-label="חיפוש באוסף"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="seg" role="group" aria-label="תצוגה">
            <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="עטיפות" aria-pressed={view === 'grid'}>
              <GridIcon size={18} />
            </button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="רשימה" aria-pressed={view === 'list'}>
              <ListIcon size={18} />
            </button>
          </div>
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
            <option value="">ז'אנר</option>
            {genreCounts.map(([g, n]) => (
              <option key={g} value={g}>
                {g} ({n})
              </option>
            ))}
          </select>
          <select value={decade} onChange={(e) => setDecade(e.target.value)} aria-label="עשור" className={decade ? 'active' : ''}>
            <option value="">שנים</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                שנות ה-{d}
              </option>
            ))}
          </select>
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
            <p>סרקו את הברקוד שעל גב העטיפה של התקליט הראשון שלכם.</p>
            <button className="btn primary big" onClick={() => setAdding('scan')}>
              סריקת ברקוד
            </button>
            <button className="link-btn" onClick={() => setAdding('manual')}>
              או הוספה ידנית
            </button>
            <button className="link-btn" onClick={() => setDiscogsOpen(true)}>
              יש לכם אוסף ב-Discogs? ייבוא בבת אחת
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <h2>{query.trim() ? 'אין באוסף תקליט כזה' : 'אין תקליטים שמתאימים לסינון'}</h2>
            {query.trim() ? (
              <>
                <p>אולי עוד לא הוספתם אותו?</p>
                <button className="btn primary" onClick={() => setAdding({ query: query.trim() })}>
                  חיפוש &quot;{query.trim()}&quot; במאגר והוספה
                </button>
              </>
            ) : (
              <button
                className="link-btn"
                onClick={() => {
                  setGenre('')
                  setDecade('')
                }}
              >
                ניקוי סינון
              </button>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.key || 'all'} className="group">
              {g.key && <h3 className="group-head">{g.key}</h3>}
              <ul className={view === 'grid' ? 'grid' : 'list'}>
                {g.items.map((r) => (
                  <li key={r.id}>
                    <button className="card" onClick={() => setOpenId(r.id)}>
                      <span className="cover-wrap">
                        <Cover url={r.coverUrl} artist={r.artist} title={r.title} size={view === 'grid' ? 'md' : 'sm'} />
                        {r.forSale && <span className="sale-badge">למכירה</span>}
                      </span>
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
            <PlusIcon size={22} />
          </button>
          <button className="fab" onClick={() => setAdding('scan')}>
            <BarcodeIcon size={22} /> סריקה
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
            // from a lookup (with the scanned barcode, or by name / catalogue number) or typed in
            const method = d.mbid || d.discogsId ? (d.barcode ? 'scan' : 'search') : 'manual'
            track('add', method)
            if (method === 'manual') track('add_manual')
            setAdding(null)
            say(`"${d.title}" נוסף לספרייה`)
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
            if (!sameDraft(open, d)) {
              lib.updateRecord(open.id, d)
              track('edit')
              say('השינויים נשמרו')
            }
          }}
          onDelete={() => {
            const gone = open
            lib.removeRecord(gone.id)
            setOpenId(null)
            say(`"${gone.title}" נמחק`, () => lib.restoreRecord(gone))
          }}
          onGenre={(g) => {
            setGenre(g)
            setOpenId(null)
          }}
          onPatch={(p, message) => {
            lib.patchRecords(new Map([[open.id, p]]))
            if (message) say(message)
          }}
          onArtist={(id, name) => setArtist({ id, name })}
        />
      )}

      {artist && (
        <ArtistPage
          artistId={artist.id}
          name={artist.name}
          records={lib.records}
          wants={lib.wants}
          onClose={() => setArtist(null)}
          onOpenRecord={(id) => {
            setArtist(null)
            setOpenId(id)
          }}
          onAddWant={(a) =>
            addWant({ artist: artist.name, title: a.title, year: a.year, format: a.format, coverUrl: a.thumb, discogsId: a.releaseId })
          }
        />
      )}

      {wantsOpen && (
        <Wantlist
          wants={lib.wants}
          onClose={() => setWantsOpen(false)}
          onAdd={() => setAddingWant(true)}
          onGotIt={gotWant}
          onRemove={(w) => {
            lib.removeWant(w.id)
            say(`"${w.title}" הוסר מהרשימה`, () => lib.restoreWant(w))
          }}
        />
      )}

      {addingWant && (
        <AddFlow
          start="manual"
          forWants
          records={lib.records}
          genreOptions={[]}
          onClose={() => setAddingWant(false)}
          onOpenExisting={() => setAddingWant(false)}
          onSave={(d) => {
            addWant({ artist: d.artist, title: d.title, year: d.year, label: d.label, catalogNumber: d.catalogNumber, country: d.country, format: d.format, coverUrl: d.coverUrl, discogsId: d.discogsId })
            setAddingWant(false)
          }}
        />
      )}

      {contactOpen && <ContactPage user={lib.user} onClose={() => setContactOpen(false)} />}
      {discogsOpen && <DiscogsImport library={lib.records} onImport={importDiscogs} onClose={() => setDiscogsOpen(false)} />}
      {devOpen && <DevPage openCount={devCount} onCount={setDevCount} onClose={() => setDevOpen(false)} />}
      {inviteInstall && <InstallPrompt onClose={() => setInviteInstall(false)} />}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-text">{toast.text}</span>
          {toast.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                toast.undo?.()
                setToast(null)
              }}
            >
              ביטול
            </button>
          )}
        </div>
      )}
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
