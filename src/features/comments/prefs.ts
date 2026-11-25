/** Preferencias del módulo de comentarios (migradas automáticamente de Social Comments Analyzer, claves «fbca:»). */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Sentiment } from './types'

export interface TeamMember { name: string; id?: string }
export interface Reply { id: string; title: string; text: string; tags: string[] }
export interface ExtractOpts { win: 'small' | 'minimized' | 'normal'; careful: boolean; keep: boolean; maxMin: number; gap: number; retries: number; retryBase: number }

export const REP_DEFAULTS = { focus: 'Kanasta24 y comentarios relacionados', terms: 'Kanasta24', author: 'Lic. Yaimara Salinas Goite', client: 'Kanasta24' }
export const DEFAULT_REPLIES: Reply[] = [
  { id: 'r1', title: 'Agradecimiento', text: '¡Muchas gracias por tu comentario, {nombre_pila}! 😊', tags: ['positivo'] },
  { id: 'r2', title: 'Pedir datos por privado', text: 'Hola {nombre_pila}, lamentamos lo ocurrido. Escríbenos por mensaje privado con tu número de pedido y lo revisamos enseguida.', tags: ['negativo'] },
  { id: 'r3', title: 'Responder una pregunta', text: 'Hola {nombre_pila}, gracias por preguntar. Te escribimos por mensaje privado con toda la información.', tags: ['pregunta'] },
  { id: 'r4', title: 'Seguimos mejorando', text: 'Gracias por contarnos tu experiencia, {nombre_pila}. Tomamos nota para seguir mejorando.', tags: ['neutral', 'negativo'] },
]

export interface CommentsPrefs {
  report: typeof REP_DEFAULTS
  team: TeamMember[]
  teamPostAuthor: boolean
  teamAllReplies: boolean
  replies: Reply[]
  replyUse: Record<string, number>
  answered: Record<string, { at: number; via: string }>
  sentOverrides: Record<string, Sentiment>
  extract: ExtractOpts
  fbOrder: 'all' | 'pert' | 'rec'
  fbLimit: number
  repSel: string[]
  waTone: 'cercano' | 'formal' | 'breve'
  waSign: string
  semLevel: number
}

const DEF: CommentsPrefs = {
  report: REP_DEFAULTS, team: [], teamPostAuthor: true, teamAllReplies: false, replies: DEFAULT_REPLIES, replyUse: {}, answered: {},
  sentOverrides: {}, extract: { win: 'small', careful: true, keep: false, maxMin: 60, gap: 6, retries: 10, retryBase: 15 },
  fbOrder: 'all', fbLimit: 1500, repSel: [], waTone: 'cercano', waSign: '', semLevel: 0.825,
}

function legacy(): Partial<CommentsPrefs> {
  const g = (k: string) => { try { return localStorage.getItem('fbca:' + k) } catch { return null } }
  const j = <T,>(k: string, d: T): T => { try { const v = g(k); return v == null ? d : (JSON.parse(v) as T) } catch { return d } }
  if (g('onboarding') == null && g('team') == null && g('defFocus') == null && g('sentOverrides') == null) return {}
  const num = (k: string, d: number) => { const v = Number(g(k)); return g(k) == null || isNaN(v) ? d : v }
  return {
    report: { focus: g('defFocus') ?? REP_DEFAULTS.focus, terms: g('defTerms') ?? REP_DEFAULTS.terms, author: g('defAuthor') ?? REP_DEFAULTS.author, client: g('defClient') ?? REP_DEFAULTS.client },
    team: j('team', []), teamPostAuthor: g('teamPostAuthor') !== '0', teamAllReplies: g('teamAllReplies') === '1',
    replies: j('replies', DEFAULT_REPLIES), replyUse: j('replyUse', {}), answered: j('answered', {}), sentOverrides: j('sentOverrides', {}),
    extract: {
      win: (['small', 'minimized', 'normal'].includes(g('eoWin') ?? '') ? g('eoWin') : 'small') as ExtractOpts['win'],
      careful: g('eoCareful') !== '0', keep: g('eoKeep') === '1', maxMin: num('eoMax', 60), gap: num('eoGap', 6), retries: num('eoRetries', 10), retryBase: num('eoRetryBase', 15),
    },
    fbOrder: (['all', 'pert', 'rec'].includes(g('fbOrder') ?? '') ? g('fbOrder') : 'all') as CommentsPrefs['fbOrder'],
    fbLimit: g('fbNoLimit') === '1' ? 0 : num('fbLimit', 1500), repSel: j('repSel', []),
    waTone: (['cercano', 'formal', 'breve'].includes(g('waTone') ?? '') ? g('waTone') : 'cercano') as CommentsPrefs['waTone'], waSign: g('waSign') ?? '',
  }
}

export const usePrefs = create<CommentsPrefs>()(
  persist(() => ({ ...DEF }), {
    name: 'snm.comments',
    merge: (p, cur) => ({ ...cur, ...DEF, ...((p as Partial<CommentsPrefs>) ?? legacy()) }),
  }),
)
export const getPrefs = usePrefs.getState
export const setPrefs = usePrefs.setState
