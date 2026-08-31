/**
 * The administrator's cleanup: deleting in bulk what is no longer wanted, after a
 * few trial seasons that nobody is going to unpick game by game.
 *
 * Everything here is irreversible: there is no bin. Each operation therefore
 * announces its scope **and its real count** before acting, and an operation that
 * would destroy nothing is disabled: an enabled button that does nothing reads as a
 * fault.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { years, hasEvents, leagues, clubsOfGames, ofYear, ofLeague } from '../../domain/cleanup'
import type { Match, ReportedResult, Training } from '../../domain/types'
import type { Play } from '../../domain/plays'
import {
  clearClubStats, deleteAllResults, deleteMatchesWhere, deletePlaysOfClub, deleteTrainingsOfClub,
  listMatches, listPlays, listResults, listTrainings, wipeAll,
} from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { C, bd, useLeagueLabel } from '../olive/kit'
import { WriteToken } from '../components/WriteToken'

/** A cleanup operation ready to be confirmed: what it announces, and what it does.
 *  Nothing runs before the confirmation. */
interface Operation {
  title: string
  message: string
  /** Text to copy out in order to confirm — reserved for the full reset. */
  expectedInput?: string
  run: () => Promise<unknown>
}

/* Plurals go through the catalogue: the old helper stuck an "s" onto the French
   word, which does not translate — English does not inflect the same words in the
   same places, and "feuille/feuilles" has no mechanical English counterpart. */

export function Admin() {
  const translate = useT()
  const { clubId, club, teams, clear } = useClub()
  const { can, guard } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<Match[]>([])
  const [results, setResults] = useState<ReportedResult[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [plays, setPlays] = useState<Play[]>([])
  // The operation whose confirmation has been asked for. The right is checked when
  // the dialog opens, as on the team record and the library.
  const [pending, setPending] = useState<Operation | null>(null)

  const reload = useCallback(async () => {
    const [ms, rs, ts, ps] = await Promise.all([listMatches(), listResults(), listTrainings(), clubId ? listPlays(clubId) : []])
    setMatches(ms); setResults(rs); setTrainings(ts); setPlays(ps)
  }, [clubId])
  useEffect(() => { reload() }, [reload])

  /* "Match amical" is the value stored for a game with no league, and it serves as a
     grouping key here: it is translated at the moment of writing it, not before, or
     the two languages would carve out two different groups. */
  const leagueName = useLeagueLabel()
  const teamName = useCallback((id: string) => teams.find((t) => t.id === id)?.name ?? translate('common.team'), [teams, translate])
  const sessions = useMemo(() => trainings.filter((t) => t.clubId === clubId), [trainings, clubId])

  // Guard first, mutate second: the scorer's table does not see a confirmation dialog
  // open that it would have no right to confirm.
  const ask = (op: Operation) => guard('manage', () => setPending(op))
  const confirm = async () => {
    if (!pending) return
    await pending.run()
    await reload()
  }

  const deleteGames = (label: string, filter: (m: Match) => boolean, n: number) => ask({
    title: translate('admin.deleteGamesTitle'),
    message: translate('admin.deleteGamesText', { count: translate('count.game', { count: n }), label: label }),
    run: () => deleteMatchesWhere(filter),
  })

  // The shell only mounts this screen behind a resolved club; the no-club branch
  // avoids a `clubId!` in every operation that depends on it.
  if (!clubId) return null

  // The menu already shows the entry only to the administrator; the direct URL
  // follows the same rule. This screen is nothing but a board of destructive buttons:
  // without the right, all that would be left is counts under buttons demanding a
  // code. The guards on each operation stay in place behind this redirect.
  if (!can('manage')) return <Navigate to="/" replace />

  return (
    <div className="p-6">
      <p className="mb-6 rounded-2xl px-4 py-3 text-sm" style={{ background: C.accentBg, color: C.accent }}>
        {translate('admin.warning')}
      </p>

      <div className="space-y-6">
        <WriteToken />

        <Block title={translate('admin.byLeague')} help={translate('admin.leagueHelp')}>
          {leagues(matches).map((league) => {
            const n = matches.filter(ofLeague(league)).length
            return (
              <Row key={league} label={leagueName(league)} count={translate('count.game', { count: n })} action={translate('common.delete')}
                aria={translate('admin.deleteGamesOf', { what: leagueName(league) })} disabled={n === 0}
                onClick={() => deleteGames(`« ${leagueName(league)} »`, ofLeague(league), n)} />
            )
          })}
          {matches.length === 0 && <EmptyRow>{translate('admin.noGame')}</EmptyRow>}
        </Block>

        <Block title={translate('admin.byYear')} help={translate('admin.yearHelp')}>
          {years(matches).map((year) => {
            const n = matches.filter(ofYear(year)).length
            return (
              <Row key={year} label={translate('admin.year', { year })} count={translate('count.game', { count: n })} action={translate('common.delete')}
                aria={translate('admin.deleteGamesOfYear', { year })} disabled={n === 0}
                onClick={() => deleteGames(translate('admin.calendarYear', { year }), ofYear(year), n)} />
            )
          })}
          {years(matches).length === 0 && <EmptyRow>{translate('admin.noDatedGame')}</EmptyRow>}
        </Block>

        <Block title={translate('admin.teamStats')} help={translate('admin.statsHelp')}>
          {clubsOfGames(matches).map((id) => {
            const n = matches.filter(hasEvents(id)).length
            return (
              <Row key={id} label={teamName(id)} count={translate('admin.toEmpty', { count: translate('count.sheet', { count: n }) })} action={translate('admin.empty')}
                aria={translate('admin.emptySheetsOf', { name: teamName(id) })} disabled={n === 0}
                onClick={() => ask({
                  title: translate('admin.emptyTitle'),
                  message: translate('admin.emptyText', { count: translate('count.game', { count: n }), name: teamName(id) }),
                  run: () => clearClubStats(id),
                })} />
            )
          })}
          {matches.length === 0 && <EmptyRow>{translate('admin.noGame')}</EmptyRow>}
        </Block>

        <Block title={translate('admin.theRest')}>
          <Row label={translate('admin.resultsLabel')} count={translate('count.result', { count: results.length })} action={translate('common.delete')}
            aria={translate('admin.deleteResults')} disabled={results.length === 0}
            onClick={() => ask({
              title: translate('admin.deleteResultsTitle'),
              message: translate('admin.deleteResultsText', { count: translate('count.result', { count: results.length }) }),
              run: deleteAllResults,
            })} />
          <Row label={translate('admin.trainingsOf', { name: club?.name ?? translate('admin.thisClub') })} count={translate('count.session', { count: sessions.length })} action={translate('common.delete')}
            aria={translate('admin.deleteTrainings')} disabled={sessions.length === 0}
            onClick={() => ask({
              title: translate('admin.deleteTrainingsTitle'),
              message: translate('admin.deleteTrainingsText', { count: translate('count.session', { count: sessions.length }), name: club?.name ?? translate('admin.thisClub') }),
              run: () => deleteTrainingsOfClub(clubId),
            })} />
          <Row label={translate('admin.playsOf', { name: club?.name ?? translate('admin.thisClub') })} count={translate('count.play', { count: plays.length })} action={translate('common.delete')}
            aria={translate('admin.deletePlays')} disabled={plays.length === 0}
            onClick={() => ask({
              title: translate('admin.deletePlaysTitle'),
              message: translate('admin.deletePlaysText', { count: translate('count.play', { count: plays.length }), name: club?.name ?? translate('admin.thisClub') }),
              run: () => deletePlaysOfClub(clubId),
            })} />
        </Block>

        {/* The reset set apart, and behind copying out the club's name: a single click
            is not equal to an action that empties the whole device. */}
        <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accentBd}` }}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.accent }}>{translate('admin.eraseEverything')}</p>
          <p className="mb-3 text-[13px]" style={{ color: C.muted }}>
            {translate('admin.resetHint')}
          </p>
          <Row
            label={translate('admin.allTheData')}
            count={`${translate('count.team', { count: teams.length })} · ${translate('count.game', { count: matches.length })} · ${translate('count.result', { count: results.length })} · ${translate('count.session', { count: trainings.length })}`}
            action={translate('admin.eraseEverything')} aria={translate('admin.eraseEverything')} disabled={teams.length === 0 && matches.length === 0}
            onClick={() => ask({
              title: translate('admin.eraseEverythingTitle'),
              message: translate('admin.eraseEverythingText', { teams: translate('count.team', { count: teams.length }), games: translate('count.game', { count: matches.length }), results: translate('count.result', { count: results.length }), sessions: translate('count.session', { count: trainings.length }) }),
              // The club's name, copied out exactly. The fallback never fires inside
              // the shell (the club is resolved): it is there so that no path lets the
              // reset be confirmed with a single click.
              expectedInput: club?.name || 'EFFACER',
              run: async () => {
                await wipeAll()
                // The followed club goes with its data: without this forgetting, the
                // device would stay pinned to a ghost club (cf. the team record).
                clear()
                navigate('/')
              },
            })} />
        </section>
      </div>

      <ConfirmDialog
        open={!!pending} danger
        title={pending?.title ?? ''} message={pending?.message}
        expectedInput={pending?.expectedInput}
        confirmLabel={translate('admin.deleteForGood')}
        onConfirm={confirm} onClose={() => setPending(null)}
      />
    </div>
  )
}

function Block({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{title}</p>
      {help && <p className="mb-3 text-[13px]" style={{ color: C.muted }}>{help}</p>}
      <ul className="space-y-1.5">{children}</ul>
    </section>
  )
}

/** One operation: what it targets, what it destroys (counted), and its button. The
 *  count is always shown, including at zero — it is what explains why the button is
 *  dark. */
function Row({ label, count, action, aria, disabled, onClick }: {
  label: string; count: string; action: string; aria: string; disabled: boolean; onClick: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: C.panel }}>
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{label}</span>
      <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: C.muted }}>{count}</span>
      <button
        onClick={onClick} disabled={disabled} aria-label={aria}
        className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
        style={{ border: `1px solid ${C.accentBd}`, color: C.accent }}
      >
        {action}
      </button>
    </li>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <li className="py-2 text-sm" style={{ color: C.muted }}>{children}</li>
}
