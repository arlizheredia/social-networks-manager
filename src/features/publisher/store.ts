import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '@/lib/util'
import { cleanGroupName, groupKey, normGroupUrl, parseFbUrl } from './fb'
import type { Group, HistoryEntry, HistoryItem, PubSettings, Template } from './types'

/** Límites de protección de la cuenta (no se pueden desactivar). */
export const SAFE = { MIN_PAUSE: 10, MAX_PAUSE: 900, MAX_DAY: 1000, RECENT_H: 24, LOCK_H: 24 }

export const DEF_SETTINGS: PubSettings = {
  mode: 'side', pause: 30, dayCap: 500, appendUrl: false, sound: true, clearAfter: 'ask',
  autoMode: false, autoTest: true, autoClose: true, autoWin: 'nofocus', retries: 10, retryEvery: 20, sysNotify: false,
}

export const clamp = (v: unknown, a: number, b: number, d: number) => {
  const n = parseInt(String(v))
  return isNaN(n) ? d : Math.max(a, Math.min(b, n))
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const okId = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : null)
const okTs = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null)
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object'

export function cleanSettings(o: unknown): PubSettings {
  const s = { ...DEF_SETTINGS, ...(isObj(o) ? o : {}) } as Obj
  return {
    mode: (['side', 'tab', 'share'] as const).includes(s.mode as never) ? (s.mode as PubSettings['mode']) : 'side',
    pause: clamp(s.pause, SAFE.MIN_PAUSE, SAFE.MAX_PAUSE, 30),
    dayCap: clamp(s.dayCap, 1, SAFE.MAX_DAY, 500),
    appendUrl: s.appendUrl === true,
    sound: s.sound !== false,
    clearAfter: (['ask', 'always', 'never'] as const).includes(s.clearAfter as never) ? (s.clearAfter as PubSettings['clearAfter']) : 'ask',
    autoMode: s.autoMode === true,
    autoTest: s.autoTest !== false,
    autoClose: s.autoClose !== false,
    autoWin: (['nofocus', 'tab', 'minimized', 'focused'] as const).includes(s.autoWin as never) ? (s.autoWin as PubSettings['autoWin']) : 'nofocus',
    retries: clamp(s.retries, 0, 50, 10),
    retryEvery: clamp(s.retryEvery, 5, 600, 20),
    sysNotify: s.sysNotify === true,
  }
}

export function cleanGroups(list: unknown): Group[] {
  const seen = new Set<string>()
  return (Array.isArray(list) ? list : []).flatMap((g): Group[] => {
    if (!isObj(g)) return []
    const url = normGroupUrl(str(g.url, 300))
    if (!url) return []
    const k = groupKey(url)
    if (seen.has(k)) return []
    seen.add(k)
    const raw = str(g.name, 400), nm = cleanGroupName(raw).slice(0, 140), slug = url.split('/groups/')[1].replace('/', '')
    return [{
      id: okId(g.id) || uid().slice(0, 36), name: nm || slug,
      nameFixed: g.nameFixed === true || (!!raw && nm !== raw.replace(/\s+/g, ' ').trim()) || !nm,
      url, tags: (Array.isArray(g.tags) ? g.tags : []).map((t) => str(t, 40).trim()).filter(Boolean).slice(0, 20),
      notes: str(g.notes, 500), active: g.active !== false, approval: g.approval === true,
      lastShared: okTs(g.lastShared), created: okTs(g.created) || Date.now(),
    }]
  })
}

export function cleanHistory(list: unknown): HistoryEntry[] {
  return (Array.isArray(list) ? list : []).flatMap((h): HistoryEntry[] => {
    if (!isObj(h)) return []
    const items = (Array.isArray(h.items) ? h.items : []).flatMap((i): HistoryItem[] => {
      if (!isObj(i)) return []
      const url = normGroupUrl(str(i.url, 300))
      if (!url) return []
      const status = (['pending', 'done', 'skipped'] as const).includes(i.status as never) ? (i.status as HistoryItem['status']) : 'pending'
      const v = i.verify
      return [{
        gid: okId(i.gid) || '', name: cleanGroupName(str(i.name, 400)).slice(0, 140) || str(i.name, 140), url, notes: str(i.notes, 500), status,
        at: okTs(i.at),
        review: status === 'done' && (['awaiting', 'approved', 'rejected'] as const).includes(i.review as never) ? (i.review as HistoryItem['review']) : undefined,
        rat: okTs(i.rat), error: i.error ? str(i.error, 240) : undefined, fbMsg: i.fbMsg ? str(i.fbMsg, 800) : undefined,
        inflight: status === 'pending' ? okTs(i.inflight) || undefined : undefined,
        verify: isObj(v) && okTs(v.at) ? { at: v.at as number, found: v.found === true } : undefined,
      }]
    })
    if (!items.length) return []
    const u = parseFbUrl(str(h.url, 2000))
    return [{
      id: okId(h.id) || uid().slice(0, 36), date: okTs(h.date) || Date.now(), url: u.url || '', text: str(h.text, 63206),
      mediaCount: clamp(h.mediaCount, 0, 999, 0), appendUrl: h.appendUrl !== false, items, ack: h.ack === true,
    }]
  }).slice(0, 300)
}

export function cleanTemplates(list: unknown): Template[] {
  return (Array.isArray(list) ? list : []).flatMap((t): Template[] =>
    isObj(t) && typeof t.text === 'string' ? [{ id: okId(t.id) || uid().slice(0, 36), name: str(t.name, 80) || 'Plantilla', text: str(t.text, 63206) }] : [],
  )
}

export interface PublisherState {
  groups: Group[]
  history: HistoryEntry[]
  templates: Template[]
  settings: PubSettings
  draft: { url: string; text: string }
  /** Grupos seleccionados como destino y activos conocidos al guardar (los nuevos activos se seleccionan solos). */
  sel: { ids: string[]; known: string[] } | null
  lock: number | null
  lockMsg: string
  /** Id del historial de una publicación a medias. */
  runId: string | null
  report: { author: string; brand: string }
}

const initial: PublisherState = {
  groups: [], history: [], templates: [], settings: DEF_SETTINGS, draft: { url: '', text: '' }, sel: null,
  lock: null, lockMsg: '', runId: null, report: { author: '', brand: '' },
}

/** Importa los datos de Facebook Publisher si existían en este navegador (mismo dominio github.io). */
function legacy(): Partial<PublisherState> {
  const get = (k: string) => { try { const v = localStorage.getItem(k); return v == null ? undefined : JSON.parse(v) } catch { return undefined } }
  const groups = get('fbp.groups')
  if (groups === undefined) return {}
  const d = get('fbp.draft')
  return {
    groups: cleanGroups(groups), history: cleanHistory(get('fbp.history')), templates: cleanTemplates(get('fbp.templates')),
    settings: cleanSettings(get('fbp.settings')), draft: { url: str(d?.url, 2000), text: str(d?.text, 63206) },
    sel: isObj(get('fbp.sel')) ? get('fbp.sel') : null, lock: okTs(get('fbp.lock')), lockMsg: str(get('fbp.lockMsg'), 400),
    report: { author: str(get('fbp.report')?.author, 80), brand: str(get('fbp.report')?.brand, 80) },
  }
}

export const usePublisher = create<PublisherState>()(
  persist(() => ({ ...initial }), {
    name: 'snm.publisher',
    version: 1,
    partialize: (s) => s,
    merge: (persisted, current) => {
      const p = (persisted as Partial<PublisherState> | undefined) ?? legacy()
      return {
        ...current, ...p,
        groups: cleanGroups(p.groups), history: cleanHistory(p.history), templates: cleanTemplates(p.templates),
        settings: cleanSettings(p.settings), lock: okTs(p.lock),
      }
    },
  }),
)

export const setPub = usePublisher.setState
export const getPub = usePublisher.getState

/** Sincroniza cambios hechos en otra pestaña. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === 'snm.publisher') usePublisher.persist.rehydrate() })
}

/* ---------- Mutaciones ---------- */
export const updateSettings = (patch: Partial<PubSettings>) => setPub((s) => ({ settings: cleanSettings({ ...s.settings, ...patch }) }))
export const setLock = (ts: number | null, why = '') => setPub({ lock: ts, lockMsg: ts ? why.slice(0, 400) : '' })

/** Aplica una mutación sobre una copia del historial y la guarda. */
export function mutateHistory(fn: (h: HistoryEntry[]) => void) {
  const h = structuredClone(getPub().history)
  fn(h)
  setPub({ history: h })
}
export function mutateGroups(fn: (g: Group[]) => void) {
  const g = structuredClone(getPub().groups)
  fn(g)
  setPub({ groups: g })
}
