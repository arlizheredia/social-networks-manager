import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Banner, Button, Card, CardHead, IconButton, Input, PageHead, Select, toast, confirmBox } from '@/components/ui'
import { useExtension } from '@/features/extension/bridge'
import { parseFbUrl } from '@/features/publisher/fb'
import { useMedia } from '@/features/publisher/media'
import { setPub, updateSettings, usePublisher, SAFE, clamp } from '@/features/publisher/store'
import { failedItems, hhmm, PACES, paceLabel, postLabel, reasonOf, selectedGroups, usage } from '@/features/publisher/logic'
import { autoActive, checkFb, clearForm, retryFailed, startRun, useRun } from '@/features/publisher/run'
import { Editor } from '@/features/publisher/components/Editor'
import { Media } from '@/features/publisher/components/Media'
import { Destinations } from '@/features/publisher/components/Destinations'
import { Preview } from '@/features/publisher/components/Preview'
import { Preflight } from '@/features/publisher/components/Preflight'
import { SettingsDialog } from '@/features/settings/SettingsDialog'

function ResumeBanners() {
  const state = usePublisher()
  const run = useRun((s) => s.run)
  const [hidden, setHidden] = useState(false)
  if (run) return null
  const h = state.runId ? state.history.find((x) => x.id === state.runId) : undefined
  const pend = h ? h.items.filter((i) => i.status === 'pending').length : 0
  if (h && pend && !hidden) {
    const done = h.items.length - pend, pct = Math.round((done / h.items.length) * 100)
    return (
      <Banner tone="info" icon="pending_actions" action={
        <div className="flex flex-wrap gap-1">
          <Button size="sm" icon="play_arrow" onClick={() => startRun(h.id)}>{autoActive() ? 'Continuar' : 'Reanudar'}</Button>
          <Button size="sm" variant="text" onClick={() => { setHidden(true); toast('También puedes reanudarla desde el Historial.') }}>Más tarde</Button>
          <Button size="sm" variant="text" onClick={async () => {
            if (!(await confirmBox('¿Descartar los grupos que faltan?', `Los ${pend} grupo(s) pendientes se marcarán como no publicados. Lo ya publicado no cambia.`, 'Descartar', true))) return
            setPub((s) => ({ runId: null, history: s.history.map((x) => (x.id !== h.id ? x : { ...x, items: x.items.map((i) => (i.status === 'pending' ? { ...i, status: 'skipped' as const, error: 'Descartado', at: Date.now(), inflight: undefined } : i)) })) }))
            toast('Publicación cerrada')
          }}>Descartar</Button>
        </div>}>
        <b>Tienes una publicación a medias</b>
        <div className="text-xs">{done} de {h.items.length} grupos completados ({pct} %) · {postLabel(h)}</div>
      </Banner>
    )
  }
  const inc = state.history.find((x) => !x.ack && !x.items.some((i) => i.status === 'pending') && failedItems(x).length && Date.now() - x.date < 7 * 864e5)
  if (!inc) return null
  const F = failedItems(inc)
  return (
    <Banner tone="warn" action={<div className="flex gap-1"><Button size="sm" icon="refresh" onClick={() => retryFailed(inc.id)}>Reintentar</Button><Link to="/historial"><Button size="sm" variant="text">Detalles</Button></Link><Button size="sm" variant="text" onClick={() => setPub((s) => ({ history: s.history.map((x) => (x.id === inc.id ? { ...x, ack: true } : x)) }))}>Cerrar aviso</Button></div>}>
      <b>Publicación terminada con incidencias</b>
      <div className="text-xs">{F.length === 1 ? '1 grupo' : `${F.length} grupos`} sin publicar: {F.slice(0, 3).map((i) => `${i.name} (${reasonOf(i.error)})`).join('; ')}{F.length > 3 ? '…' : ''}</div>
    </Banner>
  )
}

export default function PublishPage() {
  const state = usePublisher()
  const media = useMedia((s) => s.items)
  const ext = useExtension((s) => s.publisher)
  const [preflight, setPreflight] = useState(false)
  const [checking, setChecking] = useState(false)
  const [settings, setSettings] = useState(false)
  const { draft, settings: st } = state
  const r = parseFbUrl(draft.url)
  const n = selectedGroups(state).length
  const hasContent = !!(r.url || draft.text.trim() || media.length)
  const used = usage(state).day.length
  const locked = !!state.lock && state.lock > Date.now()
  const auto = st.autoMode && !!ext

  const open = async () => {
    if (!navigator.onLine) { toast('Sin conexión a Internet: no se ha publicado nada.'); return }
    if (auto) {
      setChecking(true)
      const f = await checkFb(true)
      setChecking(false)
      if (f.state === 'offline') { toast('No hay conexión con Facebook. No se ha publicado nada.'); return }
      if (f.state === 'out') { toast('Inicia sesión en Facebook en este navegador y vuelve a intentarlo.'); window.open('https://www.facebook.com/', '_blank', 'noopener'); return }
    }
    setPreflight(true)
  }

  return (
    <div>
      <PageHead
        title="Publicar en grupos"
        sub="Prepara tu publicación una vez y compártela en todos tus grupos en unos minutos."
        actions={<Button variant="outlined" icon="note_add" onClick={() => { clearForm(); toast('Formulario vacío. Tus grupos y la selección se conservan.') }}>Nueva publicación</Button>}
      />
      <div className="mb-4 space-y-3">
        <ResumeBanners />
        {locked && <Banner tone="warn" icon="shield"><b>Publicación en pausa para proteger tu cuenta</b><div className="text-xs">{state.lockMsg ? `Motivo: ${state.lockMsg}. ` : 'Se detectó un aviso de Facebook. '}Podrás volver a publicar a partir de {hhmm(state.lock!)}.</div></Banner>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHead step={1} title="Publicación de origen" sub="La publicación de Facebook que quieres difundir (opcional si solo publicas contenido nuevo)" />
            <Input
              icon="link" type="url" inputMode="url" placeholder="https://www.facebook.com/…/posts/…" value={draft.url} aria-label="URL de la publicación"
              onChange={(e) => setPub((s) => ({ draft: { ...s.draft, url: e.target.value } }))}
              onBlur={() => { if (r.url && r.url !== draft.url) setPub((s) => ({ draft: { ...s.draft, url: r.url! } })) }}
              trail={<>
                {draft.url && <IconButton size="sm" icon="close" label="Vaciar URL" onClick={() => setPub((s) => ({ draft: { ...s.draft, url: '' } }))} />}
                <IconButton size="sm" icon="content_paste" label="Pegar URL" onClick={async () => { try { const t = (await navigator.clipboard.readText()).trim(); setPub((s) => ({ draft: { ...s.draft, url: parseFbUrl(t).url || t } })) } catch { toast('Pulsa Ctrl+V para pegar la URL') } }} />
                <IconButton size="sm" icon="open_in_new" label="Abrir en Facebook" onClick={() => (r.url ? window.open(r.url, '_blank', 'noopener') : toast('Primero introduce una URL válida'))} />
              </>}
            />
            <div className={`mt-1.5 text-xs ${r.error ? 'text-error' : r.url ? 'text-success' : 'text-text-2'}`}>
              {r.error ? r.error : r.url ? `✓ ${r.kind} de ${r.host}${r.cleaned ? ' · se eliminaron parámetros de rastreo' : ''}` : 'Admite publicaciones, fotos, vídeos, reels y enlaces «Compartir» de Facebook.'}
            </div>
          </Card>

          <Card>
            <CardHead step={2} title="Contenido" sub="Texto que acompañará a la publicación en cada grupo" />
            <Editor />
            <Media />
          </Card>

          <Card>
            <CardHead step={3} title="Destinos" sub={`${n} grupo${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'}`} />
            <Destinations />
          </Card>

          <div className="sticky bottom-20 z-20 flex flex-col gap-3 rounded-3xl bg-surface-3 p-3 shadow-2 sm:flex-row sm:items-center sm:p-4 md:bottom-4">
            <div className="min-w-0 flex-1 text-sm">
              {n ? <><b className="font-medium">{n} grupo{n > 1 ? 's' : ''}</b> · ≈ {Math.ceil((n * (25 + st.pause)) / 60)} min · hoy {used}/{st.dayCap}</> : <span className="text-text-2">Selecciona al menos un grupo de destino</span>}
              {n > 0 && !hasContent && <div className="text-xs text-error">Añade una URL, texto o archivos para empezar</div>}
              {n > 0 && hasContent && r.error && <div className="text-xs text-error">Revisa la URL de origen</div>}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-2">
                <label className="inline-flex items-center gap-1">Pausa
                  <Select className="!h-8 !w-auto !py-0 text-xs" value={st.pause} onChange={(e) => { updateSettings({ pause: clamp(e.target.value, SAFE.MIN_PAUSE, SAFE.MAX_PAUSE, 30) }); toast(`Pausa entre grupos: ${paceLabel(+e.target.value)}`) }}>
                    {[...new Set([...PACES, st.pause])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{paceLabel(v)}{v === SAFE.MIN_PAUSE ? ' (mínimo)' : ''}</option>)}
                  </Select>
                </label>
                <button className="inline-flex items-center gap-1 text-primary" onClick={() => setSettings(true)}>{auto ? `Automático${st.autoTest ? ' · prueba' : ''}` : st.autoMode ? 'Instalar extensión' : 'Publicar automáticamente'}</button>
              </div>
            </div>
            <Button size="lg" className="w-full sm:w-auto" icon={checking ? 'progress_activity' : auto ? 'smart_toy' : 'play_arrow'} disabled={!n || !hasContent || !!r.error || checking} onClick={open}>
              {checking ? 'Comprobando sesión…' : auto ? (st.autoTest ? 'Probar publicación automática' : 'Comenzar publicación automática') : 'Iniciar publicación asistida'}
            </Button>
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card filled className="!p-4">
            <h2 className="mb-3 text-lg">Vista previa</h2>
            <Preview />
            <p className="mt-2 text-xs text-text-2">Aproximación: Facebook puede mostrarla ligeramente distinta.</p>
          </Card>
        </aside>
      </div>
      <Preflight open={preflight} onClose={() => setPreflight(false)} />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} initial="publicar" />
    </div>
  )
}
