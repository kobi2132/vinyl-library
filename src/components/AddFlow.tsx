import { useCallback, useState } from 'react'
import type { RecordDraft, VinylRecord } from '../types'
import { lookupBarcode as findByBarcode, lookupDetails, lookupText, type Candidate } from '../lib/lookup'
import { Modal } from './Modal'
import { Scanner } from './Scanner'
import { CandidateList } from './CandidateList'
import { RecordForm, blankDraft } from './RecordForm'

type Step =
  | { kind: 'scan' }
  | { kind: 'searching'; label: string }
  | { kind: 'pick'; items: Candidate[]; barcode?: string }
  | { kind: 'notfound'; barcode: string }
  | { kind: 'form'; draft: RecordDraft }

export function AddFlow({
  start,
  records,
  genreOptions,
  onSave,
  onClose,
  onOpenExisting,
}: {
  start: 'scan' | 'manual'
  records: VinylRecord[]
  genreOptions: string[]
  onSave: (d: RecordDraft) => void
  onClose: () => void
  onOpenExisting: (r: VinylRecord) => void
}) {
  const [step, setStep] = useState<Step>(start === 'scan' ? { kind: 'scan' } : { kind: 'form', draft: blankDraft() })
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  const lookupBarcode = useCallback(async (code: string) => {
    setError(null)
    setStep({ kind: 'searching', label: `מחפש את ${code}…` })
    try {
      const items = await findByBarcode(code)
      if (items.length === 0) setStep({ kind: 'notfound', barcode: code })
      else setStep({ kind: 'pick', items, barcode: code })
    } catch (e) {
      setError((e as Error).message)
      setStep({ kind: 'notfound', barcode: code })
    }
  }, [])

  const pick = async (c: Candidate, barcode?: string) => {
    setBusyId(c.source + c.id)
    setError(null)
    try {
      const draft = await lookupDetails(c)
      if (barcode && !draft.barcode) draft.barcode = barcode
      setFormKey((k) => k + 1)
      setStep({ kind: 'form', draft })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const textSearch = async (draft: RecordDraft) => {
    setError(null)
    setStep({ kind: 'searching', label: 'מחפש…' })
    try {
      const items = await lookupText(draft.artist, draft.title)
      if (items.length) setStep({ kind: 'pick', items })
      else {
        setError('לא נמצאו תוצאות. אפשר למלא את הפרטים ידנית.')
        setStep({ kind: 'form', draft })
      }
    } catch (e) {
      setError((e as Error).message)
      setStep({ kind: 'form', draft })
    }
  }

  const duplicate = (d: RecordDraft) =>
    records.find(
      (r) =>
        (d.mbid && r.mbid === d.mbid) ||
        (d.discogsId && r.discogsId === d.discogsId) ||
        (d.barcode && r.barcode === d.barcode) ||
        (r.artist.toLowerCase() === d.artist.toLowerCase() && r.title.toLowerCase() === d.title.toLowerCase()),
    )

  const title =
    step.kind === 'scan' ? 'סריקת ברקוד' : step.kind === 'pick' ? 'איזו הוצאה יש לך?' : step.kind === 'form' ? 'פרטי התקליט' : 'חיפוש'

  return (
    <Modal title={title} onClose={onClose}>
      {error && <p className="notice error">{error}</p>}

      {step.kind === 'scan' && <Scanner onCode={lookupBarcode} />}

      {step.kind === 'searching' && (
        <div className="center-msg">
          <span className="spinner big" />
          <p>{step.label}</p>
        </div>
      )}

      {step.kind === 'pick' && (
        <>
          <p className="hint">
            {step.items.length === 1 ? 'נמצאה הוצאה אחת. לחץ כדי להמשיך.' : `נמצאו ${step.items.length} הוצאות. בחר את זו שזהה לשלך.`}
          </p>
          <CandidateList items={step.items} busyId={busyId} onPick={(c) => pick(c, step.barcode)} />
          <div className="form-actions">
            {step.barcode && (
              <button className="btn ghost" onClick={() => setStep({ kind: 'scan' })}>
                סריקה חוזרת
              </button>
            )}
            <button className="btn ghost" onClick={() => setStep({ kind: 'form', draft: { ...blankDraft(), barcode: step.barcode } })}>
              הוספה ידנית
            </button>
          </div>
        </>
      )}

      {step.kind === 'notfound' && (
        <div className="center-msg">
          <p>
            לא מצאתי את הברקוד <bdi dir="ltr">{step.barcode}</bdi> במאגר.
          </p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setStep({ kind: 'scan' })}>
              סריקה חוזרת
            </button>
            <button className="btn primary" onClick={() => setStep({ kind: 'form', draft: { ...blankDraft(), barcode: step.barcode } })}>
              הוספה ידנית
            </button>
          </div>
        </div>
      )}

      {step.kind === 'form' && (
        <FormStep
          key={formKey}
          draft={step.draft}
          genreOptions={genreOptions}
          duplicate={duplicate}
          onOpenExisting={onOpenExisting}
          onSearch={textSearch}
          onSave={onSave}
          onCancel={onClose}
        />
      )}
    </Modal>
  )
}

function FormStep({
  draft,
  genreOptions,
  duplicate,
  onOpenExisting,
  onSearch,
  onSave,
  onCancel,
}: {
  draft: RecordDraft
  genreOptions: string[]
  duplicate: (d: RecordDraft) => VinylRecord | undefined
  onOpenExisting: (r: VinylRecord) => void
  onSearch: (d: RecordDraft) => void
  onSave: (d: RecordDraft) => void
  onCancel: () => void
}) {
  const [pending, setPending] = useState<RecordDraft | null>(null)
  const dup = draft.artist || pending ? duplicate(pending ?? draft) : undefined
  const fromLookup = Boolean(draft.mbid || draft.discogsId)

  if (pending && dup) {
    return (
      <div className="center-msg">
        <p>
          כבר יש לך את <strong>{dup.title}</strong> של {dup.artist} בספרייה.
        </p>
        <div className="form-actions">
          <button className="btn ghost" onClick={() => onOpenExisting(dup)}>
            הצג את הקיים
          </button>
          <button className="btn primary" onClick={() => onSave(pending)}>
            הוסף בכל זאת (עותק נוסף)
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {dup && !pending && <p className="notice">שים לב: התקליט הזה כבר נמצא בספרייה שלך.</p>}
      <RecordForm
        initial={draft}
        genreOptions={genreOptions}
        saveLabel="הוספה לספרייה"
        onCancel={onCancel}
        onSave={(d) => (duplicate(d) ? setPending(d) : onSave(d))}
        extra={!fromLookup && <SearchHelper onSearch={onSearch} />}
      />
    </>
  )
}

/** Lets a manual entry pull details from MusicBrainz using the artist and title typed above. */
function SearchHelper({ onSearch }: { onSearch: (d: RecordDraft) => void }) {
  return (
    <button
      type="button"
      className="btn subtle wide"
      onClick={(e) => {
        const form = (e.currentTarget as HTMLButtonElement).form!
        const [artist, title] = Array.from(form.querySelectorAll<HTMLInputElement>('input[required]')).map((i) => i.value)
        if (!artist.trim() && !title.trim()) return
        onSearch({ ...blankDraft(), artist, title })
      }}
    >
      🔎 מלא פרטים אוטומטית לפי אמן ושם אלבום
    </button>
  )
}
