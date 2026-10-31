import { useEffect, useRef, useState } from 'react'

const FORMATS = ['ean_13', 'upc_a', 'ean_8', 'upc_e']

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (FORMATS.some((f) => supported.includes(f))) return new Native({ formats: FORMATS })
    } catch {
      /* fall through to the WebAssembly reader */
    }
  }
  const { BarcodeDetector } = await import('barcode-detector/ponyfill')
  return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector
}

/** Camera barcode scanner. Calls onCode once with the first valid barcode. */
export function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    let raf = 0
    let lastRun = 0
    const hits = new Map<string, number>()

    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('הדפדפן לא תומך במצלמה')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (stopped) return
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const detector = await makeDetector()
        setReady(true)
        const tick = async (t: number) => {
          if (stopped) return
          if (t - lastRun > 200 && v.readyState >= 2) {
            lastRun = t
            try {
              const found = await detector.detect(v)
              for (const b of found) {
                const code = b.rawValue.replace(/\D/g, '')
                if (code.length < 8) continue
                // require two matching reads to avoid misreads
                const n = (hits.get(code) ?? 0) + 1
                hits.set(code, n)
                if (n >= 2) {
                  stopped = true
                  navigator.vibrate?.(80)
                  onCode(code)
                  return
                }
              }
            } catch {
              /* a frame failed to decode, keep going */
            }
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (e) {
        const err = e as DOMException
        setError(
          err.name === 'NotAllowedError'
            ? 'אין הרשאה למצלמה. אפשר לאשר אותה בהגדרות הדפדפן, או להקליד את הברקוד למטה.'
            : err.name === 'NotFoundError'
              ? 'לא נמצאה מצלמה במכשיר. אפשר להקליד את הברקוד למטה.'
              : `לא הצלחתי להפעיל את המצלמה: ${err.message}`,
        )
      }
    })()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode])

  return (
    <div className="scanner">
      {!error && (
        <div className="viewfinder">
          <video ref={video} playsInline muted />
          <div className="aim" />
          {!ready && <div className="viewfinder-msg">מפעיל מצלמה…</div>}
        </div>
      )}
      {error && <p className="notice">{error}</p>}
      <p className="hint">כוון את המצלמה לברקוד שעל גב העטיפה</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          const c = manual.replace(/\D/g, '')
          if (c.length >= 8) onCode(c)
        }}
      >
        <input
          inputMode="numeric"
          placeholder="או הקלד ברקוד"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          dir="ltr"
        />
        <button className="btn" type="submit" disabled={manual.replace(/\D/g, '').length < 8}>
          חפש
        </button>
      </form>
    </div>
  )
}
