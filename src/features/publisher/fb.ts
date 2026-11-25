/** Utilidades de Facebook para la publicación en grupos (portadas de Facebook Publisher). */

export const FB_HOST = /(^|\.)(facebook\.com|fb\.com|fb\.watch|fb\.me|fb\.gg)$/i
const KEEP_PARAMS = ['story_fbid', 'id', 'fbid', 'v', 'set', 'multi_permalinks']

export type FbUrlInfo =
  | { empty: true; url?: undefined; error?: undefined; kind?: undefined; cleaned?: undefined; host?: undefined }
  | { error: string; empty?: undefined; url?: undefined; kind?: undefined; cleaned?: undefined; host?: undefined }
  | { url: string; kind: string; cleaned: boolean; host: string; empty?: undefined; error?: undefined }

/** Valida una URL de Facebook, elimina parámetros de rastreo y clasifica el contenido. */
export function parseFbUrl(raw: string): FbUrlInfo {
  raw = String(raw || '').trim()
  if (!raw) return { empty: true }
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw) } catch { return { error: 'No parece una URL válida.' } }
  if (!FB_HOST.test(u.hostname)) return { error: 'La URL debe ser de facebook.com, fb.com o fb.watch.' }
  if (/^(m|mbasic|web|touch|es-es|es-la)\./i.test(u.hostname)) u.hostname = 'www.facebook.com'
  const removed: string[] = []
  ;[...u.searchParams.keys()].forEach((k) => { if (!KEEP_PARAMS.includes(k)) { removed.push(k); u.searchParams.delete(k) } })
  u.hash = ''
  const p = u.pathname
  let kind = 'Publicación'
  if (/\/reel\//.test(p)) kind = 'Reel'
  else if (/\/videos?\//.test(p) || /fb\.watch/.test(u.hostname) || /\/watch/.test(p)) kind = 'Vídeo'
  else if (/\/photo|photo\.php/.test(p)) kind = 'Foto'
  else if (/\/groups\/[^/]+\/(posts|permalink)/.test(p)) kind = 'Publicación de grupo'
  else if (/\/share\//.test(p)) kind = 'Enlace compartido'
  else if (/\/events\//.test(p)) kind = 'Evento'
  else if (/^\/?[^/]+\/?$/.test(p) && !u.search) kind = 'Página o perfil'
  return { url: u.toString(), kind, cleaned: removed.length > 0, host: u.hostname.replace(/^www\./, '') }
}

/** Normaliza un grupo (URL, ID numérico o nombre corto) a https://www.facebook.com/groups/<slug>/ */
export function normGroupUrl(raw: unknown): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  if (/^[\w.-]+$/.test(s) && !/\./.test(s.replace(/^[\w-]+$/, ''))) return `https://www.facebook.com/groups/${s}/`
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s)
    if (!FB_HOST.test(u.hostname)) return null
    const m = u.pathname.match(/\/groups\/([^/?#]+)/)
    if (!m || ['feed', 'joins', 'discover', 'create', 'search'].includes(m[1])) return null
    return `https://www.facebook.com/groups/${m[1]}/`
  } catch { return null }
}

export const groupKey = (url: string) => (url || '').toLowerCase().replace(/\/+$/, '')
export const groupSlug = (u: string) => ((u || '').split('/groups/')[1] || '').replace(/\/.*/, '').toLowerCase()

const GROUP_NAME_PREFIX = /^\s*(foto de (perfil|portada) del grupo|imagen (de perfil )?del grupo|profile (picture|photo) of( the group)?|cover photo of( the group)?|group (profile )?(picture|photo)( of)?)\s*[:\-–]?\s*/i
const NOTIF_RX = /\b(ha publicado|publicó|ha compartido|compartió|ha comentado|comentó|reaccionó|posted|shared|commented)\b/i

/** Limpia nombres mal capturados: prefijos de foto, «No leída» y textos de notificaciones. */
export function cleanGroupName(n: unknown): string {
  let t = String(n || '').replace(/\s+/g, ' ').trim().replace(/^(no le[ií]das?|unread)\s*/i, '').replace(GROUP_NAME_PREFIX, '')
  let m = NOTIF_RX.test(t) && t.match(/\b(?:ha publicado|publicó|ha compartido|compartió|ha comentado|comentó|reaccionó|posted|shared|commented)\b.*?\b(?:en|in)\s+(.+?)(?:\s*[:.]\s*["“«].*|$)/i)
  if (m) t = m[1]
  else if ((m = t.match(/^(?:ahora|hace\s+\S+(?:\s+\S+)?|just now|\d+\s*\w+ ago)\s+(?:en|in)\s+(.+?)\s*:\s*["“«]/i))) t = m[1]
  else if ((m = t.match(/^(.+?)\s*:\s*["“«]/))) t = m[1]
  return t.replace(/[.\s]*\b\d+\s*(min|h|d|sem|s|a|w|y)\b\.?$/i, '').replace(/[.:\s]+$/, '').trim()
}
export const badGroupName = (n: string) =>
  /^(no le[ií]da|unread)/i.test(n) || /:\s*["“«]/.test(n) || NOTIF_RX.test(n) || GROUP_NAME_PREFIX.test(n)

/* ---------- Negrita / cursiva Unicode (Facebook no admite formato enriquecido) ---------- */
const STY = { b: { A: 0x1d5d4, a: 0x1d5ee, d: 0x1d7ec as number | null }, i: { A: 0x1d608, a: 0x1d622, d: null as number | null } }
export type StyleKey = keyof typeof STY

function plainOf(cp: number): number | null {
  for (const k of Object.keys(STY) as StyleKey[]) {
    const s = STY[k]
    if (cp >= s.A && cp < s.A + 26) return 65 + cp - s.A
    if (cp >= s.a && cp < s.a + 26) return 97 + cp - s.a
    if (s.d && cp >= s.d && cp < s.d + 10) return 48 + cp - s.d
  }
  return null
}
export function isStyled(str: string, k: StyleKey) {
  const s = STY[k]
  return [...str].some((ch) => { const c = ch.codePointAt(0)!; return (c >= s.A && c < s.A + 26) || (c >= s.a && c < s.a + 26) || (!!s.d && c >= s.d && c < s.d + 10) })
}
export function styleStr(str: string, k: StyleKey) {
  const s = STY[k]
  return [...str].map((ch) => {
    let c = ch.codePointAt(0)!
    const p = plainOf(c)
    if (p != null) c = p
    if (c >= 65 && c <= 90) return String.fromCodePoint(s.A + c - 65)
    if (c >= 97 && c <= 122) return String.fromCodePoint(s.a + c - 97)
    if (s.d && c >= 48 && c <= 57) return String.fromCodePoint(s.d + c - 48)
    return String.fromCodePoint(c)
  }).join('')
}
export const unstyleStr = (str: string) => [...str].map((ch) => { const p = plainOf(ch.codePointAt(0)!); return p != null ? String.fromCodePoint(p) : ch }).join('')
export const toggleStyle = (sel: string, k: StyleKey) => (isStyled(sel, k) ? unstyleStr(sel) : styleStr(sel, k))

/* ---------- Variables ---------- */
export const todayLabel = () => new Date().toLocaleDateString('es', { day: 'numeric', month: 'long' })

/** Sustituye {grupo}, {fecha} y {enlace}; añade el enlace al final si se pide y no está ya. */
export function finalText(text: string, url: string, groupName: string | null, appendUrl: boolean) {
  let t = text.replace(/\{grupo\}/gi, groupName ?? '{grupo}').replace(/\{fecha\}/gi, todayLabel()).replace(/\{enlace\}/gi, url)
  if (url && appendUrl && !t.includes(url)) t = t.trimEnd() + (t.trim() ? '\n\n' : '') + url
  return t
}

/* ---------- Identificadores de contenido (verificación) ---------- */
export const CID_RX = [/\/reel\/(\d+)/, /\/videos\/(?:[^/?#]+\/)?(\d+)/, /[?&]v=(\d+)/, /\/posts\/(pfbid\w+|\d+)/, /\/permalink\/(\d+)/, /[?&]story_fbid=(pfbid\w+|\d+)/, /[?&]fbid=(\d+)/, /\/photos\/[^/?#]+\/(\d+)/, /\/share\/[prv]\/(\w+)/]
export function contentIds(url: string) {
  const out = new Set<string>()
  if (!url) return out
  for (const r of CID_RX) { const m = url.match(r); if (m) { out.add(m[1]); break } }
  return out
}

export const initials = (s: string) =>
  (String(s || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase()

export const EMOJIS = '😀 😂 😍 🥰 😎 🤩 😉 🙌 👏 👍 🙏 💪 🔥 ✨ ⭐ 🌟 🎉 🎁 💯 ✅ ❌ ⚠️ 📢 📣 📌 📍 📅 ⏰ 💰 💸 🛒 🏷️ 🚀 💡 ❤️ 💙 💚 🧡 💜 👉 👇 ☝️ 📞 📱 💻 🏠 🚗 🍕 ☕ 🎶 📷 🎥 🌎 🤝 🆕 🆓 ➡️ 🔗 📝 ℹ️ ❗ ❓ 🎯 🏆'.split(' ')
