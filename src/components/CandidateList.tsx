import type { Candidate } from '../lib/lookup'
import { Cover } from './Cover'

export function CandidateList({ items, onPick, busyId }: { items: Candidate[]; onPick: (c: Candidate) => void; busyId?: string | null }) {
  return (
    <ul className="candidates">
      {items.map((c) => (
        <li key={c.source + c.id}>
          <button className="candidate" onClick={() => onPick(c)} disabled={!!busyId}>
            <Cover url={c.thumb} artist={c.artist} title={c.title} size="sm" />
            <div className="candidate-text">
              <strong>{c.title}</strong>
              <span>{c.artist}</span>
              <small>{[c.year, c.format, c.country, c.label, c.catalogNumber].filter(Boolean).join(' · ')}</small>
            </div>
            <span className={`src-badge src-${c.source}`}>{c.source === 'discogs' ? 'Discogs' : 'MusicBrainz'}</span>
            {busyId === c.source + c.id && <span className="spinner" />}
          </button>
        </li>
      ))}
    </ul>
  )
}
