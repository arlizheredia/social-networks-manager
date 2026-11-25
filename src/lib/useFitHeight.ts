import { useLayoutEffect, type RefObject } from 'react'

/**
 * Ajusta la altura de un elemento (p. ej. un área de texto) para que otro que va debajo (la fila de botones)
 * termine a `margin` px del borde inferior de la ventana. Se calcula al abrir y al cambiar el tamaño de la ventana.
 */
export function useFitHeight(target: RefObject<HTMLElement | null>, below: RefObject<HTMLElement | null>, { margin = 40, min = 160, deps = [] as unknown[] } = {}) {
  useLayoutEffect(() => {
    const fit = () => {
      const el = target.current, end = below.current
      if (!el || !end) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const endBottom = end.getBoundingClientRect().bottom
      const gap = endBottom - el.getBoundingClientRect().bottom   // del final del área al final de los botones
      // lo que hay debajo de los botones (márgenes de la tarjeta y de la página): si supera el margen pedido,
      // se usa eso para que la página no sea más alta que la ventana (sin barra de desplazamiento)
      let after = 0
      const main = end.closest('main')
      for (let n: HTMLElement = end; n.parentElement && n.parentElement !== main; n = n.parentElement) after += n.parentElement.getBoundingClientRect().bottom - n.getBoundingClientRect().bottom
      if (main) after += parseFloat(getComputedStyle(main).paddingBottom) || 0
      el.style.height = `${Math.max(min, Math.floor(window.innerHeight - Math.max(margin, after) - gap - top))}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
