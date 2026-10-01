import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShotPicker } from './ShotCourt'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { kindAt, ZONE_LABELS, zoneAt } from '../../domain/shotzones'
import type { Shot } from '../../domain/shotchart'
import type { ScoreKind, FoulType, StatKind, ShotSpot } from '../../domain/types'
import { pointsForKind } from '../../domain/boxscore'
import { TriangleAlert, Undo2 } from 'lucide-react'

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

/** One size for every button of the dialog — a finger tall, 48 px — and four looks:
 *  the one primary action, the ordinary entries, the fouls, and the destructive yes. */
const BTN = 'h-12 rounded-xl text-sm font-bold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35'
const PRIMARY = 'bg-[var(--c-brand)] text-[var(--c-on-brand)] font-black hover:brightness-110'
const SECONDARY = 'border border-[var(--c-border)] bg-[var(--c-card2)] text-[var(--c-text)] hover:border-[var(--c-accent)] hover:bg-[var(--c-panel)]'
const DANGER = 'bg-[var(--c-danger-bg)] text-[var(--c-danger)] hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)]'
const DANGER_FILLED = 'bg-[var(--c-danger-fill)] text-[var(--c-on-danger)] font-black'

const POINTS_LABEL: Record<'2int' | '2ext' | '3', string> = { '2int': '2 PTS', '2ext': '2 PTS', '3': '3 PTS' }

export function PlayerActionDialog({
  open, playerName, color = C.text, teammates = [], shots, lastEntry,
  onClose, onScore, onMiss, onFreeThrows, onAndOne, onAssist, onFoul, onStat, onUndo,
}: {
  open: boolean; playerName: string; color?: string
  /** Who can have given the pass: the others on the court. */
  teammates?: { id: string; name: string }[]
  shots?: Shot[]
  /** This player's latest entry, named — what the undo button takes back. */
  lastEntry?: { id: string; label: string } | null
  onClose: () => void
  onScore: (kind: ScoreKind, shot?: ShotSpot) => void
  onMiss: (kind: ScoreKind, shot: ShotSpot) => void
  /** A trip to the line, one entry per attempt in the order shot: `true` went in. */
  onFreeThrows: (results: boolean[]) => void
  /** The free throw after a basket and a foul: the opposition's foul goes with it. */
  onAndOne: (made: boolean) => void
  onAssist: (playerId: string) => void
  onFoul: (type: FoulType) => void; onStat: (kind: StatKind) => void
  onUndo?: (id: string) => void
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
  /** The undo asks once, in place: it names what goes, and nothing brings it back. */
  const [undoing, setUndoing] = useState(false)

  // The mode returns to "Made" on every close: that is the common case. A shot placed
  // and never validated goes with the dialog — closing records nothing.
  const close = () => {
    setMade(true)
    setPlaced(null)
    setStep('main')
    setBasket(null)
    setAndOneDone(false)
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
      <DialogContent className="sm:max-w-3xl max-h-[92vh] gap-0 overflow-y-auto border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl font-extrabold">
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-[var(--c-border)]" style={{ background: color }} />
            {playerName}
          </DialogTitle>
        </DialogHeader>

        {step === 'ft' && (
          <FreeThrowLine onBack={() => setStep('main')} onValidate={(results) => { onFreeThrows(results); close() }} />
        )}
        {step === 'andOne' && (
          <FreeThrowLine fixed={1} onBack={() => setStep('basket')} onValidate={([ok]) => { onAndOne(ok); setAndOneDone(true); setStep('basket') }} />
        )}
        {step === 'basket' && basket && (
          <div className="mt-3">
            <p role="status" className="rounded-lg px-3 py-2 text-center text-[13px] font-black uppercase tracking-wide" style={{ background: C.accentBg, color: C.accent }}>
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
              <button onClick={() => setStep('andOne')} className={`${BTN} mt-4 w-full border border-[var(--c-accent-bd)] font-black`}
                style={{ background: C.accentBg, color: C.accent }}>
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
            <div role="group" aria-label={translate('action.shot')} className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--c-card2)] p-1">
              <Toggle active={made} onClick={() => setMade(true)} activeClass="bg-[var(--c-brand)] text-[var(--c-on-brand)]">{translate('action.made')}</Toggle>
              <Toggle active={!made} onClick={() => setMade(false)} activeClass="bg-[var(--c-text)] text-[var(--c-card)]">{translate('action.missed')}</Toggle>
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
                <button key={q.label} aria-label={translate(q.aria)} onClick={() => scored(q.k)} className={`${BTN} ${SECONDARY} text-base font-black tabular-nums`} style={{ color: C.accent }}>
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
            {/* The undo sinks to the bottom: recording is what this dialog is opened for,
                taking back is the exception — and it names what it takes back, so a tap
                does not undo blind. The full history stays under the header's "Undo". */}
            {lastEntry && onUndo && (
              <div className="mt-5 border-t border-[var(--c-border)] pt-4 sm:mt-auto">
                {undoing ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setUndoing(false)} className={`${BTN} ${SECONDARY}`}>{translate('common.cancel')}</button>
                    <button onClick={() => { onUndo(lastEntry.id); close() }} className={`${BTN} ${DANGER_FILLED}`}>{translate('action.undoYes')}</button>
                  </div>
                ) : (
                  <button onClick={() => setUndoing(true)} className={`${BTN} ${SECONDARY} flex w-full items-center justify-center gap-2 px-3`}>
                    <Undo2 className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                    <span className="truncate">{translate('action.undoLast', { what: lastEntry.label })}</span>
                  </button>
                )}
              </div>
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
        <div role="group" aria-label={translate('ft.attempts')} className="mt-1.5 grid grid-cols-3 gap-2 rounded-xl bg-[var(--c-card2)] p-1">
          {[1, 2, 3].map((n) => (
            <Toggle key={n} active={results.length === n} onClick={() => setCount(n)} activeClass="bg-[var(--c-brand)] text-[var(--c-on-brand)]">{n}</Toggle>
          ))}
        </div>
      </> : <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{translate('basket.andOneHint')}</p>}
      <ul className="mt-3 space-y-2">
        {results.map((ok, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-sm font-black">{translate('ft.attempt', { n: i + 1 })}</span>
            <div role="group" aria-label={translate('ft.attempt', { n: i + 1 })} className="grid flex-1 grid-cols-2 gap-2 rounded-xl bg-[var(--c-card2)] p-1">
              <Toggle active={ok} onClick={() => setResults((r) => r.map((v, j) => (j === i ? true : v)))} activeClass="bg-[var(--c-brand)] text-[var(--c-on-brand)]">{translate('action.made')}</Toggle>
              <Toggle active={!ok} onClick={() => setResults((r) => r.map((v, j) => (j === i ? false : v)))} activeClass="bg-[var(--c-border)] text-[var(--c-text)]">{translate('action.missed')}</Toggle>
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
      className={`h-11 rounded-lg text-sm font-bold transition ${active ? activeClass : 'text-[var(--c-muted)] hover:text-[var(--c-text)]'}`}>
      {children}
    </button>
  )
}
