import type { Grade } from '../types'

/*
 * The Goldmine grading scale, which Discogs and most collectors use.
 * Short Hebrew explanations for the legend on the record page.
 */
export const GRADES: { grade: Grade; name: string; media: string; sleeve: string }[] = [
  { grade: 'M', name: 'Mint', media: 'חדש לגמרי, כאילו לא נוגן אף פעם', sleeve: 'מושלמת, לרוב עוד בניילון' },
  { grade: 'NM', name: 'Near Mint', media: 'כמעט חדש, בלי סימנים שרואים או שומעים', sleeve: 'כמעט בלי סימני שימוש' },
  { grade: 'VG+', name: 'Very Good Plus', media: 'סימני שימוש קלים, נשמע מצוין', sleeve: 'שחיקה קלה בפינות או בשוליים' },
  { grade: 'VG', name: 'Very Good', media: 'שריטות קלות, קצת רעש רקע בשקט בין שירים', sleeve: 'עיגול שחיקה, קרע קטן או כיתוב' },
  { grade: 'G+', name: 'Good Plus', media: 'שחוק, רעש ברור לאורך כל הדרך, אבל מתנגן עד הסוף', sleeve: 'שחיקה חזקה, קרעים, מדבקות' },
  { grade: 'G', name: 'Good', media: 'שחוק מאוד, רעש חזק, עדיין מתנגן', sleeve: 'פגומה מאוד, אבל שלמה' },
  { grade: 'F', name: 'Fair', media: 'פגום, עלול לקפוץ', sleeve: 'הרוסה בחלקה' },
  { grade: 'P', name: 'Poor', media: 'כמעט לא ניתן לנגן', sleeve: 'הרוסה או חסרה' },
]

export const isGrade = (s: unknown): s is Grade => GRADES.some((g) => g.grade === s)

/** "Very Good Plus (VG+)", "Near Mint (NM or M-)", "VG+" -> the grade; anything else -> undefined */
export function parseGrade(s?: string): Grade | undefined {
  if (!s) return undefined
  const inParens = s.match(/\(([^)]+)\)\s*$/)?.[1] ?? s
  const code = inParens.trim().split(/\s+/)[0].toUpperCase()
  if (code === 'M-') return 'NM'
  return isGrade(code) ? code : undefined
}
