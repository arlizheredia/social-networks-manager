import { useEffect } from 'react'
import { BrandIcon, Icon, Popover } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useExtension } from '@/features/extension/bridge'
import { LOGIN_URL, requestSessions, useTR } from './tracking'
import type { Platform } from './types'

const NETS: { id: Platform; name: string; home: string }[] = [
  { id: 'facebook', name: 'Facebook', home: 'https://www.facebook.com/' },
  { id: 'instagram', name: 'Instagram', home: 'https://www.instagram.com/' },
  { id: 'tiktok', name: 'TikTok', home: 'https://www.tiktok.com/' },
]

/** Marca de la red con un punto de estado: verde con sesión, gris sin ella. */
function NetBadge({ n, on, size = 'sm' }: { n: (typeof NETS)[number]; on: boolean; size?: 'sm' | 'md' }) {
  return (
    <span className="relative inline-grid">
      <BrandIcon brand={n.id} size={size === 'sm' ? 20 : 28} className={cn('text-text', !on && 'opacity-40 grayscale')} />
      <span className={cn('absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-bg', size === 'sm' ? 'size-2.5' : 'size-3.5', on ? 'bg-success' : 'bg-outline')} />
    </span>
  )
}

/** Sesiones iniciadas en Facebook, Instagram y TikTok en este navegador (las detecta la extensión). */
export function SessionsChip() {
  const ext = useExtension((s) => s.extractor)
  const sessions = useTR((s) => s.sessions)

  useEffect(() => {
    if (!ext) return
    requestSessions()
    const t = setInterval(requestSessions, 60000)
    const vis = () => { if (document.visibilityState === 'visible') requestSessions() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [ext])

  if (!ext || !sessions.known) return null
  const active = NETS.filter((n) => sessions[n.id]).length
  return (
    <Popover align="right" trigger={(open) => (
      <button onClick={open} title={`Sesiones activas: ${active} de 3`} aria-label={`Sesiones en redes sociales: ${NETS.map((n) => `${n.name} ${sessions[n.id] ? 'conectado' : 'sin sesión'}`).join(', ')}`}
        className="inline-flex h-9 items-center gap-2.5 rounded-full px-3 hover:bg-text/8">
        {NETS.map((n) => <NetBadge key={n.id} n={n} on={sessions[n.id]} />)}
      </button>
    )}>
      {() => (
        <div className="w-72 p-1">
          <div className="px-2 pt-1 pb-2">
            <div className="font-medium text-text">Sesiones en este navegador</div>
            <div className="text-xs text-text-2">Necesarias para extraer comentarios y publicar automáticamente.</div>
          </div>
          {NETS.map((n) => {
            const on = sessions[n.id]
            return (
              <a key={n.id} href={on ? n.home : LOGIN_URL[n.id]} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-2 py-2 text-text no-underline hover:bg-text/8">
                <NetBadge n={n} on={on} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{n.name}</span>
                  <span className={cn('block text-xs', on ? 'text-success' : 'text-text-2')}>{on ? 'Sesión iniciada' : 'Sin sesión'}</span>
                </span>
                <span className="text-xs font-medium text-primary">{on ? 'Abrir' : 'Iniciar sesión'}</span>
              </a>
            )
          })}
          <button onClick={requestSessions} className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl px-2 py-2 text-sm text-primary hover:bg-text/8"><Icon name="refresh" className="!text-[18px]" />Comprobar de nuevo</button>
        </div>
      )}
    </Popover>
  )
}
