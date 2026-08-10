import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShotPicker, SHOT_FEEDBACK_MS } from './ShotCourt'
import { kindAt, ZONE_LABELS, zoneAt } from '../../domain/shotzones'
import type { ScoreKind, FoulType, StatKind, ShotSpot } from '../../domain/types'

const SCORES: { k: ScoreKind; label: string; pts: number }[] = [
  { k: '2int', label: '2 pts intérieur', pts: 2 },
  { k: '2ext', label: '2 pts extérieur', pts: 2 },
  { k: '3', label: '3 points', pts: 3 },
  { k: 'lf', label: 'Lancer franc', pts: 1 },
]
const STATS: { k: StatKind; label: string }[] = [
  { k: 'assist', label: 'Passe déc.' },
  { k: 'block', label: 'Contre' },
  { k: 'reb_off', label: 'Rebond off.' },
  { k: 'reb_def', label: 'Rebond déf.' },
]
const ZERO_S: Record<ScoreKind, number> = { '2int': 0, '2ext': 0, '3': 0, lf: 0 }
const ZERO_T: Record<StatKind, number> = { assist: 0, reb_off: 0, reb_def: 0, block: 0 }
const POINTS_LABEL: Record<'2int' | '2ext' | '3', string> = { '2int': '2 PTS', '2ext': '2 PTS', '3': '3 PTS' }

export function PlayerActionDialog({
  open, playerName, color = '#ffffff', scoreCounts, statCounts, fouls = 0, misses = 0,
  onClose, onScore, onMiss, onFoul, onStat, onRemoveScore, onRemoveFoul, onRemoveStat, onRemoveMiss,
}: {
  open: boolean; playerName: string; color?: string
  scoreCounts?: Record<ScoreKind, number>; statCounts?: Record<StatKind, number>
  fouls?: number; misses?: number
  onClose: () => void
  onScore: (kind: ScoreKind, shot?: ShotSpot) => void
  onMiss: (kind: ScoreKind, shot: ShotSpot) => void
  onFoul: (type: FoulType) => void; onStat: (kind: StatKind) => void
  onRemoveScore: (kind: ScoreKind) => void; onRemoveFoul: () => void
  onRemoveStat: (kind: StatKind) => void; onRemoveMiss: () => void
}) {
  const [made, setMade] = useState(true)
  const [confirmation, setConfirmation] = useState<{ spot: ShotSpot; label: string } | null>(null)
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
    setConfirmation({ spot, label: `${made ? POINTS_LABEL[kind] : 'MANQUÉ'} · ${ZONE_LABELS[zoneAt(spot.x, spot.y)]}` })
    closeTimer.current = setTimeout(close, SHOT_FEEDBACK_MS)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md border-none bg-[#161618] p-5 text-white [&>button]:text-white/60 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl font-extrabold">
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-white/20" style={{ background: color }} />
            {playerName}
          </DialogTitle>
        </DialogHeader>

        {/* TIR : réussi ou manqué, puis position sur le terrain */}
        <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-[#202024] p-1">
          <Toggle active={made} onClick={() => setMade(true)} activeClass="bg-[#ff4d6d] text-white">Réussi</Toggle>
          <Toggle active={!made} onClick={() => setMade(false)} activeClass="bg-white/20 text-white">Manqué</Toggle>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-white/45">
          {made ? 'Touchez l’endroit du tir : la zone donne les points.' : 'Touchez l’endroit du tir manqué.'}
        </p>
        <div className="mt-2"><ShotPicker onPick={pick} confirmation={confirmation} /></div>

        <button onClick={() => { onScore('lf'); close() }}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-[#202024] py-3 text-sm font-bold text-white transition hover:border-[#ff4d6d] active:scale-[0.98]">
          + 1 Lancer franc
        </button>

        {/* AUTRES STATS */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {STATS.map((s) => (
            <button key={s.k} onClick={() => { onStat(s.k); close() }}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-[#202024] px-3.5 py-2.5 text-left transition hover:border-[#3fe08a] hover:bg-[#26262b] active:scale-[0.97]">
              <span className="text-[13px] font-semibold text-white/80">{s.label}</span>
              <span className="text-base font-black text-[#3fe08a]">+1</span>
            </button>
          ))}
        </div>

        <button onClick={() => { onFoul('personal'); close() }}
          className="mt-3 w-full rounded-2xl bg-red-500/15 py-3.5 text-base font-bold text-red-400 transition hover:bg-red-500 hover:text-white active:scale-[0.98]">
          ⚠ Faute personnelle
        </button>

        {/* CORRECTIONS */}
        {hasCorrections && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/40">Corriger — retirer une action</p>
            <div className="grid grid-cols-2 gap-2">
              {SCORES.map((s) => (
                <RemoveBtn key={s.k} label={s.label} value={`−${s.pts}`} disabled={sc[s.k] <= 0} onClick={() => { onRemoveScore(s.k); close() }} />
              ))}
              {STATS.map((s) => (
                <RemoveBtn key={s.k} label={s.label} value="−1" disabled={tc[s.k] <= 0} onClick={() => { onRemoveStat(s.k); close() }} />
              ))}
            </div>
            <button disabled={misses <= 0} onClick={() => { onRemoveMiss(); close() }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#202024] py-2.5 text-sm font-bold text-white/80 transition hover:border-white/25 hover:bg-[#26262b] disabled:opacity-35 disabled:hover:border-white/10">
              − Retirer le dernier tir manqué {misses > 0 && <span className="text-white/40">({misses})</span>}
            </button>
            <button disabled={fouls <= 0} onClick={() => { onRemoveFoul(); close() }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#202024] py-2.5 text-sm font-bold text-white/80 transition hover:border-white/25 hover:bg-[#26262b] disabled:opacity-35 disabled:hover:border-white/10">
              − Retirer une faute {fouls > 0 && <span className="text-white/40">({fouls})</span>}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Toggle({ active, activeClass, onClick, children }: { active: boolean; activeClass: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`rounded-lg py-2 text-sm font-bold transition ${active ? activeClass : 'text-white/50 hover:text-white/80'}`}>
      {children}
    </button>
  )
}

function RemoveBtn({ label, value, disabled, onClick }: { label: string; value: string; disabled: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="flex items-center justify-between gap-1 rounded-xl border border-white/10 bg-[#202024] px-3 py-2 text-left transition hover:border-white/25 hover:bg-[#26262b] active:scale-[0.97] disabled:opacity-35 disabled:hover:border-white/10">
      <span className="truncate text-[12px] font-semibold text-white/70">{label}</span>
      <span className="tabular-nums text-sm font-black text-white/80">{value}</span>
    </button>
  )
}
