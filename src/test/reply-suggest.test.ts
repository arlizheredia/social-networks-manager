import { describe, expect, it } from 'vitest'
import { goodReply, parseAIReplies, intentOf, templateReplies } from '@/features/comments/replies'
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
  it('la guarda rechaza textos sin sentido', () => {
    const c = C('Saludos')
    expect(goodReply('Eresse 24 horas. Se encuetan. Se deciden por medio de un juego, una conversación o simplemente por intercambiar ideas. En cada escenario, una persona se pone al solitario.', c)).toBe(false)
    expect(goodReply('¡Gracias, Sasha! Un abrazo grande para toda tu familia.', c)).toBe(true)
    expect(goodReply('Sasha, gracias por tu cariño. ¡Saludos a todos!', c)).toBe(true)
  })
  it('descarta el segundo JSON roto de la captura', () => {
    const bad = '{"respuesta":[{"titulo":"Responde en orden alfabetico","correspuestas":[{"cuenta":"Hola","pregunta":"Hola"}],"titulo":"Gracias"},{"correspuestas":[{"nombre_usuario":"Alejandro","cuenta":"¡Muchas gracias por tu respuesta!"}]},{"correspuestas":[{"cuenta":"Hola","pregunta":"¿Hola?"}'
    expect(parseAIReplies(bad, C('Saludos')).join(' ')).not.toMatch(/[{}[\]"]|titulo|correspuestas/)
    expect(parseAIReplies('¡Gracias, Sasha! En Kanasta24 te mandamos un abrazo.', C('Saludos'))).toEqual(['¡Gracias, Sasha! En Kanasta24 te mandamos un abrazo.'])
  })
  it('descarta el JSON roto de la IA y no muestra el texto crudo', () => {
    const bad = '{"respuestas":["¡Hola {nombre_pila},"+`{nombre_pila}.`,+`Te escribimos sobre {nombre_pila}. La experiencia de este sitio es [información].`,+`Gracias por tu interés.",`Hola {nombre_pila},`+`te escribimos sobre {nombre_pila}. `, `Te gustaría saber más acerca de mi contenido.\',`Hola {nombre_pila},`+`Te escribimos de nuevo por mensaje privado.\',`¡Hola {nombre_pila},`+`Tu experiencia te interesa.\',`Este sitio es dedicado a {}.\'+"],"}'
    const r = parseAIReplies(bad, C('Saludos'))
    expect(r.every((x) => !/[{}[\]"`]/.test(x))).toBe(true)
    expect(r.join(' ')).not.toMatch(/respuestas|nombre_pila|este sitio/)
    expect(parseAIReplies('{"respuestas":["¡Gracias, Sasha! Un abrazo a toda la familia.","Texto raro"]}', C('Saludos'))).toEqual(['¡Gracias, Sasha! Un abrazo a toda la familia.'])
  })
})
