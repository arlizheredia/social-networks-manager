/** Copia de seguridad única de toda la app (publicación + comentarios). */
import { DB } from '@/features/comments/db'
import { getPrefs, setPrefs } from '@/features/comments/prefs'
import { loadTR } from '@/features/comments/tracking'
import { cleanGroups, cleanHistory, cleanSettings, cleanTemplates, getPub, setPub } from '@/features/publisher/store'
import { groupKey } from '@/features/publisher/fb'
import { download } from '@/lib/util'
import { loadCompHistory, saveCompReport, setComp, useCompHistory, useCompetition, type SavedCompReport } from '@/features/competition/store'

export async function exportBackup() {
  const p = getPub()
  const data = {
    app: 'social-networks-manager', kind: 'backup', version: 1, exportedAt: new Date().toISOString(),
    publisher: { groups: p.groups, history: p.history, templates: p.templates, settings: p.settings },
    comments: { prefs: getPrefs(), db: await DB.exportAll() },
    competition: await (async () => { if (!useCompHistory.getState().loaded) await loadCompHistory(); const c = useCompetition.getState(); return { competitors: c.competitors, brand: c.brand, provinces: c.provinces, reports: useCompHistory.getState().list } })(),
  }
  download(`social-networks-manager-copia-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, JSON.stringify(data), 'application/json')
}

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Restaura fusionando (nunca borra lo existente). Acepta también copias de Facebook Publisher y Social Comments Analyzer. */
export async function importBackup(file: File) {
  const j: Any = JSON.parse(await file.text())
  let comp: Any | null = null
  let groups: unknown = null, history: unknown = null, templates: unknown = null, settings: unknown = null, db: Any | null = null, prefs: Any | null = null
  if (j.app === 'social-networks-manager') { ({ groups, history, templates, settings } = j.publisher || {}); db = j.comments?.db; prefs = j.comments?.prefs; comp = j.competition || null }
  else if (j.kind === 'backup' && Array.isArray(j.posts)) { db = j; prefs = { team: j.team, replies: j.replies } }
  else if (Array.isArray(j.groups) || j.app === 'Facebook Publisher') { groups = j.groups; history = j.history; templates = j.templates; settings = j.settings }
  else throw new Error('No es una copia de seguridad reconocida.')

  const p = getPub()
  if (groups) { const keys = new Set(p.groups.map((g) => groupKey(g.url))); setPub({ groups: [...p.groups, ...cleanGroups(groups).filter((g) => !keys.has(groupKey(g.url)))] }) }
  if (history) { const ids = new Set(p.history.map((h) => h.id)); setPub((s) => ({ history: [...s.history, ...cleanHistory(history).filter((h) => !ids.has(h.id))].sort((a, b) => b.date - a.date).slice(0, 300) })) }
  if (templates) { const ids = new Set(p.templates.map((t) => t.id)); setPub((s) => ({ templates: [...s.templates, ...cleanTemplates(templates).filter((t) => !ids.has(t.id))] })) }
  if (settings) setPub({ settings: cleanSettings(settings) })
  if (prefs) {
    const cur = getPrefs()
    const team = [...cur.team]
    ;(prefs.team || []).forEach((m: Any) => { if (m?.name && !team.some((x) => x.name.toLowerCase() === String(m.name).toLowerCase())) team.push({ name: m.name, ...(m.id ? { id: m.id } : {}) }) })
    setPrefs({ team, ...(Array.isArray(prefs.replies) && prefs.replies.length ? { replies: prefs.replies } : {}), ...(prefs.report ? { report: prefs.report } : {}) })
  }
  if (db) {
    for (const x of db.posts || []) await DB.put('posts', x)
    for (const x of db.trackings || []) await DB.put('trackings', x)
    for (const pc of db.pcomments || []) {
      const cur = await DB.pc(pc.postId)
      const m = new Map(cur.comments.map((c) => [String(c.id || c.text), c]))
      ;(pc.comments || []).forEach((c: Any) => m.set(String(c.id || c.text), c))
      await DB.put('pcomments', { ...cur, ...pc, comments: [...m.values()] })
    }
    for (const r of db.results || []) {
      if (Array.isArray(r.comments)) await DB.saveResult(r, r.comments)
      else await DB.put('results', r)
    }
    await loadTR()
  }
  // competencia: fichas (sin duplicar por nombre), perfil de la marca e informes del historial
  if (comp) {
    const cur = useCompetition.getState()
    const names = new Set(cur.competitors.map((c) => c.name.toLowerCase()))
    setComp({ competitors: [...cur.competitors, ...(comp.competitors || []).filter((c: Any) => c?.name && !names.has(String(c.name).toLowerCase()))], ...(comp.brand && !Object.values(cur.brand.coverage).some(Boolean) ? { brand: comp.brand } : {}) })
    for (const r of (comp.reports || []) as SavedCompReport[]) if (r?.id && r.model) await saveCompReport(r)
  }
}

export async function wipeAll() {
  Object.keys(localStorage).filter((k) => k.startsWith('snm.')).forEach((k) => localStorage.removeItem(k))
  for (const name of ['snm-media', 'snm-comp']) await new Promise<void>((r) => { const q = indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = () => r() })
  location.reload()
}
