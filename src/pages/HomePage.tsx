import { Link } from 'react-router-dom'
import { Banner, Button, Card, Icon, Stat } from '@/components/ui'
import { usePublisher } from '@/features/publisher/store'
import { activeGroups, awaitingItems, usage } from '@/features/publisher/logic'
import { useTR, trackProgress, inHistory } from '@/features/comments/tracking'
import { useAI } from '@/features/ai/engine'
import { useExtension } from '@/features/extension/bridge'
import { useSettings } from '@/store/settings'
import { fmtNum } from '@/lib/util'

function Action({ to, icon, title, text }: { to: string; icon: string; title: string; text: string }) {
  return (
    <Link to={to} className="group flex items-start gap-4 rounded-3xl border border-outline-2 bg-surface p-5 text-text no-underline transition-shadow hover:shadow-2">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-container text-on-primary-container transition-colors group-hover:bg-primary group-hover:text-on-primary"><Icon name={icon} /></span>
      <div><div className="font-display text-lg">{title}</div><div className="text-text-2">{text}</div></div>
    </Link>
  )
}

export default function HomePage() {
  const pub = usePublisher()
  const { tracks, posts, running } = useTR()
  const ai = useAI()
  const ext = useExtension((s) => s.version)
  const { welcomeDismissed, dismissWelcome } = useSettings()
  const day = usage(pub).day.length
  const pendingRuns = pub.history.filter((h) => h.items.some((i) => i.status === 'pending')).length
  const aw = awaitingItems(pub.history).length
  const runningT = tracks.find((t) => t.id === running)
  const lastDone = tracks.find(inHistory)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] leading-10">Hola 👋</h1>
        <p className="text-text-2">Publica en tus grupos de Facebook y analiza lo que opinan en Facebook, Instagram y TikTok, todo desde aquí.</p>
      </div>

      {!welcomeDismissed && (!pub.groups.length || !ai.installed || !ext) && (
        <Card filled>
          <div className="flex items-start gap-3">
            <Icon name="rocket_launch" className="text-primary" />
            <div className="flex-1">
              <h2 className="mb-2 text-lg">Primeros pasos</h2>
              <ol className="space-y-2">
                <li className="flex items-center gap-2"><Icon name={pub.groups.length ? 'check_circle' : 'radio_button_unchecked'} className={pub.groups.length ? 'text-success' : 'text-text-3'} /> <Link to="/grupos">Añade tus grupos de Facebook</Link></li>
                <li className="flex items-center gap-2"><Icon name={ai.installed ? 'check_circle' : 'radio_button_unchecked'} className={ai.installed ? 'text-success' : 'text-text-3'} /> Instala la IA de la app (botón <b className="font-medium">Instalar IA</b>, arriba)</li>
                <li className="flex items-center gap-2"><Icon name={ext ? 'check_circle' : 'radio_button_unchecked'} className={ext ? 'text-success' : 'text-text-3'} /> Instala la extensión de Chrome para automatizar (opcional)</li>
              </ol>
            </div>
            <Button variant="text" size="sm" onClick={dismissWelcome}>Ocultar</Button>
          </div>
        </Card>
      )}

      {pendingRuns > 0 && (
        <Banner tone="info" icon="pending_actions" action={<Link to="/historial"><Button size="sm">Ver</Button></Link>}>
          <b>Tienes {pendingRuns === 1 ? 'una publicación a medias' : `${pendingRuns} publicaciones a medias`}.</b> Puedes reanudarla desde el Historial.
        </Banner>
      )}
      {runningT && (
        <Banner tone="info" icon="progress_activity" action={<Link to="/comentarios"><Button size="sm">Ver</Button></Link>}>
          <b>Extrayendo comentarios:</b> «{runningT.name}» · {trackProgress(runningT).pct} %
        </Banner>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Action to="/publicar" icon="send" title="Publicar en grupos" text="Prepara tu publicación una vez y compártela en todos tus grupos." />
        <Action to="/comentarios" icon="forum" title="Analizar comentarios" text="Obtén, busca y responde los comentarios de tus publicaciones." />
        <Action to="/informes" icon="summarize" title="Crear un informe" text="Informe de comentarios o de difusión, listo para Word, PDF o WhatsApp." />
        <Action to="/historial" icon="history" title="Ver el historial" text="Todo lo publicado y todos los seguimientos, en un solo lugar." />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Grupos activos" value={fmtNum(activeGroups(pub).length)} icon={<Icon name="group" />} />
        <Stat label={`Publicados hoy (máx. ${pub.settings.dayCap})`} value={fmtNum(day)} icon={<Icon name="send" />} tone="success" />
        <Stat label="Publicaciones seguidas" value={fmtNum(posts.length)} icon={<Icon name="track_changes" />} />
        <Stat label="En aprobación" value={fmtNum(aw)} icon={<Icon name="pending" />} tone="warn" />
      </div>

      {lastDone && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Icon name="analytics" className="text-primary" />
            <div className="flex-1"><div className="font-medium">Último seguimiento: {lastDone.name}</div><div className="text-text-2">{fmtNum(trackProgress(lastDone).comments)} comentarios de {lastDone.postIds.length} publicaciones</div></div>
            <Link to={`/informes?t=${lastDone.id}`}><Button variant="tonal" icon="summarize">Crear informe</Button></Link>
          </div>
        </Card>
      )}
    </div>
  )
}
