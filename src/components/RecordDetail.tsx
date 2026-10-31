import { useState } from 'react'
import type { RecordDraft, VinylRecord } from '../types'
import { Modal } from './Modal'
import { Cover } from './Cover'
import { RecordForm } from './RecordForm'

export function RecordDetail({
  record,
  genreOptions,
  onUpdate,
  onDelete,
  onClose,
  onGenre,
}: {
  record: VinylRecord
  genreOptions: string[]
  onUpdate: (d: RecordDraft) => void
  onDelete: () => void
  onClose: () => void
  onGenre: (g: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (editing) {
    return (
      <Modal title="עריכת תקליט" onClose={() => setEditing(false)}>
        <RecordForm
          initial={record}
          genreOptions={genreOptions}
          onCancel={() => setEditing(false)}
          onSave={(d) => {
            onUpdate(d)
            setEditing(false)
          }}
        />
      </Modal>
    )
  }

  const facts: [string, React.ReactNode][] = (
    [
      ['שנה', record.year],
      ['לייבל', record.label],
      ['מספר קטלוגי', record.catalogNumber && <bdi dir="ltr">{record.catalogNumber}</bdi>],
      ['פורמט', record.format],
      ['מדינה', record.country],
      ['ברקוד', record.barcode && <bdi dir="ltr">{record.barcode}</bdi>],
      ['נוסף', new Date(record.addedAt).toLocaleDateString('he-IL')],
    ] as [string, React.ReactNode][]
  ).filter(([, v]) => v !== undefined && v !== '' && v !== null)

  return (
    <Modal title={record.title} onClose={onClose} wide>
      <div className="detail">
        <Cover url={record.coverUrl} artist={record.artist} title={record.title} size="lg" />
        <div className="detail-info">
          <h3 className="detail-artist">{record.artist}</h3>
          <h2 className="detail-title">{record.title}</h2>
          {record.genres.length > 0 && (
            <div className="chips">
              {record.genres.map((g) => (
                <button key={g} className="chip" onClick={() => onGenre(g)}>
                  {g}
                </button>
              ))}
            </div>
          )}
          <dl className="facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd dir="auto">{v}</dd>
              </div>
            ))}
          </dl>
          {record.notes && <p className="notes">{record.notes}</p>}
          {record.discogsId && (
            <a className="ext-link" href={`https://www.discogs.com/release/${record.discogsId}`} target="_blank" rel="noreferrer">
              צפייה ב-Discogs ↗
            </a>
          )}
          {record.mbid && (
            <a className="ext-link" href={`https://musicbrainz.org/release/${record.mbid}`} target="_blank" rel="noreferrer">
              צפייה ב-MusicBrainz ↗
            </a>
          )}
        </div>
      </div>

      {record.tracks && record.tracks.length > 0 && (
        <section className="tracks">
          <h4>רשימת שירים</h4>
          <ol>
            {record.tracks.map((t, i) => (
              <li key={i} dir="auto">
                <span className="pos">{t.position}</span>
                <span className="t-title">{t.title}</span>
                {t.length && <span className="len">{t.length}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="form-actions">
        {confirmDelete ? (
          <>
            <span className="confirm-text">למחוק את התקליט מהספרייה?</span>
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
              לא
            </button>
            <button className="btn danger" onClick={onDelete}>
              כן, למחוק
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
              מחיקה
            </button>
            <button className="btn primary" onClick={() => setEditing(true)}>
              עריכה
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
