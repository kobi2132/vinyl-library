// Reads catalogue numbers ("BAN 14154", "CBS 82133", "SHVL 804") from a photo of a
// record's spine or label. Tesseract is loaded only when first needed (a few MB).

import type { Worker } from 'tesseract.js'

let worker: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  worker ??= (async () => {
    const { createWorker } = await import('tesseract.js')
    const w = await createWorker('eng', 1, {
      // served by the app itself (copied by scripts/copy-ocr.mjs), not from a CDN
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr',
      langPath: '/ocr',
    })
    await w.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -./',
    })
    return w
  })().catch((e) => {
    worker = null
    throw e
  })
  return worker
}

/** Start downloading the reader in the background so the first photo is quicker. */
export const warmUpOcr = () => void getWorker().catch(() => {})

/** Pick the strings that look like catalogue numbers, best first. */
export function extractCatnos(text: string): string[] {
  const out: string[] = []
  const add = (s: string) => {
    const v = s.trim().replace(/\s+/g, ' ').replace(/[-.]$/, '')
    if (v.length >= 4 && !out.includes(v)) out.push(v)
  }
  const upper = text.toUpperCase()
  // letters then digits, optionally a short suffix: BAN 14154, CBS-82133, SHVL.804, 2C 068-12345
  const re = /\b(?:\d[A-Z])?[A-Z]{1,6}[ .-]?\d{2,7}(?:[ .-]?[A-Z0-9]{1,4})?\b/g
  for (const m of upper.matchAll(re)) if (/\d/.test(m[0]) && /[A-Z]/.test(m[0])) add(m[0])
  // digits-only codes like 6.24019 or 2383 123, but not barcodes
  for (const m of upper.matchAll(/\b\d{3,7}(?:[ .-]\d{2,6})?\b/g)) {
    const digits = m[0].replace(/\D/g, '')
    // skip the number part of a code already found ("14154" from "BAN 14154")
    if (digits.length >= 4 && digits.length <= 10 && !out.some((o) => o.includes(m[0]))) add(m[0])
  }
  return out.slice(0, 5)
}

/**
 * Enlarge and turn to black text on white with an adaptive (local) threshold, so small
 * print survives uneven light and coloured labels. With `lightText`, light print on a
 * dark label is what gets turned black.
 */
function prepare(src: HTMLCanvasElement, lightText: boolean): HTMLCanvasElement {
  const scale = src.width < 1400 ? 2 : 1
  const W = src.width * scale
  const H = src.height * scale
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, W, H)
  const img = ctx.getImageData(0, 0, W, H)
  const px = img.data
  const gray = new Float64Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const g = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0
    gray[i] = lightText ? 255 - g : g
  }
  // integral image for fast local means (Bradley-Roth threshold)
  const integral = new Float64Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    let row = 0
    for (let x = 0; x < W; x++) {
      row += gray[y * W + x]
      integral[(y + 1) * (W + 1) + x + 1] = integral[y * (W + 1) + x + 1] + row
    }
  }
  const r = Math.max(8, Math.round(Math.min(W, H) / 10))
  const T = 0.15
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(H, y + r + 1)
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(W, x + r + 1)
      const area = (x1 - x0) * (y1 - y0)
      const sum = integral[y1 * (W + 1) + x1] - integral[y0 * (W + 1) + x1] - integral[y1 * (W + 1) + x0] + integral[y0 * (W + 1) + x0]
      const i = y * W + x
      const v = gray[i] * area < sum * (1 - T) ? 0 : 255
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

export async function readCatnos(frame: HTMLCanvasElement): Promise<{ codes: string[]; text: string }> {
  const w = await getWorker()
  let text = ''
  // dark print first; then light print on a dark label
  for (const invert of [false, true]) {
    const { data } = await w.recognize(prepare(frame, invert))
    text = data.text
    const codes = extractCatnos(text)
    if (codes.length) return { codes, text }
  }
  return { codes: [], text }
}
