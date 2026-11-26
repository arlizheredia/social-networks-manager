import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanHistory } from '@/features/publisher/store'

describe('Cuadro de publicación que Facebook deja abierto', () => {
  it('la extensión lo da por publicado (no es un error)', () => {
    const fb = readFileSync('extension/fb.js', 'utf8')
    expect(fb).not.toMatch(/error: 'El cuadro de publicación no se cerró/)
    expect(fb).toMatch(/if \(!closed \|\| vis\(d\)\) return \{ok: true, review, messages, unconfirmed: true\}/)
  })
  it('el historial antiguo con ese aviso pasa a publicado', () => {
    const h = cleanHistory([{ id: 'h1', date: Date.now(), url: '', text: 'x', mediaCount: 0, appendUrl: false, ack: true, items: [
      { gid: 'g1', name: 'Grupo 1', url: 'https://www.facebook.com/groups/1/', notes: '', status: 'skipped', at: Date.now(), error: 'El cuadro de publicación no se cerró: revisa la ventana de Facebook [publish]' },
      { gid: 'g2', name: 'Grupo 2', url: 'https://www.facebook.com/groups/2/', notes: '', status: 'skipped', at: Date.now(), error: 'El grupo no permite publicaciones' },
    ] }])
    expect(h[0].items.map((i) => [i.status, i.error])).toEqual([['done', undefined], ['skipped', 'El grupo no permite publicaciones']])
  })
})
