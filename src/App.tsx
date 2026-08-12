import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { OliveShell } from './ui/olive/OliveShell'
import { Dashboard } from './ui/screens/Dashboard'
import { Calendrier } from './ui/screens/Calendrier'
import { Championnat } from './ui/screens/Championnat'
import { TeamsList } from './ui/screens/TeamsList'
import { TeamCreate } from './ui/screens/TeamCreate'
import { TeamDetail } from './ui/screens/TeamDetail'
import { PlayerDetail } from './ui/screens/PlayerDetail'
import { MatchSetup } from './ui/screens/MatchSetup'
import { MatchPreview } from './ui/screens/MatchPreview'
import { LiveMatch } from './ui/screens/LiveMatch'
import { SummaryScreen } from './ui/screens/SummaryScreen'
import { SpectatorMatch } from './ui/screens/SpectatorMatch'
import { AuthProvider } from './app/auth'
import { ClubProvider, useClub } from './app/club'
import { Welcome } from './ui/screens/Welcome'
import { SchemaEdit } from './ui/screens/SchemaEdit'
import { SchemaList } from './ui/screens/SchemaList'
import { SchemaView } from './ui/screens/SchemaView'

const Padded = ({ children }: { children: ReactNode }) => <div className="p-6">{children}</div>

function MatchSetupRoute() {
  const navigate = useNavigate()
  return <MatchSetup onCreated={(id) => navigate(`/match/${id}`)} />
}
function MatchPreviewRoute() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/" replace />
  return <MatchPreview matchId={id} />
}
function LiveRoute() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/" replace />
  return <LiveMatch matchId={id} onFinish={() => navigate(`/match/${id}/summary`)} />
}
function SummaryRoute() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/" replace />
  return <SummaryScreen matchId={id} onHome={() => navigate('/')} />
}
function SpectatorRoute() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/" replace />
  return <SpectatorMatch matchId={id} />
}

/** Tant qu'aucun club valide n'est réglé, l'application est l'écran de bienvenue.
 *  Le suivi spectateur reste accessible sans club : il se partage à des gens qui
 *  n'ont pas l'application réglée. */
function ClubGate() {
  const { clubId, ready } = useClub()
  if (!ready) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>
  if (!clubId) return <Welcome />
  return <OliveShell />
}

export default function App() {
  return (
    <BrowserRouter>
      <ClubProvider>
        <AuthProvider>
          <Routes>
            {/* Suivi spectateur : plein écran, hors du shell (projetable) */}
            <Route path="/match/:id/watch" element={<SpectatorRoute />} />
            {/* Création d'équipe : hors garde, c'est l'issue proposée par l'écran de
                bienvenue quand aucune équipe n'existe encore pour choisir un club. */}
            <Route path="/teams/new" element={<TeamCreate />} />
            {/* Toute l'app dans le shell Olive, derrière le choix du club */}
            <Route element={<ClubGate />}>
              <Route index element={<Dashboard />} />
              <Route path="/match/:id/live" element={<LiveRoute />} />
              <Route path="/calendrier" element={<Calendrier />} />
              <Route path="/championnat" element={<Championnat />} />
              <Route path="/teams" element={<Padded><TeamsList /></Padded>} />
              <Route path="/teams/:id" element={<TeamDetail />} />
              <Route path="/players/:id" element={<PlayerDetail />} />
              {/* Le tableau tactique : la bibliothèque, la consultation (libre),
                  puis l'éditeur — la route la plus précise d'abord. */}
              <Route path="/schemas" element={<SchemaList />} />
              <Route path="/schemas/:id/edit" element={<SchemaEdit />} />
              <Route path="/schemas/:id" element={<SchemaView />} />
              <Route path="/match/new" element={<Padded><MatchSetupRoute /></Padded>} />
              <Route path="/match/:id/summary" element={<SummaryRoute />} />
              <Route path="/match/:id" element={<Padded><MatchPreviewRoute /></Padded>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ClubProvider>
    </BrowserRouter>
  )
}
