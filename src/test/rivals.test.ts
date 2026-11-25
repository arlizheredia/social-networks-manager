import { describe, expect, it } from 'vitest'
import { finalize } from '@/features/comments/normalize'
import { setPrefs, getPrefs } from '@/features/comments/prefs'
import { buildReport, whatsappMessage } from '@/features/comments/report'
import { reportHtml } from '@/features/comments/reportHtml'

describe('Comparaciones con la competencia', () => {
  it('son críticas y tienen su propio apartado en el informe y en WhatsApp', async () => {
    setPrefs({ report: { ...getPrefs().report, terms: 'Kanasta24' } })
    const raw = [
      { id: '1', authorName: 'Ana', text: 'Kanasta24 siempre puntuales, excelente servicio' },
      { id: '2', authorName: 'Dinna', text: 'Pues a mí me envían todo con La Bodega del Chago, menos de 12 horas. Productos de calidad y atención' },
      { id: '3', authorName: 'Luis', text: 'Mi pedido llegó tarde y nadie responde' },
    ]
    const list = finalize(raw.map((c) => ({ ...c, platform: 'facebook' as const })), { platform: 'facebook' })
    const cmp = list.find((c) => c.id === '2')!
    expect(cmp.sentiment).toBe('negativo')
    expect(cmp.brandStance).toBe(true)
    const m = await buildReport({ comments: list, focus: '', terms: ['Kanasta24'], author: '', client: 'Kanasta24' })
    expect(m.rivals[0]?.name).toMatch(/Bodega del Chago/)
    const html = reportHtml(m)
    expect(html).toContain('<h2>Comparaciones con la competencia</h2>')
    expect(html.indexOf('Comparaciones con la competencia')).toBeLessThan(html.indexOf('Qué se dice') < 0 ? Infinity : html.indexOf('Qué se dice'))
    const wa = whatsappMessage(m)
    expect(wa).toMatch(/⚠️ \*Comparan con la competencia\*: .*Bodega del Chago/)
    // en «Comentan en contra» no se repite como ejemplo
    const contra = wa.split('👎 Comentan en contra')[1] || ''
    expect(contra).not.toContain('Bodega del Chago')
  })
})
