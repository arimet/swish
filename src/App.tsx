import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import { Suspense, lazy, type ReactNode } from 'react'
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
import { AuthProvider } from './app/auth'
import { ClubProvider, useClub } from './app/club'
import { Welcome } from './ui/screens/Welcome'
import { useT } from './i18n'

/* Les écrans chargés à la demande. Le paquet était d'un seul morceau : ouvrir le
 * tableau de bord téléchargeait aussi l'éditeur de schémas, le lecteur de
 * combinaisons, la table de marque et tout le chemin d'export — 657 ko pour
 * afficher un score. Ces neuf écrans partagent deux traits : ils sont lourds, et
 * aucun n'est la première chose qu'on ouvre.
 *
 * Le reste — tableau de bord, calendrier, championnat, équipes — arrive dans le
 * paquet initial : ce sont les quatre entrées du menu, les découper ne ferait
 * qu'ajouter un aller-retour au geste le plus courant. */
const SchemaEdit = lazy(() => import('./ui/screens/SchemaEdit').then((m) => ({ default: m.SchemaEdit })))
const SchemaList = lazy(() => import('./ui/screens/SchemaList').then((m) => ({ default: m.SchemaList })))
const SchemaView = lazy(() => import('./ui/screens/SchemaView').then((m) => ({ default: m.SchemaView })))
const SchemaPlayer = lazy(() => import('./ui/screens/SchemaPlayer').then((m) => ({ default: m.SchemaPlayer })))
const SchemaRecu = lazy(() => import('./ui/screens/SchemaRecu').then((m) => ({ default: m.SchemaRecu })))
const SummaryScreen = lazy(() => import('./ui/screens/SummaryScreen').then((m) => ({ default: m.SummaryScreen })))
const SpectatorMatch = lazy(() => import('./ui/screens/SpectatorMatch').then((m) => ({ default: m.SpectatorMatch })))
const Admin = lazy(() => import('./ui/screens/Admin').then((m) => ({ default: m.Admin })))
const LiveMatch = lazy(() => import('./ui/screens/LiveMatch').then((m) => ({ default: m.LiveMatch })))

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
/** Le repli d'attente, en un seul endroit : la garde club et le découpage des
 *  routes l'utilisent tous les deux. */
function Chargement() {
  const trad = useT()
  return <div className="grid min-h-dvh place-items-center text-muted-foreground" role="status" aria-live="polite">{trad('commun.chargement')}</div>
}

function ClubGate() {
  const { clubId, ready } = useClub()
  if (!ready) return <Chargement />
  if (!clubId) return <Welcome />
  return <OliveShell />
}

export default function App() {
  return (
    <BrowserRouter>
      <ClubProvider>
        <AuthProvider>
          {/* Un seul `Suspense`, autour de toutes les routes : le repli est le
              même que celui de `ClubGate`, si bien qu'attendre un écran découpé
              et attendre la résolution du club se ressemblent — le pire repli est
              celui qui change d'aspect selon ce qu'on attend. */}
          <Suspense fallback={<Chargement />}>
          <Routes>
            {/* Suivi spectateur : plein écran, hors du shell (projetable) */}
            <Route path="/match/:id/watch" element={<SpectatorRoute />} />
            {/* La table de marque : plein écran elle aussi. Dans la coquille, le
                titre, le menu d'accès et la barre du bas prenaient une centaine
                de pixels que l'effectif n'avait pas — on ne voyait que quatre des
                cinq joueurs sur le terrain sans faire défiler, et un pouce égaré
                sur « Calendrier » quittait la saisie en cours. */}
            <Route path="/match/:id/live" element={<LiveRoute />} />
            {/* Le lecteur du temps-mort : plein écran, hors du shell et hors de
                la garde club — un joueur ouvre la combinaison chez lui. */}
            <Route path="/schemas/:id/lecteur" element={<SchemaPlayer />} />
            {/* Une combinaison reçue par lien : hors du shell et hors de la garde
                club, puisque tout le schéma est dans le fragment de l'URL — celui
                qui reçoit le lien n'a peut-être jamais ouvert l'application. */}
            <Route path="/schemas/recu" element={<SchemaRecu />} />
            {/* Création d'équipe : hors garde, c'est l'issue proposée par l'écran de
                bienvenue quand aucune équipe n'existe encore pour choisir un club. */}
            <Route path="/teams/new" element={<TeamCreate />} />
            {/* Toute l'app dans le shell Olive, derrière le choix du club */}
            <Route element={<ClubGate />}>
              <Route index element={<Dashboard />} />
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
              {/* Le ménage des données : dans la coquille, chaque opération gardée
                  par le code administrateur. */}
              <Route path="/admin" element={<Admin />} />
              <Route path="/match/new" element={<Padded><MatchSetupRoute /></Padded>} />
              <Route path="/match/:id/summary" element={<SummaryRoute />} />
              <Route path="/match/:id" element={<Padded><MatchPreviewRoute /></Padded>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </Suspense>
        </AuthProvider>
      </ClubProvider>
    </BrowserRouter>
  )
}
