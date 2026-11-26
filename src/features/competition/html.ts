/** HTML del informe de competencia (pantalla, Word, PDF y web) y del informe consolidado de varios informes. */
import { esc } from '@/lib/util'
import type { CompModel, CompRow, Threat } from './analyze'
import type { SavedCompReport } from './store'

/** Título de todos los informes de competencia: «Informe de la competencia y redes sociales - <cliente/marca>». */
export const compTitle = (m: Pick<CompModel, 'brand'>) => `Informe de la competencia y redes sociales - ${m.brand}`
const join = (a: string[]) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1])
const hrs = (h: number) => (h <= 48 ? `${h} h` : `${Math.round(h / 24)} días`)

/** Comparativa de la marca con la competencia (tabla, sin gráficos). */
function comparisonHtml(m: CompModel) {
  const rows = m.comparison || []
  if (rows.length < 2) return ''
  const yes = (b: boolean) => (b ? 'Sí' : 'No')
  const name = (r: CompRow) => r.name + (r.kind === 'por confirmar' ? ' (por confirmar)' : '')
  const H: string[] = ['<h3>2.3 Comparativa</h3>', `<p>${esc(m.brand)} frente a cada competidor, con los datos de su sitio, de Google y de los comentarios. «—» indica que no se encontró el dato.</p>`]
  H.push(table(['', 'Provincias', 'Pagos', 'Zelle', 'Entrega', 'Combo desde', 'Reseñas', 'Combos públicos'], rows.map((r) => [
    name(r), r.provinces ? `${r.provinces} de ${m.provinces.length}` : '—', r.payments.length ? r.payments.join(', ') : '—', yes(r.zelle), r.hours ? hrs(r.hours) : '—',
    r.minPrice ? `${r.minPrice.value} ${r.minPrice.currency}` : '—', r.rating != null ? `${r.rating}/5` : '—', yes(r.publicPrices),
  ])))
  return H.join('\n')
}
/** Combos de comida: precios, pesos, contenido, marcas, más vendidos y lo que piden los clientes. */
function combosHtml(m: CompModel) {
  const C = m.combos
  if (!C) return ''
  const H: string[] = ['<h3>2.4 Combos de comida</h3>']
  H.push(C.total ? `<p>Se analizaron ${C.total} combo${C.total === 1 ? '' : 's'} publicados en los sitios de ${esc(m.brand)} y de la competencia (precio, peso, contenido y marcas).</p>`
    : `<p>No se encontraron combos con precio en los sitios leídos.</p>${ul([
      'Activa «Buscar en Internet (Google)» al generar el informe (o pulsa «Buscar en Internet ahora» en Competidores): se leen las páginas de combos y precios de cada competidor.',
      'Confirma los competidores encontrados en Internet: la búsqueda en profundidad (combos, precios, contenido) se hace sobre los principales.',
      'Algunos sitios muestran los combos en imágenes o solo al pagar: en ese caso no se pueden leer.',
    ])}`)
  if (C.cheapest.length) H.push('<p><b>Combo más barato de cada uno</b></p>', table(['', 'Combo', 'Precio', 'Peso', 'Precio por libra', 'Contenido'], C.cheapest.map((x) => [
    x.who + (x.kind === 'por confirmar' ? ' (por confirmar)' : '') + (x.combos > 1 ? ` · ${x.combos} combos` : ''), x.combo.name, `${x.combo.price} ${x.combo.currency}`, x.combo.weightLb ? `${x.combo.weightLb} lb` : '—',
    x.combo.perLb != null ? `${x.combo.perLb} USD/lb` : '—', x.combo.items.length ? x.combo.items.map((i) => `${i.product}${i.qty ? ` ${i.qty} ${i.unit}` : ''}${i.brand ? ` (${i.brand})` : ''}`).join(', ') : '—',
  ])))
  if (C.reading.length) H.push('<p><b>Lectura</b></p>', ul(C.reading))
  if (C.top.length) H.push('<p><b>Productos más frecuentes en los combos</b></p>', table(['Producto', 'Combos que lo incluyen'], C.top.map((t) => [t.product, `${t.count} de ${C.total}`])))
  if (C.avgWeight) H.push(`<p>Peso medio de los combos con peso indicado: <b>${C.avgWeight} lb</b>.</p>`)
  if (C.brands.length) H.push('<p><b>Marcas de los productos</b></p>', ul(C.brands.map((b) => `${b.brand}: ${b.products.join(', ').toLowerCase()}${b.count > 1 ? ` (en ${b.count} combos)` : ''}`)))
  if (C.bestSellers.length) H.push('<p><b>Más vendidos o destacados en los sitios</b></p>', ul(C.bestSellers.map((x) => `${x.who}: «${x.combo.name}» · ${x.combo.price} ${x.combo.currency}`)))
  if (C.demanded.length) H.push('<p><b>Lo que más piden los clientes en los comentarios</b></p>', ul(C.demanded.map((d) => `${d.product} (${d.count} comentario${d.count === 1 ? '' : 's'})`)))
  return H.join('\n')
}

const ul = (a: string[]) => (a.length ? '<ul>' + a.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>' : '')
const table = (head: string[], rows: string[][]) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
const threat = (t: Threat, i: number) => `<p><b>${i + 1}. ${esc(t.name)}</b> — ${esc(t.headline)}</p>${ul(t.bullets)}`

export function compHtml(m: CompModel) {
  const H: string[] = []
  H.push(`<h1>${esc(compTitle(m))}</h1>`)
  if (m.author) H.push(`<p class="meta"><b>De:</b> ${esc(m.author)}</p>`)
  H.push(`<p class="meta"><b>Periodo analizado:</b> ${esc(m.period)}</p>`)
  H.push(`<p class="meta"><b>Provincias de seguimiento:</b> ${esc(join(m.provinces))}</p>`)
  H.push(`<p class="meta"><b>Red revisada:</b> ${esc(m.network)}</p>`)
  H.push(`<p class="muted meta">Generado el ${new Date(m.generatedAt).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' })}${m.aiUsed ? ' · resumen redactado con la IA de la app' : ''}</p>`)

  H.push('<h2>1. Resumen del periodo</h2>', ...m.summary.map((s) => `<p>${esc(s)}</p>`), `<p><b>Recomendación principal:</b> ${esc(m.mainRec)}</p>`)

  H.push('<h2>2. Análisis de la competencia</h2>')
  const alta = m.threats.filter((t) => t.tier === 'alta'), media = m.threats.filter((t) => t.tier === 'media'), ref = m.threats.filter((t) => t.tier === 'referencia')
  if (!m.threats.length) H.push('<p>No hay fichas de competidores. Créalas en Competencia › Competidores para tener el ranking de amenaza.</p>')
  if (alta.length) H.push('<h3>2.1 Los competidores más temibles</h3>', `<p>Ranking por nivel de amenaza en ${esc(join(m.provinces))}: combina presencia, pago, rapidez, confianza, reputación y lo que dicen los comentarios.</p>`, ...alta.map(threat))
  if (media.length) H.push('<h3>Segundo anillo</h3>', ul(media.map((t) => `${t.name}: ${t.bullets.join(' ')}`)))
  if (m.payEco.byCompetitor.length) {
    H.push('<h3>Ecosistema de pago</h3>')
    if (m.payEco.zelle.length) H.push(`<p>${m.payEco.zelle.length > 1 ? 'Operar con Zelle es el estándar del mercado, no una ventaja' : 'Zelle aparece en la competencia directa'}: ${esc(m.payEco.zelle.join(', '))}.${m.payEco.brandHasZelle ? '' : ` ${esc(m.brand)} no lo comunica: queda fuera del primer filtro de decisión.`}</p>`)
    H.push(ul(m.payEco.byCompetitor.map((x) => `${x.name}: ${x.payments.join(', ')}`)))
  }
  if (ref.length) H.push('<h3>Referencias de modelo</h3>', ul(ref.map((t) => `${t.name}: ${t.bullets.join(' ')}`)))
  if (m.webPending?.length) H.push('<h3>Encontrados en Internet (por confirmar)</h3>', '<p class="muted">Sitios que la búsqueda en Internet señala como posibles competidores. No entran en el ranking hasta que se confirmen.</p>',
    ul(m.webPending.map((w) => `${w.name} (${w.url.replace(/^https?:\/\//, '')})${w.provinces.length ? ` · ${join(w.provinces)}` : ''}${w.payments.length ? ` · ${w.payments.join(', ')}` : ''}${w.why ? ` · ${w.why}` : ''}`)))
  if (m.webInfo?.found.length || m.webInfo?.refreshed.length) H.push(`<p class="muted">Búsqueda en Internet: ${m.webInfo.found.length} sitio${m.webInfo.found.length === 1 ? '' : 's'} nuevo${m.webInfo.found.length === 1 ? '' : 's'}${m.webInfo.refreshed.length ? `; fichas actualizadas desde su sitio: ${esc(join(m.webInfo.refreshed))}` : ''}.</p>`)
  if (m.prices.length) H.push('<h3>2.2 Precios detectados</h3>', table(['Competidor', 'Producto / combo', 'Precio', 'Observación'], m.prices.map((p) => [p.competitor, p.product, p.price, p.note])))
  H.push(comparisonHtml(m))
  H.push(combosHtml(m))
  if (m.detected.length) H.push(`<p class="muted">Detectados en comentarios sin ficha: ${esc(m.detected.map((d) => `${d.name} (${d.n})`).join(', '))}.</p>`)

  H.push(`<h2>3. Consolidación por provincia</h2>`)
  if (m.brandSite?.summary) H.push(`<p><b>${esc(m.brand)} según su sitio:</b> ${esc(m.brandSite.summary)}</p>`)
  H.push(table(['', ...m.provinceRows.map((r) => r.name)], [
    ['Competidores con presencia', ...m.provinceRows.map((r) => r.present.join(', ') || '—')],
    ['Con Zelle o PayPal', ...m.provinceRows.map((r) => r.strongPay.join(', ') || '—')],
    [`Ventaja de ${m.brand}`, ...m.provinceRows.map((r) => r.advantage)],
    ['Debilidad frente a la competencia', ...m.provinceRows.map((r) => r.weakness)],
    ['Oportunidad concreta', ...m.provinceRows.map((r) => r.opportunity)],
  ]))

  H.push(`<h2>4. Análisis de redes sociales: ${esc(m.network)}</h2>`)
  H.push(`<p>Base del análisis: ${m.sources.tracks.length ? esc(m.sources.tracks.map((t) => `«${t.name}»`).join(', ')) + ` (${m.social.total} comentarios en publicaciones de ${esc(m.brand)})` : 'sin seguimientos en el periodo'}.</p>`)
  H.push(...m.social.reading.map((r) => `<p>${esc(r)}</p>`))
  if (m.social.authors.length) H.push('<h3>4.1 Usuarios más activos</h3>', '<ul>' + m.social.authors.map((a) => `<li><b>${esc(a.name)}</b>: ${esc(a.role)}.${a.quotes.length ? ' ' + a.quotes.map((x) => `«${esc(x)}»`).join(' ') : ''}</li>`).join('') + '</ul>')
  if (m.social.themes.length) H.push('<h3>4.2 Temas recurrentes</h3>', ul(m.social.themes))
  if (m.evidence.length) H.push('<h3>Lo que dicen sobre pagos, cobertura y precios</h3>', ...m.evidence.map((e) => `<p><b>${esc(e.topic)}</b></p>` + e.items.map((x) => `<blockquote>«${esc(x.text)}» — <b>${esc(x.author)}</b></blockquote>`).join('')))
  if (m.coverageQs.length) H.push('<h3>Consultas de cobertura</h3>', table(['Lugar', 'Provincia', 'Quién', 'Respondida'], m.coverageQs.map((c) => [c.place, c.province, c.author, c.answered ? 'Sí' : 'No'])))

  if (m.proposals.length) H.push('<h2>5. Propuestas de contenido para Facebook</h2>', ...m.proposals.map((p, i) => `<p><b>${i + 1}. ${esc(p.title)}.</b> Texto sugerido: ${esc(p.text)}</p><p class="muted">Objetivo: ${esc(p.goal)}</p>`))
  H.push('<h2>6. Recomendaciones y próximos pasos</h2>', '<ol>' + m.recommendations.map((r) => `<li>${esc(r)}</li>`).join('') + '</ol>')
  if (m.pending.length) H.push('<p><b>Pendientes para el próximo informe:</b></p>', ul(m.pending))
  H.push('<h2>7. Conclusiones</h2>', ...m.conclusions.map((c) => `<p>${esc(c)}</p>`))
  if (m.annexes.length) H.push('<h2>8. Anexos</h2>', ul(m.annexes))
  if (m.author) H.push(`<p><b>Firma:</b><br>${esc(m.author)}</p>`)
  return H.join('\n')
}

/** Valor y cambio entre paréntesis (verde si favorece a la marca, rojo si no, gris si es neutro). */
function withChange(now: number | null | undefined, before: number | null | undefined, unit: string, good: 'up' | 'down' | 'none') {
  if (now == null) return '—'
  const v = esc(`${Math.round(now * 100) / 100}${unit}`)
  if (before == null) return v
  const d = Math.round((now - before) * 100) / 100
  if (!d) return `${v} <span class="muted">(=)</span>`
  const cls = good === 'none' ? 'muted' : (d > 0) === (good === 'up') ? 'pos' : 'neg'
  return `${v} <span class="${cls}">(${d > 0 ? '▲ +' : '▼ '}${d}${unit})</span>`
}

/** Sección del consolidado sobre combos, alimentos y precios: evolución del mercado, de cada competidor y de la marca. */
function combosEvolution(M: CompModel[], base: CompModel, prev: CompModel | null, label: (m: CompModel, i: number) => string) {
  const H: string[] = ['<h2>4. Combos, alimentos y precios</h2>']
  const has = M.filter((m) => m.combos && (m.combos.total || m.combos.cheapest.length))
  if (!has.length) { H.push('<p>Ninguno de los informes tiene combos con precio: activa la búsqueda en Internet al generarlos para analizar los combos de la competencia.</p>'); return H }
  const brand = base.brand
  const entryOf = (m: CompModel) => m.combos?.cheapest.find((x) => x.kind === 'marca')?.combo.price ?? null
  const short = (m: CompModel) => (m.from === m.to ? new Date(m.from + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short' }) : `${new Date(m.from + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })} – ${new Date(m.to + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}`)

  /* 4.1 el mercado en cada informe */
  H.push('<h3>4.1 El mercado de combos en cada informe</h3>', '<p class="muted">Del más antiguo al más reciente. Entre paréntesis, el cambio frente al informe anterior.</p>')
  H.push(`<table><thead><tr><th>Informe</th><th>Combo más barato</th><th>Mediana de entrada</th><th>Mejor USD/lb</th><th>Peso medio</th><th>Combos</th><th>Combo de entrada de ${esc(brand)}</th></tr></thead><tbody>${M.map((m, i) => {
    const p = i ? M[i - 1] : null, C = m.combos, P = p?.combos
    return `<tr><td>${esc(short(m))}${i === M.length - 1 ? ' <b>(referencia)</b>' : ''}</td><td>${withChange(C?.floor?.combo.price, P?.floor?.combo.price, ' USD', 'none')}${C?.floor ? `<br><span class="muted">${esc(C.floor.who)}</span>` : ''}</td><td>${withChange(C?.medianMin, P?.medianMin, ' USD', 'none')}</td><td>${withChange(C?.bestPerLb?.combo.perLb, P?.bestPerLb?.combo.perLb, '', 'none')}</td><td>${withChange(C?.avgWeight, P?.avgWeight, ' lb', 'none')}</td><td>${withChange(C?.total, P?.total, '', 'none')}</td><td>${withChange(entryOf(m), p ? entryOf(p) : null, ' USD', 'down')}</td></tr>`
  }).join('')}</tbody></table>`)

  /* 4.2 combo de entrada de cada uno a lo largo de los informes (como mucho los 5 últimos) */
  const cols = M.slice(-5)
  const who = [...new Set(cols.flatMap((m) => (m.combos?.cheapest || []).map((x) => x.who)))]
  const priceAt = (m: CompModel, w: string) => m.combos?.cheapest.find((x) => x.who === w)?.combo.price ?? null
  if (who.length) {
    H.push('<h3>4.2 Combo de entrada de cada uno</h3>', `<p class="muted">El combo más barato de cada uno en cada informe. Para la competencia, en rojo si lo abarata (compite mejor) y en verde si lo encarece; para ${esc(brand)}, al revés.</p>`)
    H.push(`<table><thead><tr><th></th>${cols.map((m) => `<th>${esc(short(m))}</th>`).join('')}</tr></thead><tbody>${who.sort((a, b) => Number(b === brand) - Number(a === brand) || (priceAt(cols[cols.length - 1], a) ?? 1e9) - (priceAt(cols[cols.length - 1], b) ?? 1e9)).map((w) =>
      `<tr><td>${w === brand ? `<b>${esc(w)}</b>` : esc(w)}</td>${cols.map((m, i) => `<td>${withChange(priceAt(m, w), i ? priceAt(cols[i - 1], w) : null, ' USD', w === brand ? 'down' : 'up')}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
  }

  /* 4.3 combos nuevos, retirados y cambios de precio (referencia frente al anterior) */
  if (prev?.combos?.ladder && base.combos?.ladder) {
    const key = (w: string, n: string) => w + '|' + n.toLowerCase()
    const now = new Map(base.combos.ladder.flatMap((l) => l.combos.map((c) => [key(l.who, c.name), { who: l.who, ...c }] as const)))
    const was = new Map(prev.combos.ladder.flatMap((l) => l.combos.map((c) => [key(l.who, c.name), { who: l.who, ...c }] as const)))
    const nuevos = [...now].filter(([k]) => !was.has(k)).map(([, c]) => c), fuera = [...was].filter(([k]) => !now.has(k)).map(([, c]) => c)
    const cambios = [...now].filter(([k, c]) => was.has(k) && Math.abs(was.get(k)!.price - c.price) >= 0.01).map(([k, c]) => ({ ...c, before: was.get(k)!.price }))
    const line = (c: { who: string; name: string; price: number; weightLb: number; perLb: number | null }) => `${c.who}: «${c.name}» · ${c.price} USD${c.weightLb ? ` · ${c.weightLb} lb` : ''}${c.perLb != null ? ` · ${c.perLb} USD/lb` : ''}`
    if (nuevos.length || fuera.length || cambios.length) {
      H.push('<h3>4.3 Cambios en los combos frente al informe anterior</h3>')
      if (cambios.length) H.push('<p><b>Cambian de precio</b></p>', `<table><thead><tr><th>Quién</th><th>Combo</th><th>Precio</th></tr></thead><tbody>${cambios.map((c) => `<tr><td>${esc(c.who)}</td><td>${esc(c.name)}</td><td>${withChange(c.price, c.before, ' USD', c.who === brand ? 'down' : 'up')}</td></tr>`).join('')}</tbody></table>`)
      if (nuevos.length) H.push('<p><b>Combos nuevos</b></p>', ul(nuevos.slice(0, 12).map(line)))
      if (fuera.length) H.push('<p><b>Ya no aparecen</b></p>', ul(fuera.slice(0, 12).map(line)))
    } else H.push('<h3>4.3 Cambios en los combos frente al informe anterior</h3>', '<p>Los combos y sus precios no cambian frente al informe anterior.</p>')
  }

  /* 4.4 alimentos en los combos */
  const B = base.combos, P = prev?.combos
  if (B?.top.length) {
    const share = (C: CompModel['combos'], p: string) => { const t = C?.top.find((x) => x.product === p); return C && C.total && t ? Math.round((t.count / C.total) * 100) : C ? 0 : null }
    const prods = [...new Set([...B.top.map((t) => t.product), ...(P?.top || []).map((t) => t.product)])].sort((a, b) => (share(B, b) || 0) - (share(B, a) || 0)).slice(0, 12)
    H.push('<h3>4.4 Alimentos en los combos</h3>', '<p class="muted">Porcentaje de combos que incluyen cada producto; entre paréntesis, el cambio en puntos frente al informe anterior.</p>')
    H.push(`<table><thead><tr><th>Producto</th><th>Combos que lo incluyen</th></tr></thead><tbody>${prods.map((p) => `<tr><td>${esc(p)}</td><td>${withChange(share(B, p), P ? share(P, p) : null, ' %', 'none').replace(/ %\)/, ' pp)')}</td></tr>`).join('')}</tbody></table>`)
    if (P) {
      const entran = B.top.filter((t) => !P.top.some((x) => x.product === t.product)).map((t) => t.product), salen = P.top.filter((t) => !B.top.some((x) => x.product === t.product)).map((t) => t.product)
      if (entran.length) H.push(`<p>Entran en los combos: ${esc(join(entran.map((x) => x.toLowerCase())))}.</p>`)
      if (salen.length) H.push(`<p>Dejan de aparecer: ${esc(join(salen.map((x) => x.toLowerCase())))}.</p>`)
      const mNew = B.brands.filter((b) => !P.brands.some((x) => x.brand.toLowerCase() === b.brand.toLowerCase()))
      if (mNew.length) H.push(`<p>Marcas nuevas en los combos: ${esc(join(mNew.map((b) => `${b.brand} (${b.products.join(', ').toLowerCase()})`)))}.</p>`)
    }
    if (B.brands.length) H.push(`<p>Marcas presentes ahora: ${esc(join(B.brands.slice(0, 10).map((b) => b.brand)))}.</p>`)
  }

  /* 4.5 lo que piden los clientes */
  if (B?.demanded.length || P?.demanded.length) {
    const prods = [...new Set([...(B?.demanded || []).map((d) => d.product), ...(P?.demanded || []).map((d) => d.product)])]
    const cnt = (C: CompModel['combos'] | undefined, p: string) => C?.demanded.find((d) => d.product === p)?.count ?? (C ? 0 : null)
    H.push('<h3>4.5 Lo que piden los clientes en los comentarios</h3>', `<table><thead><tr><th>Producto</th><th>Comentarios</th></tr></thead><tbody>${prods.sort((a, b) => (cnt(B, b) || 0) - (cnt(B, a) || 0)).slice(0, 10).map((p) => `<tr><td>${esc(p)}</td><td>${withChange(cnt(B, p), P ? cnt(P, p) : null, '', 'none')}</td></tr>`).join('')}</tbody></table>`)
  }

  /* 4.6 posición de la marca frente a la mediana */
  const pos = M.map((m) => ({ e: entryOf(m), med: m.combos?.medianMin ?? null })).filter((x) => x.e != null && x.med != null)
  if (pos.length) {
    const above = pos.filter((x) => x.e! > x.med!).length
    const last = pos[pos.length - 1], gap = Math.round((last.e! - last.med!) * 100) / 100
    H.push('<h3>4.6 Posición de ' + esc(brand) + '</h3>', `<p>El combo de entrada de ${esc(brand)} estuvo por encima de la mediana de la competencia en ${above} de ${pos.length} informe${pos.length === 1 ? '' : 's'}. En el más reciente está ${gap > 0 ? `${gap} USD por encima` : gap < 0 ? `${-gap} USD por debajo` : 'justo en la mediana'} (${last.e} USD frente a ${last.med} USD).</p>`)
  }
  void label
  return H
}

/**
 * Consolidado de varios informes: el más reciente es la referencia y se compara con el anterior y con el primero.
 * Evolución de indicadores, cambios en la competencia (nuevos, desaparecidos, quién sube o baja), precios y combos,
 * debilidades que persisten o se resuelven y recomendaciones vigentes, nuevas o atendidas.
 */
export function consolidatedHtml(reps: SavedCompReport[]) {
  const R = [...reps].sort((a, b) => a.to.localeCompare(b.to) || a.createdAt - b.createdAt)
  const M = R.map((r) => r.model as CompModel)
  const base = M[M.length - 1], prev = M.length > 1 ? M[M.length - 2] : null, first = M.length > 2 ? M[0] : null
  if (!base) return '<p>No hay informes.</p>'
  const day = (d: string) => new Date(d + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
  const when = (m: CompModel) => new Date(m.generatedAt).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const label = (m: CompModel, i: number) => `${m.from === m.to ? day(m.from) : `${day(m.from)} – ${day(m.to)}`} (generado el ${when(m)})${i === M.length - 1 ? ' · referencia' : ''}`
  const n2 = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(v * 100) / 100))
  const rivalsOf = (m: CompModel) => (m.comparison || []).filter((r) => r.kind !== 'marca')
  const entry = (m: CompModel) => m.combos?.cheapest.find((x) => x.kind === 'marca')?.combo.price ?? null
  // indicadores: valor, y si «más» es bueno o malo
  const IND: { k: string; v: (m: CompModel) => number | null; unit?: string; good: 'up' | 'down' | 'none' }[] = [
    { k: 'Comentarios analizados', v: (m) => m.social.total, good: 'up' },
    { k: 'Opinión a favor', v: (m) => (m.social.total ? m.social.posPct : null), unit: ' %', good: 'up' },
    { k: 'Opinión en contra', v: (m) => (m.social.total ? m.social.negPct : null), unit: ' %', good: 'down' },
    { k: 'Competidores analizados', v: (m) => rivalsOf(m).length || m.threats.length, good: 'none' },
    { k: 'Competidores de amenaza alta', v: (m) => m.threats.filter((t) => t.tier === 'alta').length, good: 'down' },
    { k: 'Comparaciones a favor de la competencia', v: (m) => m.threats.reduce((a, t) => a + t.favor, 0), good: 'down' },
    { k: 'Combo más barato del mercado', v: (m) => m.combos?.floor?.combo.price ?? null, unit: ' USD', good: 'none' },
    { k: 'Mediana del combo de entrada', v: (m) => m.combos?.medianMin ?? null, unit: ' USD', good: 'none' },
    { k: `Combo de entrada de ${base.brand}`, v: entry, unit: ' USD', good: 'down' },
    { k: 'Consultas de cobertura sin respuesta', v: (m) => m.coverageQs.filter((x) => !x.answered).length, good: 'down' },
  ]
  const delta = (a: number | null, b: number | null, unit = '', good: 'up' | 'down' | 'none' = 'none') => {
    if (a == null || b == null) return { txt: '—', cls: '' }
    const d = Math.round((a - b) * 100) / 100
    if (!d) return { txt: '=', cls: '' }
    const better = good === 'none' ? null : (d > 0) === (good === 'up')
    return { txt: `${d > 0 ? '▲ +' : '▼ '}${d}${unit.trim() === '%' ? ' pp' : unit}`, cls: better == null ? '' : better ? 'pos' : 'neg' }
  }
  const H: string[] = []
  H.push(`<h1>Informe consolidado de la competencia y redes sociales - ${esc(base.brand)}</h1>`)
  H.push(`<p class="meta"><b>Informe de referencia (el más reciente):</b> ${esc(base.period)}, generado el ${esc(when(base))}</p>`)
  H.push(`<p class="meta"><b>Comparado con:</b> ${prev ? esc(`el informe anterior (${prev.period}, generado el ${when(prev)})`) : 'ningún informe anterior'}${first ? esc(` y con el primero del conjunto (${first.period})`) : ''} · ${M.length} informe${M.length === 1 ? '' : 's'}</p>`)
  H.push(`<p class="meta"><b>Provincias:</b> ${esc(join([...new Set(M.flatMap((m) => m.provinces))]))}</p>`)

  /* ---- 1. resumen de la evolución ---- */
  const S: string[] = []
  if (prev) {
    if (base.social.total && prev.social.total) {
      const dp = base.social.posPct - prev.social.posPct, dn = base.social.negPct - prev.social.negPct
      S.push(`La opinión sobre ${base.brand} ${Math.abs(dp) < 3 && Math.abs(dn) < 3 ? 'se mantiene estable' : dp > 0 && dn <= 0 ? 'mejora' : dn > 0 && dp <= 0 ? 'empeora' : 'cambia'}: ${base.social.posPct} % a favor (${dp >= 0 ? '+' : ''}${dp} pp) y ${base.social.negPct} % en contra (${dn >= 0 ? '+' : ''}${dn} pp) frente al informe anterior, con ${base.social.total} comentarios (${base.social.total - prev.social.total >= 0 ? '+' : ''}${base.social.total - prev.social.total}).`)
    }
    const now = new Set(rivalsOf(base).map((r) => r.name)), was = new Set(rivalsOf(prev).map((r) => r.name))
    const nuevos = [...now].filter((x) => !was.has(x)), fuera = [...was].filter((x) => !now.has(x))
    if (nuevos.length) S.push(`${nuevos.length === 1 ? 'Aparece un competidor nuevo' : `Aparecen ${nuevos.length} competidores nuevos`}: ${join(nuevos)}.`)
    if (fuera.length) S.push(`Dejan de aparecer: ${join(fuera)}.`)
    const thr = (m: CompModel) => new Map(rivalsOf(m).map((r) => [r.name, r.threat || 0]))
    const tb = thr(base), tp = thr(prev)
    const ups = [...tb].filter(([k, v]) => tp.has(k) && v - (tp.get(k) || 0) >= 3).map(([k, v]) => `${k} (${tp.get(k)} → ${v})`)
    const downs = [...tb].filter(([k, v]) => tp.has(k) && (tp.get(k) || 0) - v >= 3).map(([k, v]) => `${k} (${tp.get(k)} → ${v})`)
    if (ups.length) S.push(`Suben en nivel de amenaza: ${join(ups)}.`)
    if (downs.length) S.push(`Bajan en nivel de amenaza: ${join(downs)}.`)
    const fb = base.combos?.floor, fp = prev.combos?.floor
    if (fb && fp && Math.abs(fb.combo.price - fp.combo.price) >= 0.01) S.push(`El combo más barato del mercado pasa de ${fp.combo.price} USD (${fp.who}) a ${fb.combo.price} USD (${fb.who}).`)
    const eb = entry(base), ep = entry(prev)
    if (eb != null && ep != null && Math.abs(eb - ep) >= 0.01) S.push(`El combo de entrada de ${base.brand} pasa de ${ep} a ${eb} USD${base.combos?.medianMin != null ? ` (mediana de la competencia: ${base.combos.medianMin} USD)` : ''}.`)
    const mb = base.combos?.medianMin, mp = prev.combos?.medianMin
    if (mb != null && mp != null && Math.abs(mb - mp) >= 0.01) S.push(`La mediana del combo de entrada de la competencia ${mb < mp ? 'baja' : 'sube'} de ${mp} a ${mb} USD: el mercado se vuelve ${mb < mp ? 'más barato' : 'más caro'}.`)
    const pb = base.combos?.bestPerLb?.combo.perLb, pp = prev.combos?.bestPerLb?.combo.perLb
    if (pb != null && pp != null && Math.abs(pb - pp) >= 0.01) S.push(`El mejor precio por libra pasa de ${pp} a ${pb} USD/lb (${base.combos!.bestPerLb!.who}).`)
    const zNow = new Set(base.payEco.zelle), zWas = new Set(prev.payEco.zelle)
    const zNew = [...zNow].filter((x) => !zWas.has(x))
    if (zNew.length) S.push(`Empiezan a comunicar Zelle: ${join(zNew)}.`)
    if (!S.length) S.push('No hay cambios relevantes frente al informe anterior: la situación se mantiene.')
  } else S.push('Solo hay un informe en el conjunto: no hay con qué compararlo. Selecciona varios informes o un rango de fechas más amplio.')
  H.push('<h2>1. Resumen de la evolución</h2>', ...S.map((x) => `<p>${esc(x)}</p>`))

  /* ---- 2. indicadores ---- */
  H.push('<h2>2. Indicadores</h2>')
  // valor y, entre paréntesis, el cambio (verde si favorece a la marca, rojo si no, gris si es neutro)
  const inl = (a: number | null, b: number | null, u: string, good: 'up' | 'down' | 'none') => {
    if (a == null) return '—'
    const v = esc(n2(a) + u)
    if (b == null) return v
    const dd = delta(a, b, u, good)
    return dd.txt === '=' ? `${v} <span class="muted">(=)</span>` : `${v} <span class="${dd.cls || 'muted'}">(${esc(dd.txt)})</span>`
  }
  if (prev) H.push(`<p class="muted">Entre paréntesis, el cambio frente al informe anterior${first ? ' (y, en la última columna, desde el primero)' : ''}: en verde si favorece a ${esc(base.brand)}, en rojo si no.</p>`)
  H.push(`<table><thead><tr><th>Indicador</th><th>Más reciente</th>${first ? '<th>Desde el primero</th>' : ''}</tr></thead><tbody>` +
    IND.map((d) => {
      const a = d.v(base), b = prev ? d.v(prev) : null, c = first ? d.v(first) : null, u = d.unit || ''
      return `<tr><td>${esc(d.k)}</td><td>${inl(a, b, u, d.good)}</td>${first ? `<td>${inl(a, c, u, d.good)}</td>` : ''}</tr>`
    }).join('') + '</tbody></table>')

  /* ---- 3. competencia: ahora frente a antes ---- */
  if (prev) {
    const rb = new Map(rivalsOf(base).map((r) => [r.name, r])), rp = new Map(rivalsOf(prev).map((r) => [r.name, r]))
    const names = [...new Set([...rb.keys(), ...rp.keys()])].sort((a, b) => (rb.get(b)?.threat || 0) - (rb.get(a)?.threat || 0))
    // valor actual y, entre paréntesis, el cambio frente al anterior (verde si favorece a la marca, rojo si no)
    const chg = (now: number | null | undefined, before: number | null | undefined, unit: string, upIsBad: boolean) => {
      if (now == null) return '—'
      if (before == null) return `${esc(String(now))}${unit}`
      const d = Math.round((now - before) * 100) / 100
      if (!d) return `${esc(String(now))}${unit} <span class="muted">(=)</span>`
      return `${esc(String(now))}${unit} <span class="${(d > 0) === upIsBad ? 'neg' : 'pos'}">(${d > 0 ? '▲ +' : '▼ '}${d}${unit})</span>`
    }
    if (names.length) H.push('<h2>3. Cambios en la competencia</h2>', '<p class="muted">Entre paréntesis, el cambio frente al informe anterior: en verde si favorece a ' + esc(base.brand) + ', en rojo si no (más amenaza o combos más baratos de la competencia).</p>',
      `<table><thead><tr><th>Competidor</th><th>Estado</th><th>Amenaza</th><th>Combo desde</th><th>Pagos</th></tr></thead><tbody>${names.map((nm) => {
        const a = rb.get(nm), b = rp.get(nm)
        const st = a && !b ? 'Nuevo' : !a && b ? 'Ya no aparece' : a?.kind === 'por confirmar' ? 'Por confirmar' : 'Sigue'
        const pays = a && b ? [...a.payments.filter((x) => !b.payments.includes(x)).map((x) => `+${x}`), ...b.payments.filter((x) => !a.payments.includes(x)).map((x) => `−${x}`)] : []
        const payTxt = a && !b ? a.payments.join(', ') || '—' : !a ? '—' : pays.length ? pays.join(', ') : 'sin cambios'
        const priceNow = a?.minPrice?.currency === 'USD' ? a.minPrice.value : null, priceBefore = b?.minPrice?.currency === 'USD' ? b.minPrice.value : null
        return `<tr><td>${esc(nm)}</td><td>${st}</td><td>${a ? chg(a.threat, b?.threat, '', true) : esc(b?.threat != null ? `${b.threat} antes` : '—')}</td><td>${a ? chg(priceNow, priceBefore, ' USD', false) : esc(priceBefore != null ? `${priceBefore} USD antes` : '—')}</td><td>${esc(payTxt)}</td></tr>`
      }).join('')}</tbody></table>`)
  }

  /* ---- 4. combos, alimentos y precios ---- */
  H.push(...combosEvolution(M, base, prev, label))

  /* ---- 5. debilidades ---- */
  const weakOf = (m: CompModel) => new Set(m.provinceRows.flatMap((r) => r.weakness.split('; ').filter((w) => w && w !== '—')))
  const wb = weakOf(base), wp = prev ? weakOf(prev) : new Set<string>()
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
  const persist = [...wb].filter((x) => wp.has(x)), nuevas = prev ? [...wb].filter((x) => !wp.has(x)) : [...wb], resueltas = [...wp].filter((x) => !wb.has(x))
  if (wb.size || resueltas.length) {
    H.push('<h2>5. Debilidades de la marca</h2>')
    if (persist.length) H.push('<p><b>Persisten</b></p>', ul(persist.map((x) => `${cap(x)} (en ${M.filter((m) => weakOf(m).has(x)).length} de ${M.length} informes)`)))
    if (prev && nuevas.length) H.push('<p><b>Nuevas</b></p>', ul(nuevas.map(cap)))
    if (!prev && nuevas.length) H.push(ul(nuevas.map(cap)))
    if (resueltas.length) H.push('<p><b>Resueltas desde el informe anterior</b></p>', ul(resueltas.map(cap)))
  }

  /* ---- 5. recomendaciones ---- */
  const rpSet = new Set(prev?.recommendations || [])
  const since = (r: string) => { let k = 0; for (let i = M.length - 1; i >= 0 && M[i].recommendations.includes(r); i--) k++; return k }
  const vigentes = base.recommendations.filter((r) => rpSet.has(r)), nuevasR = base.recommendations.filter((r) => !rpSet.has(r)), atendidas = [...rpSet].filter((r) => !base.recommendations.includes(r))
  H.push('<h2>6. Recomendaciones</h2>')
  if (vigentes.length) H.push('<p><b>Siguen vigentes</b></p>', '<ol>' + vigentes.map((r) => `<li>${esc(r)} <span class="muted">(desde hace ${since(r)} informe${since(r) === 1 ? '' : 's'})</span></li>`).join('') + '</ol>')
  if (nuevasR.length) H.push(`<p><b>${prev ? 'Nuevas' : 'Del informe de referencia'}</b></p>`, '<ol>' + nuevasR.map((r) => `<li>${esc(r)}</li>`).join('') + '</ol>')
  if (atendidas.length) H.push('<p><b>Ya no aparecen (posiblemente atendidas)</b></p>', ul(atendidas))

  /* ---- 6. historial y conclusión ---- */
  H.push('<h2>7. Informes incluidos</h2>', table(['Informe', 'Comentarios', 'A favor', 'En contra', 'Amenaza alta', 'Combo más barato'],
    [...M].reverse().map((m, i) => [label(m, M.length - 1 - i), String(m.social.total), m.social.total ? `${m.social.posPct} %` : '—', m.social.total ? `${m.social.negPct} %` : '—', m.threats.filter((t) => t.tier === 'alta').map((t) => t.name).join(', ') || '—', m.combos?.floor ? `${m.combos.floor.combo.price} USD (${m.combos.floor.who})` : '—'])))
  H.push('<h2>8. Conclusión</h2>')
  if (prev) H.push(`<p>${esc(S[0])}</p>`)
  H.push(...base.conclusions.map((c) => `<p>${esc(c)}</p>`))
  if (base.author) H.push(`<p><b>Firma:</b><br>${esc(base.author)}</p>`)
  return H.join('\n')
}
