import type { Candidate } from '../lib/musicbrainz'
import { Cover } from './Cover'

export function CandidateList({ items, onPick, busyId }: { items: Candidate[]; onPick: (c: Candidate) => void; busyId?: string | null }) {
  return (
    <ul className="candidates">
      {items.map((c) => (
        <li key={c.mbid}>
          <button className="candidate" onClick={() => onPick(c)} disabled={!!busyId}>
            <Cover url={c.thumb} artist={c.artist} title={c.title} size="sm" />
            <div className="candidate-text">
              <strong>{c.title}</strong>
              <span>{c.artist}</span>
              <small>{[c.year, c.format, c.country, c.label, c.catalogNumber].filter(Boolean).join(' · ')}</small>
            </div>
            {busyId === c.mbid && <span className="spinner" />}
          </button>
        </li>
      ))}
    </ul>
  )
}
