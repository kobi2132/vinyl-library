import { useRef, useState } from 'react'
import type { RecordDraft, VinylRecord } from '../types'
import { Modal } from './Modal'
import { Cover } from './Cover'
import { RecordForm } from './RecordForm'
import { EditIcon, TagIcon, TrashIcon } from './Icons'
import { GradeHelp } from './GradeLegend'
import { DiscogsSections } from './DiscogsSections'

export function RecordDetail({
  record,
  genreOptions,
  onUpdate,
  onDelete,
  onClose,
  onGenre,
  onPatch,
  onArtist,
}: {
  record: VinylRecord
  genreOptions: string[]
  onUpdate: (d: RecordDraft) => void
  /** Change a few fields straight from the page (for sale, the pressing), with an optional message */
  onPatch: (p: Partial<VinylRecord>, message?: string) => void
  /** Open the artist's page on Discogs data ("what am I missing") */
  onArtist: (artistId: number, name: string) => void
  onDelete: () => void
  onClose: () => void
  onGenre: (g: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dirty = useRef(false)
  // leaving the edit form (Back, X or Cancel) returns to the record page; ask first if something was changed
  const leaveEdit = () => {
    if (dirty.current && !confirm('לצאת בלי לשמור את השינויים?')) return true
    dirty.current = false
    setEditing(false)
  }

  if (editing) {
    return (
      <Modal key="edit" title="עריכת תקליט" onClose={() => void leaveEdit()} onBack={leaveEdit}>
        <RecordForm
          initial={record}
          genreOptions={genreOptions}
          onDirtyChange={(v) => (dirty.current = v)}
          onCancel={() => void leaveEdit()}
          onSave={(d) => {
            onUpdate(d)
            dirty.current = false
            setEditing(false)
          }}
        />
      </Modal>
    )
  }

  const facts: [string, React.ReactNode][] = (
    [
      [
        'מצב תקליט / עטיפה',
        (record.mediaCondition || record.sleeveCondition) && (
          <span className="cond" key="cond">
            <bdi dir="ltr">{record.mediaCondition ?? '–'}</bdi> / <bdi dir="ltr">{record.sleeveCondition ?? '–'}</bdi>
            <GradeHelp />
          </span>
        ),
      ],
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
    <Modal
      key="detail"
      title={record.title}
      onBack={() => {
        // Back first closes the delete question, then the record page
        if (confirmDelete) {
          setConfirmDelete(false)
          return true
        }
        onClose()
      }}
      hideTitle
      onClose={onClose}
      wide
      actions={
        <>
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="עריכה" title="עריכה">
            <EditIcon />
          </button>
          <button className="icon-btn danger-text" onClick={() => setConfirmDelete(true)} aria-label="מחיקה" title="מחיקה">
            <TrashIcon />
          </button>
        </>
      }
    >
      {confirmDelete && (
        <div className="confirm-bar" role="alert">
          <span>למחוק את התקליט מהספרייה?</span>
          <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
            ביטול
          </button>
          <button className="btn danger" onClick={onDelete}>
            מחיקה
          </button>
        </div>
      )}
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
                <dd>{typeof v === 'string' ? <bdi>{v}</bdi> : v}</dd>
              </div>
            ))}
          </dl>
          <div className="sale-row">
            <button
              className={`sale-toggle ${record.forSale ? 'on' : ''}`}
              aria-pressed={Boolean(record.forSale)}
              onClick={() => onPatch({ forSale: record.forSale ? undefined : true })}
            >
              <TagIcon size={16} />
              {record.forSale ? 'מסומן למכירה' : 'סימון למכירה'}
            </button>
            {record.forSale && <span className="soon-tag">חנות בהמשך...</span>}
          </div>
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

      <DiscogsSections record={record} onPatch={onPatch} onArtist={onArtist} />
    </Modal>
  )
}
