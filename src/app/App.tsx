import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import { Layout } from './Layout'
import { ConfirmHost, Loader } from '@/components/ui'
import { startExtensionBridge } from '@/features/extension/bridge'
import { scanCache } from '@/features/ai/engine'
import { loadMedia } from '@/features/publisher/media'
import { loadTR } from '@/features/comments/tracking'
import { useSettings } from '@/store/settings'

const Home = lazy(() => import('@/pages/HomePage'))
const Publish = lazy(() => import('@/pages/PublishPage'))
const Groups = lazy(() => import('@/pages/GroupsPage'))
const Comments = lazy(() => import('@/pages/CommentsPage'))
const Reports = lazy(() => import('@/pages/ReportsPage'))
const History = lazy(() => import('@/pages/HistoryPage'))
const Competition = lazy(() => import('@/pages/CompetitionPage'))
const Help = lazy(() => import('@/pages/HelpPage'))


export function App() {
  useEffect(() => {
    useSettings.getState().setTheme(useSettings.getState().theme)
    startExtensionBridge()
    scanCache()
    loadMedia()
    loadTR()
  }, [])
  return (
    <HashRouter>
      <Suspense fallback={<Loader full />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="publicar" element={<Publish />} />
            <Route path="publicar/grupos" element={<Groups />} />
            {/* Grupos ahora es una pestaña de Publicar: la dirección antigua sigue funcionando */}
            <Route path="grupos" element={<Navigate to="/publicar/grupos" replace />} />
            <Route path="comentarios/*" element={<Comments />} />
            <Route path="informes" element={<Reports />} />
            <Route path="competencia" element={<Competition />} />
            <Route path="historial" element={<History />} />
            <Route path="ayuda/:article?" element={<Help />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <ConfirmHost />
    </HashRouter>
  )
}
