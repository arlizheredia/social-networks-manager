/**
 * Motor de publicación: modo asistido (copiar + abrir grupo + confirmar) y automático (extensión).
 * Portado de Facebook Publisher conservando sus reglas de seguridad.
 */
import { create } from 'zustand'
import { uid, copyText } from '@/lib/util'
import { wsleep, beep, fileToDataUrl } from '@/lib/timers'
import { toast, confirmBox, alertBox } from '@/components/ui'
import { publisherCommand, onPublisherProgress, useExtension } from '@/features/extension/bridge'
import { getPub, setPub, mutateHistory, mutateGroups, SAFE, setLock } from './store'
import { finalText, groupKey, parseFbUrl } from './fb'
import { failedItems, gate, isRecent, reasonOf, RX_PEND, selectedGroups, hhmm } from './logic'
import { useMedia, clearMedia } from './media'
import type { HistoryEntry, HistoryItem, Review } from './types'

export interface FbMsg { g: string; t: string; lv: 'err' | 'info' | 'notice'; at: number }
export interface RunState {
  entryId: string
  idx: number
  opened: boolean
  auto: boolean
  autoRunning: boolean
  stop: boolean
  stopMsg: string
  userStop: boolean
  testDone: boolean
  retries: number
  retry: { n: number; max: number; until: number; reason: string } | null
  phase: '' | 'wait' | 'posting' | 'retry'
  step: string
  log: string[]
  msgs: FbMsg[]
  cleared: boolean
  /** En segundo plano: la pantalla de publicación se oculta y el proceso sigue */
  bg?: boolean
}

/**
 * Varias publicaciones pueden estar en curso a la vez (solo la automática; la asistida, una). `front` es la que se ve
 * en pantalla; el resto sigue en segundo plano. `run` es siempre la de primer plano (para la pantalla de publicación).
 */
interface RunsState { runs: RunState[]; front: string | null; run: RunState | null }
export const useRun = create<RunsState>(() => ({ runs: [], front: null, run: null }))
const view = (runs: RunState[], front: string | null): RunsState => ({ runs, front, run: runs.find((r) => r.entryId === front) ?? null })
const S = () => useRun.getState()
/** Publicación de primer plano. */
const R = () => S().run
/** Publicación concreta. */
const RR = (id: string) => S().runs.find((r) => r.entryId === id)
const patchId = (id: string, p: Partial<RunState>) => useRun.setState((s) => view(s.runs.map((r) => (r.entryId === id ? { ...r, ...p } : r)), s.front))
const patch = (p: Partial<RunState>) => { const f = S().front; if (f) patchId(f, p) }
/** Pasa una publicación a segundo plano o la trae a primer plano (por defecto, la de primer plano). */
export const setRunBg = (bg: boolean, id = S().front) => { if (!id) return; if (bg) patchId(id, { bg: true }); else showRun(id) }
/** Trae una publicación a primer plano; la que estaba delante pasa a segundo plano. */
export function showRun(id: string) {
  useRun.setState((s) => view(s.runs.map((r) => (r.entryId === id ? { ...r, bg: false } : r.entryId === s.front ? { ...r, bg: true } : r)), id))
}
export const runEntry = (id = S().front): HistoryEntry | undefined => (id ? getPub().history.find((h) => h.id === id) : undefined)
const unfinished = (r: RunState) => { const e = runEntry(r.entryId); return !!e && e.items.some((i) => i.status === 'pending') }

/* Cola de la extensión: publica en una sola ventana de Facebook, así que las publicaciones en paralelo se turnan
   (cada una publica en un grupo y deja paso a la siguiente). La pausa de seguridad se comprueba dentro del turno. */
let tail: Promise<void> = Promise.resolve()
let poster: string | null = null
function takeTurn(): Promise<() => void> {
  let release!: () => void
  const mine = new Promise<void>((res) => { release = res })
  const prev = tail
  tail = prev.then(() => mine)
  return prev.then(() => release)
}

/* ---------- Cuenta de Facebook (vía extensión) ---------- */
export interface FbAccount { state: 'unknown' | 'in' | 'out' | 'offline'; id: string; name: string; avatar: string | null; url: string | null; at: number }
export const useFb = create<FbAccount>(() => ({ state: 'unknown', id: '', name: '', avatar: null, url: null, at: 0 }))
let fbChecking: Promise<FbAccount> | null = null
export async function checkFb(force = false): Promise<FbAccount> {
  const fb = useFb.getState()
  if (!useExtension.getState().publisher) return fb
  if (!force && Date.now() - fb.at < 30000) return fb
  if (fbChecking) return fbChecking
  fbChecking = (async () => {
    if (!navigator.onLine) { useFb.setState({ state: 'offline', at: Date.now() }); return useFb.getState() }
    const r = await publisherCommand('status', { details: true }, 25000)
    const next: Partial<FbAccount> = { at: Date.now() }
    // La sesión se decide por la cookie de Facebook (como el indicador de sesiones). Que la prueba de red de la
    // extensión tarde no significa estar sin conexión: solo lo es si el propio equipo está sin Internet.
    if (!r.ok) next.state = 'unknown'
    else if (r.loggedIn === false) next.state = 'out'
    else if (r.online === false && !r.loggedIn) next.state = navigator.onLine ? 'unknown' : 'offline'
    else if (r.loggedIn) {
      next.state = 'in'
      next.id = /^\d{1,20}$/.test(String(r.userId || '')) ? String(r.userId) : ''
      next.name = String(r.name || '').slice(0, 80)
      next.avatar = typeof r.avatar === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(r.avatar) ? r.avatar : null
      next.url = typeof r.profileUrl === 'string' && /^https:\/\/www\.facebook\.com\/[^\s"'<>]+$/.test(r.profileUrl) ? r.profileUrl : null
    } else next.state = 'unknown'
    useFb.setState(next)
    return useFb.getState()
  })()
  try { return await fbChecking } finally { fbChecking = null }
}

export const autoActive = () => getPub().settings.autoMode && !!useExtension.getState().publisher

/* ---------- Texto por grupo ---------- */
const hasVisualMedia = () => useMedia.getState().items.some((m) => m.type === 'image' || m.type === 'video')
/** Modo automático: el enlace va en el texto solo si se pide o hay archivos; si no, la extensión lo pega para generar la tarjeta y lo borra. */
const autoLinkInText = () => getPub().settings.appendUrl || hasVisualMedia()
export function runText(e: HistoryEntry, it: HistoryItem, forAuto = false) {
  return finalText(e.text, e.url, it.name, forAuto ? autoLinkInText() : true)
}
const autoJobLink = (e: HistoryEntry) => (!e.url || autoLinkInText() || /\{enlace\}/i.test(e.text || '') ? '' : e.url)

/* ---------- Estado persistente de la publicación a medias ---------- */
function saveRunState(id?: string) {
  const { history, runIds } = getPub()
  const pend = (x: string) => history.some((h) => h.id === x && h.items.some((i) => i.status === 'pending'))
  const ids = [...new Set([...(id ? [id] : []), ...S().runs.map((r) => r.entryId), ...runIds])].filter(pend).slice(0, 20)
  setPub({ runIds: ids, runId: ids[0] ?? null })
}

async function resolveInflight(entryId: string) {
  const e = getPub().history.find((h) => h.id === entryId)
  if (!e) return
  for (const [idx, it] of e.items.entries()) {
    if (it.status !== 'pending' || !it.inflight) continue
    const yes = await alertBox('help', '¿Se llegó a publicar en este grupo?',
      `La publicación en «${it.name}» se interrumpió mientras se estaba enviando (${new Date(it.inflight).toLocaleString('es')}). Para no publicar dos veces, revisa el grupo en Facebook. ¿Aparece tu publicación?`,
      { ok: 'Sí, ya está publicada', cancel: 'No, volver a intentarlo' })
    const at = it.inflight
    mutateHistory((hs) => {
      const x = hs.find((h) => h.id === entryId)!.items[idx]
      if (yes) { x.status = 'done'; x.at = at }
      delete x.inflight
    })
    if (yes) mutateGroups((gs) => { const g = gs.find((x) => x.id === it.gid); if (g) g.lastShared = at })
  }
}

/* ---------- Inicio ---------- */
/** Crea la entrada de historial desde el formulario (o reanuda una existente) y abre el asistente. */
export async function startRun(fromHistId?: string) {
  // la misma publicación ya está en curso: se trae a primer plano
  if (fromHistId && RR(fromHistId)) { showRun(fromHistId); return }
  // la asistida necesita que confirmes cada grupo: solo una a la vez
  const assisted = S().runs.find((x) => !x.auto && unfinished(x))
  if (assisted && (!autoActive() || assisted.entryId === fromHistId)) { showRun(assisted.entryId); toast('Ya hay una publicación asistida en curso: termínala o detenla antes de empezar otra'); return }
  // las terminadas que nadie ha cerrado dejan sitio
  S().runs.filter((x) => !unfinished(x) && x.entryId !== S().front).forEach((x) => dropRun(x.entryId))
  let entryId: string
  if (fromHistId) {
    await resolveInflight(fromHistId)
    entryId = fromHistId
  } else {
    const { draft } = getPub()
    const r = parseFbUrl(draft.url)
    if (r.error) { toast('La URL de origen no es válida'); return }
    const groups = selectedGroups().filter((g) => !isRecent(g))
    if (!groups.length) {
      const all = getPub().groups, act = all.filter((g) => g.active)
      const go = { label: 'Gestionar grupos', href: '#/publicar/grupos' }
      if (!all.length) toast('No tienes grupos: añade al menos uno para poder publicar', 'warning', go)
      else if (!act.length) toast('Todos tus grupos están desactivados: activa al menos uno para publicar', 'warning', go)
      else toast('Selecciona al menos un grupo disponible en «Destinos»', 'warning')
      return
    }
    if (!r.url && !draft.text.trim() && !useMedia.getState().items.length) { toast('Añade una URL, texto o archivos'); return }
    const entry: HistoryEntry = {
      id: uid().slice(0, 36), date: Date.now(), ...(draft.name?.trim() ? { name: draft.name.trim() } : {}), url: r.url || '', text: draft.text, mediaCount: useMedia.getState().items.length,
      appendUrl: getPub().settings.appendUrl, ack: false,
      items: groups.map((g) => ({ gid: g.id, name: g.name, url: g.url, notes: g.notes || '', status: 'pending', at: null })),
    }
    setPub((s) => ({ history: [entry, ...s.history].slice(0, 300) }))
    entryId = entry.id
  }
  // Nombres actualizados de los grupos
  const groups = getPub().groups
  mutateHistory((hs) => hs.find((h) => h.id === entryId)?.items.forEach((i) => {
    const g = groups.find((x) => x.id === i.gid) || groups.find((x) => groupKey(x.url) === groupKey(i.url))
    if (g?.name) i.name = g.name
  }))
  const e = getPub().history.find((h) => h.id === entryId)!
  const idx = e.items.findIndex((i) => i.status === 'pending')
  // los archivos se guardan con la publicación: el formulario se puede vaciar y preparar otra mientras esta sigue
  if (!snaps.has(entryId)) snaps.set(entryId, useMedia.getState().items.filter((m) => m.type === 'image' || m.type === 'video').map((m) => ({ ...m })))
  const run: RunState = {
    entryId, idx: idx < 0 ? e.items.length : idx, opened: false, auto: autoActive(), autoRunning: false, stop: false, stopMsg: '',
    userStop: false, testDone: false, retries: 0, retry: null, phase: '', step: '', log: [], msgs: [], cleared: false,
  }
  useRun.setState((s) => view([...s.runs.map((x) => (x.entryId === s.front ? { ...x, bg: true } : x)), run], entryId))
  saveRunState(entryId)
  if (S().runs.length > 1) toast(`Publicación en paralelo: ${S().runs.filter(unfinished).length} en curso. Se turnan grupo a grupo respetando la pausa de seguridad.`, 'stacks')
  if (autoActive()) runAuto(entryId)
}

export function retryFailed(hid: string) {
  mutateHistory((hs) => {
    const h = hs.find((x) => x.id === hid)
    if (!h) return
    failedItems(h).forEach((i) => { i.status = 'pending'; delete i.error; i.at = null; delete i.fbMsg })
    h.ack = false
  })
  startRun(hid)
}

/* ---------- Modo asistido ---------- */
let fbWin: Window | null = null
function openTarget(e: HistoryEntry, it: HistoryItem) {
  const mode = getPub().settings.mode
  const url = mode === 'share' && e.url ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(e.url)}` : it.url
  if (!/^https:\/\/www\.facebook\.com\//.test(url)) { toast('Destino no válido'); return false }
  const feat = mode === 'side'
    ? (() => { const w = Math.min(900, Math.round(screen.availWidth * 0.55)), h = screen.availHeight - 40, l = screen.availWidth - w; return `popup=yes,width=${w},height=${h},left=${l},top=0` })()
    : ''
  fbWin = window.open('', 'snm_target', feat)
  if (fbWin) {
    try { fbWin.opener = null } catch { /* */ }
    try { fbWin.location.href = url } catch { fbWin = window.open(url, 'snm_target', feat) }
  }
  if (!fbWin) { toast('El navegador bloqueó la ventana. Permite las ventanas emergentes para esta página.'); return false }
  try { fbWin.focus() } catch { /* */ }
  return true
}

export async function stepOpen() {
  const r = R(), e = runEntry()
  const it = r && e?.items[r.idx]
  if (!r || !e || !it) return
  if (!gate().ok) return
  const g = getPub().groups.find((x) => x.id === it.gid)
  if (g && isRecent(g)) { toast('Ya publicaste en este grupo hace menos de 24 h. Se ha omitido para proteger tu cuenta.'); mark('skipped'); return }
  const ok = await copyText(runText(e, it))
  const opened = openTarget(e, it)
  patch({ opened: opened || r.opened })
  toast(ok ? (opened ? 'Texto copiado y grupo abierto. Pega con Ctrl+V en Facebook.' : 'Texto copiado') : 'No se pudo copiar automáticamente: usa «Copiar texto».')
}

export function mark(status: 'done' | 'skipped', review?: Review, error?: string, id = S().front ?? '') {
  const r = RR(id), e = runEntry(id)
  if (!r || !e || !e.items[r.idx]) return
  const at = Date.now()
  const it = e.items[r.idx]
  mutateHistory((hs) => {
    const x = hs.find((h) => h.id === r.entryId)!.items[r.idx]
    x.status = status; x.at = at; x.review = status === 'done' && review ? review : undefined
    if (error !== undefined) x.error = error
    else if (status === 'done') x.error = undefined
  })
  if (status === 'done') mutateGroups((gs) => { const g = gs.find((x) => x.id === it.gid); if (g) { g.lastShared = at; if (review === 'awaiting') g.approval = true } })
  const items = runEntry(id)!.items
  const next = items.findIndex((x, i) => i > r.idx && x.status === 'pending')
  const any = next >= 0 ? next : items.findIndex((x) => x.status === 'pending')
  patchId(id, { idx: any < 0 ? items.length : any, opened: false })
  saveRunState(id)
}

export function jumpTo(i: number) {
  const r = R(), e = runEntry()
  if (!r || !e || r.autoRunning) return
  const it = e.items[i]
  if (it.status === 'done') { toast('Este grupo ya está marcado como publicado'); return }
  if (it.status !== 'pending') mutateHistory((hs) => { const x = hs.find((h) => h.id === r.entryId)!.items[i]; x.status = 'pending'; x.at = null })
  patch({ idx: i, opened: false })
}

/** Quita una publicación de la lista de las que están en curso (sin preguntar). */
function dropRun(id: string) {
  useRun.setState((s) => view(s.runs.filter((x) => x.entryId !== id), s.front === id ? null : s.front))
  snaps.delete(id)
}

export async function closeRun(force = false, id = S().front) {
  const r = id ? RR(id) : undefined, e = runEntry(id ?? undefined)
  if (!r || !id) return
  const pending = e?.items.filter((i) => i.status === 'pending').length ?? 0
  if (!force && pending && !(await confirmBox(
    r.autoRunning ? '¿Detener la publicación automática?' : '¿Salir de la publicación asistida?',
    `Quedan ${pending} grupo(s) pendientes. ${r.autoRunning ? 'Si hay un grupo en curso, puede que termine de publicarse. ' : ''}Podrás reanudar desde el Historial.`, 'Salir'))) return
  patchId(id, { stop: true })
  dropRun(id)
  saveRunState(id)
  if (!S().run) document.title = 'Social Networks Manager'
}

export async function panicStop() {
  if (!(await confirmBox('¿Facebook te ha mostrado un aviso?', 'Detendremos la publicación y bloquearemos nuevas publicaciones durante 24 horas para que tu cuenta se recupere. Tu progreso queda guardado en el Historial.', 'Detener y proteger', true))) return
  setLock(Date.now() + SAFE.LOCK_H * 3600e3, 'Lo indicaste tú con «Facebook me mostró un aviso».')
  // el bloqueo vale para toda la cuenta: se detienen también las que están en segundo plano
  S().runs.forEach((x) => { if (x.autoRunning) patchId(x.entryId, { stop: true, userStop: true, stopMsg: 'Detenida para proteger tu cuenta.' }) })
  await closeRun(true)
}

/** Vacía el formulario de publicación (los grupos y la selección se conservan). */
export function clearForm() {
  setPub({ draft: { url: '', text: '', name: '' } })
  clearMedia()
}

/* ---------- Modo automático ---------- */
async function retryWait(me: string, reason: string): Promise<boolean> {
  const r = RR(me)!
  const retries = r.retries + 1, max = getPub().settings.retries
  if (retries > max) {
    patchId(me, { retries, stop: true, stopMsg: `${reason} Se agotaron los ${max} reintentos y se ha detenido la publicación. Tu progreso está guardado: pulsa «Continuar» cuando se resuelva.` })
    return false
  }
  patchId(me, { retries, retry: { n: retries, max, until: Date.now() + getPub().settings.retryEvery * 1000, reason }, phase: 'retry' })
  publisherCommand('badge', { text: '↻' }, 3000)
  while (RR(me)?.retry && Date.now() < RR(me)!.retry!.until && !RR(me)!.stop) await wsleep(1000)
  patchId(me, { retry: null })
  return !!RR(me) && !RR(me)!.stop
}
export const retryNow = (id = S().front) => { const r = id ? RR(id) : undefined; if (r?.retry) patchId(r.entryId, { retry: { ...r.retry, until: 0 } }) }
export const stopAfterCurrent = (id = S().front) => {
  const r = id ? RR(id) : undefined
  if (!r) return
  patchId(r.entryId, { stop: true, userStop: true, stopMsg: 'La has detenido. Tu progreso está guardado; pulsa Continuar cuando quieras.', retry: r.retry ? { ...r.retry, until: 0 } : null })
  toast(r.phase === 'posting' && poster === r.entryId ? 'Se detendrá al terminar el grupo actual' : 'Publicación detenida')
}

window.addEventListener('online', () => S().runs.forEach((x) => retryNow(x.entryId)))
window.addEventListener('offline', () => S().runs.forEach((x) => { if (x.autoRunning && !x.stop) patchId(x.entryId, { stop: true, stopMsg: 'Se perdió la conexión a Internet. Pulsa «Continuar» cuando vuelva; tu progreso está guardado.' }) }))
window.addEventListener('beforeunload', (e) => { if (S().runs.some((x) => x.autoRunning && !x.stop)) { e.preventDefault(); e.returnValue = '' } })

/* Archivos de cada publicación (se copian al empezarla). */
const snaps = new Map<string, ReturnType<typeof useMedia.getState>['items']>()

const TRANSIENT = /^(publicando|posting|publicado|posted|compartiendo|sharing|subiendo|uploading|cargando|loading|enviando|sending|procesando|processing)\b[\s.…]*(\d+\s*%)?[\s.…]*$/i

export async function runAuto(id = S().front ?? '') {
  const r0 = RR(id)
  if (!r0 || r0.autoRunning) return
  const me = r0.entryId
  const alive = () => !!RR(me)
  const cur = () => RR(me)!
  const set = (p: Partial<RunState>) => patchId(me, p)
  set({ auto: true, autoRunning: true, stop: false, stopMsg: '', userStop: false, retries: 0, retry: null, log: [], testDone: false })
  const st = getPub().settings
  const test = st.autoTest
  const media = snaps.get(me) ?? useMedia.getState().items.filter((m) => m.type === 'image' || m.type === 'video')
  const total = media.reduce((a, m) => a + (m.file.size || 0), 0)
  if (total > 60 * 1024 * 1024) set({ stop: true, stopMsg: 'Los archivos superan 60 MB: reduce su tamaño o usa el modo asistido.' })
  const files = cur().stop ? [] : await Promise.all(media.map(async (m) => ({ name: m.name, type: m.file.type || (m.type === 'image' ? 'image/png' : 'video/mp4'), data: await fileToDataUrl(m.file) })))
  // el progreso de la extensión es de la publicación que tiene el turno
  const off = onPublisherProgress((step) => { const r = RR(me); if (r && poster === me) set({ step, log: [...r.log, step].slice(-20) }) })
  let blockAlert: { g: string; e: string } | null = null

  while (alive() && !cur().stop) {
    let e = runEntry(me)!
    let idx = e.items.findIndex((i) => i.status === 'pending')
    if (idx < 0) break
    set({ idx })
    // espera su turno: con varias publicaciones en paralelo, la extensión publica de una en una
    if (S().runs.some((x) => x.entryId !== me && x.autoRunning && !x.stop)) set({ phase: 'wait', step: 'Esperando turno: otra publicación está usando Facebook…' })
    const release = await takeTurn()
    poster = me
    try {
      if (!alive() || cur().stop) break
      e = runEntry(me)!
      idx = e.items.findIndex((i) => i.status === 'pending')
      if (idx < 0) break
      set({ idx })
      const it = e.items[idx]
      // pausa de seguridad y límites (compartidos por todas las publicaciones)
      let G = gate()
      while (!G.ok && alive() && !cur().stop) {
        if (G.reason === 'lock' || G.reason === 'day') {
          set({ stop: true, stopMsg: G.reason === 'day' ? `Límite diario alcanzado. Podrás continuar a partir de ${hhmm(G.until)}.` : 'Publicación bloqueada por seguridad.' })
          break
        }
        set({ phase: 'wait', step: '' })
        await wsleep(Math.min(5000, Math.max(500, G.until - Date.now() + 300)))
        G = gate()
      }
      if (!alive() || cur().stop) break
      const g = getPub().groups.find((x) => x.id === it.gid)
      if (g && isRecent(g)) {
        mutateHistory((hs) => { const x = hs.find((h) => h.id === me)!.items[idx]; Object.assign(x, { status: 'skipped', error: 'Ya publicaste aquí hace menos de 24 h', at: Date.now() }) })
        continue
      }
      if (!navigator.onLine) { release(); poster = null; if (await retryWait(me, 'Sin conexión a Internet.')) continue; break }
      set({ phase: 'posting', step: 'Comprobando conexión y sesión…', log: [] })
      const f = await checkFb(true)
      if (!alive()) break
      if (f.state === 'offline') { release(); poster = null; if (await retryWait(me, 'No hay conexión con Facebook.')) continue; break }
      if (f.state === 'out') { release(); poster = null; if (await retryWait(me, 'No hay ninguna sesión de Facebook iniciada en este navegador.')) continue; break }
      set({ step: 'Preparando…' })
      if (!test) mutateHistory((hs) => { hs.find((h) => h.id === me)!.items[idx].inflight = Date.now() })
      const res = await publisherCommand('post', {
        url: it.url, text: runText(e, it, true), link: autoJobLink(e), files, test, groupName: it.name, win: st.autoWin, notify: st.sysNotify,
      }, 300000)
      mutateHistory((hs) => { delete hs.find((h) => h.id === me)!.items[idx].inflight })
      const msgs = Array.isArray(res.messages) ? (res.messages as unknown[]).map((m) => String(m).slice(0, 400)).filter((m) => m && !TRANSIENT.test(m.trim())).slice(0, 5) : []
      if (msgs.length && !test && alive()) {
        mutateHistory((hs) => { hs.find((h) => h.id === me)!.items[idx].fbMsg = msgs.join(' · ') })
        set({ msgs: [...msgs.map((t): FbMsg => ({ g: it.name, t, lv: res.blocked ? 'err' : RX_PEND.test(t) ? 'info' : 'notice', at: Date.now() })), ...cur().msgs].slice(0, 20) })
        if (st.sound) beep()
        if (!res.blocked) toast(`Facebook en «${it.name}»: ${msgs[0].slice(0, 120)}`)
      }
      if (!alive()) break
      const err = String(res.error || '')
      if (res.ok && res.test) {
        set({ stop: true, testDone: true, stopMsg: 'Mira la ventana de Facebook: el texto, las imágenes y el enlace deberían estar listos en el cuadro de publicación, sin publicar. Ciérralo sin publicar y, si todo estaba bien, pulsa «Todo bien: publicar de verdad».' })
        break
      }
      // pendiente de aprobación de los administradores = compartido (aunque Facebook lo presente como aviso o error)
      const pendingApproval = !res.ok && !res.blocked && [err, ...msgs].some((m) => RX_PEND.test(m)) && !/no puedes publicar|you can'?t post|no eres miembro|not a member/i.test(err)
      if (res.ok || pendingApproval) mark('done', pendingApproval ? 'awaiting' : (res.review as Review) || undefined, undefined, me)
      else if (res.blocked) {
        setLock(Date.now() + SAFE.LOCK_H * 3600e3, `«${err.slice(0, 300)}» (en ${it.name})`)
        mutateHistory((hs) => { hs.find((h) => h.id === me)!.items[idx].error = err.slice(0, 200) })
        set({ stop: true, stopMsg: `Facebook mostró un aviso: «${err.slice(0, 200)}». Se ha detenido todo y bloqueado 24 h para proteger tu cuenta.` })
        // el bloqueo es de la cuenta: se detienen también las demás publicaciones
        S().runs.forEach((x) => { if (x.entryId !== me && x.autoRunning) patchId(x.entryId, { stop: true, stopMsg: 'Detenida: Facebook mostró un aviso en otra publicación y se bloqueó 24 h para proteger tu cuenta.' }) })
        blockAlert = { g: it.name, e: err.slice(0, 300) }
        break
      } else if (['login', 'network', 'load'].includes(String(res.step)) || (res.step === 'ext' && /no está instalada|no está activa|Sin respuesta|Ya hay una publicación|Origen|no respondió/.test(err))) {
        if (res.step === 'login') useFb.setState({ state: 'out' })
        const why = res.step === 'login' ? 'No hay ninguna sesión de Facebook iniciada en este navegador.' : res.step === 'network' ? 'No hay conexión con Facebook.' : res.step === 'load' ? `El grupo «${it.name}» no terminó de cargar.` : 'La extensión no responde.'
        release(); poster = null
        if (await retryWait(me, why)) continue
        break
      } else if (res.step === 'timeout') {
        mutateHistory((hs) => { Object.assign(hs.find((h) => h.id === me)!.items[idx], { status: 'skipped', at: Date.now(), error: 'La extensión no respondió mientras se enviaba: revisa en el grupo si llegó a publicarse antes de reintentar [timeout]' }) })
      } else {
        mutateHistory((hs) => { Object.assign(hs.find((h) => h.id === me)!.items[idx], { status: 'skipped', at: Date.now(), error: err.slice(0, 200) + (res.step ? ` [${res.step}]` : '') }) })
      }
      set({ retries: 0 })
    } finally {
      if (poster === me) poster = null
      release() // liberar dos veces no hace nada
    }
  }
  off()

  const r = RR(me)
  if (r) {
    const e = runEntry(me)!
    const others = S().runs.some((x) => x.entryId !== me && x.autoRunning && !x.stop)
    if (!r.stop && !r.testDone && !e.items.some((i) => i.status === 'pending')) {
      const F = failedItems(e), ok = e.items.filter((i) => i.status === 'done').length, n = e.items.length
      if (st.autoClose && !others) await publisherCommand('closeFb', {}, 5000)
      if (st.sysNotify) publisherCommand('notify', {
        title: F.length ? `Publicación terminada con incidencias: ${ok} de ${n} grupos` : `Publicación terminada: ${ok} de ${n} grupos`,
        message: (e.name ? `«${e.name}». ` : '') + (F.length ? `No se pudo publicar en ${F.length} grupo(s): ` + F.slice(0, 4).map((i) => `${i.name} (${reasonOf(i.error)})`).join('; ') : 'Se publicó en todos los grupos seleccionados.'),
      }, 5000)
      if (st.sound) beep()
    }
    if (st.sysNotify && r.stop && !r.testDone && r.stopMsg && !r.userStop) publisherCommand('notify', { title: 'Publicación automática detenida', message: r.stopMsg }, 5000)
    if (!others) publisherCommand('badge', { text: r.stop && !r.testDone && e.items.some((i) => i.status === 'pending') ? 'II' : '' }, 3000)
    set({ autoRunning: false, phase: '', step: '', idx: e.items.some((i) => i.status === 'pending') ? r.idx : e.items.length })
    saveRunState(me)
  }
  if (blockAlert) {
    alertBox('report', `Facebook mostró un aviso en «${blockAlert.g}»`, `«${blockAlert.e}»\n\nSe ha detenido la publicación y se ha bloqueado durante 24 horas para proteger tu cuenta. Tu progreso está guardado.`)
  }
}

export function continueAuto(id = S().front ?? '') { patchId(id, { stop: false, testDone: false }); runAuto(id) }

/** Al terminar la prueba: desactiva el modo prueba. */
export async function confirmTestOk() {
  setPub((s) => ({ settings: { ...s.settings, autoTest: false } }))
  await closeRun(true)
  toast('Modo prueba desactivado. Cierra el cuadro de prueba en Facebook y pulsa «Comenzar publicación automática».')
}
