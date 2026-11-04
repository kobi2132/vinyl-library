import { useMemo, useState } from 'react'
import type { VinylRecord, WantItem } from '../types'
import { dgArtistReleases, type ArtistRelease } from '../lib/discogs'
import { useAsync } from '../lib/useAsync'
import { Modal } from './Modal'
import { Cover } from './Cover'
import { HeartIcon } from './Icons'

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** "What am I missing": the artist's records on Discogs, marked owned / on the wantlist / missing. */
export function ArtistPage({
  artistId,
  name,
  records,
  wants,
  onAddWant,
  onOpenRecord,
  onClose,
}: {
  artistId: number
  name: string
  records: VinylRecord[]
  wants: WantItem[]
  onAddWant: (r: ArtistRelease) => void
  onOpenRecord: (id: string) => void
  onClose: () => void
}) {
  const res = useAsync(`a${artistId}`, () => dgArtistReleases(artistId))
  const [onlyMissing, setOnlyMissing] = useState(false)

  const rows = useMemo(() => {
    if (res.state !== 'done') return []
    const mine = records.filter((r) => norm(r.artist).includes(norm(name)) || norm(name).includes(norm(r.artist)))
    // the same title can come back as an album and as a single; show each title once
    const seen = new Set<string>()
    return res.value
      .filter((a) => {
        const k = norm(a.title)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .map((a) => ({
        a,
        owned: mine.find((r) => r.discogsId === a.releaseId || norm(r.title) === norm(a.title)),
        wanted: wants.some((w) => w.discogsId === a.releaseId || (norm(w.title) === norm(a.title) && norm(w.artist) === norm(name))),
      }))
  }, [res, records, wants, name])

  const owned = rows.filter((r) => r.owned).length
  const shown = onlyMissing ? rows.filter((r) => !r.owned) : rows

  return (
    <Modal title={name} onClose={onClose} wide>
      <h2 className="artist-name" dir="auto">
        {name}
      </h2>
      {res.state === 'loading' && (
        <div className="center-msg">
          <span className="spinner big" />
          <p>טוען את כל ההוצאות מ-Discogs…</p>
        </div>
      )}
      {res.state === 'error' && <p className="notice error">לא הצלחתי לטעון את רשימת ההוצאות כרגע.</p>}
      {res.state === 'done' && (
        <>
          <div className="artist-progress">
            <div className="bar">
              <span style={{ width: `${rows.length ? (owned / rows.length) * 100 : 0}%` }} />
            </div>
            <p>
              יש לכם <strong>{owned}</strong> מתוך <strong>{rows.length}</strong> ההוצאות שלו ב-Discogs
            </p>
          </div>
          <div className="seg small-seg" role="group">
            <button className={!onlyMissing ? 'on' : ''} onClick={() => setOnlyMissing(false)}>
              הכל ({rows.length})
            </button>
            <button className={onlyMissing ? 'on' : ''} onClick={() => setOnlyMissing(true)}>
              מה חסר לי ({rows.length - owned})
            </button>
          </div>
          <ul className="disco">
            {shown.map(({ a, owned, wanted }) => (
              <li key={a.releaseId} className={owned ? 'owned' : ''}>
                <Cover url={owned?.coverUrl || a.thumb} artist={name} title={a.title} size="sm" />
                <div className="disco-text">
                  <strong dir="auto">{a.title}</strong>
                  <small dir="ltr">{[a.year, a.format].filter(Boolean).join(' · ')}</small>
                </div>
                {owned ? (
                  <button className="have-tag" onClick={() => onOpenRecord(owned.id)}>
                    ✓ בספרייה
                  </button>
                ) : wanted ? (
                  <span className="want-tag on">
                    <HeartIcon size={14} /> ברשימה
                  </span>
                ) : (
                  <button className="want-tag" onClick={() => onAddWant(a)}>
                    <HeartIcon size={14} /> למשאלות
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="credit-line">הרשימה מגיעה מ-Discogs</p>
        </>
      )}
    </Modal>
  )
}
