import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '../lib/telemetry'
import { CHANGELOG } from '../changelog'
import { CONTACT_TYPES, type ContactType } from '../lib/telemetry'
import { Modal } from './Modal'

type Tab = 'stats' | 'users' | 'info' | 'inbox'
type Range = 'today' | '7' | '30' | 'all'

interface Stats {
  users: { active: number; google: number; new: number; total: number }
  retention: { week: { back: number; of: number } | null; month: { back: number; of: number } | null }
  features: { name: string; users: number; uses: number }[]
  lookups: Record<string, number>
  adds: Record<string, number>
  content: { avg: number; median: number; total: number; added: number }
  genres: [string, number][]
  platforms: Record<string, number>
  installed: number
}
interface UserRow {
  id: string
  me: boolean
  google: boolean
  platform: string
  first: number
  last: number
  visits: number
  records: number | null
  features: string[]
}
interface Info {
  dbBytes: number
  events: number
  devices: number
  messages: number
  avgLibBytes: number
}
interface Message {
  id: number
  ts: number
  type: ContactType | null
  name: string | null
  email: string | null
  body: string | null
  tech: string | null
  handled: boolean
}

const FEATURE_LABELS: Record<string, string> = {
  scan_barcode: 'סריקת ברקוד',
  scan_catno: 'מספר קטלוגי',
  search_name: 'חיפוש לפי שם',
  add_manual: 'הוספה ידנית',
  edit: 'עריכת תקליט',
  export_excel: 'ייצוא לאקסל',
  export_pdf: 'ייצוא PDF',
  backup: 'גיבוי JSON',
  restore: 'שחזור מגיבוי',
  install: 'התקנה למסך הבית',
  contact: 'צור קשר',
  sync: 'סנכרון ידני',
}
const PLATFORM_LABELS: Record<string, string> = { android: 'Android', iphone: 'iPhone', desktop: 'מחשב', other: 'אחר' }
const RANGES: [Range, string][] = [
  ['today', 'היום'],
  ['7', '7 ימים'],
  ['30', '30 יום'],
  ['all', 'הכל'],
]

function sinceOf(r: Range) {
  if (r === 'all') return 0
  if (r === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  return Date.now() - Number(r) * 86_400_000
}

const num = (n: number) => n.toLocaleString('he-IL')
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–')
const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
function when(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `היום ${time}`
  const y = new Date(today)
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `אתמול ${time}`
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
const day = (ts: number) => new Date(ts).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })

/** Loads one admin endpoint and reloads it when `path` changes. */
function useAdmin<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    if (!path) return
    setError(null)
    adminFetch<T>(path)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [path])
  useEffect(load, [load])
  return { data, error, setData, reload: load }
}

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  if (!rows.length) return <p className="dev-empty">אין עדיין נתונים</p>
  return (
    <div className="dev-bars">
      {rows.map(([label, v]) => (
        <div className="dev-bar" key={label}>
          <span dir="auto">{label}</span>
          <div className="dev-track">
            <div className="dev-fill" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <em>{num(v)}</em>
        </div>
      ))}
    </div>
  )
}

function Split({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  if (!total) return <p className="dev-empty">אין עדיין נתונים</p>
  return (
    <>
      <div className="dev-split">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="dev-legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} {pct(p.value, total)}
          </span>
        ))}
      </div>
    </>
  )
}

const Kpi = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div className="dev-kpi">
    <span>{label}</span>
    <b>{value}</b>
    {note && <small>{note}</small>}
  </div>
)

function StatsTab({ since }: { since: number }) {
  const { data: s, error } = useAdmin<Stats>(`stats?since=${since}`)
  if (error) return <p className="dev-error">{error}</p>
  if (!s) return <p className="dev-empty">טוען…</p>
  const ret = (r: Stats['retention']['week']) => (r ? pct(r.back, r.of) : '–')
  const retNote = (r: Stats['retention']['week']) => (r ? `${r.back} מתוך ${r.of}` : 'עוד מוקדם')
  return (
    <>
      <h4 className="dev-sec">משתמשים</h4>
      <div className="dev-kpis">
        <Kpi label="התחברו בתקופה" value={num(s.users.active)} />
        <Kpi label="מתוכם עם Google" value={num(s.users.google)} note={pct(s.users.google, s.users.active)} />
        <Kpi label="משתמשים חדשים" value={num(s.users.new)} />
        <Kpi label='סה"כ באפליקציה' value={num(s.users.total)} />
      </div>
      <h4 className="dev-sec">שימור</h4>
      <div className="dev-kpis">
        <Kpi label="חזרו אחרי שבוע" value={ret(s.retention.week)} note={retNote(s.retention.week)} />
        <Kpi label="חזרו אחרי חודש" value={ret(s.retention.month)} note={retNote(s.retention.month)} />
      </div>
      <h4 className="dev-sec">פיצ'רים (כמה משתמשים)</h4>
      <div className="dev-panel">
        <Bars rows={s.features.filter((f) => FEATURE_LABELS[f.name]).map((f) => [FEATURE_LABELS[f.name], f.users])} />
      </div>
      <h4 className="dev-sec">תוכן</h4>
      <div className="dev-kpis">
        <Kpi label="ממוצע תקליטים למשתמש" value={num(s.content.avg)} />
        <Kpi label="חציון" value={num(s.content.median)} />
        <Kpi label='סה"כ תקליטים' value={num(s.content.total)} />
        <Kpi label="נוספו בתקופה" value={num(s.content.added)} />
      </div>
      <div className="dev-panel">
        <strong>הצלחת חיפוש בסריקת ברקוד</strong>
        <Split
          parts={[
            { label: 'MusicBrainz', value: s.lookups.musicbrainz ?? 0, color: 'var(--ok)' },
            { label: 'רק Discogs', value: s.lookups.discogs ?? 0, color: 'var(--accent-2)' },
            { label: 'לא נמצא', value: s.lookups.none ?? 0, color: 'var(--danger)' },
          ]}
        />
      </div>
      <div className="dev-panel">
        <strong>איך מוסיפים תקליטים</strong>
        <Split
          parts={[
            { label: 'סריקה', value: s.adds.scan ?? 0, color: 'var(--accent-2)' },
            { label: 'חיפוש', value: s.adds.search ?? 0, color: 'var(--idea)' },
            { label: 'ידני', value: s.adds.manual ?? 0, color: 'var(--muted)' },
          ]}
        />
      </div>
      <div className="dev-panel">
        <strong>ז'אנרים מובילים</strong>
        <Bars rows={s.genres} />
      </div>
      <div className="dev-panel">
        <strong>מכשירים</strong>
        <Split
          parts={[
            { label: 'Android', value: s.platforms.android ?? 0, color: 'var(--accent-2)' },
            { label: 'iPhone', value: s.platforms.iphone ?? 0, color: 'var(--idea)' },
            { label: 'מחשב', value: s.platforms.desktop ?? 0, color: 'var(--muted)' },
            { label: 'אחר', value: s.platforms.other ?? 0, color: 'var(--line)' },
          ]}
        />
        <div className="dev-legend">הותקנו כאפליקציה: {num(s.installed)}</div>
      </div>
      <p className="dev-foot">המשתמש שלך לא נספר בסטטיסטיקות.</p>
    </>
  )
}

function UsersTab({ since }: { since: number }) {
  const { data, error } = useAdmin<UserRow[]>(`users?since=${since}`)
  if (error) return <p className="dev-error">{error}</p>
  if (!data) return <p className="dev-empty">טוען…</p>
  if (!data.length) return <p className="dev-empty">אין משתמשים בתקופה הזו</p>
  return (
    <>
      {data.map((u) => (
        <div className={`dev-user ${u.me ? 'me' : ''}`} key={u.id + u.first}>
          <div className="dev-row">
            <span className="dev-uid" dir="ltr">
              {u.id}
            </span>
            <span className="dev-pills">
              {u.me && <span className="dev-pill me">אתה</span>}
              <span className={`dev-pill ${u.google ? 'g' : ''}`}>{u.google ? 'Google' : 'מקומי'}</span>
              <span className="dev-pill">{PLATFORM_LABELS[u.platform] ?? u.platform}</span>
            </span>
          </div>
          <div className="dev-meta">
            <div>
              כניסה ראשונה<b>{day(u.first)}</b>
            </div>
            <div>
              כניסות<b>{num(u.visits)}</b>
            </div>
            <div>
              אחרונה<b>{when(u.last)}</b>
            </div>
            <div>
              תקליטים<b>{u.records === null ? '–' : num(u.records)}</b>
            </div>
          </div>
          <div className="dev-tags">
            {u.features.length ? (
              u.features.map((f) => (
                <span className="dev-tag" key={f}>
                  {FEATURE_LABELS[f] ?? f}
                </span>
              ))
            ) : (
              <span className="dev-tag">רק צפייה</span>
            )}
          </div>
        </div>
      ))}
      <p className="dev-foot">ממוין לפי כניסה אחרונה. המזהים אקראיים ולא מגלים מי המשתמש.</p>
    </>
  )
}

function InfoTab() {
  const { data, error } = useAdmin<Info>('info')
  const [showLog, setShowLog] = useState(false)
  const [local, setLocal] = useState<number | null>(null)
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setLocal(e.usage ?? null))
      .catch(() => {})
  }, [])
  const built = new Date(__BUILD_TIME__).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
  return (
    <>
      <div className="dev-panel">
        <div className="dev-kv">
          <span>גרסה</span>
          <b>{__APP_VERSION__}</b>
        </div>
        <div className="dev-kv">
          <span>עדכון אחרון</span>
          <b>{built}</b>
        </div>
        <div className="dev-kv">
          <span>בנייה</span>
          <b dir="ltr">{__BUILD_SHA__}</b>
        </div>
      </div>
      <button className="btn wide" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
        {showLog ? 'הסתרת לוג השינויים' : 'לוג שינויים מפורט'}
      </button>
      {showLog && (
        <div className="dev-log">
          {CHANGELOG.map((r) => (
            <div key={r.version}>
              <h4>
                {r.version} <small>· {r.date}</small>
              </h4>
              <ul>
                {r.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <h4 className="dev-sec">אחסון</h4>
      <div className="dev-panel">
        {error && <p className="dev-error">{error}</p>}
        {data && (
          <>
            <div className="dev-kv">
              <span>מסד הנתונים בשרת</span>
              <b>{bytes(data.dbBytes)}</b>
            </div>
            <div className="dev-kv">
              <span>אירועים שמורים</span>
              <b>{num(data.events)}</b>
            </div>
            <div className="dev-kv">
              <span>מכשירים</span>
              <b>{num(data.devices)}</b>
            </div>
            <div className="dev-kv">
              <span>פניות שמורות</span>
              <b>{num(data.messages)}</b>
            </div>
            <div className="dev-kv">
              <span>קובץ ספרייה ממוצע</span>
              <b>{bytes(data.avgLibBytes)}</b>
            </div>
          </>
        )}
        <div className="dev-kv">
          <span>במכשיר הזה (כולל עטיפות שמורות)</span>
          <b>{local === null ? '–' : bytes(local)}</b>
        </div>
      </div>
    </>
  )
}

function InboxTab({ onCount }: { onCount: (n: number) => void }) {
  const { data, error, setData } = useAdmin<Message[]>('messages')
  const [filter, setFilter] = useState<'open' | 'handled' | 'all'>('open')
  const [failed, setFailed] = useState<string | null>(null)
  const open = data?.filter((m) => !m.handled).length ?? 0
  useEffect(() => {
    if (data) onCount(open)
  }, [data, open, onCount])

  if (error) return <p className="dev-error">{error}</p>
  if (!data) return <p className="dev-empty">טוען…</p>

  const toggle = (m: Message) => {
    setData(data.map((x) => (x.id === m.id ? { ...x, handled: !m.handled } : x)))
    adminFetch(`messages/${m.id}`, { method: 'PATCH', body: JSON.stringify({ handled: !m.handled }) }).catch((e: Error) => {
      setFailed(e.message)
      setData(data)
    })
  }
  const remove = (m: Message) => {
    if (!confirm('למחוק את הפנייה לגמרי?')) return
    setData(data.filter((x) => x.id !== m.id))
    adminFetch(`messages/${m.id}`, { method: 'DELETE' }).catch((e: Error) => {
      setFailed(e.message)
      setData(data)
    })
  }
  const list = data.filter((m) => filter === 'all' || (filter === 'handled') === m.handled)
  return (
    <>
      <div className="dev-seg" role="group" aria-label="סינון פניות">
        {(
          [
            ['open', `פתוחות (${open})`],
            ['handled', 'טופלו'],
            ['all', 'הכל'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      {failed && <p className="dev-error">{failed}</p>}
      {list.length === 0 && <p className="dev-empty">{filter === 'open' ? 'אין פניות פתוחות' : 'אין פניות כאן'}</p>}
      {list.map((m) => (
        <div className={`dev-msg ${m.handled ? 'handled' : ''}`} key={m.id}>
          <div className="dev-row">
            <span className={`dev-type t-${m.type ?? 'none'}`}>{m.type ? CONTACT_TYPES[m.type] : 'בלי סוג'}</span>
            <span className="dev-who">{when(m.ts)}</span>
          </div>
          <div className="dev-who">
            <span dir="auto">{m.name || 'בלי שם'}</span> · <span dir="ltr">{m.email || 'בלי מייל'}</span>
          </div>
          {m.body && (
            <p dir="auto" className="dev-body">
              {m.body}
            </p>
          )}
          {m.tech && <div className="contact-tech">{m.tech}</div>}
          <div className="dev-acts">
            <button className={m.handled ? '' : 'ok'} onClick={() => toggle(m)}>
              {m.handled ? 'החזרה לפתוחות' : '✓ סימון כטופל'}
            </button>
            {m.email && (
              <a
                href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('תשובה לפנייה שלך · ספריית התקליטים שלי')}`}
              >
                תשובה במייל
              </a>
            )}
            <button onClick={() => remove(m)}>מחיקה</button>
          </div>
        </div>
      ))}
    </>
  )
}

export function DevPage({ openCount, onCount, onClose }: { openCount: number; onCount: (n: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('stats')
  const [range, setRange] = useState<Range>('7')
  // fixed for the whole visit to a range, so switching tabs does not refetch with a new time
  const [since, setSince] = useState(() => sinceOf('7'))
  const pickRange = (r: Range) => {
    setRange(r)
    setSince(sinceOf(r))
  }
  const tabs: [Tab, string][] = [
    ['stats', 'סטטיסטיקות'],
    ['users', 'משתמשים'],
    ['info', 'מידע'],
    ['inbox', 'פניות'],
  ]
  return (
    <Modal title="עמוד מפתח" onClose={onClose} wide>
      <div className="dev">
        <div className="dev-tabs" role="tablist">
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {l}
              {k === 'inbox' && openCount > 0 && <span className="menu-badge">{openCount}</span>}
            </button>
          ))}
        </div>
        {(tab === 'stats' || tab === 'users') && (
          <div className="dev-seg" role="group" aria-label="תקופה">
            {RANGES.map(([k, l]) => (
              <button key={k} aria-pressed={range === k} onClick={() => pickRange(k)}>
                {l}
              </button>
            ))}
          </div>
        )}
        {tab === 'stats' && <StatsTab since={since} />}
        {tab === 'users' && <UsersTab since={since} />}
        {tab === 'info' && <InfoTab />}
        {tab === 'inbox' && <InboxTab onCount={onCount} />}
      </div>
    </Modal>
  )
}
