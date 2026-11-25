import { toast } from '@/components/ui'
import { gather } from '../report'
import { loadComments } from '../explore'
import type { Comment } from '../types'

/** Abre en «Explorar» los comentarios de uno o varios seguimientos. */
export async function openTrackingComments(tids: string[]) {
  const g = await gather(tids)
  if (!g.comments.length) { toast('Ese seguimiento no tiene comentarios'); return false }
  loadComments({
    title: g.tracks.length === 1 ? g.tracks[0].name : `${g.tracks.length} seguimientos`, source: 'Seguimientos', platform: g.platform, multi: true, extractedAt: new Date().toISOString(),
  }, g.comments as unknown as Comment[])
  return true
}
