import { useNavigate } from 'react-router-dom'
import { Button, FloatingWindow, Icon, IconButton, toast } from '@/components/ui'
import { analysisName, setRun, useCompRun, useCompetition } from './store'
import { RunProgress } from './RunProgress'

/**
 * Ventana flotante (se arrastra, centrada por defecto) de la actualización de un análisis de competencia. Se ve en
 * cualquier pantalla; en segundo plano queda como tarjeta arriba a la derecha. Al terminar ofrece abrir el informe.
 */
export function CompWindow() {
  const nav = useNavigate()
  const { step, pct, web, active, bg, done } = useCompRun()
  const analyses = useCompetition((s) => s.analyses)
  if (bg || (!step && !done)) return null
  const id = step ? active : done?.id
  const name = analysisName(analyses.find((a) => a.id === id)?.provinces || [])
  return (
    <FloatingWindow id="competencia" label={`Análisis de la competencia ${name}`} className="max-h-[min(80dvh,640px)] w-[min(820px,calc(100vw-16px))]"
      head={<>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name={step ? 'progress_activity' : 'task_alt'} className={step ? 'animate-spin' : ''} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg leading-6">{step ? 'Actualizando' : 'Actualizado'}: {name}</h2>
          <div className="text-xs text-text-2">Análisis de la competencia</div>
        </div>
        {step && <Button size="sm" variant="tonal" icon="picture_in_picture_alt" onClick={() => { setRun({ bg: true }); toast('Análisis en segundo plano: sigue en curso. Toca su tarjeta arriba a la derecha para volver.', 'picture_in_picture_alt') }}><span className="hidden sm:inline">Segundo plano</span></Button>}
        <IconButton icon="close" label={step ? 'Cerrar (sigue en segundo plano)' : 'Cerrar'} onClick={() => (step ? setRun({ bg: true }) : setRun({ done: null }))} />
      </>}>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {step ? <RunProgress step={step} pct={pct} web={web} /> : done && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="anim-bounce grid size-14 place-items-center rounded-full bg-success-container text-success"><Icon name="task_alt" size={30} /></span>
            <p className="text-text-2">La actualización recogió la información nueva y quedó guardada en el análisis.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button icon="description" onClick={() => { setRun({ model: done.model, done: null, tab: 'new' }); nav('/competencia') }}>Ver informe</Button>
              <Button variant="text" onClick={() => setRun({ done: null })}>Cerrar</Button>
            </div>
          </div>
        )}
      </div>
    </FloatingWindow>
  )
}
