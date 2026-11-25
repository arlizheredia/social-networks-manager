import { describe, expect, it } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { NumberField } from '@/components/ui/Field'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const setValue = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function mount(initial: number, min = 50) {
  let value = initial
  const changes: number[] = []
  const div = document.createElement('div'); document.body.appendChild(div)
  const root = createRoot(div)
  const render = () => root.render(createElement(NumberField, { value, min, max: 100000, onChange: (v: number) => { value = v; changes.push(v); render() } }))
  act(render)
  return { input: div.querySelector('input')!, changes, get value() { return value } }
}

describe('Campo numérico', () => {
  it('permite borrar todo y escribir 200', () => {
    const f = mount(0)
    act(() => { f.input.focus(); setValue(f.input, '') })
    expect(f.input.value).toBe('')                 // el campo vacío ya no vuelve a 0
    act(() => setValue(f.input, '2'))
    act(() => setValue(f.input, '20'))
    act(() => setValue(f.input, '200'))
    act(() => { f.input.blur(); f.input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(f.input.value).toBe('200')
    expect(f.value).toBe(200)
  })
  it('al salir ajusta un valor por debajo del mínimo', () => {
    const f = mount(1500)
    act(() => { f.input.focus(); setValue(f.input, '20') })
    expect(f.value).toBe(1500)                       // mientras se escribe no guarda valores fuera de rango
    act(() => { f.input.blur(); f.input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(f.value).toBe(50)
    expect(f.input.value).toBe('50')
  })
})
