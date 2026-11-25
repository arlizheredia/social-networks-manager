import { create } from 'zustand'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { Icon } from './Icon'

interface Req {
  title: string
  text: string
  ok: string
  cancel: string | null
  danger?: boolean
  icon?: string
  resolve: (v: boolean) => void
}
const useConfirm = create<{ req: Req | null }>(() => ({ req: null }))

/** Pide confirmación. Devuelve true si se acepta. */
export function confirmBox(title: string, text: string, ok = 'Aceptar', danger = false) {
  return new Promise<boolean>((resolve) => useConfirm.setState({ req: { title, text, ok, cancel: 'Cancelar', danger, resolve } }))
}
/** Aviso con acción opcional. Devuelve true al pulsar el botón principal. */
export function alertBox(icon: string, title: string, text: string, opts: { ok?: string; cancel?: string | null } = {}) {
  return new Promise<boolean>((resolve) =>
    useConfirm.setState({ req: { icon, title, text, ok: opts.ok ?? 'Entendido', cancel: opts.cancel ?? null, resolve } }),
  )
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req)
  const done = (v: boolean) => { req?.resolve(v); useConfirm.setState({ req: null }) }
  return (
    <Dialog
      open={!!req}
      onClose={() => done(false)}
      title={req?.title ?? ''}
      icon={req?.icon ? <Icon name={req.icon} className={req.danger ? 'text-error' : 'text-primary'} /> : undefined}
      className="w-[min(440px,calc(100vw-32px))]"
      actions={
        <>
          {req?.cancel && <Button variant="text" onClick={() => done(false)}>{req.cancel}</Button>}
          <Button variant={req?.danger ? 'danger' : 'filled'} onClick={() => done(true)} autoFocus>{req?.ok}</Button>
        </>
      }
    >
      <p className="whitespace-pre-line text-text-2">{req?.text}</p>
    </Dialog>
  )
}
