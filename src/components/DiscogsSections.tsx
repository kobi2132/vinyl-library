import { useState, type ReactNode } from 'react'
import type { Grade, VinylRecord } from '../types'
import {
  DiscogsUnavailable,
  dgGetReleaseDetails,
  dgPriceSuggestions,
  dgReleaseExtras,
  dgVersions,
  type ReleaseExtras,
  type Version,
} from '../lib/discogs'
import { formatPrice } from '../lib/fx'
import { useAsync } from '../lib/useAsync'
import { GradeHelp } from './GradeLegend'
import { PlayIcon } from './Icons'

/*
 * The lower half of the record page: everything beyond the basics, in sections that open and
 * close so the page stays short. Track list open; the rest closed, each with a one-line summary.
 * Everything here except the track list comes live from Discogs and is not saved in Drive.
 */
export function DiscogsSections({
  record,
  onPatch,
  onArtist,
}: {
  record: VinylRecord
  onPatch: (p: Partial<VinylRecord>, message?: string) => void
  onArtist: (artistId: number, name: string) => void
}) {
  const id = record.discogsId
  const extras = useAsync(id ? `x${id}` : null, () => dgReleaseExtras(id!))
  const x = extras.state === 'done' ? extras.value : null
  const offline = extras.state === 'error' && extras.error instanceof DiscogsUnavailable
  const tracks = record.tracks ?? []

  return (
    <div className="sections">
      {tracks.length > 0 && (
        <Section title="רשימת שירים" summary={`${tracks.length} שירים`} open>
          <div className="tracks">
          <ol>
            {tracks.map((t, i) => (
              <li key={i} dir="auto">
                <span className="pos">{t.position}</span>
                <span className="t-title">{t.title}</span>
                {t.length && <span className="len">{t.length}</span>}
              </li>
            ))}
          </ol>
          </div>
        </Section>
      )}

      {id && !offline && (
        <>
          <ValueSection id={id} grade={record.mediaCondition} extras={x} />
          <PressingSection record={record} extras={x} onPatch={onPatch} />
          {x && x.credits.length > 0 && (
            <Section title="קרדיטים" summary={creditsSummary(x)}>
              <dl className="credits">
                {x.credits.map((c, i) => (
                  <div key={i}>
                    <dt dir="ltr">{c.role}</dt>
                    <dd dir="auto">{c.name}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}
          {x && x.videos.length > 0 && (
            <Section title="האזנה" summary={`${x.videos.length} סרטונים ב-YouTube`}>
              <ul className="videos">
                {x.videos.map((v) => (
                  <li key={v.uri}>
                    <a href={v.uri} target="_blank" rel="noreferrer">
                      <PlayIcon size={14} />
                      <span dir="auto">{v.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {x && x.images.length > 1 && (
            <Section title="תמונות" summary={`${x.images.length} תמונות: עטיפה, גב, מדבקות`}>
              <div className="gallery">
                {x.images.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer">
                    <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </a>
                ))}
              </div>
            </Section>
          )}
          {x?.notes && (
            <Section title="הערות מ-Discogs" summary="מידע על ההוצאה">
              <p className="dg-notes" dir="auto">
                {x.notes}
              </p>
            </Section>
          )}
          {x && x.artists[0] && (
            <button className="artist-link" onClick={() => onArtist(x.artists[0].id, x.artists[0].name)}>
              כל האלבומים של <bdi>{x.artists[0].name}</bdi>: מה חסר לי?
            </button>
          )}
          {extras.state === 'loading' && <p className="hint center">טוען מידע מ-Discogs…</p>}
          {x && <p className="credit-line">חלק מהמידע בעמוד הזה מגיע מ-Discogs</p>}
        </>
      )}
    </div>
  )
}

function Section({
  title,
  summary,
  open,
  onOpen,
  children,
}: {
  title: string
  summary?: ReactNode
  open?: boolean
  onOpen?: () => void
  children: ReactNode
}) {
  return (
    <details className="sect" open={open} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onOpen?.()}>
      <summary>
        <span className="sect-title">{title}</span>
        {summary && <span className="sect-sum">{summary}</span>}
      </summary>
      <div className="sect-body">{children}</div>
    </details>
  )
}

const creditsSummary = (x: ReleaseExtras) =>
  x.credits
    .slice(0, 2)
    .map((c) => c.name)
    .join(', ') + (x.credits.length > 2 ? ` ועוד ${x.credits.length - 2}` : '')

/* ---------- Value and rarity ---------- */

const SHOWN_GRADES: Grade[] = ['NM', 'VG+', 'VG', 'G+']

export function rarityTags(have?: number, want?: number): string[] {
  const tags: string[] = []
  if (have !== undefined && have > 0) {
    if (have < 50) tags.push('נדיר מאוד')
    else if (have < 200) tags.push('נדיר')
  }
  if (have !== undefined && want !== undefined && want >= 20 && want > have * 1.2) tags.push('מבוקש')
  return tags
}

function ValueSection({ id, grade, extras }: { id: number; grade?: Grade; extras: ReleaseExtras | null }) {
  // ask for prices only when the section is opened, to spare requests
  const [opened, setOpened] = useState(false)
  const prices = useAsync(opened ? `p${id}` : null, async () => {
    const s = await dgPriceSuggestions(id)
    if (!s) return null
    const out: Partial<Record<Grade, string>> = {}
    for (const g of [...SHOWN_GRADES, 'M' as Grade]) {
      const p = s[g]
      if (p) out[g] = await formatPrice(p.value, p.currency)
    }
    return out
  })
  const tags = extras ? rarityTags(extras.have, extras.want) : []
  const p = prices.state === 'done' ? prices.value : null
  const mine = grade && p?.[grade]
  const grades = grade && !SHOWN_GRADES.includes(grade) ? [grade, ...SHOWN_GRADES] : SHOWN_GRADES

  return (
    <Section
      title="שווי ונדירות"
      onOpen={() => setOpened(true)}
      summary={
        <>
          {mine && <span>≈{mine}</span>}
          {tags.map((t) => (
            <span key={t} className="rare-tag">
              {t}
            </span>
          ))}
          {!mine && tags.length === 0 && 'כמה שווה, כמה נדיר'}
        </>
      }
    >
      {extras && (extras.have !== undefined || extras.want !== undefined) && (
        <div className="community">
          <div>
            <strong>{(extras.have ?? 0).toLocaleString('he-IL')}</strong>
            <small>מחזיקים בו</small>
          </div>
          <div>
            <strong>{(extras.want ?? 0).toLocaleString('he-IL')}</strong>
            <small>מחפשים אותו</small>
          </div>
          {extras.rating && (
            <div>
              <strong>★ {extras.rating.average.toFixed(1)}</strong>
              <small>{extras.rating.count.toLocaleString('he-IL')} דירוגים</small>
            </div>
          )}
        </div>
      )}
      {tags.length > 0 && (
        <p className="hint">
          {tags.map((t) => (
            <span key={t} className="rare-tag">
              {t}
            </span>
          ))}{' '}
          לפי משתמשי Discogs: כמה מחזיקים בהוצאה הזאת וכמה מחפשים אותה.
        </p>
      )}

      <h5 className="value-head">
        שווי משוער לפי מצב <GradeHelp />
      </h5>
      {prices.state === 'loading' && <p className="hint">בודק מחירים…</p>}
      {prices.state === 'error' && <p className="hint">לא הצלחתי לקבל מחירים מ-Discogs כרגע.</p>}
      {prices.state === 'done' && !p && <p className="hint">אין ל-Discogs מספיק מכירות של ההוצאה הזאת כדי להעריך שווי.</p>}
      {p && (
        <>
          <ul className="prices">
            {grades.map((g) => (
              <li key={g} className={g === grade ? 'mine' : ''}>
                <span dir="ltr">{g}</span>
                <strong>{p[g] ?? '–'}</strong>
                {g === grade && <small>המצב שלך</small>}
              </li>
            ))}
          </ul>
          {!grade && <p className="hint">סמנו את מצב התקליט (בעריכה) כדי לראות את השווי של העותק שלכם.</p>}
          <p className="fine">
            הערכה של Discogs לפי מכירות קודמות של ההוצאה הזאת, כך שמכירה חריגה אחת כמעט לא משנה אותה. זו הערכה בלבד, לא מחיר מכירה.
          </p>
        </>
      )}
    </Section>
  )
}

/* ---------- Which pressing do I have? ---------- */

function PressingSection({
  record,
  extras,
  onPatch,
}: {
  record: VinylRecord
  extras: ReleaseExtras | null
  onPatch: (p: Partial<VinylRecord>, message?: string) => void
}) {
  const [opened, setOpened] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const masterId = extras?.masterId
  const versions = useAsync(opened && masterId ? `m${masterId}` : null, () => dgVersions(masterId!))
  const list = versions.state === 'done' ? versions.value : []
  const vinyl = list.filter((v) => v.vinyl)
  const shown = showAll ? list : vinyl
  const matrix = extras?.identifiers.filter((i) => i.type === 'Matrix / Runout') ?? []

  if (!extras) return null
  return (
    <Section
      title="איזו הדפסה יש לי?"
      onOpen={() => setOpened(true)}
      summary={[record.country, record.year, record.catalogNumber].filter(Boolean).join(' · ') || 'פרטי ההדפסה'}
    >
      <p className="hint">
        לכל אלבום יש הרבה הדפסות: מדינות, שנים, הדפסה ראשונה או חוזרת. כדי לדעת איזו יש לכם, השוו את מה שחרוט בוויניל ליד המדבקה
        (Matrix / Runout).
      </p>
      {extras.identifiers.length > 0 && (
        <>
          <h5 className="value-head">ההדפסה שרשומה אצלכם</h5>
          <Identifiers items={extras.identifiers} />
          {matrix.length === 0 && <p className="fine">ל-Discogs אין חריטות רשומות להדפסה הזאת.</p>}
        </>
      )}
      {!masterId ? (
        <p className="fine">ל-Discogs אין הדפסות נוספות של האלבום הזה.</p>
      ) : versions.state === 'loading' ? (
        <p className="hint">טוען הדפסות…</p>
      ) : versions.state === 'error' ? (
        <p className="hint">לא הצלחתי לטעון את ההדפסות כרגע.</p>
      ) : (
        list.length > 0 && (
          <>
            <h5 className="value-head">
              {vinyl.length} הדפסות בוויניל{list.length > vinyl.length && ` (ועוד ${list.length - vinyl.length} בפורמטים אחרים)`}
            </h5>
            <ul className="versions">
              {shown.map((v) => (
                <VersionRow key={v.id} v={v} mine={v.id === record.discogsId} record={record} onPatch={onPatch} />
              ))}
            </ul>
            {list.length > vinyl.length && (
              <button className="link-btn" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'רק ויניל' : 'להציג גם דיסקים וקלטות'}
              </button>
            )}
          </>
        )
      )}
    </Section>
  )
}

function Identifiers({ items }: { items: ReleaseExtras['identifiers'] }) {
  return (
    <dl className="idents">
      {items.map((i, n) => (
        <div key={n}>
          <dt dir="ltr">
            {i.type}
            {i.description && ` (${i.description})`}
          </dt>
          <dd dir="ltr">{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function VersionRow({
  v,
  mine,
  record,
  onPatch,
}: {
  v: Version
  mine: boolean
  record: VinylRecord
  onPatch: (p: Partial<VinylRecord>, message?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const extras = useAsync(open && !mine ? `x${v.id}` : null, () => dgReleaseExtras(v.id))

  const choose = async () => {
    setBusy(true)
    setErr(null)
    try {
      const d = await dgGetReleaseDetails(String(v.id))
      // only what describes the pressing changes; the owner's notes, condition and genres stay
      onPatch(
        {
          discogsId: d.discogsId,
          label: d.label,
          catalogNumber: d.catalogNumber,
          country: d.country,
          year: d.year ?? record.year,
          format: d.format,
          barcode: d.barcode,
          coverUrl: d.coverUrl || record.coverUrl,
        },
        'ההדפסה עודכנה',
      )
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={mine ? 'mine' : ''}>
      <button className="version" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="v-main" dir="ltr">
          {[v.country, v.year].filter(Boolean).join(' · ') || '—'}
        </span>
        <span className="v-sub" dir="ltr">
          {[v.label, v.catno, v.format].filter(Boolean).join(' · ')}
        </span>
        {mine && <span className="mine-tag">שלכם</span>}
      </button>
      {open && !mine && (
        <div className="version-more">
          {extras.state === 'loading' && <p className="hint">טוען…</p>}
          {extras.state === 'done' &&
            (extras.value.identifiers.length ? <Identifiers items={extras.value.identifiers} /> : <p className="fine">אין פרטי זיהוי רשומים.</p>)}
          {err && <p className="notice error">{err}</p>}
          <button className="btn primary small" onClick={choose} disabled={busy}>
            {busy ? 'מעדכן…' : 'זו ההדפסה שלי'}
          </button>
        </div>
      )}
    </li>
  )
}
