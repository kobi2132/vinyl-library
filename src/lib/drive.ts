import { DRIVE_FILE_NAME } from '../config'
import type { LibraryFile } from '../types'
import { AuthExpiredError } from './google'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

async function call(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  })
  if (res.status === 401) throw new AuthExpiredError()
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`שגיאת דרייב (${res.status}) ${text.slice(0, 200)}`)
  }
  return res
}

export async function findLibraryFile(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`)
  const res = await call(
    token,
    `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
  )
  const j = (await res.json()) as { files: { id: string }[] }
  return j.files[0]?.id ?? null
}

export async function readLibrary(token: string, fileId: string): Promise<LibraryFile> {
  const res = await call(token, `${API}/files/${fileId}?alt=media`)
  return (await res.json()) as LibraryFile
}

export async function createLibrary(token: string, data: LibraryFile): Promise<string> {
  const boundary = 'vl' + Math.random().toString(36).slice(2)
  const meta = { name: DRIVE_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`
  const res = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  const j = (await res.json()) as { id: string }
  return j.id
}

export async function updateLibrary(token: string, fileId: string, data: LibraryFile) {
  await call(token, `${UPLOAD}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
