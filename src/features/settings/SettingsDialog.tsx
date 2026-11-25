import { useRef, useState, type ReactNode } from 'react'
import { Button, Chip, Dialog, Icon, NumberField, Select, Toggle, confirmBox, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useSettings, type ThemeMode } from '@/store/settings'
import { AIPanel } from '@/features/ai/AIDialog'
import { ExtensionPanel } from '@/features/extension/ExtensionDialog'
import { SAFE, clamp, setLock, updateSettings, usePublisher } from '@/features/publisher/store'
import { hhmm } from '@/features/publisher/logic'
import { setPrefs, usePrefs } from '@/features/comments/prefs'
import { exportBackup, importBackup, wipeAll } from './backup'

type Tab = 'general' | 'ia' | 'extension' | 'publicar' | 'comentarios' | 'datos'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'tune' },
  { id: 'ia', label: 'IA de la app', icon: 'auto_awesome' },
  { id: 'extension', label: 'Extensión', icon: 'extension' },
  { id: 'publicar', label: 'Publicar', icon: 'send' },
  { id: 'comentarios', label: 'Comentarios', icon: 'forum' },
  { id: 'datos', label: 'Tus datos', icon: 'shield' },
]

function Row({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-outline-2 py-3 last:border-0">
      <div className="min-w-48 flex-1"><div className="text-text">{title}</div>{sub && <div className="text-xs text-text-2">{sub}</div>}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
const Num = (p: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onOutOfRange?: (typed: number, fixed: number) => void }) => (
  <NumberField value={p.value} min={p.min} max={p.max} step={p.step} onChange={p.onChange} onOutOfRange={p.onOutOfRange} />
)

export function SettingsDialog({ open, onClose, initial = 'general' }: { open: boolean; onClose: () => void; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial)
  const { theme, setTheme } = useSettings()
  const { settings: st, lock } = usePublisher()
  const prefs = usePrefs()
  const fileRef = useRef<HTMLInputElement>(null)
  const locked = !!lock && lock > Date.now()

  return (
    <Dialog open={open} onClose={onClose} title="Ajustes" icon={<Icon name="settings" className="text-primary" />} wide actions={<Button onClick={onClose}>Listo</Button>}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto sm:w-48 sm:flex-col" aria-label="Secciones de ajustes">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-left text-sm font-medium', tab === t.id ? 'bg-secondary-container text-on-secondary-container' : 'text-text-2 hover:bg-text/8')}>
              <Icon name={t.icon} className="!text-[20px]" />{t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          {tab === 'general' && (
            <>
              <Row title="Tema" sub="Claro, oscuro o según el sistema">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((t) => <Chip key={t} selected={theme === t} onClick={() => setTheme(t)}>{{ light: 'Claro', dark: 'Oscuro', system: 'Sistema' }[t]}</Chip>)}
              </Row>
              <Row title="Notificaciones del sistema" sub="Aviso al terminar una publicación automática o un seguimiento con la app en segundo plano">
                <Toggle label="Notificaciones del sistema" checked={st.sysNotify} onChange={(v) => { updateSettings({ sysNotify: v }); if (v && 'Notification' in window) Notification.requestPermission() }} />
              </Row>
              <Row title="Sonido al terminar la pausa"><Toggle label="Sonido al terminar la pausa" checked={st.sound} onChange={(v) => updateSettings({ sound: v })} /></Row>
              <h3 className="mt-5 mb-1 text-base">Informes</h3>
              <p className="mb-2 text-xs text-text-2">Se usan en todos los informes (comentarios y difusión en grupos), que se exportan en hoja Carta con Arial a 12 pt.</p>
              <Row title="Cliente o marca"><input className="h-10 w-64 rounded-xl border border-outline bg-surface px-3" value={prefs.report.client} onChange={(e) => setPrefs({ report: { ...prefs.report, client: e.target.value } })} /></Row>
              <Row title="Elaborado por"><input className="h-10 w-64 rounded-xl border border-outline bg-surface px-3" value={prefs.report.author} onChange={(e) => setPrefs({ report: { ...prefs.report, author: e.target.value } })} /></Row>
            </>
          )}
          {tab === 'ia' && <AIPanel />}
          {tab === 'extension' && <ExtensionPanel />}
          {tab === 'publicar' && (
            <>
              <h3 className="mb-1 text-base">Protección de la cuenta</h3>
              <p className="mb-2 text-xs text-text-2">Límites que reducen el riesgo de bloqueos. Puedes hacerlos más estrictos, pero no desactivarlos.</p>
              <Row title="Pausa entre grupos (segundos)" sub={`Mínimo ${SAFE.MIN_PAUSE} s`}>
                <Num value={st.pause} min={SAFE.MIN_PAUSE} max={SAFE.MAX_PAUSE} step={5} onChange={(v) => updateSettings({ pause: clamp(v, SAFE.MIN_PAUSE, SAFE.MAX_PAUSE, 15) })} onOutOfRange={(n) => { if (n < SAFE.MIN_PAUSE) toast('La pausa mínima es de 10 segundos') }} />
              </Row>
              <Row title="Máximo de grupos por día" sub="Cada grupo, como mucho una vez cada 24 h">
                <Num value={st.dayCap} min={1} max={SAFE.MAX_DAY} onChange={(v) => updateSettings({ dayCap: v })} />
              </Row>
              {locked && (
                <Row title={<span className="text-error">Bloqueo de seguridad activo</span>} sub={`Nuevas publicaciones bloqueadas hasta ${hhmm(lock!)}.`}>
                  <Button variant="outlined" size="sm" onClick={async () => { if (await confirmBox('¿Quitar el bloqueo de seguridad?', 'Hazlo solo si comprobaste en Facebook que tu cuenta no tiene avisos ni restricciones.', 'Quitar bloqueo', true)) { setLock(null); toast('Bloqueo quitado') } }}>Quitar bloqueo</Button>
                </Row>
              )}
              <h3 className="mt-5 mb-1 text-base">Publicación asistida</h3>
              <Row title="Cómo abrir cada grupo">
                <Select value={st.mode} onChange={(e) => updateSettings({ mode: e.target.value as typeof st.mode })}>
                  <option value="side">Ventana lateral</option><option value="tab">Pestaña nueva</option><option value="share">Diálogo «Compartir» de Facebook</option>
                </Select>
              </Row>
              <Row title="Mostrar el enlace en el texto publicado"><Toggle label="Mostrar el enlace en el texto publicado" checked={st.appendUrl} onChange={(v) => updateSettings({ appendUrl: v })} /></Row>
              <Row title="Al terminar una publicación">
                <Select value={st.clearAfter} onChange={(e) => updateSettings({ clearAfter: e.target.value as typeof st.clearAfter })}>
                  <option value="ask">Preguntar</option><option value="always">Vaciar el formulario</option><option value="never">Conservarlo</option>
                </Select>
              </Row>
              <h3 className="mt-5 mb-1 text-base">Publicación automática (extensión)</h3>
              <Row title="Publicar automáticamente" sub="Usa la extensión y tu sesión de Facebook">
                <Toggle label="Publicar automáticamente" checked={st.autoMode} onChange={async (v) => {
                  if (v && !(await confirmBox('¿Activar la publicación automática?', 'Facebook no permite publicar de forma automatizada y puede haber bloqueos temporales de la cuenta. Los límites de seguridad seguirán activos. ', 'Activar, asumo el riesgo', true))) return
                  updateSettings({ autoMode: v })
                }} />
              </Row>
              <Row title="Modo prueba" sub="Prepara la publicación en el primer grupo pero no pulsa «Publicar»"><Toggle label="Modo prueba" checked={st.autoTest} onChange={(v) => updateSettings({ autoTest: v })} /></Row>
              <Row title="Cerrar la ventana de Facebook al terminar"><Toggle label="Cerrar la ventana de Facebook al terminar" checked={st.autoClose} onChange={(v) => updateSettings({ autoClose: v })} /></Row>
              <Row title="Dónde trabaja la publicación automática">
                <Select value={st.autoWin} onChange={(e) => updateSettings({ autoWin: e.target.value as typeof st.autoWin })}>
                  <option value="minimized">Ventana minimizada (predeterminada)</option><option value="nofocus">Ventana pequeña sin quitarte el foco</option><option value="tab">Pestaña en segundo plano</option><option value="focused">Ventana en primer plano</option>
                </Select>
              </Row>
              <Row title="Reintentos automáticos" sub="Ante fallos de conexión o de carga">
                <Num value={st.retries} min={0} max={50} onChange={(v) => updateSettings({ retries: v })} /> <span className="text-text-2">cada</span>
                <Num value={st.retryEvery} min={5} max={600} step={5} onChange={(v) => updateSettings({ retryEvery: v })} /> <span className="text-text-2">s</span>
              </Row>
            </>
          )}
          {tab === 'comentarios' && (
            <>
              <h3 className="mb-1 text-base">Informe de comentarios</h3>
              <Row title="Enfoque por defecto" sub="La IA buscará los comentarios sobre este tema">
                <input className="h-10 w-64 rounded-xl border border-outline bg-surface px-3" value={prefs.report.focus} onChange={(e) => setPrefs({ report: { ...prefs.report, focus: e.target.value } })} />
              </Row>
              <h3 className="mt-5 mb-1 text-base">Extracción con la extensión</h3>
              <Row title="Ventana de trabajo">
                <Select value={prefs.extract.win} onChange={(e) => setPrefs({ extract: { ...prefs.extract, win: e.target.value as typeof prefs.extract.win } })}>
                  <option value="small">En segundo plano (recomendada)</option><option value="minimized">Minimizada</option><option value="normal">A la vista</option>
                </Select>
              </Row>
              <Row title="Ritmo prudente" sub="Pausas largas de vez en cuando para parecer una persona"><Toggle label="Ritmo prudente" checked={prefs.extract.careful} onChange={(v) => setPrefs({ extract: { ...prefs.extract, careful: v } })} /></Row>
              <Row title="Dejar abiertas las pestañas al terminar"><Toggle label="Dejar abiertas las pestañas al terminar" checked={prefs.extract.keep} onChange={(v) => setPrefs({ extract: { ...prefs.extract, keep: v } })} /></Row>
              <Row title="Tiempo máximo por publicación (min)"><Num value={prefs.extract.maxMin} min={2} max={180} onChange={(v) => setPrefs({ extract: { ...prefs.extract, maxMin: v } })} /></Row>
              <Row title="Pausa entre publicaciones (s)"><Num value={prefs.extract.gap} min={0} max={120} onChange={(v) => setPrefs({ extract: { ...prefs.extract, gap: v } })} /></Row>
              <Row title="Reintentos ante fallos"><Num value={prefs.extract.retries} min={1} max={10} onChange={(v) => setPrefs({ extract: { ...prefs.extract, retries: v } })} /></Row>
            </>
          )}
          {tab === 'datos' && (
            <>
              <p className="mb-3 text-text-2">Todo se guarda solo en este navegador: no hay servidor y nunca se piden contraseñas de tus redes.</p>
              <Row title="Copia de seguridad" sub="Grupos, historial, plantillas, seguimientos, comentarios y preferencias. También importa copias de Facebook Publisher y Social Comments Analyzer.">
                <Button variant="outlined" size="sm" icon="download" onClick={() => exportBackup()}>Exportar</Button>
                <Button variant="outlined" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>Restaurar</Button>
                <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { await importBackup(f); toast('Copia restaurada') } catch (err) { toast('No se pudo restaurar: ' + (err as Error).message) } }} />
              </Row>
              <Row title={<span className="text-error">Borrar los datos de publicación</span>} sub="Grupos, historial, plantillas y archivos. Los seguimientos de comentarios se borran desde el Historial.">
                <Button variant="danger" size="sm" onClick={async () => { if (await confirmBox('¿Borrar todos los datos?', 'Se borrarán tus grupos, el historial, las plantillas, los archivos y las preferencias de este navegador.', 'Borrar todo', true)) wipeAll() }}>Borrar</Button>
              </Row>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
