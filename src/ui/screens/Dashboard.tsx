import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { deleteMessage, saveMessage } from '../../persistence/repositories'
import { useConvocation, useMatches, useMessage, usePlayers, usePlays, useTeamsById, useTrainings } from '../../persistence/queries'
import { teamMatches, teamRecord, teamScorers } from '../../domain/teamRecord'
import { shootingPct, shotsOf } from '../../domain/shotchart'
import { since, nextFixture, type Fixture } from '../../domain/fixtures'
import { liveState } from '../../rules/ffbb'
import { ShotChart } from '../components/ShotCourt'
import { C, Panel, TeamBadge, You, bd, displayClock, fmtDate } from '../olive/kit'
import type { Convocation, Match, Player, Team } from '../../domain/types'
import type { Play } from '../../domain/plays'
import { Check } from 'lucide-react'
import { useLang, useT } from '../../i18n'

export function Dashboard() {
  const translate = useT()
  const { clubId, club } = useClub()
  const { can, playerId } = useAuth()
  // The dashboard reads in full; only the shortcuts that lead to a write (planning,
  // calling up) are reserved for whoever manages the club.
  const manages = can('manage')
  const { data: matches } = useMatches()
  const { data: teams = {} } = useTeamsById()
  const { data: players } = usePlayers(clubId)
  const { data: trainings } = useTrainings()
  const { data: plays } = usePlays(clubId)
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)

  // Derived values placed before the early returns below, so that the effect that
  // follows (loading the call-up) obeys the rules of hooks: always called, in the same
  // order, on every render.
  const mine = (matches ?? []).filter((m) => m.meta.clubId === clubId)
  const live = mine.find((m) => m.status === 'live')
  const ourTrainings = (trainings ?? []).filter((t) => t.clubId === clubId)
  // A live game already occupies the banner below: the "next fixture" block must then
  // announce the one after, not repeat the one already shown. Filtered on status, not
  // on `live`'s identity: nothing prevents two `live` games at once (a second started
  // without finishing the first), and each must stay out of the upcoming fixtures.
  const matchesOnDate = mine.filter((m) => m.status !== 'live')
  const fixture = nextFixture(matchesOnDate, ourTrainings, new Date())
  const fixtureMatchId = fixture?.kind === 'match' ? fixture.match.id : null

  /* The call-up depends on which fixture is next, which depends on the games — so it
     is a second query keyed on that id, not a second effect. `enabled` is what says
     "there is no fixture yet"; before, the effect had to null the previous call-up by
     hand, and a fixture changing while its read was in flight put the wrong one back. */
  const { data: convocation } = useConvocation(fixtureMatchId)

  if (!clubId || !club) return null
  /**
   * The skeleton waits for the four lists that decide the **layout**, not just for the
   * games.
   *
   * Five independent queries settle one by one, and this screen composes them into a
   * single arrangement: the getting-started block, the banner and the next fixture all
   * depend on more than one of them. Drawing on the first to arrive made the block
   * rewrite itself two or three times — "Add your players" becoming "Your squad — 1
   * player" a frame later, the banner appearing and pushing everything down. The old
   * version had the same property by accident, awaiting all five in one `Promise.all`;
   * here it is stated.
   *
   * The message and the call-up are deliberately **not** in this list. Each lives
   * inside its own block and can arrive late without moving anything above it.
   */
  if (!matches || !players || !trainings || !plays) {
    return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  }

  // Derived from the same fixture as the block below (`fixture`), which already
  // excludes the past and finished games: without that sharing, a game planned and
  // never played would announce "Next game" here while the block says "Nothing
  // planned", a few pixels apart.
  const next = fixture?.kind === 'match' ? fixture.match : undefined
  // `teamRecord`/`teamMatches` can also read from the opposition's side (legitimate on
  // an opposing team's record): on this dashboard only `mine` counts, otherwise a club
  // that is merely a game's `opponentId` would pick up the record of "our" meetings
  // with it.
  const rec = teamRecord(clubId, mine)
  const lines = teamMatches(clubId, mine).filter((l) => l.result)
  const diff = rec.pointsFor - rec.pointsAgainst
  /* Three states and not two. The season's figures only exist after a game has been
     **played**; the getting-started block only applies to a club with no game **at
     all**. Between the two — a game planned, not yet played — neither shows, and that
     is right: the "next fixture" block above already says everything there is to say at
     that moment. */
  const hasPlayed = rec.played > 0
  const settingUp = mine.length === 0
  /* The banner and the fixture block stay silent during setup, otherwise the screen
     invited people **three times** to plan a game: "No game scheduled · Plan", "Nothing
     planned · Plan", and the third step of the block below. Repeating the same way out
     three times does not make it clearer, and the first two walk straight into a wall —
     with no opposition recorded, `/match/new` has nothing to offer. The getting-started
     block, for its part, knows the order.
     The condition tests `fixture`, which also covers sessions: a club with no game but
     a training in the calendar does have something to announce. */
  const onlySettingUp = settingUp && !fixture
  const otherTeams = Object.keys(teams).filter((id) => id !== clubId).length

  const rosterIds = players.map((p) => p.id)
  const clubShots = rosterIds.flatMap((id) => shotsOf(matches, id))
  const scorers = [...teamScorers(clubId, matches).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const shownShots = openPlayer ? shotsOf(matches, openPlayer) : clubShots
  // Resolved against the roster rather than taken as is: an id matching nobody (a
  // removed player) must behave like an absence of identity, with no shortcut to a
  // vanished record and no highlighted row.
  const me = players.find((p) => p.id === playerId) ?? null

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center gap-3">
          <TeamBadge id={club.id} name={club.name} size="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{club.name}</h1>
            <p className="text-sm" style={{ color: C.muted }}>
              {rec.played ? translate('dashboard.gamesPlayed', { count: rec.played }) : translate('dashboard.noGamePlayed')}
            </p>
          </div>
          {me && (
            <Link to={`/players/${me.id}`} className="ml-auto shrink-0 rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>
              {translate('dashboard.myRecord')}
            </Link>
          )}
        </div>

        <CoachMessage clubId={clubId} />

        {!onlySettingUp && (
          <>
            <Banner live={live} next={next} teams={teams} manages={manages} keepsScore={can('score')} />
            <NextFixture fixture={fixture} teams={teams} players={players} convocation={convocation ?? null} plays={plays} manages={manages} />
          </>
        )}

        {/* Nothing played: the season's figures have nothing to say, and six empty
            blocks are worth less than one block that points to what comes next. That was
            the arrival state of the volunteer who has just entered their team — four
            tiles reading "—", a form strip reading "—", two empty panels, and not one
            button. */}
        {hasPlayed ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={translate('dashboard.record')} value={`${rec.wins}V – ${rec.losses}D`} hint={translate('common.game', { count: rec.played })} accent={rec.wins >= rec.losses ? C.green : C.accent} />
              <Stat label={translate('dashboard.pointsFor')} value={String(rec.avgFor)} hint={translate('dashboard.perGame')} />
              <Stat label={translate('dashboard.pointsAgainst')} value={String(rec.avgAgainst)} hint={translate('dashboard.perGame')} />
              <Stat label={translate('dashboard.differential')} value={diff > 0 ? `+${diff}` : String(diff)} hint={translate('dashboard.overTheSeason')} accent={diff > 0 ? C.green : diff < 0 ? C.danger : undefined} />
            </div>

            {lines.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('dashboard.form')}</span>
                {lines.slice(0, 5).map((l) => (
                  <span key={l.match.id} className="grid h-6 w-6 place-items-center rounded-md text-[12px] font-black"
                    style={{ background: l.result === 'V' ? C.greenBg : C.dangerBg, color: l.result === 'V' ? C.green : C.danger }}>
                    {l.result}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : settingUp ? (
          <GettingStarted roster={players.length} otherTeams={otherTeams} clubId={clubId} manages={manages} />
        ) : null}

        <div className={`${hasPlayed ? 'mt-6' : 'mt-5'} grid gap-5 lg:grid-cols-[1fr_420px] [&>*]:min-w-0`}>
          {hasPlayed && <Panel title={translate('dashboard.topScorers')}>
            {scorers.length === 0 ? (
              <Empty>{translate('dashboard.noPointsYet')}</Empty>
            ) : (
              <ul className="space-y-1.5">
                {scorers.map(([pid, pts], i) => {
                  const p = byId[pid]
                  const pct = shootingPct(shotsOf(matches, pid)).fg
                  const isMe = pid === me?.id
                  return (
                    <li key={pid}>
                      <Link to={`/players/${pid}`} className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-[var(--c-hover)]"
                        style={isMe ? { background: C.accentBg, border: `1px solid ${C.accentBd}` } : { background: C.panel }}>
                        <span className="w-4 text-center text-sm font-black" style={{ color: i === 0 ? C.accent : C.faint }}>{i + 1}</span>
                        <span className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p?.number ?? '?'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{p ? `${p.lastName} ${p.firstName}` : translate('common.playerWord')}</span>
                        {isMe && <You />}
                        {/* An explicit title: this percentage only covers located shots,
                            whereas the points right next to it count everything (free
                            throws included) — cf. PlayerDetail. */}
                        <span className="text-[12px] font-semibold" style={{ color: C.muted }} title={translate('dashboard.shootingPct')}>{pct === null ? '—' : `${pct} %`}</span>
                        <span className="w-14 text-right text-sm font-black tabular-nums">{pts} pts</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>}

          {/* The shot chart only shows when there are shots: empty, it is a court drawn
              for nothing, and it does not say what to do. */}
          {hasPlayed && <Panel title={openPlayer ? translate('dashboard.playerHotZone', { name: byId[openPlayer]?.lastName ?? translate('dashboard.player') }) : translate('dashboard.teamHotZone')}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Chip active={!openPlayer} onClick={() => setOpenPlayer(null)}>{translate('dashboard.team')}</Chip>
              {players.map((p) => (
                <Chip key={p.id} active={openPlayer === p.id} onClick={() => setOpenPlayer(p.id)}>{p.number}</Chip>
              ))}
            </div>
            {shownShots.length === 0 ? <Empty>{translate('dashboard.noShot')}</Empty> : <ShotChart shots={shownShots} minAttempts={openPlayer ? 1 : 3} />}
          </Panel>}
        </div>
      </div>
    </div>
  )
}

/** Past two weeks, a message no longer informs: it lingers. The age badge then turns
 *  amber — the same colour code as "upcoming" elsewhere, here to say "this is
 *  old". */
const STALE_MS = 14 * 24 * 3600_000

/**
 * The coach's message to the team, at the top of the dashboard — the screen everyone
 * opens, players included. One message at a time: writing a new one replaces the
 * previous (cf. `saveMessage`). This is not a messaging system: no thread, no reply,
 * no recipient.
 *
 * Reading is ungated, like everything else: it is a message for the team, including
 * for a player with no write right. Writing, editing and erasing belong to
 * administration: their buttons only show for it, and the guard stays behind them.
 */
function CoachMessage({ clubId }: { clubId: string }) {
  const translate = useT()
  const { lang } = useLang()
  const { can, guard } = useAuth()
  const manages = can('manage')
  const { data: message } = useMessage(clubId)
  const [formOpen, setFormOpen] = useState(false)
  const [text, setText] = useState('')


  // Whitespace is not a message: it does not occupy the dashboard, and nothing is
  // published while the field holds only spaces.
  const shown = message && message.text.trim() ? message : null

  const openForm = () => guard('manage', () => { setText(shown?.text ?? ''); setFormOpen(true) })
  const publish = () => guard('manage', async () => {
    const written = { clubId, text: text.trim(), writtenAt: new Date().toISOString() }
    await saveMessage(written)
    setFormOpen(false)
  })
  const erase = () => guard('manage', async () => {
    await deleteMessage(clubId)
    setFormOpen(false)
  })

  // An entry form appears on a click, never up front: the dashboard is what people
  // come to read, writing to the team is the exception.
  if (formOpen) {
    return (
      <section className="mb-5 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accentBd}` }}>
        <div className="mb-3 flex items-center gap-3">
          <label htmlFor="message-team" className="text-xs font-bold uppercase tracking-wide" style={{ color: C.accent }}>{translate('dashboard.teamMessage')}</label>
          <button onClick={() => setFormOpen(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>{translate('common.closeShort')}</button>
        </div>
        <textarea id="message-team" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={translate('dashboard.messagePlaceholder')}
          className="w-full rounded-[10px] p-3 text-sm" style={{ background: C.panel, border: bd, color: C.text }} />
        <button onClick={publish} disabled={!text.trim()} className="mt-3 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40" style={{ background: C.brand }}>
          {translate('dashboard.publishMessage')}
        </button>
        {/* Like the call-ups, the trainings and the plays: worded the same way, so as
            not to suggest two different limits. */}
      </section>
    )
  }

  // No message and no right to write one: nothing to show, rather than a button that
  // would demand a code.
  if (!shown) {
    if (!manages) return null
    return (
      <button onClick={openForm} className="mb-5 rounded-xl px-3 py-1.5 text-[12px] font-bold" style={{ border: bd, color: C.muted }}>
        {translate('dashboard.addMessage')}
      </button>
    )
  }

  const forgotten = Date.now() - Date.parse(shown.writtenAt) > STALE_MS
  return (
    <section data-testid="team-message" className="mb-5 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${forgotten ? C.amberBd : C.accentBd}` }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('dashboard.teamMessage')}</span>
        <span className="rounded-md px-2 py-0.5 text-[12px] font-black"
          style={forgotten ? { background: C.amberBg, color: C.amber } : { background: C.accentBg, color: C.accent }}>
          {since(shown.writtenAt, lang) ?? translate('common.justNow')}
        </span>
        {manages && (
          <>
            <button onClick={openForm} className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ border: bd, color: C.muted }}>{translate('common.editCaps')}</button>
            <button onClick={erase} className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ border: bd, color: C.accent }}>{translate('common.erase')}</button>
          </>
        )}
      </div>
      {/* `whitespace-pre-wrap`: two instructions on two lines stay on two lines. */}
      <p className="whitespace-pre-wrap text-[15px] font-semibold">{shown.text}</p>
    </section>
  )
}

// `live` and `next` both come from `mine`, already filtered on
// `meta.clubId === clubId`: our club is therefore always side A.
function Banner({ live, next, teams, manages, keepsScore }: { live?: Match; next?: Match; teams: Record<string, Team>; manages: boolean; keepsScore: boolean }) {
  const translate = useT()
  const opponent = (m: Match) => teams[m.meta.opponentId]?.name ?? translate('dashboard.opponent')
  if (live) {
    const ls = liveState(live)
    const dc = displayClock(live)
    const mine = ls.score.a
    const opp = ls.score.b
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.accentBd}` }}>
        <span className="rounded-md px-2 py-0.5 text-[12px] font-black uppercase" style={{ background: C.greenFill, color: C.onGreen }}>{translate('dashboard.live')}</span>
        <span className="nums text-3xl font-black tabular-nums">{mine} – {opp}</span>
        <span className="text-sm font-bold" style={{ color: C.muted }}>{translate('dashboard.versus', { team: opponent(live) })}</span>
        <span className="nums text-sm font-bold" style={{ color: C.faint }}>{dc.label} · {dc.clock}</span>
        {/* One button, two destinations: whoever keeps the score opens the table,
            everyone else opens the follow-along view. Nobody is taken there without
            asking — the banner already says what is happening, and the button is
            what says "show me". */}
        {keepsScore ? (
          <Link to={`/match/${live.id}/live`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
            {translate('dashboard.openScorersTable')}
          </Link>
        ) : (
          <Link to={`/match/${live.id}/watch`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
            {translate('gate.spectatorView')}
          </Link>
        )}
      </div>
    )
  }
  if (next) {
    const f = fmtDate(next.meta.date)
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('dashboard.nextGame')}</span>
        <span className="text-sm font-bold">{translate('dashboard.versus', { team: opponent(next) })}</span>
        <span className="text-sm" style={{ color: C.muted }}>{[f.long, next.meta.time, next.meta.venue].filter(Boolean).join(' · ')}</span>
        <Link to={`/match/${next.id}`} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: bd, color: C.text }}>{translate('dashboard.viewRecord')}</Link>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <span className="text-sm" style={{ color: C.muted }}>{translate('dashboard.noGameScheduled')}</span>
      {/* Planning writes: the shortcut only shows to whoever manages the club. */}
      {manages && <Link to="/match/new" className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('dashboard.planGame')}</Link>}
    </div>
  )
}

/** The "next fixture" block: game or training, call-up included. `fixture` already
 *  excludes the live game (see the computation in `Dashboard`), so this component
 *  never has to worry about it — it simply shows what it is given. */
function NextFixture({ fixture, teams, players, convocation, plays, manages }: { fixture: Fixture | null; teams: Record<string, Team>; players: Player[]; convocation: Convocation | null; plays: Play[]; manages: boolean }) {
  const translate = useT()
  if (!fixture) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('dashboard.nextFixture')}</span>
        <span className="text-sm" style={{ color: C.muted }}>{translate('dashboard.nothingPlanned')}</span>
        {manages && <Link to="/calendrier" className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('dashboard.plan')}</Link>}
      </div>
    )
  }

  if (fixture.kind === 'training') {
    const t = fixture.training
    const f = fmtDate(t.date)
    // Resolved against the library rather than taken as is: an id matching no play
    // (deleted since) would only open an empty viewer.
    const upcoming = plays.filter((s) => t.playIds?.includes(s.id))
    return (
      <div className="mt-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('dashboard.nextFixture')}</span>
        <p className="mt-1 text-sm font-bold">{translate('dashboard.training')}</p>
        <p className="text-sm" style={{ color: C.muted }}>{[f.long, t.time, t.place].filter(Boolean).join(' · ') || '—'}</p>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>{translate('dashboard.sessionFocus', { theme: t.theme ?? '—' })}</p>
        {upcoming.length > 0 && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: C.border }}>
            {/* The shortest path between "it is Tuesday" and "here is what we are
                working on": each scheduled play opens its viewer directly. */}
            <p className="text-sm font-bold">{translate('dashboard.onTheProgramme')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {upcoming.map((s) => (
                <Link key={s.id} to={`/schemas/${s.id}/lecteur`} className="rounded-lg px-2.5 py-1 text-[12px] font-bold"
                  style={{ background: C.accentBg, color: C.accent }}>
                  ▶ {s.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const m = fixture.match
  const f = fmtDate(m.meta.date)
  const opponent = teams[m.meta.opponentId]?.name ?? translate('match.opponent')
  const calledUp = (convocation?.playerIds ?? [])
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p)
  const meetingPoint = [convocation?.meetTime, convocation?.meetPlace].filter(Boolean).join(' · ')

  return (
    <div className="mt-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('dashboard.nextFixture')}</span>
      <p className="mt-1 text-sm font-bold">{translate('dashboard.versus', { team: opponent })}</p>
      <p className="text-sm" style={{ color: C.muted }}>{[f.long, m.meta.time, m.meta.venue].filter(Boolean).join(' · ') || '—'}</p>
      {/* The call-up lives on the game's record, where it belongs — but this is where
          people look at it. The link goes straight there, to the anchor: without it,
          nothing anywhere said where calling up happens. The count is judged on the
          called-up players kept, not on the record's existence: a call-up emptied of
          its players is an absence of called-up players, and that is precisely the
          moment when action is wanted. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3" style={{ borderColor: C.border }}>
        {/* `min-w-[180px]`: on a phone, rather than crushing "Nobody is called up" onto
            three lines beside the button, the row breaks in two. */}
        <div className="min-w-[180px] flex-1">
          {calledUp.length === 0 ? (
            <p className="text-sm font-bold" style={{ color: C.amber }}>{translate('dashboard.nobodyCalledUp')}</p>
          ) : (
            <>
              <p className="text-sm font-bold">{translate('count.calledUp', { count: calledUp.length })}</p>
              {meetingPoint && <p className="mt-0.5 text-sm" style={{ color: C.muted }}>{translate('preview.meetingPoint', { detail: meetingPoint })}</p>}
              <p className="mt-1 text-sm" style={{ color: C.muted }}>{calledUp.map((p) => `${p.lastName} ${p.firstName}`).join(', ')}</p>
            </>
          )}
        </div>
        {/* Calling up writes: the shortcut is the coach's. The count and the names just
            to the left stay readable by the whole team. */}
        {manages && (
          <Link to={`/match/${m.id}#convocation`} className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold"
            style={calledUp.length === 0 ? { background: C.brand, color: C.onBrand } : { border: bd, color: C.text }}>
            {calledUp.length === 0 ? translate('dashboard.callUpTeam') : translate('dashboard.editCallUp')}
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * Getting started, for a club with no game yet.
 *
 * What it replaces: four statistic tiles reading "—", a form strip reading "—", and
 * two panels announcing there is neither a scorer nor a shot. Six blocks to say the
 * same thing six times — that nothing has begun — and not a single button. The
 * volunteer who had just entered their roster arrived there with nothing to click.
 *
 * Three positions taken.
 *
 * One block, and an ordered list. Three cards of equal size would have repeated the
 * structure just removed, and the order here carries a real constraint: you do not
 * plan a game without an opposition recorded. The numbers are therefore earned, they
 * do not decorate an arbitrary sequence.
 *
 * Each step's state is **read from the data**, never remembered. Nothing to store,
 * nothing to reset, and the block disappears by itself with the first game created —
 * with no "do not show again" button, because there is nothing to dismiss.
 *
 * The roster is the first milestone and it announces itself as reached: that is the
 * moment the application stops being empty and starts describing a real team. The
 * five players are not a requirement of the application — `StartingFiveGate` can
 * start with fewer — but you do not put five players on the court with four.
 */
function GettingStarted({ roster, otherTeams, clubId, manages }: { roster: number; otherTeams: number; clubId: string; manages: boolean }) {
  const translate = useT()
  const steps = [
    {
      done: roster >= 5,
      title: roster === 0 ? translate('start.rosterEmpty') : translate('start.roster', { n: translate('common.player', { count: roster }) }),
      detail: roster >= 5 ? translate('start.rosterReady') : translate('start.rosterIncomplete'),
      to: `/teams/${clubId}`,
      action: translate('start.complete'),
    },
    {
      done: otherTeams > 0,
      title: translate('start.opponentTitle'),
      detail: translate('start.opponentDetail'),
      to: '/teams/new',
      action: translate('start.newTeam'),
    },
    {
      done: false,
      title: translate('start.gameTitle'),
      detail: translate('start.gameDetail'),
      to: '/match/new',
      action: translate('start.newGame'),
    },
  ]
  const current = steps.findIndex((e) => !e.done)

  return (
    <section className="mt-5 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <h2 className="text-base font-extrabold tracking-tight">
        {roster >= 5 ? translate('start.titleReady') : translate('start.title')}
      </h2>
      <p className="mt-1 text-[13px]" style={{ color: C.muted }}>
        {manages
          ? translate('start.subtitleManager')
          : translate('start.subtitleVisitor')}
      </p>

      <ol className="mt-4 space-y-2">
        {steps.map((e, i) => (
          /* Stacked below `sm`, in a row above it. In a row at every width, the button
             reserved its room and the text let itself be squeezed to a word per line:
             "Record an opposition" ran to three lines and its explanation to ten. A
             button that gives nothing up has no place beside text at three hundred and
             seventy-five pixels. */
          <li key={e.title} className="flex flex-col gap-2.5 rounded-xl px-3 py-3 sm:flex-row sm:items-center sm:gap-3" style={{ background: C.panel }}>
            <span className="flex min-w-0 items-start gap-3 sm:items-center">
              {/* The step marker: a tick for what is done, the number otherwise. A "✓"
                  character would have stood in for an icon — it matches neither the
                  weight nor the stroke of the rest, and depends on the installed
                  font. */}
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black sm:mt-0"
                style={e.done
                  ? { background: C.greenFill, color: C.onGreen }
                  : i === current ? { background: C.brand, color: C.onBrand } : { background: C.neutralBg, color: C.faint }}>
                {e.done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold" style={{ color: e.done ? C.muted : C.text }}>{e.title}</span>
                <span className="block text-[12px]" style={{ color: C.faint }}>{e.detail}</span>
              </span>
            </span>
            {/* The action only shows on the current step: three buttons at once would
                let someone pick an order that does not work. */}
            {manages && i === current && (
              <Link to={e.to} className="shrink-0 rounded-xl px-3.5 py-2.5 text-center text-[13px] font-bold text-[var(--c-on-brand)] sm:ml-auto" style={{ background: C.brand }}>
                {e.action} →
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
    </div>
  )
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg px-2.5 py-1 text-[12px] font-bold transition"
      style={active ? { background: C.brand, color: C.onBrand } : { background: C.card2, color: C.muted, border: bd }}>
      {children}
    </button>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
