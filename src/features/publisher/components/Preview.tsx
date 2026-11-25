import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui'
import { esc } from '@/lib/util'
import { publisherCommand, useExtension } from '@/features/extension/bridge'
import { finalText, parseFbUrl } from '../fb'
import { useMedia } from '../media'
import { usePublisher } from '../store'
import { selectedGroups } from '../logic'

interface LinkCard { title: string; description: string; image: string | null }
const CACHE = 'snm.pv:'
const okImage = (s: unknown): s is string => typeof s === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s)

/** Tarjeta de la publicación de origen (título e imagen) leída por la extensión con tu sesión de Facebook. */
function useLinkCard(url: string | undefined) {
  const ext = useExtension((s) => s.publisher)
  const [card, setCard] = useState<{ url: string; data: LinkCard | null; loading: boolean } | null>(null)
  useEffect(() => {
    if (!url) { setCard(null); return }
    try { const c = sessionStorage.getItem(CACHE + url); if (c) { setCard({ url, data: JSON.parse(c), loading: false }); return } } catch { /* */ }
    if (!ext) { setCard(null); return }
    let alive = true
    setCard({ url, data: null, loading: true })
    // espera a que se termine de escribir la URL
    const t = setTimeout(async () => {
      const r = await publisherCommand('preview', { url }, 30000)
      if (!alive) return
      const data: LinkCard | null = r.ok ? { title: String(r.title || '').slice(0, 200), description: String(r.description || '').slice(0, 300), image: okImage(r.image) ? r.image : null } : null
      if (data) try { sessionStorage.setItem(CACHE + url, JSON.stringify(data)) } catch { /* sin espacio */ }
      setCard({ url, data, loading: false })
    }, 600)
    return () => { alive = false; clearTimeout(t) }
  }, [url, ext])
  return { card: card?.url === url ? card : null, ext: !!ext }
}

/** Aproximación de cómo se verá la publicación en el grupo. */
export function Preview() {
  const state = usePublisher()
  const media = useMedia((s) => s.items).filter((m) => m.type !== 'audio')
  const g = selectedGroups(state)[0]
  const r = parseFbUrl(state.draft.url)
  const { card, ext } = useLinkCard(r.url)
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
        <div className="border-t border-outline-2 bg-surface-2">
          {card?.loading && <div className="grid aspect-[1.91] w-full place-items-center bg-surface-3 text-text-2"><Icon name="progress_activity" className="animate-spin" /></div>}
          {card?.data?.image && <img src={card.data.image} alt="" className="aspect-[1.91] w-full object-cover" />}
          <div className="px-3 py-2">
            <div className="text-xs text-text-2 uppercase">{r.host}</div>
            <div className="line-clamp-2 text-sm font-medium">{card?.data?.title || `${r.kind} de Facebook`}</div>
            {card?.data?.description && <div className="line-clamp-2 text-xs text-text-2">{card.data.description}</div>}
            {!ext && !card && <div className="mt-1 text-xs text-text-3">Instala la extensión para ver la imagen de la publicación.</div>}
            {ext && card && !card.loading && !card.data && <div className="mt-1 text-xs text-text-3">No se pudo leer la publicación (¿sesión de Facebook iniciada?).</div>}
          </div>
        </div>
      ) : null}
      <div className="flex justify-around border-t border-outline-2 py-2 text-[13px] text-text-2"><span>👍 Me gusta</span><span>💬 Comentar</span><span>↗ Compartir</span></div>
    </div>
  )
}
