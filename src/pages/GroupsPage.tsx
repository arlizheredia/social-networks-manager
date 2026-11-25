import { useEffect, useMemo, useRef, useState } from 'react'
import { Banner, Button, Card, Chip, Dialog, Empty, Field, Icon, IconButton, Input, PageHead, Switch, Textarea, confirmBox, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { copyText, download, fmtRelative } from '@/lib/util'
import { downloadWord, printPdf, reportTextToHtml } from '@/lib/docexport'
import { initials, normGroupUrl } from '@/features/publisher/fb'
import { setPub, usePublisher } from '@/features/publisher/store'
import { allTags, computeSel, saveSel } from '@/features/publisher/logic'
import { analyzeImport, applyImport, deleteGroups, upsertGroup } from '@/features/publisher/groups'
import { buildGroupsReport, type GroupScope } from '@/features/publisher/report'
import { GROUPS_BOOKMARKLET } from '@/features/publisher/bookmarklet'
import type { Group } from '@/features/publisher/types'

function GroupDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group: Group | null }) {
  const tags = allTags(usePublisher((s) => s.groups))
  const [f, setF] = useState({ url: '', name: '', tags: '', notes: '', active: true, approval: false })
  useEffect(() => { if (open) setF(group ? { url: group.url, name: group.name, tags: group.tags.join(', '), notes: group.notes, active: group.active, approval: group.approval } : { url: '', name: '', tags: '', notes: '', active: true, approval: false }) }, [open, group])
  const norm = normGroupUrl(f.url)
  const save = () => {
    if (!norm) { toast('Debe ser un enlace a un grupo: facebook.com/groups/…'); return }
    if (!f.name.trim()) { toast('Escribe el nombre del grupo'); return }
    const dup = upsertGroup({ url: norm, name: f.name.trim().slice(0, 140), tags: [...new Set(f.tags.split(',').map((s) => s.trim()).filter(Boolean))], notes: f.notes.trim().slice(0, 500), active: f.active, approval: f.approval }, group?.id)
    if (dup) { toast(`Ya existe un grupo con esa URL: «${dup}»`); return }
    toast(group ? 'Grupo actualizado' : 'Grupo añadido'); onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title={group ? 'Editar grupo' : 'Añadir grupo'} actions={<><Button variant="text" onClick={onClose}>Cancelar</Button><Button onClick={save}>Guardar</Button></>}>
      <Field label="URL o ID del grupo *" hint={!f.url ? 'También vale el ID numérico o el nombre corto del grupo.' : norm ? `✓ ${norm}` : <span className="text-error">Debe ser un enlace a un grupo: facebook.com/groups/…</span>}>
        <Input autoFocus icon="link" placeholder="https://www.facebook.com/groups/…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
      </Field>
      <Field label="Nombre *"><Input maxLength={140} placeholder="Ej.: Compraventa Madrid Centro" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Etiquetas" hint="Separadas por comas: ventas, local, empleo">
        <Input list="tagList" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
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

function ReportDialog({ open, onClose, checked }: { open: boolean; onClose: () => void; checked: Set<string> }) {
  const groups = usePublisher((s) => s.groups)
  const [scope, setScope] = useState<GroupScope>('active')
  const [inc, setInc] = useState({ link: true, tags: true, notes: false, last: false })
  const [text, setText] = useState('')
  useEffect(() => { if (open) setScope(checked.size ? 'sel' : 'active') }, [open, checked.size])
  useEffect(() => {
    const list = scope === 'active' ? groups.filter((g) => g.active) : scope === 'sel' ? groups.filter((g) => checked.has(g.id)) : groups
    setText(buildGroupsReport(list, scope, inc))
  }, [scope, inc, groups, checked])
  const file = `grupos-${{ active: 'activos', all: 'todos', sel: 'seleccionados' }[scope]}-${new Date().toISOString().slice(0, 10)}`
  const title = text.split('\n')[0]
  return (
    <Dialog open={open} onClose={onClose} title="Reporte de grupos" wide
      actions={<><Button variant="text" onClick={onClose}>Cerrar</Button><Button variant="outlined" icon="content_copy" onClick={async () => toast((await copyText(text)) ? 'Reporte copiado' : 'No se pudo copiar')}>Copiar</Button><Button variant="outlined" icon="description" onClick={() => downloadWord(file, title, reportTextToHtml(text), true)}>Word</Button><Button icon="picture_as_pdf" onClick={() => printPdf(title, reportTextToHtml(text), true)}>PDF</Button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-xs text-text-2">Grupos:</span>
        <Chip selected={scope === 'active'} onClick={() => setScope('active')}>Activos</Chip><Chip selected={scope === 'all'} onClick={() => setScope('all')}>Todos</Chip>
        {checked.size > 0 && <Chip selected={scope === 'sel'} onClick={() => setScope('sel')}>Seleccionados ({checked.size})</Chip>}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-xs text-text-2">Incluir:</span>
        {(['link', 'tags', 'notes', 'last'] as const).map((k) => <Chip key={k} selected={inc[k]} onClick={() => setInc({ ...inc, [k]: !inc[k] })}>{{ link: 'Enlace', tags: 'Etiquetas', notes: 'Notas', last: 'Último uso' }[k]}</Chip>)}
      </div>
      <Field label="Texto del reporte · Word y PDF en Arial 12, blanco y negro"><Textarea rows={14} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} /></Field>
    </Dialog>
  )
}

export default function GroupsPage() {
  const groups = usePublisher((s) => s.groups)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState<{ open: boolean; g: Group | null }>({ open: false, g: null })
  const [imp, setImp] = useState(false)
  const [rep, setRep] = useState(false)
  const tags = allTags(groups)
  const ql = q.trim().toLowerCase()
  const list = groups.filter((g) => (filter === 'all' || (filter === 'on' ? g.active : !g.active)) && (!tag || g.tags.includes(tag)) && (!ql || g.name.toLowerCase().includes(ql) || g.url.toLowerCase().includes(ql) || g.tags.some((t) => t.toLowerCase().includes(ql))))
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

  return (
    <div>
      <PageHead title="Grupos" sub="Gestiona los grupos de Facebook donde compartes. Solo los grupos activos aparecen como destino."
        actions={<>
          <Button variant="outlined" icon="upload" onClick={() => setImp(true)}>Importar</Button>
          <Button variant="outlined" icon="summarize" onClick={() => setRep(true)} disabled={!groups.length}>Reporte</Button>
          <Button variant="outlined" icon="download" onClick={() => { if (!groups.length) { toast('No hay grupos para exportar'); return } download(`grupos-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'Social Networks Manager', type: 'groups', groups: groups.map(({ name, url, tags, notes, active }) => ({ name, url, tags, notes, active })) }, null, 2), 'application/json'); toast('Grupos exportados') }}>Exportar</Button>
          <Button icon="add" onClick={() => setEdit({ open: true, g: null })}>Añadir grupo</Button>
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
        {tags.map((t) => <Chip key={t} icon="tag" selected={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</Chip>)}
      </div>

      {ids.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-secondary-container px-4 py-2 text-on-secondary-container">
          <b className="mr-2 font-medium">{ids.length} seleccionado{ids.length > 1 ? 's' : ''}</b>
          <Button size="sm" variant="text" onClick={() => { setActive(ids, true); toast(`${ids.length} grupo(s) activados`) }}>Activar</Button>
          <Button size="sm" variant="text" onClick={() => { setActive(ids, false); toast(`${ids.length} grupo(s) desactivados`) }}>Desactivar</Button>
          <Button size="sm" variant="text" onClick={() => { const t = prompt('Etiqueta para añadir a los grupos seleccionados:'); if (!t?.trim()) return; setPub((s) => ({ groups: s.groups.map((g) => (ids.includes(g.id) ? { ...g, tags: [...new Set([...g.tags, t.trim()])] } : g)) })); toast('Etiqueta añadida') }}>Etiquetar</Button>
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
        <div className="overflow-hidden rounded-3xl border border-outline-2 bg-surface">
          <label className="flex items-center gap-3 border-b border-outline-2 bg-surface-2 px-4 py-2 text-xs text-text-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={list.every((g) => checked.has(g.id))} onChange={(e) => { const s = new Set(checked); list.forEach((g) => (e.target.checked ? s.add(g.id) : s.delete(g.id))); setChecked(s) }} />
            <span className="flex-1">{list.length} grupo{list.length > 1 ? 's' : ''} · {groups.filter((g) => g.active).length} activos</span>
            <span className="hidden w-28 sm:block">Último uso</span><span className="w-12">Activo</span><span className="w-18" />
          </label>
          {list.map((g) => (
            <div key={g.id} className={cn('flex items-center gap-3 border-b border-outline-2 px-4 py-2.5 last:border-0', !g.active && 'opacity-60')}>
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked.has(g.id)} onChange={(e) => { const s = new Set(checked); e.target.checked ? s.add(g.id) : s.delete(g.id); setChecked(s) }} aria-label={`Seleccionar ${g.name}`} />
              <span className="hidden size-9 shrink-0 place-items-center rounded-full bg-primary-container text-xs font-medium text-on-primary-container sm:grid">{initials(g.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-text">{g.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-2">
                  {g.tags.map((t) => <span key={t} className="rounded bg-surface-3 px-1.5">#{t}</span>)}
                  <a href={g.url} target="_blank" rel="noopener" className="truncate">{g.url.replace('https://www.', '')}</a>
                  {g.approval && <span className="text-primary">· Requiere aprobación</span>}
                  {g.notes && <span title={g.notes}>· 📝 {g.notes.slice(0, 40)}</span>}
                </div>
              </div>
              <span className="hidden w-28 text-xs text-text-2 sm:block">{g.lastShared ? fmtRelative(g.lastShared) : 'Nunca'}</span>
              <span className="w-12"><input type="checkbox" role="switch" className="size-5 accent-[var(--primary)]" checked={g.active} aria-label="Activo" onChange={(e) => { setActive([g.id], e.target.checked); toast(`«${g.name}» ${e.target.checked ? 'activado' : 'desactivado'}`) }} /></span>
              <span className="flex w-18"><IconButton size="sm" icon="edit" label="Editar" onClick={() => setEdit({ open: true, g })} /><IconButton size="sm" icon="delete" label="Eliminar" onClick={() => del([g.id])} /></span>
            </div>
          ))}
        </div>
      )}
      <GroupDialog open={edit.open} group={edit.g} onClose={() => setEdit({ open: false, g: null })} />
      <ImportDialog open={imp} onClose={() => setImp(false)} />
      <ReportDialog open={rep} onClose={() => setRep(false)} checked={new Set(ids)} />
    </div>
  )
}

const usePublisherState = usePublisher.getState
