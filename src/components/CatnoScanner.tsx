import { useEffect, useRef, useState } from 'react'
import { readCatnos, warmUpOcr } from '../lib/ocr'
import { CameraIcon } from './Icons'

// The strip inside the viewfinder that gets read, as fractions of the viewfinder
const AIM = { x: 0.06, y: 0.33, w: 0.88, h: 0.34 }

/**
 * Catalogue-number search for records without a barcode: photograph the number on the
 * spine or label, check what was read, then search. Typing it works too.
 */
export function CatnoScanner({ onSearch }: { onSearch: (catno: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [reading, setReading] = useState(false)
  const [value, setValue] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    warmUpOcr()
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('הדפדפן לא תומך במצלמה')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (stopped) return
        const v = video.current!
        v.srcObject = stream
        await v.play()
        setReady(true)
      } catch (e) {
        const err = e as DOMException
        setCamError(
          err.name === 'NotAllowedError'
            ? 'אין הרשאה למצלמה. אפשר לאשר אותה בהגדרות הדפדפן, או להקליד את מספר הקטלוג למטה.'
            : err.name === 'NotFoundError'
              ? 'לא נמצאה מצלמה במכשיר. אפשר להקליד את מספר הקטלוג למטה.'
              : `לא הצלחתי להפעיל את המצלמה: ${err.message}`,
        )
      }
    })()
    return () => {
      stopped = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const capture = async () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    // map the on-screen aim strip back to video pixels (the video is shown with object-fit: cover)
    const ew = v.clientWidth
    const eh = v.clientHeight
    const scale = Math.max(ew / v.videoWidth, eh / v.videoHeight)
    const ox = (v.videoWidth * scale - ew) / 2
    const oy = (v.videoHeight * scale - eh) / 2
    const sx = (AIM.x * ew + ox) / scale
    const sy = (AIM.y * eh + oy) / scale
    const sw = (AIM.w * ew) / scale
    const sh = (AIM.h * eh) / scale
    const c = document.createElement('canvas')
    c.width = Math.round(sw)
    c.height = Math.round(sh)
    c.getContext('2d')!.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height)

    setReading(true)
    setNote(null)
    setOptions([])
    try {
      const { codes } = await readCatnos(c)
      if (codes.length) {
        navigator.vibrate?.(60)
        setValue(codes[0])
        setOptions(codes.length > 1 ? codes : [])
        setNote('בדקו שהמספר נקרא נכון, תקנו אם צריך, ולחצו על חיפוש.')
      } else {
        setNote('לא הצלחתי לקרוא מספר. נסו לקרב, להאיר טוב יותר, או להקליד אותו.')
      }
    } catch {
      setNote('קריאת הטקסט לא נטענה. בדקו את החיבור לאינטרנט, או הקלידו את המספר.')
    } finally {
      setReading(false)
    }
  }

  const clean = value.trim()

  return (
    <div className="scanner">
      {!camError && (
        <div className="viewfinder">
          <video ref={video} playsInline muted />
          <div className="aim aim-text" />
          {!ready && <div className="viewfinder-msg">מפעיל מצלמה…</div>}
          {reading && (
            <div className="viewfinder-msg reading">
              <span className="spinner big" />
              קורא…
            </div>
          )}
        </div>
      )}
      {camError && <p className="notice">{camError}</p>}
      {!camError && (
        <>
          <p className="hint">כוונו את המסגרת למספר הקטלוג שעל השדרה או על המדבקה, כשהטקסט אופקי</p>
          <button className="btn primary wide" onClick={capture} disabled={!ready || reading}>
            <CameraIcon size={20} /> צילום וקריאה
          </button>
        </>
      )}
      {note && <p className="hint catno-note">{note}</p>}
      {options.length > 1 && (
        <div className="chips">
          {options.map((o) => (
            <button key={o} className={`chip ${o === value ? 'on' : ''}`} onClick={() => setValue(o)} dir="ltr">
              {o}
            </button>
          ))}
        </div>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (clean.length >= 3) onSearch(clean)
        }}
      >
        <input
          placeholder="מספר קטלוג, למשל BAN 14154"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          dir="ltr"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn" type="submit" disabled={clean.length < 3}>
          חיפוש
        </button>
      </form>
    </div>
  )
}
