import { Link } from 'react-router-dom'
import { Button, Chip, Empty, Icon, confirmBox, toast } from '@/components/ui'
import { fmtRelative } from '@/lib/util'
import { usePublisher, SAFE } from '../store'
import { activeGroups, allTags, availAt, computeSel, hhmm, isRecent, saveSel, unlockGroup } from '../logic'

export function Destinations() {
  const state = usePublisher()
  const act = activeGroups(state)
  const sel = computeSel(state)
  if (!state.groups.length) return (
    <Empty icon={<Icon name="group" />} title="Aún no has añadido grupos">
      <p>Añádelos uno a uno o captúralos todos desde Facebook con el marcador.</p>
      <Link to="/grupos"><Button className="mt-3" icon="add">Añadir grupos</Button></Link>
    </Empty>
  )
  if (!act.length) return (
    <Empty icon={<Icon name="group" />} title="No hay grupos activos">
      <p>Tienes {state.groups.length} grupo(s), pero todos están desactivados.</p>
      <Link to="/grupos"><Button className="mt-3" variant="tonal">Gestionar grupos</Button></Link>
    </Empty>
  )
  const avail = act.filter((g) => !isRecent(g))
  const tags = allTags(act)
  const toggle = (id: string, on: boolean) => { const s = new Set(sel); on ? s.add(id) : s.delete(id); saveSel(s) }
  const allOn = avail.length > 0 && avail.every((g) => sel.has(g.id))

  return (
    <div>
      {!!tags.length && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-2">Seleccionar por etiqueta:</span>
          {tags.map((t) => <Chip key={t} icon="tag" onClick={() => { saveSel(new Set(avail.filter((g) => g.tags.includes(t)).map((g) => g.id))); toast(`Seleccionados los grupos con etiqueta «${t}»`) }}>{t}</Chip>)}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-outline-2">
        <label className="flex cursor-pointer items-center gap-3 border-b border-outline-2 bg-surface-2 px-4 py-2 text-xs text-text-2">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={allOn} disabled={!avail.length} ref={(el) => { if (el) el.indeterminate = sel.size > 0 && !allOn }} onChange={(e) => saveSel(e.target.checked ? new Set(avail.map((g) => g.id)) : new Set())} />
          <span className="flex-1">Todos los disponibles ({avail.length})</span><span>Último uso</span>
        </label>
        <div className="max-h-80 overflow-y-auto">
          {act.map((g) => {
            const recent = isRecent(g)
            return (
              <div key={g.id} className={`flex items-center gap-3 border-b border-outline-2 px-4 py-2 last:border-0 ${recent ? 'opacity-60' : ''}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.has(g.id)} disabled={recent} onChange={(e) => toggle(g.id, e.target.checked)} />
                  <div className="min-w-0">
                    <div className="truncate text-text">{g.name}</div>
                    <div className="truncate text-xs text-text-2">{g.tags.map((t) => `#${t} `)}{g.approval ? 'Requiere aprobación · ' : ''}{g.url.replace('https://www.', '')}</div>
                  </div>
                </label>
                {recent ? (
                  <button className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-warn-container px-2 py-1 text-xs text-warn" title={`Publicaste aquí ${fmtRelative(g.lastShared!)}. Cada grupo se puede usar una vez cada ${SAFE.RECENT_H} h. Pulsa si en realidad no se publicó.`}
                    onClick={async () => { if (await confirmBox(`¿No llegaste a publicar en «${g.name}»?`, 'Se corregirá el registro: el grupo quedará disponible y dejará de contar para el límite diario. Si en realidad sí se publicó, volver a publicar antes de 24 h puede considerarse spam.', 'No se publicó, liberar')) { unlockGroup(g.id); toast(`«${g.name}» liberado`) } }}>
                    <Icon name="lock_clock" className="!text-[16px]" />Desde {hhmm(availAt(g))}
                  </button>
                ) : <span className="shrink-0 text-xs text-text-2">{g.lastShared ? fmtRelative(g.lastShared) : 'Nunca'}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-2">
        <Link to="/grupos" className="inline-flex items-center gap-1"><Icon name="edit" className="!text-[16px]" />Gestionar grupos</Link>
        {act.length > avail.length && <span className="inline-flex items-center gap-1"><Icon name="lock_clock" className="!text-[16px]" />{act.length - avail.length} grupo(s) en espera de 24 h</span>}
      </div>
    </div>
  )
}
