import { useLocation, useNavigate } from 'react-router-dom'
import { Tabs } from '@/components/ui'
import { usePublisher } from '@/features/publisher/store'
import { activeGroups } from '@/features/publisher/logic'

/** Pestañas de Publicar: la publicación y sus destinos (los grupos) en una sola sección. */
export function PublishTabs() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const n = usePublisher((s) => activeGroups(s).length)
  const tab = pathname.startsWith('/publicar/grupos') ? 'grupos' : 'nueva'
  return (
    <Tabs value={tab} onChange={(t) => nav(t === 'grupos' ? '/publicar/grupos' : '/publicar')} tabs={[
      { id: 'nueva', label: 'Nueva publicación', short: 'Publicar', icon: 'send' },
      { id: 'grupos', label: 'Grupos', icon: 'group', badge: n || undefined },
    ]} />
  )
}
