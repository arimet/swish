import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShotPicker } from './ShotCourt'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { kindAt, ZONE_LABELS, zoneAt } from '../../domain/shotzones'
import type { Shot } from '../../domain/shotchart'
import type { ScoreKind, FoulType, StatKind, ShotSpot } from '../../domain/types'
import { pointsForKind, type PlayerStat } from '../../domain/boxscore'
import { TriangleAlert } from 'lucide-react'
import { EntryList, type EntryItem } from './HistoryDialog'
import { BTN, DANGER, DANGER_FILLED, OUTLINE, PRIMARY, SECONDARY, SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTS } from './buttons'

/** The stats entered from the grid. Not the assist: it is asked for right after the
 *  basket it led to, from the passer's side — a separate button meant reopening the
 *  passer's dialog after the scorer's, which nobody did mid-possession. */
const GRID_STATS: { k: StatKind; label: string }[] = [
  { k: 'block', label: 'action.block' },
  { k: 'reb_off', label: 'action.offRebound' },
  { k: 'reb_def', label: 'action.defRebound' },
]
/**
 * The three fouls a scorer's table actually calls out, each one tap.
 *
 * A picker after a single "Foul" button would have been tidier and would have cost a
 * second tap on the most frequent gesture of the two hours — the one made while
 * looking at the court, not at the screen. Three buttons keep it at one.
 *
 * The visible label is short so the three fit side by side; the accessible name says
 * "foul" out loud, because "Offensive" alone read out means nothing.
 */
const FOULS: { k: FoulType; label: string; aria: string }[] = [
  { k: 'offensive', label: 'action.offensive', aria: 'action.foulOffensive' },
  { k: 'defensive', label: 'action.defensive', aria: 'action.foulDefensive' },
  { k: 'technical', label: 'action.technical', aria: 'action.foulTechnical' },
]

/**
 * The two baskets that can be recorded without saying where from.
 *
 * A two has to land in one of the sheet's two columns, and it lands in `2int` — the
 * same choice the opposition's quick buttons make (`OPP_POINTS` in `LiveMatch`). One
 * convention for "a two with no position", not two.
 */
const QUICK: { k: ScoreKind; label: string; aria: string }[] = [
  { k: '2int', label: '+2', aria: 'action.addTwo' },
  { k: '3', label: '+3', aria: 'action.addThree' },
]

const POINTS_LABEL: Record<'2int' | '2ext' | '3', string> = { '2int': '2 PTS', '2ext': '2 PTS', '3': '3 PTS' }

export function PlayerActionDialog({
  open, playerName, color = C.text, teammates = [], shots, stats, entries = [],
  onClose, onScore, onMiss, onFreeThrows, onAndOne, onAssist, onFoul, onStat, onUndo,
}: {
  open: boolean; playerName: string; color?: string
  /** Who can have given the pass: the others on the court. */
  teammates?: { id: string; name: string }[]
  shots?: Shot[]
  /** The player's game so far, read at a glance in the header. */
  stats?: PlayerStat
  /** This player's entries, latest first: what the dialog's own history can take back. */
  entries?: EntryItem[]
  onClose: () => void
  onScore: (kind: ScoreKind, shot?: ShotSpot) => void
  onMiss: (kind: ScoreKind, shot: ShotSpot) => void
  /** A trip to the line, one entry per attempt in the order shot: `true` went in. */
  onFreeThrows: (results: boolean[]) => void
  /** The free throw after a basket and a foul: the opposition's foul goes with it. */
  onAndOne: (made: boolean) => void
  onAssist: (playerId: string) => void
  onFoul: (type: FoulType) => void; onStat: (kind: StatKind) => void
  onUndo?: (ids: string[]) => void
}) {
  const translate = useT()
  const [made, setMade] = useState(true)
  /** The shot placed on the court and not yet recorded. A tap only places it — a new
   *  tap moves it, "Validate" records it: a finger that slips on a moving bench no
   *  longer costs a wrong basket. Whether it went in is read from the mode at validation,
   *  so switching made/missed after placing it is not a second shot. */
  const [placed, setPlaced] = useState<ShotSpot | null>(null)
  /** What the dialog shows: the court and the actions, the free-throw line, or what
   *  follows a basket — the and-one, then (for the and-one) its single free throw. */
  const [step, setStep] = useState<'main' | 'ft' | 'basket' | 'andOne'>('main')
  /** The basket just recorded, named back on the step that follows it. */
  const [basket, setBasket] = useState<ScoreKind | null>(null)
  const [andOneDone, setAndOneDone] = useState(false)
  /** The entries ticked in the player's history, and whether their removal is being
   *  confirmed — it asks once, in place: nothing brings them back. */
  const [ticked, setTicked] = useState<string[]>([])
  const [undoing, setUndoing] = useState(false)

  // The mode returns to "Made" on every close: that is the common case. A shot placed
  // and never validated goes with the dialog — closing records nothing.
  const close = () => {
    setMade(true)
    setPlaced(null)
    setStep('main')
    setBasket(null)
    setAndOneDone(false)
    setTicked([])
    setUndoing(false)
    onClose()
  }

  /** A field goal made: recorded now, and the dialog moves on to what can follow it
   *  rather than closing — the foul on the shot is decided in the same breath. */
  const scored = (kind: ScoreKind, shot?: ShotSpot) => {
    onScore(kind, shot)
    setPlaced(null)
    setBasket(kind)
    setStep('basket')
  }

  const confirmation = placed && {
    spot: placed, made,
    label: `${made ? POINTS_LABEL[kindAt(placed.x, placed.y)] : translate('action.missedCaps')} · ${translate(ZONE_LABELS[zoneAt(placed.x, placed.y)])}`,
  }
  const validate = () => {
    if (!placed) return
    const kind = kindAt(placed.x, placed.y)
    if (made) scored(kind, placed)
    else { onMiss(kind, placed); close() }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {/* `gap-0`: the dialog's shell is a `gap-4` grid, which added itself to the
          `mt-*` of every block below — two stacked spacings, a hundred-odd pixels lost.
          The blocks' own margins are enough. Overflow stays bounded as a last resort:
          a short window. */}
      <DialogContent className="rounded-lg sm:max-w-3xl max-h-[92vh] gap-0 overflow-y-auto border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl font-extrabold">
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-[var(--c-border)]" style={{ background: color }} />
            {playerName}
          </DialogTitle>
        </DialogHeader>
        {stats && <StatLine stats={stats} />}

        {step === 'ft' && (
          <FreeThrowLine onBack={() => setStep('main')} onValidate={(results) => { onFreeThrows(results); close() }} />
        )}
        {step === 'andOne' && (
          <FreeThrowLine fixed={1} onBack={() => setStep('basket')} onValidate={([ok]) => { onAndOne(ok); setAndOneDone(true); setStep('basket') }} />
        )}
        {step === 'basket' && basket && (
          <div className="mt-3">
            <p role="status" className="rounded-lg px-3 py-2.5 text-center text-[13px] font-bold uppercase tracking-wide text-[var(--c-accent)] ring-1 ring-inset ring-[var(--c-accent-bd)]">
              {translate('basket.recorded', { points: pointsForKind(basket) })}
            </p>
            {teammates.length > 0 && <>
              <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{translate('basket.assistFrom')}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {teammates.map((t) => (
                  <button key={t.id} onClick={() => { onAssist(t.id); close() }} className={`${BTN} ${SECONDARY} truncate px-3`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </>}
            <button onClick={close} className={`${BTN} ${SECONDARY} mt-2 w-full`}>
              {translate(teammates.length > 0 ? 'basket.noAssist' : 'basket.done')}
            </button>
            {/* After the pass, because the pass is asked on every basket and the and-one
                on one in ten: the frequent answer goes where the thumb already is. */}
            {!andOneDone && (
              <button onClick={() => setStep('andOne')} className={`${BTN} ${OUTLINE} mt-4 w-full`}>
                {translate('basket.andOne')}
              </button>
            )}
          </div>
        )}
        {/* Two columns from `sm`, one below it — and the source order is the phone's,
            so the breakpoint reshuffles nothing. On the left what is *aimed at* (the
            shot, and its validation right under the court, where the eye already is);
            on the right what is *named*.
            The layout is the same in both modes. "Missed" only hides the right column —
            `invisible` beside the court, so the court keeps its size and nothing moves;
            gone below it on a phone, where it comes after the validation anyway. */}
        {step === 'main' && (
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div>
            <div role="group" aria-label={translate('action.shot')} className={`${SEGMENTS} grid-cols-2`}>
              <Toggle active={made} onClick={() => setMade(true)} activeClass={SEGMENT_ON}>{translate('action.made')}</Toggle>
              <Toggle active={!made} onClick={() => setMade(false)} activeClass={SEGMENT_ON}>{translate('action.missed')}</Toggle>
            </div>
            <div className="mt-3">
              <ShotPicker onPick={setPlaced} confirmation={confirmation} shots={shots} made={made}
                idle={translate(made ? 'action.madeHint' : 'action.missedHint')} />
            </div>
            <button onClick={validate} disabled={!placed} className={`${BTN} mt-2 w-full ${PRIMARY}`}>
              {translate('action.validateShot')}
            </button>
          </div>

          <div className={made ? 'flex flex-col' : 'max-sm:hidden sm:invisible'} aria-hidden={!made}>
            {/* Points with no spot: the way out when nobody saw where the shot came
                from. Lighter than the court, which records the spot as well — and the
                free throw with them, since it is points too and has no spot at all. */}
            <Section label={translate('action.noSpot')}>
              {QUICK.map((q) => (
                <button key={q.label} aria-label={translate(q.aria)} onClick={() => scored(q.k)} className={`${BTN} ${SECONDARY} text-lg font-bold tabular-nums`}>
                  {q.label}
                </button>
              ))}
              <button onClick={() => setStep('ft')} className={`${BTN} ${SECONDARY}`}>{translate('action.freeThrow')}</button>
            </Section>
            <Section label={translate('action.stats')}>
              {GRID_STATS.map((st) => (
                <button key={st.k} onClick={() => { onStat(st.k); close() }} className={`${BTN} ${SECONDARY}`}>{translate(st.label)}</button>
              ))}
            </Section>
            {/* Its side of the ball, one tap each. */}
            <Section label={translate('action.foul')} danger>
              {FOULS.map((f) => (
                <button key={f.k} aria-label={translate(f.aria)} onClick={() => { onFoul(f.k); close() }} className={`${BTN} ${DANGER}`}>
                  {translate(f.label)}
                </button>
              ))}
            </Section>
            {/* The player's own history sinks to the bottom: recording is what this
                dialog is opened for, taking back is the exception. Entries are ticked
                — one or several — then taken back together, after one confirmation.
                The whole game's history stays under the header's "Undo". */}
            {entries.length > 0 && onUndo && (
              <section className="mt-5 border-t border-[var(--c-border)] pt-4 sm:mt-auto">
                <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{translate('action.history')}</h3>
                <div className="-mx-1 max-h-36 overflow-y-auto px-1">
                  <EntryList items={entries} selected={ticked} label={translate('action.history')}
                    onToggle={(id) => { setUndoing(false); setTicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])) }} />
                </div>
                {undoing ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button onClick={() => setUndoing(false)} className={`${BTN} ${SECONDARY}`}>{translate('common.cancel')}</button>
                    <button onClick={() => { onUndo(ticked); close() }} className={`${BTN} ${DANGER_FILLED}`}>{translate('action.undoYes')}</button>
                  </div>
                ) : (
                  <button onClick={() => setUndoing(true)} disabled={ticked.length === 0} className={`${BTN} ${DANGER} mt-2 w-full`}>
                    {ticked.length ? translate('action.undoTicked', { count: ticked.length }) : translate('action.undoTickHint')}
                  </button>
                )}
              </section>
            )}
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The free-throw line, as the federation's e-Marque enters it: how many attempts, then
 * made or missed for each, then one validation. Every attempt starts "made" — the
 * common case — so a trip to the line that went two for two is three taps.
 */
function FreeThrowLine({ fixed, onBack, onValidate }: {
  /** A set number of attempts, and no choosing it: the and-one is one free throw. */
  fixed?: number
  onBack: () => void; onValidate: (results: boolean[]) => void
}) {
  const translate = useT()
  const [results, setResults] = useState<boolean[]>(() => Array(fixed ?? 2).fill(true))
  const setCount = (n: number) => setResults((r) => Array.from({ length: n }, (_, i) => r[i] ?? true))
  return (
    <div className="mt-3">
      {fixed === undefined ? <>
        <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{translate('ft.attempts')}</p>
        <div role="group" aria-label={translate('ft.attempts')} className={`${SEGMENTS} mt-1.5 grid-cols-3`}>
          {[1, 2, 3].map((n) => (
            <Toggle key={n} active={results.length === n} onClick={() => setCount(n)} activeClass={SEGMENT_ON}>{n}</Toggle>
          ))}
        </div>
      </> : <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{translate('basket.andOneHint')}</p>}
      <ul className="mt-3 space-y-2">
        {results.map((ok, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-sm font-black">{translate('ft.attempt', { n: i + 1 })}</span>
            <div role="group" aria-label={translate('ft.attempt', { n: i + 1 })} className={`${SEGMENTS} flex-1 grid-cols-2`}>
              <Toggle active={ok} onClick={() => setResults((r) => r.map((v, j) => (j === i ? true : v)))} activeClass={SEGMENT_ON}>{translate('action.made')}</Toggle>
              <Toggle active={!ok} onClick={() => setResults((r) => r.map((v, j) => (j === i ? false : v)))} activeClass={SEGMENT_ON}>{translate('action.missed')}</Toggle>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
        <button onClick={onBack} className={`${BTN} ${SECONDARY} px-5`}>{translate('ft.back')}</button>
        <button onClick={() => onValidate(results)} className={`${BTN} ${PRIMARY}`}>
          {translate('ft.validate')}
        </button>
      </div>
    </div>
  )
}

/**
 * The player's game so far, under their name: what the table is asked across the
 * bench mid-game — "how many has he got?", "is he on four fouls?" — without leaving
 * the dialog for the box score.
 */
function StatLine({ stats: s }: { stats: PlayerStat }) {
  const translate = useT()
  const ratio = (made: number, missed: number) => (missed ? `${made}/${made + missed}` : String(made))
  const cells: [string, string, boolean?][] = [
    [translate('statLine.points'), String(s.points)],
    [translate('statLine.shots'), ratio(s.fieldGoalsMade, s.misses)],
    [translate('statLine.threes'), String(s.threes)],
    [translate('statLine.freeThrows'), ratio(s.freeThrows, s.freeThrowsMissed)],
    [translate('statLine.rebounds'), String(s.offRebounds + s.defRebounds)],
    [translate('statLine.assists'), String(s.assists)],
    [translate('statLine.blocks'), String(s.blocks)],
    [translate('statLine.fouls'), String(s.fouls), s.fouls >= 4],
  ]
  return (
    // The hairline below parts what the player *has done* from what is about to be
    // entered: without it the stat cells read as one more row of buttons.
    <dl aria-label={translate('statLine.label')} className="mt-2 mb-4 grid grid-cols-4 gap-1 border-b border-[var(--c-border)] pb-4 sm:grid-cols-8">
      {cells.map(([label, value, warn]) => (
        <div key={label} className="rounded-md bg-[var(--c-card2)] px-2 py-1.5 text-center">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{label}</dt>
          <dd className={`nums text-base font-black tabular-nums ${warn ? 'text-[var(--c-danger)]' : ''}`}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A labelled row of three buttons: the right column reads as three short lists. */
function Section({ label, danger, children }: { label: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <h3 className={`mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide ${danger ? 'text-[var(--c-danger)]' : 'text-[var(--c-muted)]'}`}>
        {danger && <TriangleAlert className="h-[14px] w-[14px] shrink-0" strokeWidth={2.2} />}
        {label}
      </h3>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </section>
  )
}

/** The mode the next tap on the court records. It sets what a gesture *means*, so it
 *  is a full-height control and not a caption: 36 px for the switch that decides
 *  whether a tap is two points or a miss was the smallest thing in the dialog and the
 *  most expensive one to get wrong. */
function Toggle({ active, activeClass, onClick, children }: { active: boolean; activeClass: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`${SEGMENT} ${active ? activeClass : SEGMENT_OFF}`}>
      {children}
    </button>
  )
}
