/** Informe diario de difusión y reporte de grupos (texto editable; se exporta a Word o PDF). */
import { getPub } from './store'
import { cleanErr, entryRef, failedItems, reasonOf } from './logic'
import { fmtRelative } from '@/lib/util'
import type { Group, HistoryEntry, HistoryItem } from './types'
import { groupsByTag } from './groups'

export const ymd = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const itemDay = (h: HistoryEntry, i: HistoryItem) => ymd(i.at || h.date)
const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const NUMW = ['Ninguna', 'Una', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez']
const startNum = (n: number) => (n <= 10 ? NUMW[n] : String(n))
const listNames = (a0: string[]) => { const a = [...new Set(a0)].map((n) => `«${n}»`); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] }
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t)
/** Título dentro del informe (sin fecha: la fecha va en su propia línea «Fecha:»). */
export const DIFFUSION_TITLE = 'Informe de difusión en grupos de Facebook'
/** Nombre del archivo exportado, con la fecha: «Informe de difusión en grupos de Facebook-25-11-2026». */
export const diffusionFileName = (d: string) => { const [y, m, dd] = d.split('-'); return `${DIFFUSION_TITLE}-${dd}-${m}-${y}` }
export function longDate(d: string) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
function sharedText(h: HistoryEntry) {
  return String(h.text || '').replace(/\{grupo\}/gi, '(nombre del grupo)').replace(/\{fecha\}/gi, '(fecha)').replace(/\{enlace\}/gi, '(enlace)')
    .replace(/https?:\/\/\S+/g, '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim()
}
const NOT_FAIL = /^(Descartado|Marcado como no publicado)|24 h/

/** Varias difusiones de la misma publicación (misma dirección, p. ej. el mismo reel compartido en varias tandas)
 *  cuentan como una sola publicación: se unen sus grupos y se conserva el nombre y el texto de la primera que los tenga. */
export function mergeSameUrl<T extends { h: HistoryEntry; its: HistoryItem[] }>(E: T[]): T[] {
  const by = new Map<string, T>(), out: T[] = []
  for (const x of E) {
    const k = x.h.url ? x.h.url.replace(/\/+$/, '').toLowerCase() : ''
    const prev = k ? by.get(k) : undefined
    if (!prev) { const c = { ...x, h: { ...x.h }, its: [...x.its] }; if (k) by.set(k, c); out.push(c); continue }
    prev.its.push(...x.its)
    if (!prev.h.name && x.h.name) prev.h.name = x.h.name
    if (!String(prev.h.text || '').trim() && x.h.text) prev.h.text = x.h.text
  }
  return out
}
/** Listado de los grupos en que se compartió (nombre y enlace), sin repetir; indica las veces y si espera aprobación. */
function groupList(items: HistoryItem[]) {
  const by = new Map<string, { name: string; url: string; n: number; aw: number; rej: number }>()
  items.filter((i) => i.status === 'done').forEach((i) => {
    const k = i.gid || i.url || i.name, g = by.get(k) || { name: i.name, url: i.url, n: 0, aw: 0, rej: 0 }
    g.n++; if (i.review === 'awaiting') g.aw++; if (i.review === 'rejected') g.rej++
    by.set(k, g)
  })
  if (!by.size) return []
  const L = [`Listado de grupos en los que se compartió (${by.size})`]
  ;[...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach((g) => {
    const notes = [g.n > 1 ? `${g.n} veces` : '', g.aw ? 'en aprobación' : '', g.rej ? 'rechazada' : ''].filter(Boolean)
    L.push(`- «${g.name}»${notes.length ? ` (${notes.join(', ')})` : ''}: ${g.url}`)
  })
  L.push('')
  return L
}
/** «Grupos en los que se compartió: 5» (grupos distintos; si alguno se repitió, también las veces). */
function groupsLine(its: HistoryItem[]) {
  const done = its.filter((i) => i.status === 'done'), n = new Set(done.map((i) => i.gid || i.name)).size
  return `Grupos en los que se compartió: ${n}${done.length > n ? ` (${done.length} veces en total)` : ''}`
}

/** Publicaciones con actividad en una fecha. */
export const entriesOn = (date: string) => getPub().history.filter((h) => h.items.some((i) => itemDay(h, i) === date))

export function buildDiffusionReport(date: string, ids: string[], meta: { author: string; brand: string }) {
  const E0 = getPub().history.filter((h) => ids.includes(h.id)).map((h) => ({ h, its: h.items.filter((i) => itemDay(h, i) === date) })).filter((x) => x.its.length)
  const E = mergeSameUrl(E0)
  const L = [DIFFUSION_TITLE, `Fecha: ${cap(longDate(date))}`]
  if (meta.author) L.push(`Elaborado por: ${meta.author}`)
  if (meta.brand) L.push(`Cliente / marca: ${meta.brand}`)
  L.push('', 'Resumen')
  if (!E.length) { L.push('No hay publicaciones compartidas en esta fecha.'); return L.join('\n') }
  const all = E.flatMap((x) => x.its), is = (f: (i: HistoryItem) => boolean) => all.filter(f)
  const pub = is((i) => i.status === 'done' && i.review !== 'awaiting' && i.review !== 'rejected'), aw = is((i) => i.review === 'awaiting'), rej = is((i) => i.review === 'rejected'), sk = is((i) => i.status === 'skipped'), pe = is((i) => i.status === 'pending')
  const shared = pub.length + aw.length + rej.length, ver = is((i) => !!i.verify?.found).length
  const today = ymd(Date.now()), yest = ymd(Date.now() - 864e5)
  const when = date === today ? 'Hoy' : date === yest ? 'Ayer' : `El ${new Date(date + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'long' })}`
  const P: string[] = []
  P.push(shared ? `${when} se ${E.length === 1 ? 'compartió' : 'compartieron'} ${pl(E.length, 'publicación', 'publicaciones')} en ${pl(shared, 'grupo', 'grupos')} de Facebook.` : `${when} se preparó la difusión de ${pl(E.length, 'publicación', 'publicaciones')}, pero no llegó a publicarse en ningún grupo.`)
  if (shared) {
    if (pub.length === shared) P.push(shared === 1 ? 'La publicación quedó visible en el grupo.' : 'Todas quedaron visibles en sus grupos.')
    else {
      const t = pub.length ? `${startNum(pub.length)} ${pub.length === 1 ? 'quedó visible' : 'quedaron visibles'} al momento` : 'Ninguna quedó visible al momento'
      const extra: string[] = []
      if (aw.length) extra.push(`${aw.length} ${aw.length === 1 ? 'está' : 'están'} a la espera de que la${aw.length === 1 ? '' : 's'} aprueben los administradores`)
      if (rej.length) extra.push(`${rej.length} ${rej.length === 1 ? 'fue rechazada' : 'fueron rechazadas'}`)
      P.push(t + (extra.length ? (extra.length === 1 ? ' y ' : ', ') + extra.join(' y ') : '') + '.')
    }
    if (ver) P.push(`Se comprobó directamente en el grupo la visibilidad de ${ver === shared ? (ver === 1 ? 'la publicación' : 'todas ellas') : ver === 1 ? 'una de ellas' : `${ver} de ellas`}.`)
  }
  if (sk.length) P.push(`En ${pl(sk.length, 'grupo', 'grupos')} no fue posible publicar (${[...new Set(sk.map((i) => reasonOf(i.error)))].join('; ')}).`)
  if (pe.length) P.push(`${pe.length === 1 ? 'Queda' : 'Quedan'} ${pl(pe.length, 'grupo', 'grupos')} por completar.`)
  L.push(P.join(' '), '', 'Detalle por publicación')
  E.forEach(({ h, its }, k) => {
    const txt = sharedText(h)
    L.push(`${k + 1}. ${entryRef(h)}`)
    if (txt) L.push(`Texto: «${clip(txt, 300)}»`)
    L.push(groupsLine(its), '')
  })
  L.push(...groupList(all))
  const O: string[] = []
  const TRANS = /^(publicando|posting|publicado|posted|compartiendo|sharing|subiendo|uploading|cargando|loading|enviando|sending|procesando|processing)\b/i
  const fbOf = (i: HistoryItem) => { const m = String(i.fbMsg || '').split(' · ').find((x) => x && !TRANS.test(x.trim())); return m ? ` Facebook indicó: «${clip(m.replace(/[«»]/g, '"'), 200)}».` : '' }
  all.filter((i) => i.status === 'skipped' && i.error && !NOT_FAIL.test(i.error)).forEach((i) => O.push(`No se pudo compartir en ${listNames([i.name])}: ${reasonOf(i.error)}.${/^(incidencia|el grupo no permite)/.test(reasonOf(i.error)) ? fbOf(i) : ''}`))
  all.filter((i) => i.status === 'pending' && i.error).forEach((i) => O.push(`No se pudo compartir en ${listNames([i.name])}: Facebook mostró un aviso de seguridad («${clip(cleanErr(i.error).replace(/[«»]/g, '"'), 200)}») y se detuvo la difusión para proteger la cuenta.`))
  rej.forEach((i) => O.push(`La publicación fue rechazada por los administradores de ${listNames([i.name])}.`))
  if (O.length) { L.push('Observaciones'); O.forEach((o) => L.push('- ' + o)); L.push('') }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Publicaciones con actividad entre dos fechas (incluidas). */
export const entriesIn = (from: string, to: string) => getPub().history.filter((h) => h.items.some((i) => { const d = itemDay(h, i); return d >= from && d <= to }))
const dmy = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}-${m}-${y}` }
export const diffusionRangeFileName = (from: string, to: string) => (from === to ? diffusionFileName(from) : `${DIFFUSION_TITLE}-${dmy(from)}_a_${dmy(to)}`)
const shortDay = (d: string) => new Date(d + 'T12:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * Resumen de la difusión en un periodo: totales, actividad por día, detalle por publicación,
 * grupos más usados e incidencias agrupadas. Con un solo día es el informe diario.
 */
export function buildDiffusionRangeReport(from: string, to: string, ids: string[], meta: { author: string; brand: string }) {
  if (from > to) [from, to] = [to, from]
  if (from === to) return buildDiffusionReport(from, ids, meta)
  const inR = (h: HistoryEntry, i: HistoryItem) => { const d = itemDay(h, i); return d >= from && d <= to }
  const E = mergeSameUrl(getPub().history.filter((h) => ids.includes(h.id)).map((h) => ({ h, its: h.items.filter((i) => inR(h, i)) })).filter((x) => x.its.length))
    .sort((a, b) => Math.min(...a.its.map((i) => i.at || a.h.date)) - Math.min(...b.its.map((i) => i.at || b.h.date)))
  const L = [DIFFUSION_TITLE, `Periodo: del ${longDate(from)} al ${longDate(to)}`]
  if (meta.author) L.push(`Elaborado por: ${meta.author}`)
  if (meta.brand) L.push(`Cliente / marca: ${meta.brand}`)
  L.push('', 'Resumen')
  if (!E.length) { L.push('No hay publicaciones compartidas en este periodo.'); return L.join('\n') }
  const all = E.flatMap((x) => x.its), is = (f: (i: HistoryItem) => boolean) => all.filter(f)
  const pub = is((i) => i.status === 'done' && i.review !== 'awaiting' && i.review !== 'rejected'), aw = is((i) => i.review === 'awaiting'), rej = is((i) => i.review === 'rejected')
  const sk = is((i) => i.status === 'skipped' && !NOT_FAIL.test(i.error || '')), pe = is((i) => i.status === 'pending')
  const shared = pub.length + aw.length + rej.length, ver = is((i) => !!i.verify?.found).length
  const days = new Map<string, { posts: Set<string>; groups: number; ok: number }>()
  E.forEach(({ h, its }) => its.forEach((i) => { const d = itemDay(h, i); const x = days.get(d) || { posts: new Set<string>(), groups: 0, ok: 0 }; x.posts.add(h.id); if (i.status === 'done') { x.groups++; if (i.review !== 'awaiting' && i.review !== 'rejected') x.ok++ } days.set(d, x) }))
  const groups = new Map<string, { name: string; n: number; ok: number }>()
  all.filter((i) => i.status === 'done').forEach((i) => { const g = groups.get(i.gid || i.name) || { name: i.name, n: 0, ok: 0 }; g.n++; if (i.review !== 'awaiting' && i.review !== 'rejected') g.ok++; groups.set(i.gid || i.name, g) })
  const attempted = shared + sk.length
  const P: string[] = []
  P.push(`Entre el ${new Date(from + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'long' })} y el ${new Date(to + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} se ${E.length === 1 ? 'difundió' : 'difundieron'} ${pl(E.length, 'publicación', 'publicaciones')} en ${pl(days.size, 'día', 'días')} de actividad.`)
  if (shared) {
    P.push(`En total se compartieron ${pl(shared, 'vez', 'veces')} en ${pl(groups.size, 'grupo distinto', 'grupos distintos')} de Facebook${attempted ? ` (${Math.round((shared / attempted) * 100)} % de los intentos)` : ''}.`)
    const extra: string[] = []
    if (pub.length !== shared) extra.push(pub.length ? `${pub.length} ${pub.length === 1 ? 'quedó visible' : 'quedaron visibles'}` : 'ninguna quedó visible')
    if (aw.length) extra.push(`${aw.length} ${aw.length === 1 ? 'sigue' : 'siguen'} a la espera de aprobación`)
    if (rej.length) extra.push(`${rej.length} ${rej.length === 1 ? 'fue rechazada' : 'fueron rechazadas'}`)
    P.push(pub.length === shared ? 'Todas quedaron visibles en sus grupos.' : cap(extra.join(', ')) + '.')
    if (ver) P.push(`Se comprobó directamente la visibilidad de ${pl(ver, 'publicación', 'publicaciones')} en su grupo.`)
  } else P.push('Ninguna llegó a publicarse en los grupos.')
  if (sk.length) P.push(`En ${pl(sk.length, 'ocasión', 'ocasiones')} no fue posible publicar.`)
  if (pe.length) P.push(`${pe.length === 1 ? 'Queda' : 'Quedan'} ${pl(pe.length, 'grupo', 'grupos')} por completar.`)
  L.push(P.join(' '), '', 'Actividad por día')
  ;[...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([d, x]) => L.push(`- ${cap(shortDay(d))}: ${pl(x.posts.size, 'publicación', 'publicaciones')} en ${pl(x.groups, 'grupo', 'grupos')}${x.ok !== x.groups ? ` (${x.ok} visibles)` : ''}`))
  L.push('', 'Detalle por publicación')
  E.forEach(({ h, its }, k) => {
    const txt = sharedText(h), ds = [...new Set(its.map((i) => itemDay(h, i)))].sort()
    L.push(`${k + 1}. ${entryRef(h)}`)
    if (txt) L.push(`Texto: «${clip(txt, 300)}»`)
    L.push(`Fecha: ${ds.map((d) => cap(shortDay(d))).join(', ')}`)
    L.push(groupsLine(its), '')
  })
  if (groups.size) {
    L.push('Grupos más usados')
    ;[...groups.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 10).forEach((g) => L.push(`- «${g.name}»: ${pl(g.n, 'publicación', 'publicaciones')}${g.ok !== g.n ? ` (${g.ok} visibles)` : ''}`))
    L.push('')
  }
  L.push(...groupList(all))
  const O: string[] = []
  const reasons = new Map<string, Set<string>>()
  sk.filter((i) => i.error).forEach((i) => { const r = reasonOf(i.error); reasons.set(r, (reasons.get(r) || new Set()).add(i.name)) })
  reasons.forEach((names, r) => O.push(`No se pudo compartir en ${listNames([...names])}: ${r}.`))
  if (pe.some((i) => i.error)) O.push('Facebook mostró avisos de seguridad en algunos grupos y se detuvo la difusión para proteger la cuenta.')
  const rejN = [...new Set(rej.map((i) => i.name))]
  if (rejN.length) O.push(`Rechazada por los administradores de ${listNames(rejN)}.`)
  if (O.length) { L.push('Observaciones'); O.forEach((o) => L.push('- ' + o)); L.push('') }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export type GroupScope = 'active' | 'all' | 'sel'
export function buildGroupsReport(groups: Group[], scope: GroupScope, inc: { link: boolean; tags: boolean; notes: boolean; last: boolean }, opts: { byTag?: boolean; tag?: string | null } = {}) {
  const list = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  const title = scope === 'active' ? 'Grupos activos de Facebook' : scope === 'all' ? 'Grupos de Facebook' : 'Grupos seleccionados de Facebook'
  const L = [title + (opts.tag ? ` · ${opts.tag}` : ''), `Fecha: ${cap(new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}`, `Total: ${pl(list.length, 'grupo', 'grupos')}`]
  const one = (g: Group, i: number, showTags: boolean) => {
    L.push(`${i + 1}. ${g.name}`)
    if (inc.link) L.push(`Enlace: ${g.url}`)
    if (showTags && inc.tags && g.tags.length) L.push(`Etiqueta: ${g.tags[0]}`)
    if (inc.notes && g.notes) L.push(`Notas: ${g.notes}`)
    if (inc.last) L.push(`Último uso: ${g.lastShared ? fmtRelative(g.lastShared) : 'nunca'}`)
    if (scope !== 'active') L.push(`Estado: ${g.active ? 'activo' : 'inactivo'}`)
    L.push('')
  }
  if (opts.byTag) {
    // una sección por etiqueta (p. ej. por provincia); la etiqueta ya va en el título de la sección
    const secs = groupsByTag(list, opts.tag)
    L.push(`Por etiqueta: ${secs.map((x) => `${x.tag} (${x.items.length})`).join(', ')}`, '')
    secs.forEach(({ tag, items }) => {
      L.push(`${tag} · ${pl(items.length, 'grupo', 'grupos')}`)
      items.forEach((g, i) => one(g, i, false))
    })
  } else { L.push('', 'Listado'); list.forEach((g, i) => one(g, i, true)) }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export { failedItems }
