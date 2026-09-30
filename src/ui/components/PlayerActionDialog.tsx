import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShotPicker } from './ShotCourt'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { kindAt, ZONE_LABELS, zoneAt } from '../../domain/shotzones'
import type { Shot } from '../../domain/shotchart'
import type { ScoreKind, FoulType, StatKind, ShotSpot } from '../../domain/types'
import { pointsForKind } from '../../domain/boxscore'
import { TriangleAlert } from 'lucide-react'

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
  open, playerName, color = C.text, teammates = [], shots,
  onClose, onScore, onMiss, onFreeThrows, onAndOne, onAssist, onFoul, onStat,
}: {
  open: boolean; playerName: string; color?: string
  /** Who can have given the pass: the others on the court. */
  teammates?: { id: string; name: string }[]
  shots?: Shot[]
  onClose: () => void
  onScore: (kind: ScoreKind, shot?: ShotSpot) => void
  onMiss: (kind: ScoreKind, shot: ShotSpot) => void
  /** A trip to the line, one entry per attempt in the order shot: `true` went in. */
  onFreeThrows: (results: boolean[]) => void
  /** The free throw after a basket and a foul: the opposition's foul goes with it. */
  onAndOne: (made: boolean) => void
  onAssist: (playerId: string) => void
  onFoul: (type: FoulType) => void; onStat: (kind: StatKind) => void
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

  // The mode returns to "Made" on every close: that is the common case. A shot placed
  // and never validated goes with the dialog — closing records nothing.
  const close = () => {
    setMade(true)
    setPlaced(null)
    setStep('main')
    setBasket(null)
    setAndOneDone(false)
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
                  <button key={t.id} onClick={() => { onAssist(t.id); close() }}
                    className="truncate rounded-2xl border border-[var(--c-border)] bg-[var(--c-card2)] px-3 py-3.5 text-sm font-bold transition hover:border-[var(--c-green)] hover:bg-[var(--c-panel)] active:scale-[0.97]">
                    {t.name}
                  </button>
                ))}
              </div>
            </>}
            <button onClick={close}
              className="mt-2 w-full rounded-2xl border border-[var(--c-border)] bg-[var(--c-card2)] py-3 text-sm font-bold transition hover:bg-[var(--c-panel)]">
              {translate(teammates.length > 0 ? 'basket.noAssist' : 'basket.done')}
            </button>
            {/* After the pass, because the pass is asked on every basket and the and-one
                on one in ten: the frequent answer goes where the thumb already is. */}
            {!andOneDone && (
              <button onClick={() => setStep('andOne')}
                className="mt-4 w-full rounded-2xl py-3 text-sm font-black transition hover:brightness-110 active:scale-[0.98]"
                style={{ background: C.accentBg, color: C.accent }}>
                {translate('basket.andOne')}
              </button>
            )}
          </div>
        )}
        {/* Two columns from `sm`, one below it — and the source order is the phone's,
            so the breakpoint reshuffles nothing.
            The split follows the gesture, not the taxonomy: on the left what is
            *aimed at*, on the right what is *named*. Stacked in a single 448-pixel
            column on a laptop, the fouls sat six hundred pixels below the header and
            the corrections took a scroll to reach at all — on a screen with eight
            hundred wasted pixels either side. Side by side, the whole dialog is one
            screenful and the court gains eighty pixels to be aimed at. */}
        {step === 'main' && <>
        {/* A miss is only ever aimed: in "Missed" mode the named actions go, and the
            court stands alone — nothing left to tap by mistake but the spot. */}
        <div className={made ? 'grid gap-x-5 sm:grid-cols-2' : 'mx-auto w-full sm:max-w-sm'}>
          <div>
            {/* SHOT: made or missed, then the spot on the court. */}
            <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-[var(--c-card2)] p-1">
              <Toggle active={made} onClick={() => setMade(true)} activeClass="bg-[var(--c-brand)] text-[var(--c-on-brand)]">{translate('action.made')}</Toggle>
              <Toggle active={!made} onClick={() => setMade(false)} activeClass="bg-[var(--c-border)] text-[var(--c-text)]">{translate('action.missed')}</Toggle>
            </div>
            <p className="mt-2 text-[12px] font-semibold text-[var(--c-muted)]">
              {made ? translate('action.madeHint') : translate('action.missedHint')}
            </p>
            <div className="mt-2"><ShotPicker onPick={setPlaced} confirmation={confirmation} shots={shots} made={made} /></div>
          </div>

          {made && <div className="flex flex-col">
            {/* THE POINTS, named rather than aimed — the whole reason this column
                exists. Two ordinary baskets and the free throw, in that order.
                The two and the three are the way out when nobody saw where the shot
                came from: the court records the same points *and* the spot, which is
                what every chart downstream reads, so they stay lighter than it — a
                fallback must not outrank the thing it falls back from. The free throw
                is the one that fills, because for it there is no court to aim at at
                all. */}
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-1">
              {QUICK.map((q) => (
                <button key={q.label} aria-label={translate(q.aria)} onClick={() => scored(q.k)}
                  className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card2)] py-3 text-lg font-black tabular-nums transition hover:border-[var(--c-accent)] hover:bg-[var(--c-panel)] active:scale-[0.97]"
                  style={{ color: C.accent }}>
                  {q.label}
                </button>
              ))}
            </div>
            <button onClick={() => setStep('ft')}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-black transition hover:brightness-110 active:scale-[0.98]"
              style={{ background: C.brand, color: C.onBrand }}>
              {translate('action.freeThrow')}
            </button>

            {/* OTHER STATS */}
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {GRID_STATS.map((s) => (
                <button key={s.k} onClick={() => { onStat(s.k); close() }}
                  className="rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] px-2 py-3 text-center text-[13px] font-semibold text-[var(--c-text)] transition hover:border-[var(--c-green)] hover:bg-[var(--c-panel)] active:scale-[0.97]">
                  {translate(s.label)}
                </button>
              ))}
            </div>

            {/* FOUL — its side of the ball, one tap each. */}
            <p className="mt-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[var(--c-danger)]">
              <TriangleAlert className="h-[14px] w-[14px] shrink-0" strokeWidth={2.2} />
              {translate('action.foul')}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {FOULS.map((f) => (
                <button key={f.k} aria-label={translate(f.aria)} onClick={() => { onFoul(f.k); close() }}
                  className="rounded-2xl bg-[var(--c-danger-bg)] py-3.5 text-[13px] font-bold text-[var(--c-danger)] transition hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)] active:scale-[0.97]">
                  {translate(f.label)}
                </button>
              ))}
            </div>

          </div>}
        </div>
        {/* At the very bottom, under both columns: the last thing the eye reaches after
            aiming, and greyed until there is something to validate. */}
        <button onClick={validate} disabled={!placed}
          className="mt-4 w-full rounded-2xl py-3.5 text-[15px] font-black transition hover:brightness-110 active:scale-[0.98] disabled:opacity-35 disabled:hover:brightness-100"
          style={{ background: C.brand, color: C.onBrand }}>
          {translate('action.validateShot')}
        </button>
        </>}
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
        <button onClick={onBack} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card2)] px-5 py-3.5 text-sm font-bold transition hover:bg-[var(--c-panel)]">{translate('ft.back')}</button>
        <button onClick={() => onValidate(results)} className="rounded-2xl py-3.5 text-[15px] font-black transition hover:brightness-110 active:scale-[0.98]" style={{ background: C.brand, color: C.onBrand }}>
          {translate('ft.validate')}
        </button>
      </div>
    </div>
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
