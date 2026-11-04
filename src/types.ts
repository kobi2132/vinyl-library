export interface Track {
  position: string
  title: string
  length?: string
}

/** Goldmine grade, as Discogs uses it (see lib/grades.ts) */
export type Grade = 'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P'

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
  /** Condition of the record itself and of its sleeve */
  mediaCondition?: Grade
  sleeveCondition?: Grade
  /** Marked by the owner as for sale (the store itself comes later) */
  forSale?: boolean
  /** Imported from a Discogs CSV; cover, genres and tracks still to be fetched */
  enrichPending?: boolean
  addedAt: string
  updatedAt: string
}

/** A record on the wantlist: wanted, not owned yet */
export interface WantItem {
  id: string
  artist: string
  title: string
  year?: number
  label?: string
  catalogNumber?: string
  country?: string
  format?: string
  coverUrl?: string
  discogsId?: number
  addedAt: string
  updatedAt: string
}

export interface LibraryFile {
  version: 1
  updatedAt: string
  records: VinylRecord[]
  /** The wantlist; deletions share the "deleted" map below (ids never repeat) */
  wants?: WantItem[]
  /** id -> ISO time of deletion, so deletions sync between devices */
  deleted?: Record<string, string>
}

export type RecordDraft = Omit<VinylRecord, 'id' | 'addedAt' | 'updatedAt'>
