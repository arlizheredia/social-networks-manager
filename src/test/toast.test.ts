import { describe, expect, it, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from '@/components/ui/Toast'
import { historyLink } from '@/features/comments/tracking'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Aviso al completar un seguimiento', () => {
  it('muestra el enlace al seguimiento en el historial', () => {
    vi.useFakeTimers()
    const div = document.createElement('div'); document.body.appendChild(div)
    act(() => createRoot(div).render(createElement(Toaster)))
    act(() => toast('✓ Seguimiento «Prueba» completado: 30 comentarios.', undefined, { label: 'Ver en el historial', href: historyLink('t_3') }))
    const a = div.querySelector('a')!
    expect(a.textContent).toBe('Ver en el historial')
    expect(a.getAttribute('href')).toBe('#/historial?tab=seg&t=t_3')
    act(() => a.click())
    expect(div.querySelector('.anim-toast-out')).not.toBeNull() // sale con animación…
    act(() => { vi.advanceTimersByTime(200) })
    expect(div.querySelector('a')).toBeNull()   // …y se cierra al pulsar el enlace
    vi.useRealTimers()
  })
})
