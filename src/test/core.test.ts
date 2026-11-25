import { describe, expect, it } from 'vitest'
import { finalText, normGroupUrl, parseFbUrl, styleStr, toggleStyle, unstyleStr, cleanGroupName } from '@/features/publisher/fb'
import { parseImport } from '@/features/publisher/groups'
import { sentiment, detectPlatform, canonUrl, parseFbDate } from '@/features/comments/text'
import { parseAny, prepare } from '@/features/comments/normalize'
import { parseCheck } from '@/features/publisher/verify'

describe('URLs de Facebook', () => {
  it('limpia parámetros de rastreo y clasifica', () => {
    const r = parseFbUrl('https://m.facebook.com/pagina/posts/123?__cft__=x&mibextid=y')
    expect(r.url).toBe('https://www.facebook.com/pagina/posts/123')
    expect(r.cleaned).toBe(true)
    expect(parseFbUrl('https://www.facebook.com/reel/99').kind).toBe('Reel')
    expect(parseFbUrl('https://example.com/x').error).toBeTruthy()
  })
  it('normaliza grupos', () => {
    expect(normGroupUrl('123456')).toBe('https://www.facebook.com/groups/123456/')
    expect(normGroupUrl('https://facebook.com/groups/ventas/posts/1')).toBe('https://www.facebook.com/groups/ventas/')
    expect(normGroupUrl('https://www.facebook.com/groups/feed/')).toBeNull()
  })
  it('limpia nombres capturados', () => {
    expect(cleanGroupName('No leída Compraventa Madrid')).toBe('Compraventa Madrid')
    expect(cleanGroupName('Foto de perfil del grupo Ventas Holguín')).toBe('Ventas Holguín')
  })
})

describe('Texto', () => {
  it('negrita Unicode reversible', () => {
    const b = styleStr('Hola 24', 'b')
    expect(b).not.toBe('Hola 24')
    expect(unstyleStr(b)).toBe('Hola 24')
    expect(toggleStyle(b, 'b')).toBe('Hola 24')
  })
  it('sustituye variables y añade el enlace', () => {
    const t = finalText('Hola {grupo}', 'https://www.facebook.com/p/1', 'Ventas', true)
    expect(t).toBe('Hola Ventas\n\nhttps://www.facebook.com/p/1')
  })
})

describe('Importar grupos', () => {
  it('reconoce el marcador y líneas', () => {
    expect(parseImport('FBP_GROUPS:[{"name":"A","url":"https://www.facebook.com/groups/a/"}]')).toHaveLength(1)
    const l = parseImport('Grupo B | https://www.facebook.com/groups/b/\nhttps://www.facebook.com/groups/b/')
    expect(l).toHaveLength(1)
    expect(l[0].name).toBe('Grupo B')
  })
  it('lee verificaciones', () => {
    const c = parseCheck('FBP_CHECK:{"v":1,"group":{"name":"G","slugs":["g"]},"ids":["1","2"],"at":5}')
    expect(c?.ids.has('2')).toBe(true)
  })
})

describe('Comentarios', () => {
  it('detecta la red y canoniza', () => {
    expect(detectPlatform('https://www.instagram.com/p/x')).toBe('instagram')
    expect(detectPlatform('tiktok.com/@a/video/1')).toBe('tiktok')
    expect(canonUrl('https://m.facebook.com/a/posts/1?ref=x')).toBe('https://www.facebook.com/a/posts/1')
  })
  it('estima el sentimiento con negación y adversativas', () => {
    expect(sentiment('Excelente servicio, muy rápido').label).toBe('positivo')
    expect(sentiment('no es bueno').label).toBe('negativo')
    expect(sentiment('Bonito pero llegó tarde y roto').label).toBe('negativo')
  })
  it('interpreta fechas relativas', () => {
    const base = '2026-11-24T12:00:00.000Z'
    expect(parseFbDate('2 h', base)).toBe('2026-11-24T10:00:00.000Z')
  })
  it('importa CSV y arma los hilos', () => {
    const p = prepare(parseAny('id;parent_id;autor;texto\n1;;Ana;Me encanta\n2;1;Luis;Totalmente de acuerdo'))
    expect(p.comments).toHaveLength(2)
    expect(p.comments[1].type).toBe('reply')
    expect(p.comments[1].sentiment).toBe('positivo')
  })
})
