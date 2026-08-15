import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShotPicker, SHOT_FEEDBACK_MS } from './ShotCourt'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { kindAt, ZONE_LABELS, zoneAt } from '../../domain/shotzones'
import type { Shot } from '../../domain/shotchart'
import type { ScoreKind, FoulType, StatKind, ShotSpot } from '../../domain/types'
import { TriangleAlert } from 'lucide-react'

const SCORES: { k: ScoreKind; label: string; pts: number }[] = [
  { k: '2int', label: 'action.2int', pts: 2 },
  { k: '2ext', label: 'action.2ext', pts: 2 },
  { k: '3', label: 'action.3', pts: 3 },
  { k: 'lf', label: 'action.lancerFranc', pts: 1 },
]
const STATS: { k: StatKind; label: string }[] = [
  { k: 'assist', label: 'action.passe' },
  { k: 'block', label: 'action.contre' },
  { k: 'reb_off', label: 'action.rebOff' },
  { k: 'reb_def', label: 'action.rebDef' },
]
const ZERO_S: Record<ScoreKind, number> = { '2int': 0, '2ext': 0, '3': 0, lf: 0 }
const ZERO_T: Record<StatKind, number> = { assist: 0, reb_off: 0, reb_def: 0, block: 0 }
const POINTS_LABEL: Record<'2int' | '2ext' | '3', string> = { '2int': '2 PTS', '2ext': '2 PTS', '3': '3 PTS' }

export function PlayerActionDialog({
  open, playerName, color = C.text, scoreCounts, statCounts, fouls = 0, misses = 0, shots,
  onClose, onScore, onMiss, onFoul, onStat, onRemoveScore, onRemoveFoul, onRemoveStat, onRemoveMiss,
}: {
  open: boolean; playerName: string; color?: string
  scoreCounts?: Record<ScoreKind, number>; statCounts?: Record<StatKind, number>
  fouls?: number; misses?: number; shots?: Shot[]
  onClose: () => void
  onScore: (kind: ScoreKind, shot?: ShotSpot) => void
  onMiss: (kind: ScoreKind, shot: ShotSpot) => void
  onFoul: (type: FoulType) => void; onStat: (kind: StatKind) => void
  onRemoveScore: (kind: ScoreKind) => void; onRemoveFoul: () => void
  onRemoveStat: (kind: StatKind) => void; onRemoveMiss: () => void
}) {
  const translate = useT()
  const [made, setMade] = useState(true)
  const [confirmation, setConfirmation] = useState<{ spot: ShotSpot; label: string; made: boolean } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sc = scoreCounts ?? ZERO_S
  const tc = statCounts ?? ZERO_T
  const hasCorrections =
    Object.values(sc).some((n) => n > 0) || Object.values(tc).some((n) => n > 0) || fouls > 0 || misses > 0

  // Sans cette annulation, fermer la popup à la main pendant le délai déclencherait
  // une mise à jour d'état sur un composant démonté.
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // Le mode revient à « Réussi » à chaque fermeture : c'est le cas courant.
  const close = () => {
    clearTimeout(closeTimer.current)
    setMade(true)
    setConfirmation(null)
    onClose()
  }

  const pick = (spot: ShotSpot) => {
    const kind = kindAt(spot.x, spot.y)
    if (made) onScore(kind, spot); else onMiss(kind, spot)
    setConfirmation({ spot, made, label: `${made ? POINTS_LABEL[kind] : translate('action.manqueMaj')} · ${translate(ZONE_LABELS[zoneAt(spot.x, spot.y)])}` })
    closeTimer.current = setTimeout(close, SHOT_FEEDBACK_MS)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {/* `gap-0` : le gabarit du dialogue est une grille à `gap-4`, qui s'ajoutait aux
          `mt-*` de chaque bloc ci-dessous — deux espacements empilés, une centaine de
          pixels perdus. Les marges des blocs suffisent. Le débordement reste borné en
          dernier recours : les corrections dépliées ne tiennent dans aucune fenêtre. */}
      <DialogContent className="sm:max-w-md max-h-[92vh] gap-0 overflow-y-auto border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl font-extrabold">
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-[var(--c-border)]" style={{ background: color }} />
            {playerName}
          </DialogTitle>
        </DialogHeader>

        {/* TIR : réussi ou manqué, puis position sur le terrain */}
        <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-[var(--c-card2)] p-1">
          <Toggle active={made} onClick={() => setMade(true)} activeClass="bg-[var(--c-brand)] text-[var(--c-on-brand)]">{translate('action.reussi')}</Toggle>
          <Toggle active={!made} onClick={() => setMade(false)} activeClass="bg-[var(--c-border)] text-[var(--c-text)]">{translate('action.manque')}</Toggle>
        </div>
        <p className="mt-2 text-[12px] font-semibold text-[var(--c-muted)]">
          {made ? translate('action.consigneReussi') : translate('action.consigneManque')}
        </p>
        <div className="mt-2"><ShotPicker onPick={pick} confirmation={confirmation} shots={shots} /></div>

        <button onClick={() => { onScore('lf'); close() }}
          className="mt-3 w-full rounded-2xl border border-[var(--c-border)] bg-[var(--c-card2)] py-3 text-sm font-bold text-[var(--c-text)] transition hover:border-[var(--c-accent)] active:scale-[0.98]">
          {translate('action.plusLancerFranc')}
        </button>

        {/* AUTRES STATS */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {STATS.map((s) => (
            <button key={s.k} onClick={() => { onStat(s.k); close() }}
              className="flex items-center justify-between rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] px-3.5 py-2.5 text-left transition hover:border-[var(--c-green)] hover:bg-[var(--c-panel)] active:scale-[0.97]">
              <span className="text-[13px] font-semibold text-[var(--c-text)]">{translate(s.label)}</span>
              <span className="text-base font-black text-[var(--c-green)]">+1</span>
            </button>
          ))}
        </div>

        <button onClick={() => { onFoul('personal'); close() }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--c-danger-bg)] py-3.5 text-base font-bold text-[var(--c-danger)] transition hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)] active:scale-[0.98]">
          <TriangleAlert className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          {translate('action.fautePersonnelle')}
        </button>

        {/* CORRECTIONS — repliées : on ouvre cette popup pour saisir, pas pour
            défaire. Déployées d'emblée, elles poussaient la moitié du dialogue
            sous la ligne de flottaison et forçaient un défilement à chaque tir. */}
        {hasCorrections && (
          <details className="mt-4 border-t border-[var(--c-border)] pt-3">
            <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)] transition hover:text-[var(--c-text)]">
              {translate('action.corriger')}
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
              {translate('action.retirerTirManque')} {misses > 0 && <span className="text-[var(--c-muted)]">({misses})</span>}
            </button>
            <button disabled={fouls <= 0} onClick={() => { onRemoveFoul(); close() }}
              className="mt-2 w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] py-2.5 text-sm font-bold text-[var(--c-text)] transition hover:border-[var(--c-muted)] hover:bg-[var(--c-panel)] disabled:opacity-35 disabled:hover:border-[var(--c-border)]">
              {translate('action.retirerFaute')} {fouls > 0 && <span className="text-[var(--c-muted)]">({fouls})</span>}
            </button>
          </details>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Toggle({ active, activeClass, onClick, children }: { active: boolean; activeClass: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`rounded-lg py-2 text-sm font-bold transition ${active ? activeClass : 'text-[var(--c-muted)] hover:text-[var(--c-text)]'}`}>
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
