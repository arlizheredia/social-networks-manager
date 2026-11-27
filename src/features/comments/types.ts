export type Platform = 'facebook' | 'instagram' | 'tiktok'
export type Sentiment = 'positivo' | 'neutral' | 'negativo'
export interface Attachment { type: string; url: string; title?: string; alt?: string }

export interface Comment {
  idx: number
  id: string
  /** Cuándo se extrajo por primera vez (ISO). Base de los informes por fecha de extracción. */
  extractedAt?: string
  parentId: string
  type: 'comment' | 'reply'
  depth: number
  replyTo?: string
  repliesCount: number
  authorName: string
  authorId?: string
  authorUrl?: string
  authorAvatar?: string
  badges: string[]
  text: string
  length: number
  words: number
  hashtags: string[]
  mentions: string[]
  emojis: string[]
  urls: string[]
  isQuestion: boolean
  attachments: Attachment[]
  edited?: boolean
  hidden?: boolean
  createdAt: string | null
  createdTs: number
  dateText: string
  dateApprox: boolean
  reactions: number
  likes?: number | null
  sentiment: Sentiment
  sentimentScore: number
  sentimentFrom?: string
  sentimentOwn?: number
  brandStance?: boolean
  /** habla de la marca sin nombrarla (p. ej. «los envíos los cobran bien caro» en una publicación de la marca) */
  aboutBrand?: boolean
  sentimentManual?: boolean
  sentimentAuto?: Sentiment
  platform: Platform
  permalink?: string
  source: string
  isTeam?: boolean
  teamAnswered?: boolean
  root?: string
  needsTeam?: boolean
  /** Contexto en vistas de varias publicaciones (seguimientos). */
  _ref?: { tid: string; postId: string }
  _post?: string
  _postUrl?: string
  _date?: string
}

export type RawComment = Partial<Comment> & Record<string, unknown>

export interface Meta {
  url?: string
  title?: string
  postAuthor?: string
  postDate?: string
  extractedAt?: string
  source?: string
  platform?: Platform
  postId?: string
  totalReported?: number
  netTotal?: number
  order?: { pedido: string; aplicado: string | null; limite: number; alcanzado: boolean } | null
  diag?: unknown
  multi?: boolean
  partial?: boolean
}

export interface Parsed { meta: Meta; comments: RawComment[] }
