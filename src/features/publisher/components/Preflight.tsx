import { Banner, Button, Dialog, Icon, confirmBox, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useExtension } from '@/features/extension/bridge'
import { parseFbUrl } from '../fb'
import { SAFE, setLock, usePublisher } from '../store'
import { activeGroups, gate, hhmm, isRecent, selectedGroups, usage } from '../logic'
import { autoActive, startRun, useFb } from '../run'

type Lvl = 'ok' | 'warn' | 'err' | 'info'
const COL: Record<Lvl, string> = { ok: 'text-success', warn: 'text-warn', err: 'text-error', info: 'text-primary' }

/** Comprobación de seguridad antes de empezar a publicar. */
export function Preflight({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = usePublisher()
  const fb = useFb()
  const ext = useExtension((s) => s.publisher)
  if (!open) return null
  const st = state.settings, u = usage(state), now = Date.now(), left = Math.max(0, st.dayCap - u.day.length)
  const sel = selectedGroups(state).filter((g) => !isRecent(g))
  const text = state.draft.text, r = parseFbUrl(state.draft.url)
  const locked = !!state.lock && state.lock > now
  const checks: { lvl: Lvl; icon: string; t: string; d: string }[] = []
  const add = (lvl: Lvl, icon: string, t: string, d: string) => checks.push({ lvl, icon, t, d })
  const auto = autoActive()
  if (auto && fb.state === 'in') add('ok', 'verified', `Cuenta: ${fb.name || 'ID ' + fb.id}`, 'Se publicará con esta cuenta de Facebook.')
  if (st.autoMode) add(ext ? 'info' : 'warn', ext ? 'smart_toy' : 'extension_off', ext ? (st.autoTest ? 'Publicación automática · modo prueba' : 'Publicación automática') : 'Extensión no detectada',
    ext ? (st.autoTest ? 'Se preparará la publicación en el primer grupo sin pulsar «Publicar», para que la revises.' : 'La extensión publicará en cada grupo con tu sesión. Mantén abierta esta pestaña.') : 'Se usará el modo asistido. Instala la extensión para publicar automáticamente.')
  if (locked) add('err', 'block', 'Bloqueo de seguridad activo', `${state.lockMsg ? `Motivo: ${state.lockMsg}. ` : 'Se detectó un aviso de Facebook. '}Podrás publicar a partir de ${hhmm(state.lock!)}.`)
  if (left === 0) { const G = gate(state); add('warn', 'event_busy', 'Límite diario alcanzado', `Ya has publicado en ${u.day.length} grupos en 24 h. El asistente esperará hasta ${hhmm(G.ok ? now : G.until)}.`) }
  else if (sel.length > left) add('warn', 'event_busy', `Hoy solo quedan ${left} de ${st.dayCap} publicaciones`, `Has seleccionado ${sel.length} grupos. El resto quedará pendiente y podrás reanudarlo desde el Historial.`)
  else add('ok', 'event_available', 'Dentro del límite diario', `${u.day.length + sel.length} de ${st.dayCap} grupos en 24 h.`)
  const est = Math.ceil((sel.length * (st.pause + 25)) / 60)
  if (st.pause < 15 || sel.length > 40) add('warn', 'speed', 'Ritmo intenso', `Pausa de ${st.pause} s entre grupos y ${sel.length} grupos. Un ritmo así se parece al de las cuentas de spam y aumenta el riesgo de bloqueo. Tiempo estimado ≈ ${est} min.`)
  else add('ok', 'timer', 'Ritmo', `Pausa de ${st.pause} s entre grupos. Tiempo estimado ≈ ${est} min.`)
  const recent = activeGroups(state).filter((g) => isRecent(g)).length
  if (recent) add('info', 'lock_clock', `${recent} grupo(s) excluidos`, `Ya publicaste en ellos en las últimas ${SAFE.RECENT_H} h.`)
  if (sel.length > 3 && !/\{grupo\}/i.test(text)) add('warn', 'content_copy', 'Mismo texto en todos los grupos', 'Facebook detecta mejor el texto repetido. Añade {grupo} o un saludo propio para personalizarlo.')
  const urls = (text.match(/https?:\/\/\S+/g) || []).length, tags = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length
  if (urls > 2) add('warn', 'link', 'Muchos enlaces en el texto', `Hay ${urls} enlaces. Más de 1–2 enlaces por publicación es una señal habitual de spam.`)
  if (tags > 5) add('warn', 'tag', 'Muchos hashtags', `Hay ${tags} hashtags. Usa 1–3 relevantes.`)
  if (r.kind === 'Publicación de grupo') add('info', 'visibility', 'Publicación de origen dentro de un grupo', 'Si el grupo de origen es privado, quienes no sean miembros no podrán verla.')
  const ruled = sel.filter((g) => g.notes).length
  if (ruled) add('info', 'gavel', `${ruled} grupo(s) con normas anotadas`, 'Se mostrarán en cada paso: respétalas para evitar denuncias.')
  if (!checks.some((c) => c.lvl === 'warn' || c.lvl === 'err')) add('ok', 'check_circle', 'Todo listo', 'Tu publicación cumple las recomendaciones de seguridad.')

  return (
    <Dialog open={open} onClose={onClose} title="Comprobación de seguridad" icon={<Icon name="verified_user" className="text-primary" />}
      actions={<>
        <Button variant="text" onClick={onClose}>Revisar</Button>
        <Button icon="play_arrow" disabled={locked || !sel.length} onClick={() => { onClose(); startRun() }}>Empezar ({sel.length} grupo{sel.length === 1 ? '' : 's'})</Button>
      </>}>
      <p className="mb-3 text-text-2">Revisamos tu publicación antes de empezar para proteger tu cuenta de Facebook.</p>
      <div className="space-y-3">
        {checks.map((c, i) => (
          <div key={i} className="flex items-start gap-3">
            <Icon name={c.icon} className={cn('mt-0.5', COL[c.lvl])} />
            <div><div className="font-medium">{c.t}</div><div className="text-[13px] text-text-2">{c.d}</div></div>
          </div>
        ))}
      </div>
      {locked && (
        <Banner tone="warn" className="mt-4" action={<Button size="sm" variant="outlined" onClick={async () => {
          if (await confirmBox('¿Quitar el bloqueo y publicar de todas maneras?', 'Si Facebook te mostró de verdad un aviso, seguir publicando puede provocar restricciones. Hazlo solo si comprobaste que fue una falsa alarma. La pausa y el límite diario siguen activos.', 'Publicar de todas maneras', true)) { setLock(null); toast('Bloqueo quitado') }
        }}>Publicar de todas maneras</Button>}>
          <b>¿Fue una falsa alarma?</b> Si has comprobado en Facebook que tu cuenta no tiene avisos, puedes quitar el bloqueo.
        </Banner>
      )}
    </Dialog>
  )
}
