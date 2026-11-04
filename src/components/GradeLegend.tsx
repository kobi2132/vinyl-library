import { useState } from 'react'
import { GRADES } from '../lib/grades'
import { Modal } from './Modal'

/** What each condition grade means, from best to worst. */
export function GradeLegend({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="מה אומר כל סימן?" onClose={onClose}>
      <p className="hint">
        זה הסולם שמשתמשים בו אספנים ו-Discogs. מדרגים בנפרד את התקליט ואת העטיפה. כשמתלבטים, עדיף לבחור את הדרגה הנמוכה יותר.
      </p>
      <ul className="grade-legend">
        {GRADES.map((g) => (
          <li key={g.grade}>
            <span className={`grade grade-${g.grade.replace('+', 'p')}`} dir="ltr">
              {g.grade}
            </span>
            <div>
              <strong dir="ltr">{g.name}</strong>
              <p>
                <b>תקליט:</b> {g.media}
              </p>
              <p>
                <b>עטיפה:</b> {g.sleeve}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** A small "?" that opens the legend. Safe inside a <label>. */
export function GradeHelp() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="help-btn"
        aria-label="מה אומר כל סימן?"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        ?
      </button>
      {open && <GradeLegend onClose={() => setOpen(false)} />}
    </>
  )
}
