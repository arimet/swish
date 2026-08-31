import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import { Suspense, lazy, type ReactNode } from 'react'
import { OliveShell } from './ui/olive/OliveShell'
import { Dashboard } from './ui/screens/Dashboard'
import { Calendar } from './ui/screens/Calendar'
import { Standings } from './ui/screens/Standings'
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

/* The screens loaded on demand. In one piece, the bundle makes opening the dashboard
 * download the play editor, the play viewer, the scorer's table and the whole export
 * path — 657 kB to display a score. These nine screens share two traits: they are
 * heavy, and none of them is the first thing anyone opens.
 *
 * The rest — dashboard, calendar, standings, teams — arrives in the initial bundle:
 * they are the menu's four entries, and splitting them would only add a round trip to
 * the most common gesture. */
const PlayEdit = lazy(() => import('./ui/screens/PlayEdit').then((m) => ({ default: m.PlayEdit })))
const PlayList = lazy(() => import('./ui/screens/PlayList').then((m) => ({ default: m.PlayList })))
const PlayView = lazy(() => import('./ui/screens/PlayView').then((m) => ({ default: m.PlayView })))
const PlayViewer = lazy(() => import('./ui/screens/PlayViewer').then((m) => ({ default: m.PlayViewer })))
const PlayReceived = lazy(() => import('./ui/screens/PlayReceived').then((m) => ({ default: m.PlayReceived })))
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

/** The waiting fallback, in one place: the club gate and the route splitting both
 *  use it. */
function Loading() {
  const translate = useT()
  return <div className="grid min-h-dvh place-items-center text-muted-foreground" role="status" aria-live="polite">{translate('common.loading')}</div>
}

/** The screen shown when the database cannot be reached and this device has no club
 *  to fall back on. It replaces the welcome screen, which would otherwise invite
 *  someone to create a team the server already holds. */
function Unreachable() {
  const translate = useT()
  return (
    <div className="grid min-h-dvh place-items-center p-6" role="alert">
      <div className="max-w-[55ch] text-center">
        <p className="text-lg font-extrabold tracking-tight">{translate('connection.lost')}</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--c-muted)' }}>{translate('connection.lostDetail')}</p>
        <button onClick={() => window.location.reload()}
          className="mt-6 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]"
          style={{ background: 'var(--c-brand)' }}>
          {translate('common.retry')}
        </button>
      </div>
    </div>
  )
}

/** As long as no valid club is set, the application is the welcome screen. The
 *  spectator view stays reachable without a club: it is shared with people who have
 *  not set the application up. */
function ClubGate() {
  const { clubId, ready, unreachable } = useClub()
  if (!ready) return <Loading />
  // A device that already follows a club goes through: the shell shows what it can
  // and its pill says the rest. It is the device with nothing to fall back on that
  // needs to be told, rather than invited to create a team.
  if (unreachable && !clubId) return <Unreachable />
  if (!clubId) return <Welcome />
  return <OliveShell />
}

export default function App() {
  return (
    <BrowserRouter>
      <ClubProvider>
        <AuthProvider>
          {/* One `Suspense`, around every route: the fallback is the same as
              `ClubGate`'s, so that waiting for a split screen and waiting for the club
              to resolve look alike — the worst fallback is the one that changes
              appearance depending on what you are waiting for. */}
          <Suspense fallback={<Loading />}>
          <Routes>
            {/* The spectator view: full screen, outside the shell (projectable) */}
            <Route path="/match/:id/watch" element={<SpectatorRoute />} />
            {/* The scorer's table: full screen too. Inside the shell, the title, the
                access menu and the bottom bar took a hundred-odd pixels the roster did
                not have — only four of the five players on the court were visible
                without scrolling, and a thumb straying onto "Calendar" walked out of
                the recording in progress. */}
            <Route path="/match/:id/live" element={<LiveRoute />} />
            {/* The time-out viewer: full screen, outside the shell and outside the club
                gate — a player opens the play at home. */}
            <Route path="/schemas/:id/lecteur" element={<PlayViewer />} />
            {/* A play received by link: outside the shell and outside the club gate,
                since the whole play is in the URL's fragment — whoever receives the
                link may never have opened the application. */}
            <Route path="/schemas/recu" element={<PlayReceived />} />
            {/* Team creation: outside the gate, it is the way out the welcome screen
                offers when no team exists yet to choose a club from. */}
            <Route path="/teams/new" element={<TeamCreate />} />
            {/* The whole app inside the Olive shell, behind the club choice */}
            <Route element={<ClubGate />}>
              <Route index element={<Dashboard />} />
              <Route path="/calendrier" element={<Calendar />} />
              <Route path="/championnat" element={<Standings />} />
              <Route path="/teams" element={<Padded><TeamsList /></Padded>} />
              <Route path="/teams/:id" element={<TeamDetail />} />
              <Route path="/players/:id" element={<PlayerDetail />} />
              {/* The playbook: the library, the reading screen (ungated), then the
                  editor — the most specific route first. */}
              <Route path="/schemas" element={<PlayList />} />
              <Route path="/schemas/:id/edit" element={<PlayEdit />} />
              <Route path="/schemas/:id" element={<PlayView />} />
              {/* Data cleanup: inside the shell, every operation guarded by the
                  administrator code. */}
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
