import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmt } from './GameClock'

/** Saisie manuelle du chrono (format MM:SS ou secondes brutes), borné à `max`. */
function parseClock(text: string): number | null {
  const t = text.trim()
  const mmss = t.match(/^(\d{1,3}):([0-5]?\d)$/)
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2])
  if (/^\d{1,4}$/.test(t)) return Number(t)
  return null
}

export function ClockEditDialog({ open, seconds, max, onClose, onSubmit }: {
  open: boolean; seconds: number; max: number; onClose: () => void; onSubmit: (seconds: number) => void
}) {
  const [text, setText] = useState('')
  useEffect(() => { if (open) setText(fmt(seconds)) }, [open, seconds])

  const parsed = parseClock(text)
  const valid = parsed !== null && parsed >= 0 && parsed <= max
  const submit = () => { if (valid) { onSubmit(parsed!); onClose() } }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xs border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">Éditer le chrono</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          inputMode="numeric"
          placeholder="MM:SS"
          className={`mt-2 w-full rounded-xl border bg-[var(--c-card2)] px-4 py-3 text-center text-4xl font-black tabular-nums outline-none transition ${
            valid ? 'border-[var(--c-border)] focus:border-[var(--c-accent)]' : 'border-red-500/60'
          }`}
        />
        <p className="mt-1.5 text-center text-xs text-[var(--c-muted)]">Format MM:SS — max {fmt(max)}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-[var(--c-card2)] py-2.5 text-sm font-bold transition hover:bg-[var(--c-border)]">
            Annuler
          </button>
          <button
            disabled={!valid}
            onClick={submit}
            className="flex-1 rounded-xl bg-[var(--c-accent)] py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            Valider
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
