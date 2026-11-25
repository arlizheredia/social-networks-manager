import { esc } from '@/lib/util'
import { platName } from './text'
import type { ReportModel } from './report'
import type { Comment } from './types'

const n = (x: number) => (x ?? 0).toLocaleString('es')
const quote = (c: Comment) => `<blockquote>«${esc(c.text.length > 280 ? c.text.slice(0, 277) + '…' : c.text)}» — <b>${esc(c.authorName || 'Anónimo')}</b>${c.reactions ? ` <span class="muted">· ${n(c.reactions)} reacciones</span>` : ''}</blockquote>`

/** HTML del informe (se usa igual en pantalla, Word, PDF y página web). */
export function reportHtml(m: ReportModel) {
  const c = m.cur, T = Math.max(1, c.s.total)
  const H: string[] = []
  H.push(`<h1>Informe de comentarios${m.focus ? ` sobre ${esc(m.focus.name)}` : ''}</h1>`)
  H.push(`<p class="muted">${esc(m.period)}${m.client ? ` · ${esc(m.client)}` : ''}${m.author ? ` · Elaborado por ${esc(m.author)}` : ''} · Generado el ${new Date(m.generatedAt).toLocaleString('es')}</p>`)
  H.push('<h2>Resumen</h2>', ...m.summary.map((s) => `<p>${esc(s)}</p>`))
  H.push(`<div class="bar"><i style="width:${(c.s.pos / T) * 100}%;background:#146c2e"></i><i style="width:${(c.s.neu / T) * 100}%;background:#c4c7c5"></i><i style="width:${(c.s.neg / T) * 100}%;background:#b3261e"></i></div>`)
  H.push('<h2>Indicadores</h2><table><thead><tr><th>Indicador</th><th>Actual</th>' + (m.prev ? `<th>Anterior</th><th>Cambio</th>` : '') + '</tr></thead><tbody>' +
    m.cmp.map((r) => `<tr><td>${esc(r.k)}</td><td><b>${r.a == null ? '—' : n(r.a)}</b></td>${m.prev ? `<td>${r.b == null ? '—' : n(r.b)}</td><td class="${r.tone === 'up' ? 'pos' : r.tone === 'down' ? 'neg' : ''}">${esc(r.D)}</td>` : ''}</tr>`).join('') + '</tbody></table>')
  if (m.prev) H.push(`<p class="muted">Comparado con ${esc(m.prevName)}.</p>`)
  if (m.evolution.length > 1) H.push('<h2>Evolución por seguimiento</h2><table><thead><tr><th>Seguimiento</th><th>Fecha</th><th>Comentarios</th><th>Positivos</th><th>Negativos</th></tr></thead><tbody>' + m.evolution.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.date)}</td><td>${n(e.total)}</td><td class="pos">${n(e.pos)}</td><td class="neg">${n(e.neg)}</td></tr>`).join('') + '</tbody></table>')
  if (m.posts.length > 1 || (m.posts[0] && m.posts[0].url)) H.push('<h2>Por publicación</h2><table><thead><tr><th>Publicación</th><th>Red</th><th>Comentarios</th><th>Positivos</th><th>Negativos</th></tr></thead><tbody>' + m.posts.map((p) => `<tr><td>${p.url ? `<a href="${esc(p.url)}">${esc(p.label)}</a>` : esc(p.label)}</td><td>${esc(platName(p.platform))}</td><td>${n(p.total)}</td><td class="pos">${n(p.pos)}</td><td class="neg">${n(p.neg)} (${p.negPct} %)</td></tr>`).join('') + '</tbody></table>')
  if (m.topAuthors.length) H.push('<h2>Quién más comenta</h2><ol>' + m.topAuthors.map((a) => `<li>${esc(a.name)} — ${n(a.count)}</li>`).join('') + '</ol>')
  if (m.opinions.length) H.push('<h2>Qué se dice</h2><ul>' + m.opinions.map((o) => `<li class="${o.s === 'positivo' ? 'pos' : o.s === 'negativo' ? 'neg' : ''}">«${esc(o.t)}»${o.n > 1 ? ` <span class="muted">(${o.n} personas)</span>` : ''}</li>`).join('') + '</ul>')
  if (m.fans.length) H.push('<h2>Quiénes hablan bien</h2><p>' + m.fans.map(([a, k]) => `${esc(a)} (${k})`).join(', ') + '</p>')
  if (m.critics.length) H.push('<h2>Quiénes más critican</h2><p>' + m.critics.map(([a, k]) => `${esc(a)} (${k})`).join(', ') + '</p>')
  if (m.rivals.length) H.push('<h2>Posibles referencias a la competencia</h2><ul>' + m.rivals.map((r) => `<li><b>${esc(r.name)}</b> — ${n(r.n)} comentario(s)${r.neg ? `, ${r.neg} negativo(s)` : ''}</li>`).join('') + '</ul><p class="muted">Orientativo: detectado por nombres propios y comparaciones al hablar de compras.</p>')
  if (m.highlightsPos.length) H.push('<h2>Comentarios positivos destacados</h2>' + m.highlightsPos.map(quote).join(''))
  if (m.highlightsNeg.length) H.push('<h2>Comentarios negativos destacados</h2>' + m.highlightsNeg.map(quote).join(''))
  if (m.questions.length) H.push('<h2>Preguntas sin responder</h2>' + m.questions.map(quote).join(''))
  H.push('<h2>Conclusiones</h2><ul>' + m.conclusions.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>')
  H.push('<h2>Recomendaciones</h2><ul>' + m.recommendations.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>')
  return H.join('\n')
}

export const reportPlainText = (html: string) => {
  const d = document.createElement('div'); d.innerHTML = html.replace(/<\/(h1|h2|p|li|tr|blockquote)>/g, '</$1>\n')
  return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}
