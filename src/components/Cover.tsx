import { useState } from 'react'

const HUES = [12, 28, 45, 160, 195, 220, 265, 330]

function hueFor(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return HUES[Math.abs(h) % HUES.length]
}

/** Album cover, or a drawn vinyl label when there is no image. */
export function Cover({ url, artist, title, size = 'md' }: { url?: string; artist: string; title: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <img
        className={`cover cover-${size}`}
        src={url}
        alt={`${artist} – ${title}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div className={`cover cover-${size} cover-blank`} aria-label={`${artist} – ${title}`}>
      <div className="blank-disc">
        <div className="blank-label" style={{ background: `hsl(${hueFor(artist + title)} 55% 48%)` }}>
          <span>{artist}</span>
        </div>
      </div>
    </div>
  )
}
