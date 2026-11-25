import { afterEach, describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { Popover } from '@/components/ui/Popover'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const rect = (x: number, y: number, w: number, hh: number) => ({ x, y, left: x, top: y, width: w, height: hh, right: x + w, bottom: y + hh, toJSON() {} }) as DOMRect
const orig = HTMLElement.prototype.getBoundingClientRect
afterEach(() => { HTMLElement.prototype.getBoundingClientRect = orig; document.body.innerHTML = '' })

async function openAt(anchor: DOMRect, menuW: number, menuH: number, align: 'left' | 'right' = 'left') {
  Object.assign(window, { innerWidth: 1000, innerHeight: 800 })
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) { return this.classList.contains('inline-flex') ? anchor : rect(0, 0, 0, 0) }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return (this as HTMLElement).classList.contains('fixed') ? menuW : 0 } })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return (this as HTMLElement).classList.contains('fixed') ? menuH : 0 } })
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(h(Popover, { align, trigger: (o: () => void) => h('button', { onClick: o }, 'x'), children: () => h('div', null, 'menú') })) })
  await act(async () => { el.querySelector('button')!.click() })
  return el.querySelector('.fixed') as HTMLElement
}

describe('Los menús quedan dentro de la ventana', () => {
  it('se desplaza a la izquierda si se sale por la derecha', async () => {
    const m = await openAt(rect(960, 100, 40, 40), 300, 150)
    expect(m.style.left).toBe('692px') // 1000 − 8 − 300
    expect(m.style.top).toBe('144px')
    expect(m.className).not.toContain('invisible')
  })
  it('no se sale por la izquierda', async () => {
    const m = await openAt(rect(2, 100, 40, 40), 300, 150, 'right')
    expect(m.style.left).toBe('8px')
  })
  it('se abre hacia arriba si no cabe debajo', async () => {
    const m = await openAt(rect(100, 740, 40, 40), 200, 150)
    expect(m.style.bottom).toBe('64px') // 800 − 740 + 4
    expect(m.style.top).toBe('')
  })
  it('sin desbordes queda alineado con el botón', async () => {
    const m = await openAt(rect(100, 100, 40, 40), 200, 150)
    expect(m.style.left).toBe('100px')
  })
})
