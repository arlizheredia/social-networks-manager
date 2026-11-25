import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './index.css'

// Iconos visibles solo cuando la fuente Material Symbols está cargada
;(() => {
  const root = document.documentElement
  const ready = () => root.classList.add('ms-ready')
  if (!document.fonts) return ready()
  document.fonts.load('24px "Material Symbols Rounded"').then((f) => { if (f.length) ready() }, () => {})
  document.fonts.addEventListener?.('loadingdone', () => { for (const f of document.fonts) if (/Material Symbols/.test(f.family) && f.status === 'loaded') ready() })
  setTimeout(ready, 6000)
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
