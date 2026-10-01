import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { Player } from '../../domain/types'
import { useT } from '../../i18n'
import { BTN, PICKED, PRIMARY, SECONDARY } from './buttons'

/**
 * The substitution dialog: the players going off, the players coming on, one
 * validation. Several at once, because a coach changes three or five at a time between
 * two free throws, and one dialog per pair was that many round trips.
 *
 * Validate waits for as many coming on as going off: the five on the court stays five.
 * Who replaces whom is the order picked in — it has no effect on playing time, which
 * reads who is on the court.
 */
export function SubstitutionDialog({ open, onClose, onCourtPlayers, benchPlayers, onSubmit }: {
  open: boolean; onClose: () => void
  onCourtPlayers: Player[]; benchPlayers: Player[]
  /** One pair per substitution: [going off, coming on]. */
  onSubmit: (pairs: [string, string][]) => void
}) {
  const translate = useT()
  const [outs, setOuts] = useState<string[]>([])
  const [ins, setIns] = useState<string[]>([])
  const toggle = (set: typeof setOuts) => (id: string) => set((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const ready = outs.length > 0 && outs.length === ins.length
  const close = () => { setOuts([]); setIns([]); onClose() }
  const submit = () => {
    if (!ready) return
    onSubmit(outs.map((out, i) => [out, ins[i]]))
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="border-none bg-[var(--c-card)] p-5 text-[var(--c-text)] sm:max-w-md">
        <DialogHeader><DialogTitle className="text-lg font-extrabold">{translate('panel.substitution')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <PickGroup title={translate('sub.out')} accent="text-[var(--c-muted)]" players={onCourtPlayers}
            selected={outs} onSelect={toggle(setOuts)} activeClass={PICKED} />
          <PickGroup title={translate('sub.in')} accent="text-[var(--c-muted)]" players={benchPlayers}
            selected={ins} onSelect={toggle(setIns)} activeClass={PICKED} />
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {(outs.length > 0 || ins.length > 0) && !ready && (
            <p role="status" className="text-center text-[13px] font-semibold text-[var(--c-muted)]">{translate('sub.unbalanced', { out: outs.length, in: ins.length })}</p>
          )}
          <button
            disabled={!ready}
            onClick={submit}
            className={`${BTN} ${PRIMARY} w-full`}
          >
            {translate('sub.confirm')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PickGroup({ title, accent, players, selected, onSelect, activeClass }: {
  title: string; accent: string; players: Player[]; selected: string[]
  onSelect: (id: string) => void; activeClass: string
}) {
  const translate = useT()
  return (
    <div>
      <p className={`mb-1.5 text-xs font-bold uppercase tracking-wide ${accent}`}>{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {players.map((p) => (
          <button
            key={p.id}
            aria-pressed={selected.includes(p.id)}
            onClick={() => onSelect(p.id)}
            className={`${BTN} truncate ${selected.includes(p.id) ? activeClass : SECONDARY}`}
          >
            {p.number} {p.lastName}
          </button>
        ))}
        {players.length === 0 && <p className="col-span-2 text-xs text-muted-foreground">{translate('sub.none')}</p>}
      </div>
    </div>
  )
}
