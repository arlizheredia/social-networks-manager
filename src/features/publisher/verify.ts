/** Verificación con el marcador: ¿aparece la publicación en el grupo? (FBP_CHECK:{…}) */
import { contentIds, groupSlug } from './fb'
import { getPub, mutateHistory } from './store'

export interface Check { slugs: string[]; name: string; ids: Set<string>; at: number }
export function parseCheck(txt: string): Check | null {
  const m = String(txt || '').match(/FBP_CHECK:(\{[\s\S]*\})/)
  if (!m) return null
  try {
    const d = JSON.parse(m[1])
    const slugs = (Array.isArray(d?.group?.slugs) ? d.group.slugs : []).map((x: unknown) => String(x).slice(0, 100).toLowerCase()).filter((x: string) => /^[\w.-]+$/.test(x))
    if (!slugs.length) return null
    return { slugs, name: String(d.group.name || '').slice(0, 140), ids: new Set((Array.isArray(d.ids) ? d.ids : []).slice(0, 5000).map((x: unknown) => String(x).slice(0, 80))), at: typeof d.at === 'number' ? d.at : Date.now() }
  } catch { return null }
}

/** Aplica la verificación a un elemento del historial. */
export function applyCheck(chk: Check, hid: string, idx: number): { found: boolean | null; wrongGroup?: boolean } {
  const h = getPub().history.find((x) => x.id === hid)
  const it = h?.items[idx]
  if (!h || !it) return { found: null }
  if (!chk.slugs.includes(groupSlug(it.url))) return { found: null, wrongGroup: true }
  const ids = contentIds(h.url)
  if (!ids.size) return { found: null }
  const found = [...ids].some((x) => chk.ids.has(x))
  mutateHistory((hs) => {
    const x = hs.find((y) => y.id === hid)!.items[idx]
    x.verify = { at: chk.at, found }
    if (found && x.review === 'awaiting') { x.review = 'approved'; x.rat = Date.now() }
  })
  return { found }
}
