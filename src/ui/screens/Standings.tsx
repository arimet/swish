import { useEffect, useMemo, useState } from 'react'
import { newId } from '../../domain/ids'
import { standings, fixtureKey } from '../../domain/standings'
import { FRIENDLY } from '../../domain/ids'
import { listMatches, listResults, saveResult, deleteResult } from '../../persistence/repositories'
import { remoteEnabled } from '../../persistence/remote'
import type { Match, ReportedResult } from '../../domain/types'
import { C, bd, leagueLabel, SectionTitle, TeamBadge } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'
import { X } from 'lucide-react'

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

/**
 * One team of an entered result: crest, name, score on the right.
 *
 * The score is a field for whoever corrects, a number for everyone else, and it takes
 * the same width in both cases — otherwise the score column would dance according to
 * the role of whoever is looking. The winner is in full ink, the loser in grey: that
 * is what the kit's game card already does, and it reads without counting.
 */
function TeamRow({ id, name, score, won, fieldId, editable, onScore }: {
  id: string; name: string; score: number; won: boolean
  fieldId: string; editable: boolean; onScore: (n: number) => void
}) {
  const translate = useT()
  return (
    <div className="flex items-center gap-2">
      <TeamBadge id={id} name={name} size="h-6 w-6 text-[12px]" />
      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: won ? C.text : C.muted, fontWeight: won ? 800 : 600 }}>{name}</span>
      {editable ? (
        <>
          <label htmlFor={fieldId} className="sr-only">{translate('standings.scoreOf', { name })}</label>
          <input
            id={fieldId} type="number" min={0} defaultValue={score}
            style={{ ...field, width: 64, height: 34 }} className="nums shrink-0 text-center text-sm"
            onBlur={(e) => {
              // A cleared field is not an entry of 0: it is the first gesture of someone
              // correcting a typo. `Number('')` is 0, not NaN — without this explicit
              // guard, a click elsewhere would silently record 0.
              if (e.target.value === '') { e.target.value = String(score); return }
              const n = Number(e.target.value)
              if (!Number.isNaN(n) && n >= 0 && n !== score) onScore(n)
            }}
          />
        </>
      ) : (
        <span className="nums w-16 shrink-0 text-right text-sm font-black tabular-nums"
          style={{ color: won ? C.text : C.muted }}>{score}</span>
      )}
    </div>
  )
}

export function Standings() {
  const translate = useT()
  const { clubId, teams } = useClub()
  const { can, guard } = useAuth()
  /* `null` until the read has answered, and not `[]`.
   *
   * With an empty array as the initial value the screen cannot tell "I have not read
   * yet" from "there is nothing": it therefore showed "No standings to display" for a
   * frame before replacing it with the table. Fifteen milliseconds on this machine —
   * but that duration is the IndexedDB read, so it follows how slow the device is, and
   * a club's phone is not a development machine.
   *
   * The convention already existed in the repo (`MatchSetup`, `TeamsList`,
   * `SchemaList`, `Calendrier`, and `Dashboard` for its games); it was missing
   * here. */
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [results, setResults] = useState<ReportedResult[] | null>(null)
  const [error, setError] = useState('')

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])

  /** The entered results, grouped by league and sorted the way the standings are —
   *  the French way, so that "Écran" precedes "Remise". The league's name then appears
   *  once per group instead of once per row, where it was constant in the common case:
   *  a single pool. */
  const resultsByLeague = useMemo(() => {
    const map = new Map<string, ReportedResult[]>()
    for (const r of results ?? []) {
      const key = r.championshipLabel || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [results])
  // The league of our games is the form's default: most hand-entered results concern
  // the same pool as ours. With no game recorded, we fall back to the league of the
  // first result already entered rather than starting empty — otherwise entry would
  // open a second standings table under "Match amical" next to the one already
  // there.
  const ourLeague = useMemo(() => {
    const m = (matches ?? []).find((mm) => mm.meta.clubId === clubId)
    if (m) return leagueLabel(m.meta)
    return (results ?? [])[0]?.championshipLabel ?? ''
  }, [matches, clubId, results])

  const refresh = () => Promise.all([listMatches(), listResults()]).then(([m, r]) => { setMatches(m); setResults(r) })
  useEffect(() => { refresh() }, [])

  const groups = useMemo(() => standings(matches ?? [], results ?? [], teamsById), [matches, results, teamsById])

  // An entry form appears on a click, never up front: the standings are what people
  // come to read, entering an outside result is the exception.
  const [formOpen, setFormOpen] = useState(false)
  const [league, setLeague] = useState('')
  const [fieldTouched, setFieldTouched] = useState(false)
  const [homeId, setHomeId] = useState('')
  const [awayId, setAwayId] = useState('')
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [date, setDate] = useState('')
  // The form follows the league of our games as long as the user has not changed it by
  // hand — a `useState` frozen at mount would miss the games loaded after the first
  // render (they arrive asynchronously). An explicit flag is needed here: now that the
  // default can itself be non-empty (falling back to the league of the first result
  // entered), trusting an empty field as a "not yet touched" signal would reinstate the
  // default in the middle of a deliberate clearing.
  useEffect(() => { if (!fieldTouched) setLeague(ourLeague) }, [ourLeague, fieldTouched])
  useEffect(() => {
    if (!homeId && teams[0]) setHomeId(teams[0].id)
    if (!awayId && teams[1]) setAwayId(teams[1].id)
  }, [teams, homeId, awayId])

  // An error message that outlives the correction of the form would wrongly accuse an
  // entry that no longer poses a problem: it clears as soon as any field changes.
  const changeLeague = (v: string) => { setError(''); setLeague(v); setFieldTouched(true) }
  const changeHomeId = (v: string) => { setError(''); setHomeId(v) }
  const changeAwayId = (v: string) => { setError(''); setAwayId(v) }
  const changeHomeScore = (v: string) => { setError(''); setHomeScore(v) }
  const changeAwayScore = (v: string) => { setError(''); setAwayScore(v) }
  const changeDate = (v: string) => { setError(''); setDate(v) }

  // An informational signal, computed live during entry: the fixture being typed
  // already matches one of our finished games, and the standings will ignore it.
  const alreadyOurGame = useMemo(() => {
    if (!homeId || !awayId || homeId === awayId) return false
    const key = fixtureKey(league.trim() || FRIENDLY, homeId, awayId, date || undefined)
    return (matches ?? []).some((m) => m.status === 'finished' && fixtureKey(leagueLabel(m.meta), m.meta.clubId, m.meta.opponentId, m.meta.date) === key)
  }, [matches, league, homeId, awayId, date])

  const scoresValid = homeScore !== '' && awayScore !== '' && Number(homeScore) >= 0 && Number(awayScore) >= 0
  // The date is part of the fixture key (home/away): without it, the same game entered
  // twice — once dated, once blank — would produce two distinct keys and count twice in
  // the standings. So it is required from entry onwards.
  const canAdd = !!homeId && !!awayId && homeId !== awayId && scoresValid && !!date

  const add = () => {
    if (!canAdd) return
    // In basketball there is overtime: a draw does not exist.
    if (Number(homeScore) === Number(awayScore)) {
      setError(translate('standings.noDraws'))
      return
    }
    const leagueLabelValue = league.trim() || FRIENDLY
    const key = fixtureKey(leagueLabelValue, homeId, awayId, date)
    // Two entries of the same fixture — even in reverse order — would count twice in
    // the standings: nothing in the domain guards against it, so it must be prevented
    // here.
    if ((results ?? []).some((r) => fixtureKey(r.championshipLabel, r.homeId, r.awayId, r.date) === key)) {
      setError(translate('standings.alreadyEntered'))
      return
    }
    setError('')
    guard('manage', async () => {
      await saveResult({
        id: newId(), championshipLabel: leagueLabelValue, date,
        homeId, awayId, homeScore: Number(homeScore), awayScore: Number(awayScore),
      })
      setHomeScore(''); setAwayScore('')
      refresh()
    })
  }

  const setScore = (r: ReportedResult, patch: Partial<ReportedResult>) => guard('manage', async () => {
    await saveResult({ ...r, ...patch })
    refresh()
  })
  // Correcting a score is administrative: without the right, the result shows as plain
  // text rather than in a field. A field open to typing and then refused on submit
  // would leave on screen a value the database does not have (the fields are
  // uncontrolled, React does not reset a `defaultValue`), under standings that keep
  // counting the old one.
  const canCorrect = can('manage')
  const remove = (id: string) => guard('manage', async () => { await deleteResult(id); refresh() })

  return (
    <div className="p-6">
      {/* 1. The standings first: that is what the screen is opened to see. */}
      <div className="space-y-6">
        {results?.length === 0 && (
          <p className="max-w-[75ch] rounded-2xl border border-dashed px-4 py-3 text-sm" style={{ borderColor: C.border, color: C.muted }}>
            {translate('standings.noResult')}
          </p>
        )}
        {matches === null || results === null ? (
          <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
        ) : groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed py-10 text-center text-sm" style={{ borderColor: C.border, color: C.muted }}>{translate('standings.noTable')}</p>
        ) : groups.map(({ league: c, lines }) => (
          <section key={c} className="overflow-x-auto rounded-2xl p-4" style={{ background: C.card, border: bd }}>
            <SectionTitle className="mb-3">{c}</SectionTitle>
            <table className="w-full text-sm sm:min-w-[520px]">
              <thead>
                <tr className="text-left text-[12px] font-bold uppercase" style={{ color: C.faint }}>
                  <th className="py-1.5 pr-2">#</th><th className="pr-2">{translate('standings.team')}</th>
                  <th className="hidden px-2 text-center sm:table-cell">J</th><th className="px-2 text-center">V</th><th className="px-2 text-center">D</th>
                  <th className="hidden px-2 text-center sm:table-cell">{translate('standings.for')}</th><th className="hidden px-2 text-center sm:table-cell">{translate('standings.against')}</th><th className="px-2 text-center">{translate('standings.diff')}</th><th className="px-2 text-center">{translate('standings.pts')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} style={l.id === clubId ? { background: C.accentBg } : undefined}>
                    <td className="rounded-l-lg py-2 pr-2 font-bold" style={{ color: C.faint }}>{i + 1}</td>
                    <td className="w-full max-w-0 pr-2">
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <TeamBadge id={l.id} name={l.name} size="h-6 w-6 text-[12px]" />
                        <span className="truncate">{l.name}</span>
                      </span>
                    </td>
                    <td className="hidden px-2 text-center tabular-nums sm:table-cell">{l.played}</td>
                    <td className="px-2 text-center tabular-nums">{l.wins}</td>
                    <td className="px-2 text-center tabular-nums">{l.losses}</td>
                    <td className="hidden px-2 text-center tabular-nums sm:table-cell">{l.pointsFor}</td>
                    <td className="hidden px-2 text-center tabular-nums sm:table-cell">{l.pointsAgainst}</td>
                    {/* The table's only tinted column, besides the points: the sign of
                        the differential is what the eye hunts for when scanning the
                        grid, and one coloured column out of nine stands out — nine
                        coloured columns stand out no longer. */}
                    <td className="px-2 text-center font-semibold tabular-nums"
                      style={{ color: l.pointsFor - l.pointsAgainst > 0 ? C.green : l.pointsFor - l.pointsAgainst < 0 ? C.danger : C.faint }}>
                      {l.pointsFor - l.pointsAgainst > 0 ? `+${l.pointsFor - l.pointsAgainst}` : l.pointsFor - l.pointsAgainst}
                    </td>
                    <td className="rounded-r-lg px-2 text-center font-black tabular-nums" style={{ color: C.accent }}>{l.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      {/* 2. Entry, admin only, folded away behind its button — and the whole block
          disappears for anyone without the write right: an empty card with no button
          would say nothing. The guard stays both at the opening of the form and at
          save time.
          Folded, the button sits bare: a full-width card with five rems of padding
          around a single button elevated nothing, it just took the third of the screen
          left free under the standings. It comes back as soon as the form opens, where
          it groups six fields. */}
      {canCorrect && (
      <section className={formOpen ? 'mt-8 rounded-2xl p-5' : 'mt-6'} style={formOpen ? { background: C.card, border: bd } : undefined}>
        {!formOpen ? (
          <button onClick={() => guard('manage', () => setFormOpen(true))} className="rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
            {translate('standings.enterResult')}
          </button>
        ) : (
        <>
        <div className="mb-4 flex items-center gap-3">
          <SectionTitle>{translate('standings.enterTitle')}</SectionTitle>
          <button onClick={() => setFormOpen(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>{translate('common.closeShort')}</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker id="champ-home" label={translate('standings.homeTeam')} value={homeId} onChange={changeHomeId} teams={teams} />
          <Picker id="champ-away" label={translate('standings.awayTeam')} value={awayId} onChange={changeAwayId} teams={teams} />
          <Field id="champ-home-score" label={translate('standings.homeScore')} type="number" min={0} value={homeScore} onChange={changeHomeScore} />
          <Field id="champ-away-score" label={translate('standings.awayScore')} type="number" min={0} value={awayScore} onChange={changeAwayScore} />
          <Field id="champ-date" label={translate('standings.gameDate')} type="date" value={date} onChange={changeDate} />
          <Field id="champ-label" label={translate('standings.league')} value={league} onChange={changeLeague} />
        </div>

        {alreadyOurGame && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: C.amberBg, color: C.amber }}>
            {translate('standings.alreadyOurGame')}
          </p>
        )}
        {/* A refusal speaks in danger, not in the brand's colour: on an accent
            background the message looked like a highlight. */}
        {error && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: C.dangerBg, color: C.danger }}>{error}</p>
        )}

        <button onClick={add} disabled={!canAdd} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40" style={{ background: C.brand }}>
          {translate('standings.addResult')}
        </button>
        </>
        )}
      </section>
      )}

      {/* 3. The list of entered results. Everyone reads it; correcting and deleting
          stay with administration. */}
      <section className="mt-6 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <SectionTitle className="mb-3">{translate('standings.enteredResults')}</SectionTitle>
        {results === null ? (
          <div className="h-16 animate-pulse rounded-xl" style={{ background: C.panel }} />
        ) : results.length === 0 ? (
          <p className="py-4 text-center text-sm" style={{ color: C.muted }}>{translate('standings.nothingToShow')}</p>
        ) : (
          /* The results grouped by league, and the league's name written once per
             group — not once per row.
             It used to be: six rows carried "Pré régionale masculine · Poule A" six
             times, the common case being that a club enters the results of its single
             pool. It was the largest block of text on each row, for a constant piece of
             information, and it took a second row that carried the delete button with
             it — hence a ✕ floating under the game it erases. The group absorbs both
             problems: the name moves to the top, the row becomes a row again.
             A single group does not deserve a header: the section's title already says
             it, and the standings just above repeat it. */
          <div className="space-y-5">
            {resultsByLeague.map(([league, rows]) => (
              <div key={league}>
                {resultsByLeague.length > 1 && (
                  <p className="mb-1 text-[12px] font-bold" style={{ color: C.faint }}>{league || translate('common.noLeague')}</p>
                )}
                {/* Rules, not cards. Each row used to be a card laid inside the
                    section's card: two nested frames for a hierarchy that has only one
                    level, and six borders of noise. */}
                <ul className="divide-y" style={{ borderColor: C.border }}>
            {rows.map((r) => (
              /* One team per row, its score on the right — the idiom the kit's game
                 card already uses, and the only one that holds at every width. The game
                 used to be on a single row, the two names either side of the scores: on
                 a phone the two flexible columns had thirty pixels left, and `truncate`
                 reduced "BC BAR-LE-DUC" to "B". You could no longer tell who had played
                 whom — the opposite of what the list is there to read. Stacked, each
                 name has the full width minus its crest and its score. */
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <TeamRow
                    id={r.homeId} name={teamsById[r.homeId]?.name ?? '—'} score={r.homeScore}
                    won={r.homeScore > r.awayScore} fieldId={`score-home-${r.id}`}
                    editable={canCorrect} onScore={(n) => setScore(r, { homeScore: n })}
                  />
                  <TeamRow
                    id={r.awayId} name={teamsById[r.awayId]?.name ?? '—'} score={r.awayScore}
                    won={r.awayScore > r.homeScore} fieldId={`score-away-${r.id}`}
                    editable={canCorrect} onScore={(n) => setScore(r, { awayScore: n })}
                  />
                </div>
                {canCorrect && (
                  <button onClick={() => remove(r.id)} aria-label={translate('standings.deleteResult')}
                    className="shrink-0 rounded-lg p-1.5" style={{ color: C.danger }}>
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                )}
              </li>
            ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {/* Hand-entered results do not go through the synchronisation: without this
            note, someone opening the app on another device would find empty standings
            without understanding why. */}
        {!remoteEnabled() && <p className="mt-4 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{translate('standings.resultsLocal')}</p>}
      </section>
    </div>
  )
}

function Field({ id, label, value, onChange, type = 'text', min }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; min?: number }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} min={min} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field} />
    </div>
  )
}
function Picker({ id, label, value, onChange, teams }: { id: string; label: string; value: string; onChange: (id: string) => void; teams: { id: string; name: string }[] }) {
  const translate = useT()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field}>
        <option value="">{translate('standings.choose')}</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  )
}
