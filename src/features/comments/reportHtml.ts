import { esc } from '@/lib/util'
import { platName } from './text'
import type { ReportModel } from './report'
import type { Comment } from './types'
import { ASPECTS } from './aspects'

const n = (x: number) => (x ?? 0).toLocaleString('es')
/** Publicación o reel del comentario, como referencia (con enlace si se conoce). */
const postRef = (c: Comment) => {
  const l = (c._post || '').replace(/\s+/g, ' ').trim()
  if (!l) return ''
  const t = esc(l.length > 90 ? l.slice(0, 87).replace(/\s+\S*$/, '') + '…' : l)
  return `<br><span class="muted">En: ${c._postUrl ? `<a href="${esc(c._postUrl)}">${t}</a>` : t}</span>`
}
/**
 * Destacados agrupados por publicación o reel: nombre como subtítulo y su URL visible (sirve también impreso).
 * Los grupos siguen el orden de los destacados (el de más impacto primero).
 */
function byPost(list: Comment[]) {
  const groups = new Map<string, { label: string; url: string; items: Comment[] }>()
  list.forEach((c) => {
    const k = c._ref?.postId || c._postUrl || c._post || ''
    const g = groups.get(k) || { label: (c._post || '').replace(/\s+/g, ' ').trim(), url: c._postUrl || '', items: [] }
    g.items.push(c); groups.set(k, g)
  })
  if (groups.size === 1 && !list[0]?._post && !list[0]?._postUrl) return list.map((c) => quote(c, false)).join('')
  return [...groups.values()].map((g) =>
    `<h3>${esc(g.label || 'Publicación')}</h3>${g.url ? `<p class="muted meta"><a href="${esc(g.url)}">${esc(g.url)}</a></p>` : ''}` + g.items.map((c) => quote(c, false)).join('')).join('')
}
const quote = (c: Comment, ref = true) => `<blockquote>«${esc(c.text.length > 280 ? c.text.slice(0, 277) + '…' : c.text)}» — <b>${esc(c.authorName || 'Anónimo')}</b>${c.reactions ? ` <span class="muted">· ${n(c.reactions)} ${c.reactions === 1 ? 'reacción' : 'reacciones'}</span>` : ''}${ref ? postRef(c) : ''}</blockquote>`

/** HTML del informe (se usa igual en pantalla, Word, PDF y página web). */
export function reportHtml(m: ReportModel) {
  const H: string[] = []
  H.push(`<h1>Informe de comentarios${m.focus ? ` sobre ${esc(m.focus.name)}` : ''}</h1>`)
  // cabecera: cada dato en su propia línea
  H.push(`<p class="muted meta">${esc(m.period)}${m.client ? ` · ${esc(m.client)}` : ''}</p>`)
  if (m.author) H.push(`<p class="muted meta">Elaborado por ${esc(m.author)}</p>`)
  H.push(`<p class="muted meta">Generado el ${new Date(m.generatedAt).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' })}</p>`)
  H.push('<h2>Resumen</h2>', ...m.summary.map((s) => `<p>${esc(s)}</p>`))
  H.push('<h2>Indicadores</h2><table><thead><tr><th>Indicador</th><th>Actual</th>' + (m.prev ? `<th>Anterior</th><th>Cambio</th>` : '') + '</tr></thead><tbody>' +
    m.cmp.map((r) => `<tr><td>${esc(r.k)}</td><td><b>${r.a == null ? '—' : n(r.a)}</b></td>${m.prev ? `<td>${r.b == null ? '—' : n(r.b)}</td><td class="${r.tone === 'up' ? 'pos' : r.tone === 'down' ? 'neg' : ''}">${esc(r.D)}</td>` : ''}</tr>`).join('') + '</tbody></table>')
  if (m.prev) H.push(`<p class="muted">Actual: el seguimiento más reciente${m.tracks.length ? ` («${esc(m.tracks[m.tracks.length - 1].name)}»)` : ''}. Comparado con ${esc(m.prevName)}.</p>`)
  // evaluación de la marca por aspecto (solo los aspectos de los que se habla)
  const VERD = { fortaleza: ['+', 'Fortaleza', 'pos'], mixto: ['·', 'A mejorar', ''], debil: ['−', 'Punto débil', 'neg'] } as const
  if (m.aspects.brand.length) {
    H.push(`<h2>Evaluación de ${esc(m.brand)} por aspecto</h2>` +
      '<table><thead><tr><th>Aspecto</th><th>Menciones</th><th>Positivas</th><th>Negativas</th><th>Valoración</th></tr></thead><tbody>' +
      m.aspects.brand.map((a) => `<tr><td>${esc(a.name)}</td><td>${n(a.n)}</td><td class="pos">${n(a.pos)}</td><td class="neg">${n(a.neg)}</td><td class="${VERD[a.verdict][2]}"><b>${VERD[a.verdict][0]}</b> ${VERD[a.verdict][1]}</td></tr>`).join('') + '</tbody></table>')
    m.aspects.brand.filter((a) => a.negEx.length || a.posEx.length).forEach((a) => {
      H.push(`<h3>${esc(a.name)}</h3>` + [...a.negEx.slice(0, 2), ...a.posEx.slice(0, 1)].map((c) => quote(c)).join(''))
    })
    const missing = ASPECTS.filter((d) => !m.aspects.brand.some((a) => a.key === d.key)).map((d) => d.short)
    if (missing.length) H.push(`<p class="muted">Sin comentarios sobre ${esc(missing.join(', '))} en este periodo.</p>`)
  }
  // comparaciones con la competencia: punto crítico, justo después de los indicadores
  if (m.rivals.length) H.push('<h2>Comparaciones con la competencia</h2>' +
    (m.aspects.rivals.length ? '<table><thead><tr><th>Aspecto</th><th>A favor de la competencia</th><th>En contra de la competencia</th><th>Competidores</th></tr></thead><tbody>' +
      m.aspects.rivals.map((r) => `<tr><td>${esc(r.name)}</td><td class="neg">${n(r.favor)}</td><td class="pos">${n(r.against)}</td><td>${esc(r.rivals.join(', ') || '—')}</td></tr>`).join('') + '</tbody></table>' : '') +
    m.rivals.map((r) =>
    `<h3>${esc(r.name)} — ${n(r.n)} ${r.n === 1 ? 'comentario' : 'comentarios'}</h3>` + r.samples.slice(0, 2).map((c) => quote(c)).join('')).join('') +
    '<p class="muted">Detectado por nombres propios y comparaciones al hablar de compras; revísalo antes de actuar.</p>')
  if (m.evolution.length > 1) {
    // la base es el seguimiento más reciente; en los demás, entre paréntesis, cuánto cambia la base respecto a ellos
    const d = (x: number | undefined, good: 'up' | 'down') => x == null ? '' : x === 0 ? ' <span class="muted">(=)</span>' : ` <span class="${(x > 0) === (good === 'up') ? 'pos' : 'neg'}">(${x > 0 ? '▲ +' : '▼ '}${n(x)})</span>`
    H.push('<h2>Evolución por seguimiento</h2><p class="muted">Base: el seguimiento más reciente. Entre paréntesis, cuánto cambia la base respecto a cada uno de los anteriores.</p><table><thead><tr><th>Seguimiento</th><th>Fecha y hora</th><th>Comentarios</th><th>Positivos</th><th>Negativos</th></tr></thead><tbody>' +
      m.evolution.map((e) => `<tr><td>${e.base ? '<b>' : ''}${esc(e.name)}${e.base ? '</b> <span class="muted">(base)</span>' : ''}</td><td>${esc(e.date)}</td><td>${n(e.total)}${d(e.dTotal, 'up')}</td><td>${n(e.pos)}${d(e.dPos, 'up')}</td><td>${n(e.neg)}${d(e.dNeg, 'down')}</td></tr>`).join('') + '</tbody></table>')
  }
  if (m.posts.length > 1 || (m.posts[0] && m.posts[0].url)) H.push('<h2>Por publicación</h2><table><thead><tr><th>Publicación</th><th>Red</th><th>Comentarios</th><th>Positivos</th><th>Negativos</th></tr></thead><tbody>' + m.posts.map((p) => `<tr><td>${p.url ? `<a href="${esc(p.url)}">${esc(p.label)}</a>` : esc(p.label)}</td><td>${esc(platName(p.platform))}</td><td>${n(p.total)}</td><td class="pos">${n(p.pos)}</td><td class="neg">${n(p.neg)} (${p.negPct} %)</td></tr>`).join('') + '</tbody></table>')
  if (m.topAuthors.length) H.push('<h2>Quién más comenta</h2><ol>' + m.topAuthors.map((a) => `<li>${esc(a.name)} — ${n(a.count)}</li>`).join('') + '</ol>')
  if (m.opinions.length) {
    // agrupadas: primero las positivas (+), luego las negativas (−) y al final las neutrales
    const RANK = { positivo: 0, negativo: 1, neutral: 2 } as const, SIGN = { positivo: '+', negativo: '−', neutral: '·' } as const
    const ops = [...m.opinions].sort((a, b) => RANK[a.s] - RANK[b.s])
    H.push('<h2>Qué se dice</h2>' + ops.map((o) => `<p class="${o.s === 'positivo' ? 'pos' : o.s === 'negativo' ? 'neg' : ''}"><b>${SIGN[o.s]}</b>&nbsp; «${esc(o.t)}»${o.n > 1 ? ` <span class="muted">(${o.n} personas)</span>` : ''}</p>`).join(''))
  }
  if (m.fans.length) H.push('<h2>Quiénes hablan bien</h2><p>' + m.fans.map(([a, k]) => `${esc(a)} (${k})`).join(', ') + '</p>')
  if (m.critics.length) H.push('<h2>Quiénes más critican</h2><p>' + m.critics.map(([a, k]) => `${esc(a)} (${k})`).join(', ') + '</p>')
  if (m.highlightsPos.length) H.push('<h2>Comentarios positivos destacados</h2>' + byPost(m.highlightsPos))
  if (m.highlightsNeg.length) H.push('<h2>Comentarios negativos destacados</h2>' + byPost(m.highlightsNeg))
  if (m.questions.length) H.push('<h2>Preguntas sin responder</h2>' + m.questions.map((c) => quote(c)).join(''))
  H.push('<h2>Conclusiones</h2><ul>' + m.conclusions.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>')
  H.push('<h2>Recomendaciones</h2><ul>' + m.recommendations.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>')
  return H.join('\n')
}

export const reportPlainText = (html: string) => {
  const d = document.createElement('div'); d.innerHTML = html.replace(/<\/(h1|h2|p|li|tr|blockquote)>/g, '</$1>\n')
  return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}
