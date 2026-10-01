import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmt } from './GameClock'
import { useT } from '../../i18n'
import { BTN, PRIMARY, SECONDARY } from './buttons'

/** Manual clock entry (MM:SS format or raw seconds), bounded by `max`. */
export function parseClock(text: string): number | null {
  const t = text.trim()
  const mmss = t.match(/^(\d{1,3}):([0-5]?\d)$/)
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2])
  if (/^\d{1,4}$/.test(t)) return Number(t)
  return null
}

export function ClockEditDialog({ open, seconds, max, onClose, onSubmit }: {
  open: boolean; seconds: number; max: number; onClose: () => void; onSubmit: (seconds: number) => void
}) {
  const translate = useT()
  const [text, setText] = useState('')
  useEffect(() => { if (open) setText(fmt(seconds)) }, [open, seconds])

  const parsed = parseClock(text)
  const valid = parsed !== null && parsed >= 0 && parsed <= max
  const submit = () => { if (valid) { onSubmit(parsed!); onClose() } }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xs border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">{translate('clock.edit')}</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          inputMode="numeric"
          placeholder="MM:SS"
          className={`mt-2 w-full rounded-xl border bg-[var(--c-card2)] px-4 py-3 text-center text-4xl font-black tabular-nums outline-none transition ${
            valid ? 'border-[var(--c-border)] focus:border-[var(--c-accent)]' : 'border-[var(--c-danger)]'
          }`}
        />
        <p className="mt-1.5 text-center text-xs text-[var(--c-muted)]">{translate('clock.format', { max: fmt(max) })}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className={`${BTN} flex-1 ${SECONDARY}`}>
            {translate('common.cancel')}
          </button>
          <button
            disabled={!valid}
            onClick={submit}
            className={`${BTN} flex-1 ${PRIMARY}`}
          >
            {translate('clock.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
