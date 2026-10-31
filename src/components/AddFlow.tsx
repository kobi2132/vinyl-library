import { useEffect, useRef, useState } from 'react'
import type { RecordDraft, VinylRecord } from '../types'
import { lookupBarcode as findByBarcode, lookupCatno, lookupDetails, lookupQuery, lookupText, type Candidate } from '../lib/lookup'
import { Modal } from './Modal'
import { Scanner } from './Scanner'
import { CatnoScanner } from './CatnoScanner'
import { track } from '../lib/telemetry'
import { CandidateList } from './CandidateList'
import { RecordForm, blankDraft } from './RecordForm'
import { SearchIcon } from './Icons'

/** How the add flow opens: the camera, an empty form, or a search for text typed in the library's search box. */
export type AddStart = 'scan' | 'manual' | { query: string }

type Step =
  | { kind: 'scan' }
  | { kind: 'searching'; label: string }
  | { kind: 'pick'; items: Candidate[]; barcode?: string }
  | { kind: 'notfound'; barcode: string }
  | { kind: 'catno-notfound'; catno: string }
  | { kind: 'query-notfound'; query: string }
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
  start: AddStart
  records: VinylRecord[]
  genreOptions: string[]
  onSave: (d: RecordDraft) => void
  onClose: () => void
  onOpenExisting: (r: VinylRecord) => void
}) {
  const [step, setStepNow] = useState<Step>(
    start === 'scan' ? { kind: 'scan' } : start === 'manual' ? { kind: 'form', draft: blankDraft() } : { kind: 'searching', label: `מחפש את "${start.query}"…` },
  )
  // the steps Back returns to; search spinners and "not found" / "already have it" answers are passing screens and are skipped
  const [prev, setPrev] = useState<Step[]>([])
  // bumped on every step change, so a search that finishes after Back was pressed is ignored
  const seq = useRef(0)
  const formDirty = useRef(false)
  const setStep = (next: Step, remember: Step | null = step) => {
    seq.current++
    formDirty.current = false
    setPrev((p) => {
      const kept = remember && (remember.kind === 'scan' || remember.kind === 'pick' || remember.kind === 'form') ? [...p, remember] : p
      // returning to a step that is already behind (e.g. "scan again") is the same as going back to it
      const i = kept.findIndex((s) => s.kind === next.kind)
      return i < 0 ? kept : kept.slice(0, i)
    })
    setStepNow(next)
  }
  /** Shows the result of a search, unless the person already went back from it. */
  const settle = (ticket: number, next: Step) => {
    if (seq.current === ticket) setStep(next, null)
  }

  // X leaves the whole flow
  const close = () => {
    if (formDirty.current && !confirm('לצאת בלי לשמור את מה שהוקלד?')) return
    formDirty.current = false
    onClose()
  }

  // Back (and Cancel): one step back, or out of the flow when there is nothing behind
  const goBack = () => {
    if (step.kind === 'form' && formDirty.current && !confirm('לצאת בלי לשמור את מה שהוקלד?')) return true
    setError(null)
    setBusyId(null)
    const last = prev[prev.length - 1]
    if (!last) {
      formDirty.current = false
      onClose()
      return
    }
    setStep(last, null)
    return true
  }
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scanMode, setScanMode] = useState<'barcode' | 'catno'>('barcode')

  const lookupBarcode = async (code: string) => {
    setError(null)
    setStep({ kind: 'searching', label: `מחפש את ${code}…` })
    const ticket = seq.current
    try {
      track('scan_barcode')
      const items = await findByBarcode(code)
      track('lookup', items.some((c) => c.source !== 'discogs') ? 'musicbrainz' : items.length ? 'discogs' : 'none')
      settle(ticket, items.length === 0 ? { kind: 'notfound', barcode: code } : { kind: 'pick', items, barcode: code })
    } catch (e) {
      if (seq.current === ticket) setError((e as Error).message)
      settle(ticket, { kind: 'notfound', barcode: code })
    }
  }

  const searchCatno = async (catno: string) => {
    setError(null)
    setStep({ kind: 'searching', label: `מחפש את ${catno}…` })
    const ticket = seq.current
    try {
      track('scan_catno')
      const items = await lookupCatno(catno)
      settle(ticket, items.length === 0 ? { kind: 'catno-notfound', catno } : { kind: 'pick', items })
    } catch (e) {
      if (seq.current === ticket) setError((e as Error).message)
      settle(ticket, { kind: 'catno-notfound', catno })
    }
  }

  // opened from the library's "not in your collection" message: search the databases for that text
  const queried = useRef(false)
  useEffect(() => {
    if (typeof start !== 'object' || queried.current) return
    queried.current = true
    const q = start.query
    const ticket = seq.current
    const show = (next: Step) => {
      if (seq.current !== ticket) return
      seq.current++
      setStepNow(next)
    }
    track('search_name')
    lookupQuery(q)
      .then((items) => show(items.length ? { kind: 'pick', items } : { kind: 'query-notfound', query: q }))
      .catch((e: Error) => {
        if (seq.current === ticket) setError(e.message)
        show({ kind: 'query-notfound', query: q })
      })
  }, [start])

  const pick = async (c: Candidate, barcode?: string) => {
    setBusyId(c.source + c.id)
    setError(null)
    const ticket = seq.current
    try {
      const draft = await lookupDetails(c)
      if (seq.current !== ticket) return // Back was pressed while the details were loading
      if (barcode && !draft.barcode) draft.barcode = barcode
      // add straight away; any edits can be made later from the record's page
      const existing = duplicate(draft)
      if (existing) setStep({ kind: 'duplicate', draft, existing })
      else onSave(draft)
    } catch (e) {
      if (seq.current === ticket) setError((e as Error).message)
    } finally {
      if (seq.current === ticket) setBusyId(null)
    }
  }

  const textSearch = async (draft: RecordDraft) => {
    setError(null)
    // Back from the results returns to the form with what was typed
    setStep({ kind: 'searching', label: 'מחפש…' }, { kind: 'form', draft })
    const ticket = seq.current
    const toForm = () => settle(ticket, { kind: 'form', draft })
    try {
      track('search_name')
      const items = await lookupText(draft.artist, draft.title)
      if (items.length) settle(ticket, { kind: 'pick', items })
      else {
        if (seq.current === ticket) setError('לא נמצאו תוצאות. אפשר למלא את הפרטים ידנית.')
        toForm()
      }
    } catch (e) {
      if (seq.current === ticket) setError((e as Error).message)
      toForm()
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
    step.kind === 'scan'
      ? scanMode === 'barcode'
        ? 'סריקת ברקוד'
        : 'חיפוש לפי מספר קטלוג'
      : step.kind === 'pick'
        ? 'איזו הוצאה יש לכם?'
        : step.kind === 'form'
          ? step.draft.mbid || step.draft.discogsId
            ? 'פרטי התקליט'
            : 'הוספה ידנית'
          : step.kind === 'duplicate'
            ? 'כבר יש לכם את התקליט הזה'
            : step.kind === 'notfound'
              ? 'הברקוד לא נמצא'
              : step.kind === 'catno-notfound'
                ? 'מספר הקטלוג לא נמצא'
                : step.kind === 'query-notfound'
                  ? 'לא נמצא במאגר'
                  : 'מחפש…'

  return (
    <Modal title={title} onClose={close} onBack={goBack}>
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

      {step.kind === 'query-notfound' && (
        <div className="center-msg">
          <p>
            לא מצאתי במאגר את <bdi>&quot;{step.query}&quot;</bdi>. אפשר לנסות סריקה, או למלא את הפרטים ידנית.
          </p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setStep({ kind: 'scan' })}>
              סריקת ברקוד
            </button>
            <button className="btn primary" onClick={() => setStep({ kind: 'form', draft: blankDraft() })}>
              הוספה ידנית
            </button>
          </div>
        </div>
      )}

      {step.kind === 'pick' && (
        <>
          <p className="hint">
            {step.items.length === 1 ? 'נמצאה הוצאה אחת. בחרו בה כדי להוסיף לספרייה.' : `נמצאו ${step.items.length} הוצאות. בחרו את זו שזהה לשלכם והיא תתווסף לספרייה.`}
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
            <strong><bdi>{step.existing.title}</bdi></strong> של <bdi>{step.existing.artist}</bdi> כבר נמצא בספרייה.
          </p>
          <div className="form-actions stack">
            <button className="btn primary" onClick={() => onOpenExisting(step.existing)}>
              פתיחת התקליט הקיים
            </button>
            <button className="btn ghost" onClick={() => onSave(step.draft)}>
              הוספת עותק נוסף
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
          onCancel={() => void goBack()}
          onDirtyChange={(v) => (formDirty.current = v)}
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
  onDirtyChange,
}: {
  draft: RecordDraft
  genreOptions: string[]
  duplicate: (d: RecordDraft) => VinylRecord | undefined
  onOpenExisting: (r: VinylRecord) => void
  onSearch: (d: RecordDraft) => void
  onSave: (d: RecordDraft) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [pending, setPending] = useState<RecordDraft | null>(null)
  const dup = draft.artist || pending ? duplicate(pending ?? draft) : undefined
  const fromLookup = Boolean(draft.mbid || draft.discogsId)

  if (pending && dup) {
    return (
      <div className="center-msg">
        <h3>כבר יש לכם את התקליט הזה</h3>
        <p>
          <strong><bdi>{dup.title}</bdi></strong> של <bdi>{dup.artist}</bdi> כבר נמצא בספרייה.
        </p>
        <div className="form-actions stack">
          <button className="btn primary" onClick={() => onOpenExisting(dup)}>
            פתיחת התקליט הקיים
          </button>
          <button className="btn ghost" onClick={() => onSave(pending)}>
            הוספת עותק נוסף
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {dup && !pending && <p className="notice">התקליט הזה כבר נמצא בספרייה.</p>}
      <RecordForm
        initial={draft}
        genreOptions={genreOptions}
        saveLabel="הוספה לספרייה"
        onCancel={onCancel}
        onDirtyChange={onDirtyChange}
        onSave={(d) => (duplicate(d) ? setPending(d) : onSave(d))}
        foldExtras={!fromLookup}
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
      className="btn primary wide lookup-btn"
      onClick={(e) => {
        const form = (e.currentTarget as HTMLButtonElement).form!
        const [artist, title] = Array.from(form.querySelectorAll<HTMLInputElement>('input[required]')).map((i) => i.value)
        if (!artist.trim() && !title.trim()) return
        onSearch({ ...blankDraft(), artist, title })
      }}
    >
      <SearchIcon size={18} /> מילוי אוטומטי מהמאגר
    </button>
  )
}
