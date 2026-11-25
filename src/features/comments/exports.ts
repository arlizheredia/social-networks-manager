/** Copiar y exportar comentarios (CSV compatible con Excel, JSON, texto y Markdown). */
import { download } from '@/lib/util'
import { platName } from './text'
import type { Comment, Meta } from './types'

const COLS: [string, (c: Comment) => unknown][] = [
  ['#', (c) => c.idx], ['Red', (c) => platName(c.platform)], ['Tipo', (c) => (c.type === 'reply' ? 'Respuesta' : 'Comentario')], ['Autor', (c) => c.authorName],
  ['Texto', (c) => c.text], ['Fecha', (c) => c.createdAt || c.dateText], ['Reacciones', (c) => c.reactions], ['Respuestas', (c) => c.repliesCount],
  ['Sentimiento', (c) => c.sentiment], ['Pregunta', (c) => (c.isQuestion ? 'sí' : '')], ['Publicación', (c) => c._post || ''], ['Enlace', (c) => c.permalink || ''],
]
const cell = (v: unknown, sep: string) => { const s = String(v ?? ''); return s.includes(sep) || /["\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
export const toTable = (list: Comment[], sep = ',') => [COLS.map((c) => c[0]).join(sep), ...list.map((c) => COLS.map(([, f]) => cell(f(c), sep)).join(sep))].join('\r\n')
export const toText = (list: Comment[]) => list.map((c) => `${c.type === 'reply' ? '   ↳ ' : ''}${c.authorName || '(sin nombre)'}${c.createdAt ? ' · ' + new Date(c.createdAt).toLocaleString('es') : ''}\n${c.type === 'reply' ? '     ' : ''}${c.text}`).join('\n\n')
export const toMarkdown = (list: Comment[]) => list.map((c) => `${c.type === 'reply' ? '  ' : ''}- **${c.authorName || '(sin nombre)'}**: ${c.text.replace(/\n+/g, ' ')}`).join('\n')

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
export function exportComments(kind: 'csv' | 'json' | 'txt', list: Comment[], meta: Meta | null) {
  if (kind === 'csv') download(`comentarios-${stamp()}.csv`, '﻿' + toTable(list, ';'), 'text/csv')
  else if (kind === 'json') download(`comentarios-${stamp()}.json`, JSON.stringify({ app: 'social-networks-manager', version: 1, meta, exportedAt: new Date().toISOString(), count: list.length, comments: list }, null, 2), 'application/json')
  else download(`comentarios-${stamp()}.txt`, toText(list), 'text/plain')
}
