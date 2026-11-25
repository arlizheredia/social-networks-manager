import { describe, expect, it } from 'vitest'
import { sentiment } from '@/features/comments/text'

describe('Diccionario de sentimiento: quejas por calidad', () => {
  it.each([
    'Buenos precios, pero el pollo vino un poco descongelado.',
    'La carne llegó cruda y el arroz quemado',
    'El queso estaba rancio',
    'Me llegó la lata abollada y el yogur caducado',
    'Faltaron dos productos del pedido',
  ])('negativo: %s', (t) => expect(sentiment(t).label).toBe('negativo'))
  it.each(['La cerveza bien fría', 'La cerveza fría', 'Cervezas heladas, como siempre', 'La pizza llegó calentita'])('temperatura positiva: %s', (t) => expect(sentiment(t).label).toBe('positivo'))
  it.each(['La pizza llegó fría', 'La comida llegó fría', 'La cerveza estaba caliente', 'El café estaba frío'])('temperatura negativa: %s', (t) => expect(sentiment(t).label).toBe('negativo'))
  it('sin bebida ni comida cerca, la temperatura no cuenta', () => expect(sentiment('Hoy hace frío').label).toBe('neutral'))
  it.each(['la carne llego descongelada', 'carne maloliente', 'carne caliente', 'el pollo llegó caliente', 'la página esta cara', 'los precios muy altos', 'los cambios muy caros', 'está carísimo', 'la tasa de cambio es muy alta'])('negativo (calidad y precio): %s', (t) => expect(sentiment(t).label).toBe('negativo'))
  it.each(['la carne llegó bien fría', 'precios bajos', 'los precios son muy accesibles'])('positivo (calidad y precio): %s', (t) => expect(sentiment(t).label).toBe('positivo'))
  it('«cara a cara» no es un precio', () => expect(sentiment('lo hablamos cara a cara').label).toBe('neutral'))
  it('no confunde un elogio', () => expect(sentiment('Excelente servicio, todo fresco').label).toBe('positivo'))
})
