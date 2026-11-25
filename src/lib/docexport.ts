/**
 * Exportación de informes compartida por toda la app: Word (.doc HTML compatible con Word y LibreOffice),
 * PDF (impresión del navegador → «Guardar como PDF», con acentos y emojis) y página web (.html).
 */
import { download, esc } from './util'

/** Todos los informes: hoja Carta, Arial (o Liberation Sans) a 12 pt y alineados a la izquierda. */
const FONT = 'Arial, "Liberation Sans", sans-serif'
const page = () => ({ css: 'letter', word: '8.5in 11.0in' })

const CSS = (mono: boolean) => `
  @page { size: ${page().css}; margin: 2cm; }
  @page WordSection1 { size: ${page().word}; margin: 2cm; mso-page-orientation: portrait; }
  div.WordSection1 { page: WordSection1; }
  body { font-family: ${FONT}; font-size: 12pt; line-height: 1.45; color: ${mono ? '#000' : '#1f1f1f'}; max-width: 820px; margin: 0 auto; text-align: left; }
  h1, h2, h3, p, td, th, .h1, .h2, .h3 { text-align: left; margin-left: 0; padding-left: 0; text-indent: 0; }${mono ? '\n  a, .muted, blockquote { color: #000; }' : ''}
  h1 { font-family: ${FONT}; font-size: 16pt; margin-top: 0; margin-right: 0; margin-bottom: 6pt; margin-left: 0; color: ${mono ? '#000' : '#0b57d0'}; }
  h2 { font-family: ${FONT}; font-size: 13pt; margin-top: 18pt; margin-right: 0; margin-bottom: 6pt; margin-left: 0; color: ${mono ? '#000' : '#0b57d0'}; border-bottom: 1px solid ${mono ? '#000' : '#c4c7c5'}; padding-bottom: 3pt; }
  h3 { font-family: ${FONT}; font-size: 12pt; margin-top: 12pt; margin-right: 0; margin-bottom: 4pt; margin-left: 0; }
  p.h1 { font-family: ${FONT}; font-size: 16pt; font-weight: bold; margin-top: 0; margin-right: 0; margin-bottom: 6pt; margin-left: 0; color: ${mono ? '#000' : '#0b57d0'}; }
  p.h2 { font-family: ${FONT}; font-size: 13pt; font-weight: bold; margin-top: 18pt; margin-right: 0; margin-bottom: 6pt; margin-left: 0; color: ${mono ? '#000' : '#0b57d0'}; border-bottom: 1px solid ${mono ? '#000' : '#c4c7c5'}; padding-bottom: 3pt; }
  p.h3 { font-family: ${FONT}; font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-right: 0; margin-bottom: 4pt; margin-left: 0; }
  p, li { margin-top: 0; margin-right: 0; margin-bottom: 6pt; margin-left: 0; font-family: ${FONT}; font-size: 12pt; }
  .kv b { display: inline-block; min-width: 140px; }
  table { border-collapse: collapse; width: 100%; margin-top: 6pt; margin-right: 0; margin-bottom: 12pt; margin-left: 0; }
  th, td { border: 1px solid #c4c7c5; padding-top: 4pt; padding-bottom: 4pt; padding-left: 6pt; padding-right: 6pt; text-align: left; vertical-align: top; font-family: ${FONT}; font-size: 12pt; }
  th { background: ${mono ? '#fff' : '#f0f4f9'}; }
  .muted { color: #5f6368; font-size: 9.5pt; }
  p.meta { margin-top: 0; margin-right: 0; margin-bottom: 2pt; margin-left: 0; }
  .pos { color: ${mono ? '#000' : '#146c2e'}; } .neg { color: ${mono ? '#000' : '#b3261e'}; }
  blockquote { margin-top: 4pt; margin-right: 0; margin-bottom: 8pt; margin-left: 0; padding-top: 4pt; padding-bottom: 4pt; padding-left: 10pt; padding-right: 10pt; border-left: 3px solid #c4c7c5; }
`

export function htmlDocument(title: string, body: string, mono = false) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS(mono)}</style></head><body>${body}</body></html>`
}

/**
 * Word y LibreOffice aplican a <h1>…<h3> sus estilos de «Encabezado», que en muchas plantillas llevan sangría
 * y numeración automática. En el .doc los títulos van como párrafos con el mismo aspecto: quedan alineados a la izquierda.
 */
export const flatHeadings = (html: string) => html.replace(/<h([123])(\s[^>]*)?>/g, '<p class="h$1">').replace(/<\/h[123]>/g, '</p>')

export function downloadWord(file: string, title: string, body: string, mono = false) {
  body = flatHeadings(body)
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>${CSS(mono)}</style></head><body><div class="WordSection1">${body}</div></body></html>`
  download(file.replace(/\.docx?$/, '') + '.doc', '﻿' + html, 'application/msword')
}

export function downloadHtml(file: string, title: string, body: string, mono = false) {
  download(file.replace(/\.html?$/, '') + '.html', htmlDocument(title, body, mono), 'text/html')
}

/** Abre el diálogo de impresión con el informe: el usuario elige «Guardar como PDF». */
export function printPdf(title: string, body: string, mono = false) {
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentDocument!
  d.open(); d.write(htmlDocument(title, body, mono)); d.close()
  setTimeout(() => {
    try { f.contentWindow!.focus(); f.contentWindow!.print() } finally { setTimeout(() => f.remove(), 60000) }
  }, 250)
}

/** Texto de informe (editable por el usuario) → HTML: 1.ª línea título, secciones conocidas, listas y «Clave: valor». */
export function reportTextToHtml(t: string) {
  const H2 = /^(Resumen|Detalle por publicación|Observaciones|Próximos pasos|Conclusiones|Notas|Recomendaciones|Listado)\s*:?$/i
  const KV = /^(Fecha|Elaborado por|Cliente \/ marca|Enlace|Texto|Grupos en los que se compartió|Grupos|Total|Etiquetas|Notas|Último uso|Estado)\s*:/
  let html = '', first = true, inList = false
  const close = () => { if (inList) { html += '</ul>'; inList = false } }
  String(t).replace(/\r/g, '').split('\n').forEach((raw) => {
    const x = raw.trim()
    if (!x) { close(); return }
    if (first) { html += `<h1>${esc(x)}</h1>`; first = false; return }
    if (H2.test(x)) { close(); html += `<h2>${esc(x.replace(/:$/, ''))}</h2>` }
    else if (/^\d+\.\s+/.test(x)) { close(); html += `<h3>${esc(x)}</h3>` }
    else if (/^[-•·]\s+/.test(x)) { if (!inList) { html += '<ul>'; inList = true } html += `<li>${esc(x.replace(/^[-•·]\s+/, ''))}</li>` }
    else if (KV.test(x)) { close(); const i = x.indexOf(':'); html += `<p class="kv"><b>${esc(x.slice(0, i))}:</b> ${esc(x.slice(i + 1).trim())}</p>` }
    else { close(); html += `<p>${esc(x)}</p>` }
  })
  close()
  return html
}
