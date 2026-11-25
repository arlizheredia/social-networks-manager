/**
 * Exportación de informes compartida por toda la app: Word (.doc HTML compatible con Word y LibreOffice),
 * PDF (impresión del navegador → «Guardar como PDF», con acentos y emojis) y página web (.html).
 */
import { download, esc } from './util'

const CSS = (mono: boolean) => `
  @page { size: A4; margin: 2cm; }
  body { font-family: ${mono ? 'Arial, "Liberation Sans", sans-serif' : 'Calibri, Arial, "Liberation Sans", sans-serif'}; font-size: ${mono ? '12pt' : '11pt'}; line-height: 1.45; color: #1f1f1f; max-width: 820px; margin: 0 auto; }
  h1 { font-size: ${mono ? '16pt' : '20pt'}; margin: 0 0 6pt; color: ${mono ? '#000' : '#0b57d0'}; }
  h2 { font-size: ${mono ? '13pt' : '14pt'}; margin: 18pt 0 6pt; color: ${mono ? '#000' : '#0b57d0'}; border-bottom: 1px solid #c4c7c5; padding-bottom: 3pt; }
  h3 { font-size: 12pt; margin: 12pt 0 4pt; }
  p, li { margin: 0 0 6pt; }
  .kv b { display: inline-block; min-width: 140px; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; }
  th, td { border: 1px solid #c4c7c5; padding: 4pt 6pt; text-align: left; vertical-align: top; font-size: 10pt; }
  th { background: ${mono ? '#fff' : '#f0f4f9'}; }
  .muted { color: #5f6368; font-size: 9.5pt; }
  .pos { color: ${mono ? '#000' : '#146c2e'}; } .neg { color: ${mono ? '#000' : '#b3261e'}; }
  blockquote { margin: 4pt 0 8pt; padding: 4pt 10pt; border-left: 3px solid #c4c7c5; }
  .bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; margin: 4pt 0 10pt; }
  .bar i { display: block; }
`

export function htmlDocument(title: string, body: string, mono = false) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS(mono)}</style></head><body>${body}</body></html>`
}

export function downloadWord(file: string, title: string, body: string, mono = false) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>${CSS(mono)}</style></head><body>${body}</body></html>`
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
