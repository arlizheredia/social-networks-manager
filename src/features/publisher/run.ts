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
}

export const useRun = create<{ run: RunState | null }>(() => ({ run: null }))
const R = () => useRun.getState().run
const patch = (p: Partial<RunState>) => useRun.setState((s) => (s.run ? { run: { ...s.run, ...p } } : s))
export const runEntry = (): HistoryEntry | undefined => { const r = R(); return r ? getPub().history.find((h) => h.id === r.entryId) : undefined }

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
    if (!r.ok) next.state = 'unknown'
    else if (r.online === false) next.state = 'offline'
    else if (r.loggedIn === false) next.state = 'out'
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
  const rid = R()?.entryId ?? id
  const h = rid && getPub().history.find((x) => x.id === rid)
  setPub({ runId: h && h.items.some((i) => i.status === 'pending') ? rid! : null })
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
  let entryId: string
  if (fromHistId) {
    await resolveInflight(fromHistId)
    entryId = fromHistId
  } else {
    const { draft } = getPub()
    const r = parseFbUrl(draft.url)
    if (r.error) { toast('La URL de origen no es válida'); return }
    const groups = selectedGroups().filter((g) => !isRecent(g))
    if (!groups.length) { toast('Selecciona al menos un grupo disponible'); return }
    if (!r.url && !draft.text.trim() && !useMedia.getState().items.length) { toast('Añade una URL, texto o archivos'); return }
    const entry: HistoryEntry = {
      id: uid().slice(0, 36), date: Date.now(), url: r.url || '', text: draft.text, mediaCount: useMedia.getState().items.length,
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
  useRun.setState({ run: {
    entryId, idx: idx < 0 ? e.items.length : idx, opened: false, auto: autoActive(), autoRunning: false, stop: false, stopMsg: '',
    userStop: false, testDone: false, retries: 0, retry: null, phase: '', step: '', log: [], msgs: [], cleared: false,
  } })
  saveRunState()
  if (autoActive()) runAuto()
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

export function mark(status: 'done' | 'skipped', review?: Review, error?: string) {
  const r = R(), e = runEntry()
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
  const items = runEntry()!.items
  const next = items.findIndex((x, i) => i > r.idx && x.status === 'pending')
  const any = next >= 0 ? next : items.findIndex((x) => x.status === 'pending')
  patch({ idx: any < 0 ? items.length : any, opened: false })
  saveRunState()
}

export function jumpTo(i: number) {
  const r = R(), e = runEntry()
  if (!r || !e || r.autoRunning) return
  const it = e.items[i]
  if (it.status === 'done') { toast('Este grupo ya está marcado como publicado'); return }
  if (it.status !== 'pending') mutateHistory((hs) => { const x = hs.find((h) => h.id === r.entryId)!.items[i]; x.status = 'pending'; x.at = null })
  patch({ idx: i, opened: false })
}

export async function closeRun(force = false) {
  const r = R(), e = runEntry()
  if (!r) return
  const pending = e?.items.filter((i) => i.status === 'pending').length ?? 0
  if (!force && pending && !(await confirmBox(
    r.autoRunning ? '¿Detener la publicación automática?' : '¿Salir de la publicación asistida?',
    `Quedan ${pending} grupo(s) pendientes. ${r.autoRunning ? 'Si hay un grupo en curso, puede que termine de publicarse. ' : ''}Podrás reanudar desde el Historial.`, 'Salir'))) return
  patch({ stop: true })
  const id = r.entryId
  useRun.setState({ run: null })
  saveRunState(id)
  document.title = 'Social Networks Manager'
}

export async function panicStop() {
  if (!(await confirmBox('¿Facebook te ha mostrado un aviso?', 'Detendremos la publicación y bloquearemos nuevas publicaciones durante 24 horas para que tu cuenta se recupere. Tu progreso queda guardado en el Historial.', 'Detener y proteger', true))) return
  setLock(Date.now() + SAFE.LOCK_H * 3600e3, 'Lo indicaste tú con «Facebook me mostró un aviso».')
  await closeRun(true)
}

/** Vacía el formulario de publicación (los grupos y la selección se conservan). */
export function clearForm() {
  setPub({ draft: { url: '', text: '' } })
  clearMedia()
}

/* ---------- Modo automático ---------- */
async function retryWait(reason: string): Promise<boolean> {
  const r = R()!
  const retries = r.retries + 1, max = getPub().settings.retries
  if (retries > max) {
    patch({ retries, stop: true, stopMsg: `${reason} Se agotaron los ${max} reintentos y se ha detenido la publicación. Tu progreso está guardado: pulsa «Continuar» cuando se resuelva.` })
    return false
  }
  patch({ retries, retry: { n: retries, max, until: Date.now() + getPub().settings.retryEvery * 1000, reason }, phase: 'retry' })
  publisherCommand('badge', { text: '↻' }, 3000)
  const me = r.entryId
  while (R()?.entryId === me && R()!.retry && Date.now() < R()!.retry!.until && !R()!.stop) await wsleep(1000)
  patch({ retry: null })
  return !!R() && R()!.entryId === me && !R()!.stop
}
export const retryNow = () => { const r = R(); if (r?.retry) patch({ retry: { ...r.retry, until: 0 } }) }
export const stopAfterCurrent = () => { const r = R(); patch({ stop: true, userStop: true, stopMsg: 'La has detenido. Tu progreso está guardado; pulsa Continuar cuando quieras.', retry: r?.retry ? { ...r.retry, until: 0 } : null }); toast('Se detendrá al terminar el grupo actual') }

window.addEventListener('online', () => retryNow())
window.addEventListener('offline', () => { const r = R(); if (r?.autoRunning && !r.stop) patch({ stop: true, stopMsg: 'Se perdió la conexión a Internet. Pulsa «Continuar» cuando vuelva; tu progreso está guardado.' }) })
window.addEventListener('beforeunload', (e) => { const r = R(); if (r?.autoRunning && !r.stop) { e.preventDefault(); e.returnValue = '' } })

const TRANSIENT = /^(publicando|posting|publicado|posted|compartiendo|sharing|subiendo|uploading|cargando|loading|enviando|sending|procesando|processing)\b[\s.…]*(\d+\s*%)?[\s.…]*$/i

export async function runAuto() {
  const r0 = R()
  if (!r0 || r0.autoRunning) return
  const me = r0.entryId
  const alive = () => R()?.entryId === me
  patch({ auto: true, autoRunning: true, stop: false, stopMsg: '', userStop: false, retries: 0, retry: null, log: [], testDone: false })
  const st = getPub().settings
  const test = st.autoTest
  const media = useMedia.getState().items.filter((m) => m.type === 'image' || m.type === 'video')
  const total = media.reduce((a, m) => a + (m.file.size || 0), 0)
  if (total > 60 * 1024 * 1024) patch({ stop: true, stopMsg: 'Los archivos superan 60 MB: reduce su tamaño o usa el modo asistido.' })
  const files = R()!.stop ? [] : await Promise.all(media.map(async (m) => ({ name: m.name, type: m.file.type || (m.type === 'image' ? 'image/png' : 'video/mp4'), data: await fileToDataUrl(m.file) })))
  const off = onPublisherProgress((step) => { const r = R(); if (r && alive()) patch({ step, log: [...r.log, step].slice(-20) }) })
  let blockAlert: { g: string; e: string } | null = null

  while (alive() && !R()!.stop) {
    const e = runEntry()!
    const idx = e.items.findIndex((i) => i.status === 'pending')
    if (idx < 0) break
    patch({ idx })
    const it = e.items[idx]
    let G = gate()
    while (!G.ok && alive() && !R()!.stop) {
      if (G.reason === 'lock' || G.reason === 'day') {
        patch({ stop: true, stopMsg: G.reason === 'day' ? `Límite diario alcanzado. Podrás continuar a partir de ${hhmm(G.until)}.` : 'Publicación bloqueada por seguridad.' })
        break
      }
      patch({ phase: 'wait' })
      await wsleep(Math.min(5000, Math.max(500, G.until - Date.now() + 300)))
      G = gate()
    }
    if (!alive() || R()!.stop) break
    const g = getPub().groups.find((x) => x.id === it.gid)
    if (g && isRecent(g)) {
      mutateHistory((hs) => { const x = hs.find((h) => h.id === me)!.items[idx]; Object.assign(x, { status: 'skipped', error: 'Ya publicaste aquí hace menos de 24 h', at: Date.now() }) })
      continue
    }
    if (!navigator.onLine) { if (await retryWait('Sin conexión a Internet.')) continue; break }
    patch({ phase: 'posting', step: 'Comprobando conexión y sesión…', log: [] })
    const f = await checkFb(true)
    if (!alive()) break
    if (f.state === 'offline') { if (await retryWait('No hay conexión con Facebook.')) continue; break }
    if (f.state === 'out') { if (await retryWait('No hay ninguna sesión de Facebook iniciada en este navegador.')) continue; break }
    patch({ step: 'Preparando…' })
    if (!test) mutateHistory((hs) => { hs.find((h) => h.id === me)!.items[idx].inflight = Date.now() })
    const res = await publisherCommand('post', {
      url: it.url, text: runText(e, it, true), link: autoJobLink(e), files, test, groupName: it.name, win: st.autoWin, notify: st.sysNotify,
    }, 300000)
    mutateHistory((hs) => { delete hs.find((h) => h.id === me)!.items[idx].inflight })
    const msgs = Array.isArray(res.messages) ? (res.messages as unknown[]).map((m) => String(m).slice(0, 400)).filter((m) => m && !TRANSIENT.test(m.trim())).slice(0, 5) : []
    if (msgs.length && !test) {
      mutateHistory((hs) => { hs.find((h) => h.id === me)!.items[idx].fbMsg = msgs.join(' · ') })
      patch({ msgs: [...msgs.map((t): FbMsg => ({ g: it.name, t, lv: res.blocked ? 'err' : RX_PEND.test(t) ? 'info' : 'notice', at: Date.now() })), ...R()!.msgs].slice(0, 20) })
      if (st.sound) beep()
      if (!res.blocked) toast(`Facebook en «${it.name}»: ${msgs[0].slice(0, 120)}`)
    }
    if (!alive()) break
    const err = String(res.error || '')
    if (res.ok && res.test) {
      patch({ stop: true, testDone: true, stopMsg: 'Mira la ventana de Facebook: el texto, las imágenes y el enlace deberían estar listos en el cuadro de publicación, sin publicar. Ciérralo sin publicar y, si todo estaba bien, pulsa «Todo bien: publicar de verdad».' })
      break
    }
    if (res.ok) mark('done', (res.review as Review) || undefined)
    else if (res.blocked) {
      setLock(Date.now() + SAFE.LOCK_H * 3600e3, `«${err.slice(0, 300)}» (en ${it.name})`)
      mutateHistory((hs) => { hs.find((h) => h.id === me)!.items[idx].error = err.slice(0, 200) })
      patch({ stop: true, stopMsg: `Facebook mostró un aviso: «${err.slice(0, 200)}». Se ha detenido todo y bloqueado 24 h para proteger tu cuenta.` })
      blockAlert = { g: it.name, e: err.slice(0, 300) }
      break
    } else if (['login', 'network', 'load'].includes(String(res.step)) || (res.step === 'ext' && /no está instalada|no está activa|Sin respuesta|Ya hay una publicación|Origen|no respondió/.test(err))) {
      if (res.step === 'login') useFb.setState({ state: 'out' })
      const why = res.step === 'login' ? 'No hay ninguna sesión de Facebook iniciada en este navegador.' : res.step === 'network' ? 'No hay conexión con Facebook.' : res.step === 'load' ? `El grupo «${it.name}» no terminó de cargar.` : 'La extensión no responde.'
      if (await retryWait(why)) continue
      break
    } else if (res.step === 'timeout') {
      mutateHistory((hs) => { Object.assign(hs.find((h) => h.id === me)!.items[idx], { status: 'skipped', at: Date.now(), error: 'La extensión no respondió mientras se enviaba: revisa en el grupo si llegó a publicarse antes de reintentar [timeout]' }) })
    } else {
      mutateHistory((hs) => { Object.assign(hs.find((h) => h.id === me)!.items[idx], { status: 'skipped', at: Date.now(), error: err.slice(0, 200) + (res.step ? ` [${res.step}]` : '') }) })
    }
    patch({ retries: 0 })
  }
  off()

  const r = R()
  if (r && alive()) {
    const e = runEntry()!
    if (!r.stop && !r.testDone && !e.items.some((i) => i.status === 'pending')) {
      const F = failedItems(e), ok = e.items.filter((i) => i.status === 'done').length, n = e.items.length
      if (st.autoClose) await publisherCommand('closeFb', {}, 5000)
      if (st.sysNotify) publisherCommand('notify', {
        title: F.length ? `Publicación terminada con incidencias: ${ok} de ${n} grupos` : `Publicación terminada: ${ok} de ${n} grupos`,
        message: F.length ? `No se pudo publicar en ${F.length} grupo(s): ` + F.slice(0, 4).map((i) => `${i.name} (${reasonOf(i.error)})`).join('; ') : 'Se publicó en todos los grupos seleccionados.',
      }, 5000)
      if (st.sound) beep()
    }
    if (st.sysNotify && r.stop && !r.testDone && r.stopMsg && !r.userStop) publisherCommand('notify', { title: 'Publicación automática detenida', message: r.stopMsg }, 5000)
    publisherCommand('badge', { text: r.stop && !r.testDone && e.items.some((i) => i.status === 'pending') ? 'II' : '' }, 3000)
    patch({ autoRunning: false, phase: '', idx: e.items.some((i) => i.status === 'pending') ? r.idx : e.items.length })
  }
  if (blockAlert) {
    alertBox('report', `Facebook mostró un aviso en «${blockAlert.g}»`, `«${blockAlert.e}»\n\nSe ha detenido la publicación y se ha bloqueado durante 24 horas para proteger tu cuenta. Tu progreso está guardado.`)
  }
}

export function continueAuto() { patch({ stop: false, testDone: false }); runAuto() }

/** Al terminar la prueba: desactiva el modo prueba. */
export async function confirmTestOk() {
  setPub((s) => ({ settings: { ...s.settings, autoTest: false } }))
  await closeRun(true)
  toast('Modo prueba desactivado. Cierra el cuadro de prueba en Facebook y pulsa «Comenzar publicación automática».')
}
