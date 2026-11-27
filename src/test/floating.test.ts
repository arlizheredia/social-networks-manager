import { describe, expect, it, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

vi.mock('idb-keyval', () => ({ createStore: () => 's', get: async () => undefined, set: async () => {}, del: async () => {}, entries: async () => [], clear: async () => {}, keys: async () => [], getMany: async () => [], setMany: async () => {} }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Ventana flotante del seguimiento', () => {
  it('muestra el seguimiento de la ventana, se arrastra desde la cabecera y pasa a segundo plano', async () => {
    const { useTR } = await import('@/features/comments/tracking')
    const { TrackWindow } = await import('@/features/comments/components/Tracking')
    useTR.setState({
      posts: [{ id: 'p1', url: 'https://www.facebook.com/x/posts/1', platform: 'facebook', name: 'Reel', title: '', author: '', addedAt: '', method: 'extension', notes: '' }],
      tracks: [{ id: 't1', name: 'Reels de Kanasta24', createdAt: '2026-11-27T10:00:00Z', status: 'running', date: '2026-11-27', postIds: ['p1'], items: { p1: { status: 'running', count: 12, phase: 'extracting' } }, fbOrder: 'all', fbLimit: 1500 }],
      runs: ['t1'], running: 't1', bgIds: [], win: 't1',
    })
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1280 })
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 })
    const div = document.createElement('div'); document.body.appendChild(div)
    await act(async () => createRoot(div).render(createElement(MemoryRouter, null, createElement(TrackWindow))))
    const w = div.querySelector('[role="dialog"]') as HTMLElement
    expect(w).toBeTruthy()
    expect(w.textContent).toContain('Reels de Kanasta24')
    expect(w.textContent).toContain('Extrayendo… 12')
    // arrastrar la cabecera mueve la ventana
    const head = w.firstElementChild as HTMLElement
    head.setPointerCapture = () => {}
    const before = w.style.left
    expect(before).toBe('640px') // centrada (en el entorno de prueba la ventana mide 0 px)
    await act(async () => {
      head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }))
      head.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 140, clientY: 120 }))
      head.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    })
    expect(w.style.left).not.toBe(before)
    // «Segundo plano»: la ventana se oculta y el seguimiento queda en la lista de fondo
    const bg = [...w.querySelectorAll('button')].find((b) => b.textContent?.includes('Segundo plano'))!
    await act(async () => bg.click())
    expect(useTR.getState().bgIds).toEqual(['t1'])
    expect(div.querySelector('[role="dialog"]')).toBeNull()
  })
})
