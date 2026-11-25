import { describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('@/features/comments/db', async (orig) => {
  const a = await orig<typeof import('@/features/comments/db')>()
  return { ...a, DB: { ...a.DB, put: async (_s: string, v: { id: string }) => { store.set(v.id, v) } } }
})
const { parsePostsFile, importPosts, useTR } = await import('@/features/comments/tracking')

const R1 = 'https://www.facebook.com/reel/1560190649203326'
const R2 = 'https://www.facebook.com/share/r/1CKFQfUzup/'

describe('Importar y exportar publicaciones', () => {
  it('lee el JSON que exporta la app', () => {
    const json = JSON.stringify({ app: 'social-networks-manager', type: 'posts', version: 1, posts: [{ name: 'Holguín en Fotos', url: R1, platform: 'facebook', title: '', author: 'Holguín en fotos', notes: '' }] })
    expect(parsePostsFile(json, 'publicaciones.json')).toEqual([{ url: R1, name: 'Holguín en Fotos', title: '', author: 'Holguín en fotos', notes: '' }])
  })
  it('lee el CSV de Excel (punto y coma, BOM, comillas)', () => {
    const csv = '﻿"Nombre";"Enlace";"Red"\r\n"Sorteo; 19-11";"' + R2 + '";"Facebook"\r\n'
    expect(parsePostsFile(csv, 'p.csv')).toMatchObject([{ url: R2, name: 'Sorteo; 19-11' }])
  })
  it('lee texto con un enlace por línea y el resto como nombre', () => {
    expect(parsePostsFile(`Holguín en Fotos - ${R1}\n${R2}\n\nlínea sin enlace`, 'p.txt')).toEqual([{ url: R1, name: 'Holguín en Fotos' }, { url: R2, name: '' }])
  })
  it('no duplica y completa el nombre de las que ya estaban sin él', async () => {
    useTR.setState({ posts: [] })
    await importPosts([{ url: R1 }, { url: 'https://example.com/x' }])
    expect(useTR.getState().posts).toHaveLength(1)
    const r = await importPosts([{ url: R1, name: 'Holguín en Fotos' }, { url: R1, name: 'Otro' }, { url: R2, name: 'Sorteo' }])
    expect(r).toEqual({ added: 1, updated: 1, dup: 1, bad: 0 })
    expect(useTR.getState().posts.find((p) => p.url.includes('1560190649203326'))?.name).toBe('Holguín en Fotos')
  })
})
