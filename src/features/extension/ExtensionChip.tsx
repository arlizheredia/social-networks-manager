import { useState } from 'react'
import { Icon } from '@/components/ui'
import { useExtension } from './bridge'
import { ExtensionDialog } from './ExtensionDialog'

export function ExtensionChip() {
  const version = useExtension((s) => s.version)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} title={version ? `Extensión conectada · v${version}` : 'Extensión de Chrome no detectada'} className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-text-2 hover:bg-text/8 sm:inline-flex">
        <Icon name={version ? 'extension' : 'extension_off'} fill={!!version} className={version ? '!text-[18px] text-success' : '!text-[18px]'} />
        <span className="hidden lg:inline">{version ? 'Extensión' : 'Sin extensión'}</span>
      </button>
      <ExtensionDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
