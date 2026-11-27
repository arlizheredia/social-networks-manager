/** Reglas de negocio del publicador: destinos, límites de seguridad, fallos e informes. */
import { getPub, mutateGroups, mutateHistory, SAFE, setPub, type PublisherState } from './store'
import { groupKey, parseFbUrl, contentIds } from './fb'
import type { Group, HistoryEntry, HistoryItem } from './types'

/* ---------- Destinos ---------- */
export const isRecent = (g: Group, now = Date.now()) => !!g.lastShared && now - g.lastShared < SAFE.RECENT_H * 3600e3
export const availAt = (g: Group) => (g.lastShared ?? 0) + SAFE.RECENT_H * 3600e3
export const activeGroups = (s: PublisherState = getPub()) => s.groups.filter((g) => g.active)

/** Calcula el conjunto de destinos seleccionados aplicando las reglas (nuevos activos seleccionados, recientes excluidos). */
export function computeSel(s: PublisherState): Set<string> {
  const act = activeGroups(s)
  const ids = new Set(act.map((g) => g.id))
  let sel: Set<string>
  if (s.sel) {
    sel = new Set(s.sel.ids.filter((i) => ids.has(i)))
    const known = new Set(s.sel.known)
    act.forEach((g) => { if (!known.has(g.id)) sel.add(g.id) })
  } else sel = new Set(act.map((g) => g.id))
  act.forEach((g) => { if (isRecent(g)) sel.delete(g.id) })
  return sel
}
export function saveSel(sel: Set<string>) {
  setPub((s) => ({ sel: { ids: [...sel], known: activeGroups(s).map((g) => g.id) } }))
}
export const selectedGroups = (s: PublisherState = getPub()) => {
  const sel = computeSel(s)
  return activeGroups(s).filter((g) => sel.has(g.id))
}
export const allTags = (list: Group[]) => [...new Set(list.flatMap((g) => g.tags))].sort((a, b) => a.localeCompare(b, 'es'))

/* ---------- Límites de seguridad ---------- */
export function doneTimes(history: HistoryEntry[]) {
  return history.flatMap((h) => h.items.filter((i) => i.status === 'done' && i.at).map((i) => i.at!)).sort((a, b) => a - b)
}
export function usage(s: PublisherState = getPub()) {
  const now = Date.now(), t = doneTimes(s.history)
  return { day: t.filter((x) => x > now - 864e5), last: t[t.length - 1] || 0 }
}
export type Gate = { ok: true } | { ok: false; reason: 'lock' | 'day' | 'pause'; until: number; total?: number }
export function gate(s: PublisherState = getPub()): Gate {
  const now = Date.now(), st = s.settings, u = usage(s)
  if (s.lock && s.lock > now) return { ok: false, reason: 'lock', until: s.lock }
  if (u.day.length >= st.dayCap) return { ok: false, reason: 'day', until: u.day[u.day.length - st.dayCap] + 864e5 }
  if (u.last && now < u.last + st.pause * 1000) return { ok: false, reason: 'pause', until: u.last + st.pause * 1000, total: st.pause }
  return { ok: true }
}

export const hhmm = (ts: number) =>
  new Date(ts).toLocaleString('es', { weekday: new Date(ts).toDateString() === new Date().toDateString() ? undefined : 'short', hour: '2-digit', minute: '2-digit' })
export const hm = (ts: number) => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

export const PACES = [10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900]
export const paceLabel = (v: number) => (v < 60 ? `${v} s` : v % 60 ? `${Math.floor(v / 60)} min ${v % 60} s` : `${v / 60} min`)

/* ---------- Fallos ---------- */
const NOT_FAIL = /^(Descartado|Marcado como no publicado)|24 h/
export const failedItems = (h: HistoryEntry) => h.items.filter((i) => i.status === 'skipped' && i.error && !NOT_FAIL.test(i.error))
export const cleanErr = (e?: string) => String(e || '').replace(/\s*\[[a-z]+\]\s*$/, '')
export function reasonOf(e?: string) {
  const s = String(e || '')
  if (/miembro/i.test(s)) return 'no somos miembros del grupo'
  if (/no permite publicar|Escribe algo|no puedes publicar|solo los administradores|can'?t post|only admins|desactivadas/i.test(s)) return 'el grupo no permite publicar'
  if (/24 h/i.test(s)) return 'ya se había publicado en las últimas 24 horas'
  if (/no publicado/i.test(s)) return 'finalmente no se publicó'
  if (/sesi[oó]n/i.test(s)) return 'no había sesión iniciada en Facebook'
  return 'incidencia técnica al publicar'
}
export const RX_PEND = /(pendiente|pending|se est[aá] revisando|being reviewed|aprob(ar|aci[oó]n)|approv(e|al))/i

/** Corrige un registro «Publicado» que en realidad no se publicó: recalcula el último uso del grupo. */
export function recomputeShared(gid: string, url: string) {
  const { history } = getPub()
  mutateGroups((groups) => {
    const g = groups.find((x) => x.id === gid) || groups.find((x) => groupKey(x.url) === groupKey(url))
    if (!g) return
    const ts = history.flatMap((h) => h.items.filter((i) => i.status === 'done' && i.at && (i.gid === g.id || groupKey(i.url) === groupKey(g.url))).map((i) => i.at!))
    g.lastShared = ts.length ? Math.max(...ts) : null
  })
}
export function unpublishItem(hid: string, idx: number) {
  let it: HistoryItem | undefined
  mutateHistory((hs) => {
    it = hs.find((h) => h.id === hid)?.items[idx]
    if (it) Object.assign(it, { status: 'skipped', error: 'Marcado como no publicado', review: undefined, verify: undefined })
  })
  if (it) recomputeShared(it.gid, it.url)
}
export function unlockGroup(gid: string) {
  const g = getPub().groups.find((x) => x.id === gid)
  if (!g) return
  mutateHistory((hs) => hs.forEach((h) => h.items.forEach((i) => {
    if (i.status === 'done' && i.at && i.at > Date.now() - SAFE.RECENT_H * 3600e3 && (i.gid === g.id || groupKey(i.url) === groupKey(g.url)))
      Object.assign(i, { status: 'skipped', error: 'Marcado como no publicado', review: undefined, verify: undefined })
  })))
  recomputeShared(g.id, g.url)
  mutateGroups((gs) => { const x = gs.find((y) => y.id === gid); if (x && isRecent(x)) x.lastShared = null })
  const s = getPub()
  const sel = computeSel(s); sel.add(gid); saveSel(sel)
}

/* ---------- Etiquetas de publicaciones ---------- */
export function postLabel(h: Pick<HistoryEntry, 'url' | 'text'>) {
  const k = parseFbUrl(h.url || '').kind || 'Publicación'
  const sents = (h.text || '').replace(/https?:\/\/\S+/g, ' ').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
    .split(/[\n.!?¡¿]+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.replace(/[^\p{L}\p{N}]/gu, '').length >= 4)
  let t = sents.find((x) => !/\{(grupo|fecha|enlace)\}/i.test(x) && !/^(hola|buen[oa]s|saludos|hey)\b/i.test(x)) || ''
  t = t.replace(/^[¡!,.;:\s-]+|[,;:\s-]+$/g, '')
  if (t.length > 80) t = t.slice(0, 80).replace(/\s+\S*$/, '') + '…'
  return t ? `${h.url ? k : 'Publicación'} «${t}»` : h.url ? `${k} ${contentIds(h.url).values().next().value || ''}`.trim() : 'Publicación sin texto'
}

export const entryTitle = (h: HistoryEntry) => h.name?.trim() || (h.text || '').trim().split('\n')[0] || h.url || 'Publicación sin texto'
/** Cómo se cita la publicación en los informes: su nombre (si lo tiene) y el enlace. */
export const entryRef = (h: HistoryEntry) => (h.name?.trim() ? `«${h.name.trim()}»${h.url ? ' · ' + h.url : ''}` : h.url || 'Publicación sin enlace')
export const awaitingItems = (history: HistoryEntry[]) =>
  history.flatMap((h) => h.items.map((i, idx) => ({ h, i, idx })).filter(({ i }) => i.status === 'done' && i.review === 'awaiting'))
