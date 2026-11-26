/** Alta, edición, borrado e importación de grupos. */
import { uid } from '@/lib/util'
import { badGroupName, cleanGroupName, groupKey, normGroupUrl } from './fb'
import { cleanGroups, getPub, setPub } from './store'
import { computeSel, saveSel } from './logic'
import type { Group } from './types'

export interface GroupInput { url: string; name: string; tags: string[]; notes: string; active: boolean; approval: boolean }

/** Devuelve el nombre del duplicado si ya existe un grupo con esa URL. */
export function upsertGroup(data: GroupInput, id?: string | null): string | null {
  data = { ...data, tags: data.tags.filter(Boolean).slice(0, 1) }
  const key = groupKey(data.url)
  const dup = getPub().groups.find((g) => groupKey(g.url) === key && g.id !== id)
  if (dup) return dup.name
  if (id) setPub((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...data, nameFixed: false } : g)) }))
  else {
    const g: Group = { id: uid().slice(0, 36), created: Date.now(), lastShared: null, nameFixed: false, ...data }
    setPub((s) => ({ groups: [...s.groups, g] }))
    const sel = computeSel(getPub()); sel.add(g.id); saveSel(sel)
  }
  return null
}

export function deleteGroups(ids: string[]) {
  const before = getPub().groups
  setPub({ groups: before.filter((g) => !ids.includes(g.id)) })
  return () => setPub({ groups: before })
}

/* ---------- Etiquetas ---------- */
/** Etiqueta limpia; si ya existe con otras mayúsculas o sin tilde, se usa la existente («holguin» → «Holguín»). */
export function normTag(t: string, existing: string[] = []) {
  const c = String(t || '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!c) return ''
  const k = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return existing.find((e) => k(e) === k(c)) || c
}
/** Asigna una etiqueta (o ninguna, con null) a varios grupos: cada grupo tiene como mucho una. Devuelve cuántos cambiaron. */
export function setGroupTag(ids: string[], tag: string | null) {
  const all = [...new Set(getPub().groups.flatMap((g) => g.tags))]
  const t = tag ? normTag(tag, all) : ''
  let changed = 0
  setPub((s) => ({ groups: s.groups.map((g) => {
    if (!ids.includes(g.id) || (g.tags[0] || '') === t && g.tags.length <= 1) return g
    changed++
    return { ...g, tags: t ? [t] : [] }
  }) }))
  return changed
}
export const NO_TAG = 'Sin etiqueta'
/** Secciones por etiqueta, ordenadas; al final, los grupos sin etiqueta. */
export function groupsByTag<T extends { tags: string[]; name: string }>(list: T[], only?: string | null): { tag: string; items: T[] }[] {
  const m = new Map<string, T[]>()
  list.forEach((g) => { const t = g.tags[0] || NO_TAG; if (!only || only === t) m.set(t, [...(m.get(t) || []), g]) })
  return [...m.entries()].sort(([a], [b]) => (a === NO_TAG ? 1 : b === NO_TAG ? -1 : a.localeCompare(b, 'es')))
    .map(([tag, items]) => ({ tag, items: items.sort((x, y) => x.name.localeCompare(y.name, 'es', { sensitivity: 'base' })) }))
}

type Imp = { url: string; name: string; tags: string[]; notes: string; active: boolean }
/** Acepta la salida del marcador (FBP_GROUPS:[…]), un JSON exportado o líneas «Nombre | URL». */
export function parseImport(txt0: string): Imp[] {
  const txt = String(txt0 || '').trim()
  if (!txt) return []
  const out: Imp[] = []
  const m = txt.match(/FBP_GROUPS:(\[[\s\S]*\])/)
  let arr: unknown = null
  try { arr = JSON.parse(m ? m[1] : txt) } catch { /* texto */ }
  if (arr && !Array.isArray(arr) && Array.isArray((arr as { groups?: unknown }).groups)) arr = (arr as { groups: unknown[] }).groups
  if (Array.isArray(arr)) {
    arr.forEach((o0) => {
      const o = (typeof o0 === 'string' ? { url: o0 } : o0) as Record<string, unknown>
      const url = normGroupUrl(o.url || o.link || o.id)
      if (url) out.push({ url, name: String(o.name || o.nombre || '').trim() || url.split('/groups/')[1].replace('/', ''), tags: Array.isArray(o.tags) ? (o.tags as string[]).filter(Boolean).slice(0, 1) : [], notes: String(o.notes || ''), active: o.active !== false })
    })
  } else txt.split(/\r?\n/).forEach((line0) => {
    const line = line0.trim()
    if (!line) return
    let name = '', raw = line
    const p = line.split(/\s*[|;\t]\s*/)
    if (p.length > 1) { const ui = p.findIndex((x) => normGroupUrl(x) && /groups|^\d+$/.test(x)); if (ui >= 0) { raw = p[ui]; name = p.filter((_, i) => i !== ui).join(' ').trim() } }
    else { const mm = line.match(/(\S*facebook\.com\/groups\/\S+)/i); if (mm) { raw = mm[1]; name = line.replace(mm[1], '').replace(/[-–:,]+\s*$/, '').trim() } }
    const url = normGroupUrl(raw)
    if (url) out.push({ url, name: name || url.split('/groups/')[1].replace('/', ''), tags: [], notes: '', active: true })
  })
  const seen = new Set<string>()
  return out.filter((g) => { const k = groupKey(g.url); if (seen.has(k)) return false; seen.add(k); return true })
}

/** Nombres que conviene corregir: el existente es el ID o se limpió automáticamente. */
export function importFixes(list: Imp[]) {
  const out: { id: string; name: string }[] = []
  list.forEach((g) => {
    const ex = getPub().groups.find((x) => groupKey(x.url) === groupKey(g.url))
    if (!ex) return
    const nm = cleanGroupName(g.name), slug = (ex.url.split('/groups/')[1] || '').replace('/', '').toLowerCase()
    if (nm && !badGroupName(g.name) && nm.toLowerCase() !== slug && nm !== ex.name && (ex.nameFixed || ex.name.toLowerCase() === slug)) out.push({ id: ex.id, name: nm })
  })
  return out
}

export function analyzeImport(text: string) {
  const list = parseImport(text)
  const existing = new Set(getPub().groups.map((g) => groupKey(g.url)))
  const nw = list.filter((g) => !existing.has(groupKey(g.url)))
  const fixes = importFixes(list)
  return { list, nw, fixes, skipped: Math.max(0, list.length - nw.length - fixes.length), isCheck: /FBP_CHECK:/.test(text) }
}

export function applyImport(text: string) {
  const { nw, fixes } = analyzeImport(text)
  const added = cleanGroups(nw.map((g) => ({ ...g, id: uid().slice(0, 36), created: Date.now(), lastShared: null })))
  setPub((s) => ({ groups: [...s.groups.map((g) => { const f = fixes.find((x) => x.id === g.id); return f ? { ...g, name: f.name, nameFixed: false } : g }), ...added] }))
  const sel = computeSel(getPub()); added.forEach((g) => { if (g.active) sel.add(g.id) }); saveSel(sel)
  return { added: added.length, fixed: fixes.length }
}
