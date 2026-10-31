import { createPortal } from 'react-dom'
import type { VinylRecord } from '../types'

/** Print-only catalogue of the records. Hidden on screen; the browser's "Save as PDF" turns it into a PDF. */
export function PrintSheet({ records, subtitle }: { records: VinylRecord[]; subtitle: string }) {
  return createPortal(
    <div className="print-sheet" dir="rtl">
      <header>
        <h1>ספריית התקליטים שלי</h1>
        <p>
          {records.length} תקליטים · {subtitle} · {new Date().toLocaleDateString('he-IL')}
        </p>
      </header>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>אמן</th>
            <th>אלבום</th>
            <th>שנה</th>
            <th>ז'אנר</th>
            <th>לייבל</th>
            <th>מס' קטלוגי</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td className="p-cover">{r.coverUrl && <img src={r.coverUrl.replace('front-500', 'front-250')} alt="" />}</td>
              <td dir="auto">{r.artist}</td>
              <td dir="auto">
                <strong>{r.title}</strong>
              </td>
              <td>{r.year ?? ''}</td>
              <td dir="auto">{r.genres.join(', ')}</td>
              <td dir="auto">{r.label ?? ''}</td>
              <td dir="ltr">{r.catalogNumber ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    document.body,
  )
}
