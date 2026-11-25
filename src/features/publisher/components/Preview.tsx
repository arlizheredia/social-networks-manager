import { esc } from '@/lib/util'
import { finalText, parseFbUrl } from '../fb'
import { useMedia } from '../media'
import { usePublisher } from '../store'
import { selectedGroups } from '../logic'

/** Aproximación de cómo se verá la publicación en el grupo. */
export function Preview() {
  const state = usePublisher()
  const media = useMedia((s) => s.items).filter((m) => m.type !== 'audio')
  const g = selectedGroups(state)[0]
  const r = parseFbUrl(state.draft.url)
  const txt = finalText(state.draft.text, r.url || '', g?.name ?? null, state.settings.appendUrl)
  const html = esc(txt).replace(/(https?:\/\/\S+)/g, '<span class="text-fb">$1</span>').replace(/(^|\s)(#[\p{L}\p{N}_]+)/gu, '$1<span class="text-fb">$2</span>').replace(/(\{(?:grupo|fecha|enlace)\})/gi, '<span class="rounded bg-warn-container px-1 text-warn">$1</span>')
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-2 bg-surface">
      <div className="flex items-center gap-2 p-3">
        <div className="grid size-10 place-items-center rounded-full bg-primary-container font-medium text-on-primary-container">Tú</div>
        <div className="min-w-0"><div className="truncate text-[13px] font-medium">Tu nombre ▸ {g?.name ?? 'Grupo'}</div><div className="text-xs text-text-2">Ahora · 👥</div></div>
      </div>
      {txt ? <div className="px-3 pb-3 text-[15px] leading-5 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="px-3 pb-3 text-text-3 italic">Tu texto aparecerá aquí</div>}
      {media.length > 0 ? (
        <div className={`grid gap-0.5 ${media.length > 1 ? 'grid-cols-2' : ''}`}>
          {media.slice(0, 4).map((m, i) => (
            <div key={m.id} className="relative">
              {m.type === 'image' ? <img src={m.url} alt="" className="aspect-square w-full object-cover" /> : <video src={m.url} muted className="aspect-square w-full object-cover" />}
              {i === 3 && media.length > 4 && <div className="absolute inset-0 grid place-items-center bg-scrim text-2xl text-white">+{media.length - 4}</div>}
            </div>
          ))}
        </div>
      ) : r.url ? (
        <div className="border-t border-outline-2 bg-surface-2 px-3 py-2"><div className="text-xs text-text-2 uppercase">{r.host}</div><div className="text-sm font-medium">{r.kind} de Facebook</div></div>
      ) : null}
      <div className="flex justify-around border-t border-outline-2 py-2 text-[13px] text-text-2"><span>👍 Me gusta</span><span>💬 Comentar</span><span>↗ Compartir</span></div>
    </div>
  )
}
