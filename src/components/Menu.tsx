import { useEffect, useRef, useState } from 'react'
import type { GoogleUser } from '../lib/google'

export function Menu({
  user,
  isLocal,
  onExport,
  onExportExcel,
  onExportPdf,
  exportNote,
  onImport,
  onSync,
  onLogout,
}: {
  user: GoogleUser | null
  isLocal: boolean
  onExport: () => void
  onExportExcel: () => void
  onExportPdf: () => void
  exportNote?: string
  onImport: (f: File) => void
  onSync: () => void
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const item = (label: string, fn: () => void) => (
    <button
      role="menuitem"
      onClick={() => {
        setOpen(false)
        fn()
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="menu" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-label="תפריט" aria-expanded={open}>
        {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span>☰</span>}
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {user && (
            <div className="menu-user">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          )}
          {isLocal && <div className="menu-user"><small>הספרייה שמורה רק במכשיר הזה</small></div>}
          {!isLocal && item('סנכרון עכשיו', onSync)}
          {item('ייצוא לאקסל', onExportExcel)}
          {item('ייצוא ל-PDF / הדפסה', onExportPdf)}
          {exportNote && <div className="menu-note">{exportNote}</div>}
          <hr />
          {item('גיבוי: הורדת קובץ JSON', onExport)}
          {item('שחזור מגיבוי…', () => file.current?.click())}
          <hr />
          {item(isLocal ? 'התחברות עם Google' : 'התנתקות', onLogout)}
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImport(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
