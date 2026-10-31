import type { LibraryFile, VinylRecord } from '../types'

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export function exportJson(lib: LibraryFile) {
  download(`vinyl-library-${stamp()}.json`, new Blob([JSON.stringify(lib, null, 2)], { type: 'application/json' }))
}

/** Real .xlsx with a right-to-left sheet, frozen header row and sensible column widths. */
export async function exportExcel(records: VinylRecord[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const head = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#F2A65A' })
  const text = (v?: string) => ({ value: v ?? '', type: String })
  const columns = [
    { header: head('אמן'), cell: (r: VinylRecord) => text(r.artist), width: 26 },
    { header: head('אלבום'), cell: (r: VinylRecord) => text(r.title), width: 32 },
    { header: head('שנה'), cell: (r: VinylRecord) => (r.year ? { value: r.year, type: Number } : text('')), width: 8 },
    { header: head("ז'אנר"), cell: (r: VinylRecord) => text(r.genres.join(', ')), width: 22 },
    { header: head('לייבל'), cell: (r: VinylRecord) => text(r.label), width: 20 },
    { header: head('מספר קטלוגי'), cell: (r: VinylRecord) => text(r.catalogNumber), width: 16 },
    { header: head('פורמט'), cell: (r: VinylRecord) => text(r.format), width: 14 },
    { header: head('מדינה'), cell: (r: VinylRecord) => text(r.country), width: 9 },
    { header: head('ברקוד'), cell: (r: VinylRecord) => text(r.barcode), width: 16 },
    { header: head('מספר שירים'), cell: (r: VinylRecord) => (r.tracks?.length ? { value: r.tracks.length, type: Number } : text('')), width: 11 },
    { header: head('הערות'), cell: (r: VinylRecord) => text(r.notes), width: 30 },
    { header: head('תאריך הוספה'), cell: (r: VinylRecord) => text(new Date(r.addedAt).toLocaleDateString('he-IL')), width: 13 },
  ]
  const blob = await writeXlsxFile(records, {
    columns,
    sheet: 'תקליטים',
    rightToLeft: true,
    stickyRowsCount: 1,
  } as never).toBlob()
  download(`vinyl-library-${stamp()}.xlsx`, blob)
}
