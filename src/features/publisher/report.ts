/** Informe diario de difusión y reporte de grupos (texto editable; se exporta a Word o PDF). */
import { getPub } from './store'
import { cleanErr, failedItems, reasonOf } from './logic'
import { fmtRelative } from '@/lib/util'
import type { Group, HistoryEntry, HistoryItem } from './types'

export const ymd = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const itemDay = (h: HistoryEntry, i: HistoryItem) => ymd(i.at || h.date)
const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const NUMW = ['Ninguna', 'Una', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez']
const startNum = (n: number) => (n <= 10 ? NUMW[n] : String(n))
const listNames = (a0: string[]) => { const a = [...new Set(a0)].map((n) => `«${n}»`); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] }
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t)
export function longDate(d: string) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
function sharedText(h: HistoryEntry) {
  return String(h.text || '').replace(/\{grupo\}/gi, '(nombre del grupo)').replace(/\{fecha\}/gi, '(fecha)').replace(/\{enlace\}/gi, '(enlace)')
    .replace(/https?:\/\/\S+/g, '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim()
}
const NOT_FAIL = /^(Descartado|Marcado como no publicado)|24 h/

/** Publicaciones con actividad en una fecha. */
export const entriesOn = (date: string) => getPub().history.filter((h) => h.items.some((i) => itemDay(h, i) === date))

export function buildDiffusionReport(date: string, ids: string[], meta: { author: string; brand: string }) {
  const E = getPub().history.filter((h) => ids.includes(h.id)).map((h) => ({ h, its: h.items.filter((i) => itemDay(h, i) === date) })).filter((x) => x.its.length)
  const L = ['Informe de difusión en grupos de Facebook', `Fecha: ${cap(longDate(date))}`]
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
    L.push(`${k + 1}. ${h.url || 'Publicación sin enlace'}`)
    if (txt) L.push(`Texto: «${clip(txt, 300)}»`)
    L.push(`Grupos en los que se compartió: ${its.filter((i) => i.status === 'done').length}`, '')
  })
  const O: string[] = []
  const TRANS = /^(publicando|posting|publicado|posted|compartiendo|sharing|subiendo|uploading|cargando|loading|enviando|sending|procesando|processing)\b/i
  const fbOf = (i: HistoryItem) => { const m = String(i.fbMsg || '').split(' · ').find((x) => x && !TRANS.test(x.trim())); return m ? ` Facebook indicó: «${clip(m.replace(/[«»]/g, '"'), 200)}».` : '' }
  all.filter((i) => i.status === 'skipped' && i.error && !NOT_FAIL.test(i.error)).forEach((i) => O.push(`No se pudo compartir en ${listNames([i.name])}: ${reasonOf(i.error)}.${/^(incidencia|el grupo no permite)/.test(reasonOf(i.error)) ? fbOf(i) : ''}`))
  all.filter((i) => i.status === 'pending' && i.error).forEach((i) => O.push(`No se pudo compartir en ${listNames([i.name])}: Facebook mostró un aviso de seguridad («${clip(cleanErr(i.error).replace(/[«»]/g, '"'), 200)}») y se detuvo la difusión para proteger la cuenta.`))
  rej.forEach((i) => O.push(`La publicación fue rechazada por los administradores de ${listNames([i.name])}.`))
  if (O.length) { L.push('Observaciones'); O.forEach((o) => L.push('- ' + o)); L.push('') }
  const N: string[] = []
  if (aw.length) N.push(aw.length === 1 ? `Comprobar si se aprobó la publicación en ${listNames(aw.map((i) => i.name))}.` : `Comprobar si se aprobaron las publicaciones en ${listNames(aw.map((i) => i.name))}.`)
  const nm = sk.filter((i) => /miembro/i.test(i.error || ''))
  if (nm.length) N.push(`Solicitar acceso a ${listNames(nm.map((i) => i.name))}.`)
  if (pe.length) N.push(`Completar la difusión en ${pl(pe.length, 'grupo pendiente', 'grupos pendientes')}.`)
  L.push('Próximos pasos')
  if (N.length) N.forEach((n) => L.push('- ' + n))
  else L.push('Sin tareas pendientes de esta jornada.')
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export type GroupScope = 'active' | 'all' | 'sel'
export function buildGroupsReport(groups: Group[], scope: GroupScope, inc: { link: boolean; tags: boolean; notes: boolean; last: boolean }) {
  const list = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  const title = scope === 'active' ? 'Grupos activos de Facebook' : scope === 'all' ? 'Grupos de Facebook' : 'Grupos seleccionados de Facebook'
  const L = [title, `Fecha: ${cap(new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}`, `Total: ${pl(list.length, 'grupo', 'grupos')}`, '', 'Listado']
  list.forEach((g, i) => {
    L.push(`${i + 1}. ${g.name}`)
    if (inc.link) L.push(`Enlace: ${g.url}`)
    if (inc.tags && g.tags.length) L.push(`Etiquetas: ${g.tags.join(', ')}`)
    if (inc.notes && g.notes) L.push(`Notas: ${g.notes}`)
    if (inc.last) L.push(`Último uso: ${g.lastShared ? fmtRelative(g.lastShared) : 'nunca'}`)
    if (scope !== 'active') L.push(`Estado: ${g.active ? 'activo' : 'inactivo'}`)
    L.push('')
  })
  return L.join('\n').trim()
}

export { failedItems }
