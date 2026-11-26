import { useEffect, useMemo, useRef, useState } from 'react'
import { Banner, Button, Card, Chip, Dialog, Empty, Field, Icon, IconButton, Input, MenuItem, PageHead, Popover, Switch, Textarea, Toggle, confirmBox, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { copyText, download, fmtRelative } from '@/lib/util'
import { downloadWord, printPdf, reportTextToHtml } from '@/lib/docexport'
import { initials, normGroupUrl } from '@/features/publisher/fb'
import { setPub, usePublisher } from '@/features/publisher/store'
import { allTags, computeSel, saveSel } from '@/features/publisher/logic'
import { analyzeImport, applyImport, deleteGroups, groupsByTag, NO_TAG, normTag, setGroupTag, upsertGroup } from '@/features/publisher/groups'
import { buildGroupsReport, type GroupScope } from '@/features/publisher/report'
import { GROUPS_BOOKMARKLET } from '@/features/publisher/bookmarklet'
import type { Group } from '@/features/publisher/types'

function GroupDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group: Group | null }) {
  const tags = allTags(usePublisher((s) => s.groups))
  const [f, setF] = useState({ url: '', name: '', tags: '', notes: '', active: true, approval: false })
  useEffect(() => { if (open) setF(group ? { url: group.url, name: group.name, tags: group.tags[0] || '', notes: group.notes, active: group.active, approval: group.approval } : { url: '', name: '', tags: '', notes: '', active: true, approval: false }) }, [open, group])
  const norm = normGroupUrl(f.url)
  const save = () => {
    if (!norm) { toast('Debe ser un enlace a un grupo: facebook.com/groups/…'); return }
    if (!f.name.trim()) { toast('Escribe el nombre del grupo'); return }
    const dup = upsertGroup({ url: norm, name: f.name.trim().slice(0, 140), tags: f.tags.trim() ? [normTag(f.tags, tags)] : [], notes: f.notes.trim().slice(0, 500), active: f.active, approval: f.approval }, group?.id)
    if (dup) { toast(`Ya existe un grupo con esa URL: «${dup}»`); return }
    toast(group ? 'Grupo actualizado' : 'Grupo añadido'); onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title={group ? 'Editar grupo' : 'Añadir grupo'} actions={<><Button variant="text" onClick={onClose}>Cancelar</Button><Button onClick={save}>Guardar</Button></>}>
      <Field label="URL o ID del grupo *" hint={!f.url ? 'También vale el ID numérico o el nombre corto del grupo.' : norm ? `✓ ${norm}` : <span className="text-error">Debe ser un enlace a un grupo: facebook.com/groups/…</span>}>
        <Input autoFocus icon="link" placeholder="https://www.facebook.com/groups/…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
      </Field>
      <Field label="Nombre *"><Input maxLength={140} placeholder="Ej.: Compraventa Madrid Centro" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Etiqueta" hint="Una por grupo, p. ej. la provincia. Elige una existente o escribe una nueva.">
        <Input list="tagList" icon="sell" maxLength={40} placeholder="Ej.: Holguín" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        <datalist id="tagList">{tags.map((t) => <option key={t} value={t} />)}</datalist>
      </Field>
      <Field label="Notas / normas del grupo" hint="Se mostrarán como recordatorio al publicar en este grupo."><Textarea className="!min-h-20" placeholder="Ej.: solo se permiten enlaces los lunes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <Switch label="Requiere aprobación" sub="Los administradores revisan las publicaciones antes de mostrarlas." checked={f.approval} onChange={(v) => setF({ ...f, approval: v })} />
      <Switch label="Activo para compartir" sub="Los grupos inactivos se conservan pero no aparecen como destino." checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
    </Dialog>
  )
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) setText('') }, [open])
  const a = useMemo(() => analyzeImport(text), [text])
  const can = !a.isCheck && (a.nw.length > 0 || a.fixes.length > 0)
  return (
    <Dialog open={open} onClose={onClose} title="Importar grupos"
      actions={<><Button variant="text" onClick={onClose}>Cancelar</Button><Button disabled={!can} onClick={() => { const r = applyImport(text); toast(`${r.added} grupo(s) importados${r.fixed ? ` · ${r.fixed} nombre(s) corregidos` : ''}`); onClose() }}>{can ? `Importar${a.nw.length ? ' ' + a.nw.length : ''}${a.fixes.length ? ` y corregir ${a.fixes.length}` : ''}` : 'Importar'}</Button></>}>
      <p className="mb-3 text-text-2">Pega el resultado del marcador, un archivo JSON exportado o una lista con un grupo por línea (<code>Nombre | URL</code> o solo la URL).</p>
      <div className="mb-3 flex gap-2">
        <Button variant="tonal" size="sm" icon="content_paste" onClick={async () => { try { setText(await navigator.clipboard.readText()) } catch { toast('Pulsa Ctrl+V dentro del cuadro de texto') } }}>Pegar del portapapeles</Button>
        <Button variant="outlined" size="sm" icon="upload_file" onClick={() => fileRef.current?.click()}>Abrir archivo</Button>
        <input ref={fileRef} type="file" accept=".json,.txt,.csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = '' }} />
      </div>
      <Textarea className="font-mono text-xs" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'FBP_GROUPS:[…]\nMi grupo | https://www.facebook.com/groups/123/\nhttps://www.facebook.com/groups/otro/'} />
      <div className={cn('mt-2 text-xs', a.isCheck || (text.trim() && !a.list.length) ? 'text-error' : 'text-success')}>
        {a.isCheck ? 'Esto es una verificación, no una lista de grupos. Pégala en Historial → Verificar.'
          : !text.trim() ? ' ' : !a.list.length ? 'No se ha detectado ningún grupo válido.'
            : `${a.list.length} grupo(s) detectados · ${a.nw.length} nuevos${a.fixes.length ? ` · se corregirá el nombre de ${a.fixes.length}` : ''}${a.skipped ? ` · ${a.skipped} ya existen (se omitirán)` : ''}`}
      </div>
    </Dialog>
  )
}

/** Etiqueta de los grupos seleccionados: una por grupo; elegir otra la reemplaza. */
function TagDialog({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const groups = usePublisher((s) => s.groups)
  const [t, setT] = useState('')
  useEffect(() => { if (ids) setT('') }, [ids])
  if (!ids) return null
  const sel = groups.filter((g) => ids.includes(g.id)), all = allTags(groups)
  const cur = [...new Set(sel.map((g) => g.tags[0] || ''))]
  const now = cur.length === 1 ? cur[0] : null // etiqueta común a toda la selección
  const apply = (tag: string | null) => {
    const n = tag ? normTag(tag, all) : null
    if (tag && !n) return
    const ch = setGroupTag(ids, n)
    toast(!ch ? 'Sin cambios' : n ? `${ch} grupo${ch === 1 ? '' : 's'} en «${n}»` : `Etiqueta quitada de ${ch} grupo${ch === 1 ? '' : 's'}`)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={`Etiquetar ${ids.length} grupo${ids.length === 1 ? '' : 's'}`} icon={<Icon name="sell" className="text-primary" />}
      actions={<>{cur.some(Boolean) && <Button variant="text" icon="label_off" className="mr-auto" onClick={() => apply(null)}>Quitar etiqueta</Button>}<Button variant="text" onClick={onClose}>Cancelar</Button></>}>
      <p className="mb-3 text-text-2">Cada grupo tiene <b className="font-medium text-text">una sola etiqueta</b>, por ejemplo su provincia: la lista y el reporte se agrupan por ella. Elegir otra reemplaza la anterior.</p>
      <p className="mb-3 text-sm">{now ? <>Etiqueta actual: <b className="font-medium">{now}</b></> : now === '' ? 'Los grupos seleccionados no tienen etiqueta.' : `Ahora tienen ${cur.filter(Boolean).length} etiquetas distintas${cur.includes('') ? ' (y algunos ninguna)' : ''}.`}</p>
      <div className="mb-4 flex gap-2">
        <div className="flex-1"><Input autoFocus list="tagList2" icon="sell" placeholder="Nueva etiqueta, p. ej. Holguín" maxLength={40} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && t.trim()) apply(t) }} /></div>
        <datalist id="tagList2">{all.map((x) => <option key={x} value={x} />)}</datalist>
        <Button icon="check" disabled={!t.trim()} onClick={() => apply(t)}>Asignar</Button>
      </div>
      {all.length > 0 && <>
        <div className="mb-1.5 text-[13px] font-medium text-text-2">O elige una existente</div>
        <div className="flex flex-wrap gap-2">{all.map((x) => <Chip key={x} icon="sell" selected={now === x} onClick={() => apply(x)}>{x}</Chip>)}</div>
      </>}
    </Dialog>
  )
}

/** Filtro de etiquetas de selección múltiple. */
function TagFilter({ tags, value, onChange }: { tags: string[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  const opts = [...tags, NO_TAG]
  const label = !value.size ? 'Etiquetas' : value.size === 1 ? [...value][0] : `${value.size} etiquetas`
  return (
    <Popover trigger={(o) => <Chip icon="sell" selected={value.size > 0} onClick={o}>{label} ▾</Chip>}>
      {() => <div className="min-w-56">
        <div className="mb-1 flex items-center justify-between px-3 pt-1 text-xs text-text-2"><span>Mostrar grupos con</span>{value.size > 0 && <button className="font-medium text-primary" onClick={() => onChange(new Set())}>Todas</button>}</div>
        {opts.map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-text/8">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={value.has(t)} onChange={(e) => { const n = new Set(value); e.target.checked ? n.add(t) : n.delete(t); onChange(n) }} />
            <span className={cn('flex-1', t === NO_TAG && 'italic text-text-2')}>{t}</span>
          </label>
        ))}
      </div>}
    </Popover>
  )
}

function ReportDialog({ open, onClose, checked }: { open: boolean; onClose: () => void; checked: Set<string> }) {
  const groups = usePublisher((s) => s.groups)
  const [scope, setScope] = useState<GroupScope>('active')
  const [inc, setInc] = useState({ link: true, tags: true, notes: false, last: false })
  const [tagF, setTagF] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  useEffect(() => { if (open) setScope(checked.size ? 'sel' : 'active') }, [open, checked.size])
  useEffect(() => {
    const list = scope === 'active' ? groups.filter((g) => g.active) : scope === 'sel' ? groups.filter((g) => checked.has(g.id)) : groups
    const l2 = tagF.size ? list.filter((g) => tagF.has(g.tags[0] || NO_TAG)) : list
    setText(buildGroupsReport(l2, scope, inc, { byTag: groups.some((g) => g.tags.length), tag: tagF.size ? [...tagF].join(', ') : null }))
  }, [scope, inc, groups, checked, tagF])
  const file = `grupos-${{ active: 'activos', all: 'todos', sel: 'seleccionados' }[scope]}${tagF.size === 1 ? '-' + [...tagF][0].replace(/\s+/g, '-') : ''}-${new Date().toISOString().slice(0, 10)}`
  const rtags = allTags(groups)
  const title = text.split('\n')[0]
  return (
    <Dialog open={open} onClose={onClose} title="Reporte de grupos" wide
      actions={<><Button variant="text" onClick={onClose}>Cerrar</Button><Button variant="outlined" icon="content_copy" onClick={async () => toast((await copyText(text)) ? 'Reporte copiado' : 'No se pudo copiar')}>Copiar</Button><Button variant="outlined" icon="description" onClick={() => downloadWord(file, title, reportTextToHtml(text), true)}>Word</Button><Button icon="picture_as_pdf" onClick={() => printPdf(title, reportTextToHtml(text), true)}>PDF</Button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-xs text-text-2">Grupos:</span>
        <Chip selected={scope === 'active'} onClick={() => setScope('active')}>Activos</Chip><Chip selected={scope === 'all'} onClick={() => setScope('all')}>Todos</Chip>
        {checked.size > 0 && <Chip selected={scope === 'sel'} onClick={() => setScope('sel')}>Seleccionados ({checked.size})</Chip>}
      </div>
      {rtags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-xs text-text-2">Etiquetas:</span>
          <TagFilter tags={rtags} value={tagF} onChange={setTagF} />
          <span className="text-xs text-text-2">El reporte se agrupa por etiqueta.</span>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-xs text-text-2">Incluir:</span>
        {(['link', 'tags', 'notes', 'last'] as const).map((k) => <Chip key={k} selected={inc[k]} onClick={() => setInc({ ...inc, [k]: !inc[k] })}>{{ link: 'Enlace', tags: 'Etiqueta', notes: 'Notas', last: 'Último uso' }[k]}</Chip>)}
      </div>
      <Field label="Texto del reporte · Word y PDF en hoja Carta, Arial 12, blanco y negro"><Textarea rows={9} className="min-h-40 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} /></Field>
    </Dialog>
  )
}

export default function GroupsPage() {
  const groups = usePublisher((s) => s.groups)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all')
  const [tagSel, setTagSel] = useState<Set<string>>(new Set())
  const [tagIds, setTagIds] = useState<string[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState<{ open: boolean; g: Group | null }>({ open: false, g: null })
  const [imp, setImp] = useState(false)
  const [rep, setRep] = useState(false)
  const tags = allTags(groups)
  const ql = q.trim().toLowerCase()
  const list = groups.filter((g) => (filter === 'all' || (filter === 'on' ? g.active : !g.active)) && (!tagSel.size || tagSel.has(g.tags[0] || NO_TAG)) && (!ql || g.name.toLowerCase().includes(ql) || g.url.toLowerCase().includes(ql) || g.tags.some((t) => t.toLowerCase().includes(ql))))
  const ids = [...checked].filter((id) => groups.some((g) => g.id === id))
  const setActive = (idsOn: string[], on: boolean) => {
    setPub((s) => ({ groups: s.groups.map((g) => (idsOn.includes(g.id) ? { ...g, active: on } : g)) }))
    if (on) { const sel = computeSel(usePublisherState()); idsOn.forEach((i) => sel.add(i)); saveSel(sel) }
  }
  const del = (dids: string[]) => {
    const removed = groups.filter((g) => dids.includes(g.id))
    const undo = deleteGroups(dids)
    setChecked(new Set())
    toast(removed.length === 1 ? `«${removed[0].name}» eliminado` : `${removed.length} grupos eliminados`)
    setUndo(() => undo)
  }
  const [undo, setUndo] = useState<(() => void) | null>(null)

  const renderRow = (g: Group) => (
            <div key={g.id} className={cn('flex items-center gap-3 border-b border-outline-2 px-4 py-2.5 last:border-0', !g.active && 'opacity-60')}>
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked.has(g.id)} onChange={(e) => { const s = new Set(checked); e.target.checked ? s.add(g.id) : s.delete(g.id); setChecked(s) }} aria-label={`Seleccionar ${g.name}`} />
              <span className="hidden size-9 shrink-0 place-items-center rounded-full bg-primary-container text-xs font-medium text-on-primary-container sm:grid">{initials(g.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-text">{g.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-2">
                  <a href={g.url} target="_blank" rel="noopener" className="truncate">{g.url.replace('https://www.', '')}</a>
                  {g.approval && <span className="text-primary">· Requiere aprobación</span>}
                  {g.notes && <span title={g.notes}>· 📝 {g.notes.slice(0, 40)}</span>}
                </div>
              </div>
              <span className="hidden w-28 text-xs text-text-2 sm:block">{g.lastShared ? fmtRelative(g.lastShared) : 'Nunca'}</span>
              <span className="flex w-14 justify-center"><Toggle checked={g.active} label={`${g.name}: ${g.active ? 'activo' : 'inactivo'}`} onChange={(v) => { setActive([g.id], v); toast(`«${g.name}» ${v ? 'activado' : 'desactivado'}`) }} /></span>
              <span className="flex w-18"><IconButton size="sm" icon="edit" label="Editar" onClick={() => setEdit({ open: true, g })} /><IconButton size="sm" icon="delete" label="Eliminar" onClick={() => del([g.id])} /></span>
            </div>
  )
  /** JSON para otra copia de la app; lista «Nombre | URL» para leer o pegar en Importar. */
  const exportGroups = (kind: 'json' | 'txt') => {
    const day = new Date().toISOString().slice(0, 10)
    if (kind === 'json') download(`grupos-${day}.json`, JSON.stringify({ app: 'Social Networks Manager', type: 'groups', groups: groups.map(({ name, url, tags, notes, active }) => ({ name, url, tags, notes, active })) }, null, 2), 'application/json')
    else download(`grupos-${day}.txt`, groups.map((g) => `${g.name.replace(/\|/g, '/')} | ${g.url}`).join('\r\n'), 'text/plain')
    toast(`${groups.length} grupo${groups.length === 1 ? '' : 's'} exportado${groups.length === 1 ? '' : 's'}`)
  }
  return (
    <div>
      <PageHead title="Grupos" sub="Gestiona los grupos de Facebook donde compartes. Solo los grupos activos aparecen como destino."
        actions={<>
          <Button variant="outlined" icon="summarize" onClick={() => setRep(true)} disabled={!groups.length}>Reporte</Button>
          <Button icon="add" onClick={() => setEdit({ open: true, g: null })}>Añadir grupo</Button>
          <Popover align="right" trigger={(o) => <IconButton icon="import_export" label="Importar / exportar grupos" className="self-center" onClick={o} />}>
            {(close) => <>
              <MenuItem icon="upload_file" onClick={() => { close(); setImp(true) }}>Importar grupos (marcador, JSON o lista)</MenuItem>
              <MenuItem icon="data_object" disabled={!groups.length} onClick={() => { close(); exportGroups('json') }}>Exportar todos (JSON)</MenuItem>
              <MenuItem icon="list" disabled={!groups.length} onClick={() => { close(); exportGroups('txt') }}>Exportar como lista (Nombre | URL)</MenuItem>
            </>}
          </Popover>
        </>} />

      <Card filled className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-64 flex-1">
            <h2 className="text-lg">Captura tus grupos desde Facebook con un clic</h2>
            <p className="text-text-2">Arrastra el botón azul a tu barra de marcadores. Luego abre <a href="https://www.facebook.com/groups/joins/" target="_blank" rel="noopener">Tus grupos</a> en Facebook, desplázate hasta el final y pulsa el marcador. Después vuelve aquí y usa <b className="font-medium">Importar → Pegar</b>.</p>
          </div>
          <a href={GROUPS_BOOKMARKLET} onClick={(e) => { e.preventDefault(); toast('Arrastra este botón a tu barra de marcadores; se usa dentro de Facebook.') }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-fb px-5 font-medium text-white no-underline shadow-1">
            <Icon name="bookmark_add" />SNM · Capturar grupos
          </a>
        </div>
      </Card>

      {undo && <Banner tone="info" className="mb-3" action={<Button size="sm" variant="text" onClick={() => { undo(); setUndo(null); toast('Recuperado') }}>Deshacer</Button>}>Se eliminaron grupos de tu lista (no de Facebook).</Banner>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72"><Input icon="search" placeholder="Buscar grupos" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {(['all', 'on', 'off'] as const).map((f) => <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>{{ all: 'Todos', on: 'Activos', off: 'Inactivos' }[f]}</Chip>)}
        {tags.length > 0 && <><span className="mx-1 h-5 w-px bg-outline-2" /><TagFilter tags={tags} value={tagSel} onChange={setTagSel} /></>}
      </div>

      {ids.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-secondary-container px-4 py-2 text-on-secondary-container">
          <b className="mr-2 font-medium">{ids.length} seleccionado{ids.length > 1 ? 's' : ''}</b>
          <Button size="sm" variant="text" onClick={() => { setActive(ids, true); toast(`${ids.length} grupo(s) activados`) }}>Activar</Button>
          <Button size="sm" variant="text" onClick={() => { setActive(ids, false); toast(`${ids.length} grupo(s) desactivados`) }}>Desactivar</Button>
          <Button size="sm" variant="text" icon="sell" onClick={() => setTagIds(ids)}>Etiquetar</Button>
          <Button size="sm" variant="text" className="!text-error" onClick={async () => { if (ids.length > 3 && !(await confirmBox('¿Eliminar grupos?', `Se eliminarán ${ids.length} grupos de tu lista (no de Facebook).`, 'Eliminar', true))) return; del(ids) }}>Eliminar</Button>
          <span className="flex-1" /><IconButton icon="close" label="Quitar selección" onClick={() => setChecked(new Set())} />
        </div>
      )}

      {!groups.length ? (
        <Card><Empty icon={<Icon name="group" />} title="Tu lista de grupos está vacía">
          <p>Añade los grupos de Facebook en los que participas para poder compartir en ellos.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2"><Button icon="add" onClick={() => setEdit({ open: true, g: null })}>Añadir grupo</Button><Button variant="outlined" icon="upload" onClick={() => setImp(true)}>Importar</Button></div>
        </Empty></Card>
      ) : !list.length ? (
        <Card><Empty icon={<Icon name="search_off" />} title="Sin resultados">Ningún grupo coincide con la búsqueda o el filtro.</Empty></Card>
      ) : (
        <div className="space-y-4">
          {/* barra general: seleccionar todo lo visible y nombres de columnas */}
          <label className="flex items-center gap-3 px-[17px] text-xs text-text-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" aria-label="Seleccionar todos" checked={list.every((g) => checked.has(g.id))} onChange={(e) => { const s2 = new Set(checked); list.forEach((g) => (e.target.checked ? s2.add(g.id) : s2.delete(g.id))); setChecked(s2) }} />
            <span className="flex-1">{list.length} grupo{list.length > 1 ? 's' : ''} · {((n) => `${n} activo${n === 1 ? '' : 's'}`)(list.filter((g) => g.active).length)}</span>
            <span className="hidden w-28 sm:block">Último uso</span><span className="w-14 text-center">Activo</span><span className="w-18" />
          </label>
          {groupsByTag(list).map(({ tag: t, items }) => (
            <section key={t} className="overflow-hidden rounded-3xl border border-outline-2 bg-surface">
              <label className="flex items-center gap-3 border-b border-outline-2 bg-surface-2 px-4 py-2.5 text-sm font-medium">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" aria-label={`Seleccionar ${t}`} checked={items.every((g) => checked.has(g.id))}
                  onChange={(e) => { const s2 = new Set(checked); items.forEach((g) => (e.target.checked ? s2.add(g.id) : s2.delete(g.id))); setChecked(s2) }} />
                <Icon name={t === NO_TAG ? 'label_off' : 'sell'} className={cn('!text-[18px]', t === NO_TAG ? 'text-text-2' : 'text-primary')} />
                <span className={cn('flex-1', t === NO_TAG && 'text-text-2')}>{t}</span>
                <span className="text-xs font-normal text-text-2">{items.length} grupo{items.length === 1 ? '' : 's'} · {((n) => `${n} activo${n === 1 ? '' : 's'}`)(items.filter((g) => g.active).length)}</span>
              </label>
              {items.map((g) => renderRow(g))}
            </section>
          ))}
        </div>
      )}
      <GroupDialog open={edit.open} group={edit.g} onClose={() => setEdit({ open: false, g: null })} />
      <ImportDialog open={imp} onClose={() => setImp(false)} />
      <TagDialog ids={tagIds} onClose={() => setTagIds(null)} />
      <ReportDialog open={rep} onClose={() => setRep(false)} checked={new Set(ids)} />
    </div>
  )
}

const usePublisherState = usePublisher.getState
