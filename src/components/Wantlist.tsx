import { useState } from 'react'
import type { WantItem } from '../types'
import { Modal } from './Modal'
import { Cover } from './Cover'
import { HeartIcon, PlusIcon, TrashIcon } from './Icons'

/** The wantlist: records the owner is looking for. */
export function Wantlist({
  wants,
  onAdd,
  onGotIt,
  onRemove,
  onClose,
}: {
  wants: WantItem[]
  onAdd: () => void
  onGotIt: (w: WantItem) => Promise<void>
  onRemove: (w: WantItem) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const sorted = [...wants].sort((a, b) => b.addedAt.localeCompare(a.addedAt))

  return (
    <Modal
      title="רשימת המשאלות"
      onClose={onClose}
      actions={
        <button className="icon-btn" onClick={onAdd} aria-label="הוספה לרשימה" title="הוספה לרשימה">
          <PlusIcon />
        </button>
      }
    >
      <p className="store-note">
        <HeartIcon size={16} /> תקליטים שאתם מחפשים. כשתיפתח החנות, נודיע לכם כשמישהו בישראל מוכר תקליט מהרשימה.
      </p>
      {sorted.length === 0 ? (
        <div className="center-msg">
          <p>הרשימה עוד ריקה.</p>
          <p className="hint">
            מוסיפים בכפתור + למעלה, או מעמוד של תקליט: &quot;כל האלבומים של האמן: מה חסר לי?&quot;
          </p>
          <button className="btn primary" onClick={onAdd}>
            הוספת תקליט לרשימה
          </button>
        </div>
      ) : (
        <ul className="wants">
          {sorted.map((w) => (
            <li key={w.id}>
              <Cover url={w.coverUrl} artist={w.artist} title={w.title} size="sm" />
              <div className="want-text">
                <strong dir="auto">{w.title}</strong>
                <span dir="auto">{w.artist}</span>
                <small dir="ltr">{[w.year, w.country, w.label].filter(Boolean).join(' · ')}</small>
              </div>
              <div className="want-actions">
                <button
                  className="btn ghost small"
                  disabled={busy === w.id}
                  onClick={() => {
                    setBusy(w.id)
                    void onGotIt(w).finally(() => setBusy(null))
                  }}
                >
                  {busy === w.id ? 'מעביר…' : 'השגתי!'}
                </button>
                <button className="icon-btn danger-text" onClick={() => onRemove(w)} aria-label="הסרה מהרשימה" title="הסרה">
                  <TrashIcon size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
