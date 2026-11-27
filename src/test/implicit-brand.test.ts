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

describe('Publicación de la propia marca', () => {
  it('en la publicación de la marca todos sus comentarios están relacionados; en la de otra página, solo los que hablan de ella', () => {
    const raw = () => [{ id: '1', authorName: 'Ana', text: '¡Excelente servicio! Llegó todo rapidísimo y fresco' }, { id: '2', authorName: 'Luis', text: 'Saludos para mi familia en Holguín' }]
    const own = finalize(raw(), { platform: 'facebook', postAuthor: 'Kanasta24' }) as Comment[]
    expect(own.map((c) => !!c.aboutBrand)).toEqual([true, true])
    const other = finalize(raw(), { platform: 'facebook', postAuthor: 'Mi Tienda' }) as Comment[]
    expect(other.map((c) => !!c.aboutBrand)).toEqual([false, false])
  })
})

describe('Contexto de la publicación', () => {
  it('si la publicación nombra la marca, sus comentarios están relacionados aunque no la mencionen', () => {
    const raw = () => [{ id: '1', authorName: 'Odalmis Rodriguez', text: 'Downtown ya estamos así?? Que nivel pero no hay edificios como así jjjj' }]
    const reel = finalize(raw(), { platform: 'facebook', postAuthor: 'Harry Landy Smith', title: 'Kanasta24 para todo el oriente del país #yquientedicesati' }) as Comment[]
    expect(reel[0].aboutBrand).toBe(true)
    const otro = finalize(raw(), { platform: 'facebook', postAuthor: 'Harry Landy Smith', title: 'Paseo por Holguín' }) as Comment[]
    expect(!!otro[0].aboutBrand).toBe(false)
    // desde un seguimiento: el texto de la publicación viaja con cada comentario
    const seg = finalize([{ ...raw()[0], _postTitle: 'Kanasta24 para todo el oriente del país', _postAuthor: 'Harry Landy Smith' }], { platform: 'facebook' }) as Comment[]
    expect(seg[0].aboutBrand).toBe(true)
  })
})
