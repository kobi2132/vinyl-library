export interface Track {
  position: string
  title: string
  length?: string
}

export interface VinylRecord {
  id: string
  artist: string
  title: string
  year?: number
  genres: string[]
  label?: string
  catalogNumber?: string
  barcode?: string
  country?: string
  format?: string
  coverUrl?: string
  tracks?: Track[]
  notes?: string
  mbid?: string
  discogsId?: number
  addedAt: string
  updatedAt: string
}

export interface LibraryFile {
  version: 1
  updatedAt: string
  records: VinylRecord[]
  /** id -> ISO time of deletion, so deletions sync between devices */
  deleted?: Record<string, string>
}

export type RecordDraft = Omit<VinylRecord, 'id' | 'addedAt' | 'updatedAt'>
