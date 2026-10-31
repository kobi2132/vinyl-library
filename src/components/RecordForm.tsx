import { useEffect, useState } from 'react'
import type { RecordDraft, Track } from '../types'
import { Cover } from './Cover'

function tracksToText(tracks?: Track[]) {
  return (tracks ?? []).map((t) => [t.position, t.title, t.length].filter(Boolean).join('  ')).join('\n')
}

function textToTracks(text: string): Track[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      let rest = line
      let length: string | undefined
      const len = rest.match(/\s+(\d{1,2}:\d{2})$/)
      if (len) {
        length = len[1]
        rest = rest.slice(0, len.index).trim()
      }
      const pos = rest.match(/^([A-Za-z]?\d{1,2}(?:-\d{1,2})?|[A-Za-z])[.)]?\s+(.+)$/)
      return pos ? { position: pos[1], title: pos[2], length } : { position: String(i + 1), title: rest, length }
    })
}

export const blankDraft = (): RecordDraft => ({ artist: '', title: '', genres: [] })

export function RecordForm({
  initial,
  genreOptions,
  onSave,
  onCancel,
  saveLabel = 'שמירה',
  extra,
  foldExtras = false,
  onDirtyChange,
}: {
  initial: RecordDraft
  genreOptions: string[]
  onSave: (d: RecordDraft) => void
  onCancel: () => void
  saveLabel?: string
  extra?: React.ReactNode
  /** Adding by hand: only artist and album up front, the rest folded under "more details". */
  foldExtras?: boolean
  /** Told whether anything was typed or changed, so closing can ask before throwing it away */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [d, setD] = useState<RecordDraft>(initial)
  const [genres, setGenres] = useState(initial.genres.join(', '))
  const [tracks, setTracks] = useState(tracksToText(initial.tracks))
  const set = <K extends keyof RecordDraft>(k: K, v: RecordDraft[K]) => setD((p) => ({ ...p, [k]: v }))
  const dirty = JSON.stringify(d) !== JSON.stringify(initial) || genres !== initial.genres.join(', ') || tracks !== tracksToText(initial.tracks)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = (s?: string) => (s?.trim() ? s.trim() : undefined)
    onSave({
      ...d,
      artist: d.artist.trim(),
      title: d.title.trim(),
      label: clean(d.label),
      catalogNumber: clean(d.catalogNumber),
      barcode: clean(d.barcode),
      country: clean(d.country),
      format: clean(d.format),
      coverUrl: clean(d.coverUrl),
      notes: clean(d.notes),
      genres: genres
        .split(/[,،]/)
        .map((g) => g.trim())
        .filter(Boolean),
      tracks: textToTracks(tracks),
    })
  }

  const Extras = foldExtras ? FoldedExtras : Plain

  return (
    <form className="record-form" onSubmit={submit}>
      <div className="form-top">
        <Cover url={d.coverUrl} artist={d.artist || '?'} title={d.title} size="md" />
        <div className="form-main">
          <label>
            אמן *
            <input required value={d.artist} onChange={(e) => set('artist', e.target.value)} autoFocus={!initial.artist} />
          </label>
          <label>
            שם האלבום *
            <input required value={d.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          {extra}
        </div>
      </div>
      <Extras>
      <div className="row">
        <label>
          שנה
          <input
            inputMode="numeric"
            value={d.year ?? ''}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, '').slice(0, 4), 10)
              set('year', Number.isFinite(n) ? n : undefined)
            }}
            dir="ltr"
          />
        </label>
        <label>
          פורמט
          <input value={d.format ?? ''} onChange={(e) => set('format', e.target.value)} placeholder="למשל: LP" dir="auto" />
        </label>
      </div>
      <label>
        ז'אנרים (מופרדים בפסיק)
        <input list="genre-options" value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Rock, Jazz" dir="auto" />
        <datalist id="genre-options">
          {genreOptions.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      <div className="row">
        <label>
          לייבל
          <input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} dir="auto" />
        </label>
        <label>
          מספר קטלוגי
          <input value={d.catalogNumber ?? ''} onChange={(e) => set('catalogNumber', e.target.value)} dir="ltr" />
        </label>
      </div>
      <div className="row">
        <label>
          ברקוד
          <input value={d.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} inputMode="numeric" dir="ltr" />
        </label>
        <label>
          מדינה
          <input value={d.country ?? ''} onChange={(e) => set('country', e.target.value)} dir="auto" />
        </label>
      </div>
      <label>
        קישור לתמונת עטיפה
        <input value={d.coverUrl ?? ''} onChange={(e) => set('coverUrl', e.target.value)} type="url" dir="ltr" placeholder="https://" />
      </label>
      <label>
        רשימת שירים (שיר בכל שורה)
        <textarea rows={5} value={tracks} onChange={(e) => setTracks(e.target.value)} dir="auto" placeholder={'A1  Song name  3:45\nA2  …'} />
      </label>
      <label>
        הערות
        <textarea rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="מצב התקליט, מאיפה קניתי, חתום…" />
      </label>
      </Extras>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn primary">
          {saveLabel}
        </button>
      </div>
    </form>
  )
}

const Plain = ({ children }: { children: React.ReactNode }) => <>{children}</>

const FoldedExtras = ({ children }: { children: React.ReactNode }) => (
  <details className="more-fields">
    <summary>פרטים נוספים: שנה, לייבל, ברקוד, שירים</summary>
    <div className="more-fields-body">{children}</div>
  </details>
)
