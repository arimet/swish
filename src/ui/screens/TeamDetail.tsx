import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { getTeam, listPlayers, listMatches, listTeams, savePlayer, deletePlayer, deleteTeam, saveTeam } from '../../persistence/repositories'
import { teamRecord, teamMatches, teamScorers } from '../../domain/teamRecord'
import type { Match, Player, Team } from '../../domain/types'
import { C, NumBadge, Panel, TeamBadge, bd, fmtDate } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'
import { useClub } from '../../app/club'
import { ConfirmDialog } from '../components/ConfirmDialog'

const field: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }
const miniLabel: CSSProperties = { color: C.faint }

// An empty string becomes `undefined`, never an empty string and never a `NaN`: a
// player whose height is unknown does not have a height of zero, they have no height.
const toUndef = (s: string) => s.trim() || undefined
const toHeight = (s: string): number | undefined => {
  const n = Number(s)
  return s.trim() && !Number.isNaN(n) ? n : undefined
}

export function TeamDetail() {
  const translate = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can, guard } = useAuth()
  // Keeping the roster belongs to the club: nothing that writes it shows to anyone
  // who does not manage it. The record itself reads in full.
  const manages = can('manage')
  const { clubId, clear } = useClub()
  const [askDelete, setAskDelete] = useState(false)
  // The player themselves and not a boolean: the dialog must be able to name them,
  // otherwise "Remove this player?" does not say which one out of eleven.
  const [toRemove, setToRemove] = useState<Player | null>(null)
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [teamsById, setTeamsById] = useState<Record<string, Team>>({})
  const [coach, setCoach] = useState('')
  // An entry form appears on a click, never up front: the roster is what people come
  // to read, recruiting is the exception.
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [num, setNum] = useState(''); const [ln, setLn] = useState(''); const [fn, setFn] = useState('')
  const [birth, setBirth] = useState(''); const [height, setHeight] = useState('')
  // One player expandable at a time: no per-row state to keep alive.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBirth, setEditBirth] = useState(''); const [editHeight, setEditHeight] = useState('')

  const refresh = () => { if (id) listPlayers(id).then(setPlayers) }
  useEffect(() => {
    if (!id) return
    getTeam(id).then((t) => { setTeam(t ?? null); setCoach(t?.coach ?? '') })
      .then(refresh)
      .then(() => Promise.all([listMatches(), listTeams()]))
      .then(([ms, ts]) => { setMatches(ms); setTeamsById(Object.fromEntries(ts.map((x) => [x.id, x]))) })
  }, [id])

  if (!id) return null
  if (team === undefined) return <div className="p-6"><div className="h-24 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (team === null) return <div className="p-6"><p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>{translate('team.notFound')} <Link to="/teams" className="font-bold" style={{ color: C.accent }}>{translate('team.back')}</Link></p></div>

  const saveCoach = () => {
    if (coach === (team.coach ?? '')) return
    guard('manage', () => saveTeam({ ...team, coach: coach.trim() || undefined }).then(() => setTeam({ ...team, coach: coach.trim() || undefined })))
  }
  const addPlayer = () => guard('manage', async () => {
    if (!num || !ln.trim()) return
    await savePlayer({
      id: newId(), teamId: id, number: Number(num), lastName: ln.trim().toUpperCase(), firstName: fn.trim(),
      birthDate: toUndef(birth), height: toHeight(height),
    })
    setNum(''); setLn(''); setFn(''); setBirth(''); setHeight(''); refresh()
  })
  /**
   * Removing a player goes through a confirmation, like deleting the team just above
   * and like deleting a game or a play elsewhere.
   *
   * Without it, a single click on a twenty-four-pixel button flush against "edit"
   * deletes the player, asking nothing. The consequence announced is the one
   * `deletePlayer` actually produces — they leave the roster and the call-ups, but the
   * actions already recorded stay in the games played, where they lose their name.
   * That is checked in the repository, not assumed.
   */
  const removePlayer = () => { const p = toRemove; if (!p) return
    guard('manage', async () => { await deletePlayer(p.id); setToRemove(null); refresh() }) }
  const startEdit = (p: Player) => { setEditingId(p.id); setEditBirth(p.birthDate ?? ''); setEditHeight(p.height ? String(p.height) : '') }
  // The player's id survives an edit: it is what carries their whole history of shots
  // and statistics, and recreating them would lose it.
  const saveEdit = (p: Player) => guard('manage', async () => {
    await savePlayer({ ...p, birthDate: toUndef(editBirth), height: toHeight(editHeight) })
    setEditingId(null); refresh()
  })
  const removeTeam = async () => {
    await deleteTeam(id)
    // The followed club goes with its own team: without this `clear()`, the dashboard
    // would stay pinned to a ghost club (ClubProvider only revalidates its list on a
    // club change, not on a raw deletion).
    if (id === clubId) clear()
    navigate('/teams')
  }

  const rec = teamRecord(id, matches)
  const lines = teamMatches(id, matches)
  const upcoming = lines.filter((l) => l.match.status !== 'finished')
  const scorers = [...teamScorers(id, matches).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const playerById = Object.fromEntries(players.map((p) => [p.id, p]))
  const diff = rec.pointsFor - rec.pointsAgainst

  return (
    <div className="p-6">
      <Link to="/teams" className="inline-block rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>{translate('team.backToTeams')}</Link>
      <div className="mb-6 mt-4 flex items-center gap-3">
        <TeamBadge id={id} name={team.name} size="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{team.name}</h1>
          <p className="text-sm" style={{ color: C.muted }}>{translate('common.player', { count: players.length })}{team.coach ? ` · ${translate('team.coachSuffix', { name: team.coach })}` : ''}</p>
        </div>
        {/* As on the summary and the game record: the right is checked when the dialog
            opens, not re-derived afterwards. Accepted — locking yourself out between
            the opening and the confirmation only happens by handing the device over
            mid-action. */}
        {manages && <button onClick={() => guard('manage', () => setAskDelete(true))} className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold" style={{ border: `1px solid ${C.accentBd}`, color: C.accent }}>{translate('common.delete')}</button>}
      </div>
      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={removeTeam}
        title={translate('team.deleteTitle')} message={translate('team.deleteText', { name: team.name })} confirmLabel={translate('common.delete')} danger />
      <ConfirmDialog open={!!toRemove} onClose={() => setToRemove(null)} onConfirm={removePlayer}
        title={toRemove ? translate('team.removePlayerTitle', { name: `${toRemove.lastName} ${toRemove.firstName}` }) : ''}
        message={translate('team.removePlayerText')}
        confirmLabel={translate('common.remove')} danger />

      {/* The season's figures only appear from one game played onwards. Otherwise it
          was four tiles reading "0" and "—", and two panels announcing the absence of
          games and of scorers: six blocks to say six times that the season has not
          started — on the very screen where the volunteer has just entered their
          roster, hence the first they see after founding their club. What is left, the
          roster, is precisely what they have just accomplished. */}
      {rec.played > 0 && <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={translate('team.games')} value={String(rec.played)} hint={upcoming.length ? translate('team.upcoming', { n: upcoming.length }) : translate('team.played')} />
        <StatCard label={translate('dashboard.record')} value={`${rec.wins}V – ${rec.losses}D`} hint={rec.played ? translate('team.winPct', { n: Math.round((rec.wins / rec.played) * 100) }) : '—'} accent={rec.wins >= rec.losses ? C.green : C.accent} />
        <StatCard label={translate('dashboard.pointsFor')} value={rec.played ? String(rec.avgFor) : '—'} hint={rec.played ? translate('team.inTotal', { n: rec.pointsFor }) : translate('dashboard.perGame')} />
        <StatCard label={translate('dashboard.differential')} value={diff > 0 ? `+${diff}` : String(diff)} hint={translate('team.concededPerGame', { n: rec.avgAgainst })} accent={diff > 0 ? C.green : diff < 0 ? C.danger : undefined} />
      </div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <div className="space-y-6">
          {lines.length > 0 && <Panel title={translate('team.recentGames')}>
            {lines.length === 0 ? (
              <Empty>{translate('team.noGame')}</Empty>
            ) : (
              <ul className="space-y-1.5">
                {lines.slice(0, 8).map((l) => {
                  const opp = teamsById[l.opponentId]?.name ?? translate('match.opponent')
                  const f = fmtDate(l.match.meta.date)
                  const to = l.match.status === 'finished' ? `/match/${l.match.id}/summary` : l.match.status === 'live' ? `/match/${l.match.id}/live` : `/match/${l.match.id}`
                  return (
                    <li key={l.match.id}>
                      <Link to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--c-hover)]" style={{ background: C.panel }}>
                        {l.result && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-black" style={{ background: l.result === 'V' ? C.greenBg : C.dangerBg, color: l.result === 'V' ? C.green : C.danger }}>{l.result}</span>}
                        {!l.result && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-black" style={{ background: C.amberBg, color: C.amber }}>·</span>}
                        <TeamBadge id={l.opponentId} name={opp} size="h-7 w-7 text-[12px]" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{opp}</span>
                        <span className="shrink-0 text-[12px] font-semibold" style={{ color: C.faint }}>{f.long || '—'}</span>
                        <span className="w-16 shrink-0 text-right text-sm font-black tabular-nums">{l.scored === null ? '—' : `${l.scored}–${l.conceded}`}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>}

          {scorers.length > 0 && <Panel title={translate('dashboard.topScorers')}>
            {scorers.length === 0 ? (
              <Empty>{translate('dashboard.noPointsYet')}</Empty>
            ) : (
              <ul className="space-y-1.5">
                {/* Every row leads to the player's record, as on the dashboard: it is
                    the same ranking, and there is no reason for it to be clickable there
                    and inert here. People got there through the roster just above, which
                    forced them to find in a list of eleven the name they had under their
                    finger. */}
                {scorers.map(([pid, pts], i) => {
                  const p = playerById[pid]
                  return (
                    <li key={pid}>
                      <Link
                        to={`/players/${pid}`}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-[var(--c-hover)]"
                        style={{ background: C.panel }}
                      >
                        <span className="w-4 text-center text-sm font-black" style={{ color: i === 0 ? C.accent : C.faint }}>{i + 1}</span>
                        <NumBadge n={p?.number ?? '?'} />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{p ? `${p.lastName} ${p.firstName}` : translate('common.playerWord')}</span>
                        <span className="text-sm font-black tabular-nums" style={{ color: C.text }}>{pts} <span className="text-[12px] font-semibold" style={{ color: C.muted }}>pts</span></span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>}
        </div>

        <div className="space-y-6">
          <Panel title={translate('team.roster')}>
            {/* The coach field writes: without the right it does not show. The name
                stays readable at the top of the record, next to the player count. */}
            {manages && (
              <>
                <label htmlFor="coach" className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('team.coach')}</label>
                <input id="coach" value={coach} onChange={(e) => setCoach(e.target.value)} onBlur={saveCoach} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  placeholder={translate('team.coachPlaceholder')} style={{ ...field, width: '100%' }} className="mb-4" />
              </>
            )}
            <ul className="mb-4 space-y-1.5">
              {[...players].sort((a, b) => a.number - b.number).map((p) => (
                <li key={p.id} className="space-y-2 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                  <div className="flex items-center gap-3">
                    <Link to={`/players/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <NumBadge n={p.number} />
                      {/* Surname and first name clipped as one, not each on its own: two
                          independent truncations shaved the surname while the first name,
                          the only one that should give way, kept its room. */}
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{p.lastName}</span> <span style={{ color: C.muted }}>{p.firstName}</span>
                      </span>
                    </Link>
                    {/* Edit and remove write: the row comes down to the player and their
                        record link for anyone who does not manage the roster.
                        The player's name stays in the button's accessible name — without
                        it, ten identical "edit" buttons in the same list — but it leaves
                        the visible label, which overlapped the name on a phone. */}
                    {manages && (
                      <>
                        <button aria-label={translate(editingId === p.id ? 'team.closePlayer' : 'team.editPlayer', { name: p.lastName })}
                          onClick={() => (editingId === p.id ? setEditingId(null) : startEdit(p))} className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold" style={{ color: C.muted }}>
                          {translate(editingId === p.id ? 'common.close' : 'common.edit')}
                        </button>
                        {/* Removal stays outside the expanded area: it is a destructive
                            action, it must not end up mixed in with the edit fields.
                            It carried the accent — the brand's colour — next to a grey
                            "edit", and stood twenty-four pixels tall. A destruction is not
                            signalled with the colour of ordinary buttons, and is not aimed
                            at with the barely tolerable minimum. */}
                        <button onClick={() => setToRemove(p)} aria-label={translate('team.removeNamedPlayer', { name: `${p.lastName} ${p.firstName}` })}
                          className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold transition hover:bg-[var(--c-danger-bg)]" style={{ color: C.danger }}>{translate('team.remove')}</button>
                      </>
                    )}
                  </div>
                  {editingId === p.id && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label htmlFor={`edit-birth-${p.id}`} className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={miniLabel}>{translate('team.birth')}</label>
                        <input id={`edit-birth-${p.id}`} type="date" value={editBirth} onChange={(e) => setEditBirth(e.target.value)} style={{ ...field, width: '100%' }} />
                      </div>
                      <div>
                        <label htmlFor={`edit-height-${p.id}`} className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={miniLabel}>{translate('team.playerHeight')}</label>
                        <input id={`edit-height-${p.id}`} type="number" inputMode="numeric" value={editHeight} onChange={(e) => setEditHeight(e.target.value)} style={{ ...field, width: '100%' }} />
                      </div>
                      <button onClick={() => saveEdit(p)} className="col-span-2 rounded-xl py-2 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('common.save')}</button>
                    </div>
                  )}
                </li>
              ))}
              {players.length === 0 && <li className="text-sm" style={{ color: C.muted }}>{manages ? translate('team.noPlayerAddOne') : translate('team.noPlayerInRoster')}</li>}
            </ul>
            {/* Recruiting is administrative: the button does not show without the
                right. Opening the form is already a write, so the guard stays here and
                not only at save time. */}
            {!manages ? null : !addingPlayer ? (
              <button onClick={() => guard('manage', () => setAddingPlayer(true))} className="w-full rounded-xl py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
                {translate('team.addPlayer')}
              </button>
            ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('team.newPlayer')}</p>
                <button onClick={() => setAddingPlayer(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>{translate('common.closeShort')}</button>
              </div>
              <div className="grid grid-cols-[56px_1fr] gap-2">
                <input placeholder={translate('team.number')} value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" style={{ ...field, textAlign: 'center' }} />
                <input placeholder={translate('team.lastName')} value={ln} onChange={(e) => setLn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()} style={field} />
              </div>
              <input placeholder={translate('team.firstName')} value={fn} onChange={(e) => setFn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()} style={{ ...field, width: '100%' }} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="add-birth" className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={miniLabel}>{translate('team.birthDate')}</label>
                  <input id="add-birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} style={{ ...field, width: '100%' }} />
                </div>
                <div>
                  <label htmlFor="add-height" className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={miniLabel}>{translate('team.height')}</label>
                  <input id="add-height" type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} style={{ ...field, width: '100%' }} />
                </div>
              </div>
              <button onClick={addPlayer} className="w-full rounded-xl py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('team.addThisPlayer')}</button>
            </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
    </div>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
