export type OpenMode = 'side' | 'tab' | 'share'
export type AutoWin = 'nofocus' | 'tab' | 'minimized' | 'focused'

export interface PubSettings {
  mode: OpenMode
  pause: number
  dayCap: number
  appendUrl: boolean
  sound: boolean
  clearAfter: 'ask' | 'always' | 'never'
  autoMode: boolean
  autoTest: boolean
  autoClose: boolean
  autoWin: AutoWin
  retries: number
  retryEvery: number
  sysNotify: boolean
}

export interface Group {
  id: string
  name: string
  nameFixed: boolean
  url: string
  tags: string[]
  notes: string
  active: boolean
  approval: boolean
  lastShared: number | null
  created: number
}

export type ItemStatus = 'pending' | 'done' | 'skipped'
export type Review = 'awaiting' | 'approved' | 'rejected'

export interface HistoryItem {
  gid: string
  name: string
  url: string
  notes: string
  status: ItemStatus
  at: number | null
  review?: Review
  rat?: number | null
  error?: string
  fbMsg?: string
  inflight?: number
  verify?: { at: number; found: boolean }
}

export interface HistoryEntry {
  id: string
  date: number
  url: string
  text: string
  mediaCount: number
  appendUrl: boolean
  items: HistoryItem[]
  ack: boolean
}

export interface Template { id: string; name: string; text: string }

export interface MediaItem {
  id: string
  file: Blob
  url: string
  type: 'image' | 'video' | 'audio'
  name: string
  order: number
  busy?: string | null
}
