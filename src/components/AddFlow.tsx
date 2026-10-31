import { useCallback, useState } from 'react'
import type { RecordDraft, VinylRecord } from '../types'
import { lookupBarcode as findByBarcode, lookupCatno, lookupDetails, lookupText, type Candidate } from '../lib/lookup'
import { Modal } from './Modal'
import { Scanner } from './Scanner'
import { CatnoScanner } from './CatnoScanner'
import { CandidateList } from './CandidateList'
import { RecordForm, blankDraft } from './RecordForm'

type Step =
  | { kind: 'scan' }
  | { kind: 'searching'; label: string }
  | { kind: 'pick'; items: Candidate[]; barcode?: string }
  | { kind: 'notfound'; barcode: string }
  | { kind: 'catno-notfound'; catno: string }
  | { kind: 'form'; draft: RecordDraft }
  | { kind: 'duplicate'; draft: RecordDraft; existing: VinylRecord }

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
  const [scanMode, setScanMode] = useState<'barcode' | 'catno'>('barcode')

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

  const searchCatno = async (catno: string) => {
    setError(null)
    setStep({ kind: 'searching', label: `מחפש את ${catno}…` })
    try {
      const items = await lookupCatno(catno)
      if (items.length === 0) setStep({ kind: 'catno-notfound', catno })
      else setStep({ kind: 'pick', items })
    } catch (e) {
      setError((e as Error).message)
      setStep({ kind: 'catno-notfound', catno })
    }
  }

  const pick = async (c: Candidate, barcode?: string) => {
    setBusyId(c.source + c.id)
    setError(null)
    try {
      const draft = await lookupDetails(c)
      if (barcode && !draft.barcode) draft.barcode = barcode
      // add straight away; any edits can be made later from the record's page
      const existing = duplicate(draft)
      if (existing) setStep({ kind: 'duplicate', draft, existing })
      else onSave(draft)
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
    step.kind === 'scan' ? (scanMode === 'barcode' ? 'סריקת ברקוד' : 'חיפוש לפי מספר קטלוג') : step.kind === 'pick' ? 'איזו הוצאה יש לך?' : step.kind === 'form' ? 'פרטי התקליט' : step.kind === 'duplicate' ? 'כבר בספרייה' : 'חיפוש'

  return (
    <Modal title={title} onClose={onClose}>
      {error && <p className="notice error">{error}</p>}

      {step.kind === 'scan' && (
        <>
          <div className="seg scan-mode" role="tablist">
            <button role="tab" aria-selected={scanMode === 'barcode'} className={scanMode === 'barcode' ? 'on' : ''} onClick={() => setScanMode('barcode')}>
              ברקוד
            </button>
            <button role="tab" aria-selected={scanMode === 'catno'} className={scanMode === 'catno' ? 'on' : ''} onClick={() => setScanMode('catno')}>
              מספר קטלוג
            </button>
          </div>
          {scanMode === 'barcode' ? <Scanner onCode={lookupBarcode} /> : <CatnoScanner onSearch={searchCatno} />}
        </>
      )}

      {step.kind === 'searching' && (
        <div className="center-msg">
          <span className="spinner big" />
          <p>{step.label}</p>
        </div>
      )}

      {step.kind === 'catno-notfound' && (
        <div className="center-msg">
          <p>
            לא מצאתי את מספר הקטלוג <bdi dir="ltr">{step.catno}</bdi>. כדאי לבדוק שהוא נקרא נכון.
          </p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setStep({ kind: 'scan' })}>
              לנסות שוב
            </button>
            <button className="btn primary" onClick={() => setStep({ kind: 'form', draft: { ...blankDraft(), catalogNumber: step.catno } })}>
              הוספה ידנית
            </button>
          </div>
        </div>
      )}

      {step.kind === 'pick' && (
        <>
          <p className="hint">
            {step.items.length === 1 ? 'נמצאה הוצאה אחת. לחץ עליה כדי להוסיף לספרייה.' : `נמצאו ${step.items.length} הוצאות. לחץ על זו שזהה לשלך והיא תתווסף לספרייה.`}
          </p>
          <CandidateList items={step.items} busyId={busyId} onPick={(c) => pick(c, step.barcode)} />
          <div className="form-actions">
            {(step.barcode || start === 'scan') && (
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

      {step.kind === 'duplicate' && (
        <div className="center-msg">
          <p>
            כבר יש לך את <strong>{step.existing.title}</strong> של {step.existing.artist} בספרייה.
          </p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => onOpenExisting(step.existing)}>
              הצג את הקיים
            </button>
            <button className="btn primary" onClick={() => onSave(step.draft)}>
              הוסף בכל זאת (עותק נוסף)
            </button>
          </div>
        </div>
      )}

      {step.kind === 'form' && (
        <FormStep
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
