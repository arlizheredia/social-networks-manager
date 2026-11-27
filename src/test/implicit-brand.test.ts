import { describe, expect, it } from 'vitest'
import { finalize, talksAboutBrand } from '@/features/comments/normalize'
import { focusFilter, focusMatch } from '@/features/comments/analysis'
import type { Comment } from '@/features/comments/types'

const CASO = 'Bien caro q estan las cosas, ademas, los envios los cobran bien caro, mi mujer enviaba por ahi, pero son los que tienen el precio mas caro'

describe('Comentarios que hablan de la marca sin nombrarla', () => {
  it('detecta las referencias implícitas a la tienda de la publicación', () => {
    expect(talksAboutBrand(CASO)).toBe(true)
    expect(talksAboutBrand('Ustedes son los mejores, gracias')).toBe(true)
    expect(talksAboutBrand('Sus precios subieron mucho este mes')).toBe(true)
    expect(talksAboutBrand('Se demoran demasiado con las entregas')).toBe(true) // queja sobre la tienda
  })
  it('no marca lo que no habla de la tienda', () => {
    expect(talksAboutBrand('Los precios en Cuba están por las nubes')).toBe(false)
    expect(talksAboutBrand('Saludos para mi familia en Holguín')).toBe(false)
    expect(talksAboutBrand('Mi primo vende combos en Holguín')).toBe(false)
    expect(talksAboutBrand(CASO, { rivalPage: true })).toBe(false) // en la página de un competidor habla de ese competidor
  })
  it('entra en el enfoque «Kanasta24 y comentarios relacionados» y se mantiene negativo', async () => {
    const list = finalize([{ id: '1', authorName: 'Pedro', text: CASO }, { id: '2', authorName: 'Ana', text: 'Saludos para mi familia en Holguín' }], { platform: 'facebook' }) as Comment[]
    expect(list[0].aboutBrand).toBe(true)
    expect(list[0].sentiment).toBe('negativo')
    const keys = await focusMatch(list.slice(0, 1), 'Kanasta24 y comentarios relacionados')
    expect(focusFilter(list, keys).map((c) => c.id)).toEqual(['1'])
  })
})
