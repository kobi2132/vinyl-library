import { useState } from 'react'
import type { GoogleUser } from '../lib/google'
import { CONTACT_TYPES, sendContact, techLine, track, type ContactType } from '../lib/telemetry'
import { Modal } from './Modal'

export function ContactPage({ user, onClose }: { user: GoogleUser | null; onClose: () => void }) {
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [type, setType] = useState<ContactType | undefined>(undefined)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const tech = techLine(Boolean(user))

  // nothing is required, but an empty form has nothing to send
  const empty = !name.trim() && !email.trim() && !type && !body.trim()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (empty || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendContact({ type, name, email, body, tech })
      track('contact')
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent)
    return (
      <Modal title="צור קשר" onClose={onClose}>
        <div className="contact-done">
          <div className="contact-check" aria-hidden="true">
            ✓
          </div>
          <h3>תודה, הפנייה התקבלה</h3>
          <p>{email.trim() ? 'אחזור אליך במייל בהקדם.' : 'תודה שלקחת את הזמן לכתוב.'}</p>
          <button className="btn primary" onClick={onClose}>
            חזרה לספרייה
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal title="צור קשר" onClose={onClose}>
      <form className="contact-form" onSubmit={submit}>
        <p className="contact-lead">יש תקלה, רעיון או סתם מחשבה? אשמח לשמוע. אף שדה לא חובה.</p>
        <label htmlFor="c-name">
          שם
          <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
        </label>
        <label htmlFor="c-email">
          מייל
          <input
            id="c-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            autoComplete="email"
          />
          <span className="contact-hint">לא חובה. אם תשאיר מייל, אוכל לחזור אליך.</span>
        </label>
        <div className="contact-field" role="group" aria-labelledby="c-type">
          <span id="c-type">סוג הפנייה</span>
          <div className="contact-types">
            {(Object.entries(CONTACT_TYPES) as [ContactType, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`chip ${type === k ? 'on' : ''}`}
                aria-pressed={type === k}
                onClick={() => setType(type === k ? undefined : k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="c-body">
          תוכן הפנייה
          <textarea id="c-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} placeholder="מה תרצה לספר?" />
        </label>
        <div className="contact-tech">יצורף לפנייה: {tech}</div>
        {error && (
          <div className="contact-error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary wide" type="submit" disabled={empty || busy}>
          {busy ? 'שולח…' : 'שליחה'}
        </button>
      </form>
    </Modal>
  )
}
