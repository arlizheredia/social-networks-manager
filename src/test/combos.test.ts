import { describe, expect, it } from 'vitest'
import { demandedProducts, extractCombos, parseItem, topBrands, topProducts } from '@/features/competition/combos'

describe('Combos de comida en el texto', () => {
  it('lee el contenido con cantidades, unidades y marcas', () => {
    expect(parseItem('Pollo 5 lbs')).toEqual({ product: 'Pollo', qty: 5, unit: 'lb', brand: '' })
    expect(parseItem('-1 Aceite Ybarra [900 ml]')).toEqual({ product: 'Aceite', qty: 900, unit: 'ml', brand: 'Ybarra' })
    expect(parseItem('2 x Café Serrano 250 g')).toMatchObject({ product: 'Café', brand: 'Serrano' })
    expect(parseItem('Viandas de temporada 5 lbs')).toMatchObject({ product: 'Viandas', qty: 5, unit: 'lb' })
    expect(parseItem('Envío gratis')).toBeNull()
    expect(parseItem('Carne de res 5 lb')?.brand).toBe('') // «Carne» no es una marca
    expect(parseItem('Leche en Polvo Nido 1 kg')?.brand).toBe('Nido')
  })
  it('combo con contenido en lista (cuballama / dimecuba)', () => {
    const [c] = extractCombos('Combo Básico para Granma $89.99\nEste combo contiene: · Chuletas de Cerdo 3 lbs · Pollo 5 lbs · Arroz 5 lbs · Frijoles 2 lbs · Viandas de temporada 5 lbs', 'https://dimecuba.com/x')
    expect(c).toMatchObject({ name: 'Combo Básico para Granma', price: 89.99, currency: 'USD', weightLb: 20, perLb: 4.5 })
    expect(c.items.map((i) => i.product)).toEqual(['Cerdo', 'Pollo', 'Arroz', 'Frijoles', 'Viandas'])
  })
  it('combo con peso en el nombre y varios combos en la misma página', () => {
    const cs = extractCombos('Combo Básico (18 lb + aceite) $74.25\nArroz, frijoles, azúcar y aceite\nSúper Combo 5 - $108.90 - Más vendido\nCarne, arroz, frijoles, huevos, café Cubita')
    expect(cs.map((c) => [c.name, c.price, c.weightLb, c.bestSeller])).toEqual([['Combo Básico (18 lb + aceite)', 74.25, 18, false], ['Súper Combo 5', 108.9, 0, true]])
    expect(cs[0].perLb).toBe(4.13)
    expect(cs[1].items.find((i) => i.product === 'Café')?.brand).toBe('Cubita')
  })
  it('nombre limpio aunque el combo esté dentro de una frase larga', () => {
    const [c] = extractCombos('Sí, aceptamos Zelle y PayPal. Entregamos en 24 horas en Santiago de Cuba. El combo cárnico sale a $117.65')
    expect(c).toMatchObject({ name: 'Combo cárnico', price: 117.65 })
  })
  it('descarta textos de envío, listas de categorías y combos que no son de comida', () => {
    const cs = extractCombos([
      'Paquetes en el tiempo establecido. $10.13', 'Paso 4: Tu paquete se envía a Cuba $10', 'Combos, artículos de aseo, electrodomésticos, etc. $10.13',
      'Combo ferretería $14.99', 'Paquete se envía hacia Cuba. 10 USD',
      'Paquete de Encuentros de Pollo (10lb) $14.99', 'Combo Despensa Familiar $36.73',
    ].join('\n'))
    expect(cs.map((c) => c.name)).toEqual(['Paquete de Encuentros de Pollo (10lb)', 'Combo Despensa Familiar'])
  })
  it('resume productos frecuentes, marcas y demanda', () => {
    const cs = extractCombos('Combo A $50\nPollo 5 lb, Arroz 5 lb, Aceite Ybarra 1 L\nCombo B $60\nPollo 10 lb, Arroz 5 lb, Café Serrano 250 g')
    expect(topProducts(cs).slice(0, 2)).toEqual([{ product: 'Pollo', count: 2 }, { product: 'Arroz', count: 2 }])
    expect(topBrands(cs).map((b) => b.brand)).toEqual(['Ybarra', 'Serrano'])
    expect(demandedProducts(['¿Tienen combos de pollo?', 'Necesito aceite y pollo', 'Muy buenos'])).toEqual([{ product: 'Pollo', count: 2 }, { product: 'Aceite', count: 1 }])
  })
})
