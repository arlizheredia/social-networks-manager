import { describe, expect, it, vi } from 'vitest'
import { collapseRows, flashCopied } from '@/lib/motion'

describe('Movimiento', () => {
  it('plegar filas no bloquea el borrado aunque el navegador no anime', async () => {
    document.body.innerHTML = '<div data-row-id="a">A</div><div data-row-id="b">B</div>'
    await expect(collapseRows(['a', 'b', 'no-existe'])).resolves.toBeUndefined()
  })
  it('el botón de copiar muestra ✓ y vuelve a su icono', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<button><span class="ms">content_copy</span>Copiar</button>'
    const b = document.querySelector('button')!
    flashCopied(b)
    expect(b.classList.contains('anim-copied')).toBe(true)
    expect(b.querySelector('.ms')!.textContent).toBe('check')
    vi.advanceTimersByTime(1600)
    expect(b.querySelector('.ms')!.textContent).toBe('content_copy')
    expect(b.classList.contains('anim-copied')).toBe(false)
    vi.useRealTimers()
  })
})
