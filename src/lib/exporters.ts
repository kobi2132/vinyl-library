import type { LibraryFile } from '../types'

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export function exportJson(lib: LibraryFile) {
  download(`vinyl-library-${stamp()}.json`, JSON.stringify(lib, null, 2), 'application/json')
}

export function exportCsv(lib: LibraryFile) {
  const cols = ['artist', 'title', 'year', 'genres', 'label', 'catalogNumber', 'format', 'country', 'barcode', 'notes', 'addedAt'] as const
  const heads = ['אמן', 'אלבום', 'שנה', "ז'אנר", 'לייבל', 'מספר קטלוגי', 'פורמט', 'מדינה', 'ברקוד', 'הערות', 'תאריך הוספה']
  const cell = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = lib.records.map((r) => cols.map((c) => cell(r[c])).join(','))
  // BOM so Excel opens Hebrew correctly
  download(`vinyl-library-${stamp()}.csv`, '﻿' + [heads.join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8')
}
