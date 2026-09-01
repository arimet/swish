import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShotPicker, SHOT_FEEDBACK_MS } from './ShotCourt'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { kindAt, ZONE_LABELS, zoneAt } from '../../domain/shotzones'
import type { Shot } from '../../domain/shotchart'
import type { ScoreKind, FoulType, StatKind, ShotSpot } from '../../domain/types'
import { TriangleAlert, Undo2, ChevronDown } from 'lucide-react'

const SCORES: { k: ScoreKind; label: string; pts: number }[] = [
  { k: '2int', label: 'action.twoInside', pts: 2 },
  { k: '2ext', label: 'action.twoOutside', pts: 2 },
  { k: '3', label: 'action.three', pts: 3 },
  { k: 'lf', label: 'action.freeThrow', pts: 1 },
]
const STATS: { k: StatKind; label: string }[] = [
  { k: 'assist', label: 'action.assist' },
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

/** How a recorded foul is named back to the scorer, in the corrections. `personal`
 *  is the untyped one — the roster row's one-tap `F`, and anything recorded before
 *  the distinction existed. */
const FOUL_LABEL: Record<FoulType, string> = {
  personal: 'action.foul',
  offensive: 'action.foulOffensive',
  defensive: 'action.foulDefensive',
  technical: 'action.foulTechnical',
  unsportsmanlike: 'action.foulUnsportsmanlike',
  disqualifying: 'action.foulDisqualifying',
}

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

const ZERO_S: Record<ScoreKind, number> = { '2int': 0, '2ext': 0, '3': 0, lf: 0 }
const ZERO_T: Record<StatKind, number> = { assist: 0, reb_off: 0, reb_def: 0, block: 0 }
const POINTS_LABEL: Record<'2int' | '2ext' | '3', string> = { '2int': '2 PTS', '2ext': '2 PTS', '3': '3 PTS' }

export function PlayerActionDialog({
  open, playerName, color = C.text, scoreCounts, statCounts, foulCounts, fouls = 0, misses = 0, shots,
  onClose, onScore, onMiss, onFoul, onStat, onRemoveScore, onRemoveFoul, onRemoveStat, onRemoveMiss,
}: {
  open: boolean; playerName: string; color?: string
  scoreCounts?: Record<ScoreKind, number>; statCounts?: Record<StatKind, number>
  /** Fouls already recorded for this player, by type. It is what lets the corrections
   *  name what they will remove — "remove a defensive foul", not "remove a foul". */
  foulCounts?: Partial<Record<FoulType, number>>
  fouls?: number; misses?: number; shots?: Shot[]
  onClose: () => void
  onScore: (kind: ScoreKind, shot?: ShotSpot) => void
  onMiss: (kind: ScoreKind, shot: ShotSpot) => void
  onFoul: (type: FoulType) => void; onStat: (kind: StatKind) => void
  onRemoveScore: (kind: ScoreKind) => void; onRemoveFoul: (type: FoulType) => void
  onRemoveStat: (kind: StatKind) => void; onRemoveMiss: () => void
}) {
  const translate = useT()
  const [made, setMade] = useState(true)
  const [confirmation, setConfirmation] = useState<{ spot: ShotSpot; label: string; made: boolean } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sc = scoreCounts ?? ZERO_S
  const tc = statCounts ?? ZERO_T
  // Only the types actually recorded: a list of six removal buttons, five of them
  // disabled, says nothing and buries the one that matters.
  const recordedFouls = (Object.entries(foulCounts ?? {}) as [FoulType, number][]).filter(([, n]) => n > 0)
  const removable =
    Object.values(sc).reduce((a, b) => a + b, 0) + Object.values(tc).reduce((a, b) => a + b, 0) + fouls + misses
  const hasCorrections = removable > 0

  // Without this cancellation, closing the popup by hand during the delay would
  // trigger a state update on an unmounted component.
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // The mode returns to "Made" on every close: that is the common case.
  const close = () => {
    clearTimeout(closeTimer.current)
    setMade(true)
    setConfirmation(null)
    onClose()
  }

  const pick = (spot: ShotSpot) => {
    const kind = kindAt(spot.x, spot.y)
    if (made) onScore(kind, spot); else onMiss(kind, spot)
    setConfirmation({ spot, made, label: `${made ? POINTS_LABEL[kind] : translate('action.missedCaps')} · ${translate(ZONE_LABELS[zoneAt(spot.x, spot.y)])}` })
    closeTimer.current = setTimeout(close, SHOT_FEEDBACK_MS)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {/* `gap-0`: the dialog's shell is a `gap-4` grid, which added itself to the
          `mt-*` of every block below — two stacked spacings, a hundred-odd pixels lost.
          The blocks' own margins are enough. Overflow stays bounded as a last resort:
          the corrections unfolded fit in no window. */}
      <DialogContent className="sm:max-w-3xl max-h-[92vh] gap-0 overflow-y-auto border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl font-extrabold">
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-[var(--c-border)]" style={{ background: color }} />
            {playerName}
          </DialogTitle>
        </DialogHeader>

        {/* Two columns from `sm`, one below it — and the source order is the phone's,
            so the breakpoint reshuffles nothing.
            The split follows the gesture, not the taxonomy: on the left what is
            *aimed at*, on the right what is *named*. Stacked in a single 448-pixel
            column on a laptop, the fouls sat six hundred pixels below the header and
            the corrections took a scroll to reach at all — on a screen with eight
            hundred wasted pixels either side. Side by side, the whole dialog is one
            screenful and the court gains eighty pixels to be aimed at. */}
        <div className="grid gap-x-5 sm:grid-cols-2">
          <div>
            {/* SHOT: made or missed, then the spot on the court. */}
            <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-[var(--c-card2)] p-1">
              <Toggle active={made} onClick={() => setMade(true)} activeClass="bg-[var(--c-brand)] text-[var(--c-on-brand)]">{translate('action.made')}</Toggle>
              <Toggle active={!made} onClick={() => setMade(false)} activeClass="bg-[var(--c-border)] text-[var(--c-text)]">{translate('action.missed')}</Toggle>
            </div>
            <p className="mt-2 text-[12px] font-semibold text-[var(--c-muted)]">
              {made ? translate('action.madeHint') : translate('action.missedHint')}
            </p>
            <div className="mt-2"><ShotPicker onPick={pick} confirmation={confirmation} shots={shots} made={made} /></div>
          </div>

          <div className="flex flex-col">
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
                <button key={q.label} aria-label={translate(q.aria)} onClick={() => { onScore(q.k); close() }}
                  className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card2)] py-3 text-lg font-black tabular-nums transition hover:border-[var(--c-accent)] hover:bg-[var(--c-panel)] active:scale-[0.97]"
                  style={{ color: C.accent }}>
                  {q.label}
                </button>
              ))}
            </div>
            <button onClick={() => { onScore('lf'); close() }}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-black transition hover:brightness-110 active:scale-[0.98]"
              style={{ background: C.brand, color: C.onBrand }}>
              {translate('action.addFreeThrow')}
            </button>

            {/* OTHER STATS */}
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {STATS.map((s) => (
                <button key={s.k} onClick={() => { onStat(s.k); close() }}
                  className="flex items-center justify-between rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] px-3.5 py-2.5 text-left transition hover:border-[var(--c-green)] hover:bg-[var(--c-panel)] active:scale-[0.97]">
                  <span className="text-[13px] font-semibold text-[var(--c-text)]">{translate(s.label)}</span>
                  <span className="text-base font-black text-[var(--c-green)]">+1</span>
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

            {/* CORRECTIONS — still folded, now visibly a button.
                Folded, because this popup is opened to record and not to undo: unfolded
                from the start, the corrections pushed half the dialog below the fold and
                forced a scroll on every shot. Two columns give them room but do not
                change that: it is still the second reason to open this dialog, not the
                first.
                Visibly a button, because a mis-entry is not a footnote, and a small grey
                caption hides it. It also says how many actions it can take back, which is
                how you tell "nothing to correct" from "did not notice the control". */}
            {/* `sm:mt-auto` sinks the corrections to the bottom of the column, so the two
                columns end on one line instead of leaving a ragged corner — and the
                room that opens above becomes the separation between *recording* and
                *undoing*, which are the dialog's two errands and should not blur into
                one another. The hairline names that separation: without it the gap is
                read as a hole rather than as a break. */}
            {hasCorrections && (
              <details className="group mt-4 sm:mt-auto sm:border-t sm:border-[var(--c-border)] sm:pt-4">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-2xl border border-[var(--c-border)] bg-[var(--c-card2)] py-3.5 text-[15px] font-bold text-[var(--c-text)] transition hover:border-[var(--c-accent)] hover:bg-[var(--c-panel)] active:scale-[0.98] [&::-webkit-details-marker]:hidden">
                  <Undo2 className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                  {translate('action.correct')}
                  <span className="tabular-nums text-[var(--c-muted)]">({removable})</span>
                  <ChevronDown className="h-[16px] w-[16px] shrink-0 text-[var(--c-muted)] transition group-open:rotate-180" strokeWidth={2.4} />
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {SCORES.map((s) => (
                    <RemoveBtn key={s.k} label={translate(s.label)} value={`−${s.pts}`} disabled={sc[s.k] <= 0} onClick={() => { onRemoveScore(s.k); close() }} />
                  ))}
                  {STATS.map((s) => (
                    <RemoveBtn key={s.k} label={translate(s.label)} value="−1" disabled={tc[s.k] <= 0} onClick={() => { onRemoveStat(s.k); close() }} />
                  ))}
                </div>
                <button disabled={misses <= 0} onClick={() => { onRemoveMiss(); close() }}
                  className="mt-2 w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] py-2.5 text-sm font-bold text-[var(--c-text)] transition hover:border-[var(--c-muted)] hover:bg-[var(--c-panel)] disabled:opacity-35 disabled:hover:border-[var(--c-border)]">
                  {translate('action.removeMiss')} {misses > 0 && <span className="text-[var(--c-muted)]">({misses})</span>}
                </button>
                {/* One button per foul type actually recorded — which is also the only
                    place the recorded type is shown back. A type you can enter and never
                    read again is a type nobody trusts. */}
                {recordedFouls.map(([type, n]) => (
                  <button key={type} onClick={() => { onRemoveFoul(type); close() }}
                    className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] px-3.5 py-2.5 text-sm font-bold text-[var(--c-text)] transition hover:border-[var(--c-muted)] hover:bg-[var(--c-panel)]">
                    <span className="truncate">{translate('action.removeOne', { what: translate(FOUL_LABEL[type]).toLowerCase() })}</span>
                    <span className="tabular-nums text-[var(--c-muted)]">({n})</span>
                  </button>
                ))}
              </details>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

function RemoveBtn({ label, value, disabled, onClick }: { label: string; value: string; disabled: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="flex items-center justify-between gap-1 rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] px-3 py-2 text-left transition hover:border-[var(--c-muted)] hover:bg-[var(--c-panel)] active:scale-[0.97] disabled:opacity-35 disabled:hover:border-[var(--c-border)]">
      <span className="truncate text-[12px] font-semibold text-[var(--c-text)]">{label}</span>
      <span className="tabular-nums text-sm font-black text-[var(--c-text)]">{value}</span>
    </button>
  )
}
