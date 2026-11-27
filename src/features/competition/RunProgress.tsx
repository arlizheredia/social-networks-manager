import { Icon } from '@/components/ui'

/** Pasos de la generación con su tramo de porcentaje (con búsqueda en Internet; sin ella, solo el análisis en 0–100 %). */
const WEB_STEPS = [
  { label: 'Buscar en Google', icon: 'travel_explore', to: 21 },
  { label: 'Leer los sitios encontrados', icon: 'language', to: 31 },
  { label: 'Revisar los competidores y la ficha de tu marca', icon: 'storefront', to: 40 },
]
const ANALYSIS_STEPS = [
  { label: 'Reunir los comentarios de los seguimientos', icon: 'forum', to: 5 },
  { label: 'Detectar a la competencia en los comentarios', icon: 'person_search', to: 35 },
  { label: 'Analizar pagos, cobertura y precios', icon: 'payments', to: 60 },
  { label: 'Comparativa, combos y nivel de amenaza', icon: 'compare_arrows', to: 65 },
  { label: 'Redactar el resumen', icon: 'edit_note', to: 100 },
]
/** Progreso al estilo de la publicación en grupos: a la izquierda el anillo con el porcentaje; a su lado, el estado y su descripción. */
export function RunProgress({ step, pct, web }: { step: string; pct: number; web: boolean }) {
  const steps = web ? [...WEB_STEPS, ...ANALYSIS_STEPS.map((s) => ({ ...s, to: 40 + s.to * 0.6 }))] : ANALYSIS_STEPS
  const cur = Math.max(0, steps.findIndex((s) => pct < s.to)), now = steps[cur]
  const C = 2 * Math.PI * 34
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-surface-2 p-5 sm:flex-row sm:gap-8 sm:p-6" role="status" aria-live="polite">
      <div className="relative size-28 shrink-0" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del informe">
        <svg viewBox="0 0 80 80" className="size-28 -rotate-90"><circle cx="40" cy="40" r="34" className="fill-none stroke-primary-container" strokeWidth="7" /><circle cx="40" cy="40" r="34" className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} /></svg>
        <b className="absolute inset-0 grid place-items-center font-display text-xl tabular-nums">{pct} %</b>
      </div>
      {/* el anillo y el texto, centrados como un bloque en el área */}
      <div className="min-w-0 sm:max-w-xl">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary"><Icon name={now.icon} className="!text-[18px]" />Paso {cur + 1} de {steps.length}</div>
        <h4 className="mb-1 text-base">{now.label}</h4>
        <p className="text-sm text-text-2">{step}</p>
        {cur > 0 && (
          <ol className="mt-3 space-y-0.5 text-xs text-text-2">
            {steps.slice(Math.max(0, cur - 3), cur).map((s) => <li key={s.label} className="flex items-center gap-1.5"><Icon name="check_circle" className="!text-[16px] text-success" />{s.label}</li>)}
          </ol>
        )}
        <p className="mt-3 text-xs text-text-2">Puedes cambiar de pestaña o de sección: el informe se sigue generando.</p>
      </div>
    </div>
  )
}

