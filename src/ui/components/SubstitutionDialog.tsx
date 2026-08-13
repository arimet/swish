import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { Player } from '../../domain/types'

/** Dialogue de changement : choisit un joueur qui sort et un joueur qui entre. */
export function SubstitutionDialog({ open, onClose, onCourtPlayers, benchPlayers, onSubmit }: {
  open: boolean; onClose: () => void
  onCourtPlayers: Player[]; benchPlayers: Player[]
  onSubmit: (playerOutId: string, playerInId: string) => void
}) {
  const [out, setOut] = useState<string | null>(null)
  const [inId, setInId] = useState<string | null>(null)

  const close = () => { setOut(null); setInId(null); onClose() }
  const submit = () => {
    if (!out || !inId) return
    onSubmit(out, inId)
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Changement</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <PickGroup title="Sort du terrain" accent="text-red-600" players={onCourtPlayers}
            selected={out} onSelect={setOut} activeClass="border-transparent bg-red-600 text-white" />
          <PickGroup title="Entre sur le terrain" accent="text-emerald-700" players={benchPlayers}
            selected={inId} onSelect={setInId} activeClass="border-transparent bg-emerald-700 text-white" />
        </div>
        <DialogFooter>
          <button
            disabled={!out || !inId}
            onClick={submit}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition enabled:hover:brightness-110 disabled:opacity-40"
          >
            Valider le changement
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PickGroup({ title, accent, players, selected, onSelect, activeClass }: {
  title: string; accent: string; players: Player[]; selected: string | null
  onSelect: (id: string) => void; activeClass: string
}) {
  return (
    <div>
      <p className={`mb-1.5 text-xs font-bold uppercase tracking-wide ${accent}`}>{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition active:scale-95 ${
              selected === p.id ? activeClass : 'border-border/60 bg-background hover:bg-muted'
            }`}
          >
            {p.number} {p.lastName}
          </button>
        ))}
        {players.length === 0 && <p className="col-span-2 text-xs text-muted-foreground">Aucun joueur.</p>}
      </div>
    </div>
  )
}
