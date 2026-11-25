import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'system' | 'light' | 'dark'

interface SettingsState {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  cycleTheme: () => void
  welcomeDismissed: boolean
  dismissWelcome: () => void
}

function applyTheme(t: ThemeMode) {
  const root = document.documentElement
  if (t === 'system') delete root.dataset.theme
  else root.dataset.theme = t
  try { localStorage.setItem('snm.theme', t) } catch { /* sin almacenamiento */ }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => { applyTheme(theme); set({ theme }) },
      cycleTheme: () => {
        const order: ThemeMode[] = ['system', 'light', 'dark']
        get().setTheme(order[(order.indexOf(get().theme) + 1) % order.length])
      },
      welcomeDismissed: false,
      dismissWelcome: () => set({ welcomeDismissed: true }),
    }),
    { name: 'snm.settings', onRehydrateStorage: () => (s) => s && applyTheme(s.theme) },
  ),
)
