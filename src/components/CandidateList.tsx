import type { Candidate } from '../lib/lookup'
import { Cover } from './Cover'

/** Vinyl is the default; any other format (CD, cassette…) is worth pointing out. */
const notVinyl = (f?: string) => (f && !/vinyl|lp|12"|7"/i.test(f) ? f : undefined)

export function CandidateList({ items, onPick, busyId }: { items: Candidate[]; onPick: (c: Candidate) => void; busyId?: string | null }) {
  return (
    <ul className="candidates">
      {items.map((c) => (
        <li key={c.source + c.id}>
          <button className="candidate" onClick={() => onPick(c)} disabled={!!busyId}>
            <Cover url={c.thumb} artist={c.artist} title={c.title} size="sm" />
            <div className="candidate-text">
              <strong dir="auto" title={c.title}>
                {c.title}
              </strong>
              <span dir="auto">{c.artist}</span>
              <small dir="ltr">{[c.year, notVinyl(c.format), c.country, c.label, c.catalogNumber].filter(Boolean).join(' · ')}</small>
            </div>
            {busyId === c.source + c.id && <span className="spinner" />}
          </button>
        </li>
      ))}
    </ul>
  )
}
