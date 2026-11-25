import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Suspense, useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon, IconButton, Loader, Toaster } from '@/components/ui'
import { useSettings } from '@/store/settings'
import { NAV } from './nav'
import { AIStatusChip } from '@/features/ai/AIStatusChip'
import { ExtensionChip } from '@/features/extension/ExtensionChip'
import { SessionsChip } from '@/features/comments/SessionsChip'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { RunDialog } from '@/features/publisher/components/RunDialog'

const THEME_ICON = { system: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' } as const
const THEME_LABEL = { system: 'Tema del sistema', light: 'Tema claro', dark: 'Tema oscuro' } as const

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-3 text-text no-underline" aria-label="Social Networks Manager — inicio">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-9 shrink-0" />
      <span className="font-display text-[20px] leading-6 text-text-2">
        <span className="hidden sm:inline">Social Networks </span>
        <b className="font-medium text-text">Manager</b>
      </span>
    </NavLink>
  )
}

export function Layout() {
  const { theme, cycleTheme } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const { pathname } = useLocation()

  useEffect(() => { document.getElementById('main')?.scrollTo({ top: 0 }) ; window.scrollTo({ top: 0 }) }, [pathname])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 bg-bg/95 px-3 backdrop-blur sm:px-4 md:pl-[26px]">
        <Brand />
        <div className="flex-1" />
        <SessionsChip />
        <ExtensionChip />
        <AIStatusChip />
        <IconButton icon={THEME_ICON[theme]} label={THEME_LABEL[theme]} onClick={cycleTheme} />
        <IconButton icon="settings" label="Ajustes" onClick={() => setSettingsOpen(true)} />
      </header>

      <div className="flex">
        <nav aria-label="Navegación principal" className="sticky top-16 hidden h-[calc(100dvh-64px)] w-22 shrink-0 flex-col items-center gap-3 overflow-y-auto pt-2 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="group flex w-full flex-col items-center gap-1 text-xs font-medium text-text-2 no-underline">
              {({ isActive }) => (
                <>
                  <span className={cn('grid h-8 w-14 place-items-center rounded-full transition-colors', isActive ? 'bg-secondary-container text-on-secondary-container' : 'group-hover:bg-text/8')}>
                    <Icon name={n.icon} fill={isActive} />
                  </span>
                  <span className={cn(isActive && 'text-text')}>{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-2 pb-28 sm:px-6 md:pb-4 lg:pr-8">
          <div className="mx-auto max-w-[1200px]">
            {!online && (
              <div role="alert" className="mb-4 flex items-center gap-3 rounded-2xl bg-error-container px-4 py-3 text-error">
                <Icon name="wifi_off" />
                <div><b className="font-medium">Sin conexión a Internet.</b> Tu trabajo está guardado; publicar y obtener comentarios esperará a que vuelva la conexión.</div>
              </div>
            )}
            <Suspense fallback={<Loader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <nav aria-label="Navegación" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-outline-2 bg-surface-2 md:hidden">
        {NAV.filter((n) => n.to !== '/ayuda').map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-text-2 no-underline">
            {({ isActive }) => (
              <>
                <span className={cn('grid h-8 w-12 place-items-center rounded-full', isActive && 'bg-secondary-container text-on-secondary-container')}>
                  <Icon name={n.icon} fill={isActive} />
                </span>
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RunDialog />
      <Toaster />
    </div>
  )
}
