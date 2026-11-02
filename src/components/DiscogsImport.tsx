import { useRef, useState } from 'react'
import { Modal } from './Modal'

/** Explains how to export the collection from Discogs, then takes the file. */
export function DiscogsImport({ onFile, onClose }: { onFile: (f: File) => Promise<string | null>; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          תקליטים שכבר נמצאים בספרייה לא ייכנסו פעמיים. העטיפות, הז'אנרים ורשימות השירים יתמלאו מ-Discogs ברקע בדקות שאחרי
          הייבוא, כל עוד האפליקציה פתוחה.
        </p>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary wide" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'קורא את הקובץ…' : 'בחירת קובץ'}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv,.zip,application/zip"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          setError(null)
          const err = await onFile(f)
          setBusy(false)
          if (err) setError(err)
        }}
      />
    </Modal>
  )
}
