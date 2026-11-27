import { describe, expect, it } from 'vitest'
import { intentOf, templateReplies } from '@/features/comments/replies'
import type { Comment } from '@/features/comments/types'

const C = (text: string, sentiment: Comment['sentiment'] = 'neutral', authorName = 'Sasha Batista') =>
  ({ id: 'x', text, sentiment, authorName, isQuestion: /\?/.test(text), platform: 'facebook' }) as unknown as Comment

describe('Sugerencias de respuesta', () => {
  it('detecta la intención', () => {
    expect(intentOf(C('Saludos para Leopoldina, Elizabeth, Alejandro y todos mis queridos', 'positivo'))).toBe('saludo')
    expect(intentOf(C('Mi pedido lleva 3 días de demora y nadie responde', 'negativo'))).toBe('queja')
    expect(intentOf(C('¿Hacen entregas en Holguín?'))).toBe('envio')
    expect(intentOf(C('¿Cuánto cuesta el combo de pollo?'))).toBe('precio')
    expect(intentOf(C('Excelente servicio, los recomiendo', 'positivo'))).toBe('elogio')
  })
  it('plantillas con el nombre de pila y sin nombre', () => {
    const r = templateReplies(C('Saludos para mi familia', 'positivo'))
    expect(r).toHaveLength(3)
    expect(r[0]).toContain('Sasha')
    expect(templateReplies(C('Mi pedido no ha llegado', 'negativo', ''))[1]).toMatch(/^Sentimos las molestias/)
    expect(templateReplies(C('Gracias', 'positivo', ''))[0]).toBe('¡Muchas gracias! Nos alegra mucho saber que quedaste contento/a. 😊')
  })
  it('las respuestas hablan en nombre de la marca', () => {
    const r = templateReplies(C('Saludos para Leopoldina y todos mis queridos amigos. Gracias kanasta 24', 'positivo'), 3, 'Kanasta24')
    expect(r[0]).toBe('¡Gracias, Sasha! En Kanasta24 hacemos llegar tu cariño a toda la familia. ¡Un abrazo grande! ❤️')
    expect(r.every((x) => x.includes('Kanasta24'))).toBe(true)
    expect(templateReplies(C('Excelente', 'positivo'), 3, '').join(' ')).not.toMatch(/\{|\}|  /)
  })
})
