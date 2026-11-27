export interface NavItem { to: string; label: string; icon: string; short?: string }

/** Navegación única para toda la app: pocas secciones, nombres claros. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/publicar', label: 'Publicar', icon: 'send' },
  { to: '/comentarios', label: 'Comentarios', icon: 'forum', short: 'Coment.' },
  { to: '/competencia', label: 'Competencia', icon: 'radar', short: 'Compet.' },
  { to: '/informes', label: 'Informes', icon: 'summarize' },
  { to: '/historial', label: 'Historial', icon: 'history' },
  { to: '/ayuda', label: 'Ayuda', icon: 'menu_book' },
]
