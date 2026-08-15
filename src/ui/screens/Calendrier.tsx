import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { listMatches, listPlays, listTeams, listTrainings, saveTraining, deleteTraining, toggleTrainingPlay } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import type { Match, Team, Training } from '../../domain/types'
import type { Play } from '../../domain/plays'
import { isoDay, nextFixture } from '../../domain/fixtures'
import { C, bd, Ic, ICON, MatchCard, PageTitle, fmtDate } from '../olive/kit'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useClub } from '../../app/club'
import { currentLang, useT } from '../../i18n'
import { remoteEnabled } from '../../persistence/remote'
import { useAuth } from '../../app/auth'
import { X } from 'lucide-react'

// A training is told from a game by a colour no other badge on this screen takes
// (green means win/live, amber means upcoming, the accent belongs to games): at a
// glance, blue can only mean a training session.
const TRAINING_INK = C.info
const TRAINING_BG = C.infoBg

// The month spelled out, in the application's language and not the browser's: a
// French calendar must say "août" on a machine set to English.
const longMonth = (d: Date) => new Intl.DateTimeFormat(currentLang(), { month: 'long' }).format(d)

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

type CalItem = { key: string; time: string } & ({ kind: 'match'; match: Match } | { kind: 'training'; training: Training })

export function Calendrier() {
  const translate = useT()
  const { clubId } = useClub()
  const { can, guard } = useAuth()
  // Planning belongs to the club: what writes it only shows for whoever manages it.
  const manages = can('manage')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [trainings, setTrainings] = useState<Training[] | null>(null)
  // The club's library: it is what says which plays still exist.
  const [schemas, setSchemas] = useState<Play[]>([])

  const refreshTrainings = () => listTrainings().then(setTrainings)

  useEffect(() => {
    let cancel = false
    refresh().then(() => Promise.all([listMatches(), listTeams(), listTrainings()])).then(([m, t, tr]) => {
      if (cancel) return
      setTeams(Object.fromEntries(t.map((x) => [x.id, x])))
      setMatches(m)
      setTrainings(tr)
    })
    return () => { cancel = true }
  }, [])

  // The plays follow the device's club, like the trainings below: a separate effect,
  // because the one above does not depend on `clubId`.
  useEffect(() => {
    if (!clubId) { setSchemas([]); return }
    let cancel = false
    listPlays(clubId).then((s) => { if (!cancel) setSchemas(s) })
    return () => { cancel = true }
  }, [clubId])

  const ourGames = useMemo(() => matches?.filter((m) => m.meta.clubId === clubId) ?? null, [matches, clubId])
  // Like the games: a device that changes club must keep in the calendar only that
  // club's trainings, not those left in memory by the previous one.
  const ourTrainings = useMemo(() => trainings?.filter((t) => t.clubId === clubId) ?? null, [trainings, clubId])

  // Games and trainings share the same groups by date: the calendar is there to be
  // read at a glance, not to make anyone walk two separate lists to reconstruct the
  // week.
  const groups = useMemo(() => {
    if (!ourGames || !ourTrainings) return []
    const map = new Map<string, CalItem[]>()
    const push = (k: string, item: CalItem) => { if (!map.has(k)) map.set(k, []); map.get(k)!.push(item) }
    // Trainings are pushed before games: the sort below is stable, so if insertion
    // order decided ties on time, it would have to coincide by accident with the rule we
    // want (the game comes first). By inserting them in the "wrong" order, it really is
    // the explicit tie-break that decides, not an accidental insertion order — same
    // dilemma, same remedy as `nextFixture` in `src/domain/fixtures.ts`.
    for (const t of ourTrainings) push(t.date ?? '—', { key: t.id, kind: 'training', training: t, time: t.time ?? '' })
    for (const m of ourGames) push(m.meta.date ?? '—', { key: m.id, kind: 'match', match: m, time: m.meta.time ?? '' })
    // At equal time the game comes before the training — it is the one that counts.
    for (const items of map.values())
      items.sort((a, b) => a.time.localeCompare(b.time) || (a.kind === b.kind ? 0 : a.kind === 'match' ? -1 : 1))
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [ourGames, ourTrainings])

  // The landmark that cuts the page in two: what precedes has been played, what
  // follows remains to be done. And the next fixture is the domain's — the same as on
  // the dashboard, so that there are not two rules for naming "what comes next".
  const today = isoDay(new Date())
  const next = useMemo(
    () => (ourGames && ourTrainings ? nextFixture(ourGames, ourTrainings, new Date()) : null),
    [ourGames, ourTrainings],
  )

  // An entry form appears on a click, never up front: the calendar is what people
  // come to read, planning a session is the exception.
  const [formOpen, setFormOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')
  const [theme, setTheme] = useState('')

  const add = () => {
    if (!date || !clubId) return
    guard('manage', async () => {
      await saveTraining({ id: newId(), clubId, date, time: time.trim() || undefined, place: place.trim() || undefined, theme: theme.trim() || undefined })
      setDate(''); setTime(''); setPlace(''); setTheme('')
      refreshTrainings()
    })
  }
  /* Deleting a session goes through a confirmation, like deleting a game, a play or a
     player. It was missing here: a click on the cross erased the session, with no way
     back. The message says what is **not** deleted — the attached plays live in the
     library, only the link disappears — because that is the question people ask with
     their hand on the cross. */
  const [toDelete, setToDelete] = useState<Training | null>(null)
  const remove = () => { const t = toDelete; if (!t) return
    guard('manage', async () => { await deleteTraining(t.id); setToDelete(null); refreshTrainings() }) }

  // Attaching a play to a session is administrative: guard first, write second. The
  // toggle itself is transactional (cf. `toggleTrainingPlay`), so that two boxes ticked
  // in quick succession do not erase each other.
  const togglePlay = (id: string, playId: string) => guard('manage', async () => {
    await toggleTrainingPlay(id, playId)
    refreshTrainings()
  })

  return (
    <div className="p-6">
      {/* The actions in the subtitle bar, like the playbook: a season is thousands of
          pixels of dates, and a button placed after them is never found. One filled
          button — the game, what gets planned most often; the session stays second,
          marked by its blue. */}
      <PageTitle
        action={manages && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => guard('manage', () => setFormOpen(true))}
              className="rounded-xl px-4 py-2.5 text-sm font-bold"
              style={{ background: TRAINING_BG, color: TRAINING_INK, border: `1px solid ${TRAINING_INK}55` }}>
              {translate('calendar.newTraining')}
            </button>
            <Link to="/match/new" className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
              {translate('calendar.newGame')}
            </Link>
          </div>
        )}
      />

      {formOpen && (
        <section className="mb-6 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${TRAINING_INK}44` }}>
          <div className="mb-4 flex items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: TRAINING_INK }}>{translate('calendar.trainingTitle')}</p>
            <button onClick={() => setFormOpen(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>{translate('common.closeShort')}</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="entr-date" label={translate('calendar.trainingDate')} type="date" value={date} onChange={setDate} />
            <Field id="entr-time" label={translate('match.time')} type="time" value={time} onChange={setTime} />
            <Field id="entr-place" label={translate('match.venue')} value={place} onChange={setPlace} />
            <Field id="entr-theme" label={translate('calendar.focus')} value={theme} onChange={setTheme} />
          </div>
          <button onClick={add} disabled={!date || !clubId} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: TRAINING_INK }}>
            {translate('calendar.addTraining')}
          </button>
        </section>
      )}

      {!ourGames || !ourTrainings ? (
        <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
      ) : groups.length === 0 ? (
        // The invitation to plan is addressed only to whoever can; everyone else
        // simply reads that nothing is scheduled.
        <div className="rounded-2xl py-16 text-center" style={{ border: `1px dashed ${C.border}` }}>
          <p className="text-sm font-bold">{translate('calendar.blankSeason')}</p>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>
            {manages
              ? translate('calendar.emptyManager')
              : translate('calendar.emptyVisitor')}
          </p>
        </div>
      ) : (
        // Two dates per row as soon as there is width: a season makes an endless column
        // on a desktop screen, where the room is beside and not below. On a phone, one
        // column, as before. The month bar takes the full width and therefore always
        // opens a new row.
        <div className="grid gap-x-8 gap-y-7 xl:grid-cols-2 [&>*]:min-w-0">
          {groups.map(([iso, items], i) => {
            const f = fmtDate(iso === '—' ? undefined : iso)
            const gameCount = items.filter((i) => i.kind === 'match').length
            const trainingCount = items.filter((i) => i.kind === 'training').length
            const summary = [
              gameCount ? translate('count.game', { count: gameCount }) : '',
              trainingCount ? translate('count.training', { count: trainingCount }) : '',
            ].filter(Boolean).join(' · ')
            // The past is faded rather than hidden: people want to walk back up the
            // season, but nothing already played should compete for the eye with what is
            // left to play.
            const past = iso !== '—' && iso < today
            const isToday = iso === today
            // The date carrying the next fixture, or today itself: the only two in the
            // calendar that deserve the accent.
            const featured = isToday || next?.date === iso
            const newMonth = i === 0 || groups[i - 1][0].slice(0, 7) !== iso.slice(0, 7)
            return (
              <Fragment key={iso}>
                {newMonth && <MonthBar iso={iso} />}
                {/* The past fades, but not to the point of becoming illegible.
                    `opacity-60` diluted the ink token's text down to 4.63:1 on the frame
                    — three per cent above the AA threshold, and 3.1:1 once the rendered
                    pixels are counted, antialiasing eating the rest. At 0.75 the same
                    text holds 8.1:1 and a day gone by is still recognised at first
                    glance. Hover restores it fully, as before. */}
                <section className={past ? 'opacity-75 transition-opacity hover:opacity-100' : undefined}>
                  <header className="mb-3 flex items-center gap-3">
                    {/* The date cartouche: weekday and day of the month, in large type.
                        The month is in the bar above, it need not be repeated. */}
                    <span className="grid h-14 w-14 shrink-0 place-content-center rounded-2xl text-center leading-none"
                      style={featured ? { background: C.accentBg, border: `1px solid ${C.accentBd}` } : { background: C.card2, border: bd }}>
                      <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: featured ? C.accent : C.faint }}>{f.wd || '—'}</span>
                      <span className="mt-1 text-xl font-black tabular-nums" style={{ color: featured ? C.accent : C.text }}>{f.day}</span>
                    </span>
                    <div className="min-w-0">
                      {featured && (
                        <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: C.accent }}>
                          {isToday ? translate('common.today') : translate('dashboard.nextFixture')}
                        </p>
                      )}
                      <p className="truncate text-sm font-extrabold">{summary}</p>
                    </div>
                    {/* The rule extends the header to the edge and closes the group; on a
                        phone the width is too precious to keep it. */}
                    <span className="hidden h-px flex-1 sm:block" style={{ background: C.border }} />
                  </header>
                  {/* `auto-fit` rather than a fixed number of columns: a date carrying a
                      single card spreads it across the group's full width, instead of
                      leaving half a column empty to its right. */}
                  <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                    {items.map((it) => it.kind === 'match'
                      ? <GameCard key={it.key} m={it.match} teams={teams} manages={manages} />
                      : <TrainingCard key={it.key} t={it.training} schemas={schemas} manages={manages}
                          onToggleSchema={(playId) => togglePlay(it.training.id, playId)}
                          onDelete={() => setToDelete(it.training)} />)}
                  </div>
                </section>
              </Fragment>
            )
          })}
        </div>
      )}

      {/* Like the call-ups and the outside results: worded the same way as on the
          standings screen and the game record, so as not to suggest two different limits
          — the decision covered the trainings just as much. */}
      {!remoteEnabled() && <p className="mt-8 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{translate('calendar.trainingsLocal')}</p>}

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove}
        title={translate('calendar.deleteSessionTitle')}
        message={toDelete
          ? translate('calendar.deleteSessionText', { date: fmtDate(toDelete.date).long || toDelete.date })
          : ''}
        confirmLabel={translate('common.delete')} danger />
    </div>
  )
}

/** A game's card and — while it is still upcoming — direct access to its call-up.
 *  The call-up stays on the game's record, where it belongs; what was missing is a
 *  path from where the coach is looking. The link sits BESIDE the card and not
 *  inside it: `MatchCard` is itself a link, and a link inside a link is not valid
 *  HTML. */
function GameCard({ m, teams, manages }: { m: Match; teams: Record<string, Team>; manages: boolean }) {
  const translate = useT()
  return (
    <div className="flex flex-col gap-1.5">
      <MatchCard m={m} teams={teams} />
      {/* Calling up writes: the shortcut is the coach's. The card leads to the game's
          record, where the call-up reads for everyone. */}
      {manages && m.status === 'setup' && (
        <Link to={`/match/${m.id}#convocation`} className="rounded-xl px-3 py-1.5 text-center text-[12px] font-bold"
          style={{ background: C.accentBg, color: C.accent }}>
          {translate('calendar.callUp')}
        </Link>
      )}
    </div>
  )
}

/** The month spelled out, across the grid: without it a season is only a run of day
 *  numbers, and you can no longer tell whether the 3rd follows the 30th by a day or
 *  by five weeks. */
function MonthBar({ iso }: { iso: string }) {
  const translate = useT()
  const d = new Date(iso + 'T00:00:00')
  const label = Number.isNaN(d.getTime()) ? translate('common.noDate') : `${longMonth(d)} ${d.getFullYear()}`
  return (
    <div className="flex items-center gap-3 xl:col-span-2">
      <h2 className="text-[12px] font-black uppercase tracking-[0.18em]" style={{ color: C.muted }}>{label}</h2>
      <span className="h-px flex-1" style={{ background: C.border }} />
    </div>
  )
}

function Field({ id, label, value, onChange, type = 'text' }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field} />
    </div>
  )
}

/** A training card: the same template as `MatchCard` so it mixes into the grid, but
 *  a blue silhouette rail — where the game shows two crests and its "VS" — tells it
 *  apart without a single word being read. It unfolds onto the plays worked on
 *  there — the same checkboxes as a game's call-up, for whoever can tick them.
 *  Everyone else reads the session's programme without being able to change it: that
 *  is what interests them. */
function TrainingCard({ t, schemas, manages, onToggleSchema, onDelete }: { t: Training; schemas: Play[]; manages: boolean; onToggleSchema: (playId: string) => void; onDelete: () => void }) {
  const translate = useT()
  // The count shown is of the plays that exist: a training may cite a deleted play (a
  // store predating `deletePlay`'s cascade), and counting it would make the row lie —
  // the same fault fixed earlier on call-ups and their removed players.
  const attached = schemas.filter((s) => t.playIds?.includes(s.id))
  return (
    <div className="flex gap-3 rounded-2xl p-3" style={{ background: C.card, border: `1px solid ${TRAINING_INK}55` }}>
      <div className="flex w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: TRAINING_BG }}>
        <Ic d={ICON.users} className="h-6 w-6" style={{ color: TRAINING_INK }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md px-1.5 py-0.5 text-[12px] font-black uppercase" style={{ background: TRAINING_BG, color: TRAINING_INK }}>{translate('calendar.training')}</span>
          {t.time && <span className="ml-auto text-[12px] font-bold" style={{ color: C.muted }}>{t.time}</span>}
        </div>
        <p className="mt-2 truncate text-sm font-bold">{t.theme || translate('calendar.openSession')}</p>

        {/* `<details>` rather than local state: the browser already knows how to
            unfold, and twenty plays unfolded by default would drown the calendar. */}
        <details className="mt-2">
          <summary className="flex cursor-pointer items-center gap-2 text-[12px] font-bold" style={{ color: TRAINING_INK }}>
            {translate('calendar.playsWorkedOn')}
            {attached.length > 0 && (
              <span className="rounded-md px-1.5 py-0.5 font-black" style={{ background: TRAINING_BG, color: TRAINING_INK }}>
                {translate('calendar.playCount', { count: attached.length })}
              </span>
            )}
          </summary>
          {!manages ? (
            attached.length === 0 ? (
              <p className="mt-2 text-[12px]" style={{ color: C.faint }}>{translate('calendar.noPlayInSession')}</p>
            ) : (
              <div className="mt-2 grid gap-1.5">
                {attached.map((s) => (
                  <span key={s.id} className="truncate rounded-lg px-2 py-1.5 text-[12px] font-semibold" style={{ background: C.panel }}>{s.name}</span>
                ))}
              </div>
            )
          ) : schemas.length === 0 ? (
            <p className="mt-2 text-[12px]" style={{ color: C.faint }}>{translate('calendar.emptyLibrary')}</p>
          ) : (
            <div className="mt-2 grid gap-1.5">
              {schemas.map((s) => {
                const id = `schema-${t.id}-${s.id}`
                return (
                  <label key={s.id} htmlFor={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold" style={{ background: C.panel }}>
                    <input id={id} type="checkbox" checked={attached.some((a) => a.id === s.id)} onChange={() => onToggleSchema(s.id)} />
                    <span className="truncate">{s.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </details>

        <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-[12px] font-semibold" style={{ borderColor: C.border, color: C.faint }}>
          <span className="truncate">{t.place || '—'}</span>
          {/* `grid h-9 w-9` and not `px-1.5 py-0.5`: the target was 26 × 18, under the
              twenty-four-pixel minimum — and it is a **deletion**, the most unfortunate
              combination of a target you miss and a gesture you cannot undo. */}
          {manages && <button onClick={onDelete} aria-label={translate('calendar.deleteTraining')} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-black transition hover:bg-[var(--c-danger-bg)] hover:text-[var(--c-danger)]" style={{ color: C.accent }}><X className="h-4 w-4" strokeWidth={2.5} /></button>}
        </div>
      </div>
    </div>
  )
}
