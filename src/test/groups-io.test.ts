import { describe, expect, it } from 'vitest'
import { parseImport } from '@/features/publisher/groups'

describe('Exportar e importar grupos', () => {
  it('la lista «Nombre | URL» exportada se vuelve a importar igual', () => {
    const txt = ['Compras Holguín | https://www.facebook.com/groups/123456/', 'Ventas / Cuba | https://www.facebook.com/groups/ventascuba/'].join('\r\n')
    expect(parseImport(txt).map((g) => [g.name, g.url])).toEqual([['Compras Holguín', 'https://www.facebook.com/groups/123456/'], ['Ventas / Cuba', 'https://www.facebook.com/groups/ventascuba/']])
  })
  it('el JSON exportado se vuelve a importar con etiquetas y estado', () => {
    const json = JSON.stringify({ app: 'Social Networks Manager', type: 'groups', groups: [{ name: 'Revolico', url: 'https://www.facebook.com/groups/revolico/', tags: ['ventas'], notes: 'x', active: false }] })
    expect(parseImport(json)[0]).toMatchObject({ name: 'Revolico', tags: ['ventas'], active: false })
  })
})
